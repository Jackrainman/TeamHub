import { INVOICE_ARCHIVE_LIMITS, type ReimburseEntry, type ReimburseEvidenceKind } from '@teamhub/hub-contracts';
import type { ReimburseSegment } from '../api';
import { evidenceRejectReasonFor } from '../reimburse-utils';
import { extractZipEntries } from './archive-extract';

export interface SupplementRow {
  id: string;
  file: File;
  path: string;
  entryId: string;
  kind: ReimburseEvidenceKind;
  status: 'pending' | 'done' | 'failed';
  error?: Error;
}

/** 补传只解包，不识别票面，也不创建新的报销。多个目标必须由用户逐份指定。 */
export async function prepareSupplement(files: File[], entryIds: string[]) {
  const rows: SupplementRow[] = [];
  const rejected: string[] = [];
  const failed: string[] = [];
  for (const file of files) {
    try {
      if (file.size > INVOICE_ARCHIVE_LIMITS.maxInputBytes) throw new Error('archive limit');
      const members = /\.zip$/i.test(file.name)
        ? [...(await extractZipEntries(new Uint8Array(await file.arrayBuffer()))).entries]
          .map(([path, bytes]) => ({ path: `${file.name} / ${path}`, file: new File([new Uint8Array(bytes)], path.split('/').pop()!) }))
        : [{ path: file.name, file }];
      for (const member of members) {
        if (evidenceRejectReasonFor(member.file)) { rejected.push(member.path); continue; }
        rows.push({ ...member, id: crypto.randomUUID(), entryId: entryIds.length === 1 ? entryIds[0] : '',
          kind: /\.(jpe?g|png)$/i.test(member.file.name) ? 'paymentShot' : 'supporting', status: 'pending' });
      }
    } catch { failed.push(file.name); }
  }
  return { rows, rejected, failed };
}

export async function uploadSupplement(
  client: Pick<ReimburseSegment, 'uploadReimburseEvidence'>, rows: SupplementRow[],
  targets: readonly (string | Pick<ReimburseEntry, 'id' | 'revision'>)[],
): Promise<SupplementRow[]> {
  const entryIds = targets.map((target) => typeof target === 'string' ? target : target.id);
  const revisions = new Map(targets.filter((target): target is Pick<ReimburseEntry, 'id' | 'revision'> => typeof target !== 'string').map((target) => [target.id, target.revision]));
  if (rows.some(row => row.status !== 'done' && !entryIds.includes(row.entryId))) throw new Error('REIMBURSE_SUPPLEMENT_TARGET_REQUIRED');
  const results: SupplementRow[] = [];
  for (const row of rows) {
    if (row.status === 'done') { results.push(row); continue; }
    try {
      const uploaded = await client.uploadReimburseEvidence(row.entryId, row.kind, row.file, revisions.get(row.entryId) ?? 1);
      revisions.set(row.entryId, uploaded.entry.revision);
      results.push({ ...row, status: 'done', error: undefined });
    } catch (error) { results.push({ ...row, status: 'failed', error: error instanceof Error ? error : undefined }); }
  }
  return results;
}
