import { expect, test } from 'vitest';
import { governanceScenarioFixture } from '@teamhub/hub-contracts';
import { buildEditedSelfTask } from '../src/modules/pm/self-task.js';

test('editing older accepted tasks retains the previous acceptance in history', () => {
  const by = { id: 'a', displayName: 'A', source: 'console' as const };
  const reviewer = { ...by, id: 'b' };
  const at = '2026-11-04T00:00:00.000Z';
  const task = { ...governanceScenarioFixture.tasks[0]!, status: 'done' as const, ownerId: 'a', reviewedBy: reviewer, reviewedAt: at, weekLinks: [{ weekKey: '2026-W44', linkedAt: at, linkedBy: by }] };
  const result = buildEditedSelfTask(task, { expectedRevision: 0, title: 'new content' }, by, at);
  expect(result?.reviewedBy).toBeUndefined();
  expect(result?.activity).toContainEqual({ kind: 'accepted', at, by: reviewer });
});
