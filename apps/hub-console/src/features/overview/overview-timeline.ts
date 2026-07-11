import type {
  BaselinePhase,
  BaselineSegment,
  SeasonBaselinePublic,
} from '@teamhub/hub-contracts';

/**
 * 总览「基准线 vs 实际」时间轴的纯位置计算（不碰 DOM，照本仓 theme.ts/console-pages「测逻辑不测 DOM」
 * 先例可单测）。所有位置 = 百分比（0–100），容器宽度 flex 自适应，故位置与像素无关、响应式天然成立。
 */

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;
const ms = (iso: string): number => new Date(iso).getTime();

export interface TimelineSpan {
  startMs: number;
  endMs: number;
}

/** 时间轴跨度 = 所有 segment 的最早起点 → 最晚终点。无 segment（残缺基准线）→ null。 */
export function timelineSpan(baseline: SeasonBaselinePublic): TimelineSpan | null {
  if (baseline.segments.length === 0) return null;
  let startMs = Infinity;
  let endMs = -Infinity;
  for (const seg of baseline.segments) {
    startMs = Math.min(startMs, ms(seg.startsAt));
    endMs = Math.max(endMs, ms(seg.endsAt));
  }
  if (!(endMs > startMs)) return null;
  return { startMs, endMs };
}

/** 某时间点在跨度上的百分比位置（clamp 到 0–100，越界锚点也不溢出容器）。 */
export function pctOf(span: TimelineSpan, iso: string): number {
  const raw = ((ms(iso) - span.startMs) / (span.endMs - span.startMs)) * 100;
  return Math.min(100, Math.max(0, raw));
}

/** 一段 [startsAt, endsAt) 在跨度上的 left%/width%（半开区间，宽度不为负）。 */
export function bandOf(
  span: TimelineSpan,
  band: { startsAt: string; endsAt: string },
): { leftPct: number; widthPct: number } {
  const leftPct = pctOf(span, band.startsAt);
  const rightPct = pctOf(span, band.endsAt);
  return { leftPct, widthPct: Math.max(0, rightPct - leftPct) };
}

/** now 落在哪个 segment（半开区间 [start, end)）；不在任何段内 → undefined。 */
export function currentSegment(
  segments: BaselineSegment[],
  nowMs: number,
): BaselineSegment | undefined {
  return segments.find((s) => ms(s.startsAt) <= nowMs && nowMs < ms(s.endsAt));
}

/** now 落在哪个 phase（半开区间 [start, end)）；不在任何阶段内 → undefined。 */
export function currentPhase(
  phases: BaselinePhase[],
  nowMs: number,
): BaselinePhase | undefined {
  return phases.find((p) => ms(p.startsAt) <= nowMs && nowMs < ms(p.endsAt));
}

/**
 * 从 now 到某日期的整周数（向上取整到 1 周起步的「距赛日 N 周」文案用）；
 * 已过（负）返回 0——赛日已过不显示负周数。
 */
export function weeksUntil(iso: string, nowMs: number): number {
  const diff = ms(iso) - nowMs;
  if (diff <= 0) return 0;
  return Math.ceil(diff / MS_PER_WEEK);
}
