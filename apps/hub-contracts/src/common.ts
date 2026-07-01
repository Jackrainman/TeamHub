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

/**
 * 周内分钟段基元（共享 core 基元）：dayOfWeek 0-6（周日=0）、startMin/endMin 为当日 0 点起的分钟数。
 * 半开区间 [startMin, endMin)；refine 强制 startMin<endMin。
 * **不支持跨夜**（如 22:00-次日 02:00）——跨夜请拆成两条段。
 * recurringBusy（成员私有课表，growth.ts）与 WindowDef（在场窗口锚定，governance.ts）共用此基元，
 * 避免区间校验重复两处。原住 governance.ts，step1 上移至 core 基元层以剪 growth→governance 跨域 import 环。
 *
 * 裸 object 形状单独导出（WeeklyMinuteWindowBaseSchema），供 recurringBusy 等
 * 需要 .extend({ label }) 的场景复用（ZodEffects 不能 .extend）；带 refine 的
 * 上界检查由 WeeklyMinuteWindowSchema / WindowDefSchema（governance.ts）承载。
 */
export const WeeklyMinuteWindowBaseSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  startMin: z.number().int().min(0).max(1439),
  endMin: z.number().int().min(1).max(1440),
});

/** 周内分钟段 refine：startMin<endMin（不支持跨夜，跨夜请拆两条）。 */
export const weeklyMinuteWindowRefine = (w: {
  startMin: number;
  endMin: number;
}): boolean => w.startMin < w.endMin;

export const WEEKLY_MINUTE_WINDOW_REFINE_MSG =
  'startMin 必须 < endMin（不支持跨夜窗口，跨夜请拆两条）';
