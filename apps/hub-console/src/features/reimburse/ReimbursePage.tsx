import { useRef, useState } from 'react';
import { ReceiptText } from 'lucide-react';
import { EmptyState } from '../../shared/EmptyState';
import { useQueryGuard } from '../../shared/QueryGate';
import { useReimburseBatches, useReimburseEntries } from '../../hooks/useReimburse';
import { useInventory } from '../../hooks/useInventory';
import type { HubApiClient } from '../../api/client';
import type { PageIdentityCtx } from '../../console-pages';
import { useI18n } from '../../i18n';
import { ReimburseEntryForm, type ReimburseFormInitial } from './sub/ReimburseEntryForm';
import { ReimburseEntryCard } from './sub/ReimburseEntryCard';
import { ReimburseBatchSection } from './sub/ReimburseBatchSection';
import { ReimburseImportZone } from './sub/ReimburseImportZone';
import {
  analyzeInvoiceFile,
  draftFromParsedInvoice,
  type ImportOutcome,
} from './reimburse-import';
import { emptyEntryDraft } from './reimburse-utils';

const DEFAULT_PROJECT_ID = 'prj-robots';

/** 待确认的导入队列项（parsed=预填 / unrecognized=开空表单手填），id 供表单 key 重挂。 */
interface ImportJob {
  id: number;
  outcome: ImportOutcome & { kind: 'parsed' | 'unrecognized' };
}

/** 读失败/非发票文件的显式报错（不静默），逐条可关。 */
interface ImportFail {
  id: number;
  fileName: string;
  reason: 'type' | 'read';
}

/**
 * 报账页（REIMBURSE-PROC 阶段 3，计划 taskmaster-impulse-steel）：
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
}: {
  client: HubApiClient;
  source: string;
  identity: PageIdentityCtx;
}) {
  const { t } = useI18n();
  const session = identity.session;
  const isSuperAdmin =
    identity.mode === 'identity' && session?.projectManager === true;
  const entriesEnabled = identity.mode !== 'identity' || session !== null;

  const entriesQuery = useReimburseEntries(client, source, entriesEnabled);
  const batchesQuery = useReimburseBatches(client, source, isSuperAdmin);
  // 入库确认（阶段 5）：条目卡片的「已入 X/Y」与匹配候选都从库存快照派生。
  // 不加硬 gate——库存查询失败只藏入库区，不拖垮报账页本体。
  const inventoryQuery = useInventory(client, source);

  // 发票导入（阶段 4）：队列逐张预填逐张确认（提交/跳过 → advance）；failed 直接报错不入队。
  // hooks 须在下方早退 return 之前——状态无条件声明。
  const [importJobs, setImportJobs] = useState<ImportJob[]>([]);
  const [importFails, setImportFails] = useState<ImportFail[]>([]);
  const [parsing, setParsing] = useState(false);
  const importSeq = useRef(0);

  async function handleImportFiles(files: File[]) {
    setParsing(true);
    try {
      // 逐文件顺序处理：队列顺序 = 用户选择的顺序，且 pdf.js 逐张解析不抢主线程。
      for (const file of files) {
        const outcome = await analyzeInvoiceFile(file);
        importSeq.current += 1;
        const id = importSeq.current;
        if (outcome.kind === 'failed') {
          setImportFails((prev) => [...prev, { id, fileName: outcome.fileName, reason: outcome.reason }]);
        } else {
          setImportJobs((prev) => [...prev, { id, outcome }]);
        }
      }
    } finally {
      setParsing(false);
    }
  }

  function advanceImportQueue() {
    setImportJobs((prev) => prev.slice(1));
  }

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

  const entries = [...gate.data.entries].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
  const batches = batchesQuery.data?.batches ?? [];
  const summaries = batchesQuery.data?.summaries ?? [];

  const currentJob = importJobs[0] ?? null;
  const formInitial: ReimburseFormInitial | null = currentJob
    ? currentJob.outcome.kind === 'parsed'
      ? {
          draft: draftFromParsedInvoice(currentJob.outcome.invoice),
          fileName: currentJob.outcome.fileName,
          notice: 'recognized',
        }
      : {
          draft: emptyEntryDraft(),
          fileName: currentJob.outcome.fileName,
          notice: 'unrecognized',
        }
    : null;

  return (
    <div className="reimb-page">
      <p className="gaps-intro">{t('reimb.intro')}</p>

      <ReimburseImportZone onFiles={handleImportFiles} busy={parsing} />
      {importFails.length > 0 ? (
        <ul className="reimb-import__notices">
          {importFails.map((fail) => (
            <li key={fail.id} className="form-hint form-hint--warn" role="alert">
              {t(
                fail.reason === 'type'
                  ? 'reimb.import.failed.type'
                  : 'reimb.import.failed.read',
                { file: fail.fileName },
              )}
              <button
                type="button"
                className="btn btn--sm btn--ghost"
                onClick={() =>
                  setImportFails((prev) => prev.filter((f) => f.id !== fail.id))
                }
              >
                {t('reimb.import.dismiss')}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {importJobs.length > 1 ? (
        <p className="form-hint" role="status">
          {t('reimb.import.queue', { count: importJobs.length - 1 })}
        </p>
      ) : null}

      <ReimburseEntryForm
        key={currentJob ? `import-${currentJob.id}` : 'manual'}
        client={client}
        source={source}
        defaultProjectId={DEFAULT_PROJECT_ID}
        canWrite={identity.canWrite}
        writeLockedHint={identity.canWrite ? null : t('identity.writeHint')}
        initial={formInitial}
        onDone={currentJob ? advanceImportQueue : undefined}
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
                inventory={inventoryQuery.data ?? null}
              />
            ))}
          </div>
        )}
      </section>

      {isSuperAdmin ? (
        <ReimburseBatchSection
          client={client}
          source={source}
          defaultProjectId={DEFAULT_PROJECT_ID}
          batches={batches}
          summaries={summaries}
        />
      ) : null}
    </div>
  );
}
