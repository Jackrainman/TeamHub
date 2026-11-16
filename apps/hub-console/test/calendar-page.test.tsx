import { afterEach, describe, expect, test, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Project, Season, SeasonBaselinePublic } from '@teamhub/hub-contracts';
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
  id: 'project-a', seasonId: season.id, name: '跨月项目', status: 'active', groupIds: [],
  createdAt: '2026-01-01T00:00:00.000Z', startsAt: '2026-11-10T00:00:00.000Z', endsAt: '2026-12-10T00:00:00.000Z',
};
function renderPage(projects: Project[], baseline: SeasonBaselinePublic | null = null, pageIdentity: PageIdentityCtx = identity) {
  const cache = new QueryClient();
  cache.setQueryData(queryKeys.projects(), { projects });
  cache.setQueryData(queryKeys.seasons(), { seasons: [season] });
  cache.setQueryData(queryKeys.baseline.season('test', season.id), { baseline });
  return renderToStaticMarkup(<QueryClientProvider client={cache}>
    <LanguageProvider>
      <CalendarPage client={createHubApiClient()} source="test" projectId="project-a" identity={pageIdentity} onNavigate={() => {}} todayOverride="2026-11-16" />
    </LanguageProvider>
  </QueryClientProvider>);
}

afterEach(() => { vi.unstubAllGlobals(); });

describe('日历：默认月视图', () => {
  test('默认渲染 6×7 月网格、项目条与轻量空态', () => {
    const empty = renderPage([]);
    expect(empty).toContain('calendar-month-view');
    expect(empty.match(/class="calendar-month-day"/g)).toHaveLength(42);
    expect(empty).toContain('data-empty-kind="no-projects"');
    expect(empty).toContain('当前赛季还没有项目，日历暂无可画内容');
    expect(empty.match(/data-action="create-project"/g)).toHaveLength(2);
    expect(empty).toContain('2026年11月');
    expect(empty).not.toContain('calendar-grid-wrap');
    expect(empty).not.toContain('calendar-view-toggle');
    expect(empty).not.toContain('empty-state');

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
    expect(html).toContain('data-empty-kind="no-dates"');
    expect(html).toContain('当前赛季 1 个项目还没有起止日期，日历暂无可画内容');
    expect(html).not.toContain('class="calendar-project-bar"');
  });

  test('无写权限时新建按钮禁用并解释原因，有权限时常驻可用', () => {
    const readOnly: PageIdentityCtx = { mode: 'identity', session: null, isLoading: false, canWrite: false };
    const locked = renderPage([{ ...project, startsAt: null, endsAt: null }], null, readOnly);
    const lockedButtons = locked.match(/<button[^>]*data-action="create-project"[^>]*>/g) ?? [];
    expect(lockedButtons).toHaveLength(2);
    expect(lockedButtons.every(button => button.includes('disabled=""'))).toBe(true);
    expect(locked).toContain('登录后才能提交');
    const unlockedButton = renderPage([project]).match(/<button[^>]*data-action="create-project"[^>]*>/)?.[0] ?? '';
    expect(unlockedButton).not.toBe('');
    expect(unlockedButton).not.toContain('disabled');
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

describe('日历：i18n', () => {
  test('英文显示月历与空态提示，不暴露 Timeline 或翻译 key', () => {
    vi.stubGlobal('window', { localStorage: { getItem: () => 'en' } });
    const html = renderPage([]);
    expect(html).toContain('Calendar');
    expect(html).not.toContain('Timeline');
    expect(html).toContain('The active season has no projects yet, so there is nothing to draw on the calendar.');
    expect(html).toContain('November 2026');
    expect(html).not.toContain('calendar.view.');
    expect(html).not.toContain('calendar.empty.');
  });
});
