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
  // Keep the opened revision: a background refresh must not silently replace edits.
  const [revision] = useState(task.revision ?? 0);
  const [title, setTitle] = useState(task.title);
  const [summary, setSummary] = useState(task.rawSummary);
  const [reviewerIds, setReviewerIds] = useState(task.reviewerIds ?? []);
  const mutation = useEditSelfTask(client, task.id, onClose);
  const stale = revision !== (task.revision ?? 0);
  return <form className="week-form" onSubmit={event => {
    event.preventDefault();
    if (!stale && !mutation.isPending && title.trim() && summary.trim()) mutation.mutate({ expectedRevision: revision, title: title.trim(), rawSummary: summary.trim(), reviewerIds });
  }}>
    <label className="gate-field">{t('week.taskTitle')}<input required value={title} onChange={event => setTitle(event.target.value)} /></label>
    <label className="gate-field">{t('week.summary')}<textarea required rows={3} value={summary} onChange={event => setSummary(event.target.value)} /></label>
    <ReviewerPicker members={members} groups={groups} excludedIds={[taskAuthorId(task), task.ownerId, task.completedBy?.id]} value={reviewerIds} onChange={setReviewerIds} disabled={mutation.isPending} />
    {task.status === 'done' && <p className="week-note">{t('team.editHint')}</p>}
    {stale && <p role="alert">{t('team.stale')}</p>}
    <div className="task-detail__panel-btns">
      <button className="btn btn--primary btn--sm" disabled={stale || mutation.isPending || !title.trim() || !summary.trim()}>{t('week.submit')}</button>
      <button type="button" className="btn btn--ghost btn--sm" disabled={mutation.isPending} onClick={onClose}>{t('pool.cancel')}</button>
    </div>
  </form>;
}
