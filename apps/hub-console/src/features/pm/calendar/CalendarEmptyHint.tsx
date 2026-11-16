import { CalendarPlus, Plus } from 'lucide-react';
import { useI18n } from '../../../i18n';
import { Button } from '../../../shared/ui/Button';

export function CalendarEmptyHint({ kind, count, canWrite, lockHint, onCreate }: {
  kind: 'no-projects' | 'no-dates';
  count: number;
  canWrite: boolean;
  lockHint: string | null;
  onCreate: () => void;
}): JSX.Element {
  const { t } = useI18n();
  return <div className="calendar-empty-hint" data-empty-kind={kind}>
    <CalendarPlus className="calendar-empty-hint__icon" size={24} strokeWidth={1.75} aria-hidden="true" />
    <div className="calendar-empty-hint__copy">
      <strong>{t(kind === 'no-projects' ? 'calendar.empty.hint.noProjects' : 'calendar.empty.hint.noDates', { count })}</strong>
      <span>{t('calendar.empty.hint.desc')}</span>
    </div>
    <Button
      variant="primary"
      size="sm"
      icon={<Plus size={16} aria-hidden="true" />}
      data-action="create-project"
      disabled={!canWrite}
      title={lockHint ?? undefined}
      onClick={onCreate}
    >{t('calendar.project.create')}</Button>
  </div>;
}
