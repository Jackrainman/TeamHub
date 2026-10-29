// 真实生产包：页面请求时机、慢网反馈、失败隔离及刷新恢复。
const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const { mkdtempSync, rmSync, readFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const assert = require('node:assert/strict');
const { gzipSync } = require('node:zlib');

(async () => {
  const root = path.resolve(__dirname, '../../..');
  const dist = path.resolve(__dirname, '../../dist');
  const report = JSON.parse(readFileSync(path.join(dist, 'bundle-report.json'), 'utf8'));
  // 报告必须对应写盘后的最终字节，避免统计到 preload 改写前的中间产物。
  let raw = 0, gzip = 0;
  for (const file of report.initial.files) {
    const bytes = readFileSync(path.join(dist, file));
    raw += bytes.length; gzip += gzipSync(bytes).length;
  }
  assert.equal(report.initial.raw, raw);
  assert.equal(report.initial.gzip, gzip);
  const dir = mkdtempSync(path.join(tmpdir(), 'teamhub-lazy-e2e-'));
  const dbFile = path.join(dir, 'lazy.sqlite');
  let child, browser;
  try {
    const { openUnifiedDb } = await import(pathToFileURL(path.join(root, 'hub-server/dist/store/sqlite-unified.js')));
    const db = openUnifiedDb(dbFile);
    db.initialize({ dataMode: 'demo', identityMode: 'anonymous' }, new Date('2026-10-29T00:00:00Z'));
    db.close();
    const port = await new Promise(resolve => {
      const server = require('node:net').createServer();
      server.listen(0, '127.0.0.1', () => { const p = server.address().port; server.close(() => resolve(p)); });
    });
    const base = `http://127.0.0.1:${port}`;
    child = spawn(process.execPath, [path.join(root, 'hub-server/dist/main.js')], {
      windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'],
      env: { ...process.env, HUB_HOST: '127.0.0.1', HUB_PORT: String(port), TEAMHUB_DB_FILE: dbFile, TEAMHUB_CONSOLE_DIST_DIR: dist },
    });
    child.stderr.on('data', data => process.stderr.write(data));
    for (let i = 0; ; i++) {
      if (child.exitCode !== null || i > 100) throw new Error('test server failed to start');
      try { if ((await fetch(`${base}/health`)).ok) break; } catch {}
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    browser = await chromium.launch({ channel: process.env.E2E_BROWSER_CHANNEL || undefined });
    const context = await browser.newContext();
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    const requested = [], errors = [];
    page.on('request', request => requested.push(request.url()));
    page.on('pageerror', error => errors.push(String(error)));
    const nav = label => page.locator('.console-sidebar').getByRole('button', { name: label, exact: true });
    await page.goto(base, { waitUntil: 'networkidle' });
    assert.ok(requested.some(url => /\/WorkbenchPage-[^/]+\.js$/.test(url)), 'home page loaded');
    assert.deepEqual(requested.filter(url => /\/(?:\w+Page|SetupWizard|BootstrapGate)-[^/]+\.js$/.test(url))
      .filter(url => !/\/WorkbenchPage-/.test(url)), [], 'other pages are not fetched at startup');
    assert.equal(requested.some(url => /\/(?:pdf-|pdf\.worker|DepGraphPage-)/.test(url)), false);

    let releaseSettings;
    const delayedSettings = new Promise(resolve => { releaseSettings = resolve; });
    await page.route('**/SettingsPage-*.js', async route => { await delayedSettings; await route.continue(); });
    await nav('设置').click();
    await page.getByRole('status').filter({ hasText: '正在加载页面' }).waitFor();
    await nav('本周').click();
    await page.locator('main[data-page="workbench"] .week-workspace').waitFor();
    releaseSettings();
    await nav('设置').click();
    await page.waitForLoadState('networkidle');
    await page.getByRole('status').filter({ hasText: '正在加载页面' }).waitFor({ state: 'hidden' });
    assert.ok(requested.some(url => /\/SettingsPage-[^/]+\.js$/.test(url)));

    const pages = [
      ['队伍近况', 'feed', 'TeamFeedPage'], ['项目', 'project', 'ProjectPage'],
      ['知识库', 'knowledge', 'KbSearchPage'], ['库存与 BOM', 'inv', 'InvPage'], ['报销', 'reimburse', 'ReimbursePage'],
      ['总览', 'overview', 'OverviewPage'], ['每日在场', 'schedule', 'SchedulePage'],
      ['图纸档案', 'archive', 'ArchivePage'], ['机器人清单', 'fleet', 'ResourcesPage'],
      ['学习方向', 'direction', 'DirectionPage'], ['时间线', 'timeline', 'TimelineEditorPage'],
    ];
    await nav('更多').click();
    for (const [label, key, module] of pages) {
      assert.equal(requested.some(url => url.includes(`/${module}-`)), false, `${key} stays deferred until selected`);
      await nav(label).click();
      await page.locator(`main[data-page="${key}"]`).waitFor();
      await page.waitForLoadState('networkidle');
      await page.getByRole('status').filter({ hasText: '正在加载页面' }).waitFor({ state: 'hidden' });
      assert.ok(requested.some(url => url.includes(`/${module}-`)), `${key} loaded on navigation`);
      assert.equal(await page.getByRole('alert').filter({ hasText: '页面暂时无法打开' }).count(), 0);
    }
    assert.deepEqual(errors, []);

    // 使用新上下文避免模块缓存掩盖网络失败；只在这个场景主动阻断页面文件。
    const failedContext = await browser.newContext();
    const failedPage = await failedContext.newPage();
    failedPage.setDefaultTimeout(10000);
    const settingsRoute = '**/SettingsPage-*.js';
    await failedPage.route(settingsRoute, route => route.abort());
    await failedPage.goto(base, { waitUntil: 'networkidle' });
    const failedNav = label => failedPage.locator('.console-sidebar').getByRole('button', { name: label, exact: true });
    await failedNav('设置').click();
    await failedPage.getByRole('alert').filter({ hasText: '页面暂时无法打开' }).waitFor();
    await failedNav('本周').click();
    await failedPage.locator('main[data-page="workbench"] .week-workspace').waitFor();
    await failedNav('设置').click();
    await failedPage.unroute(settingsRoute);
    await Promise.all([
      failedPage.waitForNavigation({ waitUntil: 'networkidle' }),
      failedPage.getByRole('button', { name: '刷新页面', exact: true }).click(),
    ]);
    await failedNav('设置').click();
    await failedPage.waitForLoadState('networkidle');
    await failedPage.getByRole('status').filter({ hasText: '正在加载页面' }).waitFor({ state: 'hidden' });
    assert.equal(await failedPage.getByRole('alert').filter({ hasText: '页面暂时无法打开' }).count(), 0);
    console.log(`PASS lazy pages: 13 routes, deferred requests, slow/failing chunk recovery; initial JS ${raw} bytes / gzip ${gzip}`);
  } finally {
    await browser?.close();
    if (child && child.exitCode === null) {
      const exited = new Promise(resolve => child.once('exit', resolve));
      child.kill(); await exited;
    }
    rmSync(dir, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
