import { GateChecklistItemSchema } from '@teamhub/hub-contracts';
import type {
  ActorRef,
  ChecklistTemplate,
  GateChecklistItem,
} from '@teamhub/hub-contracts';

export type ChecklistItemDraft = Omit<
  GateChecklistItem,
  'id' | 'status' | 'clearedBy' | 'waivedBy' | 'waiveReason'
>;

/** Checklist 领域唯一 repository port；生产只允许统一 SQLite 实现。 */
export interface ChecklistRepository {
  listItems(seasonBaselineId: string): Promise<GateChecklistItem[]>;
  createItem(draft: ChecklistItemDraft): Promise<GateChecklistItem>;
  clearItem(id: string, clearedBy: ActorRef): Promise<GateChecklistItem | null>;
  waiveItem(id: string, waivedBy: ActorRef, waiveReason: string): Promise<GateChecklistItem | null>;
  listTemplates(): Promise<ChecklistTemplate[]>;
}

/** Baseline 只能消费这一门禁投影，不能取得完整 ChecklistRepository。 */
export interface GateChecklistPort {
  listBlockingItems(
    seasonBaselineId: string,
    milestoneId: string,
  ): Promise<GateChecklistItem[]>;
}

export function buildChecklistItem(draft: ChecklistItemDraft, id: string): GateChecklistItem {
  return GateChecklistItemSchema.parse({ ...draft, id, status: 'pending' });
}

export function applyChecklistClear(
  prior: GateChecklistItem | undefined,
  clearedBy: ActorRef,
): GateChecklistItem | null {
  if (!prior || prior.status !== 'pending') return null;
  return GateChecklistItemSchema.parse({ ...prior, status: 'passed', clearedBy });
}

export function applyChecklistWaive(
  prior: GateChecklistItem | undefined,
  waivedBy: ActorRef,
  waiveReason: string,
): GateChecklistItem | null {
  if (!prior || prior.status !== 'pending') return null;
  return GateChecklistItemSchema.parse({ ...prior, status: 'waived', waivedBy, waiveReason });
}
