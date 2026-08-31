import type { ChecklistItemStatus, ChecklistOrigin } from '@teamhub/hub-contracts';
import type { TranslationKey } from '../../i18n';

/** 检查项状态/来源的徽章 tone 与 i18n 键（GateChecklistCard 与其 sub 组件共用单一源）。 */
export const STATUS_TONE: Record<ChecklistItemStatus, string> = {
  pending: 'badge--amber',
  passed: 'badge--green',
  waived: 'badge--neutral',
};
export const STATUS_KEY: Record<ChecklistItemStatus, TranslationKey> = {
  pending: 'checklist.status.pending',
  passed: 'checklist.status.passed',
  waived: 'checklist.status.waived',
};
export const ORIGIN_KEY: Record<ChecklistOrigin, TranslationKey> = {
  template: 'checklist.origin.template',
  iou: 'checklist.origin.iou',
};
