const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '../../../../..');
const PASSWORDS = { admin: 'e2e-admin-password', owner: 'e2e-owner-password', reviewer: 'e2e-reviewer-password' };
async function load(relative) { return import(pathToFileURL(path.join(ROOT, relative)).href); }
async function startV1Server(options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'teamhub-v1-e2e-'));
  const databasePath = path.join(root, 'teamhub.sqlite');
  const evidenceDir = path.join(root, 'evidence');
  const { openV1Database } = await load('apps/hub-server/dist/store/v1-database.js');
  const { GroupSchema, MemberSchema } = await load('apps/hub-contracts/dist/index.js');
  const { createSystemModule } = await load('apps/hub-server/dist/modules/system/public.js');
  const { hashPin } = await load('apps/hub-server/dist/identity/pin.js');
  const { buildHubServer } = await load('apps/hub-server/dist/server.js');
  const database = openV1Database(databasePath);
  database.initialize({ dataMode: 'real', identityMode: 'identity' }, new Date('2026-11-17T04:00:00.000Z'));
  const group = GroupSchema.parse({ id: 'grp-v1-1', name: '电路', kind: 'custom' });
  const members = [
    { id: 'member-v1-1', displayName: 'owner', grade: 'junior', gateReviewer: false, projectManager: false },
    { id: 'member-v1-2', displayName: 'reviewer', grade: 'senior', gateReviewer: true, projectManager: false },
    { id: 'member-v1-3', displayName: 'newbie', grade: 'freshman', gateReviewer: false, projectManager: false },
    { id: 'member-v1-4', displayName: 'admin', grade: 'senior', gateReviewer: true, projectManager: true },
  ].map(member => MemberSchema.parse({
    ...member,
    role: 'member',
    groupId: group.id,
    updatedAt: '2026-11-17T04:00:00.000Z',
    ...(member.displayName === 'newbie' ? {} : { pinHash: hashPin(PASSWORDS[member.displayName]) }),
  }));
  database.db.tx(() => {
    database.db.insertRow('groups', group.id, group);
    for (const member of members) database.db.insertRow('members', member.id, member);
  });
  const settings = createSystemModule(database.db).publicApi;
  const previousEvidence = process.env.TEAMHUB_EVIDENCE_FILES_DIR;
  process.env.TEAMHUB_EVIDENCE_FILES_DIR = evidenceDir;
  const app = buildHubServer({ database, consoleDistDir: path.join(ROOT, 'apps/hub-console/dist') });
  const ids = { groupId: settings.listGroups()[0].id };
  for (const name of ['admin', 'owner', 'reviewer', 'newbie']) ids[name] = settings.listMembers().find(member => member.displayName === name).id;
  async function api(username, method, url, payload) {
    const login = await app.inject({ method: 'POST', url: '/api/session', payload: { username, pin: PASSWORDS[username] } });
    assert.equal(login.statusCode, 200, login.body);
    const cookie = login.headers['set-cookie'].split(';')[0];
    const response = await app.inject({ method, url, headers: { cookie }, ...(payload === undefined ? {} : { payload }) });
    return response;
  }
  if (options.tasks) {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' });
    const today = formatter.format(now);
    const epoch = Date.parse(`${today}T00:00:00.000Z`) / 86400000;
    const key = offset => new Date((epoch + offset) * 86400000).toISOString().slice(0, 10);
    const weekday = new Date(`${today}T00:00:00.000Z`).getUTCDay();
    const mondayOffset = -((weekday + 6) % 7);
    const seeds = [
      { title: 'E2E交付任务', summary: '完成、交付、验收、刷新', start: key(-1), end: key(1) },
      { title: 'E2E跨周任务', summary: '跨周与结束日', start: key(mondayOffset), end: key(mondayOffset + 13) },
      { title: 'E2E未安排任务', summary: '没有计划日期', start: null, end: null },
      { title: 'E2E他人任务', summary: '范围过滤', start: key(0), end: key(0), ownerId: ids.reviewer },
    ];
    for (const seed of seeds) {
      const response = await api('admin', 'POST', '/api/tasks', {
        groupId: ids.groupId, title: seed.title, rawSummary: seed.summary, ownerId: seed.ownerId ?? ids.owner,
        collaboratorIds: [], intrinsicComplexity: 'normal', plannedStart: seed.start, plannedEnd: seed.end,
      });
      assert.equal(response.statusCode, 201, response.body);
    }
  }
  const baseUrl = await app.listen({ host: '127.0.0.1', port: 0 });
  return { app, database, root, baseUrl, evidenceDir, ids, passwords: PASSWORDS, api,
    async close() {
      await app.close();
      database.close();
      if (previousEvidence === undefined) delete process.env.TEAMHUB_EVIDENCE_FILES_DIR;
      else process.env.TEAMHUB_EVIDENCE_FILES_DIR = previousEvidence;
      fs.rmSync(root, { recursive: true, force: true });
    } };
}
async function withBrowser(run) {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 1000, height: 900 }, locale: 'zh-CN' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try { await run(page, context); assert.deepEqual(errors, []); }
  catch (error) {
    console.error('Browser errors:', errors);
    console.error('Page URL:', page.url());
    console.error('Page text:', (await page.locator('body').innerText().catch(() => '')).slice(0, 2000));
    throw error;
  }
  finally { await browser.close(); }
}
async function login(page, hub, username = 'owner', password = PASSWORDS[username]) {
  await page.goto(hub.baseUrl);
  await page.locator('.auth-gate__username').fill(username);
  await page.locator('.auth-gate__pin').fill(password ?? '');
  await page.locator('.auth-gate__card button[type="submit"]').click();
  await page.locator('.console-shell').waitFor();
}
async function navigate(page, label) {
  await page.getByRole('button', { name: label, exact: true }).click();
  await page.locator(`#console-main[data-page]`).waitFor();
}
async function assertNoOverflow(page) {
  const dimensions = await page.evaluate(() => ({ viewport: window.innerWidth, document: document.documentElement.scrollWidth,
    main: document.querySelector('#console-main')?.scrollWidth ?? 0 }));
  assert.ok(dimensions.document <= dimensions.viewport, JSON.stringify(dimensions));
  assert.ok(dimensions.main <= dimensions.viewport, JSON.stringify(dimensions));
}
module.exports = { startV1Server, withBrowser, login, navigate, assertNoOverflow, PASSWORDS };
