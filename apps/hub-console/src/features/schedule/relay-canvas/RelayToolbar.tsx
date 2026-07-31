import { Plus } from 'lucide-react';
import { useI18n } from '../../../i18n';

export function RelayToolbar({
  showAddForm,
  onToggleAddForm,
  onCarryOver,
  carrying,
}: {
  showAddForm: boolean;
  onToggleAddForm: () => void;
  onCarryOver: () => void;
  carrying: boolean;
}) {
  const { t } = useI18n();
  return (
    <div className="relay-canvas__toolbar">
      <button
        type="button"
        className="btn btn--primary"
        onClick={onToggleAddForm}
        aria-expanded={showAddForm}
      >
        <Plus size={14} aria-hidden="true" />
        {t('schedule.relay.addLeg')}
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
  );
}
