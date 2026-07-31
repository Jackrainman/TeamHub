import { Plus } from 'lucide-react';
import { useI18n } from '../../../i18n';

export function RelayEmptyState({
  onAddFirst,
  onCarryOver,
  carrying,
}: {
  onAddFirst: () => void;
  onCarryOver: () => void;
  carrying: boolean;
}) {
  const { t } = useI18n();
  return (
    <div className="pm-coldstart">
      <h3>{t('schedule.relay.empty.title')}</h3>
      <p>{t('schedule.relay.empty.body')}</p>
      <div className="relay-coldstart__cta">
        <button
          type="button"
          className="btn btn--primary"
          onClick={onAddFirst}
        >
          <Plus size={14} aria-hidden="true" />
          {t('schedule.relay.empty.addFirst')}
        </button>
        <button
          type="button"
          className="btn btn--secondary relay-canvas__carry"
          onClick={onCarryOver}
          disabled={carrying}
        >
          {t('schedule.relay.carryOver')}
        </button>
      </div>
    </div>
  );
}
