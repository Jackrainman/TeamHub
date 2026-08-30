#!/usr/bin/env node
// DEAD-CODE-AUDIT 静态交叉引用分析（只读，不改码）。
// 产出 JSON 到 stdout，供报告撰写引用。
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const rg = (args) => {
  try {
    return execSync(`rg ${args}`, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  } catch (e) {
    return e.stdout ?? '';
  }
};
const walk = (dir, ext) => {
  const out = [];
  const rec = (d) => {
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      if (ent.name === 'node_modules' || ent.name === 'dist' || ent.name.startsWith('.')) continue;
      const p = path.join(d, ent.name);
      if (ent.isDirectory()) rec(p);
      else if (ext.some((e) => ent.name.endsWith(e))) out.push(p);
    }
  };
  rec(dir);
  return out;
};

const report = {};

// ---------------------------------------------------------------------------
// 1. 服务端路由清单（方法 + 路径）
// ---------------------------------------------------------------------------
const serverSrc = path.join(ROOT, 'apps/hub-server/src');
const routes = [];
for (const f of walk(serverSrc, ['.ts'])) {
  if (f.includes('/test') || f.endsWith('.test.ts')) continue;
  const src = fs.readFileSync(f, 'utf8');
  const re = /\b(?:app|router|server)\.(get|post|patch|put|delete)\(\s*['"`]([^'"`]+)['"`]/g;
  let m;
  while ((m = re.exec(src))) {
    routes.push({ method: m[1].toUpperCase(), path: m[2], file: path.relative(ROOT, f) });
  }
}
report.serverRouteCount = routes.length;

// ---------------------------------------------------------------------------
// 2. console 侧引用的 API 路径（client 封装 + 裸 fetch）
// ---------------------------------------------------------------------------
const consoleSrc = path.join(ROOT, 'apps/hub-console/src');
const consoleFiles = walk(consoleSrc, ['.ts', '.tsx']).filter((f) => !f.endsWith('.test.ts') && !f.endsWith('.test.tsx'));
const consoleText = consoleFiles.map((f) => fs.readFileSync(f, 'utf8')).join('\n');

// 外部消费方（非 console）：lark 机器人/hermes/setup 向导/脚本/e2e 等，逐条人工归类
const EXTERNALLY_CONSUMED = [
  '/api/lark/', // 飞书 bot 回调与配置链路（bot 跑在 4177 上）
  '/api/hermes/', // hermes 网关适配层（HERMES-CHAT-MVP 拍板单端点分发器）
  '/api/setup/', // 初始化向导（setup server）
  '/api/system/status', // 运维探活/部署验证
  '/health', // systemd/部署健康检查
];

// 归一化：:param 与 ${...} 都折成 :p，两边可比
const normPath = (p) => p.replace(/\$\{[^}]*\}/g, ':p').replace(/:[^/]+/g, ':p');
const consoleApiPaths = new Set();
{
  // console 以 `${baseUrl}/api/...` 模板拼 URL，抓所有 /api/ 片段（不限引号起点）
  const re = /\/api\/[^'"`\s]+/g;
  let m;
  while ((m = re.exec(consoleText))) {
    const n = normPath(m[0]);
    consoleApiPaths.add(n);
    // 查询串/尾模板变体：/api/baseline${qs} → 补 /api/baseline
    const noQuery = n.split('?')[0];
    consoleApiPaths.add(noQuery);
    if (noQuery.endsWith(':p')) consoleApiPaths.add(noQuery.replace(/\/?:p$/, ''));
  }
  if (consoleText.includes('/health')) consoleApiPaths.add('/health');
}

const routeUsage = routes.map((r) => {
  const hit = consoleApiPaths.has(normPath(r.path));
  const external = EXTERNALLY_CONSUMED.some((p) => r.path.startsWith(p));
  return { ...r, consoleHit: hit, externalConsumer: external };
});
report.routesNotHitByConsole = routeUsage.filter((r) => !r.consoleHit && !r.externalConsumer);
report.routesExternalOnly = routeUsage.filter((r) => !r.consoleHit && r.externalConsumer);

// ---------------------------------------------------------------------------
// 3. hub-contracts 导出符号在 server/console 的使用率
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// 3. hub-contracts 导出符号的使用率（consumer = 三包 src + 全部 test，排除定义文件与 barrel）
// ---------------------------------------------------------------------------
// 先剥注释再收集导出名，防注释文本混入
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/[^\n]*/g, '$1');
const contractsIndex = fs.readFileSync(path.join(ROOT, 'apps/hub-contracts/src/index.ts'), 'utf8');
const names = new Map(); // name -> 定义文件
const collectExports = (file) => {
  const src = stripComments(fs.readFileSync(file, 'utf8'));
  const re = /export\s+(?:type\s+)?\{([^}]+)\}/g;
  let m;
  while ((m = re.exec(src))) {
    for (let part of m[1].split(',')) {
      part = part.trim();
      if (!part) continue;
      const as = part.split(/\s+as\s+/);
      const name = as[as.length - 1].trim();
      if (!names.has(name)) names.set(name, file);
    }
  }
  const reDecl = /export\s+(?:const|function|class|interface|type)\s+([A-Za-z0-9_]+)/g;
  while ((m = reDecl.exec(src))) {
    if (!names.has(m[1])) names.set(m[1], file);
  }
};
// 递归解析 export * / export {} from
const seen = new Set();
const resolveExports = (file) => {
  if (seen.has(file)) return;
  seen.add(file);
  // 先递归再收集本文件：defFile 记录真正的定义文件（非 barrel），避免误判定义处为消费
  const src = fs.readFileSync(file, 'utf8');
  const reFrom = /export\s+(?:type\s+)?(?:\{[^}]*\}|\*)\s+from\s+'([^']+)'/g;
  let m;
  while ((m = reFrom.exec(src))) {
    let target = path.resolve(path.dirname(file), m[1]);
    // ESM 源码以 .js 后缀引用 TS 文件，递归时映射回 .ts
    if (target.endsWith('.js') && !fs.existsSync(target)) target = target.replace(/\.js$/, '.ts');
    if (fs.existsSync(target)) resolveExports(target);
  }
  collectExports(file);
};
resolveExports(path.join(ROOT, 'apps/hub-contracts/src/index.ts'));

// 消费面文件清单：三包全部 src+test（contracts 内部互用也算消费，如 deriveStageProgress→deriveStagePipeline）
const contractsFiles = walk(path.join(ROOT, 'apps/hub-contracts/src'), ['.ts']);
const contractsTests = walk(path.join(ROOT, 'apps/hub-contracts/test'), ['.ts']);
const serverFiles = walk(serverSrc, ['.ts']);
const serverTests = fs.existsSync(path.join(ROOT, 'apps/hub-server/test'))
  ? walk(path.join(ROOT, 'apps/hub-server/test'), ['.ts'])
  : [];
const consoleTests = consoleFiles.filter(() => false); // console 测试在 src 内 *.test.ts
const allConsole = walk(consoleSrc, ['.ts', '.tsx']);
const isBarrel = (f) => /(^|\/)index\.ts$/.test(f) || f.includes('console-pages');

const srcConsumers = [...contractsFiles, ...serverFiles, ...allConsole.filter((f) => !f.endsWith('.test.ts') && !f.endsWith('.test.tsx'))];
const testConsumers = [...contractsTests, ...serverTests, ...allConsole.filter((f) => f.endsWith('.test.ts') || f.endsWith('.test.tsx'))];
const fileText = new Map();
const textOf = (f) => {
  if (!fileText.has(f)) fileText.set(f, fs.readFileSync(f, 'utf8'));
  return fileText.get(f);
};

const deadContracts = [];
const testOnlyContracts = [];
for (const [name, defFile] of names) {
  if (name.length < 4) continue; // 短名误报多，跳过
  const re = new RegExp(`\\b${name.replace(/[$]/g, '\\$')}\\b`);
  let srcHit = false;
  for (const f of srcConsumers) {
    if (isBarrel(f)) continue;
    if (f === defFile) {
      // 同文件内部使用：剥「re-export 块」与「该符号自身的声明头」（保留行其余部分，
      // 如 export const fixture = buildScheduleSeed(...) 右侧使用仍算命中）
      const stripped = textOf(f)
        .replace(/export\s+(?:type\s+)?\{[^}]*\}\s+from\s+'[^']+'/g, '')
        .replace(
          new RegExp(`export\\s+(?:const|function|class|interface|type)\\s+${name}\\b`, 'g'),
          '',
        );
      if (re.test(stripped)) { srcHit = true; }
      continue;
    }
    if (re.test(textOf(f))) { srcHit = true; break; }
  }
  if (srcHit) continue;
  let testHit = false;
  for (const f of testConsumers) {
    if (re.test(textOf(f))) { testHit = true; break; }
  }
  const rel = path.relative(ROOT, defFile);
  if (testHit) testOnlyContracts.push(`${name} (${rel})`);
  else deadContracts.push(`${name} (${rel})`);
}
report.contractsExportCount = names.size;
report.deadContractsExports = deadContracts.sort();
report.testOnlyContractsExports = testOnlyContracts.sort();
delete report.unusedContractsExports;

// ---------------------------------------------------------------------------
// 4. console 页面注册表 vs 文件实体（孤儿组件/页面）
// ---------------------------------------------------------------------------
const pagesFile = path.join(consoleSrc, 'console-pages.tsx');
const pagesSrc = fs.existsSync(pagesFile)
  ? fs.readFileSync(pagesFile, 'utf8')
  : fs.readFileSync(path.join(consoleSrc, 'console-pages.ts'), 'utf8');
const importedComponents = new Set();
{
  const re = /import\s+(?:\{([^}]*)\}|([A-Za-z0-9_]+))\s+from/g;
  let m;
  while ((m = re.exec(pagesSrc))) {
    if (m[1]) m[1].split(',').forEach((s) => s.trim() && importedComponents.add(s.trim().split(/\s+as\s+/).pop()));
    if (m[2]) importedComponents.add(m[2]);
  }
}

// 特性目录文件级孤儿：未被任何其他 console 文件 import（含动态 import()）的非页面组件
const allImports = new Set();
for (const f of consoleFiles) {
  const src = fs.readFileSync(f, 'utf8');
  const re = /(?:from\s+|import\(\s*)['"](\.[^'"]+)['"]/g;
  let m;
  while ((m = re.exec(src))) {
    const resolved = path.resolve(path.dirname(f), m[1]);
    for (const cand of [resolved + '.ts', resolved + '.tsx', resolved + '/index.ts', resolved + '/index.tsx', resolved]) {
      allImports.add(path.normalize(cand));
    }
  }
}
const orphans = [];
for (const f of consoleFiles) {
  const norm = path.normalize(f);
  if (norm.includes('console-pages') || norm.endsWith('/main.tsx') || norm.endsWith('/App.tsx')) continue;
  // index.ts barrel 被目录级 import 覆盖，单独豁免
  if (norm.endsWith('/index.ts') || norm.endsWith('/index.tsx')) continue;
  if (!allImports.has(norm)) orphans.push(path.relative(ROOT, f));
}
report.consoleOrphanFiles = orphans.sort();

// ---------------------------------------------------------------------------
// 5. hooks 层：useXxx 定义 vs 使用
// ---------------------------------------------------------------------------
const hooksDir = path.join(consoleSrc, 'hooks');
const hookDefs = [];
if (fs.existsSync(hooksDir)) {
  for (const f of walk(hooksDir, ['.ts', '.tsx'])) {
    const src = fs.readFileSync(f, 'utf8');
    const re = /export\s+function\s+(use[A-Za-z0-9_]+)/g;
    let m;
    while ((m = re.exec(src))) hookDefs.push({ name: m[1], file: path.relative(ROOT, f) });
  }
}
report.unusedHooks = hookDefs
  .filter((h) => {
    const uses = consoleText.split(h.name).length - 1;
    return uses <= 1; // 仅定义处出现
  })
  .map((h) => `${h.name} (${h.file})`);

// ---------------------------------------------------------------------------
// 6. i18n key 死键扫描（locales 定义但代码无 t('key') 引用）
// ---------------------------------------------------------------------------
const localesDir = path.join(consoleSrc, 'i18n/locales');
const deadI18n = [];
if (fs.existsSync(localesDir)) {
  const zhFiles = walk(localesDir, ['.ts']).filter((f) => f.includes('zh'));
  const keyRe = /^\s*'([a-z0-9.\-_]+)':/gim;
  const keys = new Set();
  for (const f of zhFiles) {
    const src = fs.readFileSync(f, 'utf8');
    let m;
    while ((m = keyRe.exec(src))) keys.add(m[1]);
  }
  for (const k of keys) {
    if (!consoleText.includes(`'${k}'`) && !consoleText.includes(`"${k}"`)) deadI18n.push(k);
  }
}
report.deadI18nKeys = deadI18n.sort();

console.log(JSON.stringify(report, null, 2));
