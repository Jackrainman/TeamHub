import type { Group, MemberPublic, TaskWithMeta } from '@teamhub/hub-contracts';
import { deriveTaskAcceptance, taskAuthorId } from '@teamhub/hub-contracts';
import { useState } from 'react';
import { useI18n } from '../../i18n';
import { TaskEditor } from './components/TaskEditor';
import type { HubApiClient } from '../../api/client';
import type { PageIdentityCtx } from '../../console-pages';
import { useTaskActions } from './sub/useTaskActions';
import { TaskDetailBadges } from './sub/TaskDetailBadges';
import { TaskFacts } from './sub/TaskFacts';
import { TaskTimeline } from './sub/TaskTimeline';
import { TaskActionsPanel } from './sub/TaskActionsPanel';
import { SideDrawer } from '../../components/SideDrawer';
import { Field } from '../../shared/ui/Field';

export function TaskDetailDrawer({
  client,
  source,
  task,
  members,
  groups,
  identity,
  readOnly = false,
}: {
  client: HubApiClient;
  source: string;
  task: TaskWithMeta;
  members: MemberPublic[];
  groups: Group[];
  identity: PageIdentityCtx;
  readOnly?: boolean;
}) {
  const actions = useTaskActions(client, source, task, members, identity);
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const canEdit = !readOnly && identity.canWrite && !!task.weekLinks?.length && taskAuthorId(task) === identity.session?.memberId;

  const groupName = groups.find((g) => g.id === task.groupId)?.name ?? task.groupId;
  const acceptance = deriveTaskAcceptance(task);

  return (
    <div className="task-detail">
      <p className="task-detail__summary">{task.rawSummary}</p>
      <TaskDetailBadges
        groupName={groupName}
        isBig={task.isBig}
        acceptance={acceptance}
        partnerWanted={actions.partnerWanted}
        crossWanted={actions.crossWanted}
      />
      <TaskFacts task={task} members={members} acceptance={acceptance} />
      {!!task.weekLinks?.length && <div className="task-detail__reviewers">
        <strong>{t('team.reviewers')}</strong>
        <p>{task.reviewerIds?.length ? task.reviewerIds.map(id => members.find(member => member.id === id)?.displayName ?? id).join('、') : t('team.noReviewers')}</p>
        {canEdit && !editing && <button className="btn btn--secondary btn--sm" onClick={() => setEditing(true)}>{t('team.edit')}</button>}
      </div>}
      {canEdit && editing && <TaskEditor task={task} client={client} members={members} groups={groups} onClose={() => setEditing(false)} />}
      <section className="task-detail__delivery" aria-label={t('delivery.title')}>
        <h3>{t('delivery.title')}</h3>
        {task.delivery ? <dl>
          <div><dt>{t('delivery.summary')}</dt><dd>{task.delivery.summary}</dd></div>
          <div><dt>{t('delivery.deliverable')}</dt><dd>{task.delivery.deliverable}</dd></div>
          <div><dt>{t('delivery.paths')}</dt><dd><ul>{task.delivery.paths.map(path => <li key={path}>{path}</li>)}</ul></dd></div>
        </dl> : <p className="task-detail__hint">{t('delivery.empty')}</p>}
      </section>
      <TaskTimeline task={task} members={members} />
      {!readOnly && <TaskActionsPanel actions={actions} task={task} members={members} acceptance={acceptance} />}
      <SideDrawer placement="center" open={actions.selfAcceptOpen} onClose={() => actions.setSelfAcceptOpen(false)} title={t('rail.selfAccept.title')}>
        <form className="task-detail__self-accept" onSubmit={event => {
          event.preventDefault();
          actions.reviewMutation.mutate({
            outcome: 'accept',
            actor: actions.reviewActor(),
            delivery: {
              summary: actions.deliverySummary.trim(),
              deliverable: actions.deliveryDeliverable.trim(),
              paths: actions.deliveryPaths.split('\n').map(path => path.trim()).filter(Boolean),
            },
          });
        }}>
          <p className="self-accept-form__hint">{t('rail.selfAccept.hint')}</p>
          <Field label={t('rail.selfAccept.summary')} required>
            <textarea required aria-required aria-label={t('rail.selfAccept.summary')} maxLength={500} rows={4} value={actions.deliverySummary} onChange={event => actions.setDeliverySummary(event.target.value)} />
          </Field>
          <Field label={t('rail.selfAccept.deliverable')} required>
            <textarea required aria-required aria-label={t('rail.selfAccept.deliverable')} maxLength={500} rows={4} value={actions.deliveryDeliverable} onChange={event => actions.setDeliveryDeliverable(event.target.value)} />
          </Field>
          <Field label={t('rail.selfAccept.paths')} required>
            <textarea required aria-required aria-label={t('rail.selfAccept.paths')} rows={4} value={actions.deliveryPaths} onChange={event => actions.setDeliveryPaths(event.target.value)} />
          </Field>
          <button type="submit" className="btn btn--primary" disabled={actions.reviewMutation.isPending || !actions.deliverySummary.trim() || !actions.deliveryDeliverable.trim() || !actions.deliveryPaths.split('\n').some(path => path.trim())}>{t('rail.selfAccept.submit')}</button>
        </form>
      </SideDrawer>
    </div>
  );
}
