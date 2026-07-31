import type { TaskAcceptanceState, TaskStatus } from '@teamhub/hub-contracts';
import type { TranslationKey } from '../../../i18n';

export const STATUS_KEY: Record<TaskStatus, TranslationKey> = {
  pending: 'pm.status.pending',
  inProgress: 'pm.status.inProgress',
  blocked: 'pm.status.blocked',
  done: 'pm.status.done',
  shelved: 'pm.status.shelved',
};

export const ACCEPTANCE_TONE: Record<TaskAcceptanceState, string> = {
  notDone: 'badge--neutral',
  selfDone: 'badge--green',
  awaitingReview: 'badge--amber',
  accepted: 'badge--green',
};
export const ACCEPTANCE_KEY: Record<TaskAcceptanceState, TranslationKey> = {
  notDone: 'pool.acceptance.notDone',
  selfDone: 'pool.acceptance.selfDone',
  awaitingReview: 'pool.acceptance.awaitingReview',
  accepted: 'pool.acceptance.accepted',
};

export function formatDay(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toISOString().slice(0, 10);
}
