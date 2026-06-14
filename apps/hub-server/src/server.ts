import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import {
  AdapterCapabilitiesResponseSchema,
  AdaptersResponseSchema,
  AdapterHealthResponseSchema,
  AdapterInvokeRequestSchema,
  AdapterInvokeResponseSchema,
  ArtifactsResponseSchema,
  BridgeMembersResponseSchema,
  DepGraphSchema,
  GitReposResponseSchema,
  GOVERNANCE_SCENARIO_NOW,
  HealthResponseSchema,
  HubEventsResponseSchema,
  SystemStatusResponseSchema,
  toDepGraphView,
  apiContractFixtures,
} from './contracts.js';
import { FixedClock } from './clock.js';
import type { Clock } from './clock.js';
import { InMemoryGovStore } from './store/mock-gov-store.js';
import type { GovStore, InvStore, KbStore } from './store/gov-store.js';
import { listMockAdapters } from './mock-adapters.js';
import {
  getMockAiAdapterCapabilities,
  getMockAiAdapterHealth,
  invokeMockAiAdapter,
  isMockAiAdapterId,
} from './mock-ai-adapters.js';
import {
  buildHealthResponse,
  buildSystemStatusResponse,
} from './status.js';
import { tryServeStaticConsole } from './static-console.js';

export interface BuildHubServerOptions {
  consoleDistDir?: string;
  /** 治理读取出入口（默认 InMemoryGovStore，seed 真实锚点场景 fixtures）。可注入 SqliteGovStore 切持久层。 */
  store?: GovStore;
  /**
   * 派生快照求值时刻。mock-first 阶段默认钉在 fixture 场景时间 GOVERNANCE_SCENARIO_NOW，
   * 让 real 模式 /api/dep-graph 与 hub-console mock 同口径；真实数据接入后注入 RealClock。
   */
  clock?: Clock;
  /**
   * 战队知识库相似检索语料读出入口（KB-CORE）。**base 收口刀对抗核实修正已兑现**：相似检索语料
   * （IssueCard/ErrorEntry/ArchiveDocument）不在 GovernanceSnapshot 内，故 kbStore 由 GovStore 收窄为
   * 独立 `KbStore`（getKbSnapshot；见 store/gov-store.ts）。结案派生 KnowledgeNode 那半仍走 `store`
   * （GovStore.closeoutKbNode，复用同一 GovernanceSnapshot）。缺省 InMemoryKbStore(seed kbScenarioFixture)，
   * 由 `GET /api/kb/similar` 消费（见下方路由）。
   */
  kbStore?: KbStore;
  /**
   * 库存 / BOM 读写出入口扩展点（reserved，D-042 决策 4）。INV 是唯一需扩 schema 的支柱（PartStock 不在
   * GovernanceSnapshot 内），故走独立 `InvStore` 而非复用 GovStore。本刀只钉扩展点、不建 PartStock；
   * 缺省 undefined，INV 支柱落地时注入实现 InvStore 的实例（对话记账 / 盘点 / 缺口汇报）。
   */
  invStore?: InvStore;
}

export function buildHubServer(options: BuildHubServerOptions = {}): FastifyInstance {
  const app = Fastify({ logger: false });
  const store: GovStore = options.store ?? new InMemoryGovStore();
  const clock: Clock =
    options.clock ?? new FixedClock(new Date(GOVERNANCE_SCENARIO_NOW));
  // kbStore/invStore 本刀只钉 options 字段、不在此 body 解析 = 路由后置（C3 不一把梭，非遗漏）：
  // 当前无消费方，解析无处可去；KB-CORE/INV 路由落地时各自 `options.kbStore ?? store` / 透传 options.invStore，
  // 只在 body 加解析行、签名不变，不迫使重切 base。

  app.get('/health', async () => {
    return HealthResponseSchema.parse(buildHealthResponse());
  });

  app.get('/api/system/status', async () => {
    const adapters = listMockAdapters();
    return SystemStatusResponseSchema.parse(
      buildSystemStatusResponse(adapters),
    );
  });

  app.get('/api/adapters', async () => {
    return AdaptersResponseSchema.parse({ adapters: listMockAdapters() });
  });

  app.get('/api/adapters/:adapterId/health', async (request, reply) => {
    const { adapterId } = request.params as { adapterId: string };
    if (!isMockAiAdapterId(adapterId)) {
      void reply.code(404).send({ detail: 'Adapter not found' });
      return;
    }
    return AdapterHealthResponseSchema.parse(getMockAiAdapterHealth(adapterId));
  });

  app.get('/api/adapters/:adapterId/capabilities', async (request, reply) => {
    const { adapterId } = request.params as { adapterId: string };
    if (!isMockAiAdapterId(adapterId)) {
      void reply.code(404).send({ detail: 'Adapter not found' });
      return;
    }
    return AdapterCapabilitiesResponseSchema.parse(
      getMockAiAdapterCapabilities(adapterId),
    );
  });

  app.post('/api/adapters/:adapterId/invoke', async (request, reply) => {
    const { adapterId } = request.params as { adapterId: string };
    if (!isMockAiAdapterId(adapterId)) {
      void reply.code(404).send({ detail: 'Adapter not found' });
      return;
    }
    const invokeRequest = AdapterInvokeRequestSchema.parse(request.body ?? {});
    return AdapterInvokeResponseSchema.parse(
      invokeMockAiAdapter(adapterId, invokeRequest),
    );
  });

  app.get('/api/events', async () => {
    return HubEventsResponseSchema.parse(apiContractFixtures.events);
  });

  app.get('/api/bridge/members', async () => {
    return BridgeMembersResponseSchema.parse(apiContractFixtures.bridgeMembers);
  });

  app.get('/api/git/repos', async () => {
    return GitReposResponseSchema.parse(apiContractFixtures.gitRepos);
  });

  app.get('/api/artifacts', async () => {
    return ArtifactsResponseSchema.parse(apiContractFixtures.artifacts);
  });

  // 依赖链 · 阻塞归因视图：治理快照经纯函数 toDepGraphView 实时派生（D-040 首任务收敛）。
  // 解 hub-console real 模式 GET /api/dep-graph 的 404；输出主键为 task/group/dependency，无 memberId 维度（C2）。
  app.get('/api/dep-graph', async () => {
    const snapshot = await store.getSnapshot();
    return DepGraphSchema.parse(toDepGraphView(snapshot, clock.now().toISOString()));
  });

  app.setNotFoundHandler(async (request, reply) => {
    if (await tryServeStaticConsole(request, reply, options.consoleDistDir)) {
      return;
    }

    void reply.code(404).send({ detail: 'Not found' });
  });

  return app;
}
