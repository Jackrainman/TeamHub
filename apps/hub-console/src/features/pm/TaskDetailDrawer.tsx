import type { Group, MemberPublic, TaskWithMeta } from '@teamhub/hub-contracts';
import { deriveTaskAcceptance } from '@teamhub/hub-contracts';
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
}: {
  client: HubApiClient;
  source: string;
  task: TaskWithMeta;
  members: MemberPublic[];
  groups: Group[];
  identity: PageIdentityCtx;
}) {
  const actions = useTaskActions(client, source, task, members, identity);

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
      <TaskTimeline task={task} />
      <TaskActionsPanel actions={actions} task={task} members={members} acceptance={acceptance} />
    </div>
  );
}
