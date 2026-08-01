import { describe, expect, test } from 'vitest';
import type { MemberPublic, TaskWithMeta } from '@teamhub/hub-contracts';
import {
  POOL_STALE_DAYS,
  countPostedNodes,
  isCrossOrgOwner,
  isStalePosted,
  needsCrossClaimConfirm,
  needsPartner,
  ownerGroupOf,
  sortedPostedTasks,
  stalenessDays,
} from '../src/shared/lib/pool-utils';

// 挂单池（TASK-POST-CLAIM，D-088）界面层纯函数单测——不测 DOM/RTL（本仓「测逻辑不测 DOM」风格，
// 同 checklist-utils.ts / myview-utils.ts）。红线：本文件断言只涉及对事的派生，无任何按人聚合/排行。

function task(overrides: Partial<TaskWithMeta>): TaskWithMeta {
  return {
    id: 't-1',
    projectId: 'p-1',
    groupId: 'grp-ec',
    title: '任务',
    rawSummary: '原话',
    status: 'pending',
    statusSource: 'console',
    ownerId: null,
    collaboratorIds: [],
    intrinsicComplexity: 'normal',
    lastProgressAt: null,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    isBig: false,
    ...overrides,
  };
}

function member(overrides: Partial<MemberPublic>): MemberPublic {
  return {
    id: 'm-1',
    displayName: '张三',
    role: 'member',
    grade: 'sophomore',
    groupId: 'grp-ec',
    status: 'idle',
    currentTaskId: null,
    updatedBy: 'console',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('stalenessDays / isStalePosted：滞留时长分档（对事）', () => {
  const now = new Date('2026-07-15T00:00:00.000Z');

  test('挂了 14 天：向下取整到天', () => {
    expect(stalenessDays('2026-07-01T00:00:00.000Z', now)).toBe(14);
  });
  test('未来 createdAt（异常数据）→ 夹到 0，不出负值', () => {
    expect(stalenessDays('2026-08-01T00:00:00.000Z', now)).toBe(0);
  });
  test('POOL_STALE_DAYS 阈值：>= 判红档', () => {
    expect(POOL_STALE_DAYS).toBe(14);
    expect(isStalePosted(13)).toBe(false);
    expect(isStalePosted(14)).toBe(true);
    expect(isStalePosted(30)).toBe(true);
  });
});

describe('sortedPostedTasks：isPostedTask 过滤 + 按滞留时长降序', () => {
  test('只留无主且非 done/shelved 的任务，挂最久排最前', () => {
    const tasks = [
      task({ id: 't-newer', ownerId: null, createdAt: '2026-07-10T00:00:00.000Z' }),
      task({ id: 't-oldest', ownerId: null, createdAt: '2026-07-01T00:00:00.000Z' }),
      task({ id: 't-owned', ownerId: 'm-9', createdAt: '2026-06-01T00:00:00.000Z' }),
      task({ id: 't-done', ownerId: null, status: 'done', createdAt: '2026-05-01T00:00:00.000Z' }),
      task({ id: 't-shelved', ownerId: null, status: 'shelved', createdAt: '2026-05-01T00:00:00.000Z' }),
    ];
    const posted = sortedPostedTasks(tasks);
    expect(posted.map((t) => t.id)).toEqual(['t-oldest', 't-newer']);
  });
  test('不改传入数组（纯派生）', () => {
    const tasks = [
      task({ id: 'a', ownerId: null, createdAt: '2026-07-10T00:00:00.000Z' }),
      task({ id: 'b', ownerId: null, createdAt: '2026-07-01T00:00:00.000Z' }),
    ];
    sortedPostedTasks(tasks);
    expect(tasks.map((t) => t.id)).toEqual(['a', 'b']);
  });
});

describe('ownerGroupOf / isCrossOrgOwner：跨组认领判定', () => {
  const members = [member({ id: 'm-ec', groupId: 'grp-ec' }), member({ id: 'm-vis', groupId: 'grp-vision' })];

  test('owner 组归属；未知 id / 无主 → null', () => {
    expect(ownerGroupOf(members, 'm-ec')).toBe('grp-ec');
    expect(ownerGroupOf(members, 'm-missing')).toBeNull();
    expect(ownerGroupOf(members, null)).toBeNull();
  });
  test('owner 外组 = 跨组；同组 / 无主 = 非跨组', () => {
    expect(isCrossOrgOwner(task({ groupId: 'grp-ec', ownerId: 'm-vis' }), members)).toBe(true);
    expect(isCrossOrgOwner(task({ groupId: 'grp-ec', ownerId: 'm-ec' }), members)).toBe(false);
    expect(isCrossOrgOwner(task({ groupId: 'grp-ec', ownerId: null }), members)).toBe(false);
  });
});

describe('needsPartner：待本组搭档黄标条件', () => {
  const members = [member({ id: 'm-vis', groupId: 'grp-vision' })];

  test('外组认领且无搭档 → 需补位', () => {
    const t = task({ groupId: 'grp-ec', ownerId: 'm-vis', partnerMemberId: undefined });
    expect(needsPartner(t, members)).toBe(true);
  });
  test('已补搭档 → 不需（缺口已填）', () => {
    const t = task({ groupId: 'grp-ec', ownerId: 'm-vis', partnerMemberId: 'm-x' });
    expect(needsPartner(t, members)).toBe(false);
  });
  test('本组认领 → 不需（非跨组）', () => {
    const t = task({ groupId: 'grp-vision', ownerId: 'm-vis' });
    expect(needsPartner(t, members)).toBe(false);
  });
});

describe('needsCrossClaimConfirm：待组长确认（仅大任务）', () => {
  const members = [member({ id: 'm-vis', groupId: 'grp-vision' })];

  test('大任务 + 跨组 + 未确认 → 需确认', () => {
    const t = task({ groupId: 'grp-ec', ownerId: 'm-vis', isBig: true, crossClaimConfirmedBy: undefined });
    expect(needsCrossClaimConfirm(t, true, members)).toBe(true);
  });
  test('简单活即便跨组 → 不需确认（不看大小看结构）', () => {
    const t = task({ groupId: 'grp-ec', ownerId: 'm-vis', isBig: false });
    expect(needsCrossClaimConfirm(t, false, members)).toBe(false);
  });
  test('已确认 → 不需（留名已在）', () => {
    const t = task({
      groupId: 'grp-ec',
      ownerId: 'm-vis',
      isBig: true,
      crossClaimConfirmedBy: { id: 'm-lead', displayName: '组长', source: 'console' },
    });
    expect(needsCrossClaimConfirm(t, true, members)).toBe(false);
  });
});

describe('countPostedNodes：我的视图空态 N（只对事）', () => {
  test('数 ownerId===null 的节点', () => {
    const nodes = [
      { ownerId: null },
      { ownerId: 'm-1' },
      { ownerId: null },
      { ownerId: 'm-2' },
    ];
    expect(countPostedNodes(nodes)).toBe(2);
  });
  test('空列表 → 0', () => {
    expect(countPostedNodes([])).toBe(0);
  });
});
