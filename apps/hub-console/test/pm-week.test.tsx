import { expect, test, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { governanceScenarioFixture, getWeekKey } from '@teamhub/hub-contracts';
import { createHubApiClient } from '../src/api/client';
import { queryKeys } from '../src/api/queryKeys';
import { LanguageProvider } from '../src/i18n';
import { WeekWorkspace } from '../src/features/pm/week/WeekWorkspace';
import { organizeTasks } from '../src/features/pm/week/task-view';

test('home defaults to personal tasks with a team scope switch and structural filters', () => {
  const cache = new QueryClient();
  const tasks = governanceScenarioFixture.tasks.map(task => ({ ...task, isBig: false, previousOwnerIds: [], weekLinks: [{ weekKey: getWeekKey(new Date()), linkedAt: task.createdAt, linkedBy: { id: 'm-circuitD', displayName: 'A', source: 'console' as const } }] }));
  cache.setQueryData(queryKeys.tasks('test'), { tasks });
  cache.setQueryData(queryKeys.groups('test'), { groups: governanceScenarioFixture.groups, assignableGroupIds: [] });
  cache.setQueryData([...queryKeys.members(), 'test'], { members: governanceScenarioFixture.members });
  const html = renderToStaticMarkup(<QueryClientProvider client={cache}><LanguageProvider><WeekWorkspace client={createHubApiClient()} source="test" projectId="prj-robots" identity={{ mode: 'identity', canWrite: true, isLoading: false, session: { memberId: 'm-circuitD', displayName: 'A', groupId: 'grp-circuit', role: 'member' } }} /></LanguageProvider></QueryClientProvider>);
  expect(html).toContain('我的任务');
  expect(html).toContain('任务范围');
  expect(html).toContain('aria-pressed="true">个人');
  expect(html).toContain('aria-pressed="false">全队');
  expect(html).not.toContain('week-detail');
  expect(html).toContain('<option value="inProgress" selected="">');
  expect(html).toContain('任务列数');
  expect(html).toContain('aria-pressed="true">3 列');
  expect(html).not.toContain('role="tablist"');
  expect(html).toContain('搜索任务');
  expect(html).toContain('全部小组');
  expect(html).toContain('新建任务');
  expect(html).toContain(tasks.find(task => task.ownerId === 'm-circuitD')!.title);
  expect(html).not.toContain(tasks.find(task => task.ownerId !== 'm-circuitD')!.title);
  expect(html).not.toContain('baseline-overview');
  cache.clear();
});

test('task views group and sort only by structural task dimensions', () => {
  const base = { ...governanceScenarioFixture.tasks[0]!, isBig: false, previousOwnerIds: [], projectName: 'Robots' };
  const tasks = [
    { ...base, id: 'b', title: 'Beta', groupId: 'grp-b', status: 'blocked' as const, updatedAt: '2026-01-01T00:00:00.000Z' },
    { ...base, id: 'a', title: 'Alpha', groupId: 'grp-a', status: 'inProgress' as const, updatedAt: '2026-01-02T00:00:00.000Z' },
  ];
  expect(organizeTasks(tasks, [], 'group', 'title', status => status, '未分组').map(group => [group.key, group.tasks[0]!.id])).toEqual([['grp-a', 'a'], ['grp-b', 'b']]);
  expect(organizeTasks(tasks, [], 'status', 'updated', status => status, '未分组').find(group => group.key === 'inProgress')!.tasks.map(task => task.id)).toEqual(['a']);
  expect(organizeTasks(tasks, [], 'project', 'title', status => status, '未分组').map(group => group.key)).toEqual(['prj-robots']);
});

test('self report API sends task fields to the week endpoint', async () => {
  const fetcher = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response(JSON.stringify({ task: governanceScenarioFixture.tasks[0] }), { status: 200 }));
  const client = createHubApiClient({ fetcher });
  await client.selfReportTask('2026-W44', { projectId: 'prj-robots', groupId: 'grp-circuit', title: 'week', rawSummary: 'week', intrinsicComplexity: 'normal' });
  expect(String(fetcher.mock.calls[0]?.[0])).toContain('/api/weeks/2026-W44/tasks');
});
