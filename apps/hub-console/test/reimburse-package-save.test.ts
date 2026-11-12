import { expect, test, vi } from 'vitest';
import { saveReimbursePackage, type PackageSaveState } from '../src/features/reimburse/lib/package-save';
import type { ReimburseSegment } from '../src/features/reimburse/api';
import { buildCreateEntryRequest, emptyEntryDraft } from '../src/features/reimburse/reimburse-utils';

test('a lost attachment response retries the same entry and same files', async () => {
  const create = vi.fn().mockResolvedValue({ entry: { id: 'one', revision: 1 } });
  const upload = vi.fn().mockRejectedValueOnce(new Error('lost response')).mockResolvedValue({ entry: { revision: 2 } });
  const client = { createReimburseEntry: create, uploadReimburseEvidence: upload } as unknown as ReimburseSegment;
  const state: PackageSaveState = { clientRequestId: crypto.randomUUID() };
  const request = buildCreateEntryRequest(emptyEntryDraft(), 'project')!;
  const attachments = [{ file: new File(['bytes'], 'one.jpg'), role: 'invoice' as const, included: true,
    path: 'one.jpg', invoice: null, invoiceType: 'unknown' as const }];
  await expect(saveReimbursePackage(client, request, attachments, state)).rejects.toThrow('lost response');
  expect(state.entryId).toBe('one');
  await saveReimbursePackage(client, request, attachments, state);
  expect(create).toHaveBeenCalledTimes(1);
  expect(upload).toHaveBeenCalledTimes(2);
});

test('unclassified attachments are retained as supporting material without blocking submission', async () => {
  const create = vi.fn().mockResolvedValue({ entry: { id: 'one', revision: 1 } });
  const upload = vi.fn().mockResolvedValue({ entry: { revision: 2 } });
  const client = { createReimburseEntry: create, uploadReimburseEvidence: upload } as unknown as ReimburseSegment;
  const request = buildCreateEntryRequest(emptyEntryDraft(), 'project')!;
  await saveReimbursePackage(client, request, [{ file: new File(['x'], 'one.jpg'),
    role: 'unknown', included: true, path: 'one.jpg', invoice: null, invoiceType: 'unknown' }],
  { clientRequestId: crypto.randomUUID() });
  expect(create).toHaveBeenCalledTimes(1);
  expect(upload.mock.calls[0].slice(0,2)).toEqual(['one', 'supporting']);
});

test('lost create response keeps the request fixed; a definitive rejection allows correction', async () => {
  const create = vi.fn().mockRejectedValueOnce(new Error('network lost')).mockRejectedValueOnce(new Error('409: duplicate'));
  const client = { createReimburseEntry: create } as unknown as ReimburseSegment;
  const state: PackageSaveState = { clientRequestId: crypto.randomUUID() };
  const request = buildCreateEntryRequest(emptyEntryDraft(), 'project')!;
  await expect(saveReimbursePackage(client, request, [], state)).rejects.toThrow();
  expect(state.request?.clientRequestId).toBe(state.clientRequestId);
  await expect(saveReimbursePackage(client, { ...request, totalAmountFen: 100 }, [], state)).rejects.toThrow();
  expect(create.mock.calls[1][0].totalAmountFen).toBeNull();
  expect(state.request).toBeUndefined();
});
