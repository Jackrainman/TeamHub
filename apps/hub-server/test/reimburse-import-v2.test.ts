import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import FormData from 'form-data';
import { describe, expect, it, vi } from 'vitest';
import { ReimburseImportJobSchema } from '@teamhub/hub-contracts';
import { openV1Database } from '../src/store/v1-database.js';
import { createTestHub, login, memberId, TEST_PASSWORDS } from './support/build-test-hub-server.js';

const invoiceXml = `<?xml version="1.0"?><Invoice><EIid>12345678901234567890</EIid><IssueTime>2026-11-20</IssueTime><SellerName>测试商店</SellerName><TotalTax-includedAmount>24.50</TotalTax-includedAmount><Item><ItemName>测试物料</ItemName><Quantity>1</Quantity><Amount>24.50</Amount></Item></Invoice>`;
const paymentXml = (transaction: string) => `支付成功\n交易金额：￥24.50\n交易单号：${transaction}`;

async function upload(app: ReturnType<typeof createTestHub>['app'], cookie: string, payments = 1) {
  const form = new FormData();
  form.append('files', Buffer.from(invoiceXml), 'invoice.xml');
  for (let index = 0; index < payments; index += 1) {
    form.append('files', Buffer.from(paymentXml(`PAY-${index}`)), `payment-${index}.xml`);
  }
  return app.inject({ method: 'POST', url: '/api/reimburse/imports', headers: { cookie, ...form.getHeaders() }, payload: form.getBuffer() });
}

async function readyJob(app: ReturnType<typeof createTestHub>['app'], cookie: string, id: string) {
  let response;
  await vi.waitFor(async () => {
    response = await app.inject({ method: 'GET', url: `/api/reimburse/imports/${id}`, headers: { cookie } });
    expect(response.json().job.status).toBe('ready');
  }, { timeout: 5000 });
  return response!.json().job;
}

describe('reimburse import job persistence', () => {
  it('reads the same job after closing and reopening the sqlite file', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'teamhub-reimburse-import-v2-'));
    const file = path.join(root, 'teamhub.sqlite');
    const job = ReimburseImportJobSchema.parse({
      id: 'reimp-persisted', memberId: 'member-v1-1', status: 'ready',
      createdAt: '2026-11-20T00:00:00.000Z', updatedAt: '2026-11-20T00:00:00.000Z',
      files: [], pairs: [], confirmedEntryIds: [], history: [], error: null,
    });
    const first = openV1Database(file);
    first.db.insertRow('reimburse_import_jobs', job.id, job);
    first.close();

    const reopened = openV1Database(file);
    const stored = reopened.db.getRow('reimburse_import_jobs', job.id);
    expect(stored).toEqual(job);
    reopened.close();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('uploads, asynchronously parses, confirms entry plus evidence, and replays idempotently', async () => {
    const hub = createTestHub();
    try {
      const cookie = await login(hub.app, 'owner', TEST_PASSWORDS.owner);
      const uploaded = await upload(hub.app, cookie);
      expect(uploaded.statusCode).toBe(202);
      expect(uploaded.json().job).toMatchObject({ memberId: memberId(hub, 'owner'), status: 'parsing' });
      const id = uploaded.json().job.id as string;
      const job = await readyJob(hub.app, cookie, id);
      expect(job.pairs).toHaveLength(1);
      expect(job.pairs[0]).toMatchObject({ status: 'matched', amountFen: 2450 });
      const request = { items: [{ pairId: job.pairs[0].id, draft: job.pairs[0].draft, clientRequestId: crypto.randomUUID(), batchId: null }] };
      const confirmed = await hub.app.inject({ method: 'POST', url: `/api/reimburse/imports/${id}/confirm`, headers: { cookie }, payload: request });
      expect(confirmed.statusCode, confirmed.body).toBe(200);
      expect(confirmed.json().job.pairs[0].status).toBe('confirmed');
      expect(confirmed.json().job.files.every((file: { status: string }) => file.status === 'mounted')).toBe(true);
      const entryId = confirmed.json().job.confirmedEntryIds[0];
      const entry = hub.database.db.getRow<any>('reimburse_entries', entryId);
      expect(entry).toMatchObject({ memberId: memberId(hub, 'owner'), workflowStatus: 'draft', batchId: null, summary: '测试物料', actualItemName: '测试物料' });
      expect(entry.evidence).toHaveLength(2);
      expect(entry.evidence.map((item: { kind: string }) => item.kind).sort()).toEqual(['invoice', 'paymentShot']);
      const replay = await hub.app.inject({ method: 'POST', url: `/api/reimburse/imports/${id}/confirm`, headers: { cookie }, payload: request });
      expect(replay.statusCode).toBe(200);
      expect(replay.json().job.confirmedEntryIds).toEqual([entryId]);
      expect(hub.database.db.rowCount('reimburse_entries')).toBe(1);
      const duplicateUpload = await upload(hub.app, cookie);
      const duplicateJob = await readyJob(hub.app, cookie, duplicateUpload.json().job.id);
      expect(duplicateJob.files.every((file: { status: string }) => file.status === 'duplicate')).toBe(true);
      expect(duplicateJob.pairs).toEqual([]);
      expect(fs.existsSync(path.join(hub.root, 'imports', duplicateJob.id))).toBe(false);
    } finally { await hub.close(); }
  });

  it('stores a concise diagnostic category without exposing stacks or file contents', async () => {
    const hub = createTestHub();
    try {
      const cookie = await login(hub.app, 'owner', TEST_PASSWORDS.owner);
      const form = new FormData();
      form.append('files', Buffer.from('sensitive broken pdf contents'), 'broken.pdf');
      const uploaded = await hub.app.inject({ method: 'POST', url: '/api/reimburse/imports', headers: { cookie, ...form.getHeaders() }, payload: form.getBuffer() });
      const job = await readyJob(hub.app, cookie, uploaded.json().job.id);
      expect(job.files[0]).toMatchObject({ status: 'unreadable', error: 'pdf: invalid PDF' });
      expect(job.files[0].error).not.toContain('sensitive broken pdf contents');
      expect(job.files[0].error).not.toContain('\n');
    } finally { await hub.close(); }
  });

  it('reparses stored files for the owner and is idempotent across repeated requests', async () => {
    const hub = createTestHub();
    try {
      const cookie = await login(hub.app, 'owner', TEST_PASSWORDS.owner);
      const uploaded = await upload(hub.app, cookie);
      const id = uploaded.json().job.id as string;
      const original = await readyJob(hub.app, cookie, id);

      const first = await hub.app.inject({ method: 'POST', url: `/api/reimburse/imports/${id}/reparse`, headers: { cookie } });
      expect(first.statusCode, first.body).toBe(202);
      const reparsed = await readyJob(hub.app, cookie, id);
      expect(reparsed.files.map((file: { id: string }) => file.id)).toEqual(original.files.map((file: { id: string }) => file.id));
      expect(reparsed.pairs).toHaveLength(1);
      expect(reparsed.pairs[0]).toMatchObject({ status: 'matched', amountFen: 2450 });

      const replay = await hub.app.inject({ method: 'POST', url: `/api/reimburse/imports/${id}/reparse`, headers: { cookie } });
      expect(replay.statusCode, replay.body).toBe(202);
      const replayed = await readyJob(hub.app, cookie, id);
      expect(replayed.pairs).toEqual(reparsed.pairs);
      expect(replayed.files).toEqual(reparsed.files);
      expect(hub.database.db.rowCount('reimburse_entries')).toBe(0);

      const reviewerCookie = await login(hub.app, 'reviewer', TEST_PASSWORDS.reviewer);
      const forbidden = await hub.app.inject({ method: 'POST', url: `/api/reimburse/imports/${id}/reparse`, headers: { cookie: reviewerCookie } });
      expect(forbidden.statusCode).toBe(403);
    } finally { await hub.close(); }
  });

  it('does not reopen an abandoned job after its import bytes were deleted', async () => {
    const hub = createTestHub();
    try {
      const cookie = await login(hub.app, 'owner', TEST_PASSWORDS.owner);
      const uploaded = await upload(hub.app, cookie);
      const id = uploaded.json().job.id as string;
      await readyJob(hub.app, cookie, id);
      const closed = await hub.app.inject({ method: 'DELETE', url: `/api/reimburse/imports/${id}`, headers: { cookie } });
      expect(closed.json().job.status).toBe('closed');

      const reparsed = await hub.app.inject({ method: 'POST', url: `/api/reimburse/imports/${id}/reparse`, headers: { cookie } });
      expect(reparsed.statusCode, reparsed.body).toBe(202);
      expect(reparsed.json().job.status).toBe('closed');
      expect(reparsed.json().job.files.every((file: { status: string }) => file.status === 'removed')).toBe(true);
    } finally { await hub.close(); }
  });

  it('deletes one pending file and immediately recomputes a unique match', async () => {
    const hub = createTestHub();
    try {
      const cookie = await login(hub.app, 'owner', TEST_PASSWORDS.owner);
      const uploaded = await upload(hub.app, cookie, 2);
      const id = uploaded.json().job.id as string;
      const job = await readyJob(hub.app, cookie, id);
      expect(job.pairs[0]).toMatchObject({ status: 'pending', reason: 'ambiguous-amount' });
      const fileId = job.pairs[0].paymentFileIds[0];
      const removed = await hub.app.inject({ method: 'DELETE', url: `/api/reimburse/imports/${id}/files/${fileId}`, headers: { cookie } });
      expect(removed.statusCode, removed.body).toBe(200);
      expect(removed.json().job.pairs[0].status).toBe('matched');
      expect(removed.json().job.history[0]).toMatchObject({ action: 'file-removed', fileId, originalName: 'payment-0.xml' });
      expect(removed.json().job.files.find((file: { id: string }) => file.id === fileId)).toMatchObject({ status: 'removed' });
      expect(removed.json().job.files.find((file: { id: string }) => file.id === fileId).removedAt).not.toBeNull();
    } finally { await hub.close(); }
  });
});
