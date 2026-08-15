import { z } from 'zod';

import type { GateChecklistItem } from './model.js';

/** Checklist 自有时间压力值对象；不依赖 baseline 的整域模型或常量。 */
export const CHECKLIST_DRIFT_LOOKAHEAD_WEEKS = 2;
export const ChecklistDriftLevelSchema = z.enum(['red', 'yellow', 'green']);
export const ChecklistItemDriftSchema = z.object({
  itemId: z.string().min(1),
  level: ChecklistDriftLevelSchema,
});
export type ChecklistDriftLevel = z.infer<typeof ChecklistDriftLevelSchema>;
export type ChecklistItemDrift = z.infer<typeof ChecklistItemDriftSchema>;

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

export function deriveChecklistDrift(
  items: GateChecklistItem[],
  now: Date,
): ChecklistItemDrift[] {
  const nowMs = now.getTime();
  const lookaheadMs = CHECKLIST_DRIFT_LOOKAHEAD_WEEKS * MS_PER_WEEK;
  const out: ChecklistItemDrift[] = [];

  for (const item of items) {
    if (item.anchorDueAt === undefined || item.status !== 'pending') continue;
    const dueMs = new Date(item.anchorDueAt).getTime();
    let level: ChecklistDriftLevel;
    if (dueMs < nowMs) {
      level = 'red';
    } else if (dueMs - nowMs <= lookaheadMs) {
      level = 'yellow';
    } else {
      level = 'green';
    }
    out.push({ itemId: item.id, level });
  }
  return out;
}

/** GateChecklistPort 可直接消费的窄门禁核：只回答该 milestone 的 pending 事实。 */
export function listBlockingChecklistItems(
  items: GateChecklistItem[],
  milestoneId: string,
): GateChecklistItem[] {
  return items.filter(
    (item) => item.status === 'pending' && item.anchorMilestoneId === milestoneId,
  );
}
