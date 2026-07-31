import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { X } from 'lucide-react';
import type { HubApiClient } from '../../../api/client';
import type { SharedResource, Task } from '@teamhub/hub-contracts';
import { useI18n } from '../../../i18n';
import { Field } from '../../../components/Field';
import { FormGrid } from '../../../components/FormGrid';
import { FormEmptyState } from '../../../components/FormEmptyState';
import { candidateTasksForResource } from '../today-plan';

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

  const groupOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const tk of tasks) {
      if (!seen.has(tk.groupId)) seen.set(tk.groupId, tk.groupId);
    }
    return [...seen.entries()];
  }, [tasks]);

  useEffect(() => {
    if (taskId && !candidateTasks.some((tk) => tk.id === taskId)) {
      setTaskId('');
    } else if (!taskId && candidateTasks[0]) {
      setTaskId(candidateTasks[0].id);
    }
  }, [candidateTasks, taskId]);

  useEffect(() => {
    if (!newGroupId && groupOptions[0]) setNewGroupId(groupOptions[0][0]);
  }, [groupOptions, newGroupId]);

  const task = candidateTasks.find((tk) => tk.id === taskId);
  const validExisting = Boolean(resource) && Boolean(task);
  const validNew = Boolean(resource) && newTitle.trim().length > 0 && Boolean(newGroupId);
  const valid = newTaskMode ? validNew : validExisting;
  const noOptions = resources.length === 0;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!valid || !resource) return;
    setError(null);

    if (newTaskMode) {
      setCreating(true);
      try {
        const res = await client.createTask({
          projectId: resource.projectId,
          groupId: newGroupId,
          title: newTitle.trim(),
          rawSummary: newTitle.trim(),
          robotTarget: resource.robotTarget,
          intrinsicComplexity: 'normal',
          ownerId: null,
          collaboratorIds: [],
        });
        onSubmit({
          resourceId: resource.id,
          projectId: resource.projectId,
          taskId: res.task.id,
          groupId: newGroupId,
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
              <div className="relay-add__task-toggle">
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
                    className="input"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder={t('schedule.relay.addTaskNewPlaceholder')}
                  />
                  <select
                    value={newGroupId}
                    onChange={(e) => setNewGroupId(e.target.value)}
                  >
                    {groupOptions.map(([gid]) => (
                      <option value={gid} key={gid}>
                        {gid}
                      </option>
                    ))}
                  </select>
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
