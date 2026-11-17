import type { TaskAcceptanceState } from '@teamhub/hub-contracts';
import { useI18n } from '../../../i18n';
import { ACCEPTANCE_KEY, ACCEPTANCE_TONE } from './constants';

export function TaskDetailBadges({ groupName, acceptance }: {
  groupName: string;
  acceptance: TaskAcceptanceState;
}) {
  const { t } = useI18n();
  return <div className="task-detail__badges"><span className="badge">{groupName}</span>
    <span className={`badge ${ACCEPTANCE_TONE[acceptance]}`}>{t(ACCEPTANCE_KEY[acceptance])}</span>
  </div>;
}
