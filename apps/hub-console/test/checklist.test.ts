import { describe, expect, test } from 'vitest';
import type { BaselineMilestonePublic } from '@teamhub/hub-contracts';
import {
  pickDefaultIouAnchor,
} from '../src/features/checklist/checklist-utils';
import { overdueDays } from '../src/shared/lib/date-utils';

// 门检查单 / 欠条（GATE-CHECKLIST-IOU，D-087）界面层纯函数单测——不测 DOM/RTL（本仓「测逻辑不
// 测 DOM」风格，同 identity.test.ts / myview.test.ts）。

function milestone(overrides: Partial<BaselineMilestonePublic>): BaselineMilestonePublic {
  return {
    id: 'm-1',
    title: '里程碑',
    kind: 'gate',
    plannedAt: '2026-08-01T00:00:00.000Z',
    status: 'pending',
    ...overrides,
  };
}

describe('pickDefaultIouAnchor：默认挂接=最近的未来待过门', () => {
  const now = new Date('2026-07-15T00:00:00.000Z');

  test('有未来门：取最近的未来 pending gate（按 plannedAt 最早）', () => {
    const milestones = [
      milestone({ id: 'm-far', plannedAt: '2026-09-01T00:00:00.000Z' }),
      milestone({ id: 'm-near', plannedAt: '2026-08-01T00:00:00.000Z' }),
      // 非 gate（里程碑）不作候选：
      milestone({ id: 'm-ms', kind: 'milestone', plannedAt: '2026-07-20T00:00:00.000Z' }),
      // 已过的门不作候选：
      milestone({ id: 'm-past', plannedAt: '2026-06-01T00:00:00.000Z' }),
      // 已过/已过的门（status passed）不作候选：
      milestone({ id: 'm-passed', status: 'passed', plannedAt: '2026-08-10T00:00:00.000Z' }),
    ];
    expect(pickDefaultIouAnchor(milestones, now)?.id).toBe('m-near');
  });

  test('全过期：所有门都在过去 → null（回落日期模式）', () => {
    const milestones = [
      milestone({ id: 'm-a', plannedAt: '2026-06-01T00:00:00.000Z' }),
      milestone({ id: 'm-b', plannedAt: '2026-05-01T00:00:00.000Z' }),
    ];
    expect(pickDefaultIouAnchor(milestones, now)).toBeNull();
  });

  test('空列表 → null', () => {
    expect(pickDefaultIouAnchor([], now)).toBeNull();
  });
});

describe('overdueDays：过期天数向下取整、最小 0', () => {
  test('已过期：向下取整到天', () => {
    const now = new Date('2026-07-15T00:00:00.000Z');
    expect(overdueDays('2026-06-05T00:00:00.000Z', now)).toBe(40);
  });
  test('未过期（未来到期日）→ 0', () => {
    const now = new Date('2026-07-15T00:00:00.000Z');
    expect(overdueDays('2026-08-01T00:00:00.000Z', now)).toBe(0);
  });
});
