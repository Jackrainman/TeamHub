import { useState } from 'react';
import { ArrowRight, CheckCircle2, CircleDollarSign, ClipboardCheck, Clock3, Inbox, Search, SlidersHorizontal } from 'lucide-react';
import type { ReimburseBatch, ReimburseBatchSummary, ReimburseEntry, ReimbursePayout, ReimburseWorkflowStatus } from '@teamhub/hub-contracts';
import { useI18n } from '../../../i18n';
import { SideDrawer } from '../../../components/SideDrawer';
import { SegToggle } from '../../../components/SegToggle';
import { Field, Select } from '../../../shared/ui';
import type { ReimburseSegment } from '../api';
import type { FinanceLayout } from '../finance-layout';
import { formatAmountFen } from '../reimburse-utils';
import { ReimburseStructuralSummary } from './ReimburseStructuralSummary';
import { ReimburseTable } from './ReimburseTable';

type SharedProps = {
  entries: ReimburseEntry[];
  batches: ReimburseBatch[];
  summaries: ReimburseBatchSummary[];
  selectedIds: string[];
  onSelect: (ids: string[]) => void;
  onOpen: (id: string) => void;
  onPayout: () => void;
};

type WorkspaceProps = SharedProps & {
  layout: FinanceLayout;
  onLayoutChange: (layout: FinanceLayout) => void;
  payouts: ReimbursePayout[];
  client: ReimburseSegment;
  source: string;
};

function entryTitle(entry: ReimburseEntry) {
  return entry.summary || entry.actualItemName || entry.items[0]?.name || entry.seller || entry.invoiceNo || entry.id;
}

function FinanceEntryList({ entries, selectedIds, onSelect, onOpen, selectable = false }: Omit<SharedProps, 'batches' | 'summaries' | 'onPayout'> & { selectable?: boolean }) {
  const { t } = useI18n();
  return <div className="finance-entry-list">{entries.map(entry => <article className="finance-entry-row" key={entry.id}>
    {selectable && <input type="checkbox" aria-label={t('expected.reimburseSelect', { title: entryTitle(entry) })}
      checked={selectedIds.includes(entry.id)} onChange={event => onSelect(event.target.checked ? [...selectedIds, entry.id] : selectedIds.filter(id => id !== entry.id))} />}
    <button type="button" className="finance-entry-row__main" onClick={() => onOpen(entry.id)}>
      <strong>{entryTitle(entry)}</strong><small>{entry.memberId} · {entry.invoiceDate ?? '—'}</small>
    </button>
    <span className="reimb-table-amount">{formatAmountFen(entry.totalAmountFen)}</span>
    <span className="badge badge--dense badge--outline">{t(`reimb.workflow.status.${entry.workflowStatus}`)}</span>
    <button type="button" className="icon-button" aria-label={t('expected.reimburseOpen')} onClick={() => onOpen(entry.id)}><ArrowRight size={16} /></button>
  </article>)}</div>;
}

function TodoLayout(props: SharedProps & { payouts: ReimbursePayout[]; client: ReimburseSegment; source: string }) {
  const { t } = useI18n();
  const { entries, payouts } = props;
  const groups: { title: string; hint: string; statuses: ReimburseWorkflowStatus[]; icon: typeof Inbox }[] = [
    { title: t('reimb.finance.todo.accept'), hint: t('reimb.finance.todo.acceptHint'), statuses: ['submitted'], icon: Inbox },
    { title: t('reimb.finance.todo.review'), hint: t('reimb.finance.todo.reviewHint'), statuses: ['reviewing'], icon: ClipboardCheck },
    { title: t('reimb.finance.todo.payout'), hint: t('reimb.finance.todo.payoutHint'), statuses: ['pendingPayment'], icon: CircleDollarSign },
  ];
  const month = new Date().toISOString().slice(0, 7);
  const paid = payouts.filter(payout => payout.paidAt.startsWith(month)).reduce((sum, payout) => sum + payout.amountFen, 0);
  const actionable = new Set(groups.flatMap(group => group.statuses));
  const history = entries.filter(entry => !actionable.has(entry.workflowStatus));
  const metrics = [
    { label: t('reimb.finance.metric.accept'), value: String(entries.filter(entry => entry.workflowStatus === 'submitted').length), note: t('reimb.finance.metric.entries'), tone: 'blue' },
    { label: t('reimb.finance.metric.review'), value: String(entries.filter(entry => entry.workflowStatus === 'reviewing').length), note: t('reimb.finance.metric.entries'), tone: 'amber' },
    { label: t('reimb.finance.metric.payout'), value: String(entries.filter(entry => entry.workflowStatus === 'pendingPayment').length), note: t('reimb.finance.metric.entries'), tone: 'green' },
    { label: t('reimb.finance.metric.paid'), value: formatAmountFen(paid), note: t('reimb.finance.metric.paidNote'), tone: 'neutral' },
  ];
  return <div className="finance-preview finance-todo" data-finance-layout="a">
    <header className="finance-preview__header"><div><span className="finance-preview__eyebrow">{t('reimb.finance.a.name')}</span><h2>{t('reimb.finance.a.title')}</h2><p>{t('reimb.finance.a.subtitle')}</p></div></header>
    <section className="finance-metrics" aria-label={t('reimb.finance.metrics')}>{metrics.map(metric => <article className={`card finance-metric finance-metric--${metric.tone}`} key={metric.label}>
      <span>{metric.label}</span><strong>{metric.value}</strong><small>{metric.note}</small>
    </article>)}</section>
    <div className="finance-todo__groups">{groups.map(group => {
      const rows = entries.filter(entry => group.statuses.includes(entry.workflowStatus));
      const Icon = group.icon;
      const payout = group.statuses[0] === 'pendingPayment';
      return <section className="card finance-todo-group" key={group.title}>
        <header><Icon size={20} /><div><h3>{group.title}<span>{rows.length}</span></h3><p>{group.hint}</p></div>
          {payout && <button className="btn btn--primary btn--sm" disabled={props.selectedIds.length === 0} onClick={props.onPayout}>{t('reimb.payout.open')}</button>}</header>
        {rows.length ? <FinanceEntryList {...props} entries={rows} selectable={payout} /> : <p className="finance-empty">{t('reimb.finance.groupClear')}</p>}
      </section>;
    })}</div>
    <details className="card finance-collapsible"><summary><Clock3 size={16} />{t('reimb.finance.history')}<span>{history.length}</span></summary><p>{t('reimb.finance.historyHint')}</p><FinanceEntryList {...props} entries={history} /></details>
    <details className="card finance-collapsible"><summary><CheckCircle2 size={16} />{t('reimb.finance.reconciliation')}</summary><ReimburseStructuralSummary client={props.client} source={props.source} query={{}} enabled /></details>
  </div>;
}

function BatchLayout(props: SharedProps & {
  client: ReimburseSegment;
  source: string;
  activeBatch: string;
  onActiveBatch: (id: string) => void;
}) {
  const { t } = useI18n();
  const { entries, batches, summaries, activeBatch } = props;
  const currentBatch = batches.find(batch => batch.id === activeBatch);
  const rows = entries.filter(entry => currentBatch ? entry.batchId === currentBatch.id : entry.batchId === null);
  const currentSummary = summaries.find(summary => summary.batchId === activeBatch);
  const selectBatch = (id: string) => { props.onActiveBatch(id); props.onSelect([]); };
  return <div className="finance-preview finance-batches" data-finance-layout="b">
    <header className="finance-preview__header"><div><span className="finance-preview__eyebrow">{t('reimb.finance.b.name')}</span><h2>{t('reimb.finance.b.title')}</h2><p>{t('reimb.finance.b.subtitle')}</p></div></header>
    <div className="finance-batch-workbench">
      <aside className="finance-batch-nav" aria-label={t('reimb.batch.title')}>
        <button className={activeBatch === 'unbatched' ? 'finance-batch-nav__item is-active' : 'finance-batch-nav__item'} onClick={() => selectBatch('unbatched')}>
          <strong>{t('reimb.finance.unbatched')}</strong><span>{entries.filter(entry => entry.batchId === null).length} {t('reimb.finance.metric.entries')}</span><small>{t('reimb.finance.unbatchedHint')}</small>
        </button>
        {batches.map(batch => {
          const summary = summaries.find(item => item.batchId === batch.id);
          const people = new Set(entries.filter(entry => entry.batchId === batch.id).map(entry => entry.memberId)).size;
          return <button key={batch.id} className={activeBatch === batch.id ? 'finance-batch-nav__item is-active' : 'finance-batch-nav__item'} onClick={() => selectBatch(batch.id)}>
            <strong>{batch.name}</strong><span>{formatAmountFen(summary?.totalAmountFen ?? 0)}</span><small>{summary?.count ?? 0} {t('reimb.finance.metric.entries')} · {people} {t('reimb.finance.people')} · {t(`reimb.batch.progress.${summary?.progress ?? 'empty'}`)}</small>
          </button>;
        })}
      </aside>
      <section className="finance-batch-detail">
        <header><div><span>{currentBatch ? t('reimb.finance.currentBatch') : t('reimb.finance.unbatched')}</span><h3>{currentBatch?.name ?? t('reimb.finance.looseTitle')}</h3></div><div className="finance-batch-detail__amount"><strong>{formatAmountFen(currentSummary?.totalAmountFen ?? rows.reduce((sum, entry) => sum + (entry.totalAmountFen ?? 0), 0))}</strong><button className="btn btn--primary btn--sm" disabled={props.selectedIds.length === 0} onClick={props.onPayout}>{t('reimb.payout.open')}</button></div></header>
        {rows.length ? <ReimburseTable entries={rows} selected={props.selectedIds} onSelect={props.onSelect} onOpen={props.onOpen} finance /> : <p className="finance-empty">{t('reimb.finance.batchEmpty')}</p>}
      </section>
    </div>
    {currentBatch && <ReimburseStructuralSummary client={props.client} source={props.source} query={{ batchId: currentBatch.id }} enabled />}
  </div>;
}

function FinanceFocusTable({ entries, batches, selectedIds, onSelect, onOpen }: SharedProps) {
  const { t } = useI18n();
  return <div className="card domain-table-wrap"><table className="domain-table reimb-table finance-focus-table"><thead><tr><th /><th>{t('reimb.create.field.summary')}</th><th>{t('reimb.finance.owner')}</th><th>{t('reimb.export.col.totalYuan')}</th><th>{t('reimb.workflow.title')}</th><th>{t('reimb.finance.age')}</th><th>{t('reimb.batch.title')}</th><th /></tr></thead>
    <tbody>{entries.map(entry => <tr key={entry.id}><td><input type="checkbox" aria-label={t('expected.reimburseSelect', { title: entryTitle(entry) })} checked={selectedIds.includes(entry.id)} onChange={event => onSelect(event.target.checked ? [...selectedIds, entry.id] : selectedIds.filter(id => id !== entry.id))} /></td>
      <td><strong>{entryTitle(entry)}</strong><small>{entry.invoiceDate ?? '—'}</small></td><td>{entry.memberId}</td><td className="reimb-table-amount">{formatAmountFen(entry.totalAmountFen)}</td><td><span className="badge badge--dense badge--outline">{t(`reimb.workflow.status.${entry.workflowStatus}`)}</span></td><td>{entryAge(entry.createdAt, t)}</td><td>{batches.find(batch => batch.id === entry.batchId)?.name ?? t('reimb.finance.unbatched')}</td><td><button className="btn btn--secondary btn--sm" onClick={() => onOpen(entry.id)}>{t('expected.reimburseOpen')}</button></td></tr>)}</tbody></table></div>;
}

function entryAge(createdAt: string, t: ReturnType<typeof useI18n>['t']) {
  const days = Math.max(0, Math.floor((Date.now() - Date.parse(createdAt)) / 86400000));
  return days === 0 ? t('reimb.finance.today') : t('reimb.finance.days', { count: days });
}

function TableLayout(props: SharedProps & {
  search: string;
  onSearch: (value: string) => void;
  filtersOpen: boolean;
  onFiltersOpen: (open: boolean) => void;
  workflow: string;
  onWorkflow: (value: string) => void;
  batchId: string;
  onBatchId: (value: string) => void;
}) {
  const { t } = useI18n();
  const { search, filtersOpen, workflow, batchId } = props;
  const query = search.trim().toLowerCase();
  const rows = props.entries.filter(entry => (!query || [entryTitle(entry), entry.memberId, entry.invoiceNo, entry.seller].some(value => value?.toLowerCase().includes(query)))
    && (workflow === 'all' || entry.workflowStatus === workflow) && (batchId === 'all' || (batchId === 'unbatched' ? entry.batchId === null : entry.batchId === batchId)));
  return <div className="finance-preview finance-table" data-finance-layout="c">
    <header className="finance-preview__header"><div><span className="finance-preview__eyebrow">{t('reimb.finance.c.name')}</span><h2>{t('reimb.finance.c.title')}</h2><p>{t('reimb.finance.c.subtitle')}</p></div><span className="finance-table__count">{rows.length} / {props.entries.length} {t('reimb.finance.metric.entries')}</span></header>
    <div className="finance-table-toolbar"><Search size={18} /><input aria-label={t('reimb.finance.search')} placeholder={t('reimb.finance.searchPlaceholder')} value={search} onChange={event => props.onSearch(event.target.value)} /><button className="btn btn--secondary" onClick={() => props.onFiltersOpen(true)}><SlidersHorizontal size={16} />{t('reimb.finance.advanced')}</button><button className="btn btn--primary" disabled={props.selectedIds.length === 0} onClick={props.onPayout}>{t('reimb.payout.open')}</button></div>
    <FinanceFocusTable {...props} entries={rows} />
    <SideDrawer open={filtersOpen} onClose={() => props.onFiltersOpen(false)} title={t('reimb.finance.advanced')}>
      <div className="reimb-admin-stack"><Field label={t('reimb.workflow.title')}><Select value={workflow} onChange={event => props.onWorkflow(event.target.value)}><option value="all">{t('expected.all')}</option>{(['draft', 'submitted', 'reviewing', 'returned', 'pendingPayment', 'completed', 'cancelled'] as const).map(value => <option value={value} key={value}>{t(`reimb.workflow.status.${value}`)}</option>)}</Select></Field>
        <Field label={t('reimb.batch.title')}><Select value={batchId} onChange={event => props.onBatchId(event.target.value)}><option value="all">{t('expected.all')}</option><option value="unbatched">{t('reimb.finance.unbatched')}</option>{props.batches.map(batch => <option value={batch.id} key={batch.id}>{batch.name}</option>)}</Select></Field>
        <button className="btn btn--primary" onClick={() => props.onFiltersOpen(false)}>{t('reimb.finance.applyFilters')}</button></div>
    </SideDrawer>
  </div>;
}

export function ReimburseFinanceWorkspace(props: WorkspaceProps) {
  const { t } = useI18n();
  // 各排版只负责呈现；筛选状态留在共享工作台，切换时不卸载重置。
  const [activeBatch, setActiveBatch] = useState('unbatched');
  const [search, setSearch] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [workflow, setWorkflow] = useState('all');
  const [batchId, setBatchId] = useState('all');
  const options: { value: FinanceLayout; label: string }[] = [
    { value: 'a', label: t('reimb.finance.layout.a') },
    { value: 'b', label: t('reimb.finance.layout.b') },
    { value: 'c', label: t('reimb.finance.layout.c') },
  ];
  const content = props.layout === 'a' ? <TodoLayout {...props} />
    : props.layout === 'b' ? <BatchLayout {...props} activeBatch={activeBatch} onActiveBatch={setActiveBatch} />
      : <TableLayout {...props} search={search} onSearch={setSearch}
        filtersOpen={filtersOpen} onFiltersOpen={setFiltersOpen}
        workflow={workflow} onWorkflow={setWorkflow} batchId={batchId} onBatchId={setBatchId} />;
  return <div className="finance-workspace">
    <div className="finance-layout-switcher">
      <span>{t('reimb.finance.layout.label')}</span>
      <SegToggle value={props.layout} onChange={props.onLayoutChange} ariaLabel={t('reimb.finance.layout.title')} options={options} />
    </div>
    {content}
  </div>;
}
