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
  KB_SIMILAR_NOTE,
  KbCloseoutRequestSchema,
  KbCloseoutResponseSchema,
  KbSimilarQuerySchema,
  KbSimilarResponseSchema,
  CreateTaskRequestSchema,
  CreateTaskResponseSchema,
  CreateDependencyRequestSchema,
  CreateDependencyResponseSchema,
  CreateNeedRequestSchema,
  CreateNeedResponseSchema,
  TasksResponseSchema,
  SystemStatusResponseSchema,
  buildCloseoutFromIssue,
  rankSimilarIssues,
  toDepGraphView,
  apiContractFixtures,
} from './contracts.js';
import type { IssueCard } from '@teamhub/hub-contracts';
import { FixedClock } from './clock.js';
import type { Clock } from './clock.js';
import { InMemoryGovStore } from './store/mock-gov-store.js';
import { InMemoryKbStore } from './store/mock-kb-store.js';
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

/**
 * 由结案时刻 + issue.id 确定性派生 `DBG-YYYYMMDD-NNN` 错误码（不引入 Math.random，可单测复现）。
 * NNN = issue.id 简单哈希 mod 1000；同一 issue 同一天稳定。
 */
function deriveErrorCode(now: string, issueId: string): string {
  const datePart = now.slice(0, 10).replace(/-/g, '');
  let hash = 0;
  for (const ch of issueId) hash = (hash * 31 + ch.charCodeAt(0)) % 1000;
  return `DBG-${datePart}-${String(hash).padStart(3, '0')}`;
}

export function buildHubServer(options: BuildHubServerOptions = {}): FastifyInstance {
  const app = Fastify({ logger: false });
  const store: GovStore = options.store ?? new InMemoryGovStore();
  const clock: Clock =
    options.clock ?? new FixedClock(new Date(GOVERNANCE_SCENARIO_NOW));
  // KB-CORE：知识库相似检索语料读出入口（缺省 InMemoryKbStore seed kbScenarioFixture），由 GET /api/kb/similar 消费。
  // invStore 仍只钉 options 字段、无消费方（INV 支柱落地时透传），符合 base 收口刀「扩展点先行、路由后置」节奏。
  const kbStore: KbStore = options.kbStore ?? new InMemoryKbStore();

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

  // PM 项目计划表：单条任务录入（C1 兜底录入口）。server 补 id/时间戳/派生默认（status=pending/statusSource=console）。
  // 卡住原因走人建 Dependency 边由 toDepGraphView 派生（G2 不在 Task 上另存 blockedBy）；不引入 dueDate（G4）。
  app.post('/api/tasks', async (request, reply) => {
    const parsed = CreateTaskRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      void reply.code(400).send({ detail: parsed.error.issues[0]?.message ?? 'invalid body' });
      return;
    }
    const task = await store.createTask(parsed.data);
    void reply.code(201);
    return CreateTaskResponseSchema.parse({ task });
  });

  // PM 读视图：任务列表（看板列 / 列表双视图的读原语）。Task 无 confirmedBy、ownerId 只表「谁负责」(D-041 安全堆)，
  // 无完成量维度（C2/I0 安全）；依赖/缺口的结构视图走 GET /api/dep-graph（blockedByLabel 上游任务名，不暴露人）。
  app.get('/api/tasks', async () => {
    const snapshot = await store.getSnapshot();
    return TasksResponseSchema.parse({ tasks: snapshot.tasks });
  });

  // PM 依赖边录入（人手建有向边）。server clamp status=active（D-042 初始态）；confirmedBy 内部凭证不经读视图暴露。
  app.post('/api/dependencies', async (request, reply) => {
    const parsed = CreateDependencyRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      void reply.code(400).send({ detail: parsed.error.issues[0]?.message ?? 'invalid body' });
      return;
    }
    const dependency = await store.createDependency(parsed.data);
    void reply.code(201);
    return CreateDependencyResponseSchema.parse({ dependency });
  });

  // PM 前置需求录入（G3 一等公民）。server clamp status=open；A1 缺口归组不归人。
  app.post('/api/needs', async (request, reply) => {
    const parsed = CreateNeedRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      void reply.code(400).send({ detail: parsed.error.issues[0]?.message ?? 'invalid body' });
      return;
    }
    const need = await store.createNeed(parsed.data);
    void reply.code(201);
    return CreateNeedResponseSchema.parse({ need });
  });

  // KB-CORE：症状 → top-N 相似历史 bug（跨赛季同类 bug 召回）。纯函数 rankSimilarIssues 在 KbStore 语料上排序。
  // A4 护栏：响应 note 明示「只列候选、不断言同因、由人选用」；返回主键是 issue/errorCode，无人维度（C2）。
  app.get('/api/kb/similar', async (request, reply) => {
    const parsed = KbSimilarQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) {
      void reply.code(400).send({ detail: parsed.error.issues[0]?.message ?? 'invalid query' });
      return;
    }
    const { symptom, tags, projectId, limit, minScore } = parsed.data;
    const kb = await kbStore.getKbSnapshot();
    const now = clock.now().toISOString();
    // 用症状构造一张「当前问题卡」喂排序纯函数；id 不与历史撞、projectId 默认对齐语料库
    const currentIssue: IssueCard = {
      id: 'iss-probe',
      projectId: projectId ?? kb.projectId,
      title: symptom,
      rawInput: symptom,
      normalizedSummary: symptom,
      symptomSummary: symptom,
      suspectedDirections: [],
      suggestedActions: [],
      status: 'open',
      severity: 'medium',
      tags,
      relatedFiles: [],
      relatedCommits: [],
      relatedHistoricalIssueIds: [],
      createdAt: now,
      updatedAt: now,
    };
    const items = rankSimilarIssues({
      currentIssue,
      issues: kb.issueCards,
      errorEntries: kb.errorEntries,
      archives: kb.archiveDocuments,
      limit,
      minScore,
    });
    return KbSimilarResponseSchema.parse({
      query: { symptom, tags },
      items,
      note: KB_SIMILAR_NOTE,
    });
  });

  // KB-CORE：结案闭环（用着就沉淀）。结案输入 → 归档 + 错误表 + 已归档卡 + 结案派生 KnowledgeNode（持久到 store）。
  // I0：errorCode/id 由 clock + issue.id 确定性派生（不记结案人）；派生节点无人维度，来源凭证是结构。
  app.post('/api/kb/closeout', async (request, reply) => {
    const parsed = KbCloseoutRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      void reply.code(400).send({ detail: parsed.error.issues[0]?.message ?? 'invalid body' });
      return;
    }
    const { issue, records, category, rootCause, resolution, prevention, generatedBy } =
      parsed.data;
    const now = clock.now().toISOString();
    const result = buildCloseoutFromIssue(
      issue,
      records,
      { category, rootCause, resolution, prevention },
      {
        now,
        errorEntryId: `err-${issue.id}`,
        errorCode: deriveErrorCode(now, issue.id),
        generatedBy,
      },
    );
    if (!result.ok) {
      // 结案校验失败（如缺 rootCause / 卡已归档）→ 422，不伪造完成（§10）
      void reply.code(422).send({ detail: result.reason });
      return;
    }
    // 结案派生知识节点持久到治理快照（复用同一 GovernanceSnapshot，对抗核实确认成立）
    const knowledgeNode = await store.closeoutKbNode(result.knowledgeNodeDraft);
    return KbCloseoutResponseSchema.parse({
      archiveDocument: result.archiveDocument,
      errorEntry: result.errorEntry,
      updatedIssueCard: result.updatedIssueCard,
      knowledgeNode,
    });
  });

  app.setNotFoundHandler(async (request, reply) => {
    if (await tryServeStaticConsole(request, reply, options.consoleDistDir)) {
      return;
    }

    void reply.code(404).send({ detail: 'Not found' });
  });

  return app;
}
