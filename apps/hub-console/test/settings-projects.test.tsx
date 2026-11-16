import { describe, expect, test } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Project } from '@teamhub/hub-contracts';
import { createHubApiClient } from '../src/api/client';
import { queryKeys } from '../src/api/queryKeys';
import { LanguageProvider } from '../src/i18n';
import type { PageIdentityCtx } from '../src/console-pages';
import {
  ProjectForm,
  ProjectsSection,
} from '../src/features/settings/ProjectsSection';
import { isProjectRangeValid } from '../src/shared/lib/project-utils';

const anonymous: PageIdentityCtx = { mode: 'anonymous', session: null, isLoading: false, canWrite: true };
const project: Project = {
  id: 'prj-robots',
  seasonId: 'season-2026',
  name: '当前项目',
  status: 'active',
  createdAt: '2026-08-01T00:00:00.000Z',
  startsAt: '2026-09-01T00:00:00.000Z',
  endsAt: '2026-10-01T00:00:00.000Z',
};

function renderSection(identity: PageIdentityCtx, projects: Project[] = [project]) {
  const cache = new QueryClient();
  cache.setQueryData(queryKeys.projects(), { projects });
  return renderToStaticMarkup(
    <QueryClientProvider client={cache}>
      <LanguageProvider>
        <ProjectsSection client={createHubApiClient()} source="test" identity={identity} />
      </LanguageProvider>
    </QueryClientProvider>,
  );
}

function renderForm(startsAt: string, endsAt: string) {
  return renderToStaticMarkup(
    <LanguageProvider>
      <ProjectForm
        name="项目"
        startsAt={startsAt}
        endsAt={endsAt}
        editing={false}
        writeLocked={false}
        lockHint={null}
        submitting={false}
        error={null}
        success={null}
        onNameChange={() => {}}
        onStartsAtChange={() => {}}
        onEndsAtChange={() => {}}
        onSubmit={() => {}}
        onCancel={() => {}}
      />
    </LanguageProvider>,
  );
}

describe('项目分区：渲染', () => {
  test('标题「项目」常驻；空列表显示空态文案；有数据时渲染 name + 日期区间', () => {
    expect(renderSection(anonymous, [])).toContain('还没有项目。');
    const html = renderSection(anonymous);
    expect(html).toContain('<h2>项目</h2>');
    expect(html).toContain('当前项目');
    expect(html).toContain('2026-09-01 → 2026-10-01');
  });

  test('endsAt 为 null 时显示「至今」，不显示 1970/空串', () => {
    const html = renderSection(anonymous, [{ ...project, endsAt: null }]);
    expect(html).toContain('2026-09-01 → 至今');
    expect(html).not.toContain('1970');
  });

  test('身份模式普通成员：输入与按钮 disabled，title 带管理员提示（区块仍渲染）', () => {
    const identity: PageIdentityCtx = {
      mode: 'identity',
      session: { memberId: 'm-1', displayName: '普通成员', groupId: 'grp-1', role: 'member' },
      isLoading: false,
      canWrite: true,
    };
    const html = renderSection(identity);
    expect(html).toContain('<h2>项目</h2>');
    expect(html).toContain('title=');
    expect(html).toContain('管理员');
    expect(html.match(/disabled=""/g)?.length).toBeGreaterThanOrEqual(5);
  });

  test('匿名模式：可写，按钮可用', () => {
    const html = renderSection(anonymous);
    expect(html).toContain('编辑');
    expect(html).not.toMatch(/<input[^>]*disabled/);
    expect(html).not.toMatch(/<button type="button" class="btn btn--secondary btn--sm" disabled/);
  });
});

describe('项目分区：日期校验', () => {
  test('endsAt 早于 startsAt → 渲染错误文案且提交按钮 disabled', () => {
    const html = renderForm('2026-10-01', '2026-09-01');
    expect(isProjectRangeValid('2026-10-01', '2026-09-01')).toBe(false);
    expect(html).toContain('结束日期不能早于开始日期');
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*disabled=""/);
  });

  test('endsAt 为空 → 不报错（合法）', () => {
    const html = renderForm('2026-09-01', '');
    expect(isProjectRangeValid('2026-09-01', '')).toBe(true);
    expect(html).not.toContain('结束日期不能早于开始日期');
    expect(html).not.toMatch(/<button[^>]*type="submit"[^>]*disabled=""/);
  });

  test('endsAt 等于 startsAt → 合法', () => {
    const html = renderForm('2026-09-01', '2026-09-01');
    expect(isProjectRangeValid('2026-09-01', '2026-09-01')).toBe(true);
    expect(html).not.toContain('结束日期不能早于开始日期');
    expect(html).not.toMatch(/<button[^>]*type="submit"[^>]*disabled=""/);
  });
});
