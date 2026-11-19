import { afterEach, describe, expect, it } from 'vitest';
import type { ReimburseAdminPort } from '../src/modules/reimburse/public.js';
import {
  createTestHub,
  login,
  memberId,
  TEST_PASSWORDS,
  type TestHub,
} from './support/build-test-hub-server.js';

let hub: TestHub | undefined;
afterEach(async () => { if (hub) await hub.close(); hub = undefined; });

describe('reimburse → system admin public contract', () => {
  it('provides administrator checks and display names used by reimburse', async () => {
    hub = createTestHub();
    const admin: ReimburseAdminPort = hub.system;
    const adminId = memberId(hub, 'admin');
    const ownerId = memberId(hub, 'owner');
    await expect(admin.isSuperAdmin(adminId)).resolves.toBe(true);
    await expect(admin.isSuperAdmin(ownerId)).resolves.toBe(false);
    await expect(admin.displayNames?.()).resolves.toMatchObject({
      [adminId]: 'admin',
      [ownerId]: 'owner',
    });

    const adminCookie = await login(hub.app, 'admin', TEST_PASSWORDS.admin);
    const ownerCookie = await login(hub.app, 'owner', TEST_PASSWORDS.owner);
    expect((await hub.app.inject({ method: 'GET', url: '/api/reimburse/batches', headers: { cookie: adminCookie } })).statusCode).toBe(200);
    expect((await hub.app.inject({ method: 'GET', url: '/api/reimburse/batches', headers: { cookie: ownerCookie } })).statusCode).toBe(403);
  });
});
