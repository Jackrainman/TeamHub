import { ReimburseTable } from './components/ReimburseTable';
import { formatAmountFen, type EntryDraft } from './reimburse-utils';
import { ReceiptText, Settings2, Plus, Upload } from 'lucide-react';
import { useCallback, useState } from 'react';
import { DEFAULT_REIMBURSE_PROFILE, deriveReimburseStatus, type ReimburseEntryStatus } from '@teamhub/hub-contracts';
import { EmptyState } from '../../shared/EmptyState';
import { useQueryGuard } from '../../shared/QueryGate';
import { SideDrawer } from '../../components/SideDrawer';
import {
  useReimburseBatches,
  useReimburseEntries,
  useReimburseImportController,
  useReimburseProfile,
  useReimburseStockInContext,
} from './hooks';
import type { ReimburseSegment } from './api';
import type { HubApiClient } from '../../api/client';
import type { PageIdentityCtx } from '../../console-pages';
import { useI18n } from '../../i18n';
import { ReimburseEntryForm } from './components/ReimburseEntryForm';
import { ReimburseEntryCard } from './components/ReimburseEntryCard';
import { ReimburseBatchSection } from './components/ReimburseBatchSection';
import { ReimburseImportZone } from './components/ReimburseImportZone';
import { ReimburseExportSection } from './components/ReimburseExportSection';
import { ReimburseProfileSection } from './components/ReimburseProfileSection';

/**
 * 报销页（REIMBURSE-PROC 阶段 3，计划 taskmaster-impulse-steel）：
 * 我的垫付条目（发票号/销售方/金额/派生状态徽标/材料 checklist/凭证留档）+ 手动录入表单 +
 * 超管批次区（批次列表/新建/三档流转/装批移出）。
 *
 * 红线落点：
 *  - 发票**解析**在浏览器本地（服务端不装解析依赖）；凭证原件按 D-094 走条目级受控通道，
 *    只在「本人→财务」这条读者链上可见，永不进列表/聚合——所以条目列表里没有凭证元数据；
 *  - GET entries 过滤在服务端（普通成员只见本人，超管见全部=财务视角），前端不做二次过滤；
 *  - 批次聚合只用服务端 summaries（count/总额/未齐计数），无按人明细、无排行（I0）。
 *
 * 身份模式未登录时显示登录引导（条目是个人财务事实，fail-closed）；
 * 匿名模式可读（server 匿名回全量，与「匿名可读一切」一致），批次区仍按超管旗标隐藏，
 * 凭证区同样隐藏（服务端凭证端点恒需认人，匿名没有可读的原件）。
 */
export function ReimbursePage({
  client,
  source,
  identity,
  projectId,
}: {
  client: ReimburseSegment & Pick<HubApiClient, 'getMembers'>;
  source: string;
  identity: PageIdentityCtx;
  projectId: string;
}) {
  const { t } = useI18n();
  const session = identity.session;
  const isSuperAdmin =
    identity.mode === 'identity' && session?.projectManager === true;
  const entriesEnabled = identity.mode !== 'identity' || session !== null;

  const entriesQuery = useReimburseEntries(client, source, entriesEnabled);
  const batchesQuery = useReimburseBatches(client, source, isSuperAdmin);
  const profileQuery = useReimburseProfile(client, source, entriesEnabled);
  // 窄上下文失败只隐藏入库区，不拖垮报销页本体。
  const stockInContextQuery = useReimburseStockInContext(client, source, entriesEnabled);
  // 管理员抽屉（批次 + 购买方校验标准）：默认收起，主页面只留「我的条目」动线。
  const [entryId, setEntryId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importPaused, setImportPaused] = useState(false);
  const [reviewDraft, setReviewDraft] = useState<{ jobId: number; draft: EntryDraft } | null>(null);
  const [filter, setFilter] = useState<ReimburseEntryStatus | 'all'>('all');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [adminOpen, setAdminOpen] = useState(false);

  // 发票本地解析、失败通知与待确认队列由本域 controller 统一编排。
  const importController = useReimburseImportController();
  const currentJobId = importController.currentJobId;
  const rememberReviewDraft = useCallback((draft: EntryDraft) => {
    if (currentJobId !== null) setReviewDraft({ jobId: currentJobId, draft });
  }, [currentJobId]);

  if (identity.isLoading) {
    return (
      <div className="state-band" role="status" aria-live="polite">
        {t('reimb.loading')}
      </div>
    );
  }

  if (identity.mode === 'identity' && !session) {
    return (
      <div className="reimb-page">
        <div className="state-band state-band--page" role="status">
          {t('reimb.needLogin')}
        </div>
      </div>
    );
  }

  const gate = useQueryGuard(entriesQuery, t('reimb.loading'), t('reimb.error'));
  if (gate.guard) return gate.guard;
  const profileGate = useQueryGuard(profileQuery, t('reimb.profile.loading'), t('reimb.profile.error'));
  if (profileGate.guard) return profileGate.guard;

  const entries = [...gate.data.entries].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
  // 凭证读者：匿名模式没有可认的人（服务端凭证端点恒需登录），故 null=整区隐藏、零请求。
  const myMemberId = identity.mode === 'identity' ? session?.memberId ?? null : null;
  const batches = batchesQuery.data?.batches ?? [];
  const profile = profileGate.data.profile;
  // 首次引导：校验标准仍是出厂默认（哈工大）→ 提醒管理员确认/修改；改任意一项后即消失。
  const profileUntouched =
    profile.expectedPurchaserName === DEFAULT_REIMBURSE_PROFILE.expectedPurchaserName &&
    profile.expectedPurchaserTaxNo === DEFAULT_REIMBURSE_PROFILE.expectedPurchaserTaxNo;

  const selectedEntry = entries.find(entry => entry.id === entryId);
  const selectedEntries = entries.filter(entry => selectedIds.includes(entry.id));
  const visible = entries.filter(entry => filter === 'all' || deriveReimburseStatus(entry) === filter);
  return (
    <div className="reimb-page">
      <div className="reimb-page__head">
        <p className="gaps-intro">{t('reimb.intro')}</p>
        <button className="btn btn--secondary" onClick={() => setImportOpen(true)} disabled={!identity.canWrite}><Upload size={16} />{t('expected.reimburseImport')}</button>
        <button className="btn btn--primary" onClick={() => importController.currentJobId !== null ? setImportPaused(false) : setCreateOpen(true)} disabled={!identity.canWrite}><Plus size={16} />{t('expected.reimburseNew')}</button>
        {isSuperAdmin ? (
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            onClick={() => setAdminOpen(true)}
          >
            <Settings2 size={14} aria-hidden="true" /> {t('reimb.admin.open')}
          </button>
        ) : null}
      </div>
      {isSuperAdmin && profileUntouched ? (
        <p className="reimb-admin-guide" role="note">
          {t('reimb.admin.guide')}
        </p>
      ) : null}

      <SideDrawer open={importOpen} onClose={() => setImportOpen(false)} title={t('expected.reimburseImport')}>
        <ReimburseImportZone onFiles={files => { setImportPaused(false); void importController.importFiles(files); setImportOpen(false); }} busy={importController.parsing} />
      </SideDrawer>
      {importController.fails.length > 0 ? (
        <ul className="reimb-import__notices">
          {importController.fails.map((fail) => (
            <li key={fail.id} className="form-hint form-hint--warn" role="alert">
              {t(`reimb.import.failed.${fail.reason}`, { file: fail.fileName })}
              <button
                type="button"
                className="btn btn--sm btn--ghost"
                onClick={() => importController.dismissFail(fail.id)}
              >
                {t('reimb.import.dismiss')}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {importController.pendingCount > 0 ? (
        <p className="form-hint" role="status">
          {t('reimb.import.queue', { count: importController.pendingCount })}
        </p>
      ) : null}

      {importPaused && importController.currentJobId !== null && <div className="domain-actions"><button className="btn btn--secondary btn--sm" onClick={() => setImportPaused(false)}>{t('expected.resumeImport')}</button></div>}
      <SideDrawer open={createOpen || (importController.currentJobId !== null && !importPaused)} onClose={() => { setCreateOpen(false); setImportPaused(true); }} title={t('expected.reimburseNew')}>
      <ReimburseEntryForm
        key={
          importController.currentJobId === null
            ? 'manual'
            : `import-${importController.currentJobId}`
        }
        client={client}
        source={source}
        projectId={projectId}
        canWrite={identity.canWrite}
        writeLockedHint={identity.canWrite ? null : t('identity.writeHint')}
        initial={importController.formInitial && reviewDraft?.jobId === currentJobId ? { ...importController.formInitial, draft: reviewDraft.draft } : importController.formInitial}
        onDraftChange={rememberReviewDraft}
        onDone={
          importController.currentJobId === null
            ? () => setCreateOpen(false)
            : importController.advance
        }
      />
      </SideDrawer>
      <div className="week-summary"><span><b>{entries.length}</b>{t('reimb.entries.title')}</span><span><b>{formatAmountFen(entries.reduce((sum, entry) => sum + (entry.totalAmountFen ?? 0), 0))}</b>{t('reimb.export.col.totalYuan')}</span></div>
      <div className="domain-actions"><div className="seg" role="group" aria-label={t('reimb.export.col.status')}>
        {(['all', 'draft', 'partial', 'complete'] as const).map(value => <button className={filter === value ? 'seg__btn seg__btn--active' : 'seg__btn'} key={value} aria-pressed={value === filter} onClick={() => setFilter(value)}>{t(value === 'all' ? 'expected.all' : 'reimb.status.' + value)}</button>)}
      </div><ReimburseExportSection client={client} source={source} entries={selectedEntries} batches={batches} profile={profile} compact /></div>
      <section aria-label={t('reimb.entries.title')}>
        <h2 className="inv-section-title">{t('reimb.entries.title')}</h2>
        {visible.length === 0 ? (
          <EmptyState
            icon={ReceiptText}
            title={t('reimb.entries.empty.title')}
            desc={t('reimb.entries.empty.desc')}
          />
        ) : (
          <ReimburseTable entries={visible} selected={selectedIds} onSelect={setSelectedIds} onOpen={setEntryId} />
        )}
      </section>

      <p className="expected-page-hint">{t('expected.reimbursePrivacy')}</p>
      <SideDrawer open={!!selectedEntry} onClose={() => setEntryId(null)} title={t('expected.reimburseOpen')}>
        {selectedEntry && <ReimburseEntryCard key={selectedEntry.id} client={client} source={source} entry={selectedEntry} batches={batches} isSuperAdmin={isSuperAdmin} canWrite={identity.canWrite} profile={profile} stockInContext={stockInContextQuery.data ?? null} canViewEvidence={myMemberId !== null} isOwner={selectedEntry.memberId === myMemberId} />}
      </SideDrawer>
      {isSuperAdmin ? (
        <SideDrawer
          open={adminOpen}
          onClose={() => setAdminOpen(false)}
          title={t('reimb.admin.open')}
        >
          <div className="reimb-admin-stack">
            <ReimburseExportSection
              client={client}
              source={source}
              entries={entries}
              batches={batches}
              profile={profile}
            />
            <ReimburseBatchSection
              client={client}
              source={source}
              projectId={projectId}
              batches={batches}
              entries={entries}
              profile={profile}
            />
            <ReimburseProfileSection client={client} source={source} profile={profile} />
          </div>
        </SideDrawer>
      ) : null}
    </div>
  );
}
