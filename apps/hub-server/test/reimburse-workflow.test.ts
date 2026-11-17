import FormData from 'form-data';
import { afterEach, describe, expect, it } from 'vitest';
import { createTestHub, login, TEST_PASSWORDS, type TestHub } from './support/build-test-hub-server.js';

let hub: TestHub | undefined;
afterEach(async () => { if (hub) await hub.close(); hub = undefined; });
async function action(app: TestHub['app'], cookie: string, id: string, action: string, revision: number, extra = {}) {
  return app.inject({ method: 'POST', url: `/api/reimburse/entries/${id}/workflow/${action}`,
    headers: { cookie }, payload: { expectedRevision: revision, ...extra } });
}
describe('reimburse workflow', () => {
  it('creates, stores evidence, submits, checks, approves, pays and exports', async () => {
    hub = createTestHub();
    const cookie = await login(hub.app, 'admin', TEST_PASSWORDS.admin);
    const created = await hub.app.inject({ method: 'POST', url: '/api/reimburse/entries', headers: { cookie }, payload: {
      kind: 'expense', expenseType: 'taxi', summary: '市区交通', recognitionSource: 'manual',
      invoiceNo: 'TAXI-001', invoiceDate: '2026-11-01', seller: '出租车公司',
      purchaserName: '新疆大学', purchaserTaxNo: '12650000457601471G', totalAmountFen: 2450,
      items: [], materials: { invoice: false, paymentShot: false, inspection: false },
    } });
    expect(created.statusCode).toBe(201);
    let entry = created.json().entry;
    expect(entry.projectId).toBeUndefined();
    expect(entry.seasonId).toBeUndefined();
    expect(entry.evidence).toEqual([]);
    for (const [kind, filename] of [['invoice', 'invoice.pdf'], ['paymentShot', 'payment.png']] as const) {
      const form = new FormData();
      form.append('kind', kind);
      form.append('expectedRevision', String(entry.revision));
      form.append('file', Buffer.from(`fixture ${kind}`), filename);
      const response = await hub.app.inject({ method: 'POST', url: `/api/reimburse/entries/${entry.id}/evidence`,
        headers: { cookie, ...form.getHeaders() }, payload: form.getBuffer() });
      expect(response.statusCode, response.body).toBe(201);
      entry = response.json().entry;
    }
    const evidence = await hub.app.inject({ method: 'GET', url: `/api/reimburse/entries/${entry.id}/evidence`, headers: { cookie } });
    expect(evidence.statusCode).toBe(200);
    expect(evidence.json().evidence).toHaveLength(2);
    const submitted = await action(hub.app, cookie, entry.id, 'submit', entry.revision);
    expect(submitted.statusCode, submitted.body).toBe(200);
    entry = submitted.json().entry;
    entry = (await action(hub.app, cookie, entry.id, 'accept', entry.revision)).json().entry;
    entry = (await action(hub.app, cookie, entry.id, 'check', entry.revision)).json().entry;
    const approved = await action(hub.app, cookie, entry.id, 'approve', entry.revision, { approvedAmountFen: 2450 });
    expect(approved.statusCode).toBe(200);
    entry = approved.json().entry;
    expect(entry.workflowStatus).toBe('pendingPayment');
    const payout = await hub.app.inject({ method: 'POST', url: '/api/reimburse/payouts', headers: { cookie }, payload: {
      entries: [{ id: entry.id, expectedRevision: entry.revision }], amountFen: 2450,
      paidAt: '2026-11-17T04:00:00.000Z', method: 'bank', transactionRef: 'BANK-001',
    } });
    expect(payout.statusCode).toBe(201);
    const list = await hub.app.inject({ method: 'GET', url: '/api/reimburse/entries', headers: { cookie } });
    expect(list.json().entries[0].workflowStatus).toBe('completed');
    expect(list.json().entries[0].payoutId).toBe(payout.json().payout.id);
    const exported = await hub.app.inject({ method: 'POST', url: '/api/reimburse/export', headers: { cookie }, payload: { entryIds: [entry.id], includeEvidence: true } });
    expect(exported.statusCode).toBe(200);
    expect(exported.headers['content-type']).toContain('application/zip');
    expect(exported.rawPayload.length).toBeGreaterThan(100);
  });
});
