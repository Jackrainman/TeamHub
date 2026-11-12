import { ReceiptText, Settings2, Plus, Upload, WalletCards } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import {
  DEFAULT_REIMBURSE_PROFILE,
  deriveReimburseCompleteness,
  type ReimburseCompleteness,
  type ReimburseExpenseType,
  type ReimburseWorkflowStatus,
} from '@teamhub/hub-contracts';
import { ReimburseTable } from './components/ReimburseTable';
import { formatAmountFen, type EntryDraft } from './reimburse-utils';
import { EmptyState } from '../../shared/EmptyState';
import { useQueryGuard } from '../../shared/QueryGate';
import { SideDrawer } from '../../components/SideDrawer';
import { SegToggle } from '../../components/SegToggle';
import {
  useReimburseBatches,
  useReimburseEntries,
  useReimburseImportController,
  useReimbursePayouts,
  useReimburseProfile,
  useReimburseSeasons,
  useReimburseStockInContext,
} from './hooks';
import type { ReimburseSegment } from './api';
import type { HubApiClient } from '../../api/client';
import type { PageIdentityCtx } from '../../console-pages';
import { useI18n } from '../../i18n';
import { identityCacheKey } from '../../shared/lib/identity-utils';
import { ReimburseEntryForm } from './components/ReimburseEntryForm';
import { ReimburseEntryCard } from './components/ReimburseEntryCard';
import { ReimburseBatchSection } from './components/ReimburseBatchSection';
import { ReimburseImportZone } from './components/ReimburseImportZone';
import { ReimburseExportSection } from './components/ReimburseExportSection';
import { ReimburseProfileSection } from './components/ReimburseProfileSection';
import { ReimburseSupplementForm } from './components/ReimburseSupplementForm';
import { ReimburseUnmatchedPool } from './components/ReimburseUnmatchedPool';
import { ReimbursePayoutForm } from './components/ReimbursePayoutForm';
import { ReimburseStructuralSummary } from './components/ReimburseStructuralSummary';

export function ReimbursePage({ client, source, identity, projectId }: {
  client: ReimburseSegment & Pick<HubApiClient, 'getMembers' | 'getSeasons'>;
  source: string;
  identity: PageIdentityCtx;
  projectId: string;
}) {
  const { t } = useI18n();
  const session = identity.session;
  const isFinance = identity.mode === 'identity' && session?.projectManager === true;
  const enabled = identity.mode !== 'identity' || session !== null;
  const [view, setView] = useState<'mine' | 'finance'>('mine');
  const [seasonId, setSeasonId] = useState('unassigned');
  const seasonsQuery = useReimburseSeasons(client, source, enabled);
  useEffect(() => {
    if (seasonId === 'unassigned') {
      const active = seasonsQuery.data?.seasons.find((season) => season.status === 'active');
      if (active) setSeasonId(active.id);
    }
  }, [seasonId, seasonsQuery.data]);
  // 私人查询同时按身份、赛季分桶；条目证据 key 另含 entryId（D-094/D-099）。
  const cacheSource = `${source}:${identityCacheKey(session)}:${seasonId}`;
  const entriesQuery = useReimburseEntries(client, cacheSource, enabled, seasonId);
  const batchesQuery = useReimburseBatches(client, cacheSource, isFinance);
  const payoutsQuery = useReimbursePayouts(client, cacheSource, session !== null);
  const profileQuery = useReimburseProfile(client, cacheSource, enabled);
  const stockInContextQuery = useReimburseStockInContext(client, cacheSource, enabled);
  const [entryId, setEntryId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createPreset, setCreatePreset] = useState<ReimburseExpenseType | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importPaused, setImportPaused] = useState(false);
  const [reviewDraft, setReviewDraft] = useState<{ jobId: number; draft: EntryDraft } | null>(null);
  const [completeness, setCompleteness] = useState<ReimburseCompleteness | 'all'>('all');
  const [workflow, setWorkflow] = useState<ReimburseWorkflowStatus | 'all'>('all');
  const [expenseType, setExpenseType] = useState<ReimburseExpenseType | 'all'>('all');
  const [batchId, setBatchId] = useState('all');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [adminOpen, setAdminOpen] = useState(false);
  const [payoutOpen, setPayoutOpen] = useState(false);
  const [supplementIds, setSupplementIds] = useState<string[]>([]);
  const importController = useReimburseImportController(profileQuery.data?.profile);
  const currentJobId = importController.currentJobId;
  const rememberReviewDraft = useCallback((draft: EntryDraft) => {
    if (currentJobId !== null) setReviewDraft({ jobId: currentJobId, draft });
  }, [currentJobId]);

  if (identity.isLoading) return <div className="state-band" role="status">{t('reimb.loading')}</div>;
  if (identity.mode === 'identity' && !session) return <div className="reimb-page"><div className="state-band state-band--page">{t('reimb.needLogin')}</div></div>;
  const gate = useQueryGuard(entriesQuery, t('reimb.loading'), t('reimb.error'));
  if (gate.guard) return gate.guard;
  const profileGate = useQueryGuard(profileQuery, t('reimb.profile.loading'), t('reimb.profile.error'));
  if (profileGate.guard) return profileGate.guard;

  const allEntries = [...gate.data.entries].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const entries = allEntries.filter((entry) => seasonId === 'unassigned' || entry.seasonId === seasonId);
  const myMemberId = identity.mode === 'identity' ? session?.memberId ?? null : null;
  const batches = batchesQuery.data?.batches ?? [];
  const summaries = batchesQuery.data?.summaries ?? [];
  const profile = profileGate.data.profile;
  const profileUntouched = profile.expectedPurchaserName === DEFAULT_REIMBURSE_PROFILE.expectedPurchaserName && profile.expectedPurchaserTaxNo === DEFAULT_REIMBURSE_PROFILE.expectedPurchaserTaxNo;
  const selectedEntry = entries.find((entry) => entry.id === entryId);
  const selectedEntries = entries.filter((entry) => selectedIds.includes(entry.id));
  const canSupplement = identity.canWrite && selectedEntries.length > 0 && selectedEntries.every((entry) => entry.memberId === myMemberId && (entry.workflowStatus === 'draft' || entry.workflowStatus === 'returned'));
  const visible = entries.filter((entry) =>
    (completeness === 'all' || deriveReimburseCompleteness(entry) === completeness) &&
    (workflow === 'all' || entry.workflowStatus === workflow) &&
    (batchId === 'all' || entry.batchId === batchId) &&
    (expenseType === 'all' || entry.expenseType === expenseType));
  const selectedPayout = selectedEntry?.payoutId ? payoutsQuery.data?.payouts.find((payout) => payout.id === selectedEntry.payoutId) : null;
  const openCreate = (preset: ReimburseExpenseType | null = null) => { setCreatePreset(preset); setCreateOpen(true); };

  return <div className="reimb-page">
    <div className="reimb-page__head">
      <p className="gaps-intro">{t('reimb.intro')}</p>
      {isFinance && <SegToggle value={view} onChange={setView} ariaLabel={t('reimb.view.title')} options={[{ value: 'mine', label: t('reimb.view.mine') }, { value: 'finance', label: t('reimb.view.finance') }]} />}
      <button className="btn btn--secondary" onClick={() => setImportOpen(true)} disabled={!identity.canWrite}><Upload size={16} />{t('expected.reimburseImport')}</button>
      <button className="btn btn--primary" onClick={() => importController.currentJobId !== null ? setImportPaused(false) : openCreate()} disabled={!identity.canWrite}><Plus size={16} />{t('expected.reimburseNew')}</button>
      {isFinance && <button className="btn btn--secondary btn--sm" onClick={() => setAdminOpen(true)}><Settings2 size={14} />{t('reimb.admin.open')}</button>}
    </div>
    {view === 'mine' && <div className="domain-actions"><span className="reimb-preset-label">{t('reimb.quickPreset')}</span><button className="btn btn--sm btn--secondary" onClick={() => openCreate('taxi')}>{t('reimb.expenseType.taxi')}</button><button className="btn btn--sm btn--secondary" onClick={() => openCreate('ticket')}>{t('reimb.expenseType.ticket')}</button></div>}
    {isFinance && profileUntouched && <p className="reimb-admin-guide" role="note">{t('reimb.admin.guide')}</p>}

    <SideDrawer open={importOpen} onClose={() => setImportOpen(false)} title={t('expected.reimburseImport')}>
      <ReimburseImportZone onFiles={(files, useOcr) => { setImportPaused(false); void importController.importFiles(files, useOcr); setImportOpen(false); }} busy={importController.parsing} />
    </SideDrawer>
    {importController.parsing && <p role="status">{t('reimb.package.progress', importController.progress)} <button className="btn btn--sm btn--ghost" onClick={importController.cancel}>{t('reimb.package.cancel')}</button></p>}
    {importController.fails.length > 0 && <ul className="reimb-import__notices">{importController.fails.map((fail) => <li key={fail.id} className="form-hint form-hint--warn" role="alert">{t(`reimb.import.failed.${fail.reason}`, { file: fail.fileName })}<button className="btn btn--sm btn--ghost" onClick={() => importController.dismissFail(fail.id)}>{t('reimb.import.dismiss')}</button></li>)}</ul>}
    <ReimburseUnmatchedPool jobs={importController.jobs} currentId={currentJobId} onOpen={(id) => { importController.openJob(id); setImportPaused(false); }} onDefer={importController.defer} />
    {importPaused && currentJobId !== null && <div className="domain-actions"><button className="btn btn--secondary btn--sm" onClick={() => setImportPaused(false)}>{t('expected.resumeImport')}</button></div>}
    <SideDrawer open={createOpen || (currentJobId !== null && !importPaused)} onClose={() => { setCreateOpen(false); setImportPaused(true); }} title={t('expected.reimburseNew')}>
      <ReimburseEntryForm key={currentJobId === null ? `manual-${createPreset ?? 'blank'}` : `import-${currentJobId}`}
        client={client} source={cacheSource} projectId={projectId} seasonId={seasonId} profile={profile} canWrite={identity.canWrite}
        writeLockedHint={identity.canWrite ? null : t('identity.writeHint')} presetExpenseType={createPreset}
        initial={importController.formInitial && reviewDraft?.jobId === currentJobId ? { ...importController.formInitial, draft: reviewDraft.draft } : importController.formInitial}
        importTargets={importController.jobs.filter((job) => job.id !== currentJobId).map((job) => ({ id: job.id, label: job.fileName }))}
        onSplitAttachment={(path) => currentJobId !== null && importController.splitAttachment(currentJobId, path)}
        onMoveAttachment={(path, targetId) => currentJobId !== null && importController.moveAttachment(currentJobId, path, targetId)}
        onDraftChange={rememberReviewDraft} onDone={currentJobId === null ? () => { setCreateOpen(false); void entriesQuery.refetch(); } : () => { importController.advance(); void entriesQuery.refetch(); }} />
    </SideDrawer>

    <div className="week-summary"><span><b>{entries.length}</b>{t('reimb.entries.title')}</span><span><b>{formatAmountFen(entries.reduce((sum, entry) => sum + (entry.totalAmountFen ?? 0), 0))}</b>{t('reimb.export.col.totalYuan')}</span></div>
    <div className="reimb-filters">
      <select aria-label={t('reimb.season')} value={seasonId} onChange={(event) => { setSeasonId(event.target.value); setBatchId('all'); setSelectedIds([]); }}>
        {seasonId === 'unassigned' && <option value="unassigned">{t('reimb.season.unassigned')}</option>}
        {seasonsQuery.data?.seasons.map((season) => <option key={season.id} value={season.id}>{season.name}</option>)}
      </select>
      <select aria-label={t('reimb.export.col.status')} value={completeness} onChange={(event) => setCompleteness(event.target.value as typeof completeness)}><option value="all">{t('expected.all')}</option>{(['draft', 'partial', 'complete'] as const).map((value) => <option key={value} value={value}>{t(`reimb.status.${value}`)}</option>)}</select>
      <select aria-label={t('reimb.workflow.title')} value={workflow} onChange={(event) => setWorkflow(event.target.value as typeof workflow)}><option value="all">{t('expected.all')}</option>{(['draft', 'submitted', 'reviewing', 'returned', 'pendingPayment', 'completed', 'cancelled'] as const).map((value) => <option key={value} value={value}>{t(`reimb.workflow.status.${value}`)}</option>)}</select>
      <select aria-label={t('reimb.create.field.expenseType')} value={expenseType} onChange={(event) => setExpenseType(event.target.value as typeof expenseType)}><option value="all">{t('expected.all')}</option>{(['purchase', 'taxi', 'ticket', 'other'] as const).map((value) => <option key={value} value={value}>{t(`reimb.expenseType.${value}`)}</option>)}</select>
      {view === 'finance' && <select aria-label={t('reimb.entry.batch')} value={batchId} onChange={(event) => setBatchId(event.target.value)}><option value="all">{t('expected.all')}</option>{batches.filter((batch) => batch.seasonId === seasonId).map((batch) => <option key={batch.id} value={batch.id}>{batch.name}</option>)}</select>}
      <button className="btn btn--secondary btn--sm" disabled={!canSupplement} onClick={() => setSupplementIds(selectedEntries.map((entry) => entry.id))}>{t('reimb.supplement.open')}</button>
      <ReimburseExportSection client={client} source={cacheSource} entries={selectedEntries} batches={batches} profile={profile} compact />
      {view === 'finance' && <button className="btn btn--primary btn--sm" disabled={selectedEntries.length === 0} onClick={() => setPayoutOpen(true)}><WalletCards size={14} />{t('reimb.payout.open')}</button>}
    </div>
    {view === 'finance' && <ReimburseStructuralSummary client={client} source={cacheSource} query={{ ...(seasonId === 'unassigned' ? {} : { seasonId }), ...(batchId === 'all' ? {} : { batchId }) }} enabled={isFinance} />}
    <section aria-label={t('reimb.entries.title')}>
      {entries.some((entry) => entry.totalAmountFen === null) && <p className="form-hint">{t('reimb.package.unknownAmount', { count: entries.filter((entry) => entry.totalAmountFen === null).length })}</p>}
      <h2 className="inv-section-title">{t(view === 'finance' ? 'reimb.view.finance' : 'reimb.entries.title')}</h2>
      {visible.length === 0 ? <EmptyState icon={ReceiptText} title={t('reimb.entries.empty.title')} desc={t('reimb.entries.empty.desc')} /> :
        <ReimburseTable entries={visible} seasons={seasonsQuery.data?.seasons ?? []} selected={selectedIds} onSelect={setSelectedIds} onOpen={setEntryId} finance={view === 'finance'} />}
    </section>
    <p className="expected-page-hint">{t('expected.reimbursePrivacy')}</p>
    <SideDrawer open={supplementIds.length > 0} onClose={() => setSupplementIds([])} title={t('reimb.supplement.open')}>
      {supplementIds.length > 0 && <ReimburseSupplementForm client={client} source={cacheSource} entries={entries.filter((entry) => supplementIds.includes(entry.id) && entry.memberId === myMemberId)} />}
    </SideDrawer>
    <SideDrawer open={!!selectedEntry} onClose={() => setEntryId(null)} title={t('expected.reimburseOpen')}>
      {selectedEntry && <ReimburseEntryCard key={selectedEntry.id} client={client} source={cacheSource} entry={selectedEntry} batches={batches} isSuperAdmin={isFinance} canWrite={identity.canWrite} profile={profile} stockInContext={stockInContextQuery.data ?? null} canViewEvidence={myMemberId !== null} isOwner={selectedEntry.memberId === myMemberId} payout={selectedPayout} />}
    </SideDrawer>
    <SideDrawer open={payoutOpen} onClose={() => setPayoutOpen(false)} title={t('reimb.payout.open')}>
      <ReimbursePayoutForm client={client} source={cacheSource} entries={selectedEntries} onDone={() => { setPayoutOpen(false); setSelectedIds([]); }} />
    </SideDrawer>
    {isFinance && <SideDrawer open={adminOpen} onClose={() => setAdminOpen(false)} title={t('reimb.admin.open')}><div className="reimb-admin-stack">
      <ReimburseExportSection client={client} source={cacheSource} entries={entries} batches={batches} profile={profile} />
      <ReimburseBatchSection client={client} source={cacheSource} projectId={projectId} seasonId={seasonId} batches={batches.filter((batch) => batch.seasonId === seasonId)} summaries={summaries} />
      <ReimburseProfileSection client={client} source={cacheSource} profile={profile} />
    </div></SideDrawer>}
  </div>;
}
