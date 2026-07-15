import { describe, expect, test } from 'vitest';
import { countUpValue, ringArc, sparklinePath } from '../src/components/viz/viz-math';

// viz 原语纯计算（VISUAL-VITALITY V0）：环弧长 / 折线 path / 数字滚动插值。
// 只测逻辑不测 DOM（overview-timeline.test 先例）。

describe('ringArc', () => {
  test('value=0 → 满偏移（空环）', () => {
    const arc = ringArc(0, 3, 20);
    expect(arc.dashOffset).toBeCloseTo(arc.circumference);
    expect(arc.pct).toBe(0);
  });

  test('value=max → 偏移 0（满环）', () => {
    const arc = ringArc(3, 3, 20);
    expect(arc.dashOffset).toBeCloseTo(0);
    expect(arc.pct).toBe(100);
  });

  test('超量与负值夹到 0–100', () => {
    expect(ringArc(5, 3, 20).pct).toBe(100);
    expect(ringArc(-1, 3, 20).pct).toBe(0);
  });

  test('max<=0 视为空环，不产出 NaN', () => {
    const arc = ringArc(2, 0, 20);
    expect(arc.pct).toBe(0);
    expect(Number.isFinite(arc.dashOffset)).toBe(true);
  });
});

describe('sparklinePath', () => {
  test('少于 2 个点 → 空串（调用方判「不渲染」）', () => {
    expect(sparklinePath([], 72, 24)).toBe('');
    expect(sparklinePath([5], 72, 24)).toBe('');
  });

  test('两点连一线：M 起 L 终，y 轴翻转（大值在上）', () => {
    const d = sparklinePath([0, 10], 72, 24, 2);
    expect(d).toBe('M2 22 L70 2');
  });

  test('全等值序列画水平中线', () => {
    const d = sparklinePath([4, 4, 4], 72, 24, 2);
    const ys = [...d.matchAll(/[ML]\S+ (\S+)/g)].map((m) => Number(m[1]));
    expect(new Set(ys).size).toBe(1);
    expect(ys[0]).toBe(12);
  });

  test('x 均匀铺满宽度', () => {
    const d = sparklinePath([1, 2, 3], 100, 20, 0);
    const xs = [...d.matchAll(/[ML](\S+) /g)].map((m) => Number(m[1]));
    expect(xs).toEqual([0, 50, 100]);
  });
});

describe('countUpValue', () => {
  test('progress 0 → 0，1 → target（取整）', () => {
    expect(countUpValue(42, 0)).toBe(0);
    expect(countUpValue(42, 1)).toBe(42);
  });

  test('progress 越界夹到 0–1', () => {
    expect(countUpValue(42, -0.5)).toBe(0);
    expect(countUpValue(42, 2)).toBe(42);
  });

  test('ease-out：前半程走过大半路程且单调不减', () => {
    expect(countUpValue(100, 0.5)).toBeGreaterThan(50);
    let prev = -1;
    for (let p = 0; p <= 1; p += 0.1) {
      const v = countUpValue(100, p);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });
});
