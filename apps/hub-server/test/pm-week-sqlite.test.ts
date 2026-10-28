import { expect, test } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openUnifiedDb } from '../src/store/sqlite-unified.js';

test('claim and week link survive reopen, release preserves history, continuation is idempotent', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'teamhub-week-'));
  const path = join(dir, 'test.sqlite');
  const a = { id: 'a', displayName: 'A', source: 'console' as const };
  const b = { id: 'b', displayName: 'B', source: 'console' as const };
  const at = '2026-10-28T00:00:00.000Z';
  const database = openUnifiedDb(path);
  let reopened: ReturnType<typeof openUnifiedDb> | undefined;
  try {
    database.initialize({ dataMode: 'real', identityMode: 'anonymous' }, new Date(at));
    const repo = database.openStores().gov;
    const created = await repo.createTask({ projectId: 'p', groupId: 'g', title: 'weekly', rawSummary: 'weekly', ownerId: null, collaboratorIds: [], intrinsicComplexity: 'normal' });
    const claimed = await repo.claimTask(created.id, a.id, at, a, '2026-W44');
    expect(claimed?.weekLinks?.[0]).toEqual({ weekKey: '2026-W44', linkedAt: at, linkedBy: a });
    expect(await repo.claimTask(created.id, b.id, at, b, '2026-W44')).toBeNull();
    await repo.releaseTask(created.id, a, at);
    const reclaimed = await repo.claimTask(created.id, a.id, '2026-10-29T00:00:00.000Z', a, '2026-W44');
    expect(reclaimed?.weekLinks).toEqual([{ weekKey: '2026-W44', linkedAt: at, linkedBy: a }]);
    await repo.linkTaskWeek(created.id, '2026-W45', at, a);
    expect((await repo.linkTaskWeek(created.id, '2026-W45', at, a))?.weekLinks).toHaveLength(2);
    await repo.completeTask(created.id, a, at);
    await repo.reviewTask(created.id, b, 'accept', undefined, at);
    database.close();
    reopened = openUnifiedDb(path);
    const task = (await reopened.openStores().gov.getSnapshot()).tasks.find(t => t.id === created.id)!;
    expect(task.weekLinks?.map(l => l.weekKey)).toEqual(['2026-W44', '2026-W45']);
    expect(task.ownershipEvents?.map(e => e.kind)).toEqual(['claimed', 'released', 'claimed']);
    expect(task.reviewedAt).toBe(at);
    expect(task.reviewedBy).toEqual(b);
    expect(task.completedBy).toEqual(a);
  } finally {
    (reopened ?? database).close();
    await rm(dir, { recursive: true, force: true });
  }
});
