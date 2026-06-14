import { describe, expect, test, vi } from 'vitest';
import { apiContractFixtures } from '@teamhub/hub-contracts';
import { createHubApiClient } from '../src/api/client';
import { OverviewSnapshotSchema } from '../src/api/schemas/system';

describe('hub console API client', () => {
  test('uses parsed mock overview data by default', async () => {
    const client = createHubApiClient();
    const snapshot = await client.getOverview();

    expect(client.mode).toBe('mock');
    expect(OverviewSnapshotSchema.safeParse(snapshot).success).toBe(true);
    expect(snapshot.adapters.adapters.length).toBeGreaterThan(0);
    expect(snapshot.events.events.length).toBeGreaterThan(0);
  });

  test('fetches and parses the real API split when baseUrl is set', async () => {
    const fetcher = vi.fn(async (url: string) => {
      const path = new URL(url, 'http://teamhub.local').pathname;
      const body = responseByPath(path);
      return {
        ok: true,
        status: 200,
        json: async () => body,
      } as Response;
    });

    const client = createHubApiClient({
      baseUrl: 'http://127.0.0.1:4177/',
      fetcher: fetcher as unknown as typeof fetch,
    });
    const snapshot = await client.getOverview();

    expect(client.mode).toBe('real');
    expect(fetcher).toHaveBeenCalledTimes(7);
    expect(snapshot.health.status).toBe('ok');
    expect(snapshot.gitRepos.repos).toHaveLength(
      apiContractFixtures.gitRepos.repos.length,
    );
  });

  test('uses same-origin real API mode when baseUrl is slash', async () => {
    const fetcher = vi.fn(async (url: string) => {
      const path = new URL(url, 'http://teamhub.local').pathname;
      return {
        ok: true,
        status: 200,
        json: async () => responseByPath(path),
      } as Response;
    });

    const client = createHubApiClient({
      baseUrl: '/',
      fetcher: fetcher as unknown as typeof fetch,
    });
    const snapshot = await client.getOverview();

    expect(client.mode).toBe('real');
    expect(fetcher).toHaveBeenCalledWith('/health');
    expect(snapshot.system.service).toBe('teamhub-hub-server');
  });

  test('fails closed on invalid API responses', async () => {
    const fetcher = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ invalid: true }),
    })) as unknown as typeof fetch;

    const client = createHubApiClient({
      baseUrl: 'http://127.0.0.1:4177',
      fetcher,
    });

    await expect(client.getOverview()).rejects.toThrow();
  });

  test('mock mode recalls similar issues for a symptom', async () => {
    const client = createHubApiClient();
    const result = await client.getKbSimilar({
      symptom: '底盘电机偶发失控、CAN 报文丢失',
      tags: ['CAN', '电机'],
    });

    expect(client.mode).toBe('mock');
    expect(result.note.length).toBeGreaterThan(0);
    expect(result.items.length).toBeGreaterThan(0);
    // 按词重合召回到 CAN 历史卡（候选，不断言同因）
    expect(result.items.some((item) => item.tags.includes('CAN'))).toBe(true);
  });

  test('mock mode returns the task board snapshot', async () => {
    const client = createHubApiClient();
    const result = await client.getTasks();

    expect(client.mode).toBe('mock');
    expect(result.tasks.length).toBeGreaterThan(0);
  });

  test('real mode fetches tasks and kb similar from the API', async () => {
    const fetcher = vi.fn(async (url: string) => {
      const parsed = new URL(url, 'http://teamhub.local');
      return {
        ok: true,
        status: 200,
        json: async () => responseByPath(parsed.pathname),
      } as Response;
    });

    const client = createHubApiClient({
      baseUrl: 'http://127.0.0.1:4177',
      fetcher: fetcher as unknown as typeof fetch,
    });

    const tasks = await client.getTasks();
    expect(client.mode).toBe('real');
    expect(tasks.tasks).toEqual([]);

    const similar = await client.getKbSimilar({
      symptom: 'CAN 丢包',
      tags: ['CAN'],
    });
    expect(similar.items).toEqual([]);

    const kbCall = fetcher.mock.calls.find(([url]) =>
      String(url).includes('/api/kb/similar'),
    );
    expect(kbCall).toBeTruthy();
    expect(String(kbCall?.[0])).toContain('symptom=');
    expect(String(kbCall?.[0])).toContain('tags=CAN');
  });
});

function responseByPath(path: string): unknown {
  switch (path) {
    case '/health':
      return {
        status: 'ok',
        service: 'teamhub-hub-server',
        checkedAt: '2026-06-06T00:00:00.000Z',
      };
    case '/api/system/status':
      return {
        service: 'teamhub-hub-server',
        version: '0.0.1',
        mode: 'mock-first',
        generatedAt: '2026-06-06T00:00:00.000Z',
        uptimeSeconds: 12,
        adapters: {
          total: apiContractFixtures.adapters.adapters.length,
          enabled: 1,
          degraded: 0,
          unconfigured: apiContractFixtures.adapters.adapters.length - 1,
        },
      };
    case '/api/adapters':
      return apiContractFixtures.adapters;
    case '/api/events':
      return apiContractFixtures.events;
    case '/api/bridge/members':
      return apiContractFixtures.bridgeMembers;
    case '/api/git/repos':
      return apiContractFixtures.gitRepos;
    case '/api/artifacts':
      return apiContractFixtures.artifacts;
    case '/api/tasks':
      return { tasks: [] };
    case '/api/kb/similar':
      return { query: { symptom: '', tags: [] }, items: [], note: 'mock note' };
    default:
      return { detail: 'Not found' };
  }
}
