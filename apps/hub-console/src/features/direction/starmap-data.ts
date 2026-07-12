import type { RoboticsDiscipline } from '@teamhub/hub-contracts';
import type { DirectionColumn } from './learning-direction-utils';

/**
 * 学习方向「星图」数据构建（纯函数，零依赖、零 DOM）——3D 视图的骨架。
 *
 * 设计决策（2026-07-12 星图轮）：**不引 three.js**——three 压缩后 ~700kB，会让刚消除的
 * 500kB chunk 警告在星图懒加载 chunk 上复发，且实验室可能离线、零新依赖最稳；节点规模
 * 二十上下，自写投影/旋转/拖拽足够（见 DirectionStarmap.tsx）。
 *
 * 颜色语义 = 用户拍板：四色代表四个组，跨工种知识点用**混色**（所涉组颜色的 RGB 均值）。
 * 布局确定性：四工种枢纽落正四面体顶点（最大分离），知识点落在所连枢纽的加权质心方向，
 * 同 id 恒同位（伪随机抖动由 id 哈希驱动），无物理模拟、渲染前一次算完。
 */

export const DISCIPLINE_COLORS: Record<RoboticsDiscipline, string> = {
  ec: '#22d3ee', // 电控 = 信号青
  electrical: '#34d399', // 电路 = 绿
  mechanical: '#f5a623', // 机械 = 琥珀
  vision: '#a78bfa', // 视觉 = 紫
};
export const CROSSCUT_COLOR = '#e6edf7'; // AI 边界（各工种通用）= 中性白
export const GAP_COLOR = '#f87171'; // 缺口标记 = 红（与基准线 drift 红同语义：该补的事）

/** 混色 = RGB 分量均值（跨工种知识点用所涉组的颜色混出）。单色输入原样返回（规范成小写）。 */
export function blendColors(hexes: readonly string[]): string {
  if (hexes.length === 0) return CROSSCUT_COLOR;
  let r = 0;
  let g = 0;
  let b = 0;
  for (const hex of hexes) {
    const v = hex.replace('#', '');
    r += parseInt(v.slice(0, 2), 16);
    g += parseInt(v.slice(2, 4), 16);
    b += parseInt(v.slice(4, 6), 16);
  }
  const to = (n: number) =>
    Math.round(n / hexes.length)
      .toString(16)
      .padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

/**
 * 知识点 → 关联工种标注（v1 手工标注，键 = 契约里的条目原文）。
 * 契约 `ROBOTICS_LEARNING_MAP` 的条目是口述原句、不带结构化 target；星图需要"连接相关知识
 * 领域"，在 console 侧补这层标注而不动契约——本视图仍是实验（用户看效果再定去留），标注跟着
 * 视图走、可整体撤销。条目文案若在契约里被改动，这里查不到 → 该点退化为单色挂本组（安全降级）。
 */
const ITEM_TARGETS: Record<string, RoboticsDiscipline[]> = {
  '学机械结构——判断机构对电控好不好搞': ['mechanical'],
  '拿 demo 图提前敲代码，而不是看到实物再慢慢试': ['mechanical'],
  '可额外多学，防止边界收窄': [],
  '知道机械怎么做以及怎么走线——哪些线可以走在铝管里、哪些外露、哪些地方防短路': ['mechanical'],
  '额外学一些电控，防止变成接线员': ['ec'],
  '对物理空间有更深理解，知道机械结构的极限': [],
  '与电路对接时哪些地方留孔，同时不影响结构强度': ['electrical'],
  知道电控的极限: ['ec'],
  '知道模拟和现实的区别，防止变成大号 MCP': ['ec'],
};

export interface StarmapNode {
  id: string;
  kind: 'hub' | 'skill' | 'crosscut' | 'gap';
  /** hub = discipline 值（组件用 GROUP_LABEL_KEY 取 i18n 标签）；其余 = 展示原文。 */
  label: string;
  detail?: string;
  disciplines: RoboticsDiscipline[];
  color: string;
  base: readonly [number, number, number];
  size: number;
  severity?: 'emerging' | 'pressing';
  /** gap：缺的方向原始数组（详情面板出 chips；tooltip 仍用 detail 拼串）。 */
  skills?: readonly string[];
  isMine?: boolean;
}

export interface StarmapLink {
  source: string;
  target: string;
  color: string;
  kind: 'own' | 'cross' | 'gap';
}

export interface Starmap {
  nodes: StarmapNode[];
  links: StarmapLink[];
}

const R = 170; // 场景半径（投影前的世界单位）

/** 正四面体顶点（归一化），顺序 = ec / electrical / mechanical / vision。 */
const HUB_DIRECTION: Record<RoboticsDiscipline, readonly [number, number, number]> = (() => {
  const s = 1 / Math.sqrt(3);
  return {
    ec: [s, s, s],
    electrical: [s, -s, -s],
    mechanical: [-s, s, -s],
    vision: [-s, -s, s],
  };
})();

function hubPos(d: RoboticsDiscipline): [number, number, number] {
  const [x, y, z] = HUB_DIRECTION[d];
  return [x * R, y * R, z * R];
}

/** 简易字符串哈希 → [0,1)，驱动确定性抖动（同 id 恒同位）。 */
function hash01(input: string, seed: number): number {
  let h = 2166136261 ^ seed;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

function normalizeTo(v: [number, number, number], len: number): [number, number, number] {
  const n = Math.hypot(v[0], v[1], v[2]) || 1;
  return [(v[0] / n) * len, (v[1] / n) * len, (v[2] / n) * len];
}

/** 知识点坐标：源枢纽加权 + 目标枢纽求质心方向，半径收进 0.8R，再按 id 哈希加正交抖动。 */
function skillPos(
  source: RoboticsDiscipline,
  targets: readonly RoboticsDiscipline[],
  id: string,
): [number, number, number] {
  const s = hubPos(source);
  const acc: [number, number, number] = [s[0] * 1.25, s[1] * 1.25, s[2] * 1.25];
  for (const tgt of targets) {
    const p = hubPos(tgt);
    acc[0] += p[0];
    acc[1] += p[1];
    acc[2] += p[2];
  }
  const radius = targets.length > 0 ? R * 0.78 : R * 0.94;
  const base = normalizeTo(acc, radius);
  const j = (k: number) => (hash01(id, k) - 0.5) * R * 0.34;
  return [base[0] + j(1), base[1] + j(2), base[2] + j(3)];
}

/** 缺口坐标：贴在所属枢纽外侧（1.12R 方向），按 id 抖开。 */
function gapPos(d: RoboticsDiscipline, id: string): [number, number, number] {
  const p = normalizeTo([...hubPos(d)] as [number, number, number], R * 1.12);
  const j = (k: number) => (hash01(id, k) - 0.5) * R * 0.26;
  return [p[0] + j(4), p[1] + j(5), p[2] + j(6)];
}

/**
 * 由学习方向视图（buildDirectionView 产物）构建星图。
 * 节点 = 4 枢纽 + 知识点（混色）+ AI 边界（居中连四组）+ 种子/实时缺口（红标挂本组）。
 */
export function buildStarmap(
  columns: readonly DirectionColumn[],
  crosscutSummary: string,
  mineDiscipline: RoboticsDiscipline | null,
): Starmap {
  const nodes: StarmapNode[] = [];
  const links: StarmapLink[] = [];

  for (const column of columns) {
    const d = column.discipline;
    nodes.push({
      id: `hub-${d}`,
      kind: 'hub',
      label: d,
      detail: column.note,
      disciplines: [d],
      color: DISCIPLINE_COLORS[d],
      base: hubPos(d),
      size: 13,
      isMine: mineDiscipline === d,
    });
  }

  for (const column of columns) {
    const d = column.discipline;
    column.crossSkillItems.forEach((item, idx) => {
      const targets = ITEM_TARGETS[item] ?? [];
      const involved: RoboticsDiscipline[] = [d, ...targets];
      const id = `skill-${d}-${idx}`;
      nodes.push({
        id,
        kind: 'skill',
        label: item,
        disciplines: involved,
        color: blendColors(involved.map((x) => DISCIPLINE_COLORS[x])),
        base: skillPos(d, targets, id),
        size: 6.5,
      });
      links.push({ source: id, target: `hub-${d}`, color: DISCIPLINE_COLORS[d], kind: 'own' });
      for (const tgt of targets) {
        links.push({
          source: id,
          target: `hub-${tgt}`,
          color: blendColors([DISCIPLINE_COLORS[d], DISCIPLINE_COLORS[tgt]]),
          kind: 'cross',
        });
      }
    });

    for (const seed of column.seedGaps) {
      const id = `gap-seed-${seed.id}`;
      nodes.push({
        id,
        kind: 'gap',
        label: seed.statement,
        disciplines: [d],
        color: DISCIPLINE_COLORS[d],
        base: gapPos(d, id),
        size: 8,
        severity: 'pressing',
      });
      links.push({ source: id, target: `hub-${d}`, color: GAP_COLOR, kind: 'gap' });
    }
    for (const gap of column.liveGaps) {
      const id = `gap-live-${gap.id}`;
      nodes.push({
        id,
        kind: 'gap',
        label: gap.factStatement,
        detail: gap.neededSkills.join(' · ') || undefined,
        disciplines: [d],
        color: DISCIPLINE_COLORS[d],
        base: gapPos(d, id),
        size: 7,
        severity: gap.severity,
        skills: gap.neededSkills.length > 0 ? [...gap.neededSkills] : undefined,
      });
      links.push({ source: id, target: `hub-${d}`, color: GAP_COLOR, kind: 'gap' });
    }
  }

  // AI 边界横切：四面体质心（原点）微抬，连四组——「各工种通用」的几何直译。
  nodes.push({
    id: 'crosscut-ai',
    kind: 'crosscut',
    label: crosscutSummary,
    disciplines: [],
    color: CROSSCUT_COLOR,
    base: [0, 18, 0],
    size: 8,
  });
  for (const column of columns) {
    links.push({
      source: 'crosscut-ai',
      target: `hub-${column.discipline}`,
      color: CROSSCUT_COLOR,
      kind: 'cross',
    });
  }

  return { nodes, links };
}
