import type { ArtifactRef } from '../schemas.js';

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
 * 开放 string（向后兼容 + 可注入），但写侧 `pm-requests.ts:CreateArtifactRequestSchema` 仍保留
 * `z.enum(ROBOTICS_OWNER_GROUP_VALUES)` 收紧（闭集校验下沉到"路由层 VocabularyRegistry 校验器"
 * 尚未实现，先复用这份值避免两处硬编码漂移，见 pm-core.ts 同类先例注释）。
 */
export const ROBOTICS_OWNER_GROUP_VALUES = [
  'mechanical',
  'electrical',
  'ec',
  'vision',
] as const;

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
