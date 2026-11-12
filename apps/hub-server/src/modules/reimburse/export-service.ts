import { strToU8, zipSync } from 'fflate';
import {
  deriveReimburseDeliveryRow,
  deriveReimburseStructuralSummary,
  type ReimburseBatch,
  type ReimburseEntry,
  type ReimburseExpenseType,
  type ReimbursePayout,
} from '@teamhub/hub-contracts';
import { buildXlsx, type XlsxCell } from '../../platform/export/xlsx.js';

const TYPE_LABEL: Record<ReimburseExpenseType, string> = {
  purchase: '采购', taxi: '打车', ticket: '车票', other: '其他',
};
const WORKFLOW_LABEL: Record<ReimburseEntry['workflowStatus'], string> = {
  draft: '草稿', submitted: '已提交', reviewing: '核对中', returned: '退回补充',
  pendingPayment: '待打款', completed: '完成', cancelled: '已撤销',
};
const COMPLETENESS_LABEL = { draft: '草稿', partial: '待补充', complete: '资料齐全' } as const;
const DETAIL_HEADERS = [
  '赛季', '批次', '支出类型', '提交人', '费用摘要', '商品明细', '实付金额', '核准金额', '打款金额',
  '工作流', '资料完整度', '缺项', '发票号码', '发票日期', '付款凭证路径', '打款日期', '流水号', '备注',
];
const MAX_PACKAGE_BYTES = 200 * 1024 * 1024;

export interface DeliveryManifest {
  entries: {
    entryId: string;
    missingMaterials: readonly string[];
    evidence: {
      evidenceId: string;
      role: string;
      originalName: string;
      sha256: string;
      path: string;
      status: 'archived' | 'failed';
      failure?: string;
    }[];
  }[];
}

export interface ReimburseDeliveryResult {
  content: Buffer;
  filename: string;
  contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' | 'application/zip';
  manifest: DeliveryManifest;
}

function safeName(value: string): string {
  return value.replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-').replace(/[. ]+$/g, '').slice(0, 80) || '未命名';
}

function money(value: number | null): number | null {
  return value === null ? null : value / 100;
}

function workbook(entries: readonly ReimburseEntry[], payouts: readonly ReimbursePayout[], batches: readonly ReimburseBatch[], manifest: DeliveryManifest, memberName: (id: string) => string): Uint8Array {
  const payoutByEntry = new Map<string, ReimbursePayout>();
  for (const payout of payouts) for (const id of payout.entryIds) payoutByEntry.set(id, payout);
  const batchName = new Map(batches.map((batch) => [batch.id, batch.name]));
  const details = entries.map((entry) => {
    const paths = manifest.entries.find((item) => item.entryId === entry.id)?.evidence
      .filter((item) => item.status === 'archived').map((item) => item.path) ?? [];
    const row = deriveReimburseDeliveryRow(entry, payoutByEntry.get(entry.id) ?? null, {
      resolveBatchName: (id) => batchName.get(id ?? '') ?? id ?? '',
      resolveMemberName: memberName,
      evidencePaths: paths,
    });
    return [
      row.seasonId, row.batch, row.expenseType ? TYPE_LABEL[row.expenseType] : '', row.member,
      row.summary, row.items, money(row.totalAmountFen), money(row.approvedAmountFen), money(row.paidAmountFen),
      WORKFLOW_LABEL[row.workflowStatus], COMPLETENESS_LABEL[row.completeness],
      row.missingMaterials.map((item) => item === 'invoice' ? '缺发票' : '缺付款材料').join('、'),
      row.invoiceNo, row.invoiceDate, row.evidencePaths.join('\n'), row.paidAt, row.transactionRef, row.note,
    ] satisfies XlsxCell[];
  });
  const summary = deriveReimburseStructuralSummary(entries, payouts);
  const summaryRows: XlsxCell[][] = [[
    '支出类型', '数量', '未知金额笔数', '申请金额', '核准金额', '打款金额',
  ]];
  for (const row of summary.types) {
    summaryRows.push([TYPE_LABEL[row.expenseType], row.count, row.unknownAmountCount,
      money(row.requestedAmountFen), money(row.approvedAmountFen), money(row.paidAmountFen)]);
  }
  return buildXlsx([
    { name: '报账明细', rows: [DETAIL_HEADERS, ...details] },
    { name: '类型汇总', rows: summaryRows },
  ]);
}

export async function buildReimburseDelivery(
  entries: readonly ReimburseEntry[],
  payouts: readonly ReimbursePayout[],
  batches: readonly ReimburseBatch[],
  includeEvidence: boolean,
  readEvidence: (entryId: string, evidenceId: string) => Promise<Buffer>,
  memberName: (id: string) => string = (id) => id,
): Promise<ReimburseDeliveryResult> {
  const manifest: DeliveryManifest = { entries: entries.map((entry) => ({
    entryId: entry.id,
    missingMaterials: [entry.materials.invoice ? null : 'invoice', entry.materials.paymentShot ? null : 'paymentShot'].filter((item): item is string => item !== null),
    evidence: [],
  })) };
  const files: Record<string, Uint8Array> = {};
  let totalBytes = 0;
  if (includeEvidence) {
    for (const entry of entries) {
      const target = manifest.entries.find((item) => item.entryId === entry.id)!;
      const directory = `凭证/${entry.id}-${safeName(entry.summary ?? entry.actualItemName ?? entry.seller ?? '条目')}`;
      for (const evidence of entry.evidence) {
        const path = `${directory}/${evidence.id}-${safeName(evidence.originalName)}`;
        try {
          const content = await readEvidence(entry.id, evidence.id);
          totalBytes += content.length;
          if (totalBytes > MAX_PACKAGE_BYTES) throw new Error('REIMBURSE_EXPORT_TOO_LARGE');
          files[path] = new Uint8Array(content);
          target.evidence.push({ evidenceId: evidence.id, role: evidence.kind, originalName: evidence.originalName, sha256: evidence.sha256, path, status: 'archived' });
        } catch (error) {
          const code = (error as { code?: string })?.code ?? (error instanceof Error ? error.message : 'READ_FAILED');
          if (code === 'REIMBURSE_EXPORT_TOO_LARGE') throw error;
          target.evidence.push({ evidenceId: evidence.id, role: evidence.kind, originalName: evidence.originalName, sha256: evidence.sha256, path, status: 'failed', failure: code });
        }
      }
    }
  }
  const xlsx = workbook(entries, payouts, batches, manifest, memberName);
  if (!includeEvidence) {
    return { content: Buffer.from(xlsx), filename: `${entries[0]?.seasonId ?? '报账'}-报账明细.xlsx`, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', manifest };
  }
  files['报账明细.xlsx'] = xlsx;
  files['manifest.json'] = strToU8(JSON.stringify(manifest, null, 2));
  return {
    content: Buffer.from(zipSync(files)),
    filename: `${entries[0]?.seasonId ?? '报账'}-报账交付.zip`,
    contentType: 'application/zip', manifest,
  };
}
