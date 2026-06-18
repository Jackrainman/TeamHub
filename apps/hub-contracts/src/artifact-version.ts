import type { ArtifactRef } from './schemas.js';

/**
 * 图纸档案 v2 版本派生（HUB-ARTIFACT-ARCHIVE-V2）——纯函数，无 IO，可单测。
 *
 * 「机械/电路分组的图纸版本库」：版本号按四键
 * `ownerGroup + season + robotCode + mechanism` 全等的 artifact 子集自增。
 * I0 守恒：这两个派生只读分组/版本维度，**不碰任何人员字段**（ArtifactRef 永无 person 维度）。
 * C5：versionNo / kind 是 server/路由钉的来源 seam，客户端不给——这里只提供计算口径。
 */
export interface ArtifactVersionKey {
  ownerGroup: NonNullable<ArtifactRef['ownerGroup']>;
  season: string;
  robotCode: string;
  mechanism: string;
}

/**
 * 下一版本号：过滤 `existing` 中四键（ownerGroup/season/robotCode/mechanism）全等者
 * → `max(versionNo ?? 0) + 1`；空集 → 1。
 *
 * 向后兼容：旧 seed/旧 JSON 缺 versionNo（视为 0），即便四键碰巧匹配也不抬高自增基线
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
      a.robotCode === key.robotCode &&
      a.mechanism === key.mechanism
    ) {
      const v = a.versionNo ?? 0;
      if (v > max) max = v;
    }
  }
  return max + 1;
}

/**
 * 派生 kind（C5：server/路由钉，非客户端给）。对齐 seed 惯例：
 * - 机械组 → `'report'`
 * - 电路图纸（subType==='drawing'）→ `'report'`
 * - 电路驱动（subType==='driver'）→ `'firmware'`
 */
export function deriveArtifactKind(
  ownerGroup: ArtifactVersionKey['ownerGroup'],
  subType: ArtifactRef['subType'],
): ArtifactRef['kind'] {
  if (ownerGroup === 'electrical' && subType === 'driver') return 'firmware';
  return 'report';
}
