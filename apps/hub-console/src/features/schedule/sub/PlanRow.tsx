import { Plus, X } from 'lucide-react';
import type { SharedResource, Task } from '@teamhub/hub-contracts';
import { useI18n } from '../../../i18n';
import { Combobox } from '../../../components/Combobox';
import {
  candidateTasksForResource,
  matchTaskByTitle,
  type DraftRow,
} from '../today-plan';

export function PlanRow({
  row,
  resource,
  tasks,
  rowGroupOptions,
  onUpdate,
  onAdd,
  onRemove,
}: {
  row: DraftRow;
  resource: SharedResource | undefined;
  tasks: Task[];
  rowGroupOptions: { id: string; name: string }[];
  onUpdate: (key: string, patch: Partial<DraftRow>) => void;
  onAdd: (resourceId: string) => void;
  onRemove: (key: string) => void;
}) {
  const { t } = useI18n();
  const candidates = resource ? candidateTasksForResource(tasks, resource) : [];
  const matched = resource ? matchTaskByTitle(tasks, resource, row.taskTitle) : undefined;
  const trimmedTitle = row.taskTitle.trim();
  const needsConfirm = trimmedTitle !== '' && !matched;

  return (
    <tr>
      <td className="today-plan-table__resource">
        {resource?.displayCode ?? resource?.name ?? row.resourceId}
      </td>
      <td>
        <select
          value={row.groupId}
          aria-label={t('schedule.table.colGroup')}
          onChange={(e) => onUpdate(row.key, { groupId: e.target.value })}
        >
          <option value="">{t('schedule.table.groupPlaceholder')}</option>
          {rowGroupOptions.map((g) => (
            <option value={g.id} key={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </td>
      <td className="today-plan-table__taskCell">
        <Combobox
          value={row.taskTitle}
          onChange={(v) => onUpdate(row.key, { taskTitle: v, confirmNewTask: false })}
          options={candidates.map((c) => c.title)}
          ariaLabel={t('schedule.table.colTask')}
          placeholder={t('schedule.table.taskPlaceholder')}
        />
        {needsConfirm ? (
          <label className="today-plan-table__confirmNew">
            <input
              type="checkbox"
              checked={row.confirmNewTask}
              onChange={(e) => onUpdate(row.key, { confirmNewTask: e.target.checked })}
            />
            {t('schedule.table.confirmNewTask', { title: trimmedTitle })}
          </label>
        ) : null}
      </td>
      <td>
        <input
          value={row.note}
          aria-label={t('schedule.table.colNote')}
          placeholder={t('schedule.table.notePlaceholder')}
          onChange={(e) => onUpdate(row.key, { note: e.target.value })}
        />
      </td>
      <td className="today-plan-table__rowActions">
        <button
          type="button"
          className="today-plan-table__rowBtn"
          title={t('schedule.table.addRow')}
          aria-label={t('schedule.table.addRow')}
          onClick={() => onAdd(row.resourceId)}
        >
          <Plus size={14} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="today-plan-table__rowBtn today-plan-table__rowBtn--danger"
          title={t('schedule.table.removeRow')}
          aria-label={t('schedule.table.removeRow')}
          onClick={() => onRemove(row.key)}
        >
          <X size={14} aria-hidden="true" />
        </button>
      </td>
    </tr>
  );
}
