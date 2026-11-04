import { derivePackageReview, DEFAULT_REIMBURSE_PROFILE, type CreateReimburseEntryRequest } from '@teamhub/hub-contracts';
import type { ReimburseSegment } from '../api';
import type { PackageAttachment } from './package-import';

export interface PackageSaveState {
  clientRequestId: string;
  entryId?: string;
  request?: CreateReimburseEntryRequest;
  completed?: number;
}

/** 保存尝试固定请求内容；响应丢失时沿用原请求 ID，附件重试由服务端按内容去重。 */
export async function saveReimbursePackage(
  client: ReimburseSegment, request: CreateReimburseEntryRequest,
  attachments: PackageAttachment[], state: PackageSaveState,
): Promise<void> {
  const included = attachments.filter(a => a.included);
  const review = derivePackageReview(included, DEFAULT_REIMBURSE_PROFILE);
  if (included.length > 12 || included.some(a => a.role === 'unknown') ||
    review.reviewReasons.some(reason => reason === 'multiple-invoices' || reason === 'ambiguous-invoices')) {
    throw new Error('REIMBURSE_PACKAGE_REVIEW_REQUIRED');
  }
  state.request ??= { ...request, clientRequestId: state.clientRequestId };
  if (!state.entryId) {
    try { state.entryId = (await client.createReimburseEntry(state.request)).entry.id; }
    catch (error) {
      // 明确拒绝的请求没有落库，允许修正；网络中断仍固定原请求以便幂等重试。
      if (error instanceof Error && /^(?:Hub API )?4\d\d:/.test(error.message)) state.request = undefined;
      throw error;
    }
  }
  for (let i = state.completed ?? 0; i < included.length; i++) {
    const attachment = included[i];
    if (attachment.role === 'unknown') throw new Error('REIMBURSE_PACKAGE_REVIEW_REQUIRED');
    await client.uploadReimburseEvidence(state.entryId, attachment.role, attachment.file);
    state.completed = i + 1;
  }
  // 留档不代替本人确认材料已备或已查验，材料勾选仍由条目详情单独完成。
}
