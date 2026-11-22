import { useState } from 'react';
import type { Group, MemberPublic, SelfReportTaskRequest } from '@teamhub/hub-contracts';
import { useI18n } from '../../../i18n';
import { ReviewerPicker } from '../components/ReviewerPicker';

export function SelfReportForm({ groups, defaultGroupId, pending, onSubmit, members, memberId, defaultPlannedStart = '', defaultPlannedEnd = '' }: {
  groups: Group[]; defaultGroupId?: string; pending: boolean;
  members: MemberPublic[]; memberId: string;
  defaultPlannedStart?: string; defaultPlannedEnd?: string;
  onSubmit: (input: SelfReportTaskRequest) => void;
}) {
  const { t } = useI18n();
  const [groupId, setGroupId] = useState(groups.some(g => g.id === defaultGroupId) ? defaultGroupId! : groups[0]?.id ?? '');
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [robot, setRobot] = useState('');
  const [reviewerIds, setReviewerIds] = useState<string[]>([]);
  const [complexity, setComplexity] = useState<SelfReportTaskRequest['intrinsicComplexity']>('normal');
  const [plannedStart, setPlannedStart] = useState(defaultPlannedStart);
  const [plannedEnd, setPlannedEnd] = useState(defaultPlannedEnd);
  const validRange = !plannedStart || !plannedEnd || plannedEnd >= plannedStart;
  const valid = Boolean(groupId && title.trim() && summary.trim() && validRange);
  return <form className="week-form" onSubmit={event => {
    event.preventDefault();
    if (pending || !valid) return;
    onSubmit({ groupId, title: title.trim(), rawSummary: summary.trim(), intrinsicComplexity: complexity, reviewerIds,
      plannedStart: plannedStart || null, plannedEnd: plannedEnd || null,
      ...(robot ? { robotTarget: robot as SelfReportTaskRequest['robotTarget'] } : {}) });
  }}>
    <label className="gate-field">{t('week.group')}<select required value={groupId} onChange={event => setGroupId(event.target.value)}><option value="">{t('week.chooseGroup')}</option>{groups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>
    <label className="gate-field">{t('week.taskTitle')}<input required autoFocus value={title} onChange={event => setTitle(event.target.value)} /></label>
    <label className="gate-field">{t('week.summary')}<textarea required rows={4} value={summary} onChange={event => setSummary(event.target.value)} /></label>
    <label className="gate-field">{t('calendar.task.start')}<input type="date" value={plannedStart} onChange={event => setPlannedStart(event.target.value)} /></label>
    <label className="gate-field">{t('calendar.task.end')}<input type="date" value={plannedEnd} onChange={event => setPlannedEnd(event.target.value)} />{!validRange && <span role="alert">{t('calendar.task.dateOrder')}</span>}</label>
    <label className="gate-field">{t('week.robot')}<select value={robot} onChange={event => setRobot(event.target.value)}><option value="">{t('week.optional')}</option>{['R1', 'R2', 'shared'].map(value => <option key={value} value={value}>{value}</option>)}</select></label>
    <label className="gate-field">{t('week.complexity')}<select value={complexity} onChange={event => setComplexity(event.target.value as typeof complexity)}>{(['trivial', 'normal', 'hard'] as const).map(value => <option key={value} value={value}>{t(`week.complexity.${value}`)}</option>)}</select></label>
    <ReviewerPicker members={members} groups={groups} excludedIds={[memberId]} value={reviewerIds} onChange={setReviewerIds} disabled={pending} />
    <button className="btn btn--primary" disabled={pending || !valid}>{pending ? t('week.saving') : t('week.submit')}</button>
  </form>;
}
