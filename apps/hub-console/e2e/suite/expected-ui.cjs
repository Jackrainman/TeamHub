// E 原型验收：真实 SQLite、浏览器时钟、字号持久化与七个工作区。
const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const { mkdtempSync, mkdirSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const assert = require('node:assert/strict');

(async () => {
  const root = path.resolve(__dirname, '../../..');
  const dir = mkdtempSync(path.join(tmpdir(), 'teamhub-expected-e2e-'));
  const shots = process.env.E2E_SHOTS || path.join(dir, 'shots');
  mkdirSync(shots, { recursive: true });
  const dbFile = path.join(dir, 'expected.sqlite');
  const { openUnifiedDb } = await import(pathToFileURL(path.join(root, 'hub-server/dist/store/sqlite-unified.js')));
  const { getWeekKey, GOVERNANCE_SCENARIO_NOW } = await import(pathToFileURL(path.join(root, 'hub-contracts/dist/index.js')));
  const now = new Date(GOVERNANCE_SCENARIO_NOW);
  const db = openUnifiedDb(dbFile);
  db.initialize({ dataMode: 'demo', identityMode: 'identity' }, now);
  const stores = db.openStores();
  const snapshot = await stores.gov.getSnapshot();
  const member = snapshot.members[0];
  await stores.gov.setProjectManager(member.id, true);
  const task = await stores.gov.createTask({ projectId: snapshot.projectId, groupId: member.groupId, title: '预期版真实任务', rawSummary: '检查机构与控制链路，记录结构性问题。', ownerId: null, collaboratorIds: [], intrinsicComplexity: 'normal' });
  await stores.gov.claimTask(task.id, member.id, now.toISOString(), { id: member.id, displayName: member.displayName, source: 'console' }, getWeekKey(now));
  stores.reimburse.createEntry({ projectId: snapshot.projectId, memberId: member.id, batchId: null, kind: 'goods', invoiceNo: null, invoiceDate: null, seller: '测试供应商', purchaserName: null, purchaserTaxNo: null, recognitionSource: 'manual', totalAmountFen: 12800, items: [], actualItemName: '控制板采购', materials: { paymentShot: true, inspection: false }, note: null });
  db.close();
  const port = await new Promise(resolve => { const s = require('node:net').createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });
  const base = `http://127.0.0.1:${port}`;
  let child, browser, page;
  const errors = [];
  try {
    child = spawn(process.execPath, [path.join(root, 'hub-server/dist/main.js')], { windowsHide: true, env: { ...process.env, HUB_HOST: '127.0.0.1', HUB_PORT: String(port), TEAMHUB_DB_FILE: dbFile, TEAMHUB_CONSOLE_DIST_DIR: path.resolve(__dirname, '../../dist') }, stdio: ['ignore', 'ignore', 'pipe'] });
    child.stderr.on('data', data => process.stderr.write(data));
    for (let i = 0; ; i++) {
      if (child.exitCode !== null || i > 100) throw new Error('test server failed to start');
      try { if ((await fetch(`${base}/health`)).ok) break; } catch {}
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    browser = await chromium.launch({ channel: process.env.E2E_BROWSER_CHANNEL || undefined });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    assert.equal((await context.request.post(`${base}/api/session`, { data: { username: member.displayName } })).status(), 200);
    assert.equal((await context.request.put(`${base}/api/members/${member.id}/pin`, { data: { pin: 'test12345' } })).status(), 200);
    page = await context.newPage();
    page.setDefaultTimeout(10000);
    page.on('pageerror', error => errors.push(String(error)));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(base, { waitUntil: 'networkidle' });
    const shell = page.locator('.console-shell');
    const expanded = () => shell.evaluate(el => el.classList.contains('sidebar-expanded'));
    const nav = name => page.locator('.console-sidebar').getByRole('button', { name, exact: true });
    const capture = async name => {
      await page.waitForTimeout(400); // 等待抽屉/侧栏 320ms 以内的过渡结束后复核最终布局。
      await page.screenshot({ path: path.join(shots, `expected-${name}.png`), fullPage: false });
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2)) console.error(await page.evaluate(() => [...document.querySelectorAll('main *')].filter(el => el.getBoundingClientRect().right > innerWidth + 2).slice(0, 15).map(el => ({ tag: el.tagName, class: el.className, width: el.getBoundingClientRect().width }))));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false, `overflow: ${name}`);
      assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('.drawer input, .drawer textarea')].filter(el => {
        const r = el.getBoundingClientRect(), panel = el.closest('.drawer').getBoundingClientRect();
        return r.width > 0 && (r.right > panel.right + 1 || r.left < panel.left - 1);
      }).map(el => el.getAttribute('placeholder') || el.tagName)), [], `clipped drawer fields: ${name}`);
    };
    // reload 确保真正重置 Provider；同 URL 的 goto 可能只变 hash。
    await page.reload({ waitUntil: 'domcontentloaded' });
    await shell.waitFor();
    const start = Date.now();
    const at = async ms => page.waitForTimeout(Math.max(0, start + ms - Date.now()));
    await at(1500); await nav('项目').hover();
    await at(4500); assert.equal(await expanded(), true, 'first hover resets 4s idle');
    await nav('本周').hover();
    await at(7000); assert.equal(await expanded(), true, 'second hover resets 4s idle');
    await at(9000); assert.equal(await expanded(), false, 'idle collapses after last activity');
    await capture('sidebar-collapsed');
    await page.locator('.sidebar-toggle').click();
    await page.waitForTimeout(4400);
    assert.equal(await expanded(), true, 'manual expansion stays fixed');
    await capture('week');
    const samples = await page.evaluate(async () => {
      const toggle = document.querySelector('.sidebar-toggle');
      const sidebar = document.querySelector('.console-sidebar');
      const result = [];
      toggle.click();
      const start = performance.now();
      while (performance.now() - start < 450) {
        result.push({ ms: performance.now() - start, width: sidebar.getBoundingClientRect().width });
        await new Promise(requestAnimationFrame);
      }
      return result;
    });
    assert.ok(samples.some(s => s.width > 80 && s.width < 225), 'continuous intermediate sidebar widths');
    assert.ok(samples.every((s, i) => !i || s.width <= samples[i - 1].width + 1), 'monotone collapse');
    assert.ok(Math.abs(samples.at(-1).width - 72) < 1);
    writeFileSync(path.join(shots, 'sidebar-widths.json'), JSON.stringify(samples, null, 2));
    await page.locator('.sidebar-toggle').click();
    await nav('设置').click();
    const size = () => page.locator('.appearance-preferences h2').first().evaluate(el => parseFloat(getComputedStyle(el).fontSize));
    const standard = await size();
    for (const [label, scale] of [['大', 1.12], ['特大', 1.24]]) {
      await page.getByRole('button', { name: label, exact: true }).click();
      assert.ok(Math.abs(await size() / standard - scale) < .01);
    }
    await page.getByRole('switch', { name: '侧栏自动收起' }).click();
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal(await page.evaluate(() => document.documentElement.dataset.fontSize), 'xlarge');
    await page.waitForTimeout(4300); assert.equal(await expanded(), true, 'disabled idle persists');
    await nav('设置').click(); await capture('settings-xlarge');
    await page.getByRole('button', { name: '标准', exact: true }).click();
    await capture('settings');

    for (const [label, key] of [['项目', 'project'], ['队伍近况', 'feed'], ['知识库', 'knowledge'], ['库存与 BOM', 'inv'], ['报销', 'reimburse']]) {
      await nav(label).click(); await page.waitForLoadState('networkidle');
      assert.equal(await page.locator('.console-main').evaluate(el => getComputedStyle(el).animationName), 'none');
      await capture(key);
    }
    let evidenceRequests = 0;
    page.on('request', request => { if (/\/evidence(?:\?|$)/.test(request.url())) evidenceRequests++; });
    await nav('本周').click(); await nav('报销').click(); await page.waitForLoadState('networkidle');
    assert.equal(evidenceRequests, 0, 'list never fetches evidence');
    await page.getByRole('checkbox', { name: '选择全部' }).check();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: '导出选中 (1)' }).click();
    assert.ok((await download).suggestedFilename().endsWith('.csv'));
    await page.getByRole('button', { name: '查看 / 编辑', exact: true }).click();
    await capture('reimburse-detail');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: '新建条目', exact: true }).click();
    await page.getByLabel('实际物资名称', { exact: true }).fill('浏览器采购记录');
    await page.getByLabel('价税合计（元）', { exact: false }).fill('42');
    await capture('reimburse-create');
    await page.setViewportSize({ width: 390, height: 1000 });
    await capture('reimburse-create-390');
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole('button', { name: '记下这笔', exact: true }).click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    await page.locator('.domain-table').getByText('浏览器采购记录', { exact: true }).waitFor();
    await page.getByRole('button', { name: '导入票据', exact: true }).click();
    await page.locator('input[type="file"]').setInputFiles({ name: 'receipt.xml', mimeType: 'application/xml', buffer: Buffer.from('<Invoice><EIid>24312000000012345678</EIid><IssueTime>2026-07-01</IssueTime><SellerName>测试公司</SellerName><TotalTax-includedAmount>113.00</TotalTax-includedAmount></Invoice>') });
    await page.getByLabel('发票号码', { exact: true }).waitFor();
    assert.equal(await page.getByLabel('发票号码', { exact: true }).inputValue(), '24312000000012345678');
    await page.getByLabel('实际物资名称', { exact: true }).fill('保留的确认草稿');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: '继续确认票据', exact: true }).click();
    assert.equal(await page.getByLabel('发票号码', { exact: true }).inputValue(), '24312000000012345678', 'closing keeps imported receipt queued');
    assert.equal(await page.getByLabel('实际物资名称', { exact: true }).inputValue(), '保留的确认草稿', 'pause preserves manual corrections');
    // 搜索叠在领域抽屉上时，Esc 只关闭最上层；Tab 保持在模态内。
    await page.keyboard.press('Control+k');
    await page.getByRole('dialog', { name: '全局搜索' }).getByRole('button', { name: '关闭' }).focus();
    await page.keyboard.press('Shift+Tab');
    assert.equal(await page.evaluate(() => [...document.querySelectorAll('.drawer')].at(-1).contains(document.activeElement)), true);
    await page.keyboard.press('Escape');
    assert.equal(await page.getByRole('dialog').count(), 1);
    await page.keyboard.press('Escape');

    await nav('库存与 BOM').click();
    await page.getByRole('button', { name: '登记物料', exact: true }).click();
    await page.getByLabel('零件编号', { exact: false }).fill('E2E-PART');
    await page.getByLabel('名称', { exact: false }).fill('浏览器测试物料');
    await page.getByLabel('初始总数', { exact: false }).fill('3');
    await capture('inventory-create');
    await page.getByRole('button', { name: '新建零件', exact: true }).click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    await page.getByRole('searchbox', { name: '搜索物料、编号或规格' }).fill('E2E-PART');
    await page.locator('.inv-table').getByRole('button').last().click();
    await page.getByLabel('本次数量', { exact: false }).fill('2');
    await page.getByRole('button', { name: '记一笔', exact: true }).click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    assert.equal((await page.locator('.inv-idle-total').innerText()).trim(), '/ 5');
    await capture('inventory-updated');

    await nav('知识库').click();
    await page.getByLabel('症状 / 现象').fill('CAN');
    await page.getByRole('button', { name: '检索相似历史' }).click();
    await page.locator('.kb-result-preview').first().waitFor();
    await capture('knowledge-results');
    await page.locator('.kb-result-open').first().click(); await capture('knowledge-detail');
    await page.keyboard.press('Escape');
    for (const suffix of ['一', '二']) {
      await page.getByRole('button', { name: '新建归档', exact: true }).click();
      const drawer = page.getByRole('dialog');
      await drawer.getByLabel('问题标题', { exact: false }).fill(`浏览器归档${suffix}`);
      await drawer.getByLabel('症状 / 现象', { exact: false }).fill('CAN 通信测试记录');
      await drawer.getByLabel('根因（必填）', { exact: false }).fill('连接器松动');
      await drawer.getByLabel('处理方式（必填）', { exact: false }).fill('检查并固定连接器');
      if (suffix === '一') await capture('knowledge-create');
      await drawer.getByRole('button', { name: '结案归档', exact: true }).click();
      await drawer.getByText('已归档结案', { exact: true }).waitFor();
      await page.keyboard.press('Escape');
    }
    await page.getByLabel('症状 / 现象').fill('CAN 通信测试记录');
    await page.getByRole('button', { name: '检索相似历史' }).click();
    await page.locator('.kb-result-preview').getByText('浏览器归档一', { exact: true }).waitFor();
    await page.locator('.kb-result-preview').getByText('浏览器归档二', { exact: true }).waitFor();
    await page.keyboard.press('Control+k');
    await page.getByRole('searchbox', { name: '全局搜索' }).fill('预期版');
    await page.getByRole('button', { name: '搜索', exact: true }).click();
    await page.locator('.search-result').getByText('预期版真实任务').waitFor();
    await capture('search'); await page.keyboard.press('Escape');
    await page.keyboard.press('Meta+k'); await page.getByRole('dialog', { name: '全局搜索' }).waitFor();
    await page.keyboard.press('Escape');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    assert.equal(await shell.evaluate(el => getComputedStyle(el).transitionDuration), '0s');
    for (const width of [1000, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      if (await expanded()) await page.locator('.sidebar-toggle').click();
      for (const [label, key] of [['本周', 'week'], ['项目', 'project'], ['队伍近况', 'feed'], ['知识库', 'knowledge'], ['库存与 BOM', 'inv'], ['报销', 'reimburse'], ['设置', 'settings']]) {
        await nav(label).click(); await page.waitForLoadState('networkidle'); await capture(`${key}-${width}`);
      }
    }
    const loginContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const loginPage = await loginContext.newPage();
    await loginPage.goto(base, { waitUntil: 'networkidle' });
    await loginPage.locator('.auth-gate__username').waitFor();
    await loginPage.waitForTimeout(4400);
    await loginPage.locator('.auth-gate__username').fill(member.displayName);
    await loginPage.locator('.auth-gate__pin').fill('test12345');
    await loginPage.locator('.auth-gate button[type="submit"]').click();
    await loginPage.locator('.console-shell').waitFor();
    assert.equal(await loginPage.locator('.console-shell').evaluate(el => el.classList.contains('sidebar-expanded')), true, 'login gate does not consume sidebar idle time');
    await loginContext.close();
    assert.deepEqual(errors, []);
    console.log(`PASS E expected UI: idle timeline, continuous transition, preferences, real drawers, private evidence, search, seven workspaces; screenshots ${shots}`);
  } catch (error) {
    if (page) { await page.screenshot({ path: path.join(shots, 'expected-failure.png'), fullPage: true }); console.error(await page.locator('body').innerText()); }
    throw error;
  } finally {
    await browser?.close();
    if (child && child.exitCode === null) { const exited = new Promise(resolve => child.once('exit', resolve)); child.kill(); await exited; }
    rmSync(dir, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
