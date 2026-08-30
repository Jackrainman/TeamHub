import { z } from 'zod';

import { ActorRefSchema, isoDateTimeSchema } from '../../common.js';

export const BaselineSegmentKindSchema = z.enum(['semester', 'vacation', 'vacuum']);
export const BaselinePhaseTypeSchema = z.enum(['rd', 'iterate', 'tuning', 'vacuum']);
export const MilestoneKindSchema = z.enum(['milestone', 'gate']);
export const MilestoneStatusSchema = z.enum(['pending', 'passed', 'missed']);
export const MilestoneRobotVersionSchema = z.enum(['V1', 'V2', 'V3']);

/**
 * 整车六阶段（STAGE-PIPELINE）：阶段只做视图投影、不建实体。milestone 可选 `stage`
 * 字段把里程碑挂进阶段，deriveStageProgress 据此精确派生阶段时间窗/状态（Step2），
 * 替代 Step1 的 phases 时间窗近似映射。顺序即阶段先后，勿乱序。
 */
export const STAGE_PIPELINE_STAGES = [
  'moduleDesign',
  'moduleAssembly',
  'moduleTest',
  'integratedAssembly',
  'integratedTest',
  'convergence',
] as const;
export const MilestoneStageSchema = z.enum(STAGE_PIPELINE_STAGES);

export const BaselineAnchorsSchema = z.object({
  semesterStart: isoDateTimeSchema.optional(),
  competitionDate: isoDateTimeSchema.optional(),
});
export const BaselineSegmentSchema = z.object({
  kind: BaselineSegmentKindSchema,
  startsAt: isoDateTimeSchema,
  endsAt: isoDateTimeSchema,
  label: z.string().min(1),
});
export const BaselinePhaseSchema = z.object({
  type: BaselinePhaseTypeSchema,
  startsAt: isoDateTimeSchema,
  endsAt: isoDateTimeSchema,
});
export const BaselineMilestoneSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  kind: MilestoneKindSchema,
  plannedAt: isoDateTimeSchema,
  /** 可选：挂接的六阶段（STAGE-PIPELINE Step2）。缺省=未挂接，不进精确派生。 */
  stage: MilestoneStageSchema.optional(),
  robotVersion: MilestoneRobotVersionSchema.optional(),
  mergedFromVersion: MilestoneRobotVersionSchema.optional(),
  status: MilestoneStatusSchema,
  passedBy: ActorRefSchema.optional(),
  evidenceRefs: z.array(z.string().min(1)).optional(),
  note: z.string().min(1).optional(),
});
export const SeasonBaselineSchema = z.object({
  id: z.string().min(1),
  seasonId: z.string().min(1),
  anchors: BaselineAnchorsSchema,
  segments: z.array(BaselineSegmentSchema),
  phases: z.array(BaselinePhaseSchema),
  milestones: z.array(BaselineMilestoneSchema),
});

export const BaselineMilestonePublicSchema = BaselineMilestoneSchema.omit({ passedBy: true });
export const SeasonBaselinePublicSchema = SeasonBaselineSchema.extend({
  milestones: z.array(BaselineMilestonePublicSchema),
});

export type BaselineSegmentKind = z.infer<typeof BaselineSegmentKindSchema>;
export type BaselinePhaseType = z.infer<typeof BaselinePhaseTypeSchema>;
export type MilestoneKind = z.infer<typeof MilestoneKindSchema>;
export type MilestoneStatus = z.infer<typeof MilestoneStatusSchema>;
export type MilestoneStage = z.infer<typeof MilestoneStageSchema>;
export type MilestoneRobotVersion = z.infer<typeof MilestoneRobotVersionSchema>;
export type BaselineAnchors = z.infer<typeof BaselineAnchorsSchema>;
export type BaselineSegment = z.infer<typeof BaselineSegmentSchema>;
export type BaselinePhase = z.infer<typeof BaselinePhaseSchema>;
export type BaselineMilestone = z.infer<typeof BaselineMilestoneSchema>;
export type SeasonBaseline = z.infer<typeof SeasonBaselineSchema>;
export type BaselineMilestonePublic = z.infer<typeof BaselineMilestonePublicSchema>;
export type SeasonBaselinePublic = z.infer<typeof SeasonBaselinePublicSchema>;
