import type { Group, MemberPublic } from '@teamhub/hub-contracts';
import { ChevronDown, X } from 'lucide-react';
import { useI18n } from '../../../i18n';

export function ReviewerPicker({ members, groups, excludedIds, value, onChange, disabled = false }: {
  members: MemberPublic[]; groups: Group[]; excludedIds: (string | null | undefined)[]; value: string[];
  onChange: (ids: string[]) => void; disabled?: boolean;
}) {
  const { t } = useI18n();
  const candidates = members.filter(member => !excludedIds.includes(member.id));
  const groupIds = [...new Set(candidates.map(member => member.groupId))];
  const remove = (id: string) => onChange(value.filter(selected => selected !== id));
  return <fieldset className="task-reviewer-picker" disabled={disabled}>
    <legend>{t('team.reviewers')}</legend>
    <p className="week-note">{t('team.reviewerHint')}</p>
    {!!value.length && <div className="reviewer-selected" aria-label={t('team.selectedReviewers')}>
      <span>{t('team.selectedReviewers')}</span>
      {value.map(id => {
        const name = members.find(member => member.id === id)?.displayName ?? id;
        return <button key={id} type="button" className="btn btn--secondary btn--sm" aria-label={`${t('team.removeReviewer')} ${name}`} onClick={() => remove(id)}>{name}<X size={12} aria-hidden="true" /></button>;
      })}
    </div>}
    <div className="reviewer-groups">{groupIds.map(groupId => <details key={groupId} className="reviewer-group">
      <summary><span>{groups.find(group => group.id === groupId)?.name ?? t('team.otherGroup')}</span><ChevronDown size={16} aria-hidden="true" /></summary>
      <div className="reviewer-options">{candidates.filter(member => member.groupId === groupId).map(member =>
        <label key={member.id}><input type="checkbox" checked={value.includes(member.id)} onChange={event => event.target.checked ? onChange([...value, member.id]) : remove(member.id)} />{member.displayName}</label>
      )}</div>
    </details>)}</div>
  </fieldset>;
}
