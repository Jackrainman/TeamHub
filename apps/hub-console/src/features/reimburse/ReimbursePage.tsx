import { ReceiptText, Settings2, Plus, Upload, Download } from 'lucide-react';
import { useState } from 'react';
import {
  deriveReimburseCompleteness,
  type ReimburseCompleteness, type ReimburseExpenseType, type ReimburseImportJob,
  type ReimburseImportPair, type ReimburseWorkflowStatus, type ReimburseProfile,
} from '@teamhub/hub-contracts';
import { ReimburseTable } from './components/ReimburseTable';
import { formatAmountFen } from './reimburse-utils';
import { EmptyState } from '../../shared/EmptyState';
import { useQueryGuard } from '../../shared/QueryGate';
import { SideDrawer } from '../../components/SideDrawer';
import { SegToggle } from '../../components/SegToggle';
import {
  useCloseReimburseImport, useConfirmReimburseImport, useDeleteReimburseImportFile,
  useDismissReimburseImportPair, useReimburseBatches, useReimburseEntries, useReimburseImportJobs,
  useReimbursePayouts, useReimburseProfile, useReparseReimburseImport, useUploadReimburseImport,
  usePurgeReimburseImport,
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
import { ReimburseImportJobs } from './components/ReimburseImportJobs';
import { ReimburseExportSection } from './components/ReimburseExportSection';
import { ReimburseProfileSection } from './components/ReimburseProfileSection';
import { ReimbursePayoutForm } from './components/ReimbursePayoutForm';
import { draftFromParsedInvoice } from './reimburse-import';
import { candidatesForImportPair } from './reimburse-review-candidates';
import { ReimburseImportPreview } from './components/ReimburseImportPreview';
import { Field, Select } from '../../shared/ui';
import { ReimburseFinanceWorkspace } from './components/ReimburseFinanceWorkspace';
import { readFinanceLayout, writeFinanceLayout, type FinanceLayout } from './finance-layout';

function importFormInitial(job: ReimburseImportJob, pair: ReimburseImportPair, profile: ReimburseProfile) {
  const draft = pair.draft;
  const base = draftFromParsedInvoice({
    invoiceNo: draft.invoiceNo ?? '', invoiceType: draft.invoiceType ?? 'unknown', invoiceDate: draft.invoiceDate ?? null,
    seller: draft.seller ?? null, purchaserName: draft.purchaserName ?? null, purchaserTaxNo: draft.purchaserTaxNo ?? null,
    recognitionSource: draft.recognitionSource, totalAmountFen: draft.totalAmountFen, items: draft.items,
  }, profile);
  const firstFile = job.files.find(file => pair.fileIds.includes(file.id));
  return {
    draft: {
      ...base, kind: draft.kind, expenseType: draft.expenseType, summary: draft.summary ?? '',
      invoiceType: draft.invoiceType ?? 'unknown', actualItemName: draft.actualItemName ?? '', note: draft.note ?? '',
    },
    fileName: firstFile?.displayName ?? pair.id,
    notice: pair.status === 'matched' ? 'recognized' as const : 'unrecognized' as const,
  };
}

export function ReimbursePage({ client, source, identity }: {
  client: ReimburseSegment & Pick<HubApiClient, 'getMembers'>;
  source: string;
  identity: PageIdentityCtx;
}) {
  const { t } = useI18n();
  const session = identity.session;
  const isFinance = identity.mode === 'identity' && session?.projectManager === true;
  const enabled = identity.mode !== 'identity' || session !== null;
  const importsEnabled = identity.mode === 'identity' && session !== null;
  const [view, setView] = useState<'mine' | 'finance'>('mine');
  const cacheSource = `${source}:${identityCacheKey(session)}`;
  const [financeLayout, setFinanceLayout] = useState<FinanceLayout>(() => {
    try { return readFinanceLayout(window.localStorage); } catch { return 'b'; }
  });
  const changeFinanceLayout = (layout: FinanceLayout) => {
    setFinanceLayout(layout);
    try { writeFinanceLayout(window.localStorage, layout); } catch { /* 当前会话仍可使用新排版。 */ }
  };
  const entriesQuery = useReimburseEntries(client, cacheSource, enabled, view === 'finance' ? 'all' : 'mine');
  const batchesQuery = useReimburseBatches(client, cacheSource, isFinance);
  const payoutsQuery = useReimbursePayouts(client, cacheSource, session !== null);
  const profileQuery = useReimburseProfile(client, cacheSource, enabled);
  const importsQuery = useReimburseImportJobs(client, cacheSource, importsEnabled);
  const uploadImport = useUploadReimburseImport(client, cacheSource);
  const reparseImport = useReparseReimburseImport(client, cacheSource);
  const deleteImportFile = useDeleteReimburseImportFile(client, cacheSource);
  const dismissImportPair = useDismissReimburseImportPair(client, cacheSource);
  const closeImport = useCloseReimburseImport(client, cacheSource);
  const purgeImport = usePurgeReimburseImport(client, cacheSource);
  const [entryId, setEntryId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createPreset, setCreatePreset] = useState<ReimburseExpenseType | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [review, setReview] = useState<{ jobId: string; pairId: string } | null>(null);
  const [joinBatch, setJoinBatch] = useState(false);
  const [reviewBatchId, setReviewBatchId] = useState('all');
  const [completeness, setCompleteness] = useState<ReimburseCompleteness | 'all'>('all');
  const [workflow, setWorkflow] = useState<ReimburseWorkflowStatus | 'all'>('all');
  const [expenseType, setExpenseType] = useState<ReimburseExpenseType | 'all'>('all');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [adminOpen, setAdminOpen] = useState(false);
  const [payoutOpen, setPayoutOpen] = useState(false);
  const confirmImport = useConfirmReimburseImport(client, cacheSource, () => {
    setReview(null);
    void entriesQuery.refetch();
  });

  if (identity.isLoading) return <div className="state-band" role="status">{t('reimb.loading')}</div>;
  if (identity.mode === 'identity' && !session) return <div className="reimb-page"><div className="state-band state-band--page">{t('reimb.needLogin')}</div></div>;
  const gate = useQueryGuard(entriesQuery, t('reimb.loading'), t('reimb.error'));
  if (gate.guard) return gate.guard;
  const profileGate = useQueryGuard(profileQuery, t('reimb.profile.loading'), t('reimb.profile.error'));
  if (profileGate.guard) return profileGate.guard;

  const entries = [...gate.data.entries].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const jobs = importsQuery.data?.jobs ?? [];
  const myMemberId = identity.mode === 'identity' ? session?.memberId ?? null : null;
  const batches = batchesQuery.data?.batches ?? [];
  const summaries = batchesQuery.data?.summaries ?? [];
  const profile = profileGate.data.profile;
  const selectedEntry = entries.find(entry => entry.id === entryId);
  const selectedEntries = entries.filter(entry => selectedIds.includes(entry.id));
  const visible = entries.filter(entry =>
    (completeness === 'all' || deriveReimburseCompleteness(entry) === completeness)
    && (workflow === 'all' || entry.workflowStatus === workflow)
    && (expenseType === 'all' || entry.expenseType === expenseType));
  const selectedPayout = selectedEntry?.payoutId
    ? payoutsQuery.data?.payouts.find(payout => payout.id === selectedEntry.payoutId) : null;
  const openCreate = (preset: ReimburseExpenseType | null = null) => { setCreatePreset(preset); setImportOpen(false); setCreateOpen(true); };
  const reviewJob = review ? jobs.find(job => job.id === review.jobId) : undefined;
  const reviewPair = reviewJob?.pairs.find(pair => pair.id === review?.pairId);
  const openReview = (jobId: string, pairId: string) => {
    setReview({ jobId, pairId }); setJoinBatch(false); setReviewBatchId('all');
  };

  return <div className="reimb-page">
    <div className="reimb-page__title-row">
      <h1>报销</h1>
      {isFinance && <SegToggle value={view} onChange={setView} ariaLabel={t('reimb.view.title')} options={[{ value: 'mine', label: t('reimb.view.mine') }, { value: 'finance', label: t('reimb.view.finance') }]} />}
      <div className="reimb-page__profile">
        <span>{t('reimb.admin.current', { name: profile.expectedPurchaserName || t('reimb.admin.unset') })}</span>
        {isFinance && <button type="button" className="btn btn--secondary" onClick={() => setAdminOpen(true)}><Settings2 size={16} />{t('reimb.admin.open')}</button>}
      </div>
    </div>
    <div className="reimb-page__head"><p className="gaps-intro">{t('reimb.intro')}</p>
      <div className="reimb-page__actions">
        <button className="btn btn--secondary" onClick={() => setImportOpen(true)} disabled={!identity.canWrite || !importsEnabled}><Upload size={16} />{t('expected.reimburseImport')}</button>
        <button className="btn btn--primary" onClick={() => openCreate()} disabled={!identity.canWrite}><Plus size={16} />{t('reimb.create.title')}</button>
      </div>
    </div>

    <SideDrawer open={importOpen} onClose={() => setImportOpen(false)} title={t('expected.reimburseImport')} placement="center">
      <div className="reimb-import-modal">
        <ReimburseImportZone onFiles={files => uploadImport.mutate(files)} busy={uploadImport.isPending} />
        <p className="reimb-import-modal__note">上传后由服务器解析与 OCR；可直接关闭此弹窗，在下方「导入任务」继续处理。</p>
      </div>
    </SideDrawer>

    <ReimburseImportJobs jobs={jobs} canWrite={identity.canWrite && importsEnabled} finance={view === 'finance'}
      onReview={openReview} onOpenEntry={setEntryId} onReparse={jobId => reparseImport.mutate(jobId)}
      onDeleteFile={(jobId, fileId) => deleteImportFile.mutate({ id: jobId, fileId })}
      onDismiss={(jobId, pairId) => dismissImportPair.mutate({ id: jobId, pairId })}
      onClose={jobId => closeImport.mutate(jobId)} onPurge={jobId => purgeImport.mutate(jobId)} />

    <SideDrawer open={createOpen} onClose={() => setCreateOpen(false)} title={t('reimb.create.title')} placement="center">
      <div className="reimb-import-presets"><span>{t('reimb.quickPreset')}</span>
        {(['taxi', 'ticket', 'purchase'] as const).map(preset => <button key={preset} type="button" className="btn btn--secondary btn--sm" onClick={() => setCreatePreset(preset)}>{t(`reimb.expenseType.${preset}`)}</button>)}
      </div>
      <ReimburseEntryForm key={`manual-${createPreset ?? 'blank'}`} client={client} source={cacheSource} profile={profile} canWrite={identity.canWrite}
        writeLockedHint={identity.canWrite ? null : t('identity.writeHint')} presetExpenseType={createPreset}
        onDone={() => { setCreateOpen(false); void entriesQuery.refetch(); }} />
    </SideDrawer>

    <SideDrawer open={!!reviewPair && !!reviewJob} onClose={() => setReview(null)} title={reviewPair?.status === 'pending' ? '手动建单' : '核对并建单'} placement="center">
      {reviewPair && reviewJob && <div className="reimb-import-review">
        {reviewPair.reasons.includes('ocr-recognition') && <p className="form-hint form-hint--warn">字段来自 OCR，请逐项核对；无法可靠识别的发票号已留空。</p>}
        {isFinance && batches.length > 0 && <div className="reimb-import-review__batch">
          <label><input type="checkbox" checked={joinBatch} onChange={event => setJoinBatch(event.target.checked)} />确认后加入批次（默认不加入）</label>
          {joinBatch && <Field label="批次"><Select value={reviewBatchId} onChange={event => setReviewBatchId(event.target.value)}><option value="all">请选择批次</option>{batches.map(batch => <option key={batch.id} value={batch.id}>{batch.name}</option>)}</Select></Field>}
        </div>}
        <div className="reimb-import-review__content">
          <ReimburseImportPreview job={reviewJob} pair={reviewPair} contentUrl={client.reimburseImportFileContentUrl} />
          <ReimburseEntryForm key={reviewPair.id} client={client} source={cacheSource} profile={profile} canWrite={identity.canWrite}
            writeLockedHint={identity.canWrite ? null : t('identity.writeHint')} initial={importFormInitial(reviewJob, reviewPair, profile)}
            candidates={candidatesForImportPair(reviewJob, reviewPair)}
            submitLabel={reviewPair.status === 'pending' ? '手动建单' : '确认并建单'} requestPending={confirmImport.isPending}
            onSubmitRequest={(request, clientRequestId) => confirmImport.mutate({ id: reviewJob.id, request: { items: [{
              pairId: reviewPair.id, draft: request, clientRequestId,
              batchId: joinBatch && reviewBatchId !== 'all' ? reviewBatchId : null,
            }] } })} />
        </div>
      </div>}
    </SideDrawer>

    {view === 'finance' ? <ReimburseFinanceWorkspace
      layout={financeLayout} onLayoutChange={changeFinanceLayout}
      entries={entries} batches={batches} summaries={summaries}
      payouts={payoutsQuery.data?.payouts ?? []} client={client} source={cacheSource}
      selectedIds={selectedIds} onSelect={setSelectedIds} onOpen={setEntryId} onPayout={() => setPayoutOpen(true)} /> : <>
    <div className="week-summary"><span><b>{entries.length}</b>{t('reimb.entries.count')}</span><span><b>{formatAmountFen(entries.reduce((sum, entry) => sum + (entry.totalAmountFen ?? 0), 0))}</b>{t('reimb.export.col.totalYuan')}</span></div>
    <div className="reimb-filters">
      <Field label="状态"><Select aria-label="状态" value={completeness} onChange={event => setCompleteness(event.target.value as typeof completeness)}><option value="all">{t('expected.all')}</option>{(['draft', 'partial', 'complete'] as const).map(value => <option key={value} value={value}>{t(`reimb.status.${value}`)}</option>)}</Select></Field>
      <Field label="流程"><Select aria-label="流程" value={workflow} onChange={event => setWorkflow(event.target.value as typeof workflow)}><option value="all">{t('expected.all')}</option>{(['draft', 'submitted', 'reviewing', 'returned', 'pendingPayment', 'completed', 'cancelled'] as const).map(value => <option key={value} value={value}>{t(`reimb.workflow.status.${value}`)}</option>)}</Select></Field>
      <Field label="类型"><Select aria-label="类型" value={expenseType} onChange={event => setExpenseType(event.target.value as typeof expenseType)}><option value="all">{t('expected.all')}</option>{(['purchase', 'taxi', 'ticket', 'other'] as const).map(value => <option key={value} value={value}>{t(`reimb.expenseType.${value}`)}</option>)}</Select></Field>
      <div className="reimb-filters__actions">
        <details className="reimb-more">
          <summary className="btn btn--secondary btn--sm"><Download size={14} />{t('reimb.more')}</summary>
          <div className="reimb-more__menu">
            <ReimburseExportSection client={client} source={cacheSource} entries={selectedEntries} batches={batches} profile={profile} compact />
          </div>
        </details>
      </div>
    </div>
    <section aria-label={t('reimb.entries.title')}>
      {entries.some(entry => entry.totalAmountFen === null) && <p className="form-hint">{t('reimb.package.unknownAmount', { count: entries.filter(entry => entry.totalAmountFen === null).length })}</p>}
      <h2 className="inv-section-title">{t('reimb.entries.title')}</h2>
      {visible.length === 0 ? <EmptyState icon={ReceiptText} title={t('reimb.entries.empty.title')} desc={t('reimb.entries.empty.desc')} />
        : <ReimburseTable entries={visible} selected={selectedIds} onSelect={setSelectedIds} onOpen={setEntryId} finance={false} />}
    </section>
    </>}
    <p className="expected-page-hint">{t('expected.reimbursePrivacy')}</p>
    <SideDrawer open={!!selectedEntry} onClose={() => setEntryId(null)} title={t('expected.reimburseOpen')} placement="center" size="lg">
      {selectedEntry && <ReimburseEntryCard key={selectedEntry.id} client={client} source={cacheSource} entry={selectedEntry} batches={batches} isSuperAdmin={isFinance} canWrite={identity.canWrite} profile={profile} canViewEvidence={myMemberId !== null} isOwner={selectedEntry.memberId === myMemberId} payout={selectedPayout} evidenceDefaultOpen />}
    </SideDrawer>
    <SideDrawer open={payoutOpen} onClose={() => setPayoutOpen(false)} title={t('reimb.payout.open')}>
      <ReimbursePayoutForm client={client} source={cacheSource} entries={selectedEntries} onDone={() => { setPayoutOpen(false); setSelectedIds([]); }} />
    </SideDrawer>
    {isFinance && <SideDrawer open={adminOpen} onClose={() => setAdminOpen(false)} title={t('reimb.admin.open')} placement="center"><div className="reimb-admin-stack">
      <ReimburseExportSection client={client} source={cacheSource} entries={entries} batches={batches} profile={profile} />
      <ReimburseBatchSection client={client} source={cacheSource} batches={batches} summaries={summaries} />
      <ReimburseProfileSection client={client} source={cacheSource} profile={profile} />
    </div></SideDrawer>}
  </div>;
}
