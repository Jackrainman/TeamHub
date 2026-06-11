import { z } from 'zod';

import { ActorRefSchema, isoDateTimeSchema } from './common.js';

/**
 * 成长轴（D-027，与治理主干并列）。MVP 只做"任务知识标注，树从标注长出"。
 *
 * 护栏（落在 schema 形状上）：
 * - 兴趣数据归本人：MemberKnowledge.visibility 默认 private。
 * - 无可比进度 / 不排名 / 不统计完成率：MemberKnowledge 无 score/percent/completedAt。
 * - 不预设本体（C3）：KnowledgeNode.parentNodeId 默认 null，树由标注积累后浮现。
 */

export const KnowledgeNodeSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  // 关联组方向（视觉/电控），null = 通用。
  groupId: z.string().min(1).nullable(),
  // 跨赛季沉淀：不挂 seasonId（消灭跨赛季知识重复重造）。
  // 树从标注长出，不预设本体（C3）。
  parentNodeId: z.string().min(1).nullable(),
  resourceLinks: z.array(
    z.object({
      label: z.string().min(1),
      uri: z.string().min(1),
    }),
  ),
  createdAt: isoDateTimeSchema,
});

export const MemberKnowledgeRelationSchema = z.enum([
  'interested',
  'learning',
  'proficient',
]);

export const MemberKnowledgeVisibilitySchema = z.enum([
  'private',
  'sharedWithGroupAdmin',
]);

export const MemberKnowledgeSchema = z.object({
  memberId: z.string().min(1),
  knowledgeNodeId: z.string().min(1),
  relation: MemberKnowledgeRelationSchema,
  // 默认私有：interested/learning 永不进对他人可见的视图（D-027 护栏）。
  // 无 score/percent/completedAt —— 不排名、不统计完成率。
  visibility: MemberKnowledgeVisibilitySchema,
  updatedAt: isoDateTimeSchema,
});

/** MVP 核心：布置任务时 AI 建议涉及的知识点 + 挂资料，人审核。 */
export const TaskKnowledgeTagSchema = z.object({
  id: z.string().min(1),
  taskId: z.string().min(1),
  knowledgeNodeId: z.string().min(1),
  source: z.enum(['human', 'aiSuggested']),
  confirmedBy: ActorRefSchema.nullable(),
});

export const KnowledgeNodesResponseSchema = z.object({
  nodes: z.array(KnowledgeNodeSchema),
});
export const TaskKnowledgeTagsResponseSchema = z.object({
  tags: z.array(TaskKnowledgeTagSchema),
});

export type KnowledgeNode = z.infer<typeof KnowledgeNodeSchema>;
export type MemberKnowledgeRelation = z.infer<
  typeof MemberKnowledgeRelationSchema
>;
export type MemberKnowledgeVisibility = z.infer<
  typeof MemberKnowledgeVisibilitySchema
>;
export type MemberKnowledge = z.infer<typeof MemberKnowledgeSchema>;
export type TaskKnowledgeTag = z.infer<typeof TaskKnowledgeTagSchema>;
