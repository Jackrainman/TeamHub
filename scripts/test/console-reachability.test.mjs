import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const ROOT = path.resolve(import.meta.dirname, '../..');
const SCRIPT = path.join(ROOT, 'scripts/console-reachability.mjs');
const ALLOW = path.join(ROOT, 'scripts/console-reachability.allow.json');

function run(...args) {
  return spawnSync(process.execPath, [SCRIPT, ...args], { cwd: ROOT, encoding: 'utf8' });
}

test('可达性门：当前仓库不可达违规为 0，且退出码为 0', () => {
  const result = run('--json');
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);

  assert.equal(report.violationCount, 0);
  assert.equal(report.entry, 'apps/hub-console/src/main.tsx');
  // 四页入口与注册表必须在可达集里（防止脚本把入口解析错后「空图全绿」）。
  for (const required of [
    'apps/hub-console/src/main.tsx',
    'apps/hub-console/src/App.tsx',
    'apps/hub-console/src/console-pages.tsx',
    'apps/hub-console/src/features/workbench/WorkbenchPage.tsx',
    'apps/hub-console/src/features/pm/calendar/CalendarPage.tsx',
    'apps/hub-console/src/features/reimburse/ReimbursePage.tsx',
    'apps/hub-console/src/features/settings/SettingsPage.tsx',
  ]) {
    assert.ok(report.reachableModules.includes(required), `${required} 应在可达集`);
  }
  assert.ok(report.reachableModules.length > 100, '可达集不应为空图');
});

test('可达性门：构建公共件受保护，退役页面不得复活', () => {
  const result = run('--json');
  const report = JSON.parse(result.stdout);
  assert.ok(report.testOnlyReachable.includes('apps/hub-console/build/bundle-budget.ts'), '构建预算脚本应由测试保持可达');
  assert.equal(report.reachableModules.some((file) => /features\/(?:project|pool|schedule|kb|inv|archive)\//.test(file)), false);
  for (const module of report.deadModules) {
    assert.ok(Number.isInteger(module.inDegree) && module.inDegree >= 0, `${module.path} 需要入度`);
  }
});

test('可达性门：允许清单每条都要有 path 与 reason', () => {
  const allow = JSON.parse(fs.readFileSync(ALLOW, 'utf8'));
  for (const entry of allow.files) {
    assert.ok(entry.path, '允许清单条目缺少 path');
    assert.ok(entry.reason && entry.reason.trim().length > 0, `${entry.path} 缺少 reason`);
  }
});
