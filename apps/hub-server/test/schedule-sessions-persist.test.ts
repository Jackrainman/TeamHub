import { afterEach, describe, expect, test } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SCENARIO_WINDOW_WEEKDAY } from '@teamhub/hub-contracts';
import { FileGovStore } from '../src/store/file-gov-store.js';

// SCHEDULE-PERSIST（product-redefine-2026-07 §4.4/§9-③ 补落盘设计）：resourceSessions + relayHandoffs
// 此前连 JSON 落盘先例都没有（file-gov-store.ts:236 一带，只走内存、重启回 seed）——本刀补齐，落盘到
// 独立 schedule-sessions.json（两块合一，与 resources.json 同一套原子写 + 独立写链 + fail-closed 纪律，
// 详见 file-gov-store.ts ScheduleSessionsFileSchema 注释）。镜像 resource-route.test.ts 的
// 「FileGovStore 车落盘」round-trip 纪律。

describe('FileGovStore 排班落盘（schedule-sessions.json，重启不丢）', () => {
  let dir = '';
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  test('文件不存在 → seed 锚点窗口并落一份 schedule-sessions.json（与 gov.json/resources.json 同目录、互不混入）', async () => {
    dir = await mkdtemp(join(tmpdir(), 'gov-sched-seed-'));
    const file = join(dir, 'gov.json');
    const store = await FileGovStore.create(file);

    const onDisk = JSON.parse(
      await readFile(join(dir, 'schedule-sessions.json'), 'utf8'),
    );
    expect(Array.isArray(onDisk.resourceSessions)).toBe(true);
    expect(Array.isArray(onDisk.relayHandoffs)).toBe(true);
    expect(
      onDisk.resourceSessions.some((s: { id: string }) => s.id === 'sess-tonight-ec'),
    ).toBe(true);
    expect(onDisk.relayHandoffs).toEqual([]); // seed relayHandoffs 默认空

    // 反监视/隔离红线：resourceSessions/relayHandoffs 不混进 governance.json，也不混进 resources.json
    const gov = JSON.parse(await readFile(file, 'utf8'));
    expect(gov).not.toHaveProperty('resourceSessions');
    expect(gov).not.toHaveProperty('relayHandoffs');
    const resources = JSON.parse(
      await readFile(join(dir, 'resources.json'), 'utf8'),
    );
    expect(Array.isArray(resources)).toBe(true); // resources.json 仍是纯数组格式，未被本刀改动

    void store;
  });

  test('createResourceSession 后落盘 + 新实例从同文件加载（重启仍含新窗口）', async () => {
    dir = await mkdtemp(join(tmpdir(), 'gov-sched-create-'));
    const file = join(dir, 'gov.json');
    const store = await FileGovStore.create(file);

    const created = await store.createResourceSession({
      projectId: 'prj-robots',
      resourceId: 'res-r2',
      windowLabel: SCENARIO_WINDOW_WEEKDAY,
      orderInWindow: 1,
      holderGroupId: 'grp-mech',
      holderTaskId: null,
      invitedMemberIds: [],
      note: '落盘往返测试',
      confirmedBy: { id: 'm-progA', displayName: '程序A', source: 'console' },
      eta: null,
    });
    expect(created.id).toMatch(/^sess-new-/);
    expect(created.source).toBe('human');

    const onDisk = JSON.parse(
      await readFile(join(dir, 'schedule-sessions.json'), 'utf8'),
    );
    expect(
      onDisk.resourceSessions.some((s: { id: string }) => s.id === created.id),
    ).toBe(true);

    // 模拟重启：新实例从同一 schedule-sessions.json 加载，新窗口仍在
    const reloaded = await FileGovStore.create(file);
    const list = await reloaded.listResourceSessions();
    expect(list.some((s) => s.id === created.id)).toBe(true);
    expect(list.find((s) => s.id === created.id)?.note).toBe('落盘往返测试');
  });

  test('createResourceSessionsBatch 原子落盘 + 重启后整批仍在', async () => {
    dir = await mkdtemp(join(tmpdir(), 'gov-sched-batch-'));
    const file = join(dir, 'gov.json');
    const store = await FileGovStore.create(file);

    const created = await store.createResourceSessionsBatch([
      {
        projectId: 'prj-robots',
        resourceId: 'res-r1',
        windowLabel: SCENARIO_WINDOW_WEEKDAY,
        orderInWindow: 2,
        holderGroupId: 'grp-vision',
        holderTaskId: null,
        invitedMemberIds: ['m-should-be-cleared'],
        note: '批量条目一',
        confirmedBy: null,
        eta: null,
      },
      {
        projectId: 'prj-robots',
        resourceId: 'res-r1',
        windowLabel: SCENARIO_WINDOW_WEEKDAY,
        orderInWindow: 3,
        holderGroupId: 'grp-circuit',
        holderTaskId: null,
        invitedMemberIds: [],
        note: '批量条目二',
        confirmedBy: null,
        eta: null,
      },
    ]);
    expect(created).toHaveLength(2);
    expect(created[0].invitedMemberIds).toEqual([]); // I0 双保险：批量强制清空

    const reloaded = await FileGovStore.create(file);
    const list = await reloaded.listResourceSessions();
    for (const c of created) {
      expect(list.some((s) => s.id === c.id)).toBe(true);
    }
  });

  test('updateResourceSession（orderInWindow/eta）落盘 + 重启仍生效', async () => {
    dir = await mkdtemp(join(tmpdir(), 'gov-sched-update-'));
    const file = join(dir, 'gov.json');
    const store = await FileGovStore.create(file);

    const updated = await store.updateResourceSession('sess-tonight-ec', {
      orderInWindow: 5,
      eta: '约 22:30',
    });
    expect(updated?.orderInWindow).toBe(5);
    expect(updated?.eta).toBe('约 22:30');

    const reloaded = await FileGovStore.create(file);
    const list = await reloaded.listResourceSessions();
    const s = list.find((x) => x.id === 'sess-tonight-ec');
    expect(s?.orderInWindow).toBe(5);
    expect(s?.eta).toBe('约 22:30');
  });

  test('updateResourceSession 未命中 id → null 且不落盘（磁盘内容不变）', async () => {
    dir = await mkdtemp(join(tmpdir(), 'gov-sched-update-miss-'));
    const file = join(dir, 'gov.json');
    const store = await FileGovStore.create(file);
    const before = await readFile(join(dir, 'schedule-sessions.json'), 'utf8');

    expect(
      await store.updateResourceSession('sess-nope', { orderInWindow: 9 }),
    ).toBeNull();

    const after = await readFile(join(dir, 'schedule-sessions.json'), 'utf8');
    expect(after).toBe(before);
  });

  test('createRelayHandoff 落盘 + 重启仍在', async () => {
    dir = await mkdtemp(join(tmpdir(), 'gov-sched-handoff-'));
    const file = join(dir, 'gov.json');
    const store = await FileGovStore.create(file);

    const second = await store.createResourceSession({
      projectId: 'prj-robots',
      resourceId: 'res-r1',
      windowLabel: SCENARIO_WINDOW_WEEKDAY,
      orderInWindow: 1,
      holderGroupId: 'grp-vision',
      holderTaskId: null,
      invitedMemberIds: [],
      note: null,
      confirmedBy: null,
      eta: null,
    });
    const handoff = await store.createRelayHandoff({
      projectId: 'prj-robots',
      windowLabel: SCENARIO_WINDOW_WEEKDAY,
      fromSessionId: 'sess-tonight-ec',
      toSessionId: second.id,
      confirmedBy: null,
    });
    expect(handoff.id).toMatch(/^handoff-new-/);
    expect(handoff.source).toBe('console');

    const reloaded = await FileGovStore.create(file);
    const handoffs = await reloaded.listRelayHandoffs();
    expect(handoffs.some((h) => h.id === handoff.id)).toBe(true);
  });

  test('deleteRelayHandoff 落盘 + 重启不再出现', async () => {
    dir = await mkdtemp(join(tmpdir(), 'gov-sched-handoff-del-'));
    const file = join(dir, 'gov.json');
    const store = await FileGovStore.create(file);

    const second = await store.createResourceSession({
      projectId: 'prj-robots',
      resourceId: 'res-r1',
      windowLabel: SCENARIO_WINDOW_WEEKDAY,
      orderInWindow: 1,
      holderGroupId: 'grp-vision',
      holderTaskId: null,
      invitedMemberIds: [],
      note: null,
      confirmedBy: null,
      eta: null,
    });
    const handoff = await store.createRelayHandoff({
      projectId: 'prj-robots',
      windowLabel: SCENARIO_WINDOW_WEEKDAY,
      fromSessionId: 'sess-tonight-ec',
      toSessionId: second.id,
      confirmedBy: null,
    });

    expect(await store.deleteRelayHandoff(handoff.id)).toBe(true);
    expect(await store.deleteRelayHandoff(handoff.id)).toBe(false); // 二次删 → 404 语义（false）

    const reloaded = await FileGovStore.create(file);
    const handoffs = await reloaded.listRelayHandoffs();
    expect(handoffs.some((h) => h.id === handoff.id)).toBe(false);
  });

  test('deleteResourceSession 级联删接力交接线，两者落盘一致 + 重启后均不再出现', async () => {
    dir = await mkdtemp(join(tmpdir(), 'gov-sched-cascade-'));
    const file = join(dir, 'gov.json');
    const store = await FileGovStore.create(file);

    const second = await store.createResourceSession({
      projectId: 'prj-robots',
      resourceId: 'res-r1',
      windowLabel: SCENARIO_WINDOW_WEEKDAY,
      orderInWindow: 1,
      holderGroupId: 'grp-vision',
      holderTaskId: null,
      invitedMemberIds: [],
      note: null,
      confirmedBy: null,
      eta: null,
    });
    const handoff = await store.createRelayHandoff({
      projectId: 'prj-robots',
      windowLabel: SCENARIO_WINDOW_WEEKDAY,
      fromSessionId: 'sess-tonight-ec',
      toSessionId: second.id,
      confirmedBy: null,
    });

    expect(await store.deleteResourceSession(second.id)).toBe(true);

    const onDisk = JSON.parse(
      await readFile(join(dir, 'schedule-sessions.json'), 'utf8'),
    );
    expect(
      onDisk.resourceSessions.some((s: { id: string }) => s.id === second.id),
    ).toBe(false);
    expect(
      onDisk.relayHandoffs.some((h: { id: string }) => h.id === handoff.id),
    ).toBe(false); // 级联清除同一次落盘生效

    // 模拟重启：级联删除的两者都不再出现（无悬空箭头）
    const reloaded = await FileGovStore.create(file);
    const sessions = await reloaded.listResourceSessions();
    const handoffs = await reloaded.listRelayHandoffs();
    expect(sessions.some((s) => s.id === second.id)).toBe(false);
    expect(handoffs.some((h) => h.id === handoff.id)).toBe(false);
    // 未被删的一头仍在（sess-tonight-ec 是 seed 锚点，未删）
    expect(sessions.some((s) => s.id === 'sess-tonight-ec')).toBe(true);
  });

  test('deleteResourceSession 未命中 id → false 且不落盘', async () => {
    dir = await mkdtemp(join(tmpdir(), 'gov-sched-del-miss-'));
    const file = join(dir, 'gov.json');
    const store = await FileGovStore.create(file);
    const before = await readFile(join(dir, 'schedule-sessions.json'), 'utf8');

    expect(await store.deleteResourceSession('sess-nope')).toBe(false);

    const after = await readFile(join(dir, 'schedule-sessions.json'), 'utf8');
    expect(after).toBe(before);
  });

  test('录窗口/拉线 → 重启 → 再录：id 不复用（resourceSessionSeq/relayHandoffSeq 载入后重算，回归）', async () => {
    dir = await mkdtemp(join(tmpdir(), 'gov-sched-seq-'));
    const file = join(dir, 'gov.json');
    const store = await FileGovStore.create(file);

    const firstSession = await store.createResourceSession({
      projectId: 'prj-robots',
      resourceId: 'res-r1',
      windowLabel: SCENARIO_WINDOW_WEEKDAY,
      orderInWindow: 1,
      holderGroupId: 'grp-vision',
      holderTaskId: null,
      invitedMemberIds: [],
      note: null,
      confirmedBy: null,
      eta: null,
    });
    const firstHandoff = await store.createRelayHandoff({
      projectId: 'prj-robots',
      windowLabel: SCENARIO_WINDOW_WEEKDAY,
      fromSessionId: 'sess-tonight-ec',
      toSessionId: firstSession.id,
      confirmedBy: null,
    });

    // 模拟重启：新实例从同一 schedule-sessions.json 载入（含 first*）
    const reloaded = await FileGovStore.create(file);
    const secondSession = await reloaded.createResourceSession({
      projectId: 'prj-robots',
      resourceId: 'res-r2',
      windowLabel: SCENARIO_WINDOW_WEEKDAY,
      orderInWindow: 2,
      holderGroupId: 'grp-circuit',
      holderTaskId: null,
      invitedMemberIds: [],
      note: null,
      confirmedBy: null,
      eta: null,
    });
    const secondHandoff = await reloaded.createRelayHandoff({
      projectId: 'prj-robots',
      windowLabel: SCENARIO_WINDOW_WEEKDAY,
      fromSessionId: firstSession.id,
      toSessionId: secondSession.id,
      confirmedBy: null,
    });

    // 重启后建的 id 必须不同于重启前的（否则覆盖既有条目 / React key 冲突）
    expect(secondSession.id).not.toBe(firstSession.id);
    expect(secondHandoff.id).not.toBe(firstHandoff.id);
    const sessionIds = (await reloaded.listResourceSessions()).map((s) => s.id);
    const handoffIds = (await reloaded.listRelayHandoffs()).map((h) => h.id);
    expect(new Set(sessionIds).size).toBe(sessionIds.length);
    expect(new Set(handoffIds).size).toBe(handoffIds.length);
  });

  test('schedule-sessions.json 损坏 → 抛（fail-closed，不静默用 seed 覆盖团队已录的窗口/交接线）', async () => {
    dir = await mkdtemp(join(tmpdir(), 'gov-sched-corrupt-'));
    const file = join(dir, 'gov.json');
    // 先正常起一次，落出 gov.json + resources.json + schedule-sessions.json
    await FileGovStore.create(file);
    // 损坏 schedule-sessions.json（写入一个不符合 { resourceSessions, relayHandoffs } 形状的内容）
    await writeFile(join(dir, 'schedule-sessions.json'), '{"not":"the right shape"}');
    await expect(FileGovStore.create(file)).rejects.toThrow();
  });

  test('旧部署兼容：只有 gov.json + resources.json（无 schedule-sessions.json）仍可加载，不炸、自动补种', async () => {
    dir = await mkdtemp(join(tmpdir(), 'gov-sched-legacy-dir-'));
    const file = join(dir, 'gov.json');
    // 先起一次拿到 gov.json + resources.json + schedule-sessions.json（模拟已部署实例）。
    await FileGovStore.create(file);
    // 模拟「本刀上线前的旧数据目录」：删掉 schedule-sessions.json，只留 gov.json + resources.json。
    await rm(join(dir, 'schedule-sessions.json'));

    const reloaded = await FileGovStore.create(file);
    const sessions = await reloaded.listResourceSessions();
    expect(sessions.some((s) => s.id === 'sess-tonight-ec')).toBe(true); // 自动补种子锚点窗口

    const onDisk = JSON.parse(
      await readFile(join(dir, 'schedule-sessions.json'), 'utf8'),
    );
    expect(Array.isArray(onDisk.resourceSessions)).toBe(true); // 自动补落一份
  });
});
