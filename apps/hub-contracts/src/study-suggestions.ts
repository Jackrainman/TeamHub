import { z } from 'zod';

import { isoDateTimeSchema } from './common.js';
import type { GovernanceSnapshot } from './attribution.js';
import type { KnowledgeNode } from './growth.js';
import type { MemberKnowledge } from './growth.js';

/**
 * 窄义学习建议派生（S3，B1 拍板）——纯函数，无 IO，可单测。
 *
 * 严格边界（D-039 反向硬约束，**绝不复活广义 STUDY-BROAD**）：
 *
 *  1. 组级输出（`group`）永不命名具体人：把 open/escalated 的 `Need.neededSkills`
 *     与 `KnowledgeNode` join（KnowledgeNode 无 skillKey → 用 `node.name` 含某个
 *     `neededSkills` token 命中），按 `Need.providerGroupId` 归组，输出「此知识点关联
 *     你组的 N 个 open 缺口」。**主键全是 groupId + knowledgeNodeId**——零 memberId、
 *     零 displayName、零能力排序，结构上无法反推或配对具体人。
 *
 *  2. 私有变体（`selfPrivate`）只回本人：仅当传入 `viewerMemberId` + `memberKnowledge`
 *     时才产；循环首行硬过滤 `mk.memberId === viewerMemberId`（**绝不读他人 private
 *     MemberKnowledge**），只取本人 interested/learning 的方向，且该方向当前确有 open
 *     缺口（与组级同一 join）。每条 `memberId` 钉死 = viewerMemberId，标
 *     `audience: 'selfPrivate'`。**两个数组物理隔离（非 union），self 永不并进 group。**
 *
 *  3. **绝不**产生「AI 指派某人去学 / 能力排序 / 把具体人配对缺口」结构：
 *     GroupStudySuggestion 无 memberId / 无 rank / 无 assignee；SelfStudySuggestion
 *     单元素 memberId 钉死本人；只有 knowledgeNodeId + openGapCount + 中性文案。
 *
 *  4. AI 侧仍只走现有 `TaskKnowledgeTag` source='aiSuggested' → 人 confirmedBy 路径，
 *     **本函数不新增任何 AI 对人拍板路径**——纯读、`detectedBy` 恒派生。
 *
 * 沉默优先（A4）：无 open/escalated 缺口、或无匹配知识点 → 不产出该项（空数组而非占位）。
 */

// ---------------------------------------------------------------------------
// Schema：组级 + 私有两形态（两个独立 schema，非 union —— self 不可能漏进 group）
// ---------------------------------------------------------------------------

/** 受众路由标识：组级公开 vs 仅回本人私有。 */
export const StudySuggestionAudienceSchema = z.enum([
  'group', // 组级公开：永不含人维度
  'selfPrivate', // 仅回本人：memberId 钉死本人，绝不进任何 group/captain 聚合
]);

/**
 * 组级学习建议：「此知识点关联你组的 N 个 open 缺口」。
 * **无 memberId / 无 rank / 无 assignee** —— 结构上无法配对或排序具体人（D-039 硬边界）。
 */
export const GroupStudySuggestionSchema = z.object({
  id: z.string().min(1),
  audience: z.literal('group'),
  groupId: z.string().min(1), // 缺口归组（A1），永不归人
  knowledgeNodeId: z.string().min(1), // 命中的知识点
  knowledgeNodeName: z.string().min(1), // 仅显示名（来自 KnowledgeNode.name）
  // 命中的能力方向并集（去重、排序）——描述方向，不得用于反推/排序具体人。
  matchedSkills: z.array(z.string().min(1)),
  // 此知识点关联到本组的 open/escalated 缺口数（事实计数，非对人计量）。
  openGapCount: z.number().int().positive(),
  evidenceNeedIds: z.array(z.string().min(1)),
  // 中性事实陈述：只填组名 + 知识点名 + 缺口数，永不含人名 / 排序 / "谁该去学"。
  factStatement: z.string().min(1),
  detectedBy: z.literal('derived'), // 永远派生，从不是人录入
  detectedAt: isoDateTimeSchema,
});

/**
 * 私有学习建议（仅回本人）：「你 interested/learning 的方向，当前确有 open 缺口」。
 * **memberId 钉死本人**，标 audience='selfPrivate'，**绝不进任何 group/captain 聚合视图**。
 * 无 rank / 无对比 / 无完成率 —— 不是「AI 让你去学」，只是把本人已表达的方向与现存缺口对齐。
 */
export const SelfStudySuggestionSchema = z.object({
  id: z.string().min(1),
  audience: z.literal('selfPrivate'),
  // 钉死本人：派生时硬过滤 mk.memberId === viewerMemberId，单元素、绝不聚合。
  memberId: z.string().min(1),
  knowledgeNodeId: z.string().min(1),
  knowledgeNodeName: z.string().min(1),
  // 本人对该知识点的关系（interested / learning），原样回显，不评级。
  relation: z.enum(['interested', 'learning']),
  matchedSkills: z.array(z.string().min(1)),
  openGapCount: z.number().int().positive(),
  evidenceNeedIds: z.array(z.string().min(1)),
  factStatement: z.string().min(1),
  detectedBy: z.literal('derived'),
  detectedAt: isoDateTimeSchema,
});

/**
 * 派生结果：两个**物理隔离**的数组（非 union）。
 * - `group`：组级，永不含人维度。
 * - `selfPrivate`：仅本人；无 viewer 时恒为空。
 * 调用方负责把 `selfPrivate` 只回给本人，**绝不**塞进任何组级 / 队长聚合响应。
 */
export const StudySuggestionsResultSchema = z.object({
  group: z.array(GroupStudySuggestionSchema),
  selfPrivate: z.array(SelfStudySuggestionSchema),
});

// ---------------------------------------------------------------------------
// 派生选项 + 派生函数
// ---------------------------------------------------------------------------

/**
 * 私有变体的入参（第三参，**不挂进 GovernanceSnapshot**——他人 private MemberKnowledge
 * 绝不进治理快照 / 聚合面）。无 viewerMemberId 或无 memberKnowledge → selfPrivate 恒空。
 */
export interface StudySuggestionsOptions {
  // 当前查看者本人 memberId；缺省 → 不产任何私有建议（空 selfPrivate）。
  viewerMemberId?: string;
  // 本人私有兴趣关系（visibility:private）。函数只读本人那几条，硬过滤掉其余。
  memberKnowledge?: MemberKnowledge[];
}

/** node.name 是否含某个 neededSkills token（大小写不敏感）。KnowledgeNode 无 skillKey 故用名字匹配。 */
function matchedSkillsForNode(node: KnowledgeNode, neededSkills: Set<string>): string[] {
  const haystack = node.name.toLowerCase();
  const hits: string[] = [];
  for (const skill of neededSkills) {
    if (haystack.includes(skill.toLowerCase())) hits.push(skill);
  }
  return hits.sort();
}

interface GapBucket {
  skills: Set<string>;
  needIds: Set<string>;
}

/**
 * 派生窄义学习建议。
 *
 * @param snapshot 治理真相快照（只读 needs / knowledgeNodes / groups）。
 * @param now      派生时刻（detectedAt）。
 * @param options  可选私有上下文：viewerMemberId + 本人 memberKnowledge。
 *                 缺省 → selfPrivate 为空（沉默）。
 * @returns        { group, selfPrivate } 两个物理隔离数组。
 */
export function deriveStudySuggestions(
  snapshot: GovernanceSnapshot,
  now: string,
  options?: StudySuggestionsOptions,
): z.infer<typeof StudySuggestionsResultSchema> {
  const groupsById = new Map<string, string>();
  for (const g of snapshot.groups) groupsById.set(g.id, g.name);

  // ---- 组级 join：按 providerGroupId 归组，聚合 open/escalated 缺口的 neededSkills + needIds ----
  const byGroup = new Map<string, GapBucket>();
  for (const need of snapshot.needs) {
    if (need.status !== 'open' && need.status !== 'escalated') continue;
    if (need.providerGroupId === null) continue; // 无组可归 → 沉默（A1）
    const gid = need.providerGroupId;
    let bucket = byGroup.get(gid);
    if (!bucket) {
      bucket = { skills: new Set(), needIds: new Set() };
      byGroup.set(gid, bucket);
    }
    for (const s of need.neededSkills) bucket.skills.add(s);
    bucket.needIds.add(need.id);
  }

  // (gid, knowledgeNodeId) → 命中知识点 × 缺口；零人维度。
  const group: z.infer<typeof GroupStudySuggestionSchema>[] = [];
  // 确定性：组按 id 排序，组内知识点按 id 排序。
  for (const gid of [...byGroup.keys()].sort()) {
    const bucket = byGroup.get(gid)!;
    const groupName = groupsById.get(gid) ?? gid;
    const matchedNodes = snapshot.knowledgeNodes
      .map((node) => ({ node, matched: matchedSkillsForNode(node, bucket.skills) }))
      .filter((m) => m.matched.length > 0)
      .sort((a, b) => (a.node.id < b.node.id ? -1 : a.node.id > b.node.id ? 1 : 0));

    for (const { node, matched } of matchedNodes) {
      const openGapCount = bucket.needIds.size;
      group.push({
        id: `study-grp-${gid}-${node.id}`,
        audience: 'group',
        groupId: gid,
        knowledgeNodeId: node.id,
        knowledgeNodeName: node.name,
        matchedSkills: matched,
        openGapCount,
        evidenceNeedIds: [...bucket.needIds].sort(),
        factStatement: `「${node.name}」关联${groupName}组 ${openGapCount} 个待补缺口，方向：${matched.join('、')}。`,
        detectedBy: 'derived',
        detectedAt: now,
      });
    }
  }

  // ---- 私有变体：仅当 viewerMemberId + memberKnowledge 都在时才跑 ----
  const selfPrivate: z.infer<typeof SelfStudySuggestionSchema>[] = [];
  const viewerMemberId = options?.viewerMemberId;
  const memberKnowledge = options?.memberKnowledge;
  if (viewerMemberId && memberKnowledge) {
    // 把所有 open/escalated 缺口的 neededSkills 并成一个全局集合（与组级同口径），
    // 用于判断「本人的方向当前是否确有 open 缺口」。
    const allOpenSkills = new Set<string>();
    const allOpenNeedIds = new Set<string>();
    for (const need of snapshot.needs) {
      if (need.status !== 'open' && need.status !== 'escalated') continue;
      for (const s of need.neededSkills) allOpenSkills.add(s);
      allOpenNeedIds.add(need.id);
    }
    const nodesById = new Map<string, KnowledgeNode>();
    for (const node of snapshot.knowledgeNodes) nodesById.set(node.id, node);

    // 确定性：按 knowledgeNodeId 排序遍历本人条目。
    const ownEntries = memberKnowledge
      .filter((mk) => mk.memberId === viewerMemberId) // 硬过滤：绝不读他人 private MemberKnowledge
      .filter((mk) => mk.relation === 'interested' || mk.relation === 'learning')
      .sort((a, b) =>
        a.knowledgeNodeId < b.knowledgeNodeId
          ? -1
          : a.knowledgeNodeId > b.knowledgeNodeId
            ? 1
            : 0,
      );

    const seenNodes = new Set<string>();
    for (const mk of ownEntries) {
      // 防御性二次确认：循环体内再钉一次本人身份（与首行 filter 对称，杜绝漏改）。
      if (mk.memberId !== viewerMemberId) continue;
      // 窄化 relation：proficient 不进窄义建议（只对 interested/learning 给方向对齐）。
      const relation = mk.relation;
      if (relation !== 'interested' && relation !== 'learning') continue;
      if (seenNodes.has(mk.knowledgeNodeId)) continue;
      const node = nodesById.get(mk.knowledgeNodeId);
      if (!node) continue;
      const matched = matchedSkillsForNode(node, allOpenSkills);
      if (matched.length === 0) continue; // 本人方向当前无 open 缺口 → 沉默
      seenNodes.add(mk.knowledgeNodeId);

      // 该知识点关联的 open 缺口（命中其某条 neededSkill 的缺口）。
      const evidenceNeedIds: string[] = [];
      for (const need of snapshot.needs) {
        if (need.status !== 'open' && need.status !== 'escalated') continue;
        if (need.neededSkills.some((s) => matched.includes(s))) {
          evidenceNeedIds.push(need.id);
        }
      }
      evidenceNeedIds.sort();

      selfPrivate.push({
        id: `study-self-${viewerMemberId}-${node.id}`,
        audience: 'selfPrivate',
        memberId: viewerMemberId, // 钉死本人，单元素，绝不聚合
        knowledgeNodeId: node.id,
        knowledgeNodeName: node.name,
        relation,
        matchedSkills: matched,
        openGapCount: evidenceNeedIds.length,
        evidenceNeedIds,
        factStatement: `你${relation === 'learning' ? '正在学的' : '感兴趣的'}「${node.name}」方向，当前有 ${evidenceNeedIds.length} 个待补缺口。`,
        detectedBy: 'derived',
        detectedAt: now,
      });
    }
  }

  return { group, selfPrivate };
}

// ---------------------------------------------------------------------------
// 类型导出
// ---------------------------------------------------------------------------

export type StudySuggestionAudience = z.infer<typeof StudySuggestionAudienceSchema>;
export type GroupStudySuggestion = z.infer<typeof GroupStudySuggestionSchema>;
export type SelfStudySuggestion = z.infer<typeof SelfStudySuggestionSchema>;
export type StudySuggestionsResult = z.infer<typeof StudySuggestionsResultSchema>;
