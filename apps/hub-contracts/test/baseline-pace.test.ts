import { describe, expect, test } from 'vitest';
import {
  deriveBaselinePace,
  generateRoboconBaselineTemplate,
  validateBaselineSegments,
} from '../src/index.js';
import type { BaselineMilestone, BaselineSegment } from '../src/index.js';

/**
 * TIMELINE-EDITOR 派生单测：deriveBaselinePace（实时 pace 反馈）+
 * validateBaselineSegments（segment 低频调整边界校验）。纯函数，人人能心算的规则。
 */

const NOW = new Date('2026-07-11T00:00:00.000Z');

function milestone(overrides: Partial<BaselineMilestone> & Pick<BaselineMilestone, 'id'>): BaselineMilestone {
  return {
    title: overrides.id,
    kind: 'milestone',
    plannedAt: '2026-07-11T00:00:00.000Z',
    status: 'pending',
    ...overrides,
  };
}

describe('deriveBaselinePace（TIMELINE-EDITOR 实时 pace 反馈）', () => {
  test('无 competitionDate 锚点 → null（数据不足不制造结论）', () => {
    expect(deriveBaselinePace({ anchors: {}, milestones: [milestone({ id: 'm-1' })] }, NOW)).toBeNull();
  });

  test('pending 计数 / 周数 / perWeek 人人能心算：4 个 pending、距赛日 8 周 → 每周 0.5 个', () => {
    const pace = deriveBaselinePace(
      {
        anchors: { competitionDate: '2026-09-05T00:00:00.000Z' }, // NOW 起恰好 8 周
        milestones: [
          milestone({ id: 'm-1' }),
          milestone({ id: 'm-2' }),
          milestone({ id: 'm-3' }),
          milestone({ id: 'm-4' }),
          milestone({ id: 'm-passed', status: 'passed' }),
          milestone({ id: 'm-missed', status: 'missed' }),
        ],
      },
      NOW,
    );
    expect(pace).toEqual({ remaining: 4, weeksLeft: 8, perWeek: 0.5 });
  });

  test('perWeek 向上取到 0.1：1 个 pending、距赛日 3 周 → 0.4（1/3≈0.33 宁可高估）', () => {
    const pace = deriveBaselinePace(
      {
        anchors: { competitionDate: '2026-08-01T00:00:00.000Z' },
        milestones: [milestone({ id: 'm-1' })],
      },
      NOW,
    );
    expect(pace!.remaining).toBe(1);
    expect(pace!.weeksLeft).toBe(3);
    expect(pace!.perWeek).toBe(0.4);
  });

  test('赛日已过 → 周数钳到 1，分母不为零', () => {
    const pace = deriveBaselinePace(
      {
        anchors: { competitionDate: '2026-07-01T00:00:00.000Z' },
        milestones: [milestone({ id: 'm-1' }), milestone({ id: 'm-2' })],
      },
      NOW,
    );
    expect(pace).toEqual({ remaining: 2, weeksLeft: 1, perWeek: 2 });
  });

  test('模板产物可直接吃：Robocon 模板 6 个 pending 里程碑全计入', () => {
    const template = generateRoboconBaselineTemplate({
      semesterStart: '2026-09-01T00:00:00.000Z',
      competitionDate: '2027-07-01T00:00:00.000Z',
    });
    const pace = deriveBaselinePace(template, NOW);
    expect(pace).not.toBeNull();
    expect(pace!.remaining).toBe(template.milestones.length);
  });
});

describe('validateBaselineSegments（TIMELINE-EDITOR segment 低频调整）', () => {
  const good: BaselineSegment[] = [
    { kind: 'semester', startsAt: '2026-09-01T00:00:00.000Z', endsAt: '2026-12-01T00:00:00.000Z', label: '第一学期' },
    { kind: 'vacation', startsAt: '2027-01-01T00:00:00.000Z', endsAt: '2027-02-01T00:00:00.000Z', label: '寒假' },
  ];

  test('合法段 → null；空数组 → null', () => {
    expect(validateBaselineSegments(good)).toBeNull();
    expect(validateBaselineSegments([])).toBeNull();
  });

  test('结束早于开始 → 报错并点名 label', () => {
    const bad: BaselineSegment[] = [
      good[0],
      { kind: 'vacuum', startsAt: '2027-02-01T00:00:00.000Z', endsAt: '2027-01-01T00:00:00.000Z', label: '反了的段' },
    ];
    expect(validateBaselineSegments(bad)).toContain('反了的段');
  });

  test('开始等于结束（零长段）→ 报错', () => {
    const zero: BaselineSegment[] = [
      { kind: 'vacuum', startsAt: '2027-01-01T00:00:00.000Z', endsAt: '2027-01-01T00:00:00.000Z', label: '零长' },
    ];
    expect(validateBaselineSegments(zero)).not.toBeNull();
  });

  test('日期无法解析 → 报错', () => {
    const bad: BaselineSegment[] = [
      { kind: 'semester', startsAt: 'not-a-date', endsAt: '2027-01-01T00:00:00.000Z', label: '坏日期' },
    ];
    expect(validateBaselineSegments(bad)).toContain('坏日期');
  });
});
