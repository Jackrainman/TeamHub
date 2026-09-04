import { ReceiptText, Settings2 } from 'lucide-react';
import { useState } from 'react';
import { DEFAULT_REIMBURSE_PROFILE } from '@teamhub/hub-contracts';
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
import type { PageIdentityCtx } from '../../console-pages';
import { useI18n } from '../../i18n';
import { ReimburseEntryForm } from './components/ReimburseEntryForm';
import { ReimburseEntryCard } from './components/ReimburseEntryCard';
import { ReimburseBatchSection } from './components/ReimburseBatchSection';
import { ReimburseImportZone } from './components/ReimburseImportZone';
import { ReimburseProfileSection } from './components/ReimburseProfileSection';

/**
 * 报销页（REIMBURSE-PROC 阶段 3，计划 taskmaster-impulse-steel）：
 * 我的垫付条目（发票号/销售方/金额/派生状态徽标/材料 checklist）+ 手动录入表单 +
 * 超管批次区（批次列表/新建/三档流转/装批移出）。
 *
 * 红线落点：
 *  - 发票/截图/查验单**文件本体永不上传**——本页只有结构化字段与 checklist 布尔；
 *  - GET entries 过滤在服务端（普通成员只见本人，超管见全部=财务视角），前端不做二次过滤；
 *  - 批次聚合只用服务端 summaries（count/总额/未齐计数），无按人明细、无排行（I0）。
 *
 * 身份门（照 MyViewPage 先例）：身份模式未登录 → 登录引导（条目是个人财务事实，fail-closed）；
 * 匿名模式可读（server 匿名回全量，与「匿名可读一切」一致），批次区仍按超管旗标隐藏。
 */
export function ReimbursePage({
  client,
  source,
  identity,
  projectId,
}: {
  client: ReimburseSegment;
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
  const [adminOpen, setAdminOpen] = useState(false);

  // 发票本地解析、失败通知与待确认队列由本域 controller 统一编排。
  const importController = useReimburseImportController();

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
  const batches = batchesQuery.data?.batches ?? [];
  const profile = profileGate.data.profile;
  // 首次引导：校验标准仍是出厂默认（哈工大）→ 提醒管理员确认/修改；改任意一项后即消失。
  const profileUntouched =
    profile.expectedPurchaserName === DEFAULT_REIMBURSE_PROFILE.expectedPurchaserName &&
    profile.expectedPurchaserTaxNo === DEFAULT_REIMBURSE_PROFILE.expectedPurchaserTaxNo;

  return (
    <div className="reimb-page">
      <div className="reimb-page__head">
        <p className="gaps-intro">{t('reimb.intro')}</p>
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

      <ReimburseImportZone onFiles={importController.importFiles} busy={importController.parsing} />
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
        initial={importController.formInitial}
        onDone={
          importController.currentJobId === null
            ? undefined
            : importController.advance
        }
      />

      <section className="panel" aria-label={t('reimb.entries.title')}>
        <h2 className="inv-section-title">{t('reimb.entries.title')}</h2>
        {entries.length === 0 ? (
          <EmptyState
            icon={ReceiptText}
            title={t('reimb.entries.empty.title')}
            desc={t('reimb.entries.empty.desc')}
          />
        ) : (
          <div className="reimb-entries">
            {entries.map((entry) => (
              <ReimburseEntryCard
                key={entry.id}
                client={client}
                source={source}
                entry={entry}
                batches={batches}
                isSuperAdmin={isSuperAdmin}
                canWrite={identity.canWrite}
                profile={profile}
                stockInContext={stockInContextQuery.data ?? null}
              />
            ))}
          </div>
        )}
      </section>

      {isSuperAdmin ? (
        <SideDrawer
          open={adminOpen}
          onClose={() => setAdminOpen(false)}
          title={t('reimb.admin.open')}
        >
          <div className="reimb-admin-stack">
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
