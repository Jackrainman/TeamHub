import {
  emptyReimburseImportCandidates,
  type ReimburseImportCandidates,
  type ReimburseImportJob,
  type ReimburseImportPair,
} from '@teamhub/hub-contracts';

/** 合并配对文件的真实解析候选；旧作业没有 candidates 时只回退到已经持久化的 parsed/amountFen。 */
export function candidatesForImportPair(job: ReimburseImportJob, pair: ReimburseImportPair): ReimburseImportCandidates {
  const result = emptyReimburseImportCandidates();
  const seen: Record<keyof ReimburseImportCandidates, Set<string | number>> = {
    seller: new Set(), purchaserName: new Set(), invoiceNo: new Set(), invoiceDate: new Set(), amounts: new Set(),
  };
  const add = (field: keyof ReimburseImportCandidates, value: string | number | null | undefined) => {
    if (value === null || value === undefined) return;
    const normalized = typeof value === 'string' ? value.trim() : value;
    if (normalized === '' || seen[field].has(normalized)) return;
    if (field === 'invoiceNo' && !/^\d{20}$/.test(String(normalized))) return;
    seen[field].add(normalized);
    (result[field] as Array<string | number>).push(normalized);
  };
  for (const file of job.files.filter(item => pair.fileIds.includes(item.id) && item.status !== 'removed')) {
    for (const field of ['seller', 'purchaserName', 'invoiceNo', 'invoiceDate'] as const) {
      add(field, file.parsed?.[field]);
      for (const value of file.candidates[field]) add(field, value);
    }
    add('amounts', file.parsed?.totalAmountFen);
    add('amounts', file.amountFen);
    for (const value of file.candidates.amounts) add('amounts', value);
  }
  return result;
}
