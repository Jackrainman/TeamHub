import { describe, expect, test } from 'vitest';
import type { DirectionGap, Group, LearningDirectionEntry, LearningSeedGap } from '@teamhub/hub-contracts';
import { buildDirectionView } from '../src/features/direction/learning-direction-utils';

/**
 * 学习方向页（LEARN-DIRECTION-REDESIGN）纯函数单测——不测 DOM/RTL（本仓「测逻辑不测 DOM」
 * 风格同 myview.test.ts / console-pages.test.ts）。
 */

const MAP: LearningDirectionEntry[] = [
  { discipline: 'ec', crossSkillItems: ['学机械结构'] },
  { discipline: 'electrical', crossSkillItems: ['知道机械怎么走线'] },
  { discipline: 'mechanical', crossSkillItems: ['懂物理空间极限'] },
  { discipline: 'vision', crossSkillItems: ['知道电控极限'] },
];

const SEEDS: LearningSeedGap[] = [
  { id: 'seed-sim2real', discipline: 'ec', statement: 'sim2real 现状没人研究', milestoneRef: 'm-m1' },
];

const GROUPS: Pick<Group, 'id' | 'name'>[] = [
  { id: 'grp-ec', name: '电控' },
  { id: 'grp-mech', name: '机械' },
  { id: 'grp-circuit', name: '电路' },
  { id: 'grp-vision', name: '视觉' },
  { id: 'grp-program', name: '程序' }, // 不属于四个 discipline 之一
];

function gap(overrides: Partial<DirectionGap>): DirectionGap {
  return {
    id: 'gap-1',
    groupId: 'grp-ec',
    neededSkills: ['RTOS'],
    evidenceTaskIds: ['t-1'],
    evidenceNeedIds: ['need-1'],
    severity: 'emerging',
    factStatement: '电控组有 1 个待补缺口，方向：RTOS。',
    detectedBy: 'derived',
    detectedAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('buildDirectionView：地图 × 队内缺口 × 种子缺口合成', () => {
  test('四列恒全在场，顺序=地图静态顺序（无 session 时不个性化）', () => {
    const view = buildDirectionView(MAP, [], GROUPS, [], null);
    expect(view.columns.map((c) => c.discipline)).toEqual(['ec', 'electrical', 'mechanical', 'vision']);
    expect(view.columns.every((c) => !c.isMine)).toBe(true);
  });

  test('sessionGroupId 命中某 discipline → 该列排最前 + isMine，其余列仍在场（红线6：排序不过滤）', () => {
    const view = buildDirectionView(MAP, [], GROUPS, [], 'grp-vision');
    expect(view.columns[0]!.discipline).toBe('vision');
    expect(view.columns[0]!.isMine).toBe(true);
    expect(view.columns.map((c) => c.discipline).sort()).toEqual(
      ['ec', 'electrical', 'mechanical', 'vision'].sort(),
    );
    expect(view.columns.filter((c) => c.isMine)).toHaveLength(1);
  });

  test('sessionGroupId 指向不属于四 discipline 的组（程序组）→ 恒不个性化，无列 isMine', () => {
    const view = buildDirectionView(MAP, [], GROUPS, [], 'grp-program');
    expect(view.columns.every((c) => !c.isMine)).toBe(true);
    expect(view.columns.map((c) => c.discipline)).toEqual(['ec', 'electrical', 'mechanical', 'vision']);
  });

  test('实时缺口按 Group.name 归到对应 discipline 列', () => {
    const view = buildDirectionView(MAP, [], GROUPS, [gap({ groupId: 'grp-ec' })], null);
    const ecCol = view.columns.find((c) => c.discipline === 'ec')!;
    expect(ecCol.liveGaps).toHaveLength(1);
    expect(ecCol.liveGaps[0]!.factStatement).toContain('电控');
    expect(view.columns.find((c) => c.discipline !== 'ec')!.liveGaps).toEqual([]);
  });

  test('缺口所在组无法归类（程序组）→ 落进 unmatchedGaps，不强行挂某一列', () => {
    const view = buildDirectionView(
      MAP,
      [],
      GROUPS,
      [gap({ id: 'gap-program', groupId: 'grp-program', factStatement: '程序组有 1 个待补缺口。' })],
      null,
    );
    expect(view.unmatchedGaps).toHaveLength(1);
    expect(view.columns.every((c) => c.liveGaps.length === 0)).toBe(true);
  });

  test('种子缺口（sim2real）挂到 discipline=ec 的列，不经派生也恒在场', () => {
    const view = buildDirectionView(MAP, SEEDS, GROUPS, [], null);
    const ecCol = view.columns.find((c) => c.discipline === 'ec')!;
    expect(ecCol.seedGaps).toHaveLength(1);
    expect(ecCol.seedGaps[0]!.statement).toContain('sim2real');
    for (const col of view.columns) {
      if (col.discipline !== 'ec') expect(col.seedGaps).toEqual([]);
    }
  });

  test('discipline:null 的种子缺口（v1 无跨组承接位）→ 沉默，不挂进任何列', () => {
    const crossTeamSeed: LearningSeedGap = {
      id: 'seed-cross',
      discipline: null,
      statement: '跨组缺口示例',
      milestoneRef: 'm-x',
    };
    const view = buildDirectionView(MAP, [crossTeamSeed], GROUPS, [], null);
    expect(view.columns.every((c) => c.seedGaps.length === 0)).toBe(true);
  });

  test('I0/红线6：合成结果序列化后无人维度字段', () => {
    const view = buildDirectionView(MAP, SEEDS, GROUPS, [gap({})], 'grp-ec');
    const json = JSON.stringify(view);
    expect(json).not.toContain('memberId');
    expect(json).not.toContain('displayName');
  });
});
