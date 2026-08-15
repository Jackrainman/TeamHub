#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const PACKAGE_ROOTS = ['apps', 'integrations'];
const SOURCE_EXTENSIONS = new Set(['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.mts', '.cts']);

// D-090 迁移基线不是永久豁免：每项都绑定“规则 + 文件 + 精确命中数”。
// 命中数减少或文件消失时检查会失败，要求在同一批次收缩/删除对应条目。
export const ARCHITECTURE_BASELINE = Object.freeze([
  ['multi-domain-client-segment', 'apps/hub-console/src/api/segments/domain.ts', 3],
  ['multi-domain-client-segment', 'apps/hub-console/src/api/segments/members.ts', 4],
  ['multi-domain-client-segment', 'apps/hub-console/src/api/segments/schedule.ts', 2],
  ['multi-domain-client-segment', 'apps/hub-console/src/api/segments/system-pm.ts', 3],
  ['raw-react-query', 'apps/hub-console/src/App.tsx', 4],
  ['raw-react-query', 'apps/hub-console/src/features/archive/ArchivePage.tsx', 3],
  ['raw-react-query', 'apps/hub-console/src/features/checklist/GateChecklistCard.tsx', 3],
  ['raw-react-query', 'apps/hub-console/src/features/dep-graph/DepGraphPage.tsx', 1],
  ['raw-react-query', 'apps/hub-console/src/features/direction/DirectionPage.tsx', 1],
  ['raw-react-query', 'apps/hub-console/src/features/identity/IdentityBar.tsx', 3],
  ['raw-react-query', 'apps/hub-console/src/features/inv/InvQuickRecordForm.tsx', 1],
  ['raw-react-query', 'apps/hub-console/src/features/inv/sub/CreatePartTypeForm.tsx', 1],
  ['raw-react-query', 'apps/hub-console/src/features/kb/KbSearchPage.tsx', 1],
  ['raw-react-query', 'apps/hub-console/src/features/myview/MyViewPage.tsx', 1],
  ['raw-react-query', 'apps/hub-console/src/features/overview/BaselineOverview.tsx', 1],
  ['raw-react-query', 'apps/hub-console/src/features/overview/sub/BaselineStates.tsx', 2],
  ['raw-react-query', 'apps/hub-console/src/features/pm/PmCreatePanel.tsx', 1],
  ['raw-react-query', 'apps/hub-console/src/features/resources/ResourcesPage.tsx', 1],
  ['raw-react-query', 'apps/hub-console/src/features/resources/sub/CreateResourceForm.tsx', 1],
  ['raw-react-query', 'apps/hub-console/src/features/resources/sub/ResourceRow.tsx', 2],
  ['raw-react-query', 'apps/hub-console/src/features/schedule/relay-canvas/useRelayMutations.ts', 5],
  ['raw-react-query', 'apps/hub-console/src/features/schedule/RelayCanvas.tsx', 1],
  ['raw-react-query', 'apps/hub-console/src/features/schedule/SchedulePage.tsx', 2],
  ['raw-react-query', 'apps/hub-console/src/features/settings/sub/useSettingsMutations.ts', 3],
  ['raw-react-query', 'apps/hub-console/src/features/settings/sub/useSettingsQueries.ts', 3],
  ['raw-react-query', 'apps/hub-console/src/hooks/useBaseline.ts', 1],
  ['raw-react-query', 'apps/hub-console/src/hooks/useRoster.ts', 3],
  ['raw-react-query', 'apps/hub-console/src/hooks/useSchedule.ts', 3],
  ['raw-react-query', 'apps/hub-console/src/hooks/useTasks.ts', 2],
].map(([rule, file, count]) => Object.freeze({ rule, file, count })));

function toPosix(value) {
  return value.split(path.sep).join('/');
}

function listFiles(directory, { skip = new Set() } = {}) {
  if (!fs.existsSync(directory)) return [];
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (skip.has(entry.name)) continue;
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...listFiles(absolutePath, { skip }));
    else if (entry.isFile()) files.push(absolutePath);
  }
  return files;
}

function readJson(filePath, errors, label) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    errors.push(`${label}: 无法读取合法 JSON（${error.message}）`);
    return null;
  }
}

function workspacePatterns(rootPackage) {
  const value = rootPackage?.workspaces;
  if (Array.isArray(value)) return value;
  if (value && Array.isArray(value.packages)) return value.packages;
  return [];
}

function globPattern(pattern) {
  const normalized = toPosix(pattern).replace(/^\.\//, '').replace(/\/$/, '');
  const escaped = normalized.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escaped.replaceAll('**', '\u0000').replaceAll('*', '[^/]+').replaceAll('\u0000', '.*')}$`);
}

function discoverPackages(repoRoot) {
  const packages = [];
  for (const container of PACKAGE_ROOTS) {
    const absoluteContainer = path.join(repoRoot, container);
    if (!fs.existsSync(absoluteContainer)) continue;
    for (const entry of fs.readdirSync(absoluteContainer, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const relativeDirectory = `${container}/${entry.name}`;
      if (fs.existsSync(path.join(repoRoot, relativeDirectory, 'package.json'))) packages.push(relativeDirectory);
    }
  }
  return packages.sort();
}

function sourceFiles(repoRoot, packageDirectory) {
  const root = path.join(repoRoot, packageDirectory, 'src');
  return listFiles(root, { skip: new Set(['node_modules', 'dist', 'build']) })
    .filter((filePath) => SOURCE_EXTENSIONS.has(path.extname(filePath).toLowerCase()))
    .map((filePath) => ({
      absolutePath: filePath,
      relativePath: toPosix(path.relative(repoRoot, filePath)),
      content: fs.readFileSync(filePath, 'utf8'),
    }));
}

function importSpecifiers(content) {
  const values = [];
  const patterns = [
    /\b(?:import|export)\s+(?:type\s+)?(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]/g,
    /\b(?:import|require)\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern)) values.push(match[1]);
  }
  return values;
}

function matchesPackage(specifier, packageName) {
  return specifier === packageName || specifier.startsWith(`${packageName}/`);
}

function countMatches(content, pattern) {
  return [...content.matchAll(pattern)].length;
}

function withoutComments(content) {
  return content.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function recordViolation(violations, rule, file, count = 1, detail = '') {
  if (count <= 0) return;
  violations.push({ rule, file, count, detail });
}

function apiDomain(endpoint) {
  const root = endpoint === '/health' ? 'health' : endpoint.slice('/api/'.length).split('/')[0];
  const aliases = {
    health: 'system', system: 'system', 'bot-channels': 'system', 'agent-backends': 'system',
    'data-sources': 'system', events: 'system', bridge: 'system', git: 'system', search: 'system',
    members: 'system', roster: 'system', session: 'system', setup: 'system',
    tasks: 'pm', dependencies: 'pm', needs: 'pm', seasons: 'pm', groups: 'pm',
    'dep-graph': 'pm', 'group-gaps': 'pm',
    artifacts: 'artifacts', kb: 'knowledge', inventory: 'inventory', baseline: 'baseline',
    checklist: 'checklist', integrations: 'integrations', reimburse: 'reimburse',
    relay: 'schedule', 'relay-handoffs': 'schedule', 'resource-sessions': 'schedule', schedule: 'schedule',
    resources: 'resources',
  };
  return aliases[root] ?? root;
}

function collectMigrationViolations(repoRoot) {
  const violations = [];
  const serverFiles = sourceFiles(repoRoot, 'apps/hub-server');
  const consoleFiles = sourceFiles(repoRoot, 'apps/hub-console');

  for (const file of serverFiles) {
    recordViolation(
      violations,
      'legacy-file-store',
      file.relativePath,
      countMatches(file.content, /\bclass\s+File[A-Za-z0-9]*Store\b/g),
      '生产源码禁止新增 File*Store',
    );
    const persistedCount = countMatches(
      file.content,
      /(?:\bclass\s+PersistedFile\b|\bimport\s*\{[^}]*\bPersistedFile\b[^}]*\}\s*from\b)/g,
    );
    recordViolation(violations, 'legacy-persisted-file', file.relativePath, persistedCount, '禁止新增 PersistedFile');
    recordViolation(
      violations,
      'legacy-data-file-env',
      file.relativePath,
      countMatches(file.content, /\bprocess\.env\.TEAMHUB_[A-Z0-9_]+_DATA_FILE\b/g),
      '生产配置禁止新增分域 *_DATA_FILE',
    );
    recordViolation(
      violations,
      'production-inmemory-fallback',
      file.relativePath,
      countMatches(withoutComments(file.content), /\bnew\s+InMemory[A-Za-z0-9]*Store\b/g),
      '生产源码禁止构造 InMemory Store；fake 应迁入 test/support',
    );

    if (file.relativePath.includes('/routes/')) {
      const concreteSqliteImports = importSpecifiers(file.content).filter((specifier) => /sqlite/i.test(specifier));
      recordViolation(
        violations,
        'route-imports-sqlite',
        file.relativePath,
        concreteSqliteImports.length,
        'route 禁止 import SQLite 具体实现',
      );
    }
  }

  for (const file of consoleFiles) {
    const isFeatureHooks = /^apps\/hub-console\/src\/features\/[^/]+\/hooks\.[cm]?[jt]sx?$/.test(file.relativePath);
    const isQueryInfrastructure = file.relativePath === 'apps/hub-console/src/hooks/useHubMutation.ts';
    if (!isFeatureHooks && !isQueryInfrastructure) {
      recordViolation(
        violations,
        'raw-react-query',
        file.relativePath,
        countMatches(file.content, /\buse(?:Query|Mutation)\s*\(/g),
        '远程状态调用必须收进本域 hooks.ts',
      );
    }

    if (/^apps\/hub-console\/src\/api\/segments\/[^/]+\.[cm]?[jt]sx?$/.test(file.relativePath)) {
      const endpoints = [...file.content.matchAll(/(?:\/health|\/api\/[A-Za-z0-9_-]+)/g)].map((match) => match[0]);
      const domains = new Set(endpoints.map(apiDomain));
      if (domains.size > 1) {
        recordViolation(
          violations,
          'multi-domain-client-segment',
          file.relativePath,
          domains.size,
          `API segment 混合领域：${[...domains].sort().join(', ')}`,
        );
      }
    }
  }
  return violations.sort((left, right) => left.rule.localeCompare(right.rule) || left.file.localeCompare(right.file));
}

function compareBaseline(actual, baseline, errors) {
  const keyOf = (item) => `${item.rule}\u0000${item.file}`;
  const actualByKey = new Map(actual.map((item) => [keyOf(item), item]));
  const baselineByKey = new Map();

  for (const item of baseline) {
    const key = keyOf(item);
    if (baselineByKey.has(key)) errors.push(`架构基线重复：${item.rule} @ ${item.file}`);
    baselineByKey.set(key, item);
  }
  for (const item of actual) {
    const expected = baselineByKey.get(keyOf(item));
    if (!expected) {
      errors.push(`${item.rule} @ ${item.file}: 新增违规（命中 ${item.count} 次）${item.detail ? `；${item.detail}` : ''}`);
    } else if (expected.count !== item.count) {
      const direction = item.count < expected.count ? '技术债已减少，请同步收缩基线' : '违规命中数增加';
      errors.push(`${item.rule} @ ${item.file}: 基线 ${expected.count} 次，当前 ${item.count} 次；${direction}`);
    }
  }
  for (const item of baseline) {
    if (!actualByKey.has(keyOf(item))) {
      errors.push(`${item.rule} @ ${item.file}: 基线条目已清除，请删除该精确基线`);
    }
  }
}

function verifyReimburseTemplate(repoRoot, errors) {
  const marker = 'apps/hub-contracts/src/domains/reimburse/index.ts';
  if (!fs.existsSync(path.join(repoRoot, marker))) return;

  const required = [
    'apps/hub-contracts/src/domains/reimburse/model.ts',
    'apps/hub-contracts/src/domains/reimburse/requests.ts',
    'apps/hub-contracts/src/domains/reimburse/policies.ts',
    'apps/hub-contracts/src/domains/reimburse/import.ts',
    'apps/hub-contracts/src/domains/reimburse/export.ts',
    'apps/hub-server/src/modules/reimburse/index.ts',
    'apps/hub-server/src/modules/reimburse/routes.ts',
    'apps/hub-server/src/modules/reimburse/service.ts',
    'apps/hub-server/src/modules/reimburse/repository.ts',
    'apps/hub-server/src/modules/reimburse/sqlite-repository.ts',
    'apps/hub-console/src/features/reimburse/index.ts',
    'apps/hub-console/src/features/reimburse/api.ts',
    'apps/hub-console/src/features/reimburse/hooks.ts',
    'apps/hub-console/src/features/reimburse/ReimbursePage.tsx',
    'apps/hub-console/src/features/reimburse/components',
  ];
  const forbidden = [
    'apps/hub-contracts/src/reimbursement.ts',
    'apps/hub-server/src/routes/reimburse.ts',
    'apps/hub-server/src/store/reimburse-store.ts',
    'apps/hub-server/src/store/sqlite-reimburse-store.ts',
    'apps/hub-console/src/api/schemas/reimburse.ts',
    'apps/hub-console/src/api/segments/reimburse.ts',
    'apps/hub-console/src/hooks/useReimburse.ts',
    'apps/hub-console/src/features/reimburse/sub',
  ];
  for (const relativePath of required) {
    if (!fs.existsSync(path.join(repoRoot, relativePath))) {
      errors.push(`${relativePath}: reimburse 模板缺少必需边界`);
    }
  }
  for (const relativePath of forbidden) {
    if (fs.existsSync(path.join(repoRoot, relativePath))) {
      errors.push(`${relativePath}: reimburse 已迁移，禁止恢复旧路径或兼容 alias`);
    }
  }
}

export function verifyArchitecture(repoRoot = process.cwd(), options = {}) {
  const root = path.resolve(repoRoot);
  const errors = [];
  const rootPackagePath = path.join(root, 'package.json');
  const rootPackage = readJson(rootPackagePath, errors, 'package.json');
  const versionPath = path.join(root, 'VERSION');
  const version = fs.existsSync(versionPath) ? fs.readFileSync(versionPath, 'utf8').trim() : '';
  if (!version) errors.push('VERSION: 根版本文件不存在或为空');

  const packages = discoverPackages(root);
  const patterns = workspacePatterns(rootPackage).map((entry) => ({ entry, matcher: globPattern(entry) }));
  for (const packageDirectory of packages) {
    if (!patterns.some(({ matcher }) => matcher.test(packageDirectory))) {
      errors.push(`${packageDirectory}/package.json: package 未登记在根 workspaces`);
    }
  }
  for (const { entry, matcher } of patterns) {
    if (!packages.some((packageDirectory) => matcher.test(packageDirectory))) {
      errors.push(`package.json: workspace “${entry}” 没有匹配 apps/* 或 integrations/* package`);
    }
  }

  const locks = listFiles(root, { skip: new Set(['.git', 'node_modules', 'dist', 'build', 'coverage']) })
    .filter((filePath) => path.basename(filePath) === 'package-lock.json')
    .map((filePath) => toPosix(path.relative(root, filePath)));
  for (const lock of locks) {
    if (lock !== 'package-lock.json') errors.push(`${lock}: 全仓只允许根 package-lock.json`);
  }
  if (!locks.includes('package-lock.json')) errors.push('package-lock.json: 根 lockfile 不存在');

  if (rootPackage && rootPackage.version !== version) {
    errors.push(`package.json: version ${rootPackage.version ?? '<missing>'} 与 VERSION ${version || '<missing>'} 不一致`);
  }
  const packageNames = new Map();
  const packageManifests = new Map();
  for (const packageDirectory of packages) {
    const manifest = readJson(path.join(root, packageDirectory, 'package.json'), errors, `${packageDirectory}/package.json`);
    if (!manifest) continue;
    if (manifest.version !== version) {
      errors.push(`${packageDirectory}/package.json: version ${manifest.version ?? '<missing>'} 与 VERSION ${version} 不一致`);
    }
    if (manifest.name) packageNames.set(packageDirectory, manifest.name);
    packageManifests.set(packageDirectory, manifest);
  }

  const hubPackages = ['apps/hub-contracts', 'apps/hub-server', 'apps/hub-console'].filter((directory) =>
    fs.existsSync(path.join(root, directory, 'package.json')),
  );
  for (const packageDirectory of hubPackages) {
    const manifest = packageManifests.get(packageDirectory);
    for (const field of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
      for (const dependency of Object.keys(manifest?.[field] ?? {})) {
        for (const otherDirectory of hubPackages) {
          if (otherDirectory === packageDirectory) continue;
          const otherName = packageNames.get(otherDirectory);
          const forbidden =
            packageDirectory === 'apps/hub-contracts' ||
            (packageDirectory === 'apps/hub-server' && otherDirectory === 'apps/hub-console') ||
            (packageDirectory === 'apps/hub-console' && otherDirectory === 'apps/hub-server');
          if (forbidden && otherName && matchesPackage(dependency, otherName)) {
            errors.push(`${packageDirectory}/package.json: ${field} 禁止依赖 ${otherName}`);
          }
        }
      }
    }
    const files = sourceFiles(root, packageDirectory);
    for (const file of files) {
      const specifiers = importSpecifiers(file.content);
      for (const specifier of specifiers) {
        for (const otherDirectory of hubPackages) {
          if (otherDirectory === packageDirectory) continue;
          const otherName = packageNames.get(otherDirectory);
          let crossesBoundary = otherName ? matchesPackage(specifier, otherName) : false;
          if (specifier.startsWith('.')) {
            const resolved = path.resolve(path.dirname(file.absolutePath), specifier);
            const otherRoot = path.join(root, otherDirectory);
            crossesBoundary ||= resolved === otherRoot || resolved.startsWith(`${otherRoot}${path.sep}`);
          }
          const forbidden =
            packageDirectory === 'apps/hub-contracts' ||
            (packageDirectory === 'apps/hub-server' && otherDirectory === 'apps/hub-console') ||
            (packageDirectory === 'apps/hub-console' && otherDirectory === 'apps/hub-server');
          if (crossesBoundary && forbidden) {
            errors.push(`${file.relativePath}: 禁止从 ${packageDirectory} import ${otherDirectory}（${specifier}）`);
          }
        }
      }
    }
  }

  const contractsManifest = rootPackage && fs.existsSync(path.join(root, 'apps/hub-contracts/package.json'))
    ? readJson(path.join(root, 'apps/hub-contracts/package.json'), errors, 'apps/hub-contracts/package.json')
    : null;
  const forbiddenContractDependency = /^(?:fastify|react|react-dom|node:sqlite)(?:\/|$)/;
  for (const file of sourceFiles(root, 'apps/hub-contracts')) {
    for (const specifier of importSpecifiers(file.content)) {
      if (forbiddenContractDependency.test(specifier)) {
        errors.push(`${file.relativePath}: contracts 禁止 import ${specifier}`);
      }
    }
  }
  if (contractsManifest) {
    for (const field of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
      for (const dependency of Object.keys(contractsManifest[field] ?? {})) {
        if (forbiddenContractDependency.test(dependency)) {
          errors.push(`apps/hub-contracts/package.json: ${field} 禁止声明 ${dependency}`);
        }
      }
    }
  }

  const violations = collectMigrationViolations(root);
  compareBaseline(violations, options.baseline ?? ARCHITECTURE_BASELINE, errors);
  verifyReimburseTemplate(root, errors);
  return { errors, violations, summary: { packages: packages.length, baseline: violations.length } };
}

function runCli() {
  const args = process.argv.slice(2);
  const printBaseline = args.includes('--print-baseline');
  const rootArg = args.find((entry) => entry !== '--print-baseline');
  const root = rootArg ? path.resolve(rootArg) : process.cwd();
  const result = verifyArchitecture(root, printBaseline ? { baseline: [] } : {});
  if (printBaseline) {
    console.log(JSON.stringify(result.violations, null, 2));
    return;
  }
  if (result.errors.length > 0) {
    console.error(`软件架构检查失败（${result.errors.length} 项）：`);
    for (const error of result.errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }
  console.log(`软件架构检查通过：${result.summary.packages} 个 workspace package，${result.summary.baseline} 项迁移基线。`);
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) runCli();
