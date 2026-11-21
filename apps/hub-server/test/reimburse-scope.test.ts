import { afterEach, describe, expect, it } from 'vitest';
import { createTestHub, login, TEST_PASSWORDS, type TestHub } from './support/build-test-hub-server.js';

let hub: TestHub | undefined;
afterEach(async () => { if (hub) await hub.close(); hub = undefined; });

async function createEntry(app: TestHub['app'], cookie: string, summary: string) {
  const response = await app.inject({ method: 'POST', url: '/api/reimburse/entries', headers: { cookie }, payload: {
    kind: 'expense', expenseType: 'taxi', summary, recognitionSource: 'manual',
    totalAmountFen: 1000, items: [], materials: { invoice: false, paymentShot: false, inspection: false },
  } });
  expect(response.statusCode, response.body).toBe(201);
  return response.json().entry.id as string;
}

async function seedEntries() {
  hub = createTestHub();
  const adminCookie = await login(hub.app, 'admin', TEST_PASSWORDS.admin);
  const ownerCookie = await login(hub.app, 'owner', TEST_PASSWORDS.owner);
  const adminEntryId = await createEntry(hub.app, adminCookie, '财务自己的报销');
  const ownerEntryId = await createEntry(hub.app, ownerCookie, '普通成员的报销');
  return { adminCookie, ownerCookie, adminEntryId, ownerEntryId };
}

describe('reimburse entry scope', () => {
  it('rejects scope=all for a non-finance member', async () => {
    const { ownerCookie } = await seedEntries();
    const response = await hub!.app.inject({ method: 'GET', url: '/api/reimburse/entries?scope=all', headers: { cookie: ownerCookie } });
    expect(response.statusCode, response.body).toBe(403);
    expect(response.json().fields.reason).toBe('REIMBURSE_ADMIN_REQUIRED');
  });

  it('returns only the finance member own entries for scope=mine', async () => {
    const { adminCookie, adminEntryId } = await seedEntries();
    const response = await hub!.app.inject({ method: 'GET', url: '/api/reimburse/entries?scope=mine', headers: { cookie: adminCookie } });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().entries.map((entry: { id: string }) => entry.id)).toEqual([adminEntryId]);
  });

  it('defaults to mine while allowing finance to explicitly list all', async () => {
    const { adminCookie, adminEntryId, ownerEntryId } = await seedEntries();
    const defaultResponse = await hub!.app.inject({ method: 'GET', url: '/api/reimburse/entries', headers: { cookie: adminCookie } });
    expect(defaultResponse.statusCode, defaultResponse.body).toBe(200);
    expect(defaultResponse.json().entries.map((entry: { id: string }) => entry.id)).toEqual([adminEntryId]);

    const allResponse = await hub!.app.inject({ method: 'GET', url: '/api/reimburse/entries?scope=all', headers: { cookie: adminCookie } });
    expect(allResponse.statusCode, allResponse.body).toBe(200);
    expect(new Set(allResponse.json().entries.map((entry: { id: string }) => entry.id))).toEqual(new Set([adminEntryId, ownerEntryId]));
  });
});
