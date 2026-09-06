import { useState } from 'react';
import { Download } from 'lucide-react';
import {
  buildReimburseCsv,
  deriveReimburseExportRow,
  type ReimburseBatch,
  type ReimburseEntry,
  type ReimburseProfile,
} from '@teamhub/hub-contracts';
import type { HubApiClient } from '../../../api/client';
import { useMembers } from '../../identity/hooks';
import { useI18n } from '../../../i18n';
import {
  localizeReimburseExportRow,
  reimburseExportHeaders,
  suggestReimburseExportFilename,
} from '../reimburse-export';

/**
 * 全员发票导出（REIMBURSE-PM-EXPORT，只出现在报销管理抽屉 = 超管视角）：
 * 把当前全部可见条目（server 对超管回全量）逐条 deriveReimburseExportRow → 本地化 →
 * buildReimburseCsv → Blob 触发下载。名册/批次名走 resolveMemberName/resolveBatchName
 * 映射（缺省回退 memberId/batchId）。导出是条目清单（事实卡片列表），不是聚合/统计，
 * 且仅超管触发——符合 D-094「条目人键只回本人+超管」红线；不碰凭证附件通道。
 */
export function ReimburseExportSection({
  client,
  source,
  entries,
  batches,
  profile,
}: {
  client: Pick<HubApiClient, 'getMembers'>;
  source: string;
  entries: ReimburseEntry[];
  batches: ReimburseBatch[];
  profile: ReimburseProfile;
}) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const membersQuery = useMembers(client, `reimburse-export-${source}`);
  const memberName = (id: string) =>
    membersQuery.data?.members.find((m) => m.id === id)?.displayName ?? id;
  const batchName = (id: string | null) =>
    batches.find((b) => b.id === id)?.name ?? (id ?? '');

  function download() {
    if (entries.length === 0) return;
    setBusy(true);
    try {
      const rows = entries
        .map((entry) =>
          deriveReimburseExportRow(entry, profile, {
            resolveMemberName: memberName,
            resolveBatchName: batchName,
          }),
        )
        .map((row) => localizeReimburseExportRow(row, t));
      const csv = buildReimburseCsv(reimburseExportHeaders(t), rows);
      // 浏览器侧 Blob 下载（照设置页 reporting 导出先例的下载语义）；CSV 带 BOM，Excel 直接打开中文不乱码。
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = suggestReimburseExportFilename(new Date(), t);
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel" aria-label={t('reimb.export.title')}>
      <header className="pm-create__head">
        <div>
          <h3>{t('reimb.export.title')}</h3>
          <p className="pm-create__note">{t('reimb.export.hint')}</p>
        </div>
      </header>
      <button
        type="button"
        className="btn btn--secondary btn--sm"
        disabled={busy || entries.length === 0}
        onClick={download}
      >
        <Download size={14} aria-hidden="true" />{' '}
        {entries.length === 0 ? t('reimb.export.empty') : t('reimb.export.button')}
      </button>
    </section>
  );
}
