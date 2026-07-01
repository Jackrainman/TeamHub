import { z } from 'zod';

import {
  ActorRefSchema,
  isoDateTimeSchema,
  WEEKLY_MINUTE_WINDOW_REFINE_MSG,
  WeeklyMinuteWindowBaseSchema,
  weeklyMinuteWindowRefine,
} from './common.js';

/**
 * 成长轴（D-027，与治理主干并列）。MVP 只做"任务知识标注，树从标注长出"。
 *
 * 护栏（落在 schema 形状上）：
 * - 兴趣数据归本人：MemberKnowledge.visibility 默认 private。
 * - 无可比进度 / 不排名 / 不统计完成率：MemberKnowledge 无 score/percent/completedAt。
 * - 不预设本体（C3）：KnowledgeNode.parentNodeId 默认 null，树由标注积累后浮现。
 * - A2 个人课表是本人私有信号（SCHED-MEMBER-AVAILABILITY，S1）：MemberAvailability 与
 *   MemberKnowledge 同范式——明细永不进任何他人 / 第三方 / 聚合视图；派生只产出组级整数
 *   headcount，绝不按人累计、绝不出现"谁有空 / 谁没空 / 谁到场最少→多排谁"。
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

// ---------------------------------------------------------------------------
// MemberAvailability（成员私有课表信号；S1，A2）
//
// 与 MemberKnowledge 同范式：成员私有信号，明细永不进第三方 / 聚合视图，
// 只在派生时被压成"无人维度的组级整数 headcount"。recurringBusy 复用 common.ts
// 的 WeeklyMinuteWindowBaseSchema 周内分钟段基元（与 WindowDef 同一基元，避免区间校验重复）。
// ---------------------------------------------------------------------------

export const MemberAvailabilityVisibilitySchema = z.enum([
  // 本人私有：明细永不进任何他人 / 第三方 / 聚合视图（默认，最严）。
  'private',
  // 本人授权：仅用于派生组级 headcount 整数；绝不暴露明细、绝不跨窗按人累计。
  'aggregateOnly',
]);

export const MemberAvailabilitySchema = z.object({
  memberId: z.string().min(1),
  // 本人录入的周期性占用段（上课 / 固定事务）。每段是一个周内分钟段；
  // label 可空（"高数课"），仅本人可见，绝不进任何聚合输出。
  // 复用 WeeklyMinuteWindowBaseSchema 裸形状 .extend({ label })，再补同一 startMin<endMin
  // refine（ZodEffects 不能 .extend，故引用裸 schema + refine 函数）。
  // 跨夜段不支持（refine startMin<endMin）：跨夜请拆两条。
  recurringBusy: z.array(
    WeeklyMinuteWindowBaseSchema.extend({
      label: z.string().min(1).optional(),
    }).refine(weeklyMinuteWindowRefine, {
      message: WEEKLY_MINUTE_WINDOW_REFINE_MSG,
    }),
  ),
  // 默认私有：private 的成员条目在派生时直接跳过，绝不进任何组级聚合（A2）。
  // 无 score/percent/attendance —— 不排名、不统计出勤、不按人累计。
  visibility: MemberAvailabilityVisibilitySchema,
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
export type MemberAvailabilityVisibility = z.infer<
  typeof MemberAvailabilityVisibilitySchema
>;
export type MemberAvailability = z.infer<typeof MemberAvailabilitySchema>;
export type TaskKnowledgeTag = z.infer<typeof TaskKnowledgeTagSchema>;
