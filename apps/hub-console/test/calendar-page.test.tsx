import { afterEach, describe, expect, test, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { BaselineMilestonePublic, Project, Season, SeasonBaselinePublic } from '@teamhub/hub-contracts';
import { createHubApiClient } from '../src/api/client';
import { queryKeys } from '../src/api/queryKeys';
import type { PageIdentityCtx } from '../src/console-pages';
import { LanguageProvider } from '../src/i18n';
import { CalendarPage, type CalendarView } from '../src/features/pm/calendar/CalendarPage';

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

function renderPage(projects: Project[], baseline: SeasonBaselinePublic | null = null, view?: CalendarView) {
  if (view) {
    vi.stubGlobal('window', { localStorage: { getItem: (key: string) => key === 'teamhub.calendar.view' ? view : null } });
  }
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

describe('日历：默认月视图', () => {
  test('默认渲染 6×7 月网格、项目条与 EmptyState', () => {
    const empty = renderPage([]);
    expect(empty).toContain('calendar-month-view');
    expect(empty.match(/class="calendar-month-day"/g)).toHaveLength(42);
    expect(empty).toContain('还没有项目');
    expect(empty).toContain('2026年11月');
    expect(empty).not.toContain('calendar-grid-wrap');

    const populated = renderPage([project]);
    expect(populated.match(/class="calendar-month-day"/g)).toHaveLength(42);
    expect(populated).toContain('calendar-project-bar');
    expect(populated).toContain('data-today="true"');
  });

  test('startsAt=null 只在未定开始行显示且不画条', () => {
    const html = renderPage([{ ...project, startsAt: null, endsAt: null }]);
    expect(html).toContain('calendar-month-unstarted');
    expect(html).toContain('跨月项目');
    expect(html).toContain('未定开始');
    expect(html).not.toContain('class="calendar-project-bar"');
    expect(html).not.toContain('所有项目都还没定开始日期');
  });

  test('未定开始项目排在有开始日期项目之后', () => {
    const html = renderPage([{ ...project, id: 'no-start', name: '未定开始项目', startsAt: null, endsAt: null }, project]);
    expect(html.indexOf('跨月项目')).toBeLessThan(html.indexOf('未定开始项目'));
  });

  test('endsAt=null 横条标记开放结束并画到今天', () => {
    const html = renderPage([{ ...project, endsAt: null }]);
    expect(html).toContain('data-open-ended="true"');
    expect(html).toContain('至今');
  });

  test('跨周项目在相邻周分段并标记连续端', () => {
    const html = renderPage([project]);
    expect(html).toContain('data-continue-end="true"');
    expect(html).toContain('data-continue-start="true"');
    expect(html).toContain('data-week-start="2026-11-09"');
    expect(html).toContain('data-week-start="2026-11-16"');
  });

  test('无 baseline 仍保留降级说明', () => {
    expect(renderPage([project])).toContain('本赛季还没有基准线');
  });
});

describe('日历：时间轴视图保持原行为', () => {
  const baseline: SeasonBaselinePublic = {
    id: 'baseline-1', seasonId: season.id, anchors: {}, phases: [],
    segments: [
      { kind: 'semester', startsAt: '2026-11-01T00:00:00.000Z', endsAt: '2026-11-30T00:00:00.000Z', label: '学期' },
      { kind: 'vacation', startsAt: '2026-12-01T00:00:00.000Z', endsAt: '2026-12-10T00:00:00.000Z', label: '假期' },
    ],
    milestones: [milestone, { ...milestone, id: 'outside', plannedAt: '2027-01-01T00:00:00.000Z' }],
  };

  test('有 baseline 只画窗口内里程碑并保留背景带', () => {
    const html = renderPage([project], baseline, 'timeline');
    expect(html).toContain('calendar-grid-wrap');
    expect(html).not.toContain('calendar-month-view');
    expect(html.match(/class="calendar-milestone /g)).toHaveLength(1);
    expect(html).toContain('data-milestone-id="m-1"');
    expect(html).not.toContain('data-milestone-id="outside"');
    expect(html.match(/class="calendar-band"/g)).toHaveLength(6);
    expect(html.match(/class="calendar-band" data-kind="semester"/g)).toHaveLength(3);
    expect(html.match(/class="calendar-band" data-kind="vacation"/g)).toHaveLength(3);
  });

  test('时间轴横条 left/width 只使用百分比', () => {
    const html = renderPage([project], null, 'timeline');
    const style = html.match(/class="calendar-bar[^>]*style="([^"]+)"/)?.[1] ?? '';
    expect(style).toContain('left:');
    expect(style).toContain('width:');
    expect(style).toContain('%');
    expect(style).not.toContain('px');
  });
});

describe('日历：i18n', () => {
  test('英文显示 Month / Timeline / No projects yet，不泄漏翻译 key', () => {
    vi.stubGlobal('window', { localStorage: { getItem: () => 'en' } });
    const html = renderPage([]);
    expect(html).toContain('Month');
    expect(html).toContain('Timeline');
    expect(html).toContain('No projects yet');
    expect(html).toContain('November 2026');
    expect(html).not.toContain('calendar.view.');
    expect(html).not.toContain('calendar.empty.');
  });
});
