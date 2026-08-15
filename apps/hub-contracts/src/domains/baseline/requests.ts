import { z } from 'zod';

import { ActorRefSchema } from '../../common.js';
import { SeasonBaselinePublicSchema, SeasonBaselineSchema } from './model.js';

export const BaselineResponseSchema = z.object({
  baseline: SeasonBaselinePublicSchema.nullable(),
});
export const UpdateBaselineRequestSchema = SeasonBaselineSchema.omit({
  id: true,
  seasonId: true,
}).partial();
export const UpdateBaselineResponseSchema = z.object({
  baseline: SeasonBaselinePublicSchema,
});
export const PassMilestoneRequestSchema = z.object({
  status: z.enum(['passed', 'missed']),
  passedBy: ActorRefSchema.optional(),
  evidenceRefs: z.array(z.string().min(1)).optional(),
  note: z.string().min(1).optional(),
});
export const PassMilestoneResponseSchema = z.object({
  baseline: SeasonBaselinePublicSchema,
});

export type BaselineResponse = z.infer<typeof BaselineResponseSchema>;
export type UpdateBaselineRequest = z.infer<typeof UpdateBaselineRequestSchema>;
export type UpdateBaselineResponse = z.infer<typeof UpdateBaselineResponseSchema>;
export type PassMilestoneRequest = z.infer<typeof PassMilestoneRequestSchema>;
export type PassMilestoneResponse = z.infer<typeof PassMilestoneResponseSchema>;
