import type { BaselineMilestone, BaselineSegment } from '@teamhub/hub-contracts';

/**
 * 时间线编辑器纯函数（TIMELINE-EDITOR）：里程碑偏移与段边界调整的数据变换。
 * 纯函数、无 IO——组件只负责态（选中/预览/草稿），变换规则全部落在这里可单测。
 * 不引拖拽库：所有调整都是「点选偏移档位 / 日期输入」的离散变换。
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function addDaysIso(iso: string, days: number): string {
  return new Date(new Date(iso).getTime() + days * MS_PER_DAY).toISOString();
}

/**
 * 里程碑偏移（点击选偏移）：days===0 表示「今天完成」，对齐到 nowIso；
 * 其余按天数平移 plannedAt。只动目标里程碑，其余原样返回。
 */
export function applyMilestoneOffsetDays(
  milestones: readonly BaselineMilestone[],
  milestoneId: string,
  days: number,
  nowIso: string,
): BaselineMilestone[] {
  return milestones.map((m) =>
    m.id === milestoneId
      ? { ...m, plannedAt: days === 0 ? nowIso : addDaysIso(m.plannedAt, days) }
      : m,
  );
}

/**
 * 段边界定点改（segment 低频调整）：把第 index 段的 startsAt/endsAt 改成
 * date input 来的 'YYYY-MM-DD'（按 UTC 零点解析）。只动目标段目标端点。
 */
export function setSegmentBoundary(
  segments: readonly BaselineSegment[],
  index: number,
  field: 'startsAt' | 'endsAt',
  dateInput: string,
): BaselineSegment[] {
  return segments.map((segment, i) =>
    i === index ? { ...segment, [field]: new Date(dateInput).toISOString() } : segment,
  );
}
