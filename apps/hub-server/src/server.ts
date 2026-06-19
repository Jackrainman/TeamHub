import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { readFile, readdir } from 'node:fs/promises';
import { extname, isAbsolute, join, relative } from 'node:path';
import {
  AgentBackendCapabilitiesResponseSchema,
  AgentBackendHealthResponseSchema,
  AgentBackendInvokeRequestSchema,
  AgentBackendInvokeResponseSchema,
  AgentBackendsResponseSchema,
  ArtifactsResponseSchema,
  BotChannelsResponseSchema,
  DataSourcesResponseSchema,
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
  TransitionTaskStatusRequestSchema,
  TransitionTaskStatusResponseSchema,
  WaiveDependencyResponseSchema,
  CreateArtifactRequestSchema,
  CreateArtifactResponseSchema,
  nextArtifactVersionNo,
  deriveArtifactKind,
  TasksResponseSchema,
  SystemStatusResponseSchema,
  buildCloseoutFromIssue,
  rankSimilarIssues,
  toDepGraphView,
  wouldCreateCycle,
  GroupGapsResponseSchema,
  deriveDirectionGaps,
  derivePresenceSchedule,
  PresenceScheduleResponseSchema,
  ResourceSessionsResponseSchema,
  SharedResourcesResponseSchema,
  CreateResourceSessionRequestSchema,
  CreateResourceSessionResponseSchema,
  deriveInventoryLedger,
  deriveShortfalls,
  InvalidPartActionError,
  IDLE_HOLDER,
  InventoryResponseSchema,
  CreatePartTypeRequestSchema,
  CreatePartTypeResponseSchema,
  CreatePartActionRequestSchema,
  CreatePartActionResponseSchema,
  ScheduleQuerySchema,
  apiContractFixtures,
} from './contracts.js';
import type { IssueCard, ScheduleSnapshot } from '@teamhub/hub-contracts';
import { deriveErrorCode } from './kb/error-code.js';
import { FixedClock } from './clock.js';
import type { Clock } from './clock.js';
import { InMemoryGovStore } from './store/mock-gov-store.js';
import { InMemoryKbStore } from './store/mock-kb-store.js';
import { InMemoryInvStore } from './store/mock-inv-store.js';
import type { GovStore, InvStore, KbStore } from './store/gov-store.js';
import {
  listMockAgentBackends,
  listMockBotChannels,
  listMockDataSources,
} from './mock-integrations.js';
import {
  getMockAgentBackendCapabilities,
  getMockAgentBackendHealth,
  invokeMockAgentBackend,
  isMockAgentBackendId,
} from './mock-agent-backends.js';
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
  /**
   * H3（AUDIT-FIXES 部署前必修）：写端点共享密钥。配了则所有 `POST /api/*` 须带 `Authorization: Bearer <token>`；
   * 未配则放行（loopback dev 默认）。非 loopback 暴露**必须**配（main.ts 拒绝裸暴露）。
   */
  writeToken?: string;
  /** H3：写端点每 IP 固定窗口限流（默认 120 次 / 60s）。测试可调小触发 429。 */
  writeRateLimit?: { max: number; windowMs: number };
  /**
   * 反代信任。默认 false（request.ip = 直连源）。在文档化的单端口 4177 反代 / SSH 隧道部署后面，
   * 不开则所有客户端的 request.ip 都塌成代理 / loopback，限流退化成**全队共用一个桶**（任一客户端可耗尽、
   * DoS 全队写入）。运维在可信代理后应设为 `true`（或代理地址 / 跳数），令 request.ip 解析为转发来的真实
   * 客户端 IP，限流按客户端分桶。直连暴露时保持 false（否则 X-Forwarded-For 可伪造）。透传给 Fastify。
   */
  trustProxy?: boolean | string;
}

export function buildHubServer(options: BuildHubServerOptions = {}): FastifyInstance {
  // H3（AUDIT-FIXES）：显式 bodyLimit 收口写端点请求体上限（默认 Fastify 1MB 仍偏大，配合 KB 整文件重写是
  // 低成本资源耗尽面，见 M17）；256KB 足够任务 / 结案录入。
  const app = Fastify({
    logger: false,
    bodyLimit: 256 * 1024,
    // 反代信任（默认 false）：开启后 request.ip 解析为转发的真实客户端 IP，限流才按客户端分桶
    // （见 BuildHubServerOptions.trustProxy；4177 反代部署须开，否则限流塌成全局单桶）。
    trustProxy: options.trustProxy ?? false,
  });
  const store: GovStore = options.store ?? new InMemoryGovStore();
  const clock: Clock =
    options.clock ?? new FixedClock(new Date(GOVERNANCE_SCENARIO_NOW));
  // KB-CORE：知识库相似检索语料读出入口（缺省 InMemoryKbStore seed kbScenarioFixture），由 GET /api/kb/similar 消费。
  // invStore 仍只钉 options 字段、无消费方（INV 支柱落地时透传），符合 base 收口刀「扩展点先行、路由后置」节奏。
  const kbStore: KbStore = options.kbStore ?? new InMemoryKbStore();
  // INV-BOM-CORE：库存 / BOM 读写出入口（缺省 InMemoryInvStore seed inventoryScenarioFixture），由
  // GET /api/inventory + POST /api/inventory/{part-types,actions} 消费。独立于 GovStore（InventorySnapshot
  // 不在 GovernanceSnapshot 内）；车列复用 GovStore.listResources 的资源（显示 displayCode ?? name）。
  const invStore: InvStore = options.invStore ?? new InMemoryInvStore();

  // H3（AUDIT-FIXES 部署前必修）：写端点信任边界 = 共享密钥鉴权 + 每 IP 限流。
  // 仅作用于 POST /api/*（读路由 / 静态站 / health 不受影响）。这是让 I0 泄漏 / 环卡死 / KB 撑爆
  // 被第三方真正触达的边界缺口——未鉴权客户端不能刷爆全队要读的 dep-graph、不能猛打 closeout 撑爆 KB 文件。
  const writeToken = options.writeToken;
  const rateLimit = options.writeRateLimit ?? { max: 120, windowMs: 60_000 };
  const rateHits = new Map<string, { count: number; resetAt: number }>();
  app.addHook('onRequest', async (request, reply) => {
    if (request.method !== 'POST' || !request.url.startsWith('/api/')) return;
    // 鉴权（配了 token 才强制 Bearer；未配=loopback dev 放行）
    if (writeToken && request.headers.authorization !== `Bearer ${writeToken}`) {
      void reply.code(401).send({ detail: 'unauthorized' });
      return reply;
    }
    // 限流（真实墙钟 Date.now，与派生用的 clock 解耦；每实例独立、重启即重置）。
    // 分桶键 = request.ip：直连=源 IP；反代后须开 trustProxy（见上）才是真实客户端 IP，否则塌成全局单桶。
    const ip = request.ip;
    const nowMs = Date.now();
    const hit = rateHits.get(ip);
    if (!hit || nowMs >= hit.resetAt) {
      // 懒驱逐：rateHits 无 TTL 清理、按 IP 无界增长（长跑 / IP 轮换 / 扫描会撑大内存）。
      // 仅在 Map 超过阈值时一次性清掉已过窗口的死条目（O(n) 但极少触发），不引新依赖 / 不开后台定时器。
      if (rateHits.size > 10_000) {
        for (const [k, v] of rateHits) if (v.resetAt <= nowMs) rateHits.delete(k);
      }
      rateHits.set(ip, { count: 1, resetAt: nowMs + rateLimit.windowMs });
    } else if (hit.count >= rateLimit.max) {
      void reply.code(429).send({ detail: 'rate limit exceeded' });
      return reply;
    } else {
      hit.count += 1;
    }
  });

  app.get('/health', async () => {
    return HealthResponseSchema.parse(buildHealthResponse());
  });

  app.get('/api/system/status', async () => {
    const agentBackends = listMockAgentBackends();
    return SystemStatusResponseSchema.parse(
      buildSystemStatusResponse(agentBackends),
    );
  });

  // 集成模型三分（地基重建）：BotChannel / AgentBackend / DataSource 各自只读端点。
  app.get('/api/bot-channels', async () => {
    return BotChannelsResponseSchema.parse({
      botChannels: listMockBotChannels(),
    });
  });

  app.get('/api/agent-backends', async () => {
    return AgentBackendsResponseSchema.parse({
      agentBackends: listMockAgentBackends(),
    });
  });

  app.get('/api/data-sources', async () => {
    return DataSourcesResponseSchema.parse({
      dataSources: listMockDataSources(),
    });
  });

  // invoke/health/capabilities 是 Agent 后端**专属**契约（其余物种无此动词）。
  app.get('/api/agent-backends/:backendId/health', async (request, reply) => {
    const { backendId } = request.params as { backendId: string };
    if (!isMockAgentBackendId(backendId)) {
      void reply.code(404).send({ detail: 'Agent backend not found' });
      return;
    }
    return AgentBackendHealthResponseSchema.parse(
      getMockAgentBackendHealth(backendId),
    );
  });

  app.get(
    '/api/agent-backends/:backendId/capabilities',
    async (request, reply) => {
      const { backendId } = request.params as { backendId: string };
      if (!isMockAgentBackendId(backendId)) {
        void reply.code(404).send({ detail: 'Agent backend not found' });
        return;
      }
      return AgentBackendCapabilitiesResponseSchema.parse(
        getMockAgentBackendCapabilities(backendId),
      );
    },
  );

  app.post('/api/agent-backends/:backendId/invoke', async (request, reply) => {
    const { backendId } = request.params as { backendId: string };
    if (!isMockAgentBackendId(backendId)) {
      void reply.code(404).send({ detail: 'Agent backend not found' });
      return;
    }
    // 与其余写路由一致：坏 body 走 safeParse → 400（客户端输入错误），不让 ZodError 冒泡成 500
    // （此前唯一仍用抛错 .parse 的 POST；correlationId:'' / 非串都会触发 500 泄漏 Zod 内部、破坏错误契约）。
    const parsed = AgentBackendInvokeRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      void reply.code(400).send({ detail: parsed.error.issues[0]?.message ?? 'invalid body' });
      return;
    }
    return AgentBackendInvokeResponseSchema.parse(
      invokeMockAgentBackend(backendId, parsed.data),
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

  // 图纸提交日志 / 版本时间线（v1，A2）：从治理快照读 artifacts（持久化时由 FileGovStore 落盘累积），
  // 不再读 apiContractFixtures.artifacts。无人维度——记录主键是机构 + 版本 + 归档物（I0/A4）。
  app.get('/api/artifacts', async () => {
    const snapshot = await store.getSnapshot();
    return ArtifactsResponseSchema.parse({ artifacts: snapshot.artifacts });
  });

  // 归档物文件下载：把 txt/md/pdf 放进 TEAMHUB_ARTIFACT_FILES_DIR，文件名 `<artifactId>.<ext>`。
  // GET（读端点，不过写鉴权钩子）。仅服务 snapshot 里真实存在的 artifact id 对应文件——id 先经
  // snapshot 校验（无斜杠/穿越），再 relative 兜底，杜绝路径穿越。I0：文件名用归档物 name，无人维度。
  app.get<{ Params: { id: string } }>(
    '/api/artifacts/:id/download',
    async (request, reply) => {
      const dir = process.env.TEAMHUB_ARTIFACT_FILES_DIR;
      if (!dir) {
        void reply.code(404).send({ detail: '未配置归档物文件目录' });
        return reply;
      }
      const { id } = request.params;
      const snapshot = await store.getSnapshot();
      const artifact = snapshot.artifacts.find((a) => a.id === id);
      if (!artifact) {
        void reply.code(404).send({ detail: '归档物不存在' });
        return reply;
      }
      const entries = await readdir(dir).catch(() => [] as string[]);
      const match = entries.find((f) => f === id || f.startsWith(`${id}.`));
      if (!match) {
        void reply.code(404).send({ detail: '该归档物暂无可下载文件' });
        return reply;
      }
      const full = join(dir, match);
      const rel = relative(dir, full);
      if (rel.startsWith('..') || isAbsolute(rel)) {
        void reply.code(400).send({ detail: '非法路径' });
        return reply;
      }
      const ext = extname(match);
      const downloadName = `${artifact.name}${ext}`;
      const content = await readFile(full);
      void reply.header(
        'content-disposition',
        `attachment; filename*=UTF-8''${encodeURIComponent(downloadName)}`,
      );
      void reply.type(
        ext === '.md'
          ? 'text/markdown; charset=utf-8'
          : ext === '.txt'
            ? 'text/plain; charset=utf-8'
            : 'application/octet-stream',
      );
      return content;
    },
  );

  // 图纸档案 v2 提交（HUB-ARTIFACT-ARCHIVE-V2，append-only）。机构经 UI 记一条新图纸：人填
  // ownerGroup/season/robotCode/mechanism/name/uri（+ 电路 subType、驱动可选 relatedRepo/relatedCommit）。
  // **路由 owns 派生（C5）**：versionNo 按四键 ownerGroup+season+robotCode+mechanism 在全量 snapshot 上自增、
  // kind 由 ownerGroup+subType 派生、revision=`v${versionNo}`——客户端均不给（schema omit）；store 仍钉
  // submittedVia=console、补 id/createdAt（body 不动）。机械时剥掉 subType（superRefine 已拦机械夹带 subType）。
  // POST → 继承 H3 onRequest 鉴权+限流（不另写鉴权）。**I0**：无人维度——主键=组+赛季+车+机构+版本+归档物，无提交人字段。
  // 并发 race（read-then-write 两并发 POST 可能都算同号）：小作坊可接受，append-only 容忍重复、最新即权威。
  app.post('/api/artifacts', async (request, reply) => {
    const parsed = CreateArtifactRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      void reply.code(400).send({ detail: parsed.error.issues[0]?.message ?? 'invalid body' });
      return;
    }
    const { ownerGroup, season, mechanism, subType } = parsed.data;
    const snapshot = await store.getSnapshot();
    // 版本号按三键（组别+赛季+机构）自增——车(robotCode) 不进键，故跨车迭代连续编号。
    const versionNo = nextArtifactVersionNo(snapshot.artifacts, {
      ownerGroup,
      season,
      mechanism,
    });
    const kind = deriveArtifactKind(ownerGroup, subType);
    const revision = `v${versionNo}`;
    // 仅电路组带 subType；机械/电控/视觉剥掉（superRefine 已保证缺省，避免 undefined 落库噪声）。
    const draft =
      ownerGroup !== 'electrical'
        ? (() => {
            const { subType: _drop, ...rest } = parsed.data;
            void _drop;
            return { ...rest, kind, versionNo, revision };
          })()
        : { ...parsed.data, kind, versionNo, revision };
    const artifact = await store.appendArtifact(draft);
    void reply.code(201);
    return CreateArtifactResponseSchema.parse({ artifact });
  });

  // 依赖链 · 阻塞归因视图：治理快照经纯函数 toDepGraphView 实时派生（D-040 首任务收敛）。
  // 解 hub-console real 模式 GET /api/dep-graph 的 404；输出主键为 task/group/dependency，无 memberId 维度（C2）。
  app.get('/api/dep-graph', async () => {
    const snapshot = await store.getSnapshot();
    return DepGraphSchema.parse(toDepGraphView(snapshot, clock.now().toISOString()));
  });

  // 方向缺口（S2，D-069）：治理快照经纯函数 deriveDirectionGaps 实时派生组级缺人方向。
  // A1/I0 安全：响应只含 groupId/能力方向/证据 task·need id，无 memberId/认领人，永不下钻到人。
  app.get('/api/group-gaps', async () => {
    const snapshot = await store.getSnapshot();
    const now = clock.now().toISOString();
    return GroupGapsResponseSchema.parse({
      gaps: deriveDirectionGaps(snapshot, now),
      generatedAt: now,
    });
  });

  // 差异化在场排班（D-029，SCHED-WIRE-EXISTING）：把治理快照 + 共享资源 + 占用窗口拼成 ScheduleSnapshot，
  // 经纯函数 derivePresenceSchedule 实时派生「按组×窗口 谁在场/随叫/可不来」。now 用 clock（与 dep-graph/
  // group-gaps 同口径 GOVERNANCE_SCENARIO_NOW，否则视觉组落不到 blockedFree）。windowLabel 走 query、必填。
  // **I0**：输出 recommendations 主键 group/resource/task，**无 memberId 维度**（纯函数结构保证 + PresenceScheduleResponseSchema
  // 二次 fail-closed 把关：PresenceRecommendationSchema 无 memberId 字段，任何夹带会被 parse 拒）；路由绝不回原始
  // session 或 snapshot.members，更不回 invitedMemberIds（那是单窗录入名单，按人聚合即退化成出勤排名，反排名红线）。
  app.get('/api/schedule', async (request, reply) => {
    const parsed = ScheduleQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) {
      void reply
        .code(400)
        .send({ detail: parsed.error.issues[0]?.message ?? 'windowLabel required' });
      return;
    }
    const { windowLabel } = parsed.data;
    const snapshot = await store.getSnapshot();
    const resources = await store.listResources();
    const resourceSessions = await store.listResourceSessions();
    const scheduleSnapshot: ScheduleSnapshot = {
      ...snapshot,
      resources,
      resourceSessions,
    };
    const recommendations = derivePresenceSchedule(
      scheduleSnapshot,
      clock.now().toISOString(),
      windowLabel,
    );
    return PresenceScheduleResponseSchema.parse({ windowLabel, recommendations });
  });

  // 在场排班读视图：占用窗口列表（录入面板回显 / 调试）。原始 ResourceSession（含 invitedMemberIds 单窗操作名单，
  // I0 注释已许可「单窗名单合法」）——但**绝不**在此或任何端点按成员跨窗聚合/计数（反排名护栏，见 SchedulePage 渲染纪律）。
  app.get('/api/resource-sessions', async () => {
    const sessions = await store.listResourceSessions();
    return ResourceSessionsResponseSchema.parse({ sessions });
  });

  // 在场排班读视图：共享物理资源列表（录入面板选资源用）。无人维度——资源状态是中性事实（"撞坏维修中"非归咎于人）。
  app.get('/api/resources', async () => {
    const resources = await store.listResources();
    return SharedResourcesResponseSchema.parse({ resources });
  });

  // 在场排班录入（POST /api/resource-sessions，D-029 队长一拍即录）。镜像 POST /api/needs：safeParse→400/201。
  // server 钉 source=human、补 id/createdAt；confirmedBy 随请求传入（录入即确认拍板）。
  // POST /api/* → 继承 H3 onRequest 鉴权+限流（不另写鉴权）。I0：响应剥 confirmedBy（ActorRef 永不过读边界）。
  app.post('/api/resource-sessions', async (request, reply) => {
    const parsed = CreateResourceSessionRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      void reply.code(400).send({ detail: parsed.error.issues[0]?.message ?? 'invalid body' });
      return;
    }
    const session = await store.createResourceSession(parsed.data);
    void reply.code(201);
    return CreateResourceSessionResponseSchema.parse({ session });
  });

  // 库存 / BOM 读视图（INV-BOM-CORE）：零件 + 个体件 + 库存总表派生（零件×车 矩阵）+ 缺料告警。
  // 车列复用 GovStore.listResources（显示 displayCode ?? name，与 PRESENCE 解耦）。**I0**：返回体无任何
  // memberId / 按人聚合——PartAction.recordedBy 只到 source，矩阵主键是零件×车。
  app.get('/api/inventory', async () => {
    const snapshot = await invStore.getInventorySnapshot();
    const resources = await store.listResources();
    const ledger = deriveInventoryLedger(snapshot, resources);
    const shortfalls = deriveShortfalls(snapshot);
    return InventoryResponseSchema.parse({
      partTypes: snapshot.partTypes,
      trackedParts: snapshot.trackedParts,
      ledger,
      shortfalls,
      actions: snapshot.actions,
    });
  });

  // 库存零件录入 / 调整（POST /api/inventory/part-types，盘点建底 / 补料 / 调阈值）。带 id 命中即更新。
  // POST → 继承 H3 onRequest 鉴权 + 限流。store 补 lastCountedAt / updatedAt（C5 来源 seam server 钉）。
  app.post('/api/inventory/part-types', async (request, reply) => {
    const parsed = CreatePartTypeRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      void reply.code(400).send({ detail: parsed.error.issues[0]?.message ?? 'invalid body' });
      return;
    }
    const partType = await invStore.upsertPartType(parsed.data);
    void reply.code(201);
    return CreatePartTypeResponseSchema.parse({ partType });
  });

  // 库存动作记一笔（POST /api/inventory/actions）：一句话快记=damage、拆装=mount/dismount、预留=reserve/release。
  // **recordedBy 不收客户端**——server 钉 source=human（C5；I0 绝无 memberId）。Hermes 将来调同一接口自动填。
  // 校验两层：① 未知 resourceId（toHolder/fromHolder 不是 idle 也不在 listResources）→ 400；
  // ② 非法迁移（负库存 / used 超 total / 缺持有者）由 store 抛 InvalidPartActionError → 400（不静默吞）。
  app.post('/api/inventory/actions', async (request, reply) => {
    const parsed = CreatePartActionRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      void reply.code(400).send({ detail: parsed.error.issues[0]?.message ?? 'invalid body' });
      return;
    }
    const validResourceIds = new Set(
      (await store.listResources()).map((r) => r.id),
    );
    for (const holder of [parsed.data.fromHolder, parsed.data.toHolder]) {
      if (holder && holder !== IDLE_HOLDER && !validResourceIds.has(holder)) {
        void reply.code(400).send({ detail: `未知 resourceId: ${holder}` });
        return;
      }
    }
    try {
      const action = await invStore.recordPartAction({ ...parsed.data, source: 'human' });
      void reply.code(201);
      return CreatePartActionResponseSchema.parse({ action });
    } catch (err) {
      if (err instanceof InvalidPartActionError) {
        void reply.code(400).send({ detail: err.message });
        return;
      }
      throw err;
    }
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

  // PM 任务状态流转（人工标进度，含 inProgress→done 标真实完成）。POST 子资源动作 → 继承 H3 鉴权+限流
  // （写钩子只认 POST；用 PATCH/DELETE 会绕过鉴权）。受限状态机迁移、非通用 update。
  // C5：server 钉 statusSource=console（请求不收 statusSource，结构上杜绝冒充 derived/git/lark）。
  app.post('/api/tasks/:taskId/status', async (request, reply) => {
    const { taskId } = request.params as { taskId: string };
    const parsed = TransitionTaskStatusRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      void reply.code(400).send({ detail: parsed.error.issues[0]?.message ?? 'invalid body' });
      return;
    }
    const task = await store.updateTaskStatus(taskId, parsed.data.status);
    if (!task) {
      void reply.code(404).send({ detail: 'task not found' });
      return;
    }
    // 流转非创建 → 默认 200。
    return TransitionTaskStatusResponseSchema.parse({ task });
  });

  // PM 依赖边录入（人手建有向边）。server clamp status=active（D-042 初始态）；confirmedBy 内部凭证不经读视图暴露。
  app.post('/api/dependencies', async (request, reply) => {
    const parsed = CreateDependencyRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      void reply.code(400).send({ detail: parsed.error.issues[0]?.message ?? 'invalid body' });
      return;
    }
    // H1（AUDIT-FIXES 部署前必修）：落库前拒自环 / 成环。后端原零语义校验——一条成环边会让下次
    // GET /api/dep-graph 的 computeCriticalSet / toDepGraphView 派生死循环、卡死整个 server（单请求 DoS）。
    const snapshot = await store.getSnapshot();
    const { fromTaskId, toTaskId } = parsed.data;
    // 只滤 waived 边（已作废、从 dep-graph 隐藏、不构成真实阻塞路径）。否则 waive 一条 A→B 后想建反向
    // B→A 会被永久误拒——逆向边并不与一条已死的边成环。satisfied 边仍是真实历史路径、必须参与环检测。
    if (
      wouldCreateCycle(
        snapshot.dependencies.filter((d) => d.status !== 'waived'),
        fromTaskId,
        toTaskId,
      )
    ) {
      void reply.code(400).send({
        detail:
          fromTaskId === toTaskId
            ? 'self dependency not allowed'
            : 'dependency would create a cycle',
      });
      return;
    }
    const dependency = await store.createDependency(parsed.data);
    void reply.code(201);
    return CreateDependencyResponseSchema.parse({ dependency });
  });

  // PM 连线作废（软删除）。POST 子资源动作 → 继承 H3 鉴权+限流。转 waived 后从 dep-graph edges 隐藏
  // （toDepGraphView 跳过 waived），但库里保留 confirmedBy/createdAt（G2 可审计）。无 body 字段。
  // waive 只删边、不可能成环，故无需 wouldCreateCycle 守卫。I0：响应剥 confirmedBy。
  app.post('/api/dependencies/:depId/waive', async (request, reply) => {
    const { depId } = request.params as { depId: string };
    const dependency = await store.waiveDependency(depId);
    if (!dependency) {
      void reply.code(404).send({ detail: 'dependency not found' });
      return;
    }
    return WaiveDependencyResponseSchema.parse({ dependency });
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
    // M9（AUDIT-FIXES 部署前必修）：errorCode NNN 用「同日既有 ErrorEntry 数 + 1」的单调序号，
    // 避免哈希 mod 1000 在 ~38 次/日时生日碰撞 → 静默覆盖、污染 kb-similar 跨赛季查找。
    const kbSnapshot = await kbStore.getKbSnapshot();
    const dayPrefix = `DBG-${now.slice(0, 10).replace(/-/g, '')}-`;
    // known-low（不在本批处理）：sameDaySeq 的 read-then-write 是 TOCTOU——两个并发 closeout 可能读到同一
    // count、派生相同 errorCode。需真并发才触发、量小，小作坊（单端口 / 极少并发写）可接受；真要彻底消除得在
    // store 层把序号分配做成原子计数器。本批只修「同一结案重试」的重复主键（见 appendCloseoutInto upsert）。
    const sameDaySeq =
      kbSnapshot.errorEntries.filter((e) => e.errorCode.startsWith(dayPrefix)).length + 1;
    const result = buildCloseoutFromIssue(
      issue,
      records,
      { category, rootCause, resolution, prevention },
      {
        now,
        errorEntryId: `err-${issue.id}`,
        errorCode: deriveErrorCode(now, issue.id, sameDaySeq),
        generatedBy,
      },
    );
    if (!result.ok) {
      // 结案校验失败（如缺 rootCause / 卡已归档）→ 422，不伪造完成（§10）
      void reply.code(422).send({ detail: result.reason });
      return;
    }
    // 结案派生知识节点持久到治理快照（复用同一 GovernanceSnapshot，对抗核实确认成立）。
    // 两步写（GovStore.closeoutKbNode + KbStore.appendCloseout）跨两个独立 store、无分布式事务。
    // 第一步失败 → 整个请求抛错（无副作用，客户端可安全重试）。第二步失败 → 知识节点已落 GovStore、
    // 但相似检索语料没回灌 → 两库分叉（GET /api/kb/similar 查不到本次结案）。这种分叉不能静默吞——
    // app.log.error 记录下来，让运维能发现并补回灌；仍把错误抛给客户端（500，别伪造 201 成功）。
    // 幂等护栏（见 closeoutKbNode 的 dedup / appendCloseoutInto 的 upsert）：重试同一结案不产生重复主键。
    const knowledgeNode = await store.closeoutKbNode(result.knowledgeNodeDraft);
    try {
      // 回灌相似检索语料（AI+知识库闭环）：archived 卡 / 错误表 / 归档写回 kbStore，
      // 否则本次上传后下次 GET /api/kb/similar 查不到（闭环断）。无人维度（C2）：主键 issue/errorCode。
      await kbStore.appendCloseout({
        issueCard: result.updatedIssueCard,
        errorEntry: result.errorEntry,
        archiveDocument: result.archiveDocument,
      });
    } catch (err) {
      app.log.error(
        { err, issueId: issue.id, knowledgeNodeId: knowledgeNode.id, errorCode: result.errorEntry.errorCode },
        'kb closeout two-step diverged: knowledge node persisted but corpus reload failed; retry safe (idempotent upsert)',
      );
      throw err;
    }
    // L4：与其余 create 路由（tasks/dependencies/needs）一致，结案创建归档/错误表/知识节点 → 201。
    void reply.code(201);
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
