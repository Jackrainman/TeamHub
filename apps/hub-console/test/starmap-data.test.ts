import { describe, expect, it } from 'vitest';
import type { DirectionColumn } from '../src/features/direction/learning-direction-utils';
import {
  blendColors,
  buildStarmap,
  DISCIPLINE_COLORS,
  GAP_COLOR,
} from '../src/features/direction/starmap-data';

/** 星图数据构建（纯函数层）——测逻辑不测 DOM（repo 既定风格），3D 组件本体走真机走查。 */

const column = (over: Partial<DirectionColumn> & { discipline: DirectionColumn['discipline'] }): DirectionColumn => ({
  note: undefined,
  crossSkillItems: [],
  liveGaps: [],
  seedGaps: [],
  isMine: false,
  ...over,
});

const FOUR: DirectionColumn[] = [
  column({ discipline: 'ec', crossSkillItems: ['学机械结构——判断机构对电控好不好搞'] }),
  column({ discipline: 'electrical' }),
  column({ discipline: 'mechanical' }),
  column({ discipline: 'vision' }),
];

describe('blendColors', () => {
  it('单色原样返回（规范小写）', () => {
    expect(blendColors(['#22D3EE'])).toBe('#22d3ee');
  });
  it('黑白均值 = 中灰', () => {
    expect(blendColors(['#000000', '#ffffff'])).toBe('#808080');
  });
  it('混色既不等于任一输入', () => {
    const mixed = blendColors([DISCIPLINE_COLORS.ec, DISCIPLINE_COLORS.mechanical]);
    expect(mixed).not.toBe(DISCIPLINE_COLORS.ec);
    expect(mixed).not.toBe(DISCIPLINE_COLORS.mechanical);
  });
});

describe('buildStarmap', () => {
  it('四枢纽齐全、颜色纯色、同 id 坐标确定性', () => {
    const a = buildStarmap(FOUR, 'AI 边界', null);
    const b = buildStarmap(FOUR, 'AI 边界', null);
    const hubs = a.nodes.filter((n) => n.kind === 'hub');
    expect(hubs).toHaveLength(4);
    expect(hubs.find((h) => h.label === 'ec')?.color).toBe(DISCIPLINE_COLORS.ec);
    expect(a.nodes.map((n) => n.base)).toEqual(b.nodes.map((n) => n.base));
  });

  it('跨工种知识点=混色 + 双边（本组 own + 目标 cross）', () => {
    const map = buildStarmap(FOUR, 'AI 边界', null);
    const skill = map.nodes.find((n) => n.kind === 'skill');
    expect(skill?.disciplines).toEqual(['ec', 'mechanical']);
    expect(skill?.color).toBe(blendColors([DISCIPLINE_COLORS.ec, DISCIPLINE_COLORS.mechanical]));
    const edges = map.links.filter((l) => l.source === skill?.id);
    expect(edges.map((e) => [e.target, e.kind]).sort()).toEqual([
      ['hub-ec', 'own'],
      ['hub-mechanical', 'cross'],
    ]);
  });

  it('AI 边界节点连四组；缺口红边挂本组；isMine 标对枢纽', () => {
    const withGap: DirectionColumn[] = [
      column({
        discipline: 'ec',
        seedGaps: [{ id: 'seed-sim2real', statement: 'sim2real 没人研究' }],
        liveGaps: [
          {
            id: 'g1',
            severity: 'pressing',
            factStatement: '缺 CAN',
            neededSkills: ['CAN'],
            needCount: 1,
          },
        ],
        isMine: true,
      }),
      FOUR[1],
      FOUR[2],
      FOUR[3],
    ];
    const map = buildStarmap(withGap, 'AI 边界', 'ec');
    expect(map.links.filter((l) => l.source === 'crosscut-ai')).toHaveLength(4);
    const gapLinks = map.links.filter((l) => l.kind === 'gap');
    expect(gapLinks).toHaveLength(2);
    expect(gapLinks.every((l) => l.target === 'hub-ec' && l.color === GAP_COLOR)).toBe(true);
    // 实时缺口保留 neededSkills 原始数组（详情面板出 chips）；种子缺口无此字段。
    expect(map.nodes.find((n) => n.id === 'gap-live-g1')?.skills).toEqual(['CAN']);
    expect(map.nodes.find((n) => n.id === 'gap-seed-seed-sim2real')?.skills).toBeUndefined();
    expect(map.nodes.find((n) => n.id === 'hub-ec')?.isMine).toBe(true);
    expect(map.nodes.find((n) => n.id === 'hub-vision')?.isMine).toBe(false);
  });
});
