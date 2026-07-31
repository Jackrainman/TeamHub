import { GateChecklistItemSchema } from '@teamhub/hub-contracts';
import type { ActorRef, GateChecklistItem } from '@teamhub/hub-contracts';
import type { ChecklistItemDraft } from './checklist-store.js';

/**
 * 门检查单域写逻辑（三实现共享）：把 create/clear/waive 的纯对象变换从 InMemory 与 Sqlite
 * store 中抽出，消除逐字复制（base-<domain>-store 纪律）。存储层只负责供 prior、生成 id、写回。
 * 均经 GateChecklistItemSchema.parse fail-closed（挂接二选一 + 状态不变式），非法即抛。
 */

/** 建项：id 由 store 生成、status 钉 pending；坏 draft 在此抛，不落库。 */
export function buildChecklistItem(draft: ChecklistItemDraft, id: string): GateChecklistItem {
  return GateChecklistItemSchema.parse({ ...draft, id, status: 'pending' });
}

/** 清偿：只许 pending 出发，留名进事实卡（红线2，parse 校验 passed⇒clearedBy 非空）；非 pending 返回 null。 */
export function applyChecklistClear(
  prior: GateChecklistItem | undefined,
  clearedBy: ActorRef,
): GateChecklistItem | null {
  if (!prior || prior.status !== 'pending') return null;
  return GateChecklistItemSchema.parse({ ...prior, status: 'passed', clearedBy });
}

/** 豁免：只许 pending 出发，留名 + 书面理由强制非空（红线3，parse 校验 waived⇒waivedBy+waiveReason）；非 pending 返回 null。 */
export function applyChecklistWaive(
  prior: GateChecklistItem | undefined,
  waivedBy: ActorRef,
  waiveReason: string,
): GateChecklistItem | null {
  if (!prior || prior.status !== 'pending') return null;
  return GateChecklistItemSchema.parse({ ...prior, status: 'waived', waivedBy, waiveReason });
}
