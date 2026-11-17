#!/usr/bin/env node
/**
 * console 入口可达性门（CONSOLE-REACHABILITY）。
 *
 * 从 `apps/hub-console/src/main.tsx` 出发，按静态相对 import / 字面量 `import()` 建模块图，
 * 算出「从入口真正可达」的模块集合；不在集合里的文件就是死代码候选。
 *
 * 与「按页面清单拍脑袋」的区别：DepGraphPage / PmBoardPage / PoolPage 这类被 ProjectPage
 * 当子视图用的文件，图里自然可达；反过来 schedule/ 这类整目录暂时没人 import 的，
 * 图里不可达但受保护（后续日历页基础）。
 *
 * 判定规则
 *  1. 运行期可达 = main.tsx 的正向闭包。
 *  2. 测试文件单独处理：测试的 feature 依赖全部不可达（且不在受保护目录）时，判为「死测试」；
 *     死测试不参与可达性，其依赖也不会被测试“救活”。其余测试作为测试根，其闭包算可达
 *     （测试专用的 src 辅助模块不应被误删）。
 *  3. 受保护路径（PROTECTED）永远不判违规：features/schedule/ 整目录、styles/14-schedule.css、
 *     src/shared/、src/components/、src/api/。
 *  4. 允许清单（scripts/console-reachability.allow.json）只收「图里不可达但架构上必须存在」
 *     的文件，每条必须写 reason；清单里的文件不计违规。
 *
 * 退出码：存在「不在允许清单、也不受保护」的不可达文件 → 1；否则 0。
 *
 * 用法：
 *   node scripts/console-reachability.mjs             # 文本报告
 *   node scripts/console-reachability.mjs --json      # 机器可读报告（含可达集全量）
 *   node scripts/console-reachability.mjs --list-reachable  # 文本报告附带可达文件清单
 *   node scripts/console-reachability.mjs --quiet     # 只打汇总与违规
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const CONSOLE_DIR = path.join(ROOT, 'apps/hub-console');
const SRC_DIR = path.join(CONSOLE_DIR, 'src');
const ENTRY = path.join(SRC_DIR, 'main.tsx');
const ALLOW_FILE = path.join(import.meta.dirname, 'console-reachability.allow.json');

// 模块图收录目录：console 源码 + 单测 + 构建脚本（test 会 import ../build/*）。
const MODULE_DIRS = [SRC_DIR, path.join(CONSOLE_DIR, 'test'), path.join(CONSOLE_DIR, 'build')];

// 受保护路径（仓库相对路径，统一用 / 分隔）：
//  - schedule 整目录 + 它的样式：用户已定「日历页看项目贯穿区间」后续基于它改造。
//  - shared/components/api：跨页公共件，即使当前无人 import 也保留（公共 API 面）。
const PROTECTED_PREFIXES = [
  'apps/hub-console/src/shared/',
  'apps/hub-console/src/components/',
  'apps/hub-console/src/api/',
  'apps/hub-console/build/',
];
const PROTECTED_FILES = [];

const toPosix = (p) => p.split(path.sep).join('/');
const rel = (abs) => toPosix(path.relative(ROOT, abs));

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const isModuleFile = (file) => /\.(ts|tsx|css)$/.test(file) && !file.endsWith('.d.ts');
const modules = [...new Set(MODULE_DIRS.flatMap(walk))].filter(isModuleFile);
const moduleSet = new Set(modules);
const relOf = new Map(modules.map((file) => [file, rel(file)]));

// ---------------------------------------------------------------------------
// 1. 模块图
// ---------------------------------------------------------------------------
const IMPORT_PATTERNS = [
  // import x from './x' / import {a,b} from './x' / import type {...} from './x' / import './x'
  /\bimport\s+(?:type\s+)?(?:[^'"();]*?\bfrom\s+)?['"]([^'"]+)['"]/g,
  // export * from './x' / export {a} from './x' / export type {a} from './x'
  /\bexport\s+(?:type\s+)?(?:\*|\{[^}]*\})\s*from\s*['"]([^'"]+)['"]/g,
  // 字面量动态 import('./x')（模板拼接无法静态分析，遇到时在报告里单列）
  /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
];

// 只认「看起来像代码」的非字面量动态 import（import(pathToFileURL(x))），避免命中文案里的
// "import (...)" 散文。模板拼接的动态 import 同样是人工确认项。
const NON_LITERAL_DYNAMIC_IMPORT = /\bimport\(\s*[A-Za-z_$][\w$.]*\s*[()]/g;

function resolveSpecifier(fromFile, specifier) {
  if (!specifier.startsWith('.')) return null; // 包依赖 / 路径别名不在本图范围
  const clean = specifier.split('?')[0]; // 去掉 ?raw / ?url
  const base = path.resolve(path.dirname(fromFile), clean);
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.css`,
    `${base}.json`,
    path.join(base, 'index.ts'),
    path.join(base, 'index.tsx'),
  ];
  if (base.endsWith('.js') || base.endsWith('.jsx')) {
    candidates.push(base.replace(/\.jsx?$/, '.ts'), base.replace(/\.jsx?$/, '.tsx'));
  }
  return candidates.find((candidate) => moduleSet.has(candidate)) ?? null;
}

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');
}

const graph = new Map(modules.map((file) => [file, new Set()]));
const unresolvedDynamic = [];
for (const file of modules) {
  if (file.endsWith('.css')) continue;
  const source = stripComments(fs.readFileSync(file, 'utf8'));
  for (const pattern of IMPORT_PATTERNS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(source))) {
      const resolved = resolveSpecifier(file, match[1]);
      if (resolved) graph.get(file).add(resolved);
    }
  }
  for (const match of source.matchAll(NON_LITERAL_DYNAMIC_IMPORT)) {
    unresolvedDynamic.push(`${relOf.get(file)}: ${match[0].replace(/\s+/g, ' ').slice(0, 80)}`);
  }
}

const closure = (roots) => {
  const seen = new Set();
  const stack = [...roots];
  while (stack.length) {
    const current = stack.pop();
    if (seen.has(current)) continue;
    seen.add(current);
    for (const dep of graph.get(current) ?? []) stack.push(dep);
  }
  return seen;
};

const isTestFile = (file) => /\.test\.(ts|tsx)$/.test(file);
const featureOf = (file) => {
  const match = rel(file).match(/apps\/hub-console\/src\/features\/([^/]+)\//);
  return match ? match[1] : null;
};
const isProtected = (file) => {
  const pathName = rel(file);
  return PROTECTED_FILES.includes(pathName) || PROTECTED_PREFIXES.some((prefix) => pathName.startsWith(prefix));
};

// ---------------------------------------------------------------------------
// 2. 可达性：运行期入口 + 有效测试根
// ---------------------------------------------------------------------------
const runtimeReachable = closure([ENTRY]);

const testFiles = modules.filter(isTestFile);
const deadTests = [];
const liveTests = [];
for (const testFile of testFiles) {
  // 只看测试的直接 feature 依赖：至少一个还剩运行期可达（或落在受保护目录）→ 测试有效。
  // 不能按「整个 feature 目录还有活文件」判（api.ts 常被 client.ts 保活），否则指向已删
  // 页面的测试会把自己的页面依赖一起“救活”。
  const featureDeps = [...graph.get(testFile)]
    .filter((dep) => featureOf(dep) !== null)
    .map((dep) => ({ dep, feature: featureOf(dep) }));
  const allDead = featureDeps.length > 0
    && featureDeps.every(({ dep, feature }) => {
      if (runtimeReachable.has(dep)) return false;
      if (isProtected(dep)) return false;
      // feature 本身受保护（schedule 整目录）= 测试保留。
      const featureDir = path.join(SRC_DIR, 'features', feature) + path.sep;
      return !PROTECTED_PREFIXES.some((prefix) => toPosix(featureDir).startsWith(prefix));
    });
  (allDead ? deadTests : liveTests).push(testFile);
}

const live = new Set(runtimeReachable);
for (const testFile of liveTests) {
  for (const file of closure([testFile])) live.add(file);
}

const deadModules = modules.filter((file) => !live.has(file) && !isTestFile(file));
const deadTestSet = new Set(deadTests);

// 入度：全图（含死模块）指向该文件的边数。
const inDegree = new Map(modules.map((file) => [file, 0]));
for (const [, deps] of graph) {
  for (const dep of deps) inDegree.set(dep, (inDegree.get(dep) ?? 0) + 1);
}

// ---------------------------------------------------------------------------
// 3. 允许清单（先于引用归属计算：允许清单里的文件也算「保留」，其 i18n/CSS 不能判死）
// ---------------------------------------------------------------------------
let allowEntries = [];
if (fs.existsSync(ALLOW_FILE)) {
  try {
    const parsed = JSON.parse(fs.readFileSync(ALLOW_FILE, 'utf8'));
    allowEntries = (parsed.files ?? []).map((entry) => (typeof entry === 'string' ? { path: entry } : entry));
  } catch (error) {
    console.error(`✗ 允许清单无法解析：${ALLOW_FILE}\n${error.message}`);
    process.exit(2);
  }
}
const allowMap = new Map(allowEntries.map((entry) => [entry.path, entry]));

const protectedDead = deadModules.filter(isProtected);
const allowlistedDead = deadModules.filter((file) => !isProtected(file) && allowMap.has(rel(file)));
const violations = deadModules.filter((file) => !isProtected(file) && !allowMap.has(rel(file)));
const violationSet = new Set(violations);
const retained = new Set(modules.filter((file) => !violationSet.has(file)));

// ---------------------------------------------------------------------------
// 4. 独占引用：测试 / CSS / i18n（判定基准 = 除违规文件外全部保留模块）
// ---------------------------------------------------------------------------
const retainedText = [...retained]
  .filter((file) => /\.(ts|tsx)$/.test(file))
  .map((file) => fs.readFileSync(file, 'utf8'))
  // CSS 的 import 路径（styles/18-direction-starmap.css）会误命中同名类名，样式归属只看代码。
  .map((source) => source.replace(/^[^\n]*styles\/[^\n]*\.css[^\n]*$/gm, ''))
  .join('\n');

// 每个死模块的正向闭包（不含已死测试以外的活模块），用于归属「独占依赖」。
const deadClosure = new Map();
for (const file of deadModules) deadClosure.set(file, closure([file]));

// CSS：解析类名 token，只被违规模块引用的样式文件算「独占样式」，附注在所属死模块下。
const cssFiles = modules.filter((file) => file.endsWith('.css'));
const cssTokens = new Map();
for (const file of cssFiles) {
  const source = fs
    .readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ''); // 注释里的 ".gaps-* 复用" 不是类名
  const tokens = [...new Set([...source.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((match) => match[1]))]
    .filter((token) => token.length > 2);
  cssTokens.set(file, tokens);
}
const tokenUsedInRetained = (token) => new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(retainedText);
const exclusiveCss = new Map(); // cssFile -> [token...]
for (const file of cssFiles) {
  const tokens = cssTokens.get(file) ?? [];
  if (tokens.length === 0) continue;
  if (tokens.every((token) => !tokenUsedInRetained(token))) exclusiveCss.set(file, tokens);
}

// i18n：locale 文件里声明的 key → 违规模块里出现过的字面量 key；再确认保留代码无引用。
const localeDir = path.join(SRC_DIR, 'i18n/locales');
const localeFiles = walk(localeDir).filter((file) => file.endsWith('.ts') && !file.endsWith('/index.ts'));
const declaredKeys = new Set();
for (const file of localeFiles) {
  const source = fs.readFileSync(file, 'utf8');
  for (const match of source.matchAll(/^\s*'([^']+)':/gm)) declaredKeys.add(match[1]);
}
const literalKeyRefs = (source) => {
  const refs = new Set();
  for (const match of source.matchAll(/\bt\(\s*['"]([^'"]+)['"]/g)) refs.add(match[1]);
  for (const match of source.matchAll(/['"]([a-z][\w-]*(?:\.[\w-]+)+)['"]/g)) refs.add(match[1]);
  return refs;
};
// 动态 key 前缀（t(`prefix.${...}`)）：命中前缀的 key 一律视为有引用，避免误删。
const dynamicPrefixes = [];
for (const file of modules) {
  if (!/\.(ts|tsx)$/.test(file) || file.endsWith('.css')) continue;
  const source = fs.readFileSync(file, 'utf8');
  for (const match of source.matchAll(/\bt\(\s*`([^`]*?)\$\{/g)) dynamicPrefixes.push(match[1]);
}
const hasDynamicRef = (key) => dynamicPrefixes.some((prefix) => key.startsWith(prefix));

const retainedKeyRefs = new Set();
for (const file of retained) {
  if (!/\.(ts|tsx)$/.test(file)) continue;
  // locale 文件里的 key 字符串是「声明」不是「引用」，否则任何 key 都自证存活。
  if (rel(file).startsWith('apps/hub-console/src/i18n/locales/')) continue;
  for (const key of literalKeyRefs(fs.readFileSync(file, 'utf8'))) retainedKeyRefs.add(key);
}

const deadI18nByFile = new Map();
const allDeadI18nKeys = new Set();
for (const file of violations) {
  if (!/\.(ts|tsx)$/.test(file)) continue;
  const keys = [...literalKeyRefs(fs.readFileSync(file, 'utf8'))]
    .filter((key) => declaredKeys.has(key) && !retainedKeyRefs.has(key) && !hasDynamicRef(key));
  if (keys.length) {
    deadI18nByFile.set(file, keys.sort());
    for (const key of keys) allDeadI18nKeys.add(key);
  }
}

// 独占测试：死测试里正向闭包包含该文件的。
const exclusiveTestsByFile = new Map();
for (const testFile of deadTests) {
  const testClosure = closure([testFile]);
  for (const file of testClosure) {
    if (!exclusiveTestsByFile.has(file)) exclusiveTestsByFile.set(file, []);
    exclusiveTestsByFile.get(file).push(rel(testFile));
  }
}

// 独占依赖：死模块闭包内、且只被死模块引用的文件（供报告分组）。
const deadOnlyIncoming = (file) => {
  const incoming = [];
  for (const [from, deps] of graph) {
    if (deps.has(file) && !live.has(from) && !isTestFile(from)) incoming.push(rel(from));
  }
  return incoming;
};

// ---------------------------------------------------------------------------
// 5. 允许清单过期条目
// ---------------------------------------------------------------------------
// 允许清单里已不存在的条目：告警（不阻断，避免清理旧条目时卡住）。
const staleAllow = [...allowMap.keys()].filter((pathName) => !deadModules.some((file) => rel(file) === pathName));

// ---------------------------------------------------------------------------
// 6. 输出
// ---------------------------------------------------------------------------
const report = {
  entry: rel(ENTRY),
  moduleCount: modules.length,
  runtimeReachable: runtimeReachable.size,
  liveWithTests: live.size,
  deadCount: deadModules.length,
  deadTestCount: deadTests.length,
  violationCount: violations.length,
  protectedCount: protectedDead.length,
  allowlistedCount: allowlistedDead.length,
  deadModules: deadModules
    .map((file) => ({
      path: rel(file),
      status: isProtected(file) ? 'protected' : allowMap.has(rel(file)) ? 'allowlisted' : 'violation',
      inDegree: inDegree.get(file) ?? 0,
      incomingFromDeadOnly: deadOnlyIncoming(file),
      exclusiveTests: exclusiveTestsByFile.get(file) ?? [],
      exclusiveCss: [...exclusiveCss.keys()].filter((css) => (deadClosure.get(file) ?? new Set()).has(css)).map(rel),
      deadI18nKeys: deadI18nByFile.get(file) ?? [],
    }))
    .sort((a, b) => a.path.localeCompare(b.path)),
  deadTests: deadTests.map(rel).sort(),
  reachableModules: [...runtimeReachable].map(rel).sort(),
  testOnlyReachable: [...live]
    .filter((file) => !runtimeReachable.has(file))
    .map(rel)
    .sort(),
  exclusiveCssFiles: [...exclusiveCss.entries()].map(([file, tokens]) => ({ path: rel(file), tokens })),
  deadI18nKeys: [...allDeadI18nKeys].sort(),
  allowlist: allowEntries.map((entry) => entry.path),
  staleAllowlist: staleAllow,
  unresolvedDynamicImports: unresolvedDynamic,
};

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
} else {
  const quiet = process.argv.includes('--quiet');
  console.log('console 入口可达性（CONSOLE-REACHABILITY）');
  console.log(`  入口      ${report.entry}`);
  console.log(`  模块      ${report.moduleCount}（ts/tsx/css：src + test + build）`);
  console.log(`  可达      ${report.runtimeReachable} 运行期 + 测试根合计 ${report.liveWithTests}`);
  console.log(`  不可达    ${report.deadCount}（违规 ${report.violationCount} / 受保护 ${report.protectedCount} / 允许清单 ${report.allowlistedCount}）`);
  console.log(`  死测试    ${report.deadTestCount}`);
  if (report.unresolvedDynamicImports.length) {
    console.log(`  动态 import 无法静态解析：${report.unresolvedDynamicImports.length} 处（人工确认）`);
    for (const item of report.unresolvedDynamicImports) console.log(`    - ${item}`);
  }

  if (process.argv.includes('--list-reachable')) {
    console.log(`\n可达模块（${report.runtimeReachable}）：`);
    for (const file of report.reachableModules) console.log(`  ${file}`);
  }

  if (!quiet && violations.length) {
    console.log('\n不可达文件（违规）：');
    for (const file of violations) {
      const entry = report.deadModules.find((item) => item.path === rel(file));
      console.log(`  [入度 ${entry.inDegree}] ${entry.path}`);
      if (entry.incomingFromDeadOnly.length) console.log(`      被死模块引用：${entry.incomingFromDeadOnly.join(', ')}`);
      if (entry.exclusiveTests.length) console.log(`      独占测试：${entry.exclusiveTests.join(', ')}`);
      if (entry.exclusiveCss.length) console.log(`      独占样式：${entry.exclusiveCss.join(', ')}`);
      if (entry.deadI18nKeys.length) console.log(`      独占 i18n：${entry.deadI18nKeys.length} 个 key（${entry.deadI18nKeys.slice(0, 6).join(', ')}${entry.deadI18nKeys.length > 6 ? '…' : ''}）`);
    }
  }

  if (!quiet && protectedDead.length) {
    console.log('\n不可达但受保护（保留）：');
    for (const file of protectedDead) console.log(`  ${rel(file)}`);
  }
  if (!quiet && allowlistedDead.length) {
    console.log('\n不可达但在允许清单（保留）：');
    for (const file of allowlistedDead) {
      const entry = allowMap.get(rel(file));
      console.log(`  ${rel(file)}${entry.reason ? ` — ${entry.reason}` : ''}`);
    }
  }
  if (!quiet && report.deadI18nKeys.length) {
    console.log(`\n死 i18n key（仅被死模块引用，${report.deadI18nKeys.length} 个）：`);
    console.log(`  ${report.deadI18nKeys.join(', ')}`);
  }
  if (!quiet && report.exclusiveCssFiles.length) {
    console.log('\n独占样式文件（类名在存活代码中无引用）：');
    for (const css of report.exclusiveCssFiles) console.log(`  ${css.path}（${css.tokens.length} 个类名）`);
  }
  if (report.staleAllowlist.length) {
    console.log(`\n⚠ 允许清单中有 ${report.staleAllowlist.length} 条已不存在：${report.staleAllowlist.join(', ')}`);
  }

  console.log('');
  if (report.violationCount === 0) {
    console.log(`✓ 不可达违规 0（受保护保留 ${report.protectedCount}，允许清单 ${report.allowlistedCount}）`);
  } else {
    console.log(`✗ ${report.violationCount} 个不可达文件不在允许清单：删掉，或在 scripts/console-reachability.allow.json 写明 reason。`);
  }
}

process.exit(report.violationCount === 0 ? 0 : 1);
