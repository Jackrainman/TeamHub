// Runs in CI with isolated SQLite and browser sessions; never uses local application accounts.
const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const { mkdtempSync, mkdirSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const assert = require('node:assert/strict');

(async () => {
  const root = path.resolve(__dirname, '../../..');
  const server = path.join(root, 'hub-server/dist/main.js');
  const consoleDist = path.resolve(__dirname, '../../dist');
  const dir = mkdtempSync(path.join(tmpdir(), 'teamhub-week-e2e-'));
  const shots = process.env.E2E_SHOTS || path.join(dir, 'shots');
  mkdirSync(shots, { recursive: true });
  const dbFile = path.join(dir, 'week.sqlite');
  const { openUnifiedDb } = await import(pathToFileURL(path.join(root, 'hub-server/dist/store/sqlite-unified.js')));
  const { getWeekKey, shiftWeek, baselineScenarioFixture } = await import(pathToFileURL(path.join(root, 'hub-contracts/dist/index.js')));
  const now = new Date();
  const currentWeek = getWeekKey(now);
  const previousWeek = shiftWeek(currentWeek, -1);
  const database = openUnifiedDb(dbFile);
  database.initialize({ dataMode: 'real', identityMode: 'identity' }, now);
  const repo = database.openStores().gov;
  await repo.createSeason({ name: 'Test season', startsAt: now.toISOString(), endsAt: null });
  await repo.importRoster(['Member A', 'Member B', 'Member C'].map(displayName => ({ displayName, grade: 'freshman', groupName: 'Test group', gateReviewer: false, gateReviewerAuto: false })));
  const snapshot = await repo.getSnapshot();
  await database.openStores().baseline.upsertBaseline(snapshot.seasons[0].id, baselineScenarioFixture[0]);
  const a = snapshot.members.find(m => m.displayName === 'Member A');
  const b = snapshot.members.find(m => m.displayName === 'Member B');
  const c = snapshot.members.find(m => m.displayName === 'Member C');
  await repo.setProjectManager(a.id, true);
  const past = await repo.createTask({ projectId: snapshot.projectId, groupId: a.groupId, title: '跨周保留任务', rawSummary: '持续推进，不复制任务', ownerId: null, collaboratorIds: [], intrinsicComplexity: 'normal' });
  await repo.claimTask(past.id, a.id, new Date(now.getTime() - 7 * 86400000).toISOString(), { id: a.id, displayName: a.displayName, source: 'console' }, previousWeek);
  const pool = await repo.createTask({ projectId: snapshot.projectId, groupId: a.groupId, title: '任务池认领测试', rawSummary: '可由成员认领', ownerId: null, collaboratorIds: [], intrinsicComplexity: 'normal' });
    const blocked = await repo.createTask({ projectId: snapshot.projectId, groupId: a.groupId, title: '等待测试夹具', rawSummary: '缺口关联任务，不评价个人', ownerId: null, collaboratorIds: [], intrinsicComplexity: 'normal' });
    const actorA = { id: a.id, displayName: a.displayName, source: 'console' };
    await repo.claimTask(blocked.id, a.id, now.toISOString(), actorA, currentWeek);
    await repo.createNeed({ projectId: snapshot.projectId, onTaskId: blocked.id, description: '测试夹具', providerGroupId: a.groupId, neededSkills: [], source: 'human', confirmedBy: actorA });
  database.close();

  const port = await new Promise(resolve => {
    const listener = require('node:net').createServer();
    listener.listen(0, '127.0.0.1', () => { const p = listener.address().port; listener.close(() => resolve(p)); });
  });
  const base = `http://127.0.0.1:${port}`;
  let child, browser;
  const errors = [];
  async function start() {
    child = spawn(process.execPath, [server], { env: { ...process.env, HUB_HOST: '127.0.0.1', HUB_PORT: String(port), TEAMHUB_DB_FILE: dbFile, TEAMHUB_CONSOLE_DIST_DIR: consoleDist }, stdio: ['ignore', 'ignore', 'pipe'] });
    child.stderr.on('data', data => process.stderr.write(data));
    for (let i = 0; i < 100; i++) {
      if (child.exitCode !== null) throw new Error(`server exit ${child.exitCode}`);
      try { if ((await fetch(`${base}/health`)).ok) return; } catch {}
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error('server did not start');
  }
  async function stop() {
    if (!child || child.exitCode !== null) return;
    const exited = new Promise(resolve => child.once('exit', resolve));
    child.kill(); await exited;
  }
  async function memberPage(member) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
    const response = await context.request.post(`${base}/api/session`, { data: { username: member.displayName } });
    assert.equal(response.status(), 200);
    const pin = await context.request.put(`${base}/api/members/${member.id}/pin`, { data: { pin: 'test12345' } });
    assert.equal(pin.status(), 200);
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(String(error)));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(base, { waitUntil: 'networkidle' });
    return page;
  }
  async function capture(page, name) {
    await page.screenshot({ path: path.join(shots, `${name}.png`), fullPage: true, animations: 'disabled' });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2), false, `overflow: ${name}`);
  }
  try {
    await start();
    browser = await chromium.launch({ channel: process.env.E2E_BROWSER_CHANNEL || undefined });
    const pageA = await memberPage(a);
    const pageB = await memberPage(b);
    const pageC = await memberPage(c);
    await pageA.getByRole('heading', { name: '全队任务', exact: true }).waitFor();
    assert.equal(await pageA.getByRole('tab', { name: '任务池', exact: true }).count(), 0);
    await pageA.locator('.week-task').filter({ hasText: '跨周保留任务' }).waitFor();
    await pageA.locator('.week-task__block').filter({ hasText: '测试夹具' }).waitFor();
    await pageA.getByRole('button', { name: '新建任务', exact: true }).click();
    const dialogA = pageA.getByRole('dialog');
    const creationBox = await dialogA.boundingBox();
    const viewport = pageA.viewportSize();
    assert.ok(Math.abs(creationBox.x + creationBox.width / 2 - viewport.width / 2) < 2, 'new task is horizontally centered');
    assert.ok(Math.abs(creationBox.y + creationBox.height / 2 - viewport.height / 2) < 2, 'new task is vertically centered');
    assert.equal(await dialogA.getByText('当前项目', { exact: true }).count(), 0);
    await dialogA.getByLabel('任务标题', { exact: true }).fill('浏览器任务闭环');
    await dialogA.getByLabel('要完成什么', { exact: true }).fill('先完成，再选择备位');
    const submitted = pageA.waitForResponse(response => response.url().includes('/api/weeks/') && response.request().method() === 'POST');
    await dialogA.getByRole('button', { name: '提交', exact: true }).click();
    const submittedResponse = await submitted;
    assert.equal(submittedResponse.status(), 200, await submittedResponse.text());
    const created = (await submittedResponse.json()).task;
    const card = pageA.locator('.week-task').filter({ hasText: '浏览器任务闭环' });
    await card.waitFor();
    await card.getByRole('button', { name: '标记完成', exact: false }).click();
    await card.getByText('待验收', { exact: true }).waitFor();
    await card.getByRole('button', { name: '查看详情', exact: true }).click();
    await dialogA.getByText('尚未选择备位人', { exact: true }).first().waitFor();
    assert.equal(await dialogA.getByRole('button', { name: '已验收', exact: true }).isDisabled(), true);
    async function saveReviewers(ids) {
      await dialogA.getByRole('button', { name: '编辑任务 / 选择备位人', exact: true }).click();
      for (const member of [b, c]) await dialogA.getByLabel(member.displayName, { exact: true }).setChecked(ids.includes(member.id));
      const saved = pageA.waitForResponse(response => response.url().endsWith('/edit') && response.request().method() === 'POST');
      await dialogA.getByRole('button', { name: '提交', exact: true }).click();
      assert.equal((await saved).status(), 200);
      await dialogA.getByRole('button', { name: '编辑任务 / 选择备位人', exact: true }).waitFor();
    }
    await saveReviewers([b.id, c.id]);
    await saveReviewers([c.id]);
    await pageB.reload({ waitUntil: 'networkidle' });
    await pageB.locator('.week-task').filter({ hasText: '浏览器任务闭环' }).getByRole('button', { name: '查看详情' }).click();
    assert.equal(await pageB.getByRole('dialog').getByRole('button', { name: '已验收', exact: true }).isDisabled(), true);
    await saveReviewers([b.id, c.id]);
    await pageB.reload({ waitUntil: 'networkidle' });
    await pageB.locator('.week-task').filter({ hasText: '浏览器任务闭环' }).getByRole('button', { name: '查看详情' }).click();
    await pageB.getByRole('dialog').getByRole('button', { name: '已验收', exact: true }).click();
    await pageB.locator('.week-task').filter({ hasText: '浏览器任务闭环' }).getByText('已验收', { exact: true }).waitFor();
    await pageC.reload({ waitUntil: 'networkidle' });
    await pageC.locator('.week-task').filter({ hasText: '浏览器任务闭环' }).getByRole('button', { name: '查看详情' }).click();
    assert.equal(await pageC.getByRole('dialog').getByRole('button', { name: '已验收', exact: true }).count(), 0);
    assert.ok((await pageC.getByRole('dialog').textContent()).includes('验收通过'));
    await pageA.reload({ waitUntil: 'networkidle' });
    await card.getByRole('button', { name: '查看详情' }).click();
    await dialogA.getByRole('button', { name: '编辑任务 / 选择备位人', exact: true }).click();
    // A wrapping label includes the textarea's initial text in Playwright's label matcher.
    await dialogA.getByLabel('要完成什么').fill('修改后重新验收');
    await dialogA.getByRole('button', { name: '提交', exact: true }).click();
    await card.getByText('待验收', { exact: true }).waitFor();
    assert.ok((await dialogA.textContent()).includes('验收通过'));
    await pageC.reload({ waitUntil: 'networkidle' });
    await pageC.locator('.week-task').filter({ hasText: '浏览器任务闭环' }).getByRole('button', { name: '查看详情' }).click();
    await pageC.getByRole('dialog').getByRole('button', { name: '已验收', exact: true }).click();
    await pageC.locator('.week-task').filter({ hasText: '浏览器任务闭环' }).getByText('已验收', { exact: true }).waitFor();
    await pageA.getByRole('button', { name: '关闭', exact: true }).click();
    await stop(); await start();
    await pageA.reload({ waitUntil: 'networkidle' });
    await card.getByText('已验收', { exact: true }).waitFor();
    const result = await pageA.request.get(`${base}/api/tasks`);
    const persisted = (await result.json()).tasks.find(task => task.id === created.id);
    assert.equal(persisted.activity.filter(event => event.kind === 'accepted').length, 2);
    assert.ok(persisted.activity.some(event => event.kind === 'edited'));
    await pageA.getByLabel('搜索任务', { exact: true }).fill('先完成');
    await card.waitFor();
    await pageA.getByLabel('状态').selectOption('awaitingReview');
    assert.equal(await pageA.locator('.week-task').count(), 0);
    await pageA.getByLabel('状态').selectOption('accepted');
    await card.waitFor();
    await capture(pageA, 'accepted-history');
    await pageA.getByLabel('搜索任务', { exact: true }).fill('');
    await pageA.getByLabel('状态').selectOption('all');

    for (const width of [1440, 1000]) {
      await pageA.setViewportSize({ width, height: 1000 });
      for (const theme of ['notion', 'notion-dark', 'classic', 'warm', 'dark', 'tech', 'linear']) {
        await pageA.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
        await capture(pageA, `current-${theme}-${width}`);
      }
    }
    await pageA.evaluate(() => document.documentElement.dataset.theme = 'notion');
    await pageA.getByRole('button', { name: '更多', exact: true }).click();
    await pageA.locator('.console-sidebar').getByRole('button', { name: '总览', exact: true }).click();
    await pageA.locator('.overview-season').waitFor();
    assert.equal(await pageA.locator('.workbench-progress-strip').count(), 1);
    await capture(pageA, 'overview-1000');
    assert.equal(await pageA.locator('.workbench-timeline').count(), 1);
    if (process.env.E2E_HEALTH) {
      const statePath = path.join(dir, 'browser-state.json');
      await pageA.context().storageState({ path: statePath });
      const healthExit = await new Promise((resolve, reject) => {
        const health = spawn(process.execPath, [path.resolve(__dirname, '../health-check.cjs')], { env: { ...process.env, TEAMHUB_BASE: base, HEALTH_STORAGE_STATE: statePath, HEALTH_OUT: path.join(shots, 'health') }, stdio: 'inherit' });
        health.on('error', reject); health.on('exit', resolve);
      });
      assert.equal(healthExit, 0, 'navigation health-check');
    }
    assert.deepEqual(errors, []);
    console.log(`PASS team tasks: create without backups, select/replace, one acceptance, edit/review history, restart, filters; screenshots ${shots}`);
  } finally {
    await browser?.close(); await stop();
    if (!process.env.E2E_KEEP) rmSync(dir, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
