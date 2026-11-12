// Fixed tutorial uses only local state; isolated servers prove it never writes task data.
const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const { mkdtempSync, mkdirSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const assert = require('node:assert/strict');
const { freePort } = require('./lib/free-port.cjs');

(async () => {
  const root = path.resolve(__dirname, '../../..');
  const server = path.join(root, 'hub-server/dist/main.js');
  const consoleDist = path.resolve(__dirname, '../../dist');
  const dir = mkdtempSync(path.join(tmpdir(), 'teamhub-task-tutorial-e2e-'));
  const shots = process.env.E2E_SHOTS || path.join(dir, 'shots');
  mkdirSync(shots, { recursive: true });
  let browser;
  let activeChild;
  const errors = [];

  async function prepareDatabase(dataMode) {
    const dbFile = path.join(dir, `${dataMode}.sqlite`);
    const { openUnifiedDb } = await import(pathToFileURL(path.join(root, 'hub-server/dist/store/sqlite-unified.js')));
    const db = openUnifiedDb(dbFile);
    db.initialize({ dataMode, identityMode: 'anonymous' }, new Date('2026-11-02T01:00:00.000Z'));
    if (dataMode === 'real') {
      const repo = db.openStores().gov;
      await repo.createSeason({ name: 'Tutorial test season', startsAt: '2026-11-02T01:00:00.000Z', endsAt: null });
      await repo.importRoster([{ displayName: 'Real member', grade: 'freshman', groupName: 'Real group', gateReviewer: false, gateReviewerAuto: false }]);
    }
    db.close();
    return dbFile;
  }

  async function startServer(dbFile) {
    const port = await freePort();
    const base = `http://127.0.0.1:${port}`;
    const child = spawn(process.execPath, [server], {
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'pipe'],
      env: { ...process.env, HUB_HOST: '127.0.0.1', HUB_PORT: String(port), TEAMHUB_DB_FILE: dbFile, TEAMHUB_CONSOLE_DIST_DIR: consoleDist },
    });
    child.stderr.on('data', data => process.stderr.write(data));
    for (let i = 0; i < 100; i++) {
      if (child.exitCode !== null) throw new Error(`server exit ${child.exitCode}`);
      try { if ((await fetch(`${base}/health`)).ok) return { child, base }; } catch {}
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error('tutorial test server did not start');
  }

  async function stopServer(child) {
    if (!child || child.exitCode !== null) return;
    const exited = new Promise(resolve => child.once('exit', resolve));
    child.kill();
    await exited;
  }

  async function capture(page, name) {
    await page.screenshot({ path: path.join(shots, `${name}.png`), fullPage: false, animations: 'disabled' });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2), false, `overflow: ${name}`);
  }

  async function advanceToReview(dialog) {
    await dialog.getByRole('button', { name: '开始演示', exact: true }).click();
    await dialog.getByRole('button', { name: '新建任务', exact: true }).click();
    await dialog.getByLabel('周同学 · 电控组', { exact: true }).check();
    await dialog.getByRole('button', { name: '提交', exact: true }).click();
    await dialog.getByRole('button', { name: '标记完成', exact: true }).click();
    await dialog.getByRole('button', { name: '验收人', exact: true }).click();
    await dialog.getByRole('button', { name: '完成 R1 联调检查', exact: true }).click();
    await dialog.getByText('负责人已标记完成，但尚未验收通过，目前仍是待验收。', { exact: true }).waitFor();
  }

  try {
    browser = await chromium.launch({ channel: process.env.E2E_BROWSER_CHANNEL || undefined });
    const demoDb = await prepareDatabase('demo');
    const demoServer = await startServer(demoDb);
    activeChild = demoServer.child;
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    page.on('pageerror', error => errors.push(String(error)));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    const writes = [];
    page.on('request', request => {
      if (request.url().includes('/api/') && request.method() !== 'GET') writes.push(`${request.method()} ${request.url()}`);
    });
    await page.goto(demoServer.base, { waitUntil: 'networkidle' });
    const before = await (await context.request.get(`${demoServer.base}/api/tasks`)).json();
    const entry = page.getByRole('button', { name: '任务教程', exact: true });
    await entry.click();
    const dialog = page.getByRole('dialog', { name: '任务流程演示', exact: true });
    await dialog.waitFor();
    assert.equal(await page.locator('#root').evaluate(element => element.inert), true);
    assert.equal(await page.locator('[data-tutorial-mask]').count(), 1);
    await page.keyboard.press('Control+k');
    assert.equal(await page.getByRole('dialog').count(), 1, 'global search stays closed');

    await dialog.getByRole('button', { name: '开始演示', exact: true }).click();
    assert.equal(await page.locator('[data-tutorial-mask]').count(), 4);
    await dialog.getByRole('button', { name: '新建任务', exact: true }).waitFor();
    await page.locator('[data-tutorial-mask]').first().click();
    await dialog.getByText('新建任务', { exact: true }).last().waitFor();
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => {
        const active = document.activeElement;
        return !!active?.closest('[data-tutorial-target="create"], [data-tutorial-control]');
      }), true, 'Tab cannot enter the dimmed area');
    }
    await capture(page, 'desktop-dark-create');

    await dialog.getByRole('button', { name: '新建任务', exact: true }).click();
    assert.equal(await dialog.getByRole('button', { name: '提交', exact: true }).isDisabled(), true);
    await dialog.getByLabel('周同学 · 电控组', { exact: true }).check();
    await dialog.getByRole('button', { name: '提交', exact: true }).click();
    await dialog.getByText('进行中', { exact: true }).first().waitFor();
    await dialog.getByRole('button', { name: '标记完成', exact: true }).click();
    await dialog.getByText('待验收', { exact: true }).first().waitFor();
    await dialog.getByRole('button', { name: '验收人', exact: true }).click();
    await dialog.getByRole('button', { name: '完成 R1 联调检查', exact: true }).click();
    await dialog.getByRole('button', { name: '验收通过', exact: true }).click();
    await dialog.getByText('验收通过，任务和验收事实已留存，可在历史中查询。', { exact: true }).waitFor();
    await dialog.getByText('已验收', { exact: true }).first().waitFor();
    await dialog.locator('.tl-list').getByText('创建任务', { exact: false }).waitFor();
    await dialog.locator('.tl-list').getByText('验收通过', { exact: false }).waitFor();
    await capture(page, 'desktop-dark-accepted');

    await dialog.getByRole('button', { name: '重新演示', exact: true }).click();
    await advanceToReview(dialog);
    await dialog.getByRole('button', { name: '演示打回分支', exact: true }).click();
    const reject = dialog.locator('.task-tutorial__reject');
    assert.equal(await reject.getByRole('button', { name: '确认打回', exact: true }).isDisabled(), true);
    await reject.locator('textarea').fill('请补充联调记录');
    await reject.getByRole('button', { name: '确认打回', exact: true }).click();
    await dialog.getByRole('button', { name: '负责人', exact: true }).click();
    await dialog.getByRole('button', { name: '标记完成', exact: true }).click();
    await dialog.getByRole('button', { name: '验收人', exact: true }).click();
    await dialog.getByRole('button', { name: '完成 R1 联调检查', exact: true }).click();
    await dialog.locator('.tl-list').getByText('退回修改', { exact: false }).waitFor();
    await dialog.getByRole('button', { name: '验收通过', exact: true }).click();
    await dialog.getByText('验收闭环完成', { exact: true }).waitFor();

    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
    await page.waitForFunction(() => document.activeElement?.matches('button[aria-haspopup="dialog"]') && document.activeElement.textContent?.includes('任务教程'));
    assert.equal(await entry.evaluate(element => document.activeElement === element), true, 'focus returns to entry');
    assert.equal(await page.locator('#root').evaluate(element => element.inert), false);
    const after = await (await context.request.get(`${demoServer.base}/api/tasks`)).json();
    assert.deepEqual(after, before, 'tutorial leaves server tasks unchanged');
    assert.deepEqual(writes, [], 'tutorial sends no write API requests');

    await entry.click();
    await dialog.getByRole('button', { name: '开始演示', exact: true }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => { document.documentElement.dataset.theme = 'classic'; });
    await page.waitForTimeout(100);
    await capture(page, 'mobile-light-create');
    const bubble = await page.locator('[data-tutorial-coachmark]').boundingBox();
    const target = await page.locator('[data-tutorial-target="create"]').boundingBox();
    assert.ok(bubble && target && bubble.x >= 0 && bubble.x + bubble.width <= 390 && bubble.y >= 0 && bubble.y + bubble.height <= 844);
    assert.ok(bubble.y + bubble.height <= target.y || target.y + target.height <= bubble.y || bubble.x + bubble.width <= target.x || target.x + target.width <= bubble.x, 'bubble does not cover target');
    await page.keyboard.press('Escape');
    await page.evaluate(() => { window.localStorage.setItem('teamhub.lang', 'en'); });
    await page.reload({ waitUntil: 'networkidle' });
    // 窄屏 reload 后残留鼠标位置可能悬停侧栏使其展开拦截点击；先移到内容区。
    await page.mouse.move(300, 600);
    await page.getByRole('button', { name: 'Task tutorial', exact: true }).click();
    await page.getByRole('dialog', { name: 'Task workflow demo', exact: true }).getByRole('button', { name: 'Start demo', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Exit tutorial', exact: true }).click();
    await context.close();
    await stopServer(demoServer.child);
    activeChild = null;

    const realDb = await prepareDatabase('real');
    const realServer = await startServer(realDb);
    activeChild = realServer.child;
    const realContext = await browser.newContext({ viewport: { width: 1000, height: 800 } });
    const realPage = await realContext.newPage();
    realPage.on('pageerror', error => errors.push(String(error)));
    await realPage.goto(realServer.base, { waitUntil: 'networkidle' });
    await realPage.getByRole('button', { name: '任务教程', exact: true }).click();
    const realDialog = realPage.getByRole('dialog', { name: '任务流程演示', exact: true });
    await realDialog.waitFor();
    await realDialog.getByRole('button', { name: '开始演示', exact: true }).click();
    await realDialog.getByRole('button', { name: '新建任务', exact: true }).click();
    await realDialog.getByLabel('周同学 · 电控组', { exact: true }).check();
    await realDialog.getByRole('button', { name: '提交', exact: true }).click();
    await realDialog.getByText('进行中', { exact: true }).first().waitFor();
    await realContext.close();
    await stopServer(realServer.child);
    activeChild = null;
    assert.deepEqual(errors, []);
    console.log('task tutorial e2e passed: full loop, rejection, isolation, keyboard, mobile, themes, English and real mode');
  } finally {
    if (browser) await browser.close();
    await stopServer(activeChild);
    rmSync(dir, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
