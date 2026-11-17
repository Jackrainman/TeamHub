import { z } from 'zod';
import { isoDateTimeSchema } from '../../common.js';

export const HealthResponseSchema = z.object({
  status: z.literal('ok'), service: z.string(), checkedAt: isoDateTimeSchema, buildId: z.string().min(1),
  setupPending: z.boolean().optional(),
});
export const SystemStatusResponseSchema = z.object({
  service: z.string(), version: z.string(), generatedAt: isoDateTimeSchema,
  uptimeSeconds: z.number().nonnegative(), buildId: z.string().min(1),
});
export const ErrorResponseSchema = z.object({
  code: z.string(), detail: z.string(), fields: z.record(z.unknown()).optional(),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
export type SystemStatusResponse = z.infer<typeof SystemStatusResponseSchema>;
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
