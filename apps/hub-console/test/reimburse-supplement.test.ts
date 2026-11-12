import { expect, test, vi } from 'vitest';
import { zipSync } from 'fflate';
import { prepareSupplement, uploadSupplement, type SupplementRow } from '../src/features/reimburse/lib/evidence-supplement';

test('ZIP supplemental files retain bytes and require explicit targets when several entries are selected', async () => {
  const bytes = new Uint8Array([1, 2, 3]);
  const zip = new File([zipSync({ 'folder/payment.jpg': bytes, 'itinerary.pdf': bytes, 'skip.exe': bytes })], 'materials.zip');
  const result = await prepareSupplement([zip], ['a', 'b']);
  expect(result.rows).toHaveLength(2);
  expect(result.rows.every(row => row.entryId === '')).toBe(true);
  expect(result.rows.map(row => row.kind)).toEqual(['paymentShot', 'supporting']);
  expect(new Uint8Array(await result.rows[0].file.arrayBuffer())).toEqual(bytes);
  expect(result.rejected).toEqual(['materials.zip / skip.exe']);
  expect((await prepareSupplement([new File([bytes], 'payment.jpg')], ['a'])).rows[0].entryId).toBe('a');
});

test('uploads stay with their chosen entries and retry only failed files', async () => {
  const rows: SupplementRow[] = ['a', 'b'].map(entryId => ({ id: entryId, entryId, kind: 'paymentShot',
    file: new File(['bytes'], entryId + '.jpg'), path: entryId + '.jpg', status: 'pending' }));
  const upload = vi.fn().mockResolvedValueOnce({ entry: { revision: 2 } }).mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ entry: { revision: 2 } });
  const first = await uploadSupplement({ uploadReimburseEvidence: upload }, rows, ['a', 'b']);
  expect(first.map(row => row.status)).toEqual(['done', 'failed']);
  const next = await uploadSupplement({ uploadReimburseEvidence: upload }, first, ['a', 'b']);
  expect(next.every(row => row.status === 'done')).toBe(true);
  expect(upload.mock.calls.map(call => call[0])).toEqual(['a', 'b', 'b']);
  await expect(uploadSupplement({ uploadReimburseEvidence: upload }, [{ ...rows[0], entryId: '' }], ['a'])).rejects.toThrow();
  expect(upload).toHaveBeenCalledTimes(3);
});
