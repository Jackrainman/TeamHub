import type { BaselineMilestonePublic } from '@teamhub/hub-contracts';

/**
 * 门检查单 / 欠条（GATE-CHECKLIST-IOU，D-087 / `docs/design/gate-checklist-iou.md`）界面层纯函数集。
 * 被 ChecklistQuickRecord.tsx / GateChecklistCard.tsx 共用，抽出来单测（不测 DOM/RTL，符合本仓
 * 「测逻辑不测 DOM」风格，同 identity-utils.ts / myview-utils.ts）。本文件不含任何 React / fetch。
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * 全局「快记欠条」的默认挂接锚点（设计 §3：默认值=下一道整车级门）。
 *
 * 返回**最近的未来 `kind==='gate'` 且 `status==='pending'` 的里程碑**（未过期、按 plannedAt 取最早）；
 * 无这样的门 → `null`（调用方回落到「自选到期日」模式）。整车级/非整车级本域不区分（schema 无该维度），
 * 「整车级门」概念由基准线模板的门本身承载，此处只取最近未过的待过门作缺省。
 */
export function pickDefaultIouAnchor(
  milestones: readonly BaselineMilestonePublic[],
  now: Date,
): BaselineMilestonePublic | null {
  const nowMs = now.getTime();
  return milestones
    .filter(
      (m) =>
        m.kind === 'gate' &&
        m.status === 'pending' &&
        new Date(m.plannedAt).getTime() >= nowMs,
    )
    .reduce<BaselineMilestonePublic | null>(
      (acc, m) => (acc == null || m.plannedAt < acc.plannedAt ? m : acc),
      null,
    );
}

/**
 * 自选到期日欠条的过期天数（告警区「过期时长」文案用）：`now - dueAt` 向下取整到天，最小 0。
 * 未过期（dueAt 在未来）返回 0——调用方只对红档（已过期）欠条调用，负值无意义故夹到 0。
 */
export function overdueDays(dueAtIso: string, now: Date): number {
  const diff = now.getTime() - new Date(dueAtIso).getTime();
  return Math.max(0, Math.floor(diff / MS_PER_DAY));
}
