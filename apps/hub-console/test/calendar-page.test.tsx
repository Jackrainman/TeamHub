import { afterEach, describe, expect, test, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { BaselineMilestonePublic, Project, Season, SeasonBaselinePublic } from '@teamhub/hub-contracts';
import { createHubApiClient } from '../src/api/client';
import { queryKeys } from '../src/api/queryKeys';
import type { PageIdentityCtx } from '../src/console-pages';
import { LanguageProvider } from '../src/i18n';
import { CalendarPage } from '../src/features/pm/calendar/CalendarPage';

const identity: PageIdentityCtx = { mode: 'anonymous', session: null, isLoading: false, canWrite: true };
const season: Season = {
  id: 'season-2026', name: '2026 赛季', startsAt: '2026-11-01T00:00:00.000Z',
  endsAt: '2026-12-31T23:59:59.999Z', status: 'active',
};
const project: Project = {
  id: 'project-a', seasonId: season.id, name: '跨月项目', status: 'active',
  createdAt: '2026-01-01T00:00:00.000Z', startsAt: '2026-11-10T00:00:00.000Z', endsAt: '2026-12-10T00:00:00.000Z',
};
const milestone: BaselineMilestonePublic = {
  id: 'm-1', title: '测试门', kind: 'gate', plannedAt: '2026-11-20T00:00:00.000Z', status: 'pending',
};

function renderPage(projects: Project[], baseline: SeasonBaselinePublic | null = null) {
  const cache = new QueryClient();
  cache.setQueryData(queryKeys.projects(), { projects });
  cache.setQueryData(queryKeys.seasons(), { seasons: [season] });
  cache.setQueryData(queryKeys.baseline.season('test', season.id), { baseline });
  return renderToStaticMarkup(<QueryClientProvider client={cache}>
    <LanguageProvider>
      <CalendarPage client={createHubApiClient()} source="test" projectId="project-a" identity={identity} onNavigate={() => {}} todayOverride="2026-11-16" />
    </LanguageProvider>
  </QueryClientProvider>);
}

afterEach(() => { vi.unstubAllGlobals(); });

describe('日历：空态', () => {
  test('0 个项目显示 EmptyState，月份刻度仍渲染', () => {
    const html = renderPage([]);
    expect(html).toContain('还没有项目');
    expect(html).toContain('11-01');
    expect(html).toContain('12-01');
  });

  test('startsAt=null 保留行与未定开始，但不画横条', () => {
    const html = renderPage([{ ...project, startsAt: null, endsAt: null }]);
    expect(html).toContain('跨月项目');
    expect(html).toContain('未定开始');
    expect(html).not.toContain('class="calendar-bar');
  });

  test('endsAt=null 横条标记开放结束并画到今天', () => {
    const html = renderPage([{ ...project, endsAt: null }]);
    expect(html).toContain('data-open-ended="true"');
    expect(html).toContain('至今');
  });

  test('无 baseline 显示降级说明；有 baseline 只画窗口内里程碑', () => {
    expect(renderPage([project])).toContain('本赛季还没有基准线');
    const baseline: SeasonBaselinePublic = {
      id: 'baseline-1', seasonId: season.id, anchors: {}, segments: [], phases: [],
      milestones: [milestone, { ...milestone, id: 'outside', plannedAt: '2027-01-01T00:00:00.000Z' }],
    };
    const html = renderPage([project], baseline);
    expect(html.match(/class="calendar-milestone /g)).toHaveLength(1);
    expect(html).toContain('data-milestone-id="m-1"');
    expect(html).not.toContain('data-milestone-id="outside"');
  });

  test('横条 left/width 只使用百分比', () => {
    const html = renderPage([project]);
    const style = html.match(/class="calendar-bar[^>]*style="([^"]+)"/)?.[1] ?? '';
    expect(style).toContain('left:');
    expect(style).toContain('width:');
    expect(style).toContain('%');
    expect(style).not.toContain('px');
  });
});

describe('日历：i18n', () => {
  test('英文显示 Month / Week / No projects yet，不泄漏翻译 key', () => {
    vi.stubGlobal('window', { localStorage: { getItem: () => 'en' } });
    const html = renderPage([]);
    expect(html).toContain('Month');
    expect(html).toContain('Week');
    expect(html).toContain('No projects yet');
    expect(html).not.toContain('calendar.mode.');
    expect(html).not.toContain('calendar.empty.');
  });
});
