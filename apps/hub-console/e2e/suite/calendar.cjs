// Real SQLite + real browser acceptance for the read-only project calendar.
const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const { mkdtempSync, mkdirSync, rmSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const assert = require('node:assert/strict');
const { freePort } = require('./lib/free-port.cjs');

(async () => {
  const root = path.resolve(__dirname, '../../..');
  const dir = mkdtempSync(path.join(os.tmpdir(), 'teamhub-calendar-e2e-'));
  const shots = process.env.E2E_SHOTS || path.join(os.tmpdir(), 'p3b-shots');
  mkdirSync(shots, { recursive: true });
  const dbFile = path.join(dir, 'calendar.sqlite');
  const { openUnifiedDb } = await import(pathToFileURL(path.join(root, 'hub-server/dist/store/sqlite-unified.js')));
  const now = new Date();
  const at = days => new Date(now.getTime() + days * 86400000).toISOString();
  const db = openUnifiedDb(dbFile);
  db.initialize({ dataMode: 'real', identityMode: 'anonymous' }, now);
  const stores = db.openStores();
  const season = await stores.gov.createSeason({ name: 'E2E 日历赛季', startsAt: at(-8), endsAt: at(45) });
  const ongoing = await stores.gov.createProject({ name: 'E2E进行中项目', startsAt: at(-3), endsAt: null });
  const finished = await stores.gov.createProject({ name: 'E2E跨周项目', startsAt: at(-2), endsAt: at(3) });
  await stores.gov.createProject({ name: 'E2E未定开始', startsAt: null, endsAt: null });
  assert.ok(ongoing.ok && finished.ok);
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
    page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' })).newPage();
    page.setDefaultTimeout(10000);
    page.on('pageerror', error => errors.push(String(error)));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.locator('.console-sidebar').getByRole('button', { name: '日历', exact: true }).click();
    await page.locator('.calendar-page').waitFor();
    await page.locator('.calendar-bar').first().waitFor();

    async function capture(name, width, height) {
      await page.setViewportSize({ width, height });
      await page.waitForTimeout(100);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2), true, `overflow: ${name}`);
      const wrap = await page.locator('.calendar-grid-wrap').evaluate(element => ({ client: element.clientWidth, scroll: element.scrollWidth }));
      assert.ok(wrap.scroll <= wrap.client + 1, `calendar grid overflow: ${name}: ${wrap.client}/${wrap.scroll}`);
      console.log(`calendar wrap ${name}: client=${wrap.client} scroll=${wrap.scroll}`);
      await page.screenshot({ path: path.join(shots, `${name}.png`), fullPage: true, animations: 'disabled' });
    }

    // 月视图：两个项目有横条，无开始日期项目保留行但不画条。
    assert.equal(await page.locator('.calendar-bar').count(), 2);
    assert.equal(await page.locator('.calendar-lane[data-no-start="true"] .calendar-bar').count(), 0);
    assert.equal(await page.locator('.calendar-bar-arrow').count(), 0);
    const monthTicks = await page.locator('[data-tick="month"]').allTextContents();
    assert.ok(monthTicks.every(text => /^(?:\d{4}年)?\d{1,2}月$/.test(text.trim())), `month tick labels: ${monthTicks}`);
    const bandCount = await page.locator('.calendar-band').count();
    assert.equal(bandCount, 10, 'two segments paint each of five tracks');
    assert.equal(await page.locator('.calendar-band[data-kind="semester"]').count(), 5);
    assert.equal(await page.locator('.calendar-band[data-kind="vacation"]').count(), 5);
    console.log(`calendar bands month: total=${bandCount} semester=5 vacation=5`);
    const openGeometry = await page.locator('.calendar-bar[data-open-ended="true"]').evaluate(bar => {
      const track = bar.parentElement.getBoundingClientRect();
      const rect = bar.getBoundingClientRect();
      const line = document.querySelector('.calendar-today-layer .calendar-today-line').getBoundingClientRect();
      const days = Number(document.querySelector('.calendar-grid').dataset.axisDays);
      return { halfDay: track.width / days / 2, delta: rect.right - (line.left + line.width / 2) };
    });
    assert.ok(Math.abs(openGeometry.delta - openGeometry.halfDay) < 3, 'open-ended bar reaches the end of today');
    await capture('p3b-01-month-1440', 1440, 1000);

    await page.locator('.calendar-mode button[data-mode="week"]').click();
    await page.locator('.calendar-grid[data-mode="week"]').waitFor();
    assert.equal(await page.locator('[data-tick="week"]').count(), 8);
    const weekTicks = await page.locator('[data-tick="week"]').allTextContents();
    assert.ok(weekTicks.every(text => /^\d{1,2}\/\d{1,2}$/.test(text.trim())), `week tick labels: ${weekTicks}`);
    assert.equal(await page.locator('[data-milestone-id="e2e-outside"]').count(), 0);
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
    assert.equal(visuals.line, visuals.blue, 'today line uses blue');
    assert.equal(visuals.label, visuals.blue, 'today label uses blue');
    assert.notEqual(visuals.gateTransform, 'none', 'gate is rotated into a diamond');
    assert.equal(visuals.dotTransform, 'none', 'milestone is not rotated');
    assert.notEqual(visuals.dotRadius, '0px', 'milestone is a round dot');
    console.log(`calendar visuals: today=${visuals.line} gate=${visuals.gateTransform} dotRadius=${visuals.dotRadius}`);
    await capture('p3b-02-week-1440', 1440, 1000);

    await page.locator('.calendar-mode button[data-mode="month"]').click();
    await page.locator('.calendar-grid[data-mode="month"]').waitFor();
    await capture('p3b-03-month-1000', 1000, 900);
    assert.ok(await page.locator('[data-tick="month"]').count() >= 2, 'active season spans at least two month ticks');
    await page.locator('.calendar-mode button[data-mode="week"]').click();
    await page.locator('.calendar-grid[data-mode="week"]').waitFor();
    assert.equal(await page.locator('[data-tick="week"]').count(), 8);
    await capture('p3b-04-week-1000', 1000, 900);

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.locator('[data-milestone-id="e2e-gate"]').click();
    const drawer = page.getByRole('dialog');
    await drawer.waitFor();
    assert.match(await drawer.getByRole('heading').innerText(), /里程碑 · E2E门/);
    assert.match(await drawer.innerText(), /E2E门/);
    assert.match(await drawer.innerText(), /E2E 日历赛季/);
    await page.screenshot({ path: path.join(shots, 'p3b-05-drawer-milestone.png'), fullPage: true, animations: 'disabled' });
    await page.keyboard.press('Escape');
    await drawer.waitFor({ state: 'hidden' });

    await page.locator('.calendar-bar[data-open-ended="true"]').click();
    await drawer.waitFor();
    assert.match(await drawer.getByRole('heading').innerText(), /E2E进行中项目/);
    assert.match(await drawer.innerText(), /至今/);
    assert.equal(await drawer.getByRole('button', { name: '去设置页编辑', exact: true }).count(), 1);
    await page.screenshot({ path: path.join(shots, 'p3b-06-drawer-project.png'), fullPage: true, animations: 'disabled' });
    await page.keyboard.press('Escape');
    await drawer.waitFor({ state: 'hidden' });
    assert.deepEqual(errors, [], 'calendar has no browser errors');
    console.log(`PASS calendar: month/week, lanes, milestones, drawers, 1000px overflow; screenshots ${shots}`);
  } finally {
    if (browser) await browser.close();
    if (child && child.exitCode === null) {
      const exited = new Promise(resolve => child.once('exit', resolve));
      child.kill(); await exited;
    }
    rmSync(dir, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exit(1); });
