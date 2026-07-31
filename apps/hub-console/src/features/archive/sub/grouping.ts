import type { ArtifactRef } from '@teamhub/hub-contracts';
import { OWNER_GROUP_ORDER } from '../../../verticals/robotics';

export interface MechanismGroup {
  mechanism: string;
  entries: ArtifactRef[];
}

export interface OwnerGroupSection {
  // HUB-MODULARIZATION 第6步：读侧 ArtifactRef.ownerGroup 已放宽为开放 string（可注入），
  // 分组只按值分桶、不假定闭集——非机器人已知值一律落「未分组/历史」旁的独立桶而非崩溃。
  ownerGroup: string | null; // null = 未分组/历史桶
  mechanisms: MechanismGroup[];
}

// 两级分组：外层 ownerGroup（机械/电路）+ 未分组历史桶，内层 mechanism，组内 createdAt 倒序。
export function groupArtifacts(artifacts: ArtifactRef[]): OwnerGroupSection[] {
  // 先按 ownerGroup 分桶
  const byOwner = new Map<string | null, Map<string, ArtifactRef[]>>();
  const ownerOrder: (string | null)[] = [];

  for (const artifact of artifacts) {
    const og: string | null = artifact.ownerGroup ?? null;
    if (!byOwner.has(og)) {
      byOwner.set(og, new Map());
      ownerOrder.push(og);
    }
    const mechMap = byOwner.get(og)!;
    const key = artifact.mechanism ?? '';
    if (!mechMap.has(key)) mechMap.set(key, []);
    mechMap.get(key)!.push(artifact);
  }

  // 构建结果：机械 → 电路 → 电控 → 视觉 → null（未分组历史桶垫底）
  const sorted: (string | null)[] = [];
  for (const og of OWNER_GROUP_ORDER) {
    if (byOwner.has(og)) sorted.push(og);
  }
  // OWNER_GROUP_ORDER 的元素类型仍是闭集 OwnerGroup（供写侧表单复用），但此处 og 已是开放
  // string（读侧数据）——显式转宽比较数组，只影响本行"是否为已知机器人组别"判断，不改行为。
  const knownOwnerGroups: readonly string[] = OWNER_GROUP_ORDER;
  for (const og of ownerOrder) {
    if (og !== null && !knownOwnerGroups.includes(og)) sorted.push(og);
    else if (og === null) sorted.push(og);
  }

  return sorted.map((og) => {
    const mechMap = byOwner.get(og)!;
    const mechanisms: MechanismGroup[] = [];
    for (const [mechanism, entries] of mechMap) {
      entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      mechanisms.push({ mechanism: mechanism || '（未知机构）', entries });
    }
    // 组内按最新一条倒序
    mechanisms.sort((a, b) => {
      const latestA = a.entries[0]?.createdAt ?? '';
      const latestB = b.entries[0]?.createdAt ?? '';
      return latestB.localeCompare(latestA);
    });
    return { ownerGroup: og, mechanisms };
  });
}
