// E 原型验收：真实 SQLite、浏览器时钟、字号持久化与四个成品页。
const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const { mkdtempSync, mkdirSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const assert = require('node:assert/strict');
const { freePort } = require('./lib/free-port.cjs');

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
  stores.reimburse.createEntry({ projectId: snapshot.projectId, seasonId: snapshot.seasonId, memberId: member.id, batchId: null, kind: 'goods', expenseType: 'purchase', summary: '控制板采购', invoiceNo: null, invoiceDate: null, seller: '测试供应商', purchaserName: null, purchaserTaxNo: null, recognitionSource: 'manual', totalAmountFen: 12800, items: [], actualItemName: '控制板采购', materials: { invoice: true, paymentShot: true, inspection: false }, note: null });
  db.close();
  const port = await freePort();
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
    // 残留鼠标位置可能悬停侧栏，使首次 hover 不触发 mouseenter；先移到内容区保证起点确定。
    await page.mouse.move(900, 500);
    // 以真实 hover 完成为计时起点（绝对时间戳会因 hover 耗时漂移而误判）；2.5s<4s 仍展开，随后等待空闲收起。
    await nav('项目').hover();
    await page.waitForFunction(() => document.querySelector('.console-shell').classList.contains('sidebar-expanded'));
    await page.waitForTimeout(2500);
    assert.equal(await expanded(), true, 'first hover resets 4s idle');
    await nav('任务').hover();
    await page.waitForTimeout(2500);
    assert.equal(await expanded(), true, 'second hover resets 4s idle');
    await page.waitForFunction(() => !document.querySelector('.console-shell').classList.contains('sidebar-expanded'), null, { timeout: 6000 });
    assert.equal(await expanded(), false, 'idle collapses after last activity');
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

    // 成品四页：侧栏只有 任务/项目/报销/设置，旧导航项（含「更多」二级入口）一律不存在。
    for (const label of ['队伍近况', '知识库', '库存与 BOM', '总览', '每日在场', '图纸档案', '机器人清单', '学习方向', '时间线', '更多']) {
      assert.equal(await nav(label).count(), 0, `${label} 不在四页导航里`);
    }
    for (const [label, key] of [['项目', 'project'], ['报销', 'reimburse']]) {
      await nav(label).click(); await page.waitForLoadState('networkidle');
      assert.equal(await page.locator('.console-main').evaluate(el => getComputedStyle(el).animationName), 'none');
      await capture(key);
    }
    let evidenceRequests = 0;
    page.on('request', request => { if (/\/evidence(?:\?|$)/.test(request.url())) evidenceRequests++; });
    await nav('任务').click(); await nav('报销').click(); await page.waitForLoadState('networkidle');
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
    await page.getByRole('dialog').getByRole('button', { name: '提交', exact: true }).click();
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
      for (const [label, key] of [['任务', 'workbench'], ['项目', 'project'], ['报销', 'reimburse'], ['设置', 'settings']]) {
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
    console.log(`PASS E expected UI: idle timeline, continuous transition, preferences, real drawers, private evidence, search, four shipped pages; screenshots ${shots}`);
  } catch (error) {
    if (page) { await page.screenshot({ path: path.join(shots, 'expected-failure.png'), fullPage: true }); console.error(await page.locator('body').innerText()); }
    throw error;
  } finally {
    await browser?.close();
    if (child && child.exitCode === null) { const exited = new Promise(resolve => child.once('exit', resolve)); child.kill(); await exited; }
    rmSync(dir, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
