import { describe, expect, test, vi } from 'vitest';
import {
  apiContractFixtures,
  governanceScenarioFixture,
  kbScenarioFixture,
} from '@teamhub/hub-contracts';
import type {
  CreateTaskRequest,
  CreateDependencyRequest,
  CreateNeedRequest,
  CreateArtifactRequest,
} from '@teamhub/hub-contracts';
import type { KbCloseoutRequest } from '../src/api/schemas/kb';
import { createHubApiClient } from '../src/api/client';
import { OverviewSnapshotSchema } from '../src/api/schemas/system';

describe('hub console API client', () => {
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

    expect(fetcher).toHaveBeenCalledTimes(9);
    expect(OverviewSnapshotSchema.safeParse(snapshot).success).toBe(true);
    expect(snapshot.health.status).toBe('ok');
    expect(snapshot.botChannels.botChannels.length).toBeGreaterThan(0);
    expect(snapshot.agentBackends.agentBackends.length).toBeGreaterThan(0);
    expect(snapshot.dataSources.dataSources.length).toBeGreaterThan(0);
    expect(snapshot.events.events.length).toBeGreaterThan(0);
    expect(snapshot.gitRepos.repos).toHaveLength(
      apiContractFixtures.gitRepos.repos.length,
    );
  });

  test('uses same-origin relative paths when baseUrl is slash', async () => {
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

    expect(fetcher).toHaveBeenCalledWith('/health');
    expect(snapshot.system.service).toBe('teamhub-hub-server');
  });

  test('treats an empty baseUrl as same-origin relative paths', async () => {
    const fetcher = vi.fn(async (url: string) => {
      const path = new URL(url, 'http://teamhub.local').pathname;
      return {
        ok: true,
        status: 200,
        json: async () => responseByPath(path),
      } as Response;
    });

    const client = createHubApiClient({
      fetcher: fetcher as unknown as typeof fetch,
    });
    await client.getOverview();

    expect(fetcher).toHaveBeenCalledWith('/health');
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

  test('fetches and parses tasks and kb similar from the API', async () => {
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
    expect(tasks.tasks).toEqual([]);

    const similar = await client.getKbSimilar({
      symptom: 'CAN 丢包',
      tags: ['CAN'],
    });
    expect(similar.items).toEqual([]);
    expect(similar.note.length).toBeGreaterThan(0);

    const kbCall = fetcher.mock.calls.find(([url]) =>
      String(url).includes('/api/kb/similar'),
    );
    expect(kbCall).toBeTruthy();
    expect(String(kbCall?.[0])).toContain('symptom=');
    expect(String(kbCall?.[0])).toContain('tags=CAN');
  });

  test('fetches and parses the artifact version log', async () => {
    const fetcher = vi.fn(async (url: string) => {
      const path = new URL(url, 'http://teamhub.local').pathname;
      return {
        ok: true,
        status: 200,
        json: async () => responseByPath(path),
      } as Response;
    });

    const client = createHubApiClient({
      baseUrl: 'http://127.0.0.1:4177',
      fetcher: fetcher as unknown as typeof fetch,
    });

    const result = await client.getArtifacts();
    expect(fetcher).toHaveBeenCalledWith('http://127.0.0.1:4177/api/artifacts');
    expect(result.artifacts).toEqual(apiContractFixtures.artifacts.artifacts);
  });

  test('updateTaskStatus / waiveDependency POST 到正确子资源路径', async () => {
    const fetcher = vi.fn(async (url: string, _init?: RequestInit) => {
      const path = new URL(url, 'http://teamhub.local').pathname;
      return {
        ok: true,
        status: 200,
        json: async () => responseByPath(path),
      } as Response;
    });

    const client = createHubApiClient({
      baseUrl: 'http://127.0.0.1:4177',
      fetcher: fetcher as unknown as typeof fetch,
    });

    const statusRes = await client.updateTaskStatus('t-r1-dataset', 'done');
    expect(statusRes.task.id).toBeTruthy();
    const statusCall = fetcher.mock.calls.find(([u]) =>
      String(u).endsWith('/api/tasks/t-r1-dataset/status'),
    );
    expect(statusCall).toBeTruthy();
    expect(statusCall?.[1]?.method).toBe('POST');
    expect(JSON.parse(String(statusCall?.[1]?.body))).toEqual({ status: 'done' });

    const waiveRes = await client.waiveDependency('dep-002');
    expect(waiveRes.dependency.id).toBeTruthy();
    // I0：响应剥 confirmedBy
    expect(waiveRes.dependency).not.toHaveProperty('confirmedBy');
    const waiveCall = fetcher.mock.calls.find(([u]) =>
      String(u).endsWith('/api/dependencies/dep-002/waive'),
    );
    expect(waiveCall).toBeTruthy();
    expect(waiveCall?.[1]?.method).toBe('POST');
  });

  test('写侧 create* / closeoutKb POST 到正确路径、带 body、解析响应（M21）', async () => {
    const fetcher = vi.fn(async (url: string, _init?: RequestInit) => {
      const path = new URL(url, 'http://teamhub.local').pathname;
      return {
        ok: true,
        status: 201,
        json: async () => writeResponseByPath(path),
      } as Response;
    });

    const client = createHubApiClient({
      baseUrl: 'http://127.0.0.1:4177',
      fetcher: fetcher as unknown as typeof fetch,
    });

    // client 不校验请求体（postJson 只 stringify）——这里验 URL/method/body 透传 + 响应 schema 解析。
    const taskReq = { title: 'write-test-task' } as unknown as CreateTaskRequest;
    const taskRes = await client.createTask(taskReq);
    expect(taskRes.task.id).toBeTruthy();
    const taskCall = fetcher.mock.calls.find(([u]) =>
      String(u).endsWith('/api/tasks'),
    );
    expect(taskCall?.[1]?.method).toBe('POST');
    expect(JSON.parse(String(taskCall?.[1]?.body))).toEqual(taskReq);

    const depReq = { fromTaskId: 'a', toTaskId: 'b' } as unknown as CreateDependencyRequest;
    const depRes = await client.createDependency(depReq);
    expect(depRes.dependency.id).toBeTruthy();
    // I0：响应 schema 剥 confirmedBy（M6）
    expect(depRes.dependency).not.toHaveProperty('confirmedBy');
    const depCall = fetcher.mock.calls.find(([u]) =>
      String(u).endsWith('/api/dependencies'),
    );
    expect(depCall?.[1]?.method).toBe('POST');

    const needReq = { providerGroupId: 'g' } as unknown as CreateNeedRequest;
    const needRes = await client.createNeed(needReq);
    expect(needRes.need.id).toBeTruthy();
    // I0：响应 schema 剥 confirmedBy（M6）
    expect(needRes.need).not.toHaveProperty('confirmedBy');
    const needCall = fetcher.mock.calls.find(([u]) =>
      String(u).endsWith('/api/needs'),
    );
    expect(needCall?.[1]?.method).toBe('POST');

    const closeoutReq = { rootCause: 'r', resolution: 'fix' } as unknown as KbCloseoutRequest;
    const closeoutRes = await client.closeoutKb(closeoutReq);
    expect(closeoutRes.knowledgeNode.id).toBeTruthy();
    expect(closeoutRes.errorEntry.errorCode.length).toBeGreaterThan(0);
    const closeoutCall = fetcher.mock.calls.find(([u]) =>
      String(u).endsWith('/api/kb/closeout'),
    );
    expect(closeoutCall?.[1]?.method).toBe('POST');

    // 图纸登记写侧（V1-FOLLOWUP ④）：POST /api/artifacts、带 body、解析响应
    const artifactReq = {
      kind: 'image',
      name: '底盘装配图',
      uri: 'artifact://chassis/v4',
      mechanism: '底盘',
      revision: 'v4',
    } as unknown as CreateArtifactRequest;
    const artifactRes = await client.createArtifact(artifactReq);
    expect(artifactRes.artifact.id).toBeTruthy();
    const artifactCall = fetcher.mock.calls.find(([u]) =>
      String(u).endsWith('/api/artifacts'),
    );
    expect(artifactCall?.[1]?.method).toBe('POST');
    expect(JSON.parse(String(artifactCall?.[1]?.body))).toEqual(artifactReq);
  });

  test('postJson 把后端 400 的 detail 透出到抛错（表单错误条）', async () => {
    const fetcher = vi.fn(async () => ({
      ok: false,
      status: 400,
      json: async () => ({ detail: 'invalid body' }),
    })) as unknown as typeof fetch;

    const client = createHubApiClient({
      baseUrl: 'http://127.0.0.1:4177',
      fetcher,
    });

    await expect(
      client.createTask({} as unknown as CreateTaskRequest),
    ).rejects.toThrow('400: invalid body');
  });
});

function writeResponseByPath(path: string): unknown {
  switch (path) {
    case '/api/tasks':
      return { task: governanceScenarioFixture.tasks[0] };
    case '/api/dependencies':
      return { dependency: governanceScenarioFixture.dependencies[0] };
    case '/api/needs':
      return { need: governanceScenarioFixture.needs[0] };
    case '/api/kb/closeout':
      return {
        archiveDocument: kbScenarioFixture.archiveDocuments[0],
        errorEntry: kbScenarioFixture.errorEntries[0],
        updatedIssueCard: kbScenarioFixture.issueCards[0],
        knowledgeNode: governanceScenarioFixture.knowledgeNodes[0],
      };
    case '/api/artifacts':
      return { artifact: governanceScenarioFixture.artifacts[0] };
    default:
      return { detail: 'Not found' };
  }
}

function responseByPath(path: string): unknown {
  // 受限状态机迁移路由（动态 id）：状态流转 / 连线作废。
  // 注意限定 /api/tasks/ 前缀——否则 /api/system/status 也以 /status 结尾会被误匹配。
  if (path.startsWith('/api/tasks/') && path.endsWith('/status')) {
    return { task: governanceScenarioFixture.tasks[0] };
  }
  if (path.startsWith('/api/dependencies/') && path.endsWith('/waive')) {
    // 响应 schema 会剥 confirmedBy（I0）；这里给完整边、parse 时自动 omit。
    return { dependency: governanceScenarioFixture.dependencies[0] };
  }
  switch (path) {
    case '/health':
      return {
        status: 'ok',
        service: 'teamhub-hub-server',
        checkedAt: '2026-06-06T00:00:00.000Z',
        buildId: 'test-build',
      };
    case '/api/system/status':
      return {
        service: 'teamhub-hub-server',
        version: '0.0.1',
        mode: 'mock-first',
        generatedAt: '2026-06-06T00:00:00.000Z',
        uptimeSeconds: 12,
        adapters: {
          total: apiContractFixtures.agentBackends.agentBackends.length,
          enabled: 0,
          degraded: 0,
          unconfigured: apiContractFixtures.agentBackends.agentBackends.length,
        },
      };
    case '/api/bot-channels':
      return apiContractFixtures.botChannels;
    case '/api/agent-backends':
      return apiContractFixtures.agentBackends;
    case '/api/data-sources':
      return apiContractFixtures.dataSources;
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
