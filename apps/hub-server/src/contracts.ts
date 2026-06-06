import { z } from 'zod';

export const isoDateTimeSchema = z.string().datetime({ offset: true });

export const AdapterDescriptorSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['ai', 'tool', 'ingress', 'git', 'artifact']),
  displayName: z.string().min(1),
  status: z.enum(['enabled', 'disabled', 'degraded', 'unconfigured']),
  capabilities: z.array(z.string().min(1)),
  healthCheckedAt: isoDateTimeSchema.optional(),
});

export const AdaptersResponseSchema = z.object({
  adapters: z.array(AdapterDescriptorSchema),
});

export const HealthResponseSchema = z.object({
  status: z.literal('ok'),
  service: z.literal('teamhub-hub-server'),
  checkedAt: isoDateTimeSchema,
});

export const SystemStatusResponseSchema = z.object({
  service: z.literal('teamhub-hub-server'),
  version: z.string().min(1),
  mode: z.literal('mock-first'),
  generatedAt: isoDateTimeSchema,
  uptimeSeconds: z.number().nonnegative(),
  adapters: z.object({
    total: z.number().int().nonnegative(),
    enabled: z.number().int().nonnegative(),
    degraded: z.number().int().nonnegative(),
    unconfigured: z.number().int().nonnegative(),
  }),
});

export type AdapterDescriptor = z.infer<typeof AdapterDescriptorSchema>;
export type AdaptersResponse = z.infer<typeof AdaptersResponseSchema>;
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
export type SystemStatusResponse = z.infer<typeof SystemStatusResponseSchema>;
