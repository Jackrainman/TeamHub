import { afterEach, describe, expect, test } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { governanceScenarioFixture } from '@teamhub/hub-contracts';
import { FileGovStore } from '../src/store/file-gov-store.js';

// FileGovStore（v1 治理快照落盘）：镜像 FileKbStore 纪律——seed 起头 / 重启不丢 / H2 写链不中毒。
// 图纸提交日志（snapshot.artifacts）+ PM 录入（createTask）落盘累积，是「单一真相在服务器」的持久层。

describe('FileGovStore 落盘', () => {
  let dir = '';
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  test('文件不存在 → seed 起头（含图纸版本日志）并落一次盘', async () => {
    dir = await mkdtemp(join(tmpdir(), 'gov-seed-'));
    const file = join(dir, 'gov.json');

    const store = await FileGovStore.create(file);
    const snap = await store.getSnapshot();
    // seed 治理场景 + A6 图纸版本日志
    expect(snap.tasks.length).toBe(governanceScenarioFixture.tasks.length);
    expect(snap.artifacts.length).toBe(
      governanceScenarioFixture.artifacts.length,
    );
    expect(snap.artifacts.length).toBeGreaterThan(0);

    const onDisk = JSON.parse(await readFile(file, 'utf8'));
    expect(onDisk.projectId).toBe(governanceScenarioFixture.projectId);
    expect(onDisk.artifacts.length).toBe(
      governanceScenarioFixture.artifacts.length,
    );
  });

  test('createTask 后落盘 + 新实例从同文件加载（重启不丢）', async () => {
    dir = await mkdtemp(join(tmpdir(), 'gov-'));
    const file = join(dir, 'gov.json');

    const store = await FileGovStore.create(file);
    const task = await store.createTask({
      projectId: 'prj-robots',
      groupId: 'grp-mech',
      title: '落盘测试任务',
      rawSummary: '随手建一条要持久化',
      ownerId: null,
      collaboratorIds: [],
      robotTarget: 'R1',
      intrinsicComplexity: 'normal',
    });

    const onDisk = JSON.parse(await readFile(file, 'utf8'));
    expect(
      onDisk.tasks.some((t: { id: string }) => t.id === task.id),
    ).toBe(true);

    // 模拟重启：新实例从同一文件加载，新建任务仍在
    const reloaded = await FileGovStore.create(file);
    expect(
      (await reloaded.getSnapshot()).tasks.some((t) => t.id === task.id),
    ).toBe(true);
  });

  test('文件存在但损坏 → 抛（fail-closed，不静默用 seed 覆盖团队数据）', async () => {
    dir = await mkdtemp(join(tmpdir(), 'gov-corrupt-'));
    const file = join(dir, 'gov.json');
    await writeFile(file, '{"projectId":"prj-robots"}'); // 缺 tasks/artifacts 等必填
    await expect(FileGovStore.create(file)).rejects.toThrow();
  });

  // H2（AUDIT-FIXES）：一次写失败不能永久毒化写链。修复后下一次 createTask 仍能真正落盘。
  test('写失败后写链不中毒：恢复后下一次 createTask 仍能落盘', async () => {
    dir = await mkdtemp(join(tmpdir(), 'gov-h2-'));
    const sub = join(dir, 'govdir');
    await mkdir(sub);
    const file = join(sub, 'gov.json');
    const store = await FileGovStore.create(file); // 初次 persist OK

    // 制造确定性写失败：把承载目录换成普通文件 → 下次 persist 的 mkdir(sub) 抛 EEXIST。
    await rm(sub, { recursive: true, force: true });
    await writeFile(sub, 'blocker');
    await expect(
      store.createTask({
        projectId: 'prj-robots',
        groupId: 'grp-mech',
        title: '会写失败',
        rawSummary: 'x',
        ownerId: null,
        collaboratorIds: [],
        robotTarget: 'R1',
        intrinsicComplexity: 'normal',
      }),
    ).rejects.toThrow();

    // 修复目录后再写——若写链被毒化会「报成功却不落盘」；修复后必须真正写到磁盘。
    await rm(sub);
    await mkdir(sub);
    const recovered = await store.createTask({
      projectId: 'prj-robots',
      groupId: 'grp-mech',
      title: '恢复后落盘',
      rawSummary: 'y',
      ownerId: null,
      collaboratorIds: [],
      robotTarget: 'R1',
      intrinsicComplexity: 'normal',
    });

    const onDisk = JSON.parse(await readFile(file, 'utf8'));
    expect(
      onDisk.tasks.some((t: { id: string }) => t.id === recovered.id),
    ).toBe(true);
  });
});
