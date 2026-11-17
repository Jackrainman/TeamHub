import { useState } from 'react';
import { taskAuthorId, type Group, type MemberPublic, type TaskWithMeta } from '@teamhub/hub-contracts';
import type { HubApiClient } from '../../../api/client';
import { useI18n } from '../../../i18n';
import { useEditSelfTask } from '../hooks';
import { ReviewerPicker } from './ReviewerPicker';

export function TaskEditor({ task, client, members, groups, onClose }: {
  task: TaskWithMeta; client: HubApiClient; members: MemberPublic[]; groups: Group[]; onClose: () => void;
}) {
  const { t } = useI18n();
  const [revision] = useState(task.revision ?? 0);
  const [title, setTitle] = useState(task.title);
  const [summary, setSummary] = useState(task.rawSummary);
  const [reviewerIds, setReviewerIds] = useState(task.reviewerIds ?? []);
  const [plannedStart, setPlannedStart] = useState(task.plannedStart ?? '');
  const [plannedEnd, setPlannedEnd] = useState(task.plannedEnd ?? '');
  const mutation = useEditSelfTask(client, task.id, onClose);
  const stale = revision !== (task.revision ?? 0);
  const validRange = !plannedStart || !plannedEnd || plannedEnd >= plannedStart;
  return <form className="week-form" onSubmit={event => {
    event.preventDefault();
    if (!stale && !mutation.isPending && title.trim() && summary.trim() && validRange) {
      mutation.mutate({ expectedRevision: revision, title: title.trim(), rawSummary: summary.trim(), reviewerIds,
        plannedStart: plannedStart || null, plannedEnd: plannedEnd || null });
    }
  }}>
    <label className="gate-field">{t('week.taskTitle')}<input required value={title} onChange={event => setTitle(event.target.value)} /></label>
    <label className="gate-field">{t('week.summary')}<textarea required rows={3} value={summary} onChange={event => setSummary(event.target.value)} /></label>
    <label className="gate-field">{t('calendar.task.start')}<input type="date" value={plannedStart} onChange={event => setPlannedStart(event.target.value)} /></label>
    <label className="gate-field">{t('calendar.task.end')}<input type="date" value={plannedEnd} onChange={event => setPlannedEnd(event.target.value)} />{!validRange && <span role="alert">{t('calendar.task.dateOrder')}</span>}</label>
    <ReviewerPicker members={members} groups={groups} excludedIds={[taskAuthorId(task), task.ownerId, task.completedBy?.id]} value={reviewerIds} onChange={setReviewerIds} disabled={mutation.isPending} />
    {task.status === 'done' && <p className="week-note">{t('team.editHint')}</p>}
    {stale && <p role="alert">{t('team.stale')}</p>}
    <div className="task-detail__panel-btns"><button className="btn btn--primary btn--sm" disabled={stale || mutation.isPending || !title.trim() || !summary.trim() || !validRange}>{t('week.submit')}</button>
      <button type="button" className="btn btn--ghost btn--sm" disabled={mutation.isPending} onClick={onClose}>{t('pool.cancel')}</button>
    </div>
  </form>;
}
