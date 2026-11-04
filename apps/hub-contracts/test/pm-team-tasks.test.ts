import { expect, test } from 'vitest';
import { governanceScenarioFixture } from '../src/index.js';
import { selectTeamTasks } from '../src/domains/pm/team-tasks.js';

test('team list searches history across weeks and filters group and acceptance', () => {
  const base = { ...governanceScenarioFixture.tasks[0]!, previousOwnerIds: [] };
  const tasks = [
    { ...base, id: 'old', groupId: 'g1', title: 'Old motor', rawSummary: 'calibration', status: 'done' as const, isBig: true, reviewedBy: undefined },
    { ...base, id: 'new', groupId: 'g2', title: 'Camera', status: 'inProgress' as const, isBig: false },
  ];
  expect(selectTeamTasks(tasks, { q: ' MOTOR ', groupId: 'g1', status: 'awaitingReview' }).map(t => t.id)).toEqual(['old']);
  expect(selectTeamTasks(tasks, { q: '', groupId: '', status: 'all' })).toHaveLength(2);
  expect(selectTeamTasks(tasks, { q: '', groupId: 'g2', status: 'awaitingReview' })).toEqual([]);
});
