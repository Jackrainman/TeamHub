/**
 * TeamHub console 端到端体检（E2E smoke）。
 *
 * 用真实浏览器（Playwright + 缓存 chromium）逐页点过侧栏 8 个导航项，
 * 对每页：截图 + 抓控制台/页面错误 + 量正文长度（白屏哨兵）。任一页报错或白屏 → 退出码 1。
 *
 * 不依赖外部项目（历史上曾借 ~/feiyue-test 的 playwright，已收口为本包 devDependency）。
 *
 * 用法：
 *   npm run health-check                       # 默认打 http://localhost:4177（start-teamhub.sh 单端口）
 *   TEAMHUB_BASE=http://host:4177 npm run health-check
 *   HEALTH_OUT=~/shots npm run health-check    # 自定义截图落点（默认系统临时目录）
 *
 * 前置：start-teamhub.sh 已起服务；浏览器二进制在 ~/.cache/ms-playwright（pin playwright@1.61.0 对应 chromium-1228）。
 */
const { chromium } = require('playwright');
const { mkdirSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const BASE = process.env.TEAMHUB_BASE || 'http://localhost:4177';
const OUT = process.env.HEALTH_OUT || path.join(os.tmpdir(), 'teamhub-health-shots');
const MIN_BODY = 80; // 正文短于此判为疑似白屏

(async () => {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();

  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('[console] ' + m.text().slice(0, 240)); });
  page.on('pageerror', (e) => errors.push('[pageerror] ' + String(e).slice(0, 240)));

  console.log(`[health] 打开 ${BASE}`);
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);

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

  // 额外覆盖：项目页「挂单池」子视图（TASK-POST-CLAIM，D-088）——它是项目页内的 tab、非独立 .nav-item，
  // 主循环点不到。逐个点 nav-item 直到挂单池 tab 出现，再点开它做同款截图 + 白屏/报错哨兵。
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
    await page.screenshot({ path: path.join(OUT, `${String(navCount).padStart(2, '0')}-挂单池.png`), fullPage: true });
    const newErrs = errors.slice(poolBefore);
    const blank = bodyLen < MIN_BODY;
    rows.push({ label: '挂单池', bodyLen, blank, errs: newErrs.length });
    console.log(`  [${blank || newErrs.length ? 'FAIL' : ' ok '}] 挂单池  bodyLen=${bodyLen}  errs=${newErrs.length}`);
  } else {
    console.log('[health] 未找到挂单池 tab（跳过额外覆盖）');
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
