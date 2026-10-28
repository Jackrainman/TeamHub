import { useState } from 'react';
import type { Group, SelfReportTaskRequest } from '@teamhub/hub-contracts';
import { useI18n } from '../../../i18n';

export function SelfReportForm({ projectId, groups, defaultGroupId, pending, onSubmit }: {
  projectId: string; groups: Group[]; defaultGroupId?: string; pending: boolean;
  onSubmit: (input: SelfReportTaskRequest) => void;
}) {
  const { t } = useI18n();
  const [groupId, setGroupId] = useState(groups.some(g => g.id === defaultGroupId) ? defaultGroupId! : groups[0]?.id ?? '');
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [robot, setRobot] = useState('');
  const [complexity, setComplexity] = useState<SelfReportTaskRequest['intrinsicComplexity']>('normal');
  return <form className="week-form" onSubmit={event => {
    event.preventDefault();
    if (pending || !projectId || !groupId || !title.trim() || !summary.trim()) return;
    onSubmit({ projectId, groupId, title: title.trim(), rawSummary: summary.trim(), intrinsicComplexity: complexity,
      ...(robot ? { robotTarget: robot as SelfReportTaskRequest['robotTarget'] } : {}),
    });
  }}>
    <p className="week-note">{t('week.selfHint')}</p>
    <label className="gate-field">{t('week.project')}<input value={t('week.currentProject')} readOnly /></label>
    <label className="gate-field">{t('week.group')}<select required value={groupId} onChange={event => setGroupId(event.target.value)}>
      <option value="">{t('week.chooseGroup')}</option>{groups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}
    </select></label>
    <label className="gate-field">{t('week.taskTitle')}<input required autoFocus value={title} onChange={event => setTitle(event.target.value)} /></label>
    <label className="gate-field">{t('week.summary')}<textarea required rows={4} value={summary} onChange={event => setSummary(event.target.value)} /></label>
    <label className="gate-field">{t('week.robot')}<select value={robot} onChange={event => setRobot(event.target.value)}>
      <option value="">{t('week.optional')}</option>{['R1', 'R2', 'shared'].map(value => <option key={value} value={value}>{value}</option>)}
    </select></label>
    <label className="gate-field">{t('week.complexity')}<select value={complexity} onChange={event => setComplexity(event.target.value as typeof complexity)}>
      {(['trivial', 'normal', 'hard'] as const).map(value => <option key={value} value={value}>{t(`week.complexity.${value}`)}</option>)}
    </select></label>
    <button className="btn btn--primary" disabled={pending || !projectId || !groupId || !title.trim() || !summary.trim()}>{pending ? t('week.saving') : t('week.submit')}</button>
  </form>;
}
