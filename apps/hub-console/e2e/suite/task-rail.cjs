// P2: isolated identity-mode rail, including the complete -> self-accept -> accepted chain.
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
  const dir = mkdtempSync(path.join(tmpdir(), 'teamhub-task-rail-e2e-'));
  const shots = process.env.E2E_SHOTS || path.join(dir, 'shots');
  mkdirSync(shots, { recursive: true });
  const dbFile = path.join(dir, 'task-rail.sqlite');
  const { openUnifiedDb } = await import(pathToFileURL(path.join(root, 'hub-server/dist/store/sqlite-unified.js')));
  const { getWeekKey, shiftWeek } = await import(pathToFileURL(path.join(root, 'hub-contracts/dist/index.js')));
  const { RealClock } = await import(pathToFileURL(path.join(root, 'hub-server/dist/clock.js')));
  const now = new Date();
  const currentWeek = getWeekKey(now);
  const db = openUnifiedDb(dbFile);
  db.initialize({ dataMode: 'real', identityMode: 'identity' }, now);
  const repo = db.openStores(new RealClock()).gov;
  await repo.createSeason({ name: 'Rail test season', startsAt: now.toISOString(), endsAt: null });
  await repo.importRoster(['Rail A', 'Rail B'].map(displayName => ({ displayName, grade: 'freshman', groupName: displayName === 'Rail A' ? 'Rail controls' : 'Rail mechanics', gateReviewer: false, gateReviewerAuto: false })));
  const snapshot = await repo.getSnapshot();
  const a = snapshot.members.find(member => member.displayName === 'Rail A');
  const b = snapshot.members.find(member => member.displayName === 'Rail B');
  await repo.setProjectManager(a.id, true);
  const actorA = { id: a.id, displayName: a.displayName, source: 'console' };
  const actorB = { id: b.id, displayName: b.displayName, source: 'console' };
  const create = (title, groupId, ownerId) => repo.createTask({ projectId: snapshot.projectId, groupId, title, rawSummary: `${title}：右栏浏览器验证`, ownerId, collaboratorIds: [], intrinsicComplexity: 'normal' });
  const selfTask = await create('右栏自证验收任务', a.groupId, a.id);
  await create('无周新任务', a.groupId, a.id);
  const past = await create('过去周滚入今天', a.groupId, null);
  await repo.claimTask(past.id, a.id, new Date(now.getTime() - 7 * 86400000).toISOString(), actorA, shiftWeek(currentWeek, -1));
  const thisWeek = await create('本周稍后处理', a.groupId, null);
  await repo.claimTask(thisWeek.id, a.id, new Date(now.getTime() - 2 * 86400000).toISOString(), actorA, currentWeek);
  const future = await create('未来周任务', b.groupId, null);
  await repo.claimTask(future.id, b.id, now.toISOString(), actorB, shiftWeek(currentWeek, 1));
  db.close();

  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  let child, browser, page;
  const errors = [];
  try {
    child = spawn(process.execPath, [path.join(root, 'hub-server/dist/main.js')], {
      windowsHide: true,
      env: { ...process.env, HUB_HOST: '127.0.0.1', HUB_PORT: String(port), TEAMHUB_DB_FILE: dbFile, TEAMHUB_CONSOLE_DIST_DIR: path.resolve(__dirname, '../../dist') },
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    child.stderr.on('data', data => process.stderr.write(data));
    for (let i = 0; ; i++) {
      if (child.exitCode !== null || i > 100) throw new Error('task rail test server failed to start');
      try { if ((await fetch(`${base}/health`)).ok) break; } catch {}
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    browser = await chromium.launch({ channel: process.env.E2E_BROWSER_CHANNEL || undefined });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    assert.equal((await context.request.post(`${base}/api/session`, { data: { username: a.displayName } })).status(), 200);
    assert.equal((await context.request.put(`${base}/api/members/${a.id}/pin`, { data: { pin: 'test12345' } })).status(), 200);
    page = await context.newPage();
    page.setDefaultTimeout(10000);
    page.on('pageerror', error => errors.push(String(error)));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(base, { waitUntil: 'networkidle' });
    const toggle = page.locator('#console-rail-toggle');
    const rail = page.locator('#console-right-rail');
    if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
    await rail.locator('.task-rail').waitFor();
    const status = rail.getByLabel('清单状态', { exact: true });
    const grouping = rail.getByLabel('清单分组', { exact: true });
    const row = title => rail.locator('.task-rail__row').filter({ hasText: title });
    const capture = async name => {
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(shots, `${name}.png`), fullPage: false, animations: 'disabled' });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false, `overflow: ${name}`);
    };

    await row(selfTask.title).waitFor();
    assert.equal(await row(future.title).count(), 0, 'personal scope excludes other owners');
    await capture('p2-01-rail-personal-1440');

    await rail.getByRole('group', { name: '清单范围', exact: true }).getByRole('button', { name: '全队', exact: true }).click();
    await row(future.title).waitFor();
    const bucketText = await rail.locator('.task-rail__sections').innerText();
    for (const bucket of ['今天', '本周', '以后']) assert.ok(bucketText.includes(bucket), `missing bucket ${bucket}`);
    assert.equal(bucketText.includes('已归档'), false, 'active filter omits archived');
    assert.equal(await row(future.title).locator('input[type="checkbox"]').count(), 0, 'other owner week task has no checkbox');
    assert.equal(await row(future.title).locator('.task-rail__check-spacer').count(), 1);
    assert.equal(await row(selfTask.title).locator('input[type="checkbox"]').count(), 1, 'non-week own task can complete');
    await capture('p2-02-rail-team-1440');

    await grouping.selectOption('group');
    const groupedText = await rail.locator('.task-rail__sections').innerText();
    assert.ok(groupedText.includes('Rail controls') && groupedText.includes('Rail mechanics'));
    await capture('p2-03-rail-group-by-group-1440');
    await grouping.selectOption('time');

    const completed = page.waitForResponse(response => response.url().endsWith(`/api/tasks/${selfTask.id}/complete`) && response.request().method() === 'POST');
    await row(selfTask.title).locator('input[type="checkbox"]').click();
    assert.equal((await completed).status(), 200);
    await status.selectOption('awaitingReview');
    await row(selfTask.title).waitFor();
    await row(selfTask.title).getByText('待验收', { exact: true }).waitFor();
    await capture('p2-04-rail-pending-1440');

    await row(selfTask.title).getByRole('button', { name: selfTask.title, exact: true }).click();
    const detail = page.getByRole('dialog', { name: selfTask.title, exact: true });
    await detail.getByRole('button', { name: '自己验收', exact: true }).click();
    const form = page.locator('.task-detail__self-accept');
    assert.equal(await form.locator('textarea[required]').count(), 3, 'all delivery fields are required');
    assert.equal(await form.getByRole('button', { name: '提交验收', exact: true }).isDisabled(), true, 'empty delivery cannot submit');
    await form.getByLabel('完成内容', { exact: true }).fill('完成右栏自证验收全链路，复核完成态与交付记录。');
    await form.getByLabel('交付物', { exact: true }).fill('验收记录与测试截图');
    await form.getByLabel('文件位置（一行一个）', { exact: true }).fill('artifacts/rail/acceptance.md\nartifacts/rail/p2-06.png');
    await capture('p2-05-self-accept-1440');
    const reviewed = page.waitForResponse(response => response.url().endsWith(`/api/tasks/${selfTask.id}/review`) && response.request().method() === 'POST');
    await form.getByRole('button', { name: '提交验收', exact: true }).click();
    assert.equal((await reviewed).status(), 200);
    await detail.getByText('验收通过', { exact: true }).waitFor();
    const detailText = await detail.innerText();
    for (const text of ['完成右栏自证验收全链路', '验收记录与测试截图', 'artifacts/rail/acceptance.md', 'artifacts/rail/p2-06.png']) assert.ok(detailText.includes(text), `delivery missing: ${text}`);
    await detail.getByRole('button', { name: '关闭', exact: true }).click();
    await detail.waitFor({ state: 'detached' });
    await status.selectOption('accepted');
    await row(selfTask.title).waitFor();
    await row(selfTask.title).getByText('已验收', { exact: true }).waitFor();
    await capture('p2-06-rail-accepted-1440');

    const persistedResponse = await page.request.get(`${base}/api/tasks`);
    const persisted = (await persistedResponse.json()).tasks.find(task => task.id === selfTask.id);
    assert.equal(persisted.status, 'done');
    assert.equal(persisted.reviewedBy.id, a.id);
    assert.deepEqual(persisted.delivery.paths, ['artifacts/rail/acceptance.md', 'artifacts/rail/p2-06.png']);
    assert.ok(persisted.completedAt);
    assert.deepEqual(errors, []);
    console.log(`PASS P2 task rail: personal/team/grouping, complete, required delivery, self accept, persistence; screenshots ${shots}`);
  } catch (error) {
    if (page) {
      await page.screenshot({ path: path.join(shots, 'task-rail-failure.png'), fullPage: true });
      console.error(await page.locator('body').innerText());
    }
    throw error;
  } finally {
    await browser?.close();
    if (child && child.exitCode === null) {
      const exited = new Promise(resolve => child.once('exit', resolve));
      child.kill(); await exited;
    }
    rmSync(dir, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
