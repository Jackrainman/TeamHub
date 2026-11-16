// P1 右栏槽位：三列过渡、焦点/持久化、响应式收起与赛季表单像素边界。
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
  const dir = mkdtempSync(path.join(tmpdir(), 'teamhub-right-rail-e2e-'));
  const shots = process.env.E2E_SHOTS || path.join(dir, 'shots');
  mkdirSync(shots, { recursive: true });
  const dbFile = path.join(dir, 'right-rail.sqlite');
  const { openUnifiedDb } = await import(pathToFileURL(path.join(root, 'hub-server/dist/store/sqlite-unified.js')));
  const db = openUnifiedDb(dbFile);
  db.initialize({ dataMode: 'demo', identityMode: 'anonymous' }, new Date('2026-10-29T00:00:00Z'));
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
      if (child.exitCode !== null || i > 100) throw new Error('test server failed to start');
      try { if ((await fetch(`${base}/health`)).ok) break; } catch {}
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    browser = await chromium.launch({ channel: process.env.E2E_BROWSER_CHANNEL || undefined });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    page = await context.newPage();
    page.setDefaultTimeout(10000);
    page.on('pageerror', error => errors.push(String(error)));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    const rail = page.locator('#console-right-rail');
    const toggle = page.locator('#console-rail-toggle');
    const content = page.locator('.console-content');
    const assertNoOverflow = async label => {
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false, `overflow: ${label}`);
    };
    const capture = async name => {
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(shots, `${name}.png`), fullPage: false });
      await assertNoOverflow(name);
    };
    const openRail = async () => {
      await toggle.click();
      await page.waitForTimeout(400);
      assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
    };

    await page.goto(base, { waitUntil: 'networkidle' });
    await page.locator('.console-sidebar').getByRole('button', { name: '设置', exact: true }).click();
    await page.locator('main[data-page="settings"]').waitFor();
    await page.waitForLoadState('networkidle');

    assert.equal(await rail.getAttribute('aria-hidden'), 'true');
    assert.equal(await rail.evaluate(el => getComputedStyle(el).visibility), 'hidden');
    assert.equal(await rail.locator('.task-rail').count(), 1);
    assert.equal(await rail.locator('.task-rail').isVisible(), false);
    assert.equal(await rail.getByLabel('清单状态', { exact: true }).inputValue(), 'active');
    assert.equal(await toggle.isVisible(), true);
    const contentW0 = (await content.boundingBox()).width;
    await capture('p1-01-rail-closed-1440');

    await openRail();
    const innerW = (await page.locator('.console-right-rail__inner').boundingBox()).width;
    assert.ok(innerW >= 319 && innerW <= 321, `rail inner width: ${innerW}`);
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), '收起任务栏');
    assert.equal(await rail.locator('.task-rail').isVisible(), true);
    assert.equal(await rail.locator('.task-rail .empty-state').count(), 0);
    const contentW1 = (await content.boundingBox()).width;
    assert.ok(Math.abs(contentW1 - (contentW0 - 320)) <= 1, `content width ${contentW0} -> ${contentW1}`);
    await capture('p1-02-rail-open-1440');

    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    assert.equal(await rail.getAttribute('aria-hidden'), 'true');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'console-rail-toggle');
    assert.equal(await page.evaluate(() => localStorage.getItem('teamhub.rightRailOpen')), 'false');

    await openRail();
    assert.equal(await page.evaluate(() => localStorage.getItem('teamhub.rightRailOpen')), 'true');
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('.console-shell').waitFor();
    assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
    await capture('p1-06-rail-reload');

    await page.locator('.console-sidebar').getByRole('button', { name: '设置', exact: true }).click();
    await page.locator('main[data-page="settings"]').waitFor();
    await page.waitForLoadState('networkidle');
    const fields = page.locator('main[data-page="settings"] form.pm-form .pm-form__grid--3 input');
    await fields.first().waitFor();
    assert.equal(await fields.count(), 3);
    await fields.last().scrollIntoViewIfNeeded();
    const geometry = await page.evaluate(() => ({
      inputs: [...document.querySelectorAll('main[data-page="settings"] form.pm-form .pm-form__grid--3 input')].map(el => {
        const r = el.getBoundingClientRect();
        return { width: r.width, height: r.height, left: r.left, right: r.right };
      }),
      rail: (() => { const r = document.querySelector('#console-right-rail').getBoundingClientRect(); return { left: r.left, right: r.right }; })(),
    }));
    writeFileSync(path.join(shots, 'season-input-geometry.json'), JSON.stringify(geometry, null, 2));
    assert.ok(geometry.inputs.every(input => input.right <= geometry.rail.left + 1), 'season inputs do not overlap rail');
    await capture('p1-03-rail-settings-form');

    const previousTheme = await page.evaluate(() => document.documentElement.dataset.theme || 'light');
    await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
    await capture('p1-05-rail-dark-1440');
    await page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, previousTheme);

    await page.setViewportSize({ width: 1100, height: 900 });
    await page.waitForTimeout(400);
    assert.equal(await rail.evaluate(el => getComputedStyle(el).display), 'none');
    assert.equal(await toggle.isVisible(), false);
    const narrowLayout = await page.evaluate(() => {
      const contentRect = document.querySelector('.console-content').getBoundingClientRect();
      const shellRect = document.querySelector('.console-shell').getBoundingClientRect();
      return { contentRight: contentRect.right, shellRight: shellRect.right };
    });
    assert.ok(Math.abs(narrowLayout.contentRight - narrowLayout.shellRight) <= 1, 'narrow content reclaims rail track');
    await capture('p1-04-rail-1100');

    for (const width of [1200, 1280, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForTimeout(400);
      await assertNoOverflow(`rail-${width}`);
    }
    assert.deepEqual(errors, []);
    console.log(`PASS right rail: transition, focus/Escape, persistence, responsive layout, season form; screenshots ${shots}`);
  } catch (error) {
    if (page) {
      await page.screenshot({ path: path.join(shots, 'right-rail-failure.png'), fullPage: true });
      console.error(await page.locator('body').innerText());
    }
    throw error;
  } finally {
    await browser?.close();
    if (child && child.exitCode === null) {
      const exited = new Promise(resolve => child.once('exit', resolve));
      child.kill();
      await exited;
    }
    rmSync(dir, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
