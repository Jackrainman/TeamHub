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
  const acceptance = deriveTaskAcceptance(task, task.isBig);

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
      {canEdit && editing && <TaskEditor task={task} client={client} members={members} onClose={() => setEditing(false)} />}
      <TaskTimeline task={task} members={members} />
      {!readOnly && <TaskActionsPanel actions={actions} task={task} members={members} acceptance={acceptance} />}
    </div>
  );
}
