import { describe, expect, test } from 'vitest';
import { deriveBaselinePace, validateBaselineSegments } from '@teamhub/hub-contracts';
import type { BaselineMilestone, BaselineSegment } from '@teamhub/hub-contracts';
import { addDaysIso, applyMilestoneOffsetDays, setSegmentBoundary } from '../src/features/timeline/lib';

/**
 * TIMELINE-EDITOR 变换纯函数单测（测逻辑不测 DOM，overview-timeline.test 先例）：
 * 里程碑点击选偏移 + 实时 pace 预览链 + segment 低频调整边界改。
 */

const NOW_ISO = '2026-07-11T00:00:00.000Z';

function milestone(overrides: Partial<BaselineMilestone> & Pick<BaselineMilestone, 'id'>): BaselineMilestone {
  return {
    title: overrides.id,
    kind: 'milestone',
    plannedAt: '2026-07-11T00:00:00.000Z',
    status: 'pending',
    ...overrides,
  };
}

describe('applyMilestoneOffsetDays（里程碑点击选偏移）', () => {
  const milestones = [milestone({ id: 'm-1' }), milestone({ id: 'm-2' })];

  test('+7 天只动目标里程碑，其余原样', () => {
    const result = applyMilestoneOffsetDays(milestones, 'm-1', 7, NOW_ISO);
    expect(result[0].plannedAt).toBe('2026-07-18T00:00:00.000Z');
    expect(result[1]).toBe(milestones[1]);
  });

  test('days=0 =「今天完成」→ 对齐到 nowIso', () => {
    const result = applyMilestoneOffsetDays(milestones, 'm-2', 0, NOW_ISO);
    expect(result[1].plannedAt).toBe(NOW_ISO);
    expect(result[0]).toBe(milestones[0]);
  });

  test('-3 天向提前方向平移', () => {
    const result = applyMilestoneOffsetDays(milestones, 'm-1', -3, NOW_ISO);
    expect(result[0].plannedAt).toBe('2026-07-08T00:00:00.000Z');
  });
});

describe('实时 pace 反馈链（预览里程碑 → contracts deriveBaselinePace）', () => {
  test('偏移预览不改变 remaining（状态未动），但越过赛日后 pace 周数钳 1', () => {
    const milestones = [milestone({ id: 'm-1' }), milestone({ id: 'm-2' })];
    const anchors = { competitionDate: '2026-07-25T00:00:00.000Z' }; // 2 周后
    const before = deriveBaselinePace({ anchors, milestones }, new Date(NOW_ISO));
    expect(before).toEqual({ remaining: 2, weeksLeft: 2, perWeek: 1 });

    // 预览：m-1 推 15 天 → plannedAt 越过赛日（状态仍 pending，remaining 不变）
    const previewMilestones = applyMilestoneOffsetDays(milestones, 'm-1', 15, NOW_ISO);
    const after = deriveBaselinePace({ anchors, milestones: previewMilestones }, new Date(NOW_ISO));
    expect(after!.remaining).toBe(2);
    expect(previewMilestones[0].plannedAt > anchors.competitionDate).toBe(true);
  });
});

describe('setSegmentBoundary（segment 低频调整）', () => {
  const segments: BaselineSegment[] = [
    { kind: 'semester', startsAt: '2026-09-01T00:00:00.000Z', endsAt: '2026-12-01T00:00:00.000Z', label: '第一学期' },
    { kind: 'vacation', startsAt: '2027-01-01T00:00:00.000Z', endsAt: '2027-02-01T00:00:00.000Z', label: '寒假' },
  ];

  test('只改目标段目标端点，date input 值按 UTC 零点转 ISO', () => {
    const result = setSegmentBoundary(segments, 1, 'endsAt', '2027-02-15');
    expect(result[1].endsAt).toBe('2027-02-15T00:00:00.000Z');
    expect(result[1].startsAt).toBe(segments[1].startsAt);
    expect(result[0]).toBe(segments[0]);
  });

  test('改出倒挂段 → validateBaselineSegments 拦截（保存按钮禁用依据）', () => {
    const result = setSegmentBoundary(segments, 0, 'endsAt', '2026-08-01');
    expect(validateBaselineSegments(result)).not.toBeNull();
    expect(validateBaselineSegments(segments)).toBeNull();
  });
});

describe('addDaysIso', () => {
  test('跨月平移', () => {
    expect(addDaysIso('2026-01-30T00:00:00.000Z', 3)).toBe('2026-02-02T00:00:00.000Z');
  });
});
