import type { MemberPublic } from '@teamhub/hub-contracts';
import { useI18n } from '../../../i18n';

export function ReviewerPicker({ members, excludedIds, value, onChange, disabled = false }: {
  members: MemberPublic[]; excludedIds: (string | null | undefined)[]; value: string[];
  onChange: (ids: string[]) => void; disabled?: boolean;
}) {
  const { t } = useI18n();
  return <fieldset className="task-reviewer-picker" disabled={disabled}>
    <legend>{t('team.reviewers')}</legend>
    <p className="week-note">{t('team.reviewerHint')}</p>
    <div className="reviewer-options">{members.filter(member => !excludedIds.includes(member.id)).map(member =>
      <label key={member.id}><input type="checkbox" checked={value.includes(member.id)} onChange={event => onChange(event.target.checked ? [...value, member.id] : value.filter(id => id !== member.id))} />{member.displayName}</label>
    )}</div>
  </fieldset>;
}
