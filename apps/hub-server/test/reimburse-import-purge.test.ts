import fs from 'node:fs';
import path from 'node:path';
import FormData from 'form-data';
import { describe, expect, it, vi } from 'vitest';
import { createTestHub, login, TEST_PASSWORDS, type TestHub } from './support/build-test-hub-server.js';

const invoiceXml = `<?xml version="1.0"?><Invoice><EIid>12345678901234567890</EIid><IssueTime>2026-11-20</IssueTime><SellerName>测试商店</SellerName><TotalTax-includedAmount>24.50</TotalTax-includedAmount><Item><ItemName>测试物料</ItemName><Quantity>1</Quantity><Amount>24.50</Amount></Item></Invoice>`;
const paymentXml = '支付成功\n交易金额：￥24.50\n交易单号：PURGE-TEST';

async function upload(hub: TestHub, cookie: string, withPayment = false) {
  const form = new FormData();
  form.append('files', Buffer.from(invoiceXml), 'invoice.xml');
  if (withPayment) form.append('files', Buffer.from(paymentXml), 'payment.xml');
  const response = await hub.app.inject({ method: 'POST', url: '/api/reimburse/imports', headers: { cookie, ...form.getHeaders() }, payload: form.getBuffer() });
  expect(response.statusCode).toBe(202);
  const id = response.json().job.id as string;
  await vi.waitFor(async () => {
    const current = await hub.app.inject({ method: 'GET', url: `/api/reimburse/imports/${id}`, headers: { cookie } });
    expect(current.json().job.status).toBe('ready');
  }, { timeout: 5000 });
  return id;
}

function purge(hub: TestHub, cookie: string, id: string) {
  return hub.app.inject({ method: 'POST', url: `/api/reimburse/imports/${id}/purge`, headers: { cookie } });
}

describe('reimburse import purge', () => {
  it('lets the owner purge an unconfirmed job, its bytes, its DB row, and writes an audit log', async () => {
    const hub = createTestHub();
    try {
      const cookie = await login(hub.app, 'owner', TEST_PASSWORDS.owner);
      const id = await upload(hub, cookie);
      const bytesPath = path.join(hub.root, 'imports', id);
      expect(fs.existsSync(bytesPath)).toBe(true);
      const audit = vi.spyOn(hub.app.log, 'info');

      const response = await purge(hub, cookie, id);
      expect(response.statusCode, response.body).toBe(200);
      expect(response.json()).toMatchObject({ id, purgedAt: expect.any(String) });
      expect(hub.database.db.getRow('reimburse_import_jobs', id)).toBeUndefined();
      expect(fs.existsSync(bytesPath)).toBe(false);
      expect(audit).toHaveBeenCalledWith(expect.objectContaining({
        audit: 'reimburse.import.purged', actorId: 'member-v1-1', jobId: id, at: expect.any(String),
      }), 'reimburse import job purged');
    } finally { await hub.close(); }
  });

  it('rejects another member without deleting bytes or the DB row', async () => {
    const hub = createTestHub();
    try {
      const owner = await login(hub.app, 'owner', TEST_PASSWORDS.owner);
      const reviewer = await login(hub.app, 'reviewer', TEST_PASSWORDS.reviewer);
      const id = await upload(hub, owner);

      const response = await purge(hub, reviewer, id);
      expect(response.statusCode).toBe(403);
      expect(hub.database.db.getRow('reimburse_import_jobs', id)).toBeDefined();
      expect(fs.existsSync(path.join(hub.root, 'imports', id))).toBe(true);
    } finally { await hub.close(); }
  });

  it('rejects purge after confirmation but still permits the original close operation', async () => {
    const hub = createTestHub();
    try {
      const cookie = await login(hub.app, 'owner', TEST_PASSWORDS.owner);
      const id = await upload(hub, cookie, true);
      const current = await hub.app.inject({ method: 'GET', url: `/api/reimburse/imports/${id}`, headers: { cookie } });
      const pair = current.json().job.pairs[0];
      const confirmed = await hub.app.inject({ method: 'POST', url: `/api/reimburse/imports/${id}/confirm`, headers: { cookie }, payload: {
        items: [{ pairId: pair.id, draft: pair.draft, clientRequestId: crypto.randomUUID(), batchId: null }],
      } });
      expect(confirmed.statusCode).toBe(200);

      const response = await purge(hub, cookie, id);
      expect(response.statusCode).toBe(409);
      expect(hub.database.db.getRow('reimburse_import_jobs', id)).toBeDefined();
      const closed = await hub.app.inject({ method: 'DELETE', url: `/api/reimburse/imports/${id}`, headers: { cookie } });
      expect(closed.statusCode).toBe(200);
      expect(closed.json().job.status).toBe('closed');
    } finally { await hub.close(); }
  });

  it('lets finance purge another member\'s unconfirmed job and its bytes', async () => {
    const hub = createTestHub();
    try {
      const owner = await login(hub.app, 'owner', TEST_PASSWORDS.owner);
      const admin = await login(hub.app, 'admin', TEST_PASSWORDS.admin);
      const id = await upload(hub, owner);

      const response = await purge(hub, admin, id);
      expect(response.statusCode, response.body).toBe(200);
      expect(hub.database.db.getRow('reimburse_import_jobs', id)).toBeUndefined();
      expect(fs.existsSync(path.join(hub.root, 'imports', id))).toBe(false);
    } finally { await hub.close(); }
  });
});
