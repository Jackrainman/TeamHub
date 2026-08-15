import { describe, expect, test, vi } from 'vitest';
import {
  apiContractFixtures,
  governanceScenarioFixture,
  inventoryScenarioFixture,
  kbScenarioFixture,
  scheduleScenarioFixture,
} from '@teamhub/hub-contracts';
import type {
  CreateTaskRequest,
  CreateDependencyRequest,
  CreateNeedRequest,
  CreateArtifactRequest,
} from '@teamhub/hub-contracts';
import type { KbCloseoutRequest } from '../src/api/schemas/kb';
import type {
  CreatePartTypeRequest,
  CreatePartActionRequest,
} from '../src/api/schemas/inv';
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

    // 图纸登记写侧 v2（HUB-ARTIFACT-ARCHIVE-V2）：POST /api/artifacts、带 body、解析响应。
    // v2 body：ownerGroup/season/robotCode 必填，删 kind/revision（server 派生，C5）。
    const artifactReq: CreateArtifactRequest = {
      ownerGroup: 'mechanical',
      season: '25',
      robotCode: 'R1',
      name: '底盘装配图',
      uri: 'artifact://chassis/v4',
      mechanism: '底盘',
    };
    const artifactRes = await client.createArtifact(artifactReq);
    expect(artifactRes.artifact.id).toBeTruthy();
    const artifactCall = fetcher.mock.calls.find(([u]) =>
      String(u).endsWith('/api/artifacts'),
    );
    expect(artifactCall?.[1]?.method).toBe('POST');
    expect(JSON.parse(String(artifactCall?.[1]?.body))).toEqual(artifactReq);

    // 电路驱动 case：subType 必填（electrical）
    const electricalReq: CreateArtifactRequest = {
      ownerGroup: 'electrical',
      season: '25',
      robotCode: 'R1',
      name: '底盘驱动固件',
      uri: 'artifact://firmware/chassis-driver-v1.bin',
      mechanism: '底盘驱动',
      subType: 'driver',
      relatedRepo: 'repo-infantry',
      relatedCommit: 'abc1234',
    };
    const electricalRes = await client.createArtifact(electricalReq);
    expect(electricalRes.artifact.id).toBeTruthy();
  });

  test('R1 接力画布：getRelay / updateResourceSession / create+deleteRelayHandoff 命中正确路径与方法', async () => {
    const fetcher = vi.fn(async (url: string) => {
      const parsed = new URL(url, 'http://teamhub.local');
      return {
        ok: true,
        status: 200,
        json: async () => relayResponseByPath(parsed.pathname, init?.method),
      } as Response;
    });

    const client = createHubApiClient({
      baseUrl: 'http://127.0.0.1:4177',
      fetcher: fetcher as unknown as typeof fetch,
    });

    // 读：GET /api/relay?windowLabel=
    const board = await client.getRelay('今晚');
    expect(board.stages).toEqual([]);
    expect(board.handoffs).toEqual([]);
    const relayCall = fetcher.mock.calls.find(([u]) =>
      String(u).includes('/api/relay?'),
    );
    expect(String(relayCall?.[0])).toContain('windowLabel=');

    // PATCH 占用窗口受限编辑（orderInWindow / eta）
    const upd = await client.updateResourceSession('sess-1', {
      orderInWindow: 2,
      eta: '22:30',
    });
    expect(upd.session).not.toHaveProperty('confirmedBy');
    const patchCall = fetcher.mock.calls.find(([u]) =>
      String(u).endsWith('/api/resource-sessions/sess-1'),
    );
    expect(patchCall?.[1]?.method).toBe('PATCH');
    expect(JSON.parse(String(patchCall?.[1]?.body))).toEqual({
      orderInWindow: 2,
      eta: '22:30',
    });

    // POST 接力交接线
    const handoff = await client.createRelayHandoff({
      projectId: 'proj-1',
      windowLabel: '今晚',
      fromSessionId: 'sess-1',
      toSessionId: 'sess-2',
      confirmedBy: { id: 'console-relay', displayName: 'x', source: 'console' },
    });
    expect(handoff.handoff).not.toHaveProperty('confirmedBy');
    const postCall = fetcher.mock.calls.find(
      ([u, init]) =>
        String(u).endsWith('/api/relay-handoffs') &&
        (init as RequestInit | undefined)?.method === 'POST',
    );
    expect(postCall).toBeTruthy();

    // DELETE 接力交接线（无 body）
    const del = await client.deleteRelayHandoff('ho-1');
    expect(del.deleted).toBe('ho-1');
    const delCall = fetcher.mock.calls.find(([u]) =>
      String(u).endsWith('/api/relay-handoffs/ho-1'),
    );
    expect(delCall?.[1]?.method).toBe('DELETE');
    expect((delCall?.[1] as RequestInit | undefined)?.body).toBeUndefined();

    // A2 加一棒：POST /api/resource-sessions，带 body；响应剥 confirmedBy。
    const created = await client.createResourceSession({
      projectId: 'proj-1',
      resourceId: 'res-r1',
      windowLabel: '2026-06-20',
      orderInWindow: 1,
      holderGroupId: 'grp-1',
      holderTaskId: 'task-1',
      invitedMemberIds: [],
      note: null,
      eta: null,
      confirmedBy: { id: 'console-relay', displayName: 'x', source: 'console' },
    });
    expect(created.session).not.toHaveProperty('confirmedBy');
    const sessPostCall = fetcher.mock.calls.find(
      ([u, init]) =>
        String(u).endsWith('/api/resource-sessions') &&
        (init as RequestInit | undefined)?.method === 'POST',
    );
    expect(sessPostCall).toBeTruthy();
    expect(JSON.parse(String(sessPostCall?.[1]?.body))).toMatchObject({
      resourceId: 'res-r1',
      windowLabel: '2026-06-20',
      orderInWindow: 1,
      invitedMemberIds: [],
    });

    // A2 删一棒：DELETE /api/resource-sessions/:id（无 body），后端级联删交接线。
    const delSess = await client.deleteResourceSession('sess-1');
    expect(delSess.deleted).toBe('sess-1');
    const delSessCall = fetcher.mock.calls.find(
      ([u, init]) =>
        String(u).endsWith('/api/resource-sessions/sess-1') &&
        (init as RequestInit | undefined)?.method === 'DELETE',
    );
    expect(delSessCall).toBeTruthy();
    expect((delSessCall?.[1] as RequestInit | undefined)?.body).toBeUndefined();
  });

  test('R3 车管理：createResource POST /api/resources、updateResourceStatus PATCH /api/resources/:id/status 命中正确路径与方法', async () => {
    const fetcher = vi.fn(async (url: string, _init?: RequestInit) => {
      const path = new URL(url, 'http://teamhub.local').pathname;
      return {
        ok: true,
        status: 200,
        json: async () => resourceWriteResponseByPath(path),
      } as Response;
    });

    const client = createHubApiClient({
      baseUrl: 'http://127.0.0.1:4177',
      fetcher: fetcher as unknown as typeof fetch,
    });

    // 建车：POST /api/resources，带 body（displayCode 禁手写、不在请求里），解析响应。
    const createReq = {
      projectId: 'prj-robots',
      name: 'R2 比赛车',
      kind: 'robot' as const,
      robotTarget: 'R2' as const,
      season: '26',
      version: 1,
    };
    const createRes = await client.createResource(createReq);
    expect(createRes.resource.id).toBeTruthy();
    const createCall = fetcher.mock.calls.find(
      ([u, init]) =>
        String(u).endsWith('/api/resources') &&
        (init as RequestInit | undefined)?.method === 'POST',
    );
    expect(createCall).toBeTruthy();
    expect(JSON.parse(String(createCall?.[1]?.body))).toEqual(createReq);

    // 改状态（退役 = 状态迁移、非物删）：PATCH /api/resources/:id/status，带 status + 可选 statusReason。
    const patchRes = await client.updateResourceStatus('res-r2', {
      status: 'retired',
      statusReason: '赛季结束退役',
    });
    expect(patchRes.resource.id).toBeTruthy();
    const patchCall = fetcher.mock.calls.find(([u]) =>
      String(u).endsWith('/api/resources/res-r2/status'),
    );
    expect(patchCall?.[1]?.method).toBe('PATCH');
    expect(JSON.parse(String(patchCall?.[1]?.body))).toEqual({
      status: 'retired',
      statusReason: '赛季结束退役',
    });
  });

  test('SEASON-CREATE：createSeason POST /api/seasons，body 原样、响应过 zod', async () => {
    const season = {
      id: 'season-new-2',
      name: 'Robocon 2027',
      startsAt: '2026-09-01T00:00:00.000Z',
      endsAt: null,
      status: 'active' as const,
    };
    const fetcher = vi.fn(async () => {
      return {
        ok: true,
        status: 201,
        json: async () => ({ season }),
      } as Response;
    });
    const client = createHubApiClient({
      baseUrl: 'http://127.0.0.1:4177',
      fetcher: fetcher as unknown as typeof fetch,
    });
    const req = { name: 'Robocon 2027', startsAt: '2026-09-01T00:00:00.000Z', endsAt: null };
    const res = await client.createSeason(req);
    expect(res.season).toEqual(season);
    const call = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(call[0])).toContain('/api/seasons');
    expect(call[1]?.method).toBe('POST');
    expect(JSON.parse(String(call[1]?.body))).toEqual(req);
  });

  test('SETUP-WIZARD 刀②：getSetupState GET /api/setup/state；initSetup POST /api/setup/init（body 原样、响应过 zod）', async () => {
    const calls: Array<[string, RequestInit | undefined]> = [];
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      const path = new URL(url, 'http://teamhub.local').pathname;
      calls.push([path, init]);
      if (init?.method === 'POST') {
        return { ok: true, status: 200, json: async () => ({ restarting: true }) } as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ initialized: false, databaseState: 'empty' }),
      } as Response;
    });
    const client = createHubApiClient({
      baseUrl: 'http://127.0.0.1:4177',
      fetcher: fetcher as unknown as typeof fetch,
    });

    const state = await client.getSetupState();
    expect(state).toEqual({ initialized: false, databaseState: 'empty' });

    const req = { dataMode: 'real' as const, identityMode: 'identity' as const };
    const res = await client.initSetup(req);
    expect(res).toEqual({ restarting: true });

    const stateCall = calls.find(([p, i]) => p === '/api/setup/state' && i?.method !== 'POST');
    expect(stateCall).toBeTruthy();
    const initCall = calls.find(([p, i]) => p === '/api/setup/init' && i?.method === 'POST');
    expect(initCall).toBeTruthy();
    expect(JSON.parse(String(initCall?.[1]?.body))).toEqual(req);
  });

  test('setup/state 严格接受 unclaimed 阻塞态与带 AppSettings 的已初始化态', async () => {
    const initializedAt = '2026-08-15T00:00:00.000Z';
    const responses = [
      { initialized: false, databaseState: 'unclaimed' },
      {
        initialized: true,
        settings: {
          schemaVersion: 1,
          dataMode: 'real',
          identityMode: 'identity',
          verticalId: 'robotics',
          projectId: 'prj-robots',
          enabledModules: ['system', 'pm-core'],
          initializedAt,
          updatedAt: initializedAt,
        },
      },
    ];
    const fetcher = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => responses.shift(),
    }) as Response);
    const client = createHubApiClient({
      baseUrl: 'http://127.0.0.1:4177',
      fetcher: fetcher as unknown as typeof fetch,
    });

    expect(await client.getSetupState()).toEqual({
      initialized: false,
      databaseState: 'unclaimed',
    });
    expect(await client.getSetupState()).toEqual({
      initialized: true,
      settings: {
        schemaVersion: 1,
        dataMode: 'real',
        identityMode: 'identity',
        verticalId: 'robotics',
        projectId: 'prj-robots',
        enabledModules: ['system', 'pm-core'],
        initializedAt,
        updatedAt: initializedAt,
      },
    });
  });

  test('SETUP-WIZARD 刀③：setConfig PUT /api/setup/config（body 原样）；graduate POST /api/setup/graduate（无 body）', async () => {
    const calls: Array<[string, RequestInit | undefined]> = [];
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push([new URL(url, 'http://teamhub.local').pathname, init]);
      return { ok: true, status: 200, json: async () => ({ restarting: true }) } as Response;
    });
    const client = createHubApiClient({
      baseUrl: 'http://127.0.0.1:4177',
      fetcher: fetcher as unknown as typeof fetch,
    });

    const cfg = await client.setConfig({ identityMode: 'identity' });
    expect(cfg).toEqual({ restarting: true });
    const grad = await client.graduate();
    expect(grad).toEqual({ restarting: true });

    const putCall = calls.find(([p, i]) => p === '/api/setup/config' && i?.method === 'PUT');
    expect(putCall).toBeTruthy();
    expect(JSON.parse(String(putCall?.[1]?.body))).toEqual({ identityMode: 'identity' });

    const gradCall = calls.find(([p, i]) => p === '/api/setup/graduate' && i?.method === 'POST');
    expect(gradCall).toBeTruthy();
    // 无 body：不发请求体。
    expect(gradCall?.[1]?.body).toBeUndefined();
  });

  test('writeToken 正向：createTask + uploadArtifactFile 均带 Bearer 头', async () => {
    const capturedInits: RequestInit[] = [];
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      capturedInits.push(init ?? {});
      const path = new URL(url, 'http://teamhub.local').pathname;
      // uploadArtifactFile 走 /api/artifacts/:id/upload
      if (path.endsWith('/upload')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ artifact: governanceScenarioFixture.artifacts[0] }),
        } as Response;
      }
      return {
        ok: true,
        status: 201,
        json: async () => writeResponseByPath(path),
      } as Response;
    });

    const client = createHubApiClient({
      baseUrl: 'http://127.0.0.1:4177',
      fetcher: fetcher as unknown as typeof fetch,
      writeToken: 'tok-abc',
    });

    // JSON 写端点（sendJson 路径）
    await client.createTask({ title: 'bearer-test' } as unknown as CreateTaskRequest);
    const jsonInit = capturedInits[capturedInits.length - 1];
    expect((jsonInit.headers as Record<string, string>).authorization).toBe('Bearer tok-abc');

    // multipart 路径（postFormData 路径）：uploadArtifactFile
    const file = new File(['hello'], 'test.bin', { type: 'application/octet-stream' });
    await client.uploadArtifactFile('artifact-001', file);
    const formInit = capturedInits[capturedInits.length - 1];
    expect((formInit.headers as Record<string, string>).authorization).toBe('Bearer tok-abc');
  });

  test('writeToken 守卫：纯空白 token → 请求头无 authorization 键', async () => {
    const capturedInits: RequestInit[] = [];
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      capturedInits.push(init ?? {});
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
      writeToken: '  ',
    });

    await client.createTask({ title: 'no-token-test' } as unknown as CreateTaskRequest);
    const init = capturedInits[capturedInits.length - 1];
    const headers = init.headers as Record<string, string>;
    expect(headers).not.toHaveProperty('authorization');
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

  test('库存写侧：upsertPartType / recordPartAction POST 正确路径、带 body、解析响应（C6）', async () => {
    const fetcher = vi.fn(async (url: string, _init?: RequestInit) => {
      const path = new URL(url, 'http://teamhub.local').pathname;
      const body =
        path === '/api/inventory/part-types'
          ? { partType: inventoryScenarioFixture.partTypes[0] }
          : { action: inventoryScenarioFixture.actions[0] };
      return { ok: true, status: 201, json: async () => body } as Response;
    });

    const client = createHubApiClient({
      baseUrl: 'http://127.0.0.1:4177',
      fetcher: fetcher as unknown as typeof fetch,
    });

    // 新增/改零件类型：POST /api/inventory/part-types。client 不校验 body，只验 URL/method/body 透传 + 响应解析。
    const partReq = {
      projectId: 'prj-robots',
      partNumber: 'GM6020',
      name: 'GM6020 电机',
    } as unknown as CreatePartTypeRequest;
    const partRes = await client.upsertPartType(partReq);
    expect(partRes.partType.id).toBeTruthy();
    const partCall = fetcher.mock.calls.find(([u]) =>
      String(u).endsWith('/api/inventory/part-types'),
    );
    expect(partCall?.[1]?.method).toBe('POST');
    expect(JSON.parse(String(partCall?.[1]?.body))).toEqual(partReq);

    // 一句话快记/拆装：POST /api/inventory/actions。recordedBy 由 server 钉 source（C5）——请求体不带。
    const actionReq = {
      projectId: 'prj-robots',
      partTypeId: 'parttype-gm6020',
      kind: 'damage',
      quantityDelta: -1,
      note: '坏了一个 GM6020',
    } as unknown as CreatePartActionRequest;
    const actionRes = await client.recordPartAction(actionReq);
    expect(actionRes.action.id).toBeTruthy();
    // I0：action.recordedBy 只到 source、绝无 memberId 维度。
    expect(actionRes.action.recordedBy).not.toHaveProperty('memberId');
    const actionCall = fetcher.mock.calls.find(([u]) =>
      String(u).endsWith('/api/inventory/actions'),
    );
    expect(actionCall?.[1]?.method).toBe('POST');
    const sentBody = JSON.parse(String(actionCall?.[1]?.body));
    expect(sentBody).toEqual(actionReq);
    // C5：写侧不传 recordedBy（server 钉 source）。
    expect(sentBody).not.toHaveProperty('recordedBy');
  });

  test('uploadArtifactFile：构造 FormData、刻意不手设 content-type（浏览器掌 boundary）、命中 /upload（C7）', async () => {
    const capturedInits: RequestInit[] = [];
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
      capturedInits.push(init ?? {});
      return {
        ok: true,
        status: 200,
        json: async () => ({ artifact: governanceScenarioFixture.artifacts[0] }),
      } as Response;
    });

    const client = createHubApiClient({
      baseUrl: 'http://127.0.0.1:4177',
      fetcher: fetcher as unknown as typeof fetch,
    });

    const file = new File(['chassis-data'], 'chassis.pdf', { type: 'application/pdf' });
    const res = await client.uploadArtifactFile('artifact-gripper-v1', file);
    expect(res.artifact.id).toBeTruthy(); // 响应解析成功

    const call = fetcher.mock.calls.find(([u]) =>
      String(u).endsWith('/api/artifacts/artifact-gripper-v1/upload'),
    );
    expect(call).toBeTruthy();
    const init = call?.[1] as RequestInit;
    expect(init.method).toBe('POST');
    expect(init.body).toBeInstanceOf(FormData);
    // 关键契约：multipart 绝不手设 content-type——否则覆盖浏览器自带 boundary、后端解析失败。
    const headers = (init.headers ?? {}) as Record<string, string>;
    expect(headers['content-type']).toBeUndefined();
  });

  test('报账购买方 profile 与窄入库上下文走本域端点', async () => {
    const profile = {
      expectedPurchaserName: '哈尔滨工业大学',
      expectedPurchaserTaxNo: '12100000400000456B',
    };
    const fetcher = vi.fn(async (url: string, _init?: RequestInit) => {
      const path = new URL(url, 'http://teamhub.local').pathname;
      const body = path.endsWith('/stock-in-context')
        ? { partTypes: [], entries: [] }
        : { profile };
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    const client = createHubApiClient({
      baseUrl: 'http://127.0.0.1:4177',
      fetcher: fetcher as unknown as typeof fetch,
    });

    await expect(client.getReimburseProfile()).resolves.toEqual({ profile });
    await expect(client.getReimburseStockInContext()).resolves.toEqual({ partTypes: [], entries: [] });
    await expect(client.updateReimburseProfile(profile)).resolves.toEqual({ profile });

    expect(fetcher.mock.calls.map(([url]) => new URL(String(url)).pathname)).toEqual([
      '/api/reimburse/profile',
      '/api/reimburse/stock-in-context',
      '/api/reimburse/profile',
    ]);
    expect(fetcher.mock.calls[2]?.[1]?.method).toBe('PUT');
  });

  test('检查单 API 由独立 segment 组合并保持原端点', async () => {
    const actor = { id: 'member-1', displayName: '测试成员', source: 'console' as const };
    const pendingItem = {
      id: 'check-1',
      seasonBaselineId: 'baseline-1',
      title: '确认急停可用',
      anchorMilestoneId: 'gate-1',
      origin: 'iou' as const,
      status: 'pending' as const,
      createdAt: '2026-08-15T00:00:00.000Z',
    };
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      const path = new URL(url).pathname;
      const item = path.endsWith('/clear')
        ? { ...pendingItem, status: 'passed' as const, clearedBy: actor }
        : path.endsWith('/waive')
          ? {
              ...pendingItem,
              status: 'waived' as const,
              waivedBy: actor,
              waiveReason: '书面豁免',
            }
          : pendingItem;
      const body = init?.method === undefined ? { items: [pendingItem] } : { item };
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    const client = createHubApiClient({
      baseUrl: 'http://127.0.0.1:4177',
      fetcher: fetcher as unknown as typeof fetch,
    });

    await expect(client.getChecklist('season 1')).resolves.toEqual({ items: [pendingItem] });
    await client.createChecklistItem('season 1', {
      title: pendingItem.title,
      anchorMilestoneId: 'gate-1',
      origin: 'iou',
    });
    await client.clearChecklistItem('check/1', 'season 1', { clearedBy: actor });
    await client.waiveChecklistItem('check/1', 'season 1', {
      waivedBy: actor,
      waiveReason: '书面豁免',
    });

    expect(fetcher.mock.calls.map(([url]) => String(url))).toEqual([
      'http://127.0.0.1:4177/api/checklist?seasonId=season%201',
      'http://127.0.0.1:4177/api/checklist?seasonId=season%201',
      'http://127.0.0.1:4177/api/checklist/check%2F1/clear?seasonId=season%201',
      'http://127.0.0.1:4177/api/checklist/check%2F1/waive?seasonId=season%201',
    ]);
  });
});

// R1 接力画布：GET 空板；PATCH/POST 回完整 session/handoff（schema parse 时自动剥 confirmedBy）。
// A2：POST /api/resource-sessions 回 {session}；DELETE /api/resource-sessions/:id 回 {deleted}。
function relayResponseByPath(path: string, method?: string): unknown {
  if (path === '/api/relay') return { stages: [], handoffs: [] };
  if (path === '/api/resource-sessions') {
    return { session: scheduleScenarioFixture.resourceSessions[0] };
  }
  if (path.startsWith('/api/resource-sessions/')) {
    // PATCH 受限编辑回 {session}；DELETE 删一棒回 {deleted}。
    if (method === 'DELETE') return { deleted: path.split('/').pop() };
    return { session: scheduleScenarioFixture.resourceSessions[0] };
  }
  if (path.startsWith('/api/relay-handoffs/')) {
    return { deleted: path.split('/').pop() };
  }
  if (path === '/api/relay-handoffs') {
    return {
      handoff: {
        id: 'ho-1',
        projectId: 'proj-1',
        windowLabel: '今晚',
        fromSessionId: 'sess-1',
        toSessionId: 'sess-2',
        source: 'console',
        confirmedBy: null,
        createdAt: '2026-06-06T00:00:00.000Z',
      },
    };
  }
  return { detail: 'Not found' };
}

// R3 车管理：POST /api/resources 回 {resource}；PATCH /api/resources/:id/status 回 {resource}。
function resourceWriteResponseByPath(path: string): unknown {
  if (path.startsWith('/api/resources/') && path.endsWith('/status')) {
    return { resource: scheduleScenarioFixture.resources[1] };
  }
  if (path === '/api/resources') {
    return { resource: scheduleScenarioFixture.resources[0] };
  }
  return { detail: 'Not found' };
}

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
