import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { verifyArchitecture } from '../verify-architecture.mjs';

function write(root, relativePath, content) {
  const absolutePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, content, 'utf8');
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'teamhub-architecture-'));
  write(root, 'VERSION', '1.2.3\n');
  write(root, 'package-lock.json', '{}\n');
  write(root, 'package.json', JSON.stringify({ name: 'root', version: '1.2.3', workspaces: ['apps/*'] }));
  for (const [directory, name] of [
    ['apps/hub-contracts', '@teamhub/hub-contracts'],
    ['apps/hub-server', '@teamhub/hub-server'],
    ['apps/hub-console', '@teamhub/hub-console'],
  ]) {
    write(root, `${directory}/package.json`, JSON.stringify({ name, version: '1.2.3' }));
  }
  write(root, 'apps/hub-contracts/src/index.ts', "export const schema = 'ok';\n");
  write(root, 'apps/hub-server/src/index.ts', "import { schema } from '@teamhub/hub-contracts';\nexport { schema };\n");
  write(root, 'apps/hub-console/src/features/tasks/hooks.ts', "import { useQuery } from '@tanstack/react-query';\nexport const useTasks = () => useQuery({ queryKey: ['tasks'] });\n");
  return root;
}

test('accepts a single workspace graph and intended package dependency direction', (context) => {
  const root = fixture();
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  assert.deepEqual(verifyArchitecture(root, { baseline: [] }).errors, []);
});

test('reports workspace, lock, version and package-boundary violations together', (context) => {
  const root = fixture();
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  write(root, 'integrations/lark/package.json', JSON.stringify({ name: '@teamhub/lark', version: '0.0.1' }));
  write(root, 'apps/hub-server/package-lock.json', '{}');
  write(root, 'apps/hub-console/src/bad.ts', "import '@teamhub/hub-server';\n");
  write(root, 'apps/hub-contracts/src/bad.ts', "import React from 'react';\nimport 'node:sqlite';\nimport '@teamhub/hub-console';\n");
  write(root, 'apps/hub-contracts/package.json', JSON.stringify({
    name: '@teamhub/hub-contracts',
    version: '1.2.3',
    dependencies: { fastify: '*' },
  }));

  const messages = verifyArchitecture(root, { baseline: [] }).errors.join('\n');
  assert.match(messages, /package 未登记在根 workspaces/);
  assert.match(messages, /全仓只允许根 package-lock/);
  assert.match(messages, /version 0\.0\.1 与 VERSION 1\.2\.3 不一致/);
  assert.match(messages, /hub-console.*import.*hub-server/);
  assert.match(messages, /contracts 禁止 import react/);
  assert.match(messages, /contracts 禁止 import node:sqlite/);
  assert.match(messages, /dependencies 禁止声明 fastify/);
  assert.match(messages, /hub-contracts.*import.*hub-console/);
});

test('rejects new D-090 migration debt outside the exact baseline', (context) => {
  const root = fixture();
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  write(root, 'apps/hub-server/src/store/file-new-store.ts', [
    "import { PersistedFile } from './persisted-file.js';",
    'export class FileNewStore {}',
  ].join('\n'));
  write(root, 'apps/hub-server/src/routes/bad.ts', "import { SqliteDb } from '../store/sqlite-db.js';\n");
  write(root, 'apps/hub-server/src/main.ts', [
    'const data = process.env.TEAMHUB_NEW_DATA_FILE;',
    'const store = options.store ?? new InMemoryNewStore();',
  ].join('\n'));
  write(root, 'apps/hub-console/src/api/segments/mixed.ts', [
    "fetch('/api/tasks');",
    "fetch('/api/inventory');",
  ].join('\n'));
  write(root, 'apps/hub-console/src/features/tasks/TasksPage.tsx', 'const query = useQuery({});\n');

  const messages = verifyArchitecture(root, { baseline: [] }).errors.join('\n');
  assert.match(messages, /legacy-file-store/);
  assert.match(messages, /legacy-persisted-file/);
  assert.match(messages, /legacy-data-file-env/);
  assert.match(messages, /production-inmemory-fallback/);
  assert.match(messages, /route-imports-sqlite/);
  assert.match(messages, /multi-domain-client-segment/);
  assert.match(messages, /raw-react-query/);
});

test('requires stale or reduced baseline entries to be removed or tightened', (context) => {
  const root = fixture();
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const relativePath = 'apps/hub-console/src/features/tasks/TasksPage.tsx';
  write(root, relativePath, 'useQuery({});\n');
  const baseline = [{ rule: 'raw-react-query', file: relativePath, count: 2 }];

  let messages = verifyArchitecture(root, { baseline }).errors.join('\n');
  assert.match(messages, /技术债已减少，请同步收缩基线/);

  fs.rmSync(path.join(root, relativePath));
  messages = verifyArchitecture(root, { baseline }).errors.join('\n');
  assert.match(messages, /基线条目已清除，请删除该精确基线/);
});

test('freezes the completed reimburse vertical slice and rejects old aliases', (context) => {
  const root = fixture();
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  write(root, 'apps/hub-contracts/src/domains/reimburse/index.ts', 'export {}\n');
  write(root, 'apps/hub-contracts/src/reimbursement.ts', 'export {}\n');

  const messages = verifyArchitecture(root, { baseline: [] }).errors.join('\n');
  assert.match(messages, /reimburse 模板缺少必需边界/);
  assert.match(messages, /禁止恢复旧路径或兼容 alias/);
});
