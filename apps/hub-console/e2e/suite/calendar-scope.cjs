// Identity-mode acceptance for derived project groups, calendar scopes, and participant editing.
const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const { mkdtempSync, mkdirSync, rmSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { freePort } = require('./lib/free-port.cjs');
const { contextOptions } = require('./lib/context.cjs');
const { settle } = require('./lib/wait.cjs');

const ADMIN = { name: '队长', pin: 'admin12345' };
const MECH_A = { name: '机械甲', pin: 'mech12345' };

(async () => {
  const consoleDir = path.resolve(__dirname, '../..');
  const serverMain = path.resolve(consoleDir, '../hub-server/dist/main.js');
  const consoleDist = path.join(consoleDir, 'dist');
  const dir = mkdtempSync(path.join(os.tmpdir(), 'teamhub-calendar-scope-e2e-'));
  const dbFile = path.join(dir, 'calendar-scope.sqlite');
  const shots = process.env.E2E_SHOTS || '/home/ubuntu/projects/teamhub/tmp/visual/calendar-scope';
  mkdirSync(shots, { recursive: true });
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  let child;
  let stopping = false;

  function launch() {
    child = spawn(process.execPath, [serverMain], {
      windowsHide: true,
      env: {
        ...process.env,
        HUB_HOST: '127.0.0.1',
        HUB_PORT: String(port),
        TEAMHUB_DB_FILE: dbFile,
        TEAMHUB_CONSOLE_DIST_DIR: consoleDist,
      },
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    child.stderr.on('data', data => process.stderr.write(data));
    child.on('exit', code => {
      if (code === 42 && !stopping) launch();
    });
  }

  async function waitUp() {
    for (let i = 0; i < 150; i++) {
      try {
        const response = await fetch(`${base}/api/setup/state`);
        if (response.status < 500) return;
      } catch { /* Server is still starting. */ }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error('calendar-scope test server failed to start');
  }

  async function stop() {
    stopping = true;
    if (!child || child.exitCode !== null || child.signalCode !== null) return;
    await new Promise(resolve => {
      child.once('exit', resolve);
      child.kill('SIGTERM');
    });
  }

  async function api(method, url, body, cookie) {
    const response = await fetch(`${base}${url}`, {
      method,
      headers: {
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(cookie ? { cookie } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const text = await response.text();
    return { response, data: text ? JSON.parse(text) : null };
  }

  function expectStatus(result, status, label) {
    assert.equal(result.response.status, status, `${label}: ${JSON.stringify(result.data)}`);
    return result.data;
  }

  let browser;
  const errors = [];
  function watchErrors(page) {
    page.on('pageerror', error => errors.push(String(error)));
    page.on('console', message => {
      if (message.type() !== 'error') return;
      if (/Failed to load resource.*\b(401|403)\b/.test(message.text())) return;
      errors.push(message.text());
    });
  }

  async function login(page, username, pin) {
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.locator('.auth-gate__username').fill(username);
    await page.locator('.auth-gate__pin').fill(pin);
    await page.locator('.auth-gate button[type="submit"]').click();
    await page.locator('.console-sidebar').waitFor();
  }

  async function openCalendar(page) {
    await page.locator('.console-sidebar').getByRole('button', { name: '日历', exact: true }).click();
    await page.locator('.calendar-month-view').waitFor();
    await settle(page);
  }

  async function capture(page, name) {
    await settle(page);
    const width = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, viewport: window.innerWidth }));
    assert.ok(width.scroll <= width.viewport + 2, `${name} horizontal overflow: ${width.scroll}/${width.viewport}`);
    await page.screenshot({ path: path.join(shots, `${name}.png`), fullPage: true, animations: 'disabled' });
  }

  try {
    launch();
    await waitUp();
    expectStatus(await api('POST', '/api/setup/init', { dataMode: 'real', identityMode: 'identity' }), 200, 'setup/init');
    await new Promise(resolve => setTimeout(resolve, 1500));
    await waitUp();
    expectStatus(await api('POST', '/api/setup/super-admin', {
      displayName: ADMIN.name,
      groupName: '电控',
      grade: 'senior',
      pin: ADMIN.pin,
    }), 200, 'setup/super-admin');
    const adminLoginResult = await api('POST', '/api/session', { username: ADMIN.name, pin: ADMIN.pin });
    const adminLogin = expectStatus(adminLoginResult, 200, 'admin login');
    assert.ok(adminLogin.session?.memberId, 'admin session includes memberId');
    const adminCookie = (adminLoginResult.response.headers.getSetCookie?.() ?? [])
      .map(value => value.split(';')[0]).join('; ');
    assert.ok(adminCookie, 'admin session cookie');

    expectStatus(await api('POST', '/api/roster/import', {
      rows: [
        { displayName: MECH_A.name, groupName: '机械', grade: 'sophomore', gateReviewer: false, gateReviewerAuto: false },
        { displayName: '机械乙', groupName: '机械', grade: 'sophomore', gateReviewer: false, gateReviewerAuto: false },
        { displayName: '视觉乙', groupName: '视觉', grade: 'sophomore', gateReviewer: false, gateReviewerAuto: false },
      ],
    }, adminCookie), 200, 'roster/import');
    const { groups } = expectStatus(await api('GET', '/api/groups', undefined, adminCookie), 200, 'groups');
    const { members } = expectStatus(await api('GET', '/api/members', undefined, adminCookie), 200, 'members');
    const groupId = name => groups.find(group => group.name === name)?.id;
    const memberId = name => members.find(member => member.displayName === name)?.id;
    const ec = groupId('电控');
    const mech = groupId('机械');
    const vision = groupId('视觉');
    const mechA = memberId(MECH_A.name);
    const mechB = memberId('机械乙');
    const visionB = memberId('视觉乙');
    assert.ok(ec && mech && vision && mechA && mechB && visionB, 'fixture groups and members exist');
    expectStatus(await api('PUT', `/api/members/${mechA}/pin`, { pin: MECH_A.pin }, adminCookie), 200, 'mech A PIN');

    const monthStart = `${new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' }).format(new Date()).slice(0, 8)}01`;
    const projectDate = offset => {
      const date = new Date(`${monthStart}T00:00:00.000Z`);
      date.setUTCDate(date.getUTCDate() + offset);
      return date.toISOString();
    };
    const projects = {};
    for (const [index, name] of ['P1-队内', 'P2-机械联合', 'P3-机械乙', 'P4-视觉联合'].entries()) {
      const created = expectStatus(await api('POST', '/api/projects', {
        name,
        startsAt: projectDate(1 + index * 2),
        endsAt: projectDate(1 + index * 2),
      }, adminCookie), 201, `create ${name}`);
      projects[name] = created.project;
      assert.equal(created.project.createdBy, adminLogin.session.memberId);
      assert.deepEqual(created.project.groupIds, [ec], `${name} creator group`);
    }
    const putMembers = async (name, memberIds) => expectStatus(await api('PUT', `/api/projects/${projects[name].id}`, { memberIds }, adminCookie), 200, `participants ${name}`).project;
    let project = await putMembers('P2-机械联合', [mechA]);
    assert.deepEqual(project.groupIds, [ec, mech]);
    project = await putMembers('P3-机械乙', [mechB, mechA]);
    assert.deepEqual(project.groupIds, [ec, mech]);
    project = await putMembers('P3-机械乙', [mechB]);
    assert.deepEqual(project.memberIds, [mechB]);
    assert.deepEqual(project.groupIds, [ec, mech], 'removing a participant does not shrink groups');
    project = await putMembers('P4-视觉联合', [visionB]);
    assert.deepEqual(project.groupIds, [ec, vision]);

    browser = await chromium.launch({ channel: process.env.E2E_BROWSER_CHANNEL || undefined });
    const context = await browser.newContext(contextOptions({ viewport: { width: 1440, height: 1000 } }));
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    watchErrors(page);
    await login(page, MECH_A.name, MECH_A.pin);
    await openCalendar(page);
    const scope = name => page.getByRole('group', { name: '项目范围', exact: true }).getByRole('button', { name, exact: true });
    const bars = name => page.locator(`.calendar-project-bar[title^="${name} ·"]`);
    assert.equal(await page.locator('.calendar-project-bar').count(), 4, 'team scope has four projects');
    await capture(page, 'scope-all-1440');

    await scope('本组').click();
    assert.equal(await page.locator('.calendar-project-bar').count(), 2, 'group scope has two mechanical projects');
    assert.equal(await bars('P2-机械联合').count(), 1);
    assert.equal(await bars('P3-机械乙').count(), 1);
    await capture(page, 'scope-group-1440');
    await page.reload({ waitUntil: 'networkidle' });
    await openCalendar(page);
    assert.equal(await scope('本组').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('.calendar-project-bar').count(), 2);
    assert.equal(await page.evaluate(() => localStorage.getItem('teamhub.calendar.scope')), 'group');

    await scope('个人').click();
    assert.equal(await page.locator('.calendar-project-bar').count(), 1, 'personal scope has only P2');
    assert.equal(await bars('P2-机械联合').count(), 1);
    await capture(page, 'scope-personal-1440');
    await scope('本组').click();
    await page.setViewportSize({ width: 1000, height: 900 });
    await capture(page, 'scope-1000');

    const adminContext = await browser.newContext(contextOptions({ viewport: { width: 1440, height: 1000 } }));
    const adminPage = await adminContext.newPage();
    adminPage.setDefaultTimeout(10000);
    watchErrors(adminPage);
    await login(adminPage, ADMIN.name, ADMIN.pin);
    await openCalendar(adminPage);
    await adminPage.locator('.calendar-project-bar[title^="P1-队内 ·"]').click();
    const drawer = adminPage.getByRole('dialog', { name: 'P1-队内', exact: true });
    const participants = drawer.locator('.calendar-participants');
    await participants.getByText('暂无参与人', { exact: true }).waitFor();
    await participants.getByLabel('参与人', { exact: true }).selectOption(mechA);
    const added = adminPage.waitForResponse(response => response.url().endsWith(`/api/projects/${projects['P1-队内'].id}`) && response.request().method() === 'PUT');
    await participants.getByRole('button', { name: '添加参与人', exact: true }).click();
    assert.equal((await added).status(), 200);
    await participants.locator('.calendar-participant-chip').filter({ hasText: MECH_A.name }).waitFor();
    await capture(adminPage, 'participants-drawer-1440');
    let p1 = (await api('GET', '/api/projects', undefined, adminCookie)).data.projects.find(item => item.id === projects['P1-队内'].id);
    assert.deepEqual(p1.memberIds, [mechA]);
    assert.deepEqual(p1.groupIds, [ec, mech]);

    const removed = adminPage.waitForResponse(response => response.url().endsWith(`/api/projects/${projects['P1-队内'].id}`) && response.request().method() === 'PUT');
    await participants.getByRole('button', { name: `移除参与人 ${MECH_A.name}`, exact: true }).click();
    assert.equal((await removed).status(), 200);
    await participants.getByText('暂无参与人', { exact: true }).waitFor();
    p1 = (await api('GET', '/api/projects', undefined, adminCookie)).data.projects.find(item => item.id === projects['P1-队内'].id);
    assert.deepEqual(p1.memberIds, []);
    assert.deepEqual(p1.groupIds, [ec, mech], 'drawer removal keeps historical groups');
    await adminPage.keyboard.press('Escape');
    await drawer.waitFor({ state: 'detached' });
    await adminPage.locator('.calendar-project-bar[title^="P1-队内 ·"]').click();
    await adminPage.getByRole('dialog', { name: 'P1-队内', exact: true }).getByText('暂无参与人', { exact: true }).waitFor();

    assert.deepEqual(errors, [], 'calendar scope has no browser errors');
    console.log(`PASS calendar scope: API-derived groups, 4/2/1 scopes, reload persistence, participants add/remove, 1000px; screenshots ${shots}`);
  } finally {
    if (browser) await browser.close();
    await stop();
    rmSync(dir, { recursive: true, force: true });
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
