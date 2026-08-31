import { afterEach, describe, expect, test } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { InMemoryPmRepository } from './support/inmemory-gov-store.js';
import type { ActorRef } from '@teamhub/hub-contracts';

// 挂单认领制窄写方法三实现对称（TASK-POST-CLAIM，D-088）：claimTask/assignTask/setTaskPartner/
// confirmCrossClaim/completeTask/reviewTask 就地改 tasks[idx] 自己那簇留名字段；File/Sqlite 落盘 + 重启不丢；
// 清字段（assign 清 claimedAt/搭档/跨组确认、complete 清旧验收）落盘后该键消失。**I0**：本域无任何按人聚合。

const LEAD: ActorRef = { id: 'm-lead', displayName: '组长', source: 'human' };
const REVIEWER: ActorRef = { id: 'm-progA', displayName: '程序A', source: 'human' };
const OWNER: ActorRef = { id: 'm-progB', displayName: '程序B', source: 'human' };
// t-r1-integration = fixture 无主（convergence，ownerId=null）：File/Sqlite 认领落盘用例的种子挂单。
const POSTED_ID = 't-r1-integration';

describe('InMemoryPmRepository: 挂单认领制窄写字段簇 + 清空语义', () => {
  test('claim（pending→inProgress）/ 已有主 → null / assign 清 claimedAt·搭档·跨组确认', async () => {
    const store = new InMemoryPmRepository();
    const posted = await store.createTask({
      projectId: 'prj-robots',
      groupId: 'grp-mech',
      title: '挂单：整理线束',
      rawSummary: '无主的活',
      ownerId: null,
      collaboratorIds: [],
      intrinsicComplexity: 'trivial',
    });
    expect(posted.status).toBe('pending');

    const claimed = await store.claimTask(posted.id, 'm-mechD', '2026-06-11T00:00:00.000Z');
    expect(claimed?.ownerId).toBe('m-mechD');
    expect(claimed?.claimedAt).toBe('2026-06-11T00:00:00.000Z');
    expect(claimed?.status).toBe('inProgress'); // pending → inProgress
    expect(claimed?.statusSource).toBe('console'); // status 变 → statusSource 钉 console（C5）

    // 已有主 → null（路由据快照转 409）
    expect(await store.claimTask(posted.id, 'm-visionA', 'x')).toBeNull();

    // 设搭档 + 跨组确认，再 assign → 换主清空三者
    await store.setTaskPartner(posted.id, 'm-mechC', 't1');
    await store.confirmCrossClaim(posted.id, LEAD, 't2');
    const assigned = await store.assignTask(posted.id, 'm-progB', '转派给程序B练手', LEAD, 't3');
    expect(assigned?.ownerId).toBe('m-progB');
    expect(assigned?.assignReason).toBe('转派给程序B练手');
    expect(assigned?.assignedBy?.id).toBe('m-lead');
    expect(assigned?.claimedAt).toBeUndefined(); // 指派非认领
    expect(assigned?.partnerMemberId).toBeUndefined(); // 换主搭档失效
    expect(assigned?.crossClaimConfirmedBy).toBeUndefined(); // 换主确认失效
  });

  test('complete 清旧验收 / review accept 保持 done / reject 打回 inProgress + reviewNote', async () => {
    const store = new InMemoryPmRepository();
    const done = await store.completeTask('t-r1-newboard', OWNER, 't1');
    expect(done?.status).toBe('done');
    expect(done?.completedBy?.id).toBe('m-progB');

    // reject → inProgress + reviewNote 打回理由 + reviewedBy 留名
    const rejected = await store.reviewTask('t-r1-newboard', REVIEWER, 'reject', '虚焊，重焊', 't2');
    expect(rejected?.status).toBe('inProgress');
    expect(rejected?.reviewNote).toBe('虚焊，重焊');
    expect(rejected?.reviewedBy?.id).toBe('m-progA');

    // 新一轮 complete → 清 reviewedBy / reviewNote（重开后重新走验收）
    const done2 = await store.completeTask('t-r1-newboard', OWNER, 't3');
    expect(done2?.status).toBe('done');
    expect(done2?.reviewedBy).toBeUndefined();
    expect(done2?.reviewNote).toBeUndefined();

    // accept → reviewedBy 留名，status 保持 done
    const accepted = await store.reviewTask('t-r1-newboard', REVIEWER, 'accept', undefined, 't4');
    expect(accepted?.status).toBe('done');
    expect(accepted?.reviewedBy?.id).toBe('m-progA');
  });

  test('reviewNote 一律以本轮为准：reject 带理由后再 accept（无 note）→ 旧打回理由被清', async () => {
    const store = new InMemoryPmRepository();
    await store.completeTask('t-r1-newboard', OWNER, 't1');
    const rejected = await store.reviewTask('t-r1-newboard', REVIEWER, 'reject', '虚焊，重焊', 't2');
    expect(rejected?.reviewNote).toBe('虚焊，重焊');
    // 边角路径（store 层语义兜底；路由层另有 done 前置判）：直接 accept 不带 note → 残留清空
    const accepted = await store.reviewTask('t-r1-newboard', REVIEWER, 'accept', undefined, 't3');
    expect(accepted?.reviewNote).toBeUndefined();
    expect(accepted?.reviewedBy?.id).toBe('m-progA');
  });

  test('未知 id → 六方法皆 null', async () => {
    const store = new InMemoryPmRepository();
    expect(await store.claimTask('t-nope', 'm-x', 'x')).toBeNull();
    expect(await store.assignTask('t-nope', 'm-x', 'r', LEAD, 'x')).toBeNull();
    expect(await store.setTaskPartner('t-nope', 'm-x', 'x')).toBeNull();
    expect(await store.confirmCrossClaim('t-nope', LEAD, 'x')).toBeNull();
    expect(await store.completeTask('t-nope', LEAD, 'x')).toBeNull();
    expect(await store.reviewTask('t-nope', REVIEWER, 'accept', undefined, 'x')).toBeNull();
  });
});
