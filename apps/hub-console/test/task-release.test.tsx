import { describe, expect, test, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { MemberPublic, TaskWithMeta } from '@teamhub/hub-contracts';
import { LanguageProvider } from '../src/i18n';
import { createHubApiClient, type HubApiClient } from '../src/api/client';
import { TaskActionsPanel } from '../src/features/pm/sub/TaskActionsPanel';
import { TaskFacts } from '../src/features/pm/sub/TaskFacts';
import { PoolCard } from '../src/features/pool/sub/PoolCard';
import type { useTaskActions } from '../src/features/pm/sub/useTaskActions';

function task(overrides: Partial<TaskWithMeta> = {}): TaskWithMeta {
  return {
    id: 't-1',
    projectId: 'p-1',
    groupId: 'grp-ec',
    title: '任务',
    rawSummary: '原话',
    status: 'inProgress',
    statusSource: 'console',
    ownerId: 'm-owner',
    collaboratorIds: [],
    intrinsicComplexity: 'normal',
    lastProgressAt: null,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    isBig: false,
    previousOwnerIds: [],
    ...overrides,
  };
}

function member(overrides: Partial<MemberPublic>): MemberPublic {
  return {
    id: 'm-owner',
    displayName: '当前完成人',
    role: 'member',
    grade: 'sophomore',
    groupId: 'grp-ec',
    status: 'working',
    currentTaskId: 't-1',
    updatedBy: 'console',
    updatedAt: '2026-10-01T00:00:00.000Z',
    ...overrides,
  };
}

const members = [
  member({}),
  member({ id: 'm-old', displayName: '历任甲' }),
  member({ id: 'm-lead', displayName: '本组组长', role: 'groupAdmin' }),
];

function mutation() {
  return { isPending: false, error: null, mutate: vi.fn() };
}

function actions(overrides: Record<string, unknown> = {}) {
  return {
    writeLocked: false,
    isIdentity: true,
    partnerWanted: false,
    crossWanted: false,
    completeActorId: '',
    completeMutation: mutation(),
    releaseOpen: false,
    releaseReason: '',
    releaseActorId: '',
    releaseCandidates: members.filter((item) => item.id !== 'm-old'),
    releaseMutation: mutation(),
    releaseActor: () => undefined,
    canRelease: true,
    setReleaseOpen: vi.fn(),
    setReleaseReason: vi.fn(),
    setReleaseActorId: vi.fn(),
    actionError: null,
    ...overrides,
  } as unknown as ReturnType<typeof useTaskActions>;
}

describe('D-095 前端退池关键交互与历任展示', () => {
  test('本人/组长按钮可用，非本人非组长禁用并说明权限', () => {
    const allowed = renderToStaticMarkup(
      <LanguageProvider>
        <TaskActionsPanel actions={actions()} task={task()} members={members} acceptance="notDone" />
      </LanguageProvider>,
    );
    expect(allowed).toContain('退回任务池');
    expect(allowed).not.toContain('仅当前完成人或本组组长可退回任务池');

    const denied = renderToStaticMarkup(
      <LanguageProvider>
        <TaskActionsPanel
          actions={actions({ canRelease: false })}
          task={task()}
          members={members}
          acceptance="notDone"
        />
      </LanguageProvider>,
    );
    expect(denied).toContain('退回任务池');
    expect(denied).toContain('disabled=""');
    expect(denied).toContain('仅当前完成人或本组组长可退回任务池');
  });

  test('匿名退池展开后只列当前完成人和本组组长，理由可选', () => {
    const html = renderToStaticMarkup(
      <LanguageProvider>
        <TaskActionsPanel
          actions={actions({ isIdentity: false, releaseOpen: true })}
          task={task()}
          members={members}
          acceptance="notDone"
        />
      </LanguageProvider>,
    );
    expect(html).toContain('退池理由（可选）');
    const releasePicker = html.match(/<select aria-label="退池操作人">.*?<\/select>/)?.[0] ?? '';
    expect(releasePicker).toContain('当前完成人');
    expect(releasePicker).toContain('本组组长');
    expect(releasePicker).not.toContain('历任甲');
    expect(html).toContain('确认退池');
  });

  test('任务事实卡显示去重后的历任名单', () => {
    const html = renderToStaticMarkup(
      <LanguageProvider>
        <TaskFacts
          task={task({ previousOwnerIds: ['m-old', 'm-lead'] })}
          members={members}
          acceptance="notDone"
        />
      </LanguageProvider>,
    );
    expect(html).toContain('曾经执行');
    expect(html).toContain('历任甲、本组组长');
  });

  test('任务池卡显示历任名单，不做按人统计', () => {
    const queryClient = new QueryClient();
    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <LanguageProvider>
          <PoolCard
            client={{} as HubApiClient}
            source="pool"
            task={task({ ownerId: null, status: 'pending', previousOwnerIds: ['m-old'] })}
            members={members}
            groups={[]}
            identity={{ mode: 'anonymous', session: null, isLoading: false, canWrite: true }}
            now={new Date('2026-10-27T00:00:00.000Z')}
          />
        </LanguageProvider>
      </QueryClientProvider>,
    );
    expect(html).toContain('曾经执行：历任甲');
    expect(html).not.toContain('次数');
    queryClient.clear();
  });

  test('releaseTask POST 正确路径并透传 ActorRef 与可选理由', async () => {
    const releasedBy = { id: 'm-owner', displayName: '当前完成人', source: 'console' as const };
    const fetcher = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ task: task({ ownerId: null, status: 'pending' }) }),
    }));
    const client = createHubApiClient({
      baseUrl: 'http://127.0.0.1:4177',
      fetcher: fetcher as unknown as typeof fetch,
    });
    const response = await client.releaseTask('t/1', { reason: '交接', releasedBy });
    expect(response.task.status).toBe('pending');
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://127.0.0.1:4177/api/tasks/t%2F1/release');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ reason: '交接', releasedBy });
  });
});
