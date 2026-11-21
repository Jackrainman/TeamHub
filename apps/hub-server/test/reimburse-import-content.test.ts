import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ReimburseImportJobSchema, type ReimburseImportFile } from '@teamhub/hub-contracts';
import { createTestHub, login, memberId, TEST_PASSWORDS } from './support/build-test-hub-server.js';

function storedFile(id: string, originalName: string, ext: string, status: ReimburseImportFile['status'] = 'parsed'): ReimburseImportFile {
  return {
    id, originalName, displayName: originalName, ext, sizeBytes: 4,
    sha256: `${id}-sha256`, role: 'invoice', status, amountFen: null,
    confidence: null, parsed: null,
    candidates: { seller: [], purchaserName: [], invoiceNo: [], invoiceDate: [], amounts: [] },
    error: null, removedAt: status === 'removed' ? '2026-11-20T00:00:00.000Z' : null,
  };
}

function seedJob(hub: ReturnType<typeof createTestHub>) {
  const id = 'reimp-content-test';
  const files = [
    storedFile('reif-invoice-pdf', 'invoice.pdf', '.pdf'),
    storedFile('reif-payment-png', 'payment.png', '.png'),
    storedFile('reif-payment-jpeg', 'payment.jpeg', '.jpeg'),
    storedFile('reif-removed', 'removed.pdf', '.pdf', 'removed'),
  ];
  const job = ReimburseImportJobSchema.parse({
    id, memberId: memberId(hub, 'owner'), status: 'ready',
    createdAt: '2026-11-20T00:00:00.000Z', updatedAt: '2026-11-20T00:00:00.000Z',
    files, pairs: [], confirmedEntryIds: [], history: [], error: null,
  });
  hub.database.db.insertRow('reimburse_import_jobs', id, job);
  const directory = path.join(hub.root, 'imports', id);
  fs.mkdirSync(directory, { recursive: true });
  for (const file of files) fs.writeFileSync(path.join(directory, `${file.id}${file.ext}`), Buffer.from([0, 1, 2, 255]));
  return { id, files, job };
}

describe('reimburse import original content', () => {
  it('serves original PDF/PNG/JPEG bytes inline with the correct Content-Type', async () => {
    const hub = createTestHub();
    try {
      const { id, files } = seedJob(hub);
      const cookie = await login(hub.app, 'owner', TEST_PASSWORDS.owner);
      const expected = new Map([
        ['reif-invoice-pdf', 'application/pdf'],
        ['reif-payment-png', 'image/png'],
        ['reif-payment-jpeg', 'image/jpeg'],
      ]);
      for (const [fileId, contentType] of expected) {
        const response = await hub.app.inject({ method: 'GET', url: `/api/reimburse/imports/${id}/files/${fileId}/content`, headers: { cookie } });
        expect(response.statusCode, response.body).toBe(200);
        expect(response.headers['content-type']).toBe(contentType);
        expect(response.headers['content-disposition']).toBe('inline');
        expect(response.rawPayload).toEqual(Buffer.from([0, 1, 2, 255]));
      }
      const after = hub.database.db.getRow<any>('reimburse_import_jobs', id);
      expect(after.history).toEqual([]);
      expect(after.updatedAt).toBe('2026-11-20T00:00:00.000Z');
      expect(files).toHaveLength(4);
    } finally { await hub.close(); }
  });

  it('returns 404 for unknown, cross-job and removed files', async () => {
    const hub = createTestHub();
    try {
      const { id } = seedJob(hub);
      const cookie = await login(hub.app, 'owner', TEST_PASSWORDS.owner);
      for (const url of [
        `/api/reimburse/imports/${id}/files/reif-not-in-job/content`,
        `/api/reimburse/imports/reimp-other-job/files/reif-invoice-pdf/content`,
        `/api/reimburse/imports/${id}/files/reif-removed/content`,
      ]) {
        const response = await hub.app.inject({ method: 'GET', url, headers: { cookie } });
        expect(response.statusCode, response.body).toBe(404);
      }
    } finally { await hub.close(); }
  });

  it('allows finance read-only access and rejects a different non-finance member', async () => {
    const hub = createTestHub();
    try {
      const { id } = seedJob(hub);
      const url = `/api/reimburse/imports/${id}/files/reif-invoice-pdf/content`;
      const reviewer = await login(hub.app, 'reviewer', TEST_PASSWORDS.reviewer);
      const forbidden = await hub.app.inject({ method: 'GET', url, headers: { cookie: reviewer } });
      expect(forbidden.statusCode, forbidden.body).toBe(403);
      const finance = await login(hub.app, 'admin', TEST_PASSWORDS.admin);
      const allowed = await hub.app.inject({ method: 'GET', url, headers: { cookie: finance } });
      expect(allowed.statusCode, allowed.body).toBe(200);
    } finally { await hub.close(); }
  });
});
