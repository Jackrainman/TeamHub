import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Plus, X } from 'lucide-react';
import type { HubApiClient } from '../../../api/client';
import type {
  DefaultPreset,
  ResourceStatus,
  SharedResource,
  UpdateResourceStatusRequest,
} from '../../../api/schemas/resources';
import type { Task } from '@teamhub/hub-contracts';
import { useI18n } from '../../../i18n';
import { humanizeFormError } from '../../../utils';
import { candidateTasksForResource } from '../../../shared/lib/resource-tasks';
import { STATUSES, STATUS_KEY, STATUS_OPTION_KEY, KIND_KEY, statusTone } from './constants';

interface PresetLineupRow {
  key: string;
  groupId: string;
  taskId: string;
}

function lineupToRows(preset: DefaultPreset | undefined): PresetLineupRow[] {
  return (preset?.lineup ?? []).map((entry, i) => ({
    key: `${i}-${entry.groupId}-${entry.taskId ?? ''}`,
    groupId: entry.groupId,
    taskId: entry.taskId ?? '',
  }));
}

function makePresetRowKey(): string {
  return `new-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function DefaultPresetEditor({
  resource,
  client,
  tasks,
  groupOptions,
  onUpdated,
}: {
  resource: SharedResource;
  client: HubApiClient;
  tasks: Task[];
  groupOptions: Map<string, string>;
  onUpdated: () => void;
}) {
  const { t } = useI18n();
  const [rows, setRows] = useState<PresetLineupRow[]>(() => lineupToRows(resource.defaultPreset));
  const [syncedAt, setSyncedAt] = useState(resource.updatedAt);
  useEffect(() => {
    if (resource.updatedAt !== syncedAt) {
      setRows(lineupToRows(resource.defaultPreset));
      setSyncedAt(resource.updatedAt);
    }
  }, [resource.updatedAt, resource.defaultPreset, syncedAt]);

  const candidates = useMemo(() => candidateTasksForResource(tasks, resource), [tasks, resource]);
  const tasksById = useMemo(() => new Map(tasks.map((tk) => [tk.id, tk])), [tasks]);
  const rowGroupOptions = useMemo(() => {
    const map = new Map(groupOptions);
    for (const row of rows) {
      if (row.groupId && !map.has(row.groupId)) map.set(row.groupId, row.groupId);
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'zh'));
  }, [groupOptions, rows]);

  const mutation = useMutation({
    mutationFn: (defaultPreset: DefaultPreset | null) =>
      client.updateResourceDefaultPreset(resource.id, { defaultPreset }),
    onSuccess: onUpdated,
  });

  function updateRow(key: string, patch: Partial<PresetLineupRow>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }
  function addRow() {
    setRows((rs) => [...rs, { key: makePresetRowKey(), groupId: '', taskId: '' }]);
  }
  function removeRow(key: string) {
    setRows((rs) => rs.filter((r) => r.key !== key));
  }

  const allGroupsFilled = rows.every((r) => r.groupId.trim() !== '');

  function handleSave() {
    if (rows.length === 0) {
      mutation.mutate(null);
      return;
    }
    if (!allGroupsFilled) return;
    mutation.mutate({
      lineup: rows.map((r) => ({
        groupId: r.groupId.trim(),
        ...(r.taskId ? { taskId: r.taskId } : {}),
      })),
    });
  }
  function handleClear() {
    const previousRows = rows;
    setRows([]);
    mutation.mutate(null, {
      onError: () => setRows(previousRows),
    });
  }

  return (
    <div className="resources-preset-editor">
      {rows.length === 0 ? (
        <p className="form-hint">{t('resources.preset.empty')}</p>
      ) : (
        <ul className="resources-preset-list">
          {rows.map((row) => (
            <li key={row.key} className="resources-preset-list__row">
              <select
                value={row.groupId}
                aria-label={t('resources.preset.groupLabel')}
                onChange={(e) => updateRow(row.key, { groupId: e.target.value })}
              >
                <option value="">{t('resources.preset.groupPlaceholder')}</option>
                {rowGroupOptions.map((g) => (
                  <option value={g.id} key={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
              <select
                value={row.taskId}
                aria-label={t('resources.preset.taskLabel')}
                onChange={(e) => updateRow(row.key, { taskId: e.target.value })}
              >
                <option value="">{t('resources.preset.taskNone')}</option>
                {candidates.map((tk) => (
                  <option value={tk.id} key={tk.id}>
                    {tk.title}
                  </option>
                ))}
                {row.taskId && !candidates.some((c) => c.id === row.taskId) ? (
                  <option value={row.taskId}>
                    {tasksById.get(row.taskId)?.title ?? row.taskId}
                  </option>
                ) : null}
              </select>
              <button
                type="button"
                className="today-plan-table__rowBtn today-plan-table__rowBtn--danger"
                title={t('resources.preset.removeRow')}
                aria-label={t('resources.preset.removeRow')}
                onClick={() => removeRow(row.key)}
              >
                <X size={14} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="resources-preset-editor__actions">
        <button
          type="button"
          className="today-plan-table__rowBtn"
          title={t('resources.preset.addRow')}
          aria-label={t('resources.preset.addRow')}
          onClick={addRow}
        >
          <Plus size={14} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="btn btn--primary resources-apply"
          disabled={mutation.isPending || (rows.length > 0 && !allGroupsFilled)}
          onClick={handleSave}
        >
          {mutation.isPending ? t('resources.preset.saving') : t('resources.preset.save')}
        </button>
        {resource.defaultPreset ? (
          <button
            type="button"
            className="resources-preset-editor__clear"
            disabled={mutation.isPending}
            onClick={handleClear}
          >
            {t('resources.preset.clear')}
          </button>
        ) : null}
      </div>
      {mutation.error ? (
        <p className="resources-row-error">
          {humanizeFormError(mutation.error, t, 'resources.preset.error')}
        </p>
      ) : null}
    </div>
  );
}

export function ResourceRow({
  resource,
  client,
  tasks,
  groupOptions,
  onUpdated,
}: {
  resource: SharedResource;
  client: HubApiClient;
  tasks: Task[];
  groupOptions: Map<string, string>;
  onUpdated: () => void;
}) {
  const { t } = useI18n();
  const [status, setStatus] = useState<ResourceStatus>(resource.status);
  const [reason, setReason] = useState('');
  const [presetOpen, setPresetOpen] = useState(false);

  const mutation = useMutation({
    mutationFn: (patch: UpdateResourceStatusRequest) =>
      client.updateResourceStatus(resource.id, patch),
    onSuccess: () => {
      setReason('');
      onUpdated();
    },
  });

  function apply(event: FormEvent) {
    event.preventDefault();
    if (!dirty || mutation.isPending) return;
    const trimmed = reason.trim();
    mutation.mutate({
      status,
      ...(trimmed ? { statusReason: trimmed } : {}),
    });
  }

  const code = resource.displayCode ?? resource.name;
  const dirty = status !== resource.status || reason.trim().length > 0;
  const presetCount = resource.defaultPreset?.lineup.length ?? 0;

  return (
    <>
      <tr>
        <td>
          <span className="resources-code-badge">{code}</span>
        </td>
        <td className="resources-cell--name">{resource.name}</td>
        <td>{t(KIND_KEY[resource.kind])}</td>
        <td>
          <span className={`badge badge--dense ${statusTone(resource.status)}`.trim()}>
            {t(STATUS_KEY[resource.status])}
          </span>
          {resource.statusReason ? (
            <span className="resources-reason">{resource.statusReason}</span>
          ) : null}
        </td>
        <td>
          <form className="resources-action" onSubmit={apply}>
            <select
              value={status}
              aria-label={t('resources.action.statusLabel')}
              onChange={(e) => setStatus(e.target.value as ResourceStatus)}
            >
              {STATUSES.map((s) => (
                <option value={s} key={s}>
                  {t(STATUS_OPTION_KEY[s])}
                </option>
              ))}
            </select>
            <input
              className="resources-reason-input"
              value={reason}
              placeholder={t('resources.action.reasonPlaceholder')}
              aria-label={t('resources.action.reasonLabel')}
              onChange={(e) => setReason(e.target.value)}
            />
            <button
              type="submit"
              className="btn btn--primary resources-apply"
              disabled={!dirty || mutation.isPending}
            >
              {mutation.isPending
                ? t('resources.action.applying')
                : t('resources.action.apply')}
            </button>
          </form>
          {mutation.error ? (
            <p className="resources-row-error">
              {humanizeFormError(mutation.error, t, 'resources.action.error')}
            </p>
          ) : null}
        </td>
        <td>
          <button
            type="button"
            className="resources-preset-toggle"
            onClick={() => setPresetOpen((v) => !v)}
          >
            {presetCount > 0
              ? t('resources.preset.summaryCount', { count: presetCount })
              : t('resources.preset.none')}
            {' · '}
            {presetOpen ? t('resources.preset.close') : t('resources.preset.edit')}
          </button>
        </td>
      </tr>
      {presetOpen ? (
        <tr className="resources-preset-row">
          <td colSpan={6}>
            <DefaultPresetEditor
              resource={resource}
              client={client}
              tasks={tasks}
              groupOptions={groupOptions}
              onUpdated={onUpdated}
            />
          </td>
        </tr>
      ) : null}
    </>
  );
}
