import { afterAll, describe, expect, test } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildHubServer } from '../src/server.js';
import { InMemoryGovStore } from '../src/store/mock-gov-store.js';
import { governanceScenarioFixture } from '@teamhub/hub-contracts';
import type { GovernanceSnapshot } from '@teamhub/hub-contracts';
import {
  AgentBackendCapabilitiesResponseSchema,
  AgentBackendHealthResponseSchema,
  AgentBackendInvokeResponseSchema,
  AgentBackendsResponseSchema,
  ArtifactsResponseSchema,
  BotChannelsResponseSchema,
  BridgeMembersResponseSchema,
  DataSourcesResponseSchema,
  GitReposResponseSchema,
  HealthResponseSchema,
  HubEventsResponseSchema,
  SeasonsResponseSchema,
  SystemStatusResponseSchema,
} from '@teamhub/hub-contracts';

const app = buildHubServer();

afterAll(async () => {
  await app.close();
});

describe('hub-server routes', () => {
  test('GET /health returns the health contract', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);
    const body = HealthResponseSchema.parse(response.json());
    expect(body.status).toBe('ok');
    expect(body.service).toBe('teamhub-hub-server');
  });

  test('GET /api/system/status summarizes mock agent backends', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/system/status',
    });

    expect(response.statusCode).toBe(200);
    const body = SystemStatusResponseSchema.parse(response.json());
    expect(body.mode).toBe('mock-first');
    expect(body.adapters.total).toBeGreaterThanOrEqual(3);
    expect(body.adapters.unconfigured).toBeGreaterThan(0);
    // 缺省（无 deployment option）→ 不带 deployment 字段（旧客户端零影响）。
    expect(body.deployment).toBeUndefined();
  });

  test('GET /api/system/status echoes deployment (file/memory 两形态)', async () => {
    // K3 部署信息回显：落盘域带 path、内存域省 path；identityMode / 启用模块 / 图纸开关 / 构建标识齐备。
    const deployApp = buildHubServer({
      deployment: {
        dataMode: 'real',
        identityMode: 'identity',
        storage: [
          { domain: 'gov', backend: 'file', path: '/data/gov.json' },
          { domain: 'kb', backend: 'memory' },
        ],
        enabledModules: ['system', 'pm-core'],
        artifactUploadEnabled: false,
        buildId: 'test-build-1',
      },
    });
    try {
      const response = await deployApp.inject({
        method: 'GET',
        url: '/api/system/status',
      });
      expect(response.statusCode).toBe(200);
      const body = SystemStatusResponseSchema.parse(response.json());
      expect(body.deployment).toBeDefined();
      expect(body.deployment?.dataMode).toBe('real');
      expect(body.deployment?.identityMode).toBe('identity');
      // 落盘形态：带路径。
      expect(body.deployment?.storage[0]).toEqual({
        domain: 'gov',
        backend: 'file',
        path: '/data/gov.json',
      });
      // 内存形态：无 path 字段（JSON 里被丢）。
      expect(body.deployment?.storage[1]).toEqual({ domain: 'kb', backend: 'memory' });
      expect(body.deployment?.artifactUploadEnabled).toBe(false);
      expect(body.deployment?.buildId).toBe('test-build-1');
    } finally {
      await deployApp.close();
    }
  });

  test('GET /api/bot-channels returns mock bot channels', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/bot-channels',
    });

    expect(response.statusCode).toBe(200);
    const body = BotChannelsResponseSchema.parse(response.json());
    expect(body.botChannels.map((channel) => channel.id)).toEqual(
      expect.arrayContaining(['feishu', 'wechat', 'qq']),
    );
  });

  test('GET /api/agent-backends returns mock agent backends (no xiaolongxia/pf-skills)', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/agent-backends',
    });

    expect(response.statusCode).toBe(200);
    const body = AgentBackendsResponseSchema.parse(response.json());
    const ids = body.agentBackends.map((backend) => backend.id);
    expect(ids).toEqual(
      expect.arrayContaining(['hermes', 'openclaw', 'claude-code']),
    );
    expect(ids).not.toContain('xiaolongxia');
    expect(ids).not.toContain('pf-skills');
  });

  test('GET /api/data-sources returns mock data sources', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/data-sources',
    });

    expect(response.statusCode).toBe(200);
    const body = DataSourcesResponseSchema.parse(response.json());
    expect(body.dataSources.map((source) => source.id)).toEqual(
      expect.arrayContaining(['git-forge', 'artifact-store']),
    );
  });

  test('GET /api/agent-backends/:id/health returns mock health', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/agent-backends/hermes/health',
    });

    expect(response.statusCode).toBe(200);
    const body = AgentBackendHealthResponseSchema.parse(response.json());
    expect(body.backendId).toBe('hermes');
    expect(body.status).toBe('unconfigured');
    expect(body.detail).toContain('mock agent backend');
  });

  test('GET /api/agent-backends/:id/capabilities returns mock capabilities', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/agent-backends/claude-code/capabilities',
    });

    expect(response.statusCode).toBe(200);
    const body = AgentBackendCapabilitiesResponseSchema.parse(response.json());
    expect(body.backendId).toBe('claude-code');
    expect(body.mode).toBe('mock');
    expect(body.capabilities).toEqual(
      expect.arrayContaining(['skill.invoke.stub']),
    );
  });

  test('POST /api/agent-backends/:id/invoke returns a mock invocation response', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/agent-backends/openclaw/invoke',
      payload: {
        correlationId: 'corr-backend-001',
        input: {
          symptom: 'auto aim drifts',
        },
      },
    });

    expect(response.statusCode).toBe(200);
    const body = AgentBackendInvokeResponseSchema.parse(response.json());
    expect(body).toMatchObject({
      backendId: 'openclaw',
      mode: 'mock',
      status: 'accepted',
      correlationId: 'corr-backend-001',
    });
    expect(body.output.message).toContain('mock agent backend');
    expect(body.output.inputEcho).toMatchObject({
      symptom: 'auto aim drifts',
    });
  });

  test('POST /api/agent-backends/:id/invoke rejects a bad body with 400 (M8: safeParse not throwing parse)', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/agent-backends/openclaw/invoke',
      // correlationId 是 z.string().min(1).optional() → 空串非法。修前 .parse 抛 ZodError → Fastify 500；
      // 修后 safeParse → 400（与其余 POST 路由一致），不泄漏 Zod 内部、不破坏错误契约。
      payload: { correlationId: '' },
    });

    expect(response.statusCode).toBe(400);
    expect(typeof response.json().detail).toBe('string');
  });

  test('agent backend endpoints reject non-backend ids', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/agent-backends/feishu/health',
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ detail: 'Agent backend not found' });
  });

  test('GET /api/events returns mock-first event fixtures', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/events',
    });

    expect(response.statusCode).toBe(200);
    const body = HubEventsResponseSchema.parse(response.json());
    expect(body.events.length).toBeGreaterThan(0);
  });

  test('GET /api/bridge/members returns mock-first bridge fixtures', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/bridge/members',
    });

    expect(response.statusCode).toBe(200);
    const body = BridgeMembersResponseSchema.parse(response.json());
    expect(body.members.length).toBeGreaterThan(0);
  });

  test('GET /api/git/repos returns mock-first repo fixtures', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/git/repos',
    });

    expect(response.statusCode).toBe(200);
    const body = GitReposResponseSchema.parse(response.json());
    expect(body.repos.length).toBeGreaterThan(0);
  });

  test('GET /api/artifacts returns the snapshot artifact version log', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/artifacts',
    });

    expect(response.statusCode).toBe(200);
    const body = ArtifactsResponseSchema.parse(response.json());
    expect(body.artifacts.length).toBeGreaterThan(0);
  });

  // ① 硬化：证明 GET /api/artifacts 的响应确由 store 快照派生（非硬编码 fixture）。
  // 注入一个自定义 snapshot（含一条独特 id/mechanism 的图纸日志），断言响应原样回出注入值。
  test('GET /api/artifacts is derived from the injected store snapshot', async () => {
    const custom: GovernanceSnapshot = {
      ...governanceScenarioFixture,
      artifacts: [
        {
          id: 'art-probe-xyz',
          kind: 'firmware',
          name: 'probe',
          uri: 'artifact://probe',
          mechanism: 'PROBE-MECH',
          revision: 'vTEST',
          submittedVia: 'console',
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    };
    const app2 = buildHubServer({ store: new InMemoryGovStore(custom) });
    try {
      const response = await app2.inject({
        method: 'GET',
        url: '/api/artifacts',
      });
      expect(response.statusCode).toBe(200);
      const body = ArtifactsResponseSchema.parse(response.json());
      // 响应须包含注入的那条记录的 id 与 mechanism（证明派生自 store，而非固定 fixture）。
      const probe = body.artifacts.find((a) => a.id === 'art-probe-xyz');
      expect(probe).toBeDefined();
      expect(probe?.mechanism).toBe('PROBE-MECH');
      // 注入快照只放了一条 → 响应也只有这一条（进一步排除掺入默认种子的可能）。
      expect(body.artifacts).toHaveLength(1);
    } finally {
      await app2.close();
    }
  });

  // S1 接线（product-redefine-2026-07 §4.1/§9-①）：GET /api/seasons 照 GET /api/artifacts 先例，
  // 直读快照 seasons 数组。SeasonSchema 此前是死脚手架，本测证它已真正接线（非空、形状合法）。
  test('GET /api/seasons returns the snapshot season list', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/seasons',
    });

    expect(response.statusCode).toBe(200);
    const body = SeasonsResponseSchema.parse(response.json());
    expect(body.seasons.length).toBeGreaterThan(0);
    expect(body.seasons[0]!.status).toBe('active');
  });

  // 硬化：证明响应确由 store 快照派生（非硬编码 fixture），镜像上方 GET /api/artifacts 硬化测试。
  test('GET /api/seasons is derived from the injected store snapshot', async () => {
    const custom: GovernanceSnapshot = {
      ...governanceScenarioFixture,
      seasons: [
        { id: 'season-probe', name: '探针赛季', startsAt: '2026-01-01T00:00:00.000Z', endsAt: null, status: 'active' },
      ],
    };
    const app2 = buildHubServer({ store: new InMemoryGovStore(custom) });
    try {
      const response = await app2.inject({
        method: 'GET',
        url: '/api/seasons',
      });
      expect(response.statusCode).toBe(200);
      const body = SeasonsResponseSchema.parse(response.json());
      expect(body.seasons).toHaveLength(1);
      expect(body.seasons[0]!.id).toBe('season-probe');
    } finally {
      await app2.close();
    }
  });

  // 图纸档案 v2（HUB-ARTIFACT-ARCHIVE-V2）：POST round-trip 证 server 派生 versionNo/revision/kind。
  // 用空 artifacts 的注入 store 隔离自增起点（不被 seed 的同键记录干扰），每个断言独立可读。
  describe('POST /api/artifacts (v2 server-derived versionNo/kind/revision)', () => {
    const emptyArtifacts: GovernanceSnapshot = {
      ...governanceScenarioFixture,
      artifacts: [],
    };

    test('同键 POST 两条 → versionNo 1 then 2、revision v1 then v2、kind report（机械）', async () => {
      const app2 = buildHubServer({ store: new InMemoryGovStore(emptyArtifacts) });
      try {
        const mech = {
          ownerGroup: 'mechanical',
          season: '25',
          robotCode: 'R1',
          mechanism: '底盘',
          name: '底盘图纸',
          uri: 'artifact://drawings/chassis',
        };
        const first = await app2.inject({ method: 'POST', url: '/api/artifacts', payload: mech });
        expect(first.statusCode).toBe(201);
        const a1 = first.json().artifact;
        expect(a1.versionNo).toBe(1);
        expect(a1.revision).toBe('v1');
        expect(a1.kind).toBe('report');
        expect(a1.submittedVia).toBe('console'); // store 钉来源 seam（C5）
        // 机械不带 subType（路由剥掉 / superRefine 已禁）
        expect(a1.subType).toBeUndefined();

        const second = await app2.inject({ method: 'POST', url: '/api/artifacts', payload: mech });
        expect(second.statusCode).toBe(201);
        const a2 = second.json().artifact;
        expect(a2.versionNo).toBe(2);
        expect(a2.revision).toBe('v2');
      } finally {
        await app2.close();
      }
    });

    test('电路驱动 POST → kind firmware', async () => {
      const app2 = buildHubServer({ store: new InMemoryGovStore(emptyArtifacts) });
      try {
        const res = await app2.inject({
          method: 'POST',
          url: '/api/artifacts',
          payload: {
            ownerGroup: 'electrical',
            season: '25',
            robotCode: 'R1',
            mechanism: '电控板',
            subType: 'driver',
            name: '电机驱动固件',
            uri: 'artifact://firmware/motor',
            relatedRepo: 'team/firmware',
            relatedCommit: 'abc1234',
          },
        });
        expect(res.statusCode).toBe(201);
        const art = res.json().artifact;
        expect(art.kind).toBe('firmware');
        expect(art.subType).toBe('driver');
        expect(art.versionNo).toBe(1);
        expect(art.revision).toBe('v1');
      } finally {
        await app2.close();
      }
    });

    test('电路图纸 POST → kind report', async () => {
      const app2 = buildHubServer({ store: new InMemoryGovStore(emptyArtifacts) });
      try {
        const res = await app2.inject({
          method: 'POST',
          url: '/api/artifacts',
          payload: {
            ownerGroup: 'electrical',
            season: '25',
            robotCode: 'R1',
            mechanism: '电控板',
            subType: 'drawing',
            name: '电路原理图',
            uri: 'artifact://drawings/schematic',
          },
        });
        expect(res.statusCode).toBe(201);
        expect(res.json().artifact.kind).toBe('report');
      } finally {
        await app2.close();
      }
    });

    test('缺 subType 的 electrical → 400（superRefine）', async () => {
      const app2 = buildHubServer({ store: new InMemoryGovStore(emptyArtifacts) });
      try {
        const res = await app2.inject({
          method: 'POST',
          url: '/api/artifacts',
          payload: {
            ownerGroup: 'electrical',
            season: '25',
            robotCode: 'R1',
            mechanism: '电控板',
            name: '少了 subType',
            uri: 'artifact://x',
          },
        });
        expect(res.statusCode).toBe(400);
        expect(typeof res.json().detail).toBe('string');
      } finally {
        await app2.close();
      }
    });

    test('机械夹带 subType → 400（superRefine）', async () => {
      const app2 = buildHubServer({ store: new InMemoryGovStore(emptyArtifacts) });
      try {
        const res = await app2.inject({
          method: 'POST',
          url: '/api/artifacts',
          payload: {
            ownerGroup: 'mechanical',
            season: '25',
            robotCode: 'R1',
            mechanism: '底盘',
            subType: 'drawing',
            name: '机械不该有 subType',
            uri: 'artifact://x',
          },
        });
        expect(res.statusCode).toBe(400);
        expect(typeof res.json().detail).toBe('string');
      } finally {
        await app2.close();
      }
    });
  });

  test('unknown routes return the standard error body', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/missing',
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ detail: 'Not found' });
  });
});

describe('hub-server static console', () => {
  test('serves built console assets when a dist directory is configured', async () => {
    const consoleDistDir = await mkdtemp(path.join(tmpdir(), 'teamhub-console-'));
    await mkdir(path.join(consoleDistDir, 'assets'));
    await writeFile(
      path.join(consoleDistDir, 'index.html'),
      '<!doctype html><div id="root"></div>',
    );
    await writeFile(
      path.join(consoleDistDir, 'assets', 'index.js'),
      'console.log("teamhub");',
    );
    await writeFile(
      path.join(consoleDistDir, 'assets', 'pdf.worker.min.mjs'),
      'self.postMessage("worker");',
    );

    const staticApp = buildHubServer({ consoleDistDir });
    try {
      const root = await staticApp.inject({ method: 'GET', url: '/' });
      expect(root.statusCode).toBe(200);
      expect(root.headers['content-type']).toContain('text/html');
      expect(root.body).toContain('id="root"');

      const asset = await staticApp.inject({
        method: 'GET',
        url: '/assets/index.js',
      });
      expect(asset.statusCode).toBe(200);
      expect(asset.headers['cache-control']).toContain('immutable');
      expect(asset.body).toContain('teamhub');

      // .mjs worker 必须以 JS MIME 伺服——浏览器对 module script 强制 MIME 检查，
      // octet-stream 会让 pdf.js worker 加载失败（发票 PDF 本地解析全灭的直接原因）。
      const mjsWorker = await staticApp.inject({
        method: 'GET',
        url: '/assets/pdf.worker.min.mjs',
      });
      expect(mjsWorker.statusCode).toBe(200);
      expect(mjsWorker.headers['content-type']).toContain('text/javascript');

      const spaFallback = await staticApp.inject({
        method: 'GET',
        url: '/bridge',
      });
      expect(spaFallback.statusCode).toBe(200);
      expect(spaFallback.body).toContain('id="root"');

      const missingApi = await staticApp.inject({
        method: 'GET',
        url: '/api/missing',
      });
      expect(missingApi.statusCode).toBe(404);
      expect(missingApi.json()).toEqual({ detail: 'Not found' });
    } finally {
      await staticApp.close();
      await rm(consoleDistDir, { force: true, recursive: true });
    }
  });
});
