import { describe, expect, it } from 'vitest';
import { dragModeAt, movedRange, rangeForDrag, rangeOf, resizedRange } from '../src/features/pm/calendar/drag-schedule';

describe('calendar drag math', () => {
  it('only claims a resize edge inside the 6px hot zone of a real (unclipped) edge', () => {
    expect(dragModeAt(1, 200, false, false)).toBe('resize-start');
    expect(dragModeAt(6, 200, false, false)).toBe('resize-start');
    expect(dragModeAt(7, 200, false, false)).toBe('move');
    expect(dragModeAt(194, 200, false, false)).toBe('resize-end');
    expect(dragModeAt(100, 200, false, false)).toBe('move');
    // 被周边界裁掉的一端没有真实边缘，不能拉伸
    expect(dragModeAt(1, 200, true, false)).toBe('move');
    expect(dragModeAt(199, 200, false, true)).toBe('move');
  });

  it('moves a range by the anchor-to-target day delta and keeps its duration', () => {
    expect(movedRange('2026-11-16', '2026-11-18', '2026-11-17', '2026-11-20'))
      .toEqual({ plannedStart: '2026-11-19', plannedEnd: '2026-11-21' });
    expect(movedRange('2026-11-16', '2026-11-16', '2026-11-16', '2026-11-10'))
      .toEqual({ plannedStart: '2026-11-10', plannedEnd: '2026-11-10' });
  });

  it('resizes one edge and collapses instead of inverting the range', () => {
    expect(resizedRange('resize-start', '2026-11-16', '2026-11-18', '2026-11-17'))
      .toEqual({ plannedStart: '2026-11-17', plannedEnd: '2026-11-18' });
    expect(resizedRange('resize-end', '2026-11-16', '2026-11-18', '2026-11-20'))
      .toEqual({ plannedStart: '2026-11-16', plannedEnd: '2026-11-20' });
    expect(resizedRange('resize-start', '2026-11-16', '2026-11-18', '2026-11-25'))
      .toEqual({ plannedStart: '2026-11-18', plannedEnd: '2026-11-18' });
    expect(resizedRange('resize-end', '2026-11-16', '2026-11-18', '2026-11-10'))
      .toEqual({ plannedStart: '2026-11-16', plannedEnd: '2026-11-16' });
  });

  it('routes modes and normalises missing end dates', () => {
    expect(rangeForDrag('move', '2026-11-16', '2026-11-18', '2026-11-17', '2026-11-18'))
      .toEqual({ plannedStart: '2026-11-17', plannedEnd: '2026-11-19' });
    expect(rangeOf({ plannedStart: '2026-11-16', plannedEnd: null }))
      .toEqual({ plannedStart: '2026-11-16', plannedEnd: '2026-11-16' });
    expect(rangeOf({ plannedStart: null, plannedEnd: null })).toBeNull();
  });
});
