import { afterEach, describe, expect, test } from 'vitest';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import {
  governanceScenarioFixture,
  scheduleScenarioFixture,
} from '@teamhub/hub-contracts';
import { SqliteGovStore } from '../src/store/sqlite-gov-store.js';

// SS3 SQLite 迁移脚本（scripts/migrate-gov-to-sqlite.mjs）样例副本往返比对：造 fixture 副本 → 跑迁移脚本
// （真 spawn `node` 子进程，即真实 CLI 路径）→ SqliteGovStore 打开产出库、逐字段比对零丢失。
// **铁律：只对副本操作**——全程在 mkdtemp 临时目录里造/读，绝不指向 ~/teamhub-data 真实数据。

const execFileAsync = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url)); // apps/hub-server/test
const MIGRATE_SCRIPT = resolve(HERE, '../../..', 'scripts/migrate-gov-to-sqlite.mjs');

describe('迁移脚本 gov.json → sqlite 往返比对（只对副本操作）', () => {
  let dir = '';
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
    dir = '';
  });

  test('迁移样例副本 → SqliteGovStore 打开 → getSnapshot 与源 gov.json 逐字段等价', async () => {
    dir = await mkdtemp(join(tmpdir(), 'sqlite-migrate-'));
    const govPath = join(dir, 'gov.json');
    const outPath = join(dir, 'gov.sqlite');
    await writeFile(govPath, JSON.stringify(governanceScenarioFixture, null, 2));
    await writeFile(
      join(dir, 'resources.json'),
      JSON.stringify(scheduleScenarioFixture.resources, null, 2),
    );
    await writeFile(
      join(dir, 'schedule-sessions.json'),
      JSON.stringify(
        {
          resourceSessions: scheduleScenarioFixture.resourceSessions,
          relayHandoffs: scheduleScenarioFixture.relayHandoffs,
        },
        null,
        2,
      ),
    );

    const { stdout } = await execFileAsync('node', [MIGRATE_SCRIPT, govPath, outPath]);
    expect(stdout).toMatch(/往返比对零丢失/);

    // 源 gov.json 未被脚本改动（只读铁律）
    const govAfter = JSON.parse(await readFile(govPath, 'utf8'));
    expect(govAfter.tasks.length).toBe(governanceScenarioFixture.tasks.length);

    // SqliteGovStore 打开迁移库，逐字段等价源
    const store = await SqliteGovStore.create(outPath);
    const snap = await store.getSnapshot();
    expect(snap.seasonId).toBe(governanceScenarioFixture.seasonId);
    expect(snap.projectId).toBe(governanceScenarioFixture.projectId);
    expect(snap.tasks).toEqual(governanceScenarioFixture.tasks);
    expect(snap.dependencies).toEqual(governanceScenarioFixture.dependencies);
    expect(snap.needs).toEqual(governanceScenarioFixture.needs);
    expect(snap.knowledgeNodes).toEqual(governanceScenarioFixture.knowledgeNodes);
    expect(snap.artifacts).toEqual(governanceScenarioFixture.artifacts);
    expect(snap.members).toEqual(governanceScenarioFixture.members);
    // schedule 域随 sibling 迁移
    expect(await store.listResources()).toEqual(scheduleScenarioFixture.resources);
    expect(await store.listResourceSessions()).toEqual(
      scheduleScenarioFixture.resourceSessions,
    );
    store.close();
  });

  test('旧 gov.json（无 seasons 字段）迁移不炸，seasons 兜底空数组（D-080 向后兼容）', async () => {
    dir = await mkdtemp(join(tmpdir(), 'sqlite-migrate-legacy-'));
    const govPath = join(dir, 'gov.json');
    const outPath = join(dir, 'gov.sqlite');
    const { seasons: _drop, ...legacy } = governanceScenarioFixture;
    await writeFile(govPath, JSON.stringify(legacy, null, 2));

    await execFileAsync('node', [MIGRATE_SCRIPT, govPath, outPath]);
    const store = await SqliteGovStore.create(outPath);
    const snap = await store.getSnapshot();
    expect(snap.seasons).toEqual([]);
    expect(snap.tasks.length).toBe(governanceScenarioFixture.tasks.length);
    store.close();
  });

  test('输出库已存在且无 --force → 脚本非零退出（防误覆盖）；--force 覆盖成功', async () => {
    dir = await mkdtemp(join(tmpdir(), 'sqlite-migrate-guard-'));
    const govPath = join(dir, 'gov.json');
    const outPath = join(dir, 'gov.sqlite');
    await writeFile(govPath, JSON.stringify(governanceScenarioFixture));
    await execFileAsync('node', [MIGRATE_SCRIPT, govPath, outPath]); // 首次成功
    await expect(
      execFileAsync('node', [MIGRATE_SCRIPT, govPath, outPath]),
    ).rejects.toThrow();
    // --force 覆盖成功
    const { stdout } = await execFileAsync('node', [
      MIGRATE_SCRIPT,
      govPath,
      outPath,
      '--force',
    ]);
    expect(stdout).toMatch(/往返比对零丢失/);
    expect(dirname(outPath)).toBe(dir); // sanity: 只在临时副本目录内操作
  });
});
