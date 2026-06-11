import { z } from 'zod';

/**
 * 共享基元层。
 *
 * ARCH-PATH = 治理为主轴（D-028）：治理域（governance.ts）与成长轴（growth.ts）
 * 与既有 broker 契约（schemas.ts）共用同一组基元，保持单一 Zod 源、camelCase、
 * 带时区 ISO8601 约定。治理实体只依赖本文件，不依赖 broker schema。
 */

export const isoDateTimeSchema = z.string().datetime({ offset: true });

export const ActorRefSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1),
  source: z.enum(['lark', 'git', 'console', 'unknown']),
});

export type ActorRef = z.infer<typeof ActorRefSchema>;
