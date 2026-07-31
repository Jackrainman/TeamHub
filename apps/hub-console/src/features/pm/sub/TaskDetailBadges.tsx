import type { TaskAcceptanceState } from '@teamhub/hub-contracts';
import { useI18n } from '../../../i18n';
import { ACCEPTANCE_KEY, ACCEPTANCE_TONE } from './constants';

export function TaskDetailBadges({
  groupName,
  isBig,
  acceptance,
  partnerWanted,
  crossWanted,
}: {
  groupName: string;
  isBig: boolean;
  acceptance: TaskAcceptanceState;
  partnerWanted: boolean;
  crossWanted: boolean;
}) {
  const { t } = useI18n();
  return (
    <div className="task-detail__badges">
      <span className="badge">{groupName}</span>
      {isBig ? (
        <span className="badge badge--blue" title={t('pool.big.hint')}>
          {t('pool.badge.big')}
        </span>
      ) : null}
      <span className={`badge ${ACCEPTANCE_TONE[acceptance]}`}>
        {t(ACCEPTANCE_KEY[acceptance])}
      </span>
      {partnerWanted ? (
        <span className="badge badge--amber">{t('pool.badge.needPartner')}</span>
      ) : null}
      {crossWanted ? (
        <span className="badge badge--neutral">{t('pool.badge.needConfirm')}</span>
      ) : null}
    </div>
  );
}
