import { z } from 'zod';

export const KB_SIMILAR_NOTE =
  '下面是几条相似的历史记录，按匹配程度排序。系统只给候选、不断言是同一个原因，每条附了相似依据，合不合用你自己判断。';

export const KbSimilarQuerySchema = z.object({
  symptom: z.string().min(1),
  tags: z
    .string()
    .optional()
    .transform((s) =>
      s
        ? s
            .split(',')
            .map((t) => t.trim())
            .filter((t) => t.length > 0)
        : [],
    ),
  projectId: z.string().min(1).optional(),
  limit: z.coerce.number().int().positive().max(20).optional(),
  minScore: z.coerce.number().int().nonnegative().optional(),
});

export const ScheduleQuerySchema = z.object({
  windowLabel: z.string().min(1),
});

export const BaselineQuerySchema = z.object({
  seasonId: z.string().min(1),
});
