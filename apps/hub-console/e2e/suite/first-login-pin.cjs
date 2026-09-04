/**
 * E2E 场景：全新成员首登强制设密码（VERIFY-SCRIPT-UPGRADE ①）。
 *
 * 复现链路（v0.73.1 首登死锁 BUG-IDX-DEADLOCK 的端到端兜底——后端单测测不出「前端启动闸 ×
 * PIN 闸打架」这种前后端串联问题）：
 *   登录（无密码）→ 整屏 ForcePinGate 拦住 → 设置 ≥8 位密码 → 进入应用（侧栏导航渲染）。
 *
 * 与 health-check.cjs 的「外部起服」模型不同，本场景对数据库状态有强要求（身份模式 + 名册里
 * 有无 PIN 新成员），故**自备服务端生命周期**：临时 SQLite 起服 → setup/init 初始化（进程退 42
 * 后自动重启正常模式）→ bootstrap 首个管理员 → 管理员 API 导入一名无 PIN 新成员 → 浏览器开打。
 *
 * 前置：hub-server 与 hub-console 均已 build（需要 ../hub-server/dist/main.js 与 ./dist 静态站）；
 * 浏览器二进制在 ~/.cache/ms-playwright（pin playwright@1.61.0）。npm script test:e2e 已串好构建。
 *
 * 用法：
 *   npm run test:e2e                 # 构建依赖后跑本场景
 *   E2E_PORT=5001 node e2e/suite/first-login-pin.cjs
 *   E2E_KEEP=1 node ...              # 保留临时数据目录与截图（排查用）
 */
const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const { mkdtempSync, rmSync, existsSync, mkdirSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PORT = Number(process.env.E2E_PORT || 4977);
const BASE = `http://127.0.0.1:${PORT}`;
const CONSOLE_DIR = path.resolve(__dirname, '../..');
const SERVER_MAIN = path.resolve(CONSOLE_DIR, '../hub-server/dist/main.js');
const CONSOLE_DIST = path.join(CONSOLE_DIR, 'dist');
const KEEP = process.env.E2E_KEEP === '1';

const ADMIN = { name: '队长', pin: 'admin12345' };
const NEWBIE = { name: '新人甲', pin: 'newpin5678' };

function fail(msg) {
  console.error(`[e2e:first-login] ✗ ${msg}`);
  process.exitCode = 1;
}

async function waitUp(timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const res = await fetch(`${BASE}/api/setup/state`);
      if (res.status < 500) return res;
    } catch { /* 还没起来 */ }
    if (Date.now() > deadline) throw new Error(`server ${BASE} 等待超时`);
    await new Promise((r) => setTimeout(r, 400));
  }
}

/** 起服；setup/init 会退 42 触发重启，这里捕获后自动再起一次（与 start 脚本/compose 同语义）。 */
function startServer(dbFile) {
  return new Promise((resolve, reject) => {
    const env = {
      ...process.env,
      HUB_HOST: '127.0.0.1',
      HUB_PORT: String(PORT),
      TEAMHUB_DB_FILE: dbFile,
      TEAMHUB_CONSOLE_DIST_DIR: CONSOLE_DIST,
    };
    let child = spawn(process.execPath, [SERVER_MAIN], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stderr.on('data', (d) => process.stderr.write(`[server] ${d}`));
    child.on('exit', (code) => {
      if (code === 42) {
        child = spawn(process.execPath, [SERVER_MAIN], { env, stdio: ['ignore', 'pipe', 'pipe'] });
        child.stderr.on('data', (d) => process.stderr.write(`[server] ${d}`));
        resolve(kill); // 重启后由 waitUp 确认就绪
        return;
      }
      reject(new Error(`server 意外退出 code=${code}`));
    });
    waitUp()
      .then(() => resolve(kill))
      .catch(reject);
    function kill() {
      try { child.kill('SIGTERM'); } catch { /* 已退 */ }
    }
  });
}

async function post(url, body, cookie) {
  const res = await fetch(`${BASE}${url}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
  return res;
}

(async () => {
  for (const [what, p] of [['server dist', SERVER_MAIN], ['console dist', CONSOLE_DIST]]) {
    if (!existsSync(p)) {
      console.error(`[e2e:first-login] 缺 ${what}：${p}——先跑 npm run test:e2e（含构建）`);
      process.exit(2);
    }
  }

  const tmp = mkdtempSync(path.join(os.tmpdir(), 'teamhub-e2e-first-login-'));
  const shots = path.join(tmp, 'shots');
  mkdirSync(shots, { recursive: true });
  console.log(`[e2e:first-login] 临时库：${tmp}（端口 ${PORT}）`);

  let kill = () => {};
  const errors = [];
  try {
    kill = await startServer(path.join(tmp, 'teamhub.sqlite'));

    // ── 置备：初始化（身份模式）→ bootstrap 管理员 → 管理员导入一名无 PIN 新成员 ──
    const init = await post('/api/setup/init', { dataMode: 'real', identityMode: 'identity' });
    if (init.status !== 200) throw new Error(`setup/init → ${init.status}`);
    await new Promise((r) => setTimeout(r, 1500)); // 等退 42 + 重启
    await waitUp();

    const boot = await post('/api/setup/super-admin', {
      displayName: ADMIN.name,
      groupName: '电控',
      grade: 'senior',
      pin: ADMIN.pin,
    });
    if (boot.status !== 200) throw new Error(`setup/super-admin → ${boot.status} ${await boot.text()}`);

    const login = await post('/api/session', { username: ADMIN.name, pin: ADMIN.pin });
    if (login.status !== 200) throw new Error(`管理员登录 → ${login.status}`);
    const cookie = (login.headers.getSetCookie?.() ?? [])
      .map((c) => c.split(';')[0])
      .join('; ');

    const importRes = await post('/api/roster/import', {
      rows: [{
        displayName: NEWBIE.name,
        grade: 'freshman',
        groupName: '电控',
        gateReviewer: false,
        gateReviewerAuto: false,
      }],
    }, cookie);
    if (importRes.status !== 200) throw new Error(`roster/import → ${importRes.status} ${await importRes.text()}`);
    console.log('[e2e:first-login] 置备完成：管理员 1 + 无 PIN 新成员 1');

    // ── 浏览器：新成员首登 → ForcePinGate → 设密码 → 进应用 ──
    const browser = await chromium.launch();
    const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
    page.on('console', (m) => {
      if (m.type() !== 'error') return;
      // 登录流程天然会吃到闸的 401/403 响应（未登录探测/PIN_SETUP_REQUIRED），资源加载类报错属预期噪音
      if (/Failed to load resource.*\b(401|403)\b/.test(m.text())) return;
      errors.push('[console] ' + m.text().slice(0, 240));
    });
    page.on('pageerror', (e) => errors.push('[pageerror] ' + String(e).slice(0, 240)));

    await page.goto(BASE, { waitUntil: 'networkidle' });

    // 未登录 → 整屏登录闸（自输用户名，无 PIN 留空）
    await page.waitForSelector('.auth-gate__username', { timeout: 10_000 });
    await page.fill('.auth-gate__username', NEWBIE.name);
    await page.click('.auth-gate button[type=submit]');

    // 首登 → 整屏 ForcePinGate（两个密码框：新密码 + 再输一遍）
    await page.waitForSelector('.auth-gate__pin', { timeout: 10_000 });
    const pinBoxes = page.locator('.auth-gate__pin');
    if ((await pinBoxes.count()) !== 2) throw new Error('ForcePinGate 应有两个密码框');
    await pinBoxes.nth(0).fill(NEWBIE.pin);
    await pinBoxes.nth(1).fill(NEWBIE.pin);
    await page.screenshot({ path: path.join(shots, 'force-pin-gate.png') });
    await page.click('.auth-gate button[type=submit]');

    // 设完即进应用：侧栏导航渲染（死锁时是整屏 SetupStateUnavailable，nav 永远出不来）
    await page.waitForSelector('.nav-item', { timeout: 10_000 });
    await page.screenshot({ path: path.join(shots, 'after-pin.png') });

    // 刷新后保持已登录（会话落 cookie，不再弹闸）
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('.nav-item', { timeout: 10_000 });

    await browser.close();
  } catch (e) {
    fail(String(e && e.message ? e.message : e));
  } finally {
    kill();
    if (!KEEP) rmSync(tmp, { recursive: true, force: true });
  }

  if (errors.length) fail('浏览器报错：\n  ' + [...new Set(errors)].join('\n  '));
  console.log(`[e2e:first-login] ${process.exitCode ? '✗ FAIL' : '✓ PASS'} — 首登 → ForcePinGate → 设密码 → 进应用（截图 ${shots}${KEEP ? '，数据保留' : '，已清理'}）`);
  process.exit(process.exitCode ?? 0);
})();
