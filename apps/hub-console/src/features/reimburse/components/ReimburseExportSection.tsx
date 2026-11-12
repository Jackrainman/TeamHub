import { useState } from 'react';
import { Download, FileSpreadsheet, Package } from 'lucide-react';
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
import type { ReimburseSegment } from '../api';
import { useExportReimburse } from '../hooks';

function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/** CSV 保留轻量副本；XLSX 与原件 ZIP 由服务端按当前身份和请求 ID 求交集后生成。 */
export function ReimburseExportSection({ client, source, entries, batches, profile, compact = false }: {
  client: ReimburseSegment & Pick<HubApiClient, 'getMembers'>;
  source: string;
  entries: ReimburseEntry[];
  batches: ReimburseBatch[];
  profile: ReimburseProfile;
  compact?: boolean;
}) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const exportMutation = useExportReimburse(client, source);
  const membersQuery = useMembers(client, `reimburse-export-${source}`);
  const memberName = (id: string) => membersQuery.data?.members.find((m) => m.id === id)?.displayName ?? id;
  const batchName = (id: string | null) => batches.find((b) => b.id === id)?.name ?? (id ?? '');
  const disabled = busy || exportMutation.isPending || entries.length === 0;

  function downloadCsv() {
    if (entries.length === 0) return;
    setBusy(true);
    try {
      const rows = entries.map((entry) => deriveReimburseExportRow(entry, profile, { resolveMemberName: memberName, resolveBatchName: batchName }))
        .map((row) => localizeReimburseExportRow(row, t));
      const csv = buildReimburseCsv(reimburseExportHeaders(t), rows);
      saveBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }),
        suggestReimburseExportFilename(new Date(), key => t(compact && key === 'reimb.export.fileBase' ? 'expected.exportFileBase' : key)));
    } finally { setBusy(false); }
  }
  function downloadServer(includeEvidence: boolean) {
    exportMutation.mutate({ entryIds: entries.map((entry) => entry.id), includeEvidence }, {
      onSuccess: ({ blob, filename }) => saveBlob(blob, filename),
    });
  }

  if (compact) return <div className="domain-actions">
    <button type="button" className="btn btn--secondary" disabled={disabled} onClick={downloadCsv}><Download size={14} />{t('expected.exportSelected', { count: entries.length })}</button>
    <button type="button" className="btn btn--secondary" disabled={disabled} onClick={() => downloadServer(false)}><FileSpreadsheet size={14} />{t('reimb.export.xlsx')}</button>
    <button type="button" className="btn btn--secondary" disabled={disabled} onClick={() => downloadServer(true)}><Package size={14} />{t('reimb.export.zip')}</button>
  </div>;
  return <section className="panel" aria-label={t('reimb.export.title')}>
    <header className="pm-create__head"><div><h3>{t('reimb.export.title')}</h3><p className="pm-create__note">{t('reimb.export.serverHint')}</p></div></header>
    <div className="domain-actions">
      <button type="button" className="btn btn--secondary btn--sm" disabled={disabled} onClick={downloadCsv}><Download size={14} />{entries.length === 0 ? t('reimb.export.empty') : t('reimb.export.button')}</button>
      <button type="button" className="btn btn--secondary btn--sm" disabled={disabled} onClick={() => downloadServer(false)}><FileSpreadsheet size={14} />{t('reimb.export.xlsx')}</button>
      <button type="button" className="btn btn--secondary btn--sm" disabled={disabled} onClick={() => downloadServer(true)}><Package size={14} />{t('reimb.export.zip')}</button>
    </div>
  </section>;
}
