import { expect, test } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { governanceScenarioFixture, type TaskWithMeta } from '@teamhub/hub-contracts';
import { createHubApiClient } from '../src/api/client';
import { queryKeys } from '../src/api/queryKeys';
import { LanguageProvider } from '../src/i18n';
import { TaskRailPanel } from '../src/features/pm/rail/TaskRailPanel';

const identity = { mode: 'identity' as const, canWrite: true, isLoading: false, session: { memberId: 'm-circuitD', displayName: 'A', groupId: 'grp-circuit', role: 'member' as const } };
function railTask(overrides: Partial<TaskWithMeta>): TaskWithMeta {
  const base = governanceScenarioFixture.tasks[0]!;
  return { ...base, isBig: false, previousOwnerIds: [], transitions: [], ...overrides, projectName: overrides.projectName ?? base.projectId };
}
function render(tasks: TaskWithMeta[], session: typeof identity | { mode: 'anonymous'; canWrite: boolean; isLoading: boolean; session: null } = identity) {
  const cache = new QueryClient();
  cache.setQueryData(queryKeys.tasks('test'), { tasks, currentWeek: '2026-W47' });
  cache.setQueryData(queryKeys.groups('test'), { groups: governanceScenarioFixture.groups, assignableGroupIds: [] });
  cache.setQueryData([...queryKeys.members(), 'test'], { members: governanceScenarioFixture.members });
  const html = renderToStaticMarkup(<QueryClientProvider client={cache}><LanguageProvider><TaskRailPanel client={createHubApiClient()} source="test" identity={session} active /></LanguageProvider></QueryClientProvider>);
  cache.clear();
  return html;
}

test('rail defaults to open personal tasks and exposes uniquely labelled controls', () => {
  const mine = railTask({ id: 'mine', title: '我的右栏任务', ownerId: 'm-circuitD', status: 'inProgress', weekLinks: [] });
  const other = railTask({ id: 'other', title: '他人的右栏任务', ownerId: 'm-mechA', status: 'inProgress' });
  const done = railTask({ id: 'done', title: '已归档的右栏任务', ownerId: 'm-circuitD', status: 'done', completedAt: '2026-11-16T02:00:00.000Z' });
  const html = render([mine, other, done]);
  expect(html).toContain('我的右栏任务');
  expect(html).not.toContain('他人的右栏任务');
  expect(html).not.toContain('已归档的右栏任务');
  for (const label of ['清单状态', '清单分组', '清单密度', '清单范围']) expect(html).toContain(`aria-label="${label}"`);
  expect(html).toContain('aria-pressed="true"');
  expect(html).toContain('aria-haspopup="dialog"');
  expect(html).toContain('data-density="standard"');
});

test('anonymous rail is team-only, explains login and renders no completion checkboxes', () => {
  const other = railTask({ id: 'other', title: '他人的周任务', ownerId: 'm-mechA', status: 'inProgress' });
  const html = render([other], { mode: 'anonymous', canWrite: true, isLoading: false, session: null });
  expect(html).toContain('他人的周任务');
  expect(html).not.toContain('aria-label="清单范围"');
  expect(html).toContain('登录后可在清单里直接勾选完成。');
  expect(html).not.toContain('ui-check');
  expect(html).toContain('task-rail__check-spacer');
});

test('empty filter result uses the shared empty state', () => {
  expect(render([])).toContain('empty-state');
  expect(render([])).toContain('清单为空');
});
