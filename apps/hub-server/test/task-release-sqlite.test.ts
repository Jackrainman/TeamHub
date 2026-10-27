import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { derivePreviousOwnerIds } from '@teamhub/hub-contracts';
import type { ActorRef } from '@teamhub/hub-contracts';
import { openUnifiedDb } from '../src/store/sqlite-unified.js';

const OWNER: ActorRef = { id: 'm-a', displayName: '成员A', source: 'console' };
const LEAD: ActorRef = { id: 'm-lead', displayName: '组长', source: 'console' };

describe('D-095 SQLite 退池持久化', () => {
  let dir: string;
  let dbPath: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'teamhub-task-release-'));
    dbPath = join(dir, 'teamhub.sqlite');
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test('认领/转派/退池事件与状态流转跨重启存活', async () => {
    const database = openUnifiedDb(dbPath);
    database.initialize({ dataMode: 'real', identityMode: 'anonymous' }, new Date('2026-10-27T00:00:00.000Z'));
    const stores = database.openStores();
    const created = await stores.gov.createTask({
      projectId: 'prj-robots',
      groupId: 'grp-mech',
      title: 'SQLite 退池',
      rawSummary: '验证事件与状态同事务落库',
      ownerId: null,
      collaboratorIds: [],
      intrinsicComplexity: 'normal',
    });
    await stores.gov.claimTask(created.id, 'm-a', '2026-10-27T01:00:00.000Z', OWNER);
    await stores.gov.assignTask(created.id, 'm-b', '转派', LEAD, '2026-10-27T02:00:00.000Z');
    const released = await stores.gov.releaseTask(
      created.id,
      LEAD,
      '2026-10-27T03:00:00.000Z',
      '退回交接',
    );
    expect(released?.status).toBe('pending');
    database.close();

    const reopened = openUnifiedDb(dbPath);
    try {
      const task = (await reopened.openStores().gov.getSnapshot()).tasks.find(
        (item) => item.id === created.id,
      );
      expect(task).toMatchObject({
        ownerId: null,
        status: 'pending',
        statusSource: 'console',
      });
      expect(task?.claimedAt).toBeUndefined();
      expect(task?.assignReason).toBeUndefined();
      expect(task?.assignedBy).toBeUndefined();
      expect(task?.ownershipEvents?.map((event) => event.kind)).toEqual([
        'claimed',
        'assigned',
        'released',
      ]);
      expect(task?.ownershipEvents?.at(-1)).toMatchObject({
        fromOwnerId: 'm-b',
        toOwnerId: null,
        reason: '退回交接',
      });
      expect(task?.transitions?.at(-1)).toMatchObject({ from: 'inProgress', to: 'pending' });
      expect(task && derivePreviousOwnerIds(task)).toEqual(['m-a', 'm-b']);
    } finally {
      reopened.close();
    }
  });
});
