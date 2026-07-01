import { deriveBlockAttributions, type GovernanceSnapshot } from './attribution.js';
import type { DirectionGap, DirectionGapSeverity, Group } from './pm-core.js';

/**
 * 方向缺口派生（S2，D-069）——纯函数，无 IO，可单测。
 *
 * A1 / I0 守恒：输出主键全是 `groupId` + 能力方向 + 证据 task/need id，
 * **没有 memberId / displayName / confirmedBy / 出场次数维度**——结构上无法反推或排序具体人。
 * 沉默优先（A4）：某组无 open/escalated 缺口 → 不产出该组（返回空数组而非占位）。
 *
 * 聚合口径：按 `Need.providerGroupId` 把 `open` + `escalated` 的 Need 归组
 *（`providerGroupId === null` 无法归组 → 跳过、沉默），取 `neededSkills` 并集 + 证据 id。
 * `severity` 融合 `deriveBlockAttributions` 的 `rootBlockerGroupId` 频次：某组若有 escalated
 * 缺口、或正作为根因瓶颈卡住下游 → `pressing`，否则 `emerging`。
 */
export function deriveDirectionGaps(
  snapshot: GovernanceSnapshot,
  now: string,
): DirectionGap[] {
  const groupsById = new Map<string, Group>();
  for (const g of snapshot.groups) groupsById.set(g.id, g);

  // 该组是否正作为根因瓶颈卡住下游（出现一次即升 pressing）。复用既有归因派生，不引入人维度。
  const rootBlockerGroups = new Set<string>();
  for (const attr of deriveBlockAttributions(snapshot, now)) {
    rootBlockerGroups.add(attr.rootBlockerGroupId);
  }

  interface Bucket {
    skills: Set<string>;
    taskIds: Set<string>;
    needIds: string[];
    hasEscalated: boolean;
  }
  const byGroup = new Map<string, Bucket>();

  for (const need of snapshot.needs) {
    if (need.status !== 'open' && need.status !== 'escalated') continue;
    if (need.providerGroupId === null) continue; // 无组可归 → 沉默（A1）
    const gid = need.providerGroupId;
    let bucket = byGroup.get(gid);
    if (!bucket) {
      bucket = { skills: new Set(), taskIds: new Set(), needIds: [], hasEscalated: false };
      byGroup.set(gid, bucket);
    }
    for (const s of need.neededSkills) bucket.skills.add(s);
    bucket.taskIds.add(need.onTaskId);
    bucket.needIds.push(need.id);
    if (need.status === 'escalated') bucket.hasEscalated = true;
  }

  const gaps: DirectionGap[] = [];
  // 确定性输出：按 groupId 排序。
  for (const gid of [...byGroup.keys()].sort()) {
    const bucket = byGroup.get(gid)!;
    const groupName = groupsById.get(gid)?.name ?? gid;
    const skills = [...bucket.skills].sort();
    const severity: DirectionGapSeverity =
      bucket.hasEscalated || rootBlockerGroups.has(gid) ? 'pressing' : 'emerging';
    const count = bucket.needIds.length;
    const factStatement =
      skills.length > 0
        ? `${groupName}组有 ${count} 个待补缺口，方向：${skills.join('、')}。`
        : `${groupName}组有 ${count} 个待补缺口。`;
    gaps.push({
      id: `gap-${gid}`,
      groupId: gid,
      neededSkills: skills,
      evidenceTaskIds: [...bucket.taskIds].sort(),
      evidenceNeedIds: [...bucket.needIds].sort(), // 确定性：与 taskIds/skills 同样排序

      severity,
      factStatement,
      detectedBy: 'derived',
      detectedAt: now,
    });
  }
  return gaps;
}
