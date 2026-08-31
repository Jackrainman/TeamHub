import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { X } from 'lucide-react';
import type { HubApiClient } from '../../../api/client';
import type { SharedResource, Task } from '@teamhub/hub-contracts';
import {
  CONVERGENCE_SCOPE_ALL_LEAF_GROUPS,
  CONVERGENCE_SENTINEL_GROUP_ID,
  deriveLeafGroups,
} from '@teamhub/hub-contracts';
import { useI18n } from '../../../i18n';
import { useGroups } from '../../../features/pm/hooks';
import { Field } from '../../../components/Field';
import { FormGrid } from '../../../components/FormGrid';
import { FormEmptyState } from '../../../components/FormEmptyState';
import { candidateTasksForResource } from '../../../shared/lib/resource-tasks';

export function AddLegForm({
  client,
  resources,
  tasks,
  pending,
  onSubmit,
  onCancel,
}: {
  client: HubApiClient;
  resources: SharedResource[];
  tasks: Task[];
  pending: boolean;
  onSubmit: (vars: {
    resourceId: string;
    projectId: string;
    taskId: string;
    groupId: string;
  }) => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const [resourceId, setResourceId] = useState(resources[0]?.id ?? '');
  const [taskId, setTaskId] = useState('');
  const [newTaskMode, setNewTaskMode] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newGroupId, setNewGroupId] = useState('');
  // 总联调开关（CONVERGENCE-TASK-ENTRY）：勾选后新任务挂哨兵组 + convergenceScope，不走负责组下拉。
  const [newConvergence, setNewConvergence] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!resourceId && resources[0]) setResourceId(resources[0].id);
  }, [resources, resourceId]);

  const resource = resources.find((r) => r.id === resourceId);
  const candidateTasks = useMemo(
    () => (resource ? candidateTasksForResource(tasks, resource) : []),
    [tasks, resource],
  );

  // 「负责组」下拉候选：全量组列表（GET /api/groups）派生叶子组（与 TodayPlanTable 同源；
  // 叶子组才可挂任务/进 lineup），option 显组名、value 存组 id。不从 tasks 反推——无任务的组也要能选。
  const groupsQuery = useGroups(client, 'relayAddLeg');
  const groupOptions = useMemo(() => {
    const groups = groupsQuery.data?.groups ?? [];
    const leaf = new Set(deriveLeafGroups([...groups]));
    return groups
      .filter((g) => leaf.has(g.id))
      .map((g) => ({ id: g.id, name: g.name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'zh'));
  }, [groupsQuery.data]);

  useEffect(() => {
    if (taskId && !candidateTasks.some((tk) => tk.id === taskId)) {
      setTaskId('');
    } else if (!taskId && candidateTasks[0]) {
      setTaskId(candidateTasks[0].id);
    }
  }, [candidateTasks, taskId]);

  useEffect(() => {
    if (!newGroupId && groupOptions[0]) setNewGroupId(groupOptions[0].id);
  }, [groupOptions, newGroupId]);

  const task = candidateTasks.find((tk) => tk.id === taskId);
  const validExisting = Boolean(resource) && Boolean(task);
  const validNew =
    Boolean(resource) &&
    newTitle.trim().length > 0 &&
    (newConvergence || Boolean(newGroupId));
  const valid = newTaskMode ? validNew : validExisting;
  const noOptions = resources.length === 0;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!valid || !resource) return;
    setError(null);

    if (newTaskMode) {
      setCreating(true);
      const groupId = newConvergence ? CONVERGENCE_SENTINEL_GROUP_ID : newGroupId;
      try {
        const res = await client.createTask({
          projectId: resource.projectId,
          groupId,
          title: newTitle.trim(),
          rawSummary: newTitle.trim(),
          robotTarget: resource.robotTarget,
          intrinsicComplexity: 'normal',
          ownerId: null,
          collaboratorIds: [],
          convergenceScope: newConvergence ? CONVERGENCE_SCOPE_ALL_LEAF_GROUPS : undefined,
        });
        onSubmit({
          resourceId: resource.id,
          projectId: resource.projectId,
          taskId: res.task.id,
          groupId,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'failed');
        setCreating(false);
      }
      return;
    }

    if (!task) return;
    onSubmit({
      resourceId: resource.id,
      projectId: resource.projectId,
      taskId: task.id,
      groupId: task.groupId,
    });
  }

  const busy = pending || creating;

  return (
    <section
      className="relay-add panel"
      aria-label={t('schedule.relay.addLeg')}
    >
      <header className="pm-create__head">
        <div>
          <h2>{t('schedule.relay.addLeg')}</h2>
          <p className="pm-create__note">{t('schedule.relay.addSubtitle')}</p>
        </div>
        <button
          type="button"
          className="relay-add__close"
          aria-label={t('schedule.relay.addCancel')}
          onClick={onCancel}
        >
          <X size={16} aria-hidden="true" />
        </button>
      </header>
      {noOptions ? (
        <FormEmptyState message={t('schedule.relay.addEmptyRobot')} />
      ) : (
        <form className="pm-form" onSubmit={submit}>
          <FormGrid>
            <Field label={t('schedule.relay.addRobot')}>
              <select
                value={resourceId}
                onChange={(e) => setResourceId(e.target.value)}
              >
                {resources.map((r) => (
                  <option value={r.id} key={r.id}>
                    {r.displayCode ?? r.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('schedule.relay.addTask')}>
              <div>
                <button
                  type="button"
                  className={`btn btn--sm ${!newTaskMode ? 'btn--primary' : ''}`}
                  onClick={() => setNewTaskMode(false)}
                >
                  {t('schedule.relay.addTaskExisting')}
                </button>
                <button
                  type="button"
                  className={`btn btn--sm ${newTaskMode ? 'btn--primary' : ''}`}
                  onClick={() => setNewTaskMode(true)}
                >
                  {t('schedule.relay.addTaskNew')}
                </button>
              </div>
              {!newTaskMode ? (
                candidateTasks.length > 0 ? (
                  <select value={taskId} onChange={(e) => setTaskId(e.target.value)}>
                    {candidateTasks.map((tk) => (
                      <option value={tk.id} key={tk.id}>
                        {tk.title}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="form-hint">{t('schedule.relay.addEmptyTask')}</p>
                )
              ) : (
                <>
                  <input
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder={t('schedule.relay.addTaskNewPlaceholder')}
                  />
                  <label className="pm-check">
                    <input
                      type="checkbox"
                      checked={newConvergence}
                      onChange={(e) => setNewConvergence(e.target.checked)}
                    />
                    <span>{t('schedule.relay.addConvergence')}</span>
                  </label>
                  {!newConvergence && (
                    <select
                      value={newGroupId}
                      onChange={(e) => setNewGroupId(e.target.value)}
                    >
                      {groupOptions.map((g) => (
                        <option value={g.id} key={g.id}>
                          {g.name}
                        </option>
                      ))}
                    </select>
                  )}
                </>
              )}
            </Field>
          </FormGrid>
          {error && <p className="form-hint form-hint--warn">{error}</p>}
          <div className="pm-form__footer">
            <button
              className="btn btn--primary"
              type="submit"
              disabled={!valid || busy}
            >
              {busy
                ? t('schedule.relay.addSubmitting')
                : t('schedule.relay.addSubmit')}
            </button>
            <button
              type="button"
              className="relay-add__cancel"
              onClick={onCancel}
            >
              {t('schedule.relay.addCancel')}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
