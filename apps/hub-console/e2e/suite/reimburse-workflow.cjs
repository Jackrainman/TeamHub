// 新赛季报账闭环：合成数据 + 临时 SQLite + Chromium + 服务重启存活。
const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const assert = require('node:assert/strict');
const { zipSync, strToU8 } = require('fflate');
const { freePort } = require('./lib/free-port.cjs');

function xlsxBuffer() {
  return Buffer.from(zipSync({
    'xl/workbook.xml': strToU8('<workbook xmlns:r="r"><sheet name="报账明细" r:id="rId1"/></workbook>'),
    'xl/_rels/workbook.xml.rels': strToU8('<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>'),
    'xl/sharedStrings.xml': strToU8('<sst><si><t>费用摘要</t></si><si><t>支出类型</t></si><si><t>实付金额</t></si><si><t>Excel候选</t></si><si><t>车票</t></si><si><t>12.50</t></si></sst>'),
    'xl/worksheets/sheet1.xml': strToU8('<worksheet><sheetData><row><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row><row><c r="A2" t="s"><v>3</v></c><c r="B2" t="s"><v>4</v></c><c r="C2" t="s"><v>5</v></c></row></sheetData></worksheet>'),
  }));
}

(async () => {
  const root = path.resolve(__dirname, '../../..');
  const dir = mkdtempSync(path.join(tmpdir(), 'teamhub-reimburse-workflow-'));
  const dbFile = path.join(dir, 'workflow.sqlite');
  const { openUnifiedDb } = await import(pathToFileURL(path.join(root, 'hub-server/dist/store/sqlite-unified.js')));
  const { GOVERNANCE_SCENARIO_NOW } = await import(pathToFileURL(path.join(root, 'hub-contracts/dist/index.js')));
  const db = openUnifiedDb(dbFile);
  db.initialize({ dataMode: 'demo', identityMode: 'identity' }, new Date(GOVERNANCE_SCENARIO_NOW));
  const snapshot = await db.openStores().gov.getSnapshot();
  const owner = snapshot.members[0];
  const finance = snapshot.members[1];
  await db.openStores().gov.setProjectManager(finance.id, true);
  const season = snapshot.seasons.find(item => item.status === 'active');
  db.close();
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  let child;
  let browser;
  const contexts = [];
  function start() {
    child = spawn(process.execPath, [path.join(root, 'hub-server/dist/main.js')], { windowsHide: true, env: { ...process.env, HUB_HOST: '127.0.0.1', HUB_PORT: String(port), TEAMHUB_DB_FILE: dbFile, TEAMHUB_CONSOLE_DIST_DIR: path.resolve(__dirname, '../../dist') }, stdio: ['ignore', 'ignore', 'pipe'] });
    child.stderr.on('data', data => process.stderr.write(data));
    return (async () => {
      for (let i = 0; ; i++) {
        if (child.exitCode !== null || i > 100) throw new Error('报账测试服务启动失败');
        try { if ((await fetch(`${base}/health`)).ok) return; } catch {}
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    })();
  }
  async function stop() {
    if (!child || child.exitCode !== null) return;
    await new Promise(resolve => { child.once('exit', resolve); child.kill('SIGTERM'); });
  }
  async function login(member) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    contexts.push(context);
    assert.equal((await context.request.post(`${base}/api/session`, { data: { username: member.displayName } })).status(), 200);
    assert.equal((await context.request.put(`${base}/api/members/${member.id}/pin`, { data: { pin: 'test12345' } })).status(), 200);
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.locator('.console-sidebar').getByRole('button', { name: '报销', exact: true }).click();
    await page.locator('.reimb-page').waitFor();
    return page;
  }
  async function create(page, suffix, type) {
    await page.getByRole('button', { name: '新建条目', exact: true }).click();
    const dialog = page.getByRole('dialog');
    const typeButton = dialog.locator('.seg__btn').filter({ hasText: type }).first();
    if (!await typeButton.count()) console.error('创建抽屉内容:', await dialog.innerText());
    await typeButton.click();
    await dialog.getByLabel('费用摘要', { exact: true }).fill(`合成${suffix}`);
    await dialog.getByLabel('发票号码', { exact: true }).fill(`E2E-${suffix}`);
    await dialog.getByLabel('开票日期', { exact: true }).fill('2026-11-01');
    await dialog.getByLabel('销售方', { exact: true }).fill('合成商户');
    await dialog.getByLabel('购买方名称', { exact: true }).fill('哈尔滨工业大学');
    await dialog.getByLabel('购买方统一社会信用代码', { exact: true }).fill('12100000400000456B');
    await dialog.getByLabel('价税合计（元）', { exact: true }).fill('10.00');
    if (type === '采购') {
      await dialog.getByPlaceholder('名称', { exact: true }).fill('合成件');
      await dialog.getByPlaceholder('单位', { exact: true }).fill('包');
      await dialog.getByPlaceholder('数量', { exact: true }).fill('1');
      await dialog.getByPlaceholder('金额', { exact: true }).fill('10.00');
    }
    await dialog.getByRole('button', { name: '提交', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    await page.waitForLoadState('networkidle');
    if (!await page.locator('.domain-table').getByText(`合成${suffix}`, { exact: true }).count()) {
      console.error('创建后页面:', await page.locator('.reimb-page').innerText());
      const api = await page.context().request.get(`${base}/api/reimburse/entries`);
      console.error('服务端条目:', api.status(), await api.text());
    }
    await page.locator('.domain-table').getByText(`合成${suffix}`, { exact: true }).waitFor();
  }
  async function submitOwned(page, title) {
    const row = page.locator('.domain-table tbody tr').filter({ hasText: title });
    await row.getByRole('button', { name: '查看 / 编辑', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: '提交财务', exact: true }).click();
    await dialog.getByText('已提交', { exact: true }).first().waitFor();
    await page.keyboard.press('Escape');
  }
  async function approve(page, title) {
    const row = page.locator('.domain-table tbody tr').filter({ hasText: title });
    await row.getByRole('button', { name: '查看 / 编辑', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: '接收核对', exact: true }).click();
    await dialog.getByRole('button', { name: '记录已核对当前材料', exact: true }).click();
    await dialog.getByLabel('处理意见 / 原因', { exact: true }).fill('合成缺件核准意见');
    await dialog.getByRole('button', { name: '核准', exact: true }).click();
    await dialog.getByText('待打款', { exact: true }).first().waitFor();
    await page.keyboard.press('Escape');
  }
  try {
    await start();
    browser = await chromium.launch({ channel: process.env.E2E_BROWSER_CHANNEL || undefined });
    const ownerPage = await login(owner);
    assert.ok(await ownerPage.locator('.reimb-page').getByText(season.name, { exact: true }).count());
    await create(ownerPage, '采购-A', '采购');
    await submitOwned(ownerPage, '合成采购-A');
    await create(ownerPage, '其他-B', '其他');
    await submitOwned(ownerPage, '合成其他-B');

    const financePage = await login(finance);
    await financePage.getByRole('button', { name: '财务工作台', exact: true }).click();
    await approve(financePage, '合成采购-A');
    await approve(financePage, '合成其他-B');
    await financePage.getByRole('checkbox', { name: '选择全部', exact: true }).check();
    await financePage.getByRole('button', { name: '登记打款结果', exact: true }).click();
    const payout = financePage.getByRole('dialog');
    await payout.getByRole('button', { name: '登记打款结果', exact: true }).click();
    await payout.waitFor({ state: 'hidden' });
    assert.equal(await financePage.locator('.domain-table tbody tr').filter({ hasText: '完成' }).count(), 2);
    await financePage.getByRole('checkbox', { name: '选择全部', exact: true }).check();
    let waiting = financePage.waitForEvent('download');
    await financePage.getByRole('button', { name: '导出 XLSX', exact: true }).click();
    assert.ok((await waiting).suggestedFilename().endsWith('.xlsx'));
    waiting = financePage.waitForEvent('download');
    await financePage.getByRole('button', { name: '导出 XLSX + 原件包', exact: true }).click();
    assert.ok((await waiting).suggestedFilename().endsWith('.zip'));

    await stop();
    await start();
    await ownerPage.reload({ waitUntil: 'networkidle' });
    await ownerPage.locator('.console-sidebar').getByRole('button', { name: '报销', exact: true }).click();
    await ownerPage.locator('.domain-table').waitFor();
    assert.equal(await ownerPage.locator('.domain-table tbody tr').filter({ hasText: '完成' }).count(), 2, '重启后完成状态与 payout 可读');
    await ownerPage.getByRole('button', { name: '导入票据', exact: true }).click();
    await ownerPage.getByRole('dialog').locator('input[type="file"]').setInputFiles([
      { name: '合成候选.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: xlsxBuffer() },
      { name: '合成付款.png', mimeType: 'image/png', buffer: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]) },
    ]);
    const imported = ownerPage.getByRole('dialog');
    await imported.getByLabel('费用摘要', { exact: true }).waitFor();
    assert.equal(await imported.getByLabel('费用摘要', { exact: true }).inputValue(), 'Excel候选');
    assert.equal(await imported.locator('.seg__btn--active').filter({ hasText: '车票' }).count(), 1);
    assert.equal(await ownerPage.locator('.reimb-unmatched li').count(), 2, 'Excel 与散图都进入人工候选/未匹配池');
    await ownerPage.keyboard.press('Escape');
    const afterImport = await ownerPage.context().request.get(`${base}/api/reimburse/entries`);
    assert.equal((await afterImport.json()).entries.length, 2, '导入确认前不写服务器');
    console.log('[e2e:reimburse-workflow] 通过：混合导入/未匹配池/提交/核对/核准/合并打款/XLSX+ZIP/重启存活');
  } finally {
    for (const context of contexts) await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
    await stop().catch(() => {});
    rmSync(dir, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
