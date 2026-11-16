import { SegToggle } from '../../../components/SegToggle';
import { useI18n } from '../../../i18n';
import type { CalendarScope } from './model';

export type { CalendarScope } from './model';

export function CalendarScopeToggle({ value, onChange }: {
  value: CalendarScope;
  onChange: (value: CalendarScope) => void;
}): JSX.Element {
  const { t } = useI18n();
  return <SegToggle
    value={value}
    options={[
      { value: 'personal', label: t('calendar.scope.personal') },
      { value: 'group', label: t('calendar.scope.group') },
      { value: 'team', label: t('calendar.scope.team') },
    ]}
    onChange={onChange}
    ariaLabel={t('calendar.scope.aria')}
  />;
}
