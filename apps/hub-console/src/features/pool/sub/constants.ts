import type { TaskStatus } from '@teamhub/hub-contracts';
import type { TranslationKey } from '../../../i18n';

export const STATUS_KEY: Record<TaskStatus, TranslationKey> = {
  pending: 'pm.status.pending',
  inProgress: 'pm.status.inProgress',
  blocked: 'pm.status.blocked',
  done: 'pm.status.done',
  shelved: 'pm.status.shelved',
};
