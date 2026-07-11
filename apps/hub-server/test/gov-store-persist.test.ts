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

  // ① 硬化：appendArtifact 图纸提交日志 round-trip——写一条 → 返回钉 submittedVia=console + 有 id；
  // 读磁盘断言 v2 分组字段（ownerGroup/season/robotCode/versionNo）+ mechanism/revision/submittedVia
  // 已落盘；重启新实例仍在（持久 + 来源 seam server 钉）。draft 携带路由派生的 kind/versionNo/revision。
  test('appendArtifact 后落盘 + 重启仍在（v2 分组字段 + submittedVia 钉 console，round-trip）', async () => {
    dir = await mkdtemp(join(tmpdir(), 'gov-artifact-'));
    const file = join(dir, 'gov.json');
    const store = await FileGovStore.create(file);

    // draft 不含 id/createdAt/submittedVia（ArtifactDraft 已 Omit；submittedVia 由 server 钉 console，C5）。
    // v2：调用方（路由）已把 kind/versionNo/revision 派生并并入 draft，新增分组维度 ownerGroup/season/robotCode。
    const art = await store.appendArtifact({
      kind: 'firmware',
      name: '底盘图纸',
      uri: 'artifact://drawings/chassis/v4.pdf',
      ownerGroup: 'electrical',
      season: '25',
      robotCode: 'R1',
      mechanism: '底盘',
      versionNo: 4,
      revision: 'v4',
      subType: 'driver',
      relatedCommit: 'abc1234',
    });
    expect(art.submittedVia).toBe('console'); // server 钉来源 seam
    expect(art.id).toBeTruthy(); // Store 补 id

    // 落盘断言：按新建记录的 id 定位（mechanism 可能与既有种子撞，id 是唯一的），
    // 断言 v2 分组字段 + mechanism/revision/versionNo/submittedVia 都已持久化。
    const onDisk = JSON.parse(await readFile(file, 'utf8'));
    const diskArt = onDisk.artifacts.find(
      (a: { id: string }) => a.id === art.id,
    );
    expect(diskArt).toBeDefined();
    expect(diskArt.ownerGroup).toBe('electrical');
    expect(diskArt.season).toBe('25');
    expect(diskArt.robotCode).toBe('R1');
    expect(diskArt.mechanism).toBe('底盘');
    expect(diskArt.versionNo).toBe(4);
    expect(diskArt.revision).toBe('v4');
    expect(diskArt.submittedVia).toBe('console');

    // 模拟重启：新实例从同文件加载，新建图纸日志仍在（round-trip survives restart）。
    const reloaded = await FileGovStore.create(file);
    const reloadedArt = (await reloaded.getSnapshot()).artifacts.find(
      (a) => a.id === art.id,
    );
    expect(reloadedArt).toBeDefined();
    expect(reloadedArt?.ownerGroup).toBe('electrical');
    expect(reloadedArt?.season).toBe('25');
    expect(reloadedArt?.robotCode).toBe('R1');
    expect(reloadedArt?.mechanism).toBe('底盘');
    expect(reloadedArt?.versionNo).toBe(4);
    expect(reloadedArt?.revision).toBe('v4');
    expect(reloadedArt?.submittedVia).toBe('console');
  });

  test('updateTaskStatus 后落盘 + 重启仍生效（statusSource clamp console）', async () => {
    dir = await mkdtemp(join(tmpdir(), 'gov-status-'));
    const file = join(dir, 'gov.json');
    const store = await FileGovStore.create(file);

    const updated = await store.updateTaskStatus('t-r1-dataset', 'done');
    expect(updated?.status).toBe('done');
    expect(updated?.statusSource).toBe('console');

    const reloaded = await FileGovStore.create(file);
    const t = (await reloaded.getSnapshot()).tasks.find((x) => x.id === 't-r1-dataset');
    expect(t?.status).toBe('done');
    expect(t?.statusSource).toBe('console');
  });

  test('waiveDependency 后落盘：状态转 waived，磁盘行仍保留 confirmedBy（G2 可审计）', async () => {
    dir = await mkdtemp(join(tmpdir(), 'gov-waive-'));
    const file = join(dir, 'gov.json');
    const store = await FileGovStore.create(file);

    const waived = await store.waiveDependency('dep-002');
    expect(waived?.status).toBe('waived');

    const onDisk = JSON.parse(await readFile(file, 'utf8'));
    const dep = onDisk.dependencies.find((d: { id: string }) => d.id === 'dep-002');
    expect(dep.status).toBe('waived');
    expect(dep.confirmedBy).not.toBeNull(); // 软删除保留内部凭证
  });

  test('updateTaskStatus / waiveDependency 未命中 id → null 且不落盘', async () => {
    dir = await mkdtemp(join(tmpdir(), 'gov-miss-'));
    const file = join(dir, 'gov.json');
    const store = await FileGovStore.create(file);
    const before = await readFile(file, 'utf8');

    expect(await store.updateTaskStatus('t-nope', 'done')).toBeNull();
    expect(await store.waiveDependency('dep-nope')).toBeNull();

    // 未命中不触发写盘：文件内容不变
    expect(await readFile(file, 'utf8')).toBe(before);
  });

  test('文件存在但损坏 → 抛（fail-closed，不静默用 seed 覆盖团队数据）', async () => {
    dir = await mkdtemp(join(tmpdir(), 'gov-corrupt-'));
    const file = join(dir, 'gov.json');
    await writeFile(file, '{"projectId":"prj-robots"}'); // 缺 tasks/artifacts 等必填
    await expect(FileGovStore.create(file)).rejects.toThrow();
  });

  // S1 接线（product-redefine-2026-07 §4.1/§9-①）：旧 gov.json 向后兼容硬要求（D-080 部署地雷教训）
  // ——本条构造一份「本步之前」落盘格式（无 seasons 字段）的快照，断言 fail-closed 加载不炸，
  // 且 GovernanceSnapshotSchema 的 `.default([])` 兜底把缺失字段补成空数组（而非静默丢弃/抛错）。
  test('旧 gov.json（无 seasons 字段）仍可加载（向后兼容，seasons 兜底空数组）', async () => {
    dir = await mkdtemp(join(tmpdir(), 'gov-legacy-noseasons-'));
    const file = join(dir, 'gov.json');
    const { seasons: _drop, ...legacySnapshot } = governanceScenarioFixture;
    await writeFile(file, JSON.stringify(legacySnapshot));

    const store = await FileGovStore.create(file);
    const snap = await store.getSnapshot();
    expect(snap.seasons).toEqual([]);
    // 旧文件其余字段仍完整加载（不是整体 fail-closed 拒收，只是新增字段兜底）。
    expect(snap.tasks.length).toBe(governanceScenarioFixture.tasks.length);
  });

  // 修复 #3：persist 失败 → 回滚刚追加的内存元素（避免「内存已变更 + 客户端 500 重试」产生重复）。
  // 制造确定性写失败：把承载目录换成文件 → persist 的 mkdir 抛 EEXIST。createTask 内存先 push 再 persist，
  // 失败后那条新任务必须从内存撤回（否则后续读 / 重试会看到这条幽灵记录）。
  test('createTask persist 失败 → 内存回滚（不留幽灵记录）', async () => {
    dir = await mkdtemp(join(tmpdir(), 'gov-rollback-'));
    const sub = join(dir, 'govdir');
    await mkdir(sub);
    const file = join(sub, 'gov.json');
    const store = await FileGovStore.create(file);
    const before = (await store.getSnapshot()).tasks.length;

    await rm(sub, { recursive: true, force: true });
    await writeFile(sub, 'blocker'); // 让下次 persist 失败

    await expect(
      store.createTask({
        projectId: 'prj-robots',
        groupId: 'grp-mech',
        title: '应被回滚',
        rawSummary: 'x',
        ownerId: null,
        collaboratorIds: [],
        robotTarget: 'R1',
        intrinsicComplexity: 'normal',
      }),
    ).rejects.toThrow();

    // 内存里不应残留那条任务（已回滚）
    expect((await store.getSnapshot()).tasks.length).toBe(before);
  });

  // 修复 #3：waiveDependency（idx 类）persist 失败 → 还原写前整条元素（status 不应停在 waived）。
  test('waiveDependency persist 失败 → 内存还原旧状态（不停在 waived）', async () => {
    dir = await mkdtemp(join(tmpdir(), 'gov-rollback-waive-'));
    const sub = join(dir, 'govdir');
    await mkdir(sub);
    const file = join(sub, 'gov.json');
    const store = await FileGovStore.create(file);
    const beforeStatus = (await store.getSnapshot()).dependencies.find(
      (d) => d.id === 'dep-002',
    )?.status;

    await rm(sub, { recursive: true, force: true });
    await writeFile(sub, 'blocker');

    await expect(store.waiveDependency('dep-002')).rejects.toThrow();

    const afterStatus = (await store.getSnapshot()).dependencies.find(
      (d) => d.id === 'dep-002',
    )?.status;
    expect(afterStatus).toBe(beforeStatus); // 还原写前状态，未停在 waived
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

  // 修复 #3：closeoutKbNode（按 name upsert）persist 失败 → 回滚。两条路径：
  //   ① 新增节点 + persist 失败 → knowledgeNodes 不增（移除刚 push 的新节点）。
  //   ② 覆盖既有节点 + persist 失败 → 旧节点被还原（不停在被覆盖的新内容）。
  test('closeoutKbNode 新增节点 persist 失败 → 内存回滚（knowledgeNodes 不增）', async () => {
    dir = await mkdtemp(join(tmpdir(), 'gov-rollback-kb-new-'));
    const sub = join(dir, 'govdir');
    await mkdir(sub);
    const file = join(sub, 'gov.json');
    const store = await FileGovStore.create(file);
    const before = (await store.getSnapshot()).knowledgeNodes.length;

    await rm(sub, { recursive: true, force: true });
    await writeFile(sub, 'blocker'); // 让下次 persist 失败

    await expect(
      store.closeoutKbNode({
        name: '踩过的坑：全新结案节点（应被回滚）',
        groupId: null,
        parentNodeId: null,
        resourceLinks: [],
      }),
    ).rejects.toThrow();

    // 新节点已被移除：数量回到写前
    expect((await store.getSnapshot()).knowledgeNodes.length).toBe(before);
  });

  test('closeoutKbNode 覆盖既有节点 persist 失败 → 旧节点被还原（不停在新内容）', async () => {
    dir = await mkdtemp(join(tmpdir(), 'gov-rollback-kb-upsert-'));
    const sub = join(dir, 'govdir');
    await mkdir(sub);
    const file = join(sub, 'gov.json');
    const store = await FileGovStore.create(file);

    // 取一个 seed 既有节点（按 name upsert 会命中它）
    const priorNodes = (await store.getSnapshot()).knowledgeNodes;
    const target = priorNodes.find((n) => n.name === '底盘 CAN 通信协议');
    expect(target).toBeDefined();
    const beforeCount = priorNodes.length;
    const beforeLinks = JSON.stringify(target?.resourceLinks);

    await rm(sub, { recursive: true, force: true });
    await writeFile(sub, 'blocker');

    await expect(
      store.closeoutKbNode({
        name: '底盘 CAN 通信协议', // 同 name → upsert 命中既有节点
        groupId: 'grp-ec',
        parentNodeId: null,
        resourceLinks: [{ label: '本次结案覆盖（应被回滚）', uri: 'archive://should-rollback' }],
      }),
    ).rejects.toThrow();

    const after = (await store.getSnapshot()).knowledgeNodes;
    const restored = after.find((n) => n.name === '底盘 CAN 通信协议');
    expect(after.length).toBe(beforeCount); // 未新增
    expect(restored?.id).toBe(target?.id); // 还是同一节点
    expect(JSON.stringify(restored?.resourceLinks)).toBe(beforeLinks); // 旧内容还原，未停在覆盖值
  });
});
