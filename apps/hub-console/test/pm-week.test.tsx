import { expect, test, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { governanceScenarioFixture, getWeekKey } from '@teamhub/hub-contracts';
import { createHubApiClient } from '../src/api/client';
import { queryKeys } from '../src/api/queryKeys';
import { LanguageProvider } from '../src/i18n';
import { WeekWorkspace } from '../src/features/pm/week/WeekWorkspace';

test('home shows all team tasks with search and structural filters, without pools', () => {
  const cache = new QueryClient();
  const tasks = governanceScenarioFixture.tasks.map(task => ({ ...task, isBig: false, previousOwnerIds: [], weekLinks: [{ weekKey: getWeekKey(new Date()), linkedAt: task.createdAt, linkedBy: { id: 'm-circuitD', displayName: 'A', source: 'console' as const } }] }));
  cache.setQueryData(queryKeys.tasks('test'), { tasks });
  cache.setQueryData(queryKeys.groups('test'), { groups: governanceScenarioFixture.groups, assignableGroupIds: [] });
  cache.setQueryData([...queryKeys.members(), 'test'], { members: governanceScenarioFixture.members });
  const html = renderToStaticMarkup(<QueryClientProvider client={cache}><LanguageProvider><WeekWorkspace client={createHubApiClient()} source="test" projectId="prj-robots" identity={{ mode: 'identity', canWrite: true, isLoading: false, session: { memberId: 'm-circuitD', displayName: 'A', groupId: 'grp-circuit', role: 'member' } }} /></LanguageProvider></QueryClientProvider>);
  expect(html).toContain('全队任务');
  expect(html).toContain('week-detail');
  expect(html).not.toContain('role="tablist"');
  expect(html).toContain('搜索任务');
  expect(html).toContain('全部小组');
  expect(html).toContain('新建任务');
  expect(html).toContain(governanceScenarioFixture.tasks[0]!.title);
  expect(html).not.toContain('baseline-overview');
  cache.clear();
});

test('self report API sends task fields to the week endpoint', async () => {
  const fetcher = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response(JSON.stringify({ task: governanceScenarioFixture.tasks[0] }), { status: 200 }));
  const client = createHubApiClient({ fetcher });
  await client.selfReportTask('2026-W44', { projectId: 'prj-robots', groupId: 'grp-circuit', title: 'week', rawSummary: 'week', intrinsicComplexity: 'normal' });
  expect(String(fetcher.mock.calls[0]?.[0])).toContain('/api/weeks/2026-W44/tasks');
});
