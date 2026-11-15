import { useEffect, useState, type ReactNode } from 'react';
import { Inbox } from 'lucide-react';
import type { DepNode, Group, MemberPublic, TaskStatus, TaskWithMeta } from '@teamhub/hub-contracts';
import { useI18n } from '../../../../i18n';
import { SegToggle } from '../../../../components/SegToggle';
import { STATUS_KEY } from '../../sub/constants';
import { organizeTasks, type TaskGrouping, type TaskLayout, type TaskSort } from '../task-view';
import { WeekTaskCard } from '../WeekTaskCard';

interface BatchReceipt {
  taskId: string;
  title: string;
  ok: boolean;
  detail?: string;
}

export function WeekTaskView({
  tasks,
  groups,
  members,
  nodes,
  layout,
  columns,
  onLayout,
  onColumns,
  onOpen,
  onBatchStatus,
  batchPending,
  renderActions,
}: {
  tasks: TaskWithMeta[];
  groups: Group[];
  members: MemberPublic[];
  nodes: DepNode[];
  layout: TaskLayout;
  columns: 2 | 3 | 4;
  onLayout: (layout: TaskLayout) => void;
  onColumns: (columns: 2 | 3 | 4) => void;
  onOpen: (taskId: string) => void;
  onBatchStatus: (task: TaskWithMeta, status: TaskStatus) => Promise<void>;
  batchPending: boolean;
  renderActions: (task: TaskWithMeta) => ReactNode;
}) {
  const { t } = useI18n();
  const [grouping, setGrouping] = useState<TaskGrouping>('none');
  const [sort, setSort] = useState<TaskSort>('updated');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchStatus, setBatchStatus] = useState<TaskStatus>('inProgress');
  const [receipts, setReceipts] = useState<BatchReceipt[]>([]);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    const visible = new Set(tasks.map(task => task.id));
    setSelected(previous => {
      const next = new Set([...previous].filter(id => visible.has(id)));
      return next.size === previous.size ? previous : next;
    });
  }, [tasks]);

  const organized = organizeTasks(tasks, groups, grouping, sort, status => t(STATUS_KEY[status]), t('week.group.ungrouped'));
  const selectedTasks = tasks.filter(task => selected.has(task.id));
  const busy = running || batchPending;

  function toggle(taskId: string) {
    setSelected(previous => {
      const next = new Set(previous);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }

  async function applyBatch(status: TaskStatus) {
    if (!selectedTasks.length || busy) return;
    setRunning(true);
    setReceipts([]);
    const nextReceipts: BatchReceipt[] = [];
    const succeeded = new Set<string>();
    // 顺序提交让回执与卡片一一对应；每条都由服务端独立校验权限和 revision。
    for (const task of selectedTasks) {
      try {
        await onBatchStatus(task, status);
        succeeded.add(task.id);
        nextReceipts.push({ taskId: task.id, title: task.title, ok: true });
      } catch (error) {
        nextReceipts.push({ taskId: task.id, title: task.title, ok: false, detail: error instanceof Error ? error.message : String(error) });
      }
    }
    setReceipts(nextReceipts);
    setSelected(previous => new Set([...previous].filter(id => !succeeded.has(id))));
    setRunning(false);
  }

  return (
    <>
      <div className="card week-view-controls">
        <SegToggle value={layout} onChange={onLayout} ariaLabel={t('week.view.layout')} options={[
          { value: 'grid', label: t('week.view.grid') },
          { value: 'list', label: t('week.view.list') },
        ]} />
        {layout === 'grid' && <div className="week-column-buttons" role="group" aria-label={t('team.columns')}>
          <span>{t('team.columns')}</span>
          {([2, 3, 4] as const).map(count => <button type="button" key={count} aria-pressed={columns === count} onClick={() => onColumns(count)}>{t(`team.columns.${count}`)}</button>)}
        </div>}
        <label className="week-view-control">{t('week.group.label')}<select aria-label={t('week.group.label')} value={grouping} onChange={event => setGrouping(event.target.value as TaskGrouping)}>
          <option value="none">{t('week.group.none')}</option>
          <option value="project">{t('week.group.project')}</option>
          <option value="group">{t('week.group.group')}</option>
          <option value="status">{t('week.group.status')}</option>
        </select></label>
        <label className="week-view-control">{t('week.sort.label')}<select aria-label={t('week.sort.label')} value={sort} onChange={event => setSort(event.target.value as TaskSort)}>
          <option value="updated">{t('week.sort.updated')}</option>
          <option value="title">{t('week.sort.title')}</option>
          <option value="status">{t('week.sort.status')}</option>
        </select></label>
      </div>

      {selectedTasks.length > 0 && <section className="card week-batch" aria-label={t('week.batch.title')}>
        <strong>{t('week.batch.selected').replace('{count}', String(selectedTasks.length))}</strong>
        <select aria-label={t('week.batch.status')} value={batchStatus} disabled={busy} onChange={event => setBatchStatus(event.target.value as TaskStatus)}>
          {(['pending', 'inProgress', 'blocked', 'done'] as const).map(status => <option key={status} value={status}>{t(STATUS_KEY[status])}</option>)}
        </select>
        <button type="button" className="btn" disabled={busy} onClick={() => void applyBatch(batchStatus)}>{t('week.batch.apply')}</button>
        <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => void applyBatch('shelved')}>{t('week.batch.shelve')}</button>
        <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => { setSelected(new Set()); setReceipts([]); }}>{t('common.cancel')}</button>
      </section>}

      {receipts.length > 0 && <section className="card week-batch-receipts" aria-live="polite" aria-label={t('week.batch.receipts')}>
        <strong>{t('week.batch.receipts')}</strong>
        <ul>{receipts.map(receipt => <li key={receipt.taskId} className={receipt.ok ? 'is-ok' : 'is-failed'}>
          {receipt.title} · {receipt.ok ? t('week.batch.succeeded') : `${t('week.batch.failed')}：${receipt.detail}`}
        </li>)}</ul>
      </section>}

      {!tasks.length ? <div className="card week-empty"><Inbox size={24} /><p>{t('team.empty')}</p></div> : organized.map(group => (
        <section className="week-task-group" key={group.key} aria-label={group.label || undefined}>
          {grouping !== 'none' && <h2>{group.label}<span>{group.tasks.length}</span></h2>}
          <div className={`task-grid${layout === 'list' ? ' task-grid--list' : ` task-grid--${columns}`}`}>
            {group.tasks.map(task => <WeekTaskCard key={task.id} task={task} groupName={groups.find(item => item.id === task.groupId)?.name ?? t('week.group.ungrouped')} members={members} node={nodes.find(n => n.id === task.id)} onOpen={() => onOpen(task.id)} selection={
              <input type="checkbox" className="week-task__select" checked={selected.has(task.id)} onChange={() => toggle(task.id)} aria-label={t('week.batch.selectTask').replace('{title}', task.title)} />
            }>
              {renderActions(task)}
            </WeekTaskCard>)}
          </div>
        </section>
      ))}
    </>
  );
}
