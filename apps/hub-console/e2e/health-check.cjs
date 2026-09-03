/**
 * TeamHub console 端到端体检（E2E smoke）。
 *
 * 用真实浏览器（Playwright + 缓存 chromium）逐页点过侧栏 8 个导航项，
 * 对每页：截图 + 抓控制台/页面错误 + 量正文长度（白屏哨兵）。任一页报错或白屏 → 退出码 1。
 *
 * 不依赖外部项目（历史上曾借 ~/feiyue-test 的 playwright，已收口为本包 devDependency）。
 *
 * 装置前置：server 在 SQLite app_settings **不存在**时进 setup 模式、只渲染首启动向导
 * （正常 10 页不挂）。故本脚本两种用法各需对应的起服前置：
 *   1. 常规 10 页体检（默认 HEALTH_EXPECT=normal）：使用已初始化 app_settings 的 SQLite，server 进正常模式再打。
 *      检测到向导 = 前置没做好，直接 fail-fast 报明。
 *   2. 向导渲染用例（HEALTH_EXPECT=wizard）：使用全新空 SQLite，server 进
 *      setup 模式；本脚本断言全屏向导 + 两张大卡渲染、无报错 / 白屏。
 * server 生命周期与 app_settings 初始化由起服方负责（本脚本只连 BASE，沿脚本一贯的"外部起服"模型）。
 *
 * 用法：
 *   npm run health-check                                   # 默认打 http://localhost:4177，断言正常 10 页
 *   TEAMHUB_BASE=http://host:4177 npm run health-check
 *   HEALTH_EXPECT=wizard npm run health-check              # 断言首启动向导渲染（起服须用空 SQLite）
 *   HEALTH_OUT=~/shots npm run health-check                # 自定义截图落点（默认系统临时目录）
 *
 * 前置：start-teamhub.sh 已起服务；浏览器二进制在 ~/.cache/ms-playwright（pin playwright@1.61.0 对应 chromium-1228）。
 */
const { chromium } = require('playwright');
const { mkdirSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const BASE = process.env.TEAMHUB_BASE || 'http://localhost:4177';
const OUT = process.env.HEALTH_OUT || path.join(os.tmpdir(), 'teamhub-health-shots');
const EXPECT = process.env.HEALTH_EXPECT === 'wizard' ? 'wizard' : 'normal';
const MIN_BODY = 80; // 正文短于此判为疑似白屏

(async () => {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();

  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('[console] ' + m.text().slice(0, 240)); });
  page.on('pageerror', (e) => errors.push('[pageerror] ' + String(e).slice(0, 240)));

  console.log(`[health] 打开 ${BASE}（期望：${EXPECT === 'wizard' ? '首启动向导' : '正常 10 页'}）`);
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);

  // 两态判别（SETUP-WIZARD 刀②）：全屏向导有 `.setup-wizard` 根、正常 app 有侧栏 `.nav-item`。
  const wizardPresent = (await page.locator('.setup-wizard').count()) > 0;

  // ── 向导渲染用例（HEALTH_EXPECT=wizard）：断言全屏向导 + 两张大卡，无报错 / 白屏 ──────────────
  if (EXPECT === 'wizard') {
    const cardCount = await page.locator('.setup-card').count();
    const bodyLen = await page.evaluate(
      () => document.querySelector('main, .console-main, #root')?.innerText.trim().length || 0,
    );
    await page.screenshot({ path: path.join(OUT, 'setup-wizard.png'), fullPage: true });
    await browser.close();

    const problems = [];
    if (!wizardPresent) problems.push('未渲染首启动向导（.setup-wizard 缺失）——SQLite 是否已存在 app_settings？');
    if (cardCount !== 2) problems.push(`大卡数应为 2，实际 ${cardCount}（先试试 / 直接安装）`);
    if (bodyLen < MIN_BODY) problems.push(`疑似白屏（bodyLen=${bodyLen}）`);
    if (errors.length) problems.push(...[...new Set(errors)].map((e) => '报错：' + e));

    const failed = problems.length > 0;
    console.log(`\n[health] 截图：${OUT}`);
    problems.forEach((p) => console.log('  ✗ ' + p));
    console.log(`\n[health] ${failed ? '✗ FAIL' : '✓ PASS'} — 首启动向导（大卡 ${cardCount}，bodyLen=${bodyLen}，${errors.length} 报错）`);
    process.exit(failed ? 1 : 0);
    return;
  }

  // ── 常规 10 页体检：起服须已有 app_settings（正常模式）。检测到向导 = 前置没做好，fail-fast ──────
  if (wizardPresent) {
    await browser.close();
    console.error('[health] ✗ FAIL — server 处于 setup 模式（渲染的是首启动向导）。');
    console.error('  常规体检前须先通过 setup API 在 SQLite 写入合法 app_settings，让 server 进正常模式。');
    console.error('  或用 HEALTH_EXPECT=wizard 显式断言向导渲染。');
    process.exit(1);
    return;
  }

  const navCount = await page.locator('.nav-item').count();
  console.log(`[health] 导航项 ${navCount} 个`);

  const rows = [];
  for (let i = 0; i < navCount; i++) {
    const before = errors.length;
    await page.locator('.nav-item').nth(i).click();
    await page.waitForTimeout(700);
    const label = (await page.locator('.nav-item').nth(i).innerText()).trim().replace(/\s+/g, '');
    const bodyLen = await page.evaluate(
      () => document.querySelector('main, .console-main, #root')?.innerText.trim().length || 0,
    );
    await page.screenshot({ path: path.join(OUT, `${String(i).padStart(2, '0')}-${label}.png`), fullPage: true });
    const newErrs = errors.slice(before);
    const blank = bodyLen < MIN_BODY;
    rows.push({ label, bodyLen, blank, errs: newErrs.length });
    console.log(`  [${blank || newErrs.length ? 'FAIL' : ' ok '}] ${label}  bodyLen=${bodyLen}  errs=${newErrs.length}`);
  }

  // 额外覆盖：项目页「领任务」子视图（TASK-POST-CLAIM，D-088）——它是项目页内的 tab、非独立 .nav-item，
  // 主循环点不到。逐个点 nav-item 直到领任务 tab 出现，再点开它做同款截图 + 白屏/报错哨兵。
  const poolBefore = errors.length;
  for (let i = 0; i < navCount; i++) {
    await page.locator('.nav-item').nth(i).click();
    await page.waitForTimeout(300);
    if (await page.locator('#project-view-pool-btn').count()) break;
  }
  if (await page.locator('#project-view-pool-btn').count()) {
    await page.locator('#project-view-pool-btn').click();
    await page.waitForTimeout(800);
    const bodyLen = await page.evaluate(
      () => document.querySelector('main, .console-main, #root')?.innerText.trim().length || 0,
    );
    await page.screenshot({ path: path.join(OUT, `${String(navCount).padStart(2, '0')}-领任务.png`), fullPage: true });
    const newErrs = errors.slice(poolBefore);
    const blank = bodyLen < MIN_BODY;
    rows.push({ label: '领任务', bodyLen, blank, errs: newErrs.length });
    console.log(`  [${blank || newErrs.length ? 'FAIL' : ' ok '}] 领任务  bodyLen=${bodyLen}  errs=${newErrs.length}`);
  } else {
    console.log('[health] 未找到领任务 tab（跳过额外覆盖）');
  }

  await browser.close();

  const blanks = rows.filter((r) => r.blank);
  const failed = errors.length > 0 || blanks.length > 0;
  console.log(`\n[health] 截图：${OUT}`);
  if (errors.length) {
    console.log('[health] 错误：');
    [...new Set(errors)].forEach((e) => console.log('  ' + e));
  }
  if (blanks.length) console.log('[health] 疑似白屏：' + blanks.map((b) => b.label).join(', '));
  console.log(`\n[health] ${failed ? '✗ FAIL' : '✓ PASS'} — ${rows.length} 页，${errors.length} 错误，${blanks.length} 白屏`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error('[health] 运行失败：', e);
  process.exit(2);
});
