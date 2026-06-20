import { describe, it, expect } from 'vitest';
import type { ResourceSession } from '@teamhub/hub-contracts';
import { buildCarryOverDraft } from '../src/features/schedule/carry-over';

// 源 session 刻意带「成员名单 / eta / note」——验证结转时一律不跨日带（I0 + 轻量）。
const SRC: ResourceSession = {
  id: 'sess-1',
  projectId: 'prj-robots',
  resourceId: 'res-r1',
  windowLabel: '2026-06-19',
  orderInWindow: 2,
  holderGroupId: 'grp-ec',
  holderTaskId: 't-x',
  invitedMemberIds: ['m-progA', 'm-progB'],
  note: '昨天的临时备注',
  source: 'human',
  confirmedBy: { id: 'x', displayName: 'X', source: 'console' },
  eta: '约 22:30',
  createdAt: '2026-06-19T10:00:00.000Z',
};

const ACTOR = {
  id: 'console-relay',
  displayName: '队长（画布）',
  source: 'console' as const,
};

describe('buildCarryOverDraft（沿用上一天 · I0 结构 guard）', () => {
  it('换日并保接力序 / 机器人 / 组 / 任务', () => {
    const draft = buildCarryOverDraft(SRC, '2026-06-20', ACTOR);
    expect(draft.windowLabel).toBe('2026-06-20');
    expect(draft.resourceId).toBe('res-r1');
    expect(draft.projectId).toBe('prj-robots');
    expect(draft.holderGroupId).toBe('grp-ec');
    expect(draft.holderTaskId).toBe('t-x');
    expect(draft.orderInWindow).toBe(2);
    expect(draft.confirmedBy).toEqual(ACTOR);
  });

  it('绝不跨日结转成员维度（invitedMemberIds 恒 []）', () => {
    const draft = buildCarryOverDraft(SRC, '2026-06-20', ACTOR);
    expect(draft.invitedMemberIds).toEqual([]);
  });

  it('不结转预估时间与备注（eta / note 恒 null）', () => {
    const draft = buildCarryOverDraft(SRC, '2026-06-20', ACTOR);
    expect(draft.eta).toBeNull();
    expect(draft.note).toBeNull();
  });
});
