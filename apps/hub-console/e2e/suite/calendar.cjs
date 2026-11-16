// Real SQLite + real browser acceptance for both calendar views.
const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const { mkdtempSync, mkdirSync, rmSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const assert = require('node:assert/strict');
const { freePort } = require('./lib/free-port.cjs');
const { contextOptions } = require('./lib/context.cjs');
const { settle } = require('./lib/wait.cjs');

(async () => {
  const root = path.resolve(__dirname, '../../..');
  const dir = mkdtempSync(path.join(os.tmpdir(), 'teamhub-calendar-e2e-'));
  const shots = process.env.E2E_SHOTS || path.join(os.tmpdir(), 'p3b-shots');
  mkdirSync(shots, { recursive: true });
  const dbFile = path.join(dir, 'calendar.sqlite');
  const { openUnifiedDb } = await import(pathToFileURL(path.join(root, 'hub-server/dist/store/sqlite-unified.js')));
  const now = new Date();
  const dateKey = date => date.toISOString().slice(0, 10);
  const at = days => new Date(now.getTime() + days * 86400000).toISOString();
  const todayKey = dateKey(now);
  const addDays = (key, count) => {
    const date = new Date(`${key}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + count);
    return dateKey(date);
  };
  const previousMonth = new Date(`${todayKey.slice(0, 8)}01T00:00:00.000Z`);
  previousMonth.setUTCMonth(previousMonth.getUTCMonth() - 1);
  const nextMonth = new Date(`${todayKey.slice(0, 8)}01T00:00:00.000Z`);
  nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
  const previousMonthKey = dateKey(previousMonth);
  const nextMonthKey = dateKey(nextMonth);
  const overlapAnchor = new Date(`${addDays(nextMonthKey, 10)}T00:00:00.000Z`);
  const overlapStart = addDays(dateKey(overlapAnchor), -((overlapAnchor.getUTCDay() + 6) % 7));
  const overlapEnd = addDays(overlapStart, 4);
  const monthDate = (key, offset) => new Date(`${addDays(key, offset)}T00:00:00.000Z`).toISOString();
  const db = openUnifiedDb(dbFile);
  db.initialize({ dataMode: 'real', identityMode: 'anonymous' }, now);
  const stores = db.openStores();
  const season = await stores.gov.createSeason({ name: 'E2E 日历赛季', startsAt: at(-8), endsAt: at(45) });
  const creations = [
    await stores.gov.createProject({ name: 'E2E进行中项目', startsAt: at(-3), endsAt: null }),
    await stores.gov.createProject({ name: 'E2E跨周项目', startsAt: at(-1), endsAt: at(14) }),
    await stores.gov.createProject({ name: 'E2E中期项目', startsAt: at(2), endsAt: at(6) }),
    await stores.gov.createProject({ name: 'E2E近期项目', startsAt: at(3), endsAt: at(9) }),
    await stores.gov.createProject({ name: 'E2E未定开始', startsAt: null, endsAt: null }),
    await stores.gov.createProject({ name: 'E2E上月项目', startsAt: monthDate(previousMonthKey, 1), endsAt: monthDate(previousMonthKey, 6) }),
  ];
  const overlapNames = ['E2E重叠甲', 'E2E重叠乙', 'E2E重叠丙', 'E2E重叠丁'];
  for (const name of overlapNames) {
    creations.push(await stores.gov.createProject({ name, startsAt: `${overlapStart}T00:00:00.000Z`, endsAt: `${overlapEnd}T00:00:00.000Z` }));
  }
  assert.ok(creations.every(result => result.ok), 'all calendar projects are created');
  await stores.baseline.upsertBaseline(season.id, {
    anchors: {}, phases: [],
    segments: [
      { kind: 'semester', startsAt: at(-8), endsAt: at(10), label: 'E2E学期' },
      { kind: 'vacation', startsAt: at(11), endsAt: at(20), label: 'E2E假期' },
    ],
    milestones: [
      { id: 'e2e-gate', title: 'E2E门', kind: 'gate', plannedAt: at(2), status: 'pending' },
      { id: 'e2e-passed', title: 'E2E已过', kind: 'milestone', plannedAt: at(-2), status: 'passed' },
      { id: 'e2e-outside', title: '窗口外里程碑', kind: 'milestone', plannedAt: at(365), status: 'pending' },
    ],
  });
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
      if (child.exitCode !== null || i > 100) throw new Error('calendar test server failed to start');
      try { if ((await fetch(`${base}/health`)).ok) break; } catch {}
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    browser = await chromium.launch({ channel: process.env.E2E_BROWSER_CHANNEL || undefined });
    page = await (await browser.newContext(contextOptions({ viewport: { width: 1440, height: 1000 } }))).newPage();
    page.setDefaultTimeout(10000);
    page.on('pageerror', error => errors.push(String(error)));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.locator('.console-sidebar').getByRole('button', { name: '日历', exact: true }).click();
    await page.locator('.calendar-month-view').waitFor();
    await settle(page);

    const seg = name => page.locator('.calendar-view-toggle button[data-view]').filter({ hasText: name });
    const capture = async name => {
      await settle(page);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2), true, `overflow: ${name}`);
      await page.screenshot({ path: path.join(shots, `${name}.png`), fullPage: true, animations: 'disabled' });
    };
    const captureTimeline = async (name, width, height) => {
      await page.setViewportSize({ width, height });
      const wrap = await page.locator('.calendar-grid-wrap').evaluate(element => ({ client: element.clientWidth, scroll: element.scrollWidth }));
      assert.ok(wrap.scroll <= wrap.client + 1, `calendar grid overflow: ${name}: ${wrap.client}/${wrap.scroll}`);
      console.log(`calendar wrap ${name}: client=${wrap.client} scroll=${wrap.scroll}`);
      await capture(name);
    };

    // 月视图默认 6×7，跨周条分段，无开始日期项目不进入横条区。
    assert.equal(await page.locator('.calendar-month-day').count(), 42);
    assert.equal(await page.locator('.calendar-month-week').count(), 6);
    assert.equal(await page.locator('.calendar-empty').count(), 0);
    assert.equal(await page.locator('.calendar-month-unstarted button').filter({ hasText: 'E2E未定开始' }).count(), 1);
    assert.ok(await page.locator('.calendar-project-bar[title^="E2E跨周项目 ·"][data-continue-start="true"]').count() >= 1);
    assert.ok(await page.locator('.calendar-project-bar[title^="E2E跨周项目 ·"][data-continue-end="true"]').count() >= 1);
    const continuedStart = page.locator('.calendar-project-bar[data-continue-start="true"]').first();
    const continuedEnd = page.locator('.calendar-project-bar[data-continue-end="true"]').first();
    assert.equal(await continuedStart.evaluate(element => getComputedStyle(element).borderTopLeftRadius), '0px');
    assert.equal(await continuedStart.evaluate(element => getComputedStyle(element).borderBottomLeftRadius), '0px');
    assert.equal(await continuedEnd.evaluate(element => getComputedStyle(element).borderTopRightRadius), '0px');
    assert.equal(await continuedEnd.evaluate(element => getComputedStyle(element).borderBottomRightRadius), '0px');
    const todayBackground = await page.locator('.calendar-month-day[data-today="true"]').evaluate(element => getComputedStyle(element).backgroundColor);
    assert.notEqual(todayBackground, 'rgba(0, 0, 0, 0)', 'today has a visible background');
    await capture('month-current');

    await page.locator('.calendar-project-bar[title^="E2E中期项目 ·"]').first().click();
    const drawer = page.getByRole('dialog');
    await drawer.waitFor();
    assert.match(await drawer.getByRole('heading').innerText(), /E2E中期项目/);
    await page.keyboard.press('Escape');
    await drawer.waitFor({ state: 'hidden' });

    await page.locator('.calendar-month-nav button[aria-label="上个月"]').click();
    assert.equal(await page.locator('.calendar-month-day').count(), 42);
    assert.ok(await page.locator('.calendar-project-bar[title^="E2E上月项目 ·"]').count() >= 1);
    await capture('month-prev');

    await page.locator('.calendar-month-nav button[aria-label="下个月"]').click();
    await page.locator('.calendar-month-nav button[aria-label="下个月"]').click();
    assert.equal(await page.locator('.calendar-month-day').count(), 42);
    const overlapBars = page.locator('.calendar-project-bar').filter({ hasText: /E2E重叠[甲乙丙丁]/ });
    assert.equal(await overlapBars.count(), 3, 'four overlapping projects paint only three lanes');
    const overflow = page.locator('.calendar-month-overflow').filter({ hasText: '+1' });
    assert.equal(await overflow.count(), 1);
    const shownOverlapNames = await overlapBars.allTextContents();
    const hiddenOverlapName = overlapNames.find(name => !shownOverlapNames.includes(name));
    assert.ok(hiddenOverlapName && (await overflow.getAttribute('title')).includes(hiddenOverlapName), 'overflow title includes the hidden project');
    await capture('month-next');

    await page.locator('.calendar-month-nav button[data-action="today"]').click();
    assert.equal(await page.locator('.calendar-month-day[data-today="true"]').count(), 1);
    console.log('PASS calendar month: default 6x7, cross-week bars, no-start, drawer, navigation, overflow');

    // 原时间轴仍覆盖月/周刻度、背景带、里程碑和抽屉。
    await seg('时间轴').click();
    await page.locator('.calendar-grid[data-mode="month"]').waitFor();
    assert.equal(await page.locator('.calendar-month-view').count(), 0);
    assert.equal(await page.locator('.calendar-lane[data-no-start="true"] .calendar-bar').count(), 0);
    const monthTicks = await page.locator('[data-tick="month"]').allTextContents();
    assert.ok(monthTicks.every(text => /^(?:\d{4}年)?\d{1,2}月$/.test(text.trim())), `month tick labels: ${monthTicks}`);
    const trackCount = await page.locator('.calendar-track').count();
    assert.equal(await page.locator('.calendar-band').count(), trackCount * 2, 'two segments paint every track');
    assert.equal(await page.locator('.calendar-band[data-kind="semester"]').count(), trackCount);
    assert.equal(await page.locator('.calendar-band[data-kind="vacation"]').count(), trackCount);
    assert.equal(await page.locator('[data-milestone-id="e2e-outside"]').count(), 0);
    const openGeometry = await page.locator('.calendar-bar[data-open-ended="true"]').evaluate(bar => {
      const track = bar.parentElement.getBoundingClientRect();
      const rect = bar.getBoundingClientRect();
      const line = document.querySelector('.calendar-today-layer .calendar-today-line').getBoundingClientRect();
      const days = Number(document.querySelector('.calendar-grid').dataset.axisDays);
      return { halfDay: track.width / days / 2, delta: rect.right - (line.left + line.width / 2) };
    });
    assert.ok(Math.abs(openGeometry.delta - openGeometry.halfDay) < 3, 'open-ended bar reaches the end of today');
    await captureTimeline('timeline-month-1440', 1440, 1000);

    await page.locator('.calendar-mode button[data-mode="week"]').click();
    await page.locator('.calendar-grid[data-mode="week"]').waitFor();
    assert.equal(await page.locator('[data-tick="week"]').count(), 8);
    const weekTicks = await page.locator('[data-tick="week"]').allTextContents();
    assert.ok(weekTicks.every(text => /^\d{1,2}\/\d{1,2}$/.test(text.trim())), `week tick labels: ${weekTicks}`);
    const visuals = await page.evaluate(() => {
      const probe = document.createElement('span');
      probe.style.color = 'var(--blue)';
      document.body.append(probe);
      const blue = getComputedStyle(probe).color;
      probe.remove();
      const line = getComputedStyle(document.querySelector('.calendar-today-layer .calendar-today-line'));
      const label = getComputedStyle(document.querySelector('.calendar-today-layer .calendar-today-line span'));
      const gate = getComputedStyle(document.querySelector('[data-milestone-id="e2e-gate"] > span'));
      const dot = getComputedStyle(document.querySelector('[data-milestone-id="e2e-passed"] > span'));
      return { blue, line: line.borderLeftColor, label: label.color, gateTransform: gate.transform, dotTransform: dot.transform, dotRadius: dot.borderTopLeftRadius };
    });
    assert.equal(visuals.line, visuals.blue);
    assert.equal(visuals.label, visuals.blue);
    assert.notEqual(visuals.gateTransform, 'none');
    assert.equal(visuals.dotTransform, 'none');
    assert.notEqual(visuals.dotRadius, '0px');
    await captureTimeline('timeline-week-1440', 1440, 1000);

    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('.console-sidebar').getByRole('button', { name: '日历', exact: true }).click();
    await page.locator('.calendar-grid-wrap').waitFor();
    assert.equal(await seg('时间轴').getAttribute('aria-pressed'), 'true', 'timeline survives reload');
    await page.locator('[data-milestone-id="e2e-gate"]').click();
    await drawer.waitFor();
    assert.match(await drawer.getByRole('heading').innerText(), /里程碑 · E2E门/);
    assert.match(await drawer.innerText(), /E2E 日历赛季/);
    await page.keyboard.press('Escape');
    await drawer.waitFor({ state: 'hidden' });
    await page.locator('.calendar-bar[data-open-ended="true"]').click();
    await drawer.waitFor();
    assert.match(await drawer.getByRole('heading').innerText(), /E2E进行中项目/);
    assert.match(await drawer.innerText(), /至今/);
    assert.equal(await drawer.getByRole('button', { name: '去设置页编辑', exact: true }).count(), 1);
    await page.keyboard.press('Escape');
    await drawer.waitFor({ state: 'hidden' });
    await captureTimeline('timeline-1000', 1000, 900);

    await seg('月视图').click();
    await page.locator('.calendar-month-view').waitFor();
    assert.equal(await page.locator('.calendar-month-day').count(), 42);
    const monthGrid = await page.locator('.calendar-month-view').evaluate(element => ({ client: element.clientWidth, scroll: element.scrollWidth }));
    assert.ok(monthGrid.scroll <= monthGrid.client + 1, `month grid overflow: ${monthGrid.client}/${monthGrid.scroll}`);
    await capture('month-1000');
    assert.deepEqual(errors, [], 'calendar has no browser errors');
    console.log(`PASS calendar: month grid, navigation, persistence, overlap, timeline, drawers, 1000px overflow; screenshots ${shots}`);
  } finally {
    if (browser) await browser.close();
    if (child && child.exitCode === null) {
      const exited = new Promise(resolve => child.once('exit', resolve));
      child.kill(); await exited;
    }
    rmSync(dir, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exit(1); });
