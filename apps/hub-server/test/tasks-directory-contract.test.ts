import { afterEach, describe, expect, it } from 'vitest';
import type { TaskDirectoryPort } from '../src/modules/tasks/public.js';
import {
  createTestHub,
  login,
  memberId,
  TEST_PASSWORDS,
  type TestHub,
} from './support/build-test-hub-server.js';

let hub: TestHub | undefined;
afterEach(async () => { if (hub) await hub.close(); hub = undefined; });

describe('tasks → system directory public contract', () => {
  it('provides members and groups used by task creation', async () => {
    hub = createTestHub();
    const directory: TaskDirectoryPort = hub.system;
    expect(directory.listGroups().map((group) => group.name)).toContain('电路');
    expect(directory.listMembers().map((member) => member.displayName)).toEqual(
      expect.arrayContaining(['owner', 'reviewer', 'admin']),
    );

    const cookie = await login(hub.app, 'owner', TEST_PASSWORDS.owner);
    const response = await hub.app.inject({
      method: 'POST',
      url: '/api/tasks',
      headers: { cookie },
      payload: {
        groupId: directory.listGroups()[0].id,
        title: '目录契约任务',
        rawSummary: '验证 tasks 只依赖 system public 目录',
        ownerId: memberId(hub, 'owner'),
        collaboratorIds: [],
        intrinsicComplexity: 'normal',
      },
    });
    expect(response.statusCode, response.body).toBe(201);
  });
});
