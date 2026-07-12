import type { DirectionGap, Group, LearningDirectionEntry, LearningSeedGap } from '@teamhub/hub-contracts';
import { deriveGroupDiscipline, type OwnerGroup } from '../../verticals/robotics';

/**
 * 学习方向页（LEARN-DIRECTION-REDESIGN，product-redefine §5）纯派生——把三样东西合成一份视图：
 *  1. 跨工种学习地图（静态，`ROBOTICS_LEARNING_MAP`）
 *  2. 队内实时缺口（`deriveDirectionGaps` 派生，按 `Group.name` 归到对应 discipline 列）
 *  3. 已知种子缺口（静态，`ROBOTICS_LEARNING_SEED_GAPS`，如 sim2real）
 *
 * 个性化只做「排序 + 高亮」，不做「过滤 + 指派」（红线6）：`sessionGroupId` 非空时把命中的
 * discipline 列挪到最前 + 标 `isMine`，其余三列仍在场、原顺序不变；匿名模式 / 未登录传 null，
 * 恒用地图静态顺序，不做任何按人区分。不认识的组（程序汇报组 / 总联调哨兵组等）不挂进任何
 * discipline 列，落进 `unmatchedGaps`（沉默优先精神：宁可不归类，不瞎归类）。
 *
 * 抽成纯函数便于单测（本仓「测逻辑不测 DOM」风格，同 myview-utils.ts）。
 */

export interface DirectionColumnGap {
  id: string;
  severity: DirectionGap['severity'];
  factStatement: string;
  neededSkills: readonly string[];
  needCount: number;
}

export interface DirectionColumnSeed {
  id: string;
  statement: string;
}

export interface DirectionColumn {
  discipline: OwnerGroup;
  note?: string;
  crossSkillItems: readonly string[];
  liveGaps: DirectionColumnGap[];
  seedGaps: DirectionColumnSeed[];
  /** 当前登录人所在组落在这一列（红线5例外：本人看本人，只用于排序/高亮，非过滤）。 */
  isMine: boolean;
}

export interface DirectionView {
  columns: DirectionColumn[];
  /** 缺口所在组无法归到四个 discipline 之一（如程序汇报组/总联调哨兵组）——原样列出，不强行归类。 */
  unmatchedGaps: DirectionColumnGap[];
}

function toColumnGap(gap: DirectionGap): DirectionColumnGap {
  return {
    id: gap.id,
    severity: gap.severity,
    factStatement: gap.factStatement,
    neededSkills: gap.neededSkills,
    needCount: gap.evidenceNeedIds.length,
  };
}

export function buildDirectionView(
  map: readonly LearningDirectionEntry[],
  seedGaps: readonly LearningSeedGap[],
  groups: readonly Pick<Group, 'id' | 'name'>[],
  liveGaps: readonly DirectionGap[],
  sessionGroupId: string | null,
): DirectionView {
  const disciplineByGroupId = new Map<string, OwnerGroup | null>();
  for (const g of groups) disciplineByGroupId.set(g.id, deriveGroupDiscipline(g.name));

  const gapsByDiscipline = new Map<OwnerGroup, DirectionColumnGap[]>();
  const unmatchedGaps: DirectionColumnGap[] = [];
  for (const gap of liveGaps) {
    const discipline = disciplineByGroupId.get(gap.groupId) ?? null;
    if (discipline === null) {
      unmatchedGaps.push(toColumnGap(gap));
      continue;
    }
    const bucket = gapsByDiscipline.get(discipline);
    if (bucket) bucket.push(toColumnGap(gap));
    else gapsByDiscipline.set(discipline, [toColumnGap(gap)]);
  }

  const seedsByDiscipline = new Map<OwnerGroup, DirectionColumnSeed[]>();
  for (const seed of seedGaps) {
    if (seed.discipline === null) continue; // v1 无跨组种子承接位——沉默，不硬塞进某一列
    const bucket = seedsByDiscipline.get(seed.discipline);
    const entry = { id: seed.id, statement: seed.statement };
    if (bucket) bucket.push(entry);
    else seedsByDiscipline.set(seed.discipline, [entry]);
  }

  const myDiscipline = sessionGroupId
    ? (disciplineByGroupId.get(sessionGroupId) ?? null)
    : null;

  const columns: DirectionColumn[] = map.map((entry) => ({
    discipline: entry.discipline,
    note: entry.note,
    crossSkillItems: entry.crossSkillItems,
    liveGaps: gapsByDiscipline.get(entry.discipline) ?? [],
    seedGaps: seedsByDiscipline.get(entry.discipline) ?? [],
    isMine: myDiscipline !== null && entry.discipline === myDiscipline,
  }));

  // 个性化排序：稳定排序（isMine 列前置），非个性化时（myDiscipline===null）整体是 no-op。
  if (myDiscipline !== null) {
    columns.sort((a, b) => Number(b.isMine) - Number(a.isMine));
  }

  return { columns, unmatchedGaps };
}
