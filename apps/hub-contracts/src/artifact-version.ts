import type { ArtifactRef } from './schemas.js';

/**
 * 图纸档案 v2 版本派生（HUB-ARTIFACT-ARCHIVE-V2）——纯函数，无 IO，可单测。
 *
 * 「组别（机械/电路/电控/视觉）的图纸版本库」：版本号按三键
 * `ownerGroup + season + mechanism` 全等的 artifact 子集自增——**机器人(robotCode) 不进键**：
 * 机器人是版本的属性，同一机构的版本线可跨机器人（v2 适配 R2、v3 适配 R1），版本号仍连续。
 * I0 守恒：这两个派生只读分组/版本维度，**不碰任何人员字段**（ArtifactRef 永无 person 维度）。
 * C5：versionNo / kind 是 server/路由钉的来源 seam，客户端不给——这里只提供计算口径。
 */
export interface ArtifactVersionKey {
  ownerGroup: NonNullable<ArtifactRef['ownerGroup']>;
  season: string;
  mechanism: string;
}

/**
 * 下一版本号：过滤 `existing` 中三键（ownerGroup/season/mechanism）全等者
 * → `max(versionNo ?? 0) + 1`；空集 → 1。机器人(robotCode) 故意不参与匹配，故跨机器人迭代连续编号。
 *
 * 向后兼容：旧 seed/旧 JSON 缺 versionNo（视为 0），即便键碰巧匹配也不抬高自增基线
 *（`?? 0`），新版本从 1 起；故旧裸数据落「未分组/历史」桶、不参与自增，最新即权威。
 */
export function nextArtifactVersionNo(
  existing: readonly ArtifactRef[],
  key: ArtifactVersionKey,
): number {
  let max = 0;
  for (const a of existing) {
    if (
      a.ownerGroup === key.ownerGroup &&
      a.season === key.season &&
      a.mechanism === key.mechanism
    ) {
      const v = a.versionNo ?? 0;
      if (v > max) max = v;
    }
  }
  return max + 1;
}

// deriveArtifactKind（kind 派生：机械组→report、电路驱动/电控/视觉→firmware）已移至
// `verticals/robotics.ts`（HUB-MODULARIZATION 第6步）：该函数的 ec/vision→firmware 分支是机器人
// 专属词汇判断，非核心逻辑。签名/行为不变，消费点仍从包入口 `@teamhub/hub-contracts` 导入，零改动。
