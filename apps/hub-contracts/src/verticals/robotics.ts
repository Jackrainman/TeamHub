import { z } from 'zod';
import type { ArtifactRef } from '../schemas.js';
import { buildCreateArtifactRequestSchema } from '../pm-requests.js';

/**
 * robotics 垂直包（HUB-MODULARIZATION 第 6 步：词汇注入收口）。
 *
 * 本文件只装「机器人战队租户」的词汇 + 词汇相关派生分支，不含核心逻辑——核心契约
 * （schemas.ts / inventory.ts / common.ts）已把对应字段从闭集 `z.enum` 放宽为开放/可注入的
 * `z.string()`，本文件是"今天唯一已注册的垂直包"往这些开放槽位灌的具体值 + 一次性派生函数。
 * 游戏工作室等其它垂直包应在自己的 `verticals/*.ts` 平行放一份同形文件，不改动本文件、不改动核心。
 *
 * 见 docs/design/modularization-feasibility.md §3.4-B（词汇注入三通道）+ §4（词汇替换表）+ §5 第6步。
 * 装配层尚未接线消费本文件（ModuleDescriptor.domainVocab 仍是占位接口，见 assembly.ts）——
 * 本步只做"核心开放 + 垂直包收纳具体值"的静态搬移，运行期真正按租户切换词汇留待 registerRoutes/
 * console 装配层落地时再接（不在本步范围，避免无法编译验证的连锁改动）。
 */

// ---------------------------------------------------------------------------
// 闭集词汇（供 UI 下拉 / write-schema 复用，避免与写侧 z.enum 两处漂移）
// ---------------------------------------------------------------------------

/**
 * 图纸档案组别闭集（机械/电路/电控/视觉）。`schemas.ts:ArtifactRefSchema.ownerGroup` 读侧已放宽为
 * 开放 string（向后兼容 + 可注入）；写侧闭集收紧同样只在这里（装配点）发生——
 * `pm-requests.ts:buildCreateArtifactRequestSchema` 是租户中立的工厂函数，本文件把这份值
 * **注入**给它，核心不再硬编码任何 robotics 字面量（AUDIT-DEBT-2026-07 §9-④ 解绑）。
 */
export const ROBOTICS_OWNER_GROUP_VALUES = [
  'mechanical',
  'electrical',
  'ec',
  'vision',
] as const;

/**
 * POST /api/artifacts 写侧请求契约的 robotics 具体化（AUDIT-DEBT-2026-07 §9-④ 解绑）：把闭集词汇
 * `ROBOTICS_OWNER_GROUP_VALUES` + "电路组必须带 subType" 这条 robotics 专属业务规则，注入
 * `pm-requests.ts` 的租户中立工厂函数。导出名与此前 `pm-requests.ts` 的静态导出同名——server.ts /
 * hub-console 的 `import { CreateArtifactRequestSchema } from '@teamhub/hub-contracts'` 走包入口
 * `export *`（index.ts 同时 `export * from './pm-requests.js'` 与 `export * from
 * './verticals/robotics.js'`），消费点零改动。
 */
export const CreateArtifactRequestSchema = buildCreateArtifactRequestSchema(
  ROBOTICS_OWNER_GROUP_VALUES,
  { requiredForGroup: 'electrical', groupLabel: '电路' },
);
export type CreateArtifactRequest = z.infer<typeof CreateArtifactRequestSchema>;

/**
 * `ArtifactRef.kind` 全量闭集（含机器人专属 firmware/rosbag）。核心 `schemas.ts` 已放宽为开放
 * string，这里是机器人租户 UI 下拉 / i18n 映射仍需要的"已知值"参考表——非强制校验。
 */
export const ROBOTICS_ARTIFACT_KIND_VALUES = [
  'firmware',
  'log',
  'rosbag',
  'image',
  'video',
  'report',
  'other',
] as const;

/**
 * 库存 BOM 类目闭集：motor/esc/controller 是机器人专属，mechanical/electronic/other 通用兜底。
 * `inventory.ts:PartCategorySchema` 已放宽为开放 string，这里是机器人租户 UI 下拉的已知值参考表。
 * 游戏工作室垂直包应换一份自己的类目值（如 GPU/CPU/devkit/license/consumable，见 §4 词汇替换表）。
 */
export const ROBOTICS_PART_CATEGORY_VALUES = [
  'motor',
  'esc',
  'controller',
  'mechanical',
  'electronic',
  'other',
] as const;

/**
 * `pm-core.ts:RobotTargetSchema` 三值闭集枚举仍保留作表单 fallback（step4 遗留，未在本步收口，
 * 见该文件头部注释）；这里额外导出同一份值供中性 `targetLabel` 槽的注入式下拉复用，两处不漂移。
 */
export const ROBOTICS_TARGET_LABEL_OPTIONS = ['R1', 'R2', 'shared'] as const;

// ---------------------------------------------------------------------------
// 词汇相关纯派生函数（从 artifact-version.ts / schedule-infra.ts 搬移，HUB-MODULARIZATION 第6步）
// ---------------------------------------------------------------------------

/**
 * 图纸档案 kind 派生（C5：server/路由钉，非客户端给）。**只对机器人 ownerGroup 词汇有意义**——
 * 非机器人租户应写自己的一份 derive 函数，不应复用本函数（本函数的 ec/vision 分支即机器人专属词汇）。
 * 对齐 seed 惯例：
 * - 机械组 → `'report'`
 * - 电路图纸（subType==='drawing'）→ `'report'`
 * - 电路驱动（subType==='driver'）→ `'firmware'`
 * - 电控 / 视觉 → `'firmware'`（多为固件/驱动；无 subType 细分）
 *
 * 原住 `artifact-version.ts`（HUB-MODULARIZATION 第6步移出，签名/行为不变，消费点仍从包入口
 * `@teamhub/hub-contracts` 导入，零改动）。
 */
export function deriveArtifactKind(
  ownerGroup: NonNullable<ArtifactRef['ownerGroup']>,
  subType: ArtifactRef['subType'],
): ArtifactRef['kind'] {
  if (ownerGroup === 'electrical' && subType === 'driver') return 'firmware';
  if (ownerGroup === 'ec' || ownerGroup === 'vision') return 'firmware';
  return 'report';
}

/**
 * 整机显示编号派生（D-072 §3.2 决定 K，**禁手写**）：`赛季后两位 + 位置 (+ 版本)`。
 *  - deriveDisplayCode('25','R1',1) → '25R1'
 *  - deriveDisplayCode('26','R1',2) → '26R1-v2'（v = 第几代整机，整机全拆重做才升，默认 v1）
 * position 直接用 RobotTarget（R1/R2/shared）；version<2 不显 `-vN`（默认 v1 不啰嗦）。
 *
 * 原住 `schedule-infra.ts`（HUB-MODULARIZATION 第6步移出）：presence-schedule 模块本就
 * robotics-only（§3.3 模块清单），本函数随词汇一起搬到垂直包更贴合归属；签名/行为不变，
 * 消费点仍从包入口 `@teamhub/hub-contracts` 导入，零改动。
 */
export function deriveDisplayCode(
  season: string,
  position: string,
  version = 1,
): string {
  const base = `${season}${position}`;
  return version > 1 ? `${base}-v${version}` : base;
}

// ---------------------------------------------------------------------------
// 跨工种学习地图（LEARN-DIRECTION-REDESIGN，product-redefine §5 + §6.3；静态数据文件 + schema）。
// 「学习方向」页（原「缺人方向」组级页改造）的静态半边：地图本身不读快照、不含人维度，
// 与队内缺口（`direction-gaps.ts` 的 `deriveDirectionGaps`）在 console 侧按 discipline 合成展示。
// 本节内容逐条对应用户 2026-07-11 口述原文（product-redefine-2026-07.md §5），不额外发挥。
// ---------------------------------------------------------------------------

/**
 * 四个任务分组 discipline 别名，与 `ROBOTICS_OWNER_GROUP_VALUES`（图纸档案组别闭集）同一份值——
 * D-072 分配任务单元本就是这四个：机械 / 电路 / 电控 / 视觉。两处概念不同（一个管图纸归属、
 * 一个管学习地图）但值域相同，复用类型定义避免两份字面量数组漂移。
 */
export type RoboticsDiscipline = (typeof ROBOTICS_OWNER_GROUP_VALUES)[number];
export const RoboticsDisciplineSchema = z.enum(ROBOTICS_OWNER_GROUP_VALUES);

/**
 * 跨工种学习地图条目：一个工种「该学别的工种什么」。
 * `note` = 原文括注定位（如"学得最多""相对朴素但要深"），非跨工种学习项本身，可选。
 * `crossSkillItems` = 原文口述逐条整理，**不发挥**（口述原句只做拆句/标点整理，不新增内容）。
 */
export const LearningDirectionEntrySchema = z.object({
  discipline: RoboticsDisciplineSchema,
  note: z.string().min(1).optional(),
  crossSkillItems: z.array(z.string().min(1)).min(1),
});
export type LearningDirectionEntry = z.infer<typeof LearningDirectionEntrySchema>;

/**
 * 跨工种学习地图 v1（product-redefine §5 用户口述原文整理）。顺序即原文出现顺序：
 * 电控 → 电路 → 机械 → 视觉。**静态资产，不随治理快照变化**——console 侧按 discipline
 * 把队内实时缺口（`DirectionGap`）挂到对应条目上，地图本身恒定。
 */
export const ROBOTICS_LEARNING_MAP: readonly LearningDirectionEntry[] = [
  {
    discipline: 'ec',
    note: '学得最多',
    crossSkillItems: [
      '学机械结构——判断机构对电控好不好搞',
      '拿 demo 图提前敲代码，而不是看到实物再慢慢试',
      '可额外多学，防止边界收窄',
    ],
  },
  {
    discipline: 'electrical',
    crossSkillItems: [
      '知道机械怎么做以及怎么走线——哪些线可以走在铝管里、哪些外露、哪些地方防短路',
      '额外学一些电控，防止变成接线员',
    ],
  },
  {
    discipline: 'mechanical',
    note: '相对朴素但要深',
    crossSkillItems: [
      '对物理空间有更深理解，知道机械结构的极限',
      '与电路对接时哪些地方留孔，同时不影响结构强度',
    ],
  },
  {
    discipline: 'vision',
    crossSkillItems: ['知道电控的极限', '知道模拟和现实的区别，防止变成大号 MCP'],
  },
] as const;

/**
 * AI 边界横切列（product-redefine §5：「各工种通用」，非某一工种专属细则）——用户只给了一条
 * 通用原则 + 一个例子，**不逐工种编造具体内容**：每个工种各自问自己「AI 在本领域能替什么 /
 * 我必须懂到能给 AI 验货的程度」，例子（写测试用例）是通用说明，非电控专属。
 */
export const AiBoundaryCrosscutSchema = z.object({
  summary: z.string().min(1),
  example: z.string().min(1),
});
export type AiBoundaryCrosscut = z.infer<typeof AiBoundaryCrosscutSchema>;

export const AI_BOUNDARY_CROSSCUT: AiBoundaryCrosscut = {
  summary: 'AI 在本领域能替什么、我必须懂到能给 AI 验货的程度——各工种通用，不分方向。',
  example: '例：AI 写测试用例大幅提效，但验收它需要的正是专业知识。',
};

/**
 * 学习方向的静态种子缺口：不经 `deriveDirectionGaps`（无对应 open Need）派生，而是
 * baseline 模板里程碑（`baseline.ts:TEMPLATE_NOTE_M1` / `id:'m-m1'`）本就写明的已知缺口——
 * 「sim2real 现状没人研究」（baseline-design.md §2 寒假段 + §6 待办明文，本步落地为第一条
 * 真实缺口种子）。`discipline:null` 表示无法归到单一工种（sim2real 是电控主导但非独占）；
 * 本步先归 `'ec'`（仿真调试的直接责任方），后续若产生真实 Need 应改走派生路径、本条件退场。
 */
export const LearningSeedGapSchema = z.object({
  id: z.string().min(1),
  discipline: RoboticsDisciplineSchema.nullable(),
  statement: z.string().min(1),
  milestoneRef: z.string().min(1),
});
export type LearningSeedGap = z.infer<typeof LearningSeedGapSchema>;

export const ROBOTICS_LEARNING_SEED_GAPS: readonly LearningSeedGap[] = [
  {
    id: 'seed-sim2real',
    discipline: 'ec',
    statement:
      'sim2real（仿真环境）现状没人研究——寒假里程碑「M1：sim2real 环境可用」的前置缺口，暂无人认领。',
    milestoneRef: 'm-m1',
  },
] as const;
