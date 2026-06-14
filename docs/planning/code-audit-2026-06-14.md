# 代码审计发现 — 2026-06-14

- 状态：**RECORDED / 修复后置**（落档当轮；修复等彻底构建完统一批次处理，可起 D-049）
- 日期：2026-06-14
- 范围：当前构建（hub-contracts / hub-server / hub-console + lark-* 触点层）
- 方法：15-agent 对抗式审计（7 维 finder → 逐维对抗式 verifier 驳斥 → opus 综合）；**confirmed 42 / refuted 1**
- 计数：High 5 · Medium 16 · Low 12 · Nit 3
- 事实源：本文件即综合报告；条目可链回 `backlog.md` 修复批次条目与将来 D-049

> 唯一被驳回项：有 finder 声称 store「并发读写竞态」，verifier 核实指出 **Node 单线程事件循环串行化每个 await 的 handler，该竞态不成立**（ID 脆弱性本身仍以 L1/L9 保留）。

---

## Executive Summary

- **总体：地基扎实、未达生产就绪。** Contracts-first（zod 前后端共享 + 纯函数域逻辑）干净、happy-path 测试到位；多数写端点 `safeParse`+400、file store 原子写、static-console 路径穿越防护、读路径 I0 边界（dep-graph 边不带 actor 字段）都在。问题集中在 (a) 少数可用性/持久性 bug 与 (b) 缺一道信任边界。
- **Top risks（联网部署前必修）**：
  1. **依赖环 → DoS/卡死**：`computeCriticalSet` 遇环死循环，且 `POST /api/dependencies` 不查成环，任意客户端可堵死事件循环。
  2. **一次磁盘错误后静默丢数据**：`FileKbStore.persist()` 首次 I/O 失败后写链永久中毒，之后每次 closeout「报成功又报错」而文件冻结。
  3. **所有写端点零鉴权** + bind host 可配 `0.0.0.0`：可达者即可污染治理数据、撑爆 KB 文件、回环 actor 身份。
  4. **创建时字段注入**：`CreateTaskRequestSchema` 允许客户端设 `status:'done'`/`statusSource:'derived'`，store 原样接收，破坏 C5 派生优先铁律。
  5. **幻影 Postgres 耦合**：compose 每次启动为一个代码从不读的库白等 ~60s + 一个容器。
- **没有 Critical**：H1（环卡死）评 High 仅因需刻意建环且当前默认 loopback；**一旦 bind 到非 loopback host 即视为 Critical**。

---

## Critical
*无。* 详见上（H1 在非 loopback 部署下升级为 Critical）。

---

## High

**H1. 依赖环 → `computeCriticalSet` 死循环 → 整个 server 卡死** — `apps/hub-contracts/src/attribution.ts:228-234`（+ `apps/hub-server/src/server.ts:189-198` 缺校验）
回溯循环 `while (cursor) { critical.add(cursor); cursor = parent.get(cursor) ?? null }` **无 visited 守卫**（同文件 `findRoot()` 有 `visited`，此处漏）。`longestTo()` 阶段的 cycle-guard 在删除 `computing` 前返回未 memoize 的 `1`，故 2-环 A↔B 的 `parent={A→B,B→A}` 反复振荡。且 `POST /api/dependencies` 不查自环/成环即落库 → 客户端可造环 → `GET /api/dep-graph` 走 `toDepGraphView` → Node 事件循环永久卡死、后续请求全堵。
**影响**：单个未鉴权请求 → 全服务 DoS。
**修**：回溯加 `const seen=new Set<string>(); while (cursor && !seen.has(cursor)) {…}`；`createDependency` 拒 `from===to` 并在落库前做 DAG 成环检测。

**H2. `FileKbStore.persist()` 一次 I/O 错误后写链永久中毒** — `apps/hub-server/src/store/file-kb-store.ts:84-92`
`this.writeChain = this.writeChain.then(写盘)` 无 `.catch`。任一次写失败（ENOSPC/跨设备 rename/EACCES）→ `writeChain` 变永久 rejected → 之后每次 `persist()` 的 `.then` 回调被跳过、**静默不再写盘**；而 `appendCloseoutInto` 在 `persist()` 前已改内存 → 内存与磁盘分叉、store 以为存了，进程生命周期内无法恢复。
**影响**：一次瞬时磁盘抖动 → KB 永久静默丢数据，内存视图掩盖之。
**修**：`.catch(err => { this.writeChain = Promise.resolve(); /* log */ throw err })` 隔离失败、重置链；ENOSPC 类打 stderr。

**H3. 所有写端点零鉴权/限流；bind host 可被运维配成 `0.0.0.0`** — `apps/hub-server/src/server.ts:133-299`、`apps/hub-server/src/main.ts:19-26`
`POST /api/tasks|dependencies|needs|kb/closeout|adapters/:id/invoke` 无任何 auth hook / token / rate-limit（grep `addHook/preHandler/onRequest/Authorization/cors` 全空）。`main.ts` 读 `HUB_HOST` 不校验（仅 port 范围检查），文档 `远程=LAN+隧道`/容器部署可设 `0.0.0.0` 暴露全部写路由。写落内存/文件 store 无幂等 → 未鉴权客户端可刷爆全队要读的 dep-graph，或猛打 `/api/kb/closeout` 撑爆 `TEAMHUB_KB_DATA_FILE`（每次整文件重写）。**这是让 I0 泄漏与环卡死被第三方真正触达的边界缺口。**
**修**：`/api/*` 写路由加 auth preHandler（至少 shared-secret bearer）+ `@fastify/rate-limit`；默认 loopback，未配 auth 拒 `0.0.0.0`；设显式 `bodyLimit`。

**H4. `CreateTaskRequestSchema` 允许客户端设服务端字段 `status`/`statusSource`** — `apps/hub-console/src/api/schemas/pm.ts:16-26` 与 `apps/hub-server/src/contracts.ts:150-160`（两份同源）
`.omit({status,statusSource})` 后又 `.extend({ status: TaskStatusSchema.optional(), statusSource: GovActorSourceSchema.optional() })` —— 把含 `done`/`shelved`/`derived` 的完整枚举重新放进来。`createTask` 用 `draft.status ?? 'pending'`，`??` 只在字段缺失兜底 → 显式传 `{status:'done',statusSource:'derived'}` 原样落库。注释/JSDoc 声称服务端拥有这些字段但无强制，**直接违反 C5（`derived` 系统专用）**。
**修**：请求 schema 去掉这两字段（服务端永远设），或限制为 `z.enum(['pending','inProgress'])`/`z.enum(['lark','git','console'])`；store **无条件覆写**而非 `??`。`CreateDependencyRequestSchema.confirmedBy` 同样处理。

**H5. compose 幻影 Postgres 耦合** — `compose.yaml:13,19-21`
`hub` 服务 `depends_on: postgres: condition: service_healthy` 且设 `DATABASE_URL`，但 hub-server 无 Postgres 客户端、代码从不读 `DATABASE_URL`；唯三 store 是 `InMemoryGovStore`/`FileKbStore`/抛错的 `SqliteGovStore` stub。启动因此白等最多 ~60s（6×10s 健康重试）+ 一个没用的容器，且误导运维以为治理数据存进了 PG。
**修**：从 compose 删 `postgres` 服务、`depends_on`、`DATABASE_URL`；将来真上 SQLite 再挂卷。

---

## Medium

**M6. I0 边界：create 响应回环 `confirmedBy`（ActorRef id+displayName）** — `apps/hub-server/src/contracts.ts:178-194`、`server.ts:189-210`
读路径守住了（TaskSchema 无 `confirmedBy`，`toDepGraphView` 只出 `{id,source,target,kind}`）。但 `CreateDependencyResponseSchema`/`CreateNeedResponseSchema` 包完整 `Dependency`/`Need`（含 `confirmedBy: ActorRefSchema.nullable()`），服务端原样回、无鉴权。今天披露面小（值是创建方自带），但**「把 ActorRef 送过边界」正是该库禁止的 I0 泄漏形状**，也是未来 `GET /api/dependencies` 会照抄的模板。
**修**：`CreateDependencyResponseSchema = z.object({ dependency: DependencySchema.omit({ confirmedBy: true }) })`（Need 同）；确需回显创建者则鉴权后只回 `actor.source`，永不 `id`/`displayName`。

**M7. `getSnapshot()`/`getKbSnapshot()` 返回活的可变对象** — `mock-gov-store.ts:48-50`、`file-kb-store.ts:74-75`、`mock-kb-store.ts:25-26`
三处都 `return this.snapshot`（引用）。调用方可 `.tasks.push()`/`.issueCards.splice()` 绕过写方法白名单，并（对 FileKbStore）绕过 `persist()` 链 → 内存与磁盘静默分叉。当前 handler 只读故无现患，但封装边界不可见、构造器自带注释（`浅克隆 + 克隆被写入的数组`）本意就是防御性拷贝。
**修**：三处读时返回浅拷贝 `return { ...this.snapshot, tasks:[...], dependencies:[...], needs:[...], knowledgeNodes:[...] }`（KB 同）；FileKbStore 最关键。

**M8. `POST /api/adapters/:id/invoke` 用抛异常 `.parse()` → 坏输入 500 而非 400** — `apps/hub-server/src/server.ts:139`
其余 POST 都 `safeParse`+`{detail}` 400；此处 `AdapterInvokeRequestSchema.parse(request.body ?? {})`，校验失败 Zod 抛错 → Fastify 500（`{statusCode,error,message}`），泄漏 Zod 内部、破坏错误契约。`correlationId` 是 `z.string().min(1)`，空串即触发。
**修**：改 `safeParse` + `reply.code(400).send({ detail: parsed.error.issues[0]?.message ?? 'invalid body' })`。

**M9. `deriveErrorCode` 哈希 `mod 1000` 同日易碰撞** — `apps/hub-server/src/server.ts:82-87`
`DBG-YYYYMMDD-NNN` 的 `NNN` = `issueId` 滚动多项式哈希 `% 1000`，码域恒 0–999。`ErrorEntry` 唯一性/查找按 `errorCode`，生日界下约 ~38 次 closeout 即同日碰撞 → 静默覆盖或两个「唯一」码，污染 `kb-similar` 依赖的跨赛季查找。
**修**：`NNN` 改按 (project,date) 在既有 `ErrorEntry` 上的单调序号（即 `-NNN` 的本义），或检测碰撞自增；route 已有 store 访问。

**M10. `computeCriticalSet` cycle-guard 返回未 memoize 的 `1` → 临界路径长度依赖遍历顺序、非确定** — `apps/hub-contracts/src/attribution.ts:198-216`
即便不触发卡死（H1），有环时 `if (computing.has(id)) return 1;` 占位被在算的调用者消费、烘进某祖先 memoize 长度，而被守卫节点稍后以不同值 memoize → `isCritical`/`criticalCount` 随外层先访问谁翻转。确定性是该模块明确目标。
**修**：longest-path 前确定性破环（SCC 缩点后拓扑序，或跳过已在 `computing` 的前驱）；H1 的修法应顺带覆盖。至少文档化「有环时临界路径未定义」。

**M11. Docker 里 KB 持久从未启用 → 重启丢 KB** — `compose.yaml:7-18`
`main.ts` 仅在设了 `TEAMHUB_KB_DATA_FILE` 时用 `FileKbStore`，但该变量在 `compose.yaml` 与 `deploy/teamhub.env.example` 都没有；`hub_artifacts` 卷只覆盖 `/var/lib/teamhub/artifacts`、不含 KB 路径。故容器部署每次重启静默丢全部 IssueCard/ErrorEntry/ArchiveDocument，破「AI+知识库闭环」前提。
**修**：hub 服务设 `TEAMHUB_KB_DATA_FILE: /var/lib/teamhub/kb/kb-data.json` + 加覆盖该目录的卷 + 在 `teamhub.env.example` 记此变量。

**M12. 治理数据生产环境全内存、无持久，且与 KB 不对称** — `apps/hub-server/src/main.ts:10-18`
`main.ts` 从不传 `store` → `buildHubServer` 恒回退 `InMemoryGovStore`，tasks/deps/needs 重启即丢；`SqliteGovStore` 存在但未接。已被文档化为预期 MVP 行为，但**静默不对称**：KB closeout（FileKbStore）能跨重启，而它写进治理快照的 `KnowledgeNode` 不能 → 重启后 file KB 在、`knowledgeNodes` 却重置回 fixture，静默分叉。
**修**：启动 `console.warn` 治理数据易失；`SqliteGovStore` 落地时在 `main.ts` 加平行 `TEAMHUB_GOV_DB_FILE` 路径；至少文档化此分叉。

**M13. `InMemoryGovStore` 构造只克隆 7 数组里的 4 个** — `apps/hub-server/src/store/mock-gov-store.ts:38-45`
克隆 `tasks/dependencies/needs/knowledgeNodes`，`groups/members/taskKnowledgeTags` 仍是模块级 `governanceScenarioFixture` 的引用。当前无写方法动这三个，但 `closeoutKbNode` 已立「往 store 数组追加」先例，未来 `updateMemberStatus`/`addTaskKnowledgeTag` 照做即静默污染共享 fixture（影响后续实例与依赖 fixture 的测试）。
**修**：补 `groups:[...seed.groups], members:[...seed.members], taskKnowledgeTags:[...seed.taskKnowledgeTags]`，7 个数组一致克隆。

**M14. ReactFlow 选中态与详情面板 `selectedId` 分叉** — `apps/hub-console/src/features/dep-graph/DepGraphPage.tsx:150-193`
两套独立选中态：React `selectedId`（驱动 `DetailPanel`）与 ReactFlow 内部 `selected`（驱动 `dag-node--selected` 高亮）。Esc/内置取消清高亮不关面板；`onPaneClick` 关面板不清高亮；无 `onSelectionChange`。
**修**：用 `useOnSelectionChange`/`onSelectionChange` 统一以一处为准驱动 `selectedId`。

**M15. ReactFlow 节点可拖动，破坏 dagre 布局** — `DepGraphPage.tsx:179-196`
设了 `nodesConnectable={false}` 但没设 `nodesDraggable={false}`，节点默认可拖；拖后位置只在 ReactFlow 内部态，下次 refetch（`nodes` 是 `useMemo([graph])`）又拍回原位 —— 只读视图里的拖动假象 + 突兀复位。
**修**：加 `nodesDraggable={false}` 明确只读意图。

**M16. ARIA tabs 缺 `role='tabpanel'`** — `PmCreatePanel.tsx:62-84`、`KbSearchPage.tsx:23-47`
两处实现了 `role='tablist'/'tab'/aria-selected`，但内容区无 `role='tabpanel'`/`id`/`aria-labelledby` → 辅助技术看到无关联面板的孤立 tab。
**修**：每个 tab 按钮给 `id`，内容包 `<div role='tabpanel' aria-labelledby='tab-…' id='panel-…' tabIndex={0}>`。

**M17. KB closeout 字符串/数组字段无上限 + 整文件重写放大** — `apps/hub-server/src/contracts.ts:90-132`、`apps/hub-contracts/src/kb.ts`
`KbCloseoutRequestSchema`（rootCause/resolution/prevention）与内嵌 `IssueCardSchema`/`InvestigationRecordSchema` 用裸 `z.string()`/`z.array(z.string())` 无 `.max()`；唯一上限是 Fastify 默认 1MB body（未设自定义 `bodyLimit`）。每次 closeout 追加且（FileKbStore）整文件 `JSON.stringify` 重写 → 反复近 1MB closeout 撑爆内存/磁盘并放大写。配合 H3 是低成本资源耗尽面。
**修**：用户输入串/数组加 `.max()`；设显式 Fastify `bodyLimit`；封顶/轮转保留的 issueCards/errorEntries。

**M18. `IssueCardSchema` 核心文本字段允许空串** — `apps/hub-contracts/src/kb.ts:48-57`
`rawInput`/`normalizedSummary`/`symptomSummary` 是 `z.string()`（无 `.min(1)`），数组是 `z.array(z.string())`，故 `''`/`['','CAN','']` 通过 —— 与 `governance.ts` 全局 `.min(1)` 约定（及 IssueCard 自身 id/title）不一致。全空卡片产出空段归档。
**修**：三串加 `.min(1)`，数组改 `z.array(z.string().min(1))`。

**M19. `KbCloseoutRequestSchema` 的 rootCause/resolution 校验推迟到运行时（422 而非 400）** — `apps/hub-console/src/api/schemas/kb.ts:39-47`、`apps/hub-server/src/contracts.ts:124-132`
两份都用裸 `z.string()`，Zod 接受 `''`；真正「必填」在 `buildCloseoutFromIssue`（`kb-closeout.ts:243-247`）`.trim()` 后才报，故空值得运行时 422、schema 层无信号；类型消费者/单测被误导。
**修**：两处改 `z.string().trim().min(1)`，把约束推进 Zod（边界 400）。

**M20. 无 workspace 工具 → `hub-contracts` 被编两次、共享 dist 有 staleness/race** — `apps/hub-server/package.json:19`、`apps/hub-console/package.json:12`
无根 `package.json`/workspace 管理；各 app 的 `build:contracts` 把 `tsc` 编进同一物理 `dist/`（两 app 都 symlink 同一份 hub-contracts）。Dockerfile 串行编两次（无容器内 race），但本地并行 build 会争 `apps/hub-contracts/dist/`，半成品 `tsc` 输出可瞬时污染另一 app 的运行时；且无顶层依赖序 `build`/`verify:all`。
**修**：加根 `package.json` `"workspaces":["apps/*"]` + 先编 hub-contracts 再编两 app 的 build 脚本；Dockerfile 把 hub-contracts 单独 RUN 层缓存。

**M21. hub-console 四个写方法（createTask/Dependency/Need/closeoutKb）无测试** — `apps/hub-console/test/client.test.ts`
唯一 console 测试（173 行）只覆盖读路径。四个写方法都有非平凡 **mock 模式**逻辑（内联 ID 生成、Zod parse、状态变更，且 `closeoutKb` **重实现**后端 `buildCloseoutFromIssue`+`deriveErrorCode`）+ 真实模式 HTTP —— 全未测。重复的 mock closeout 逻辑是风险最高的未测代码。
**修**：补 mock 模式 createTask 往返、mock 模式 closeoutKb（有效 issue → 设 archiveDocument、不抛）、四方法真实模式 POST body/endpoint 断言。

---

## Low

**L1. `length+1` 生成 ID，删除后会撞** — `mock-gov-store.ts:62,82,99`：`task-new-${len+1}` 等，无去重；加 delete 后复用 ID 静默坏 FK。当前无 delete 故无现患（Node 单线程排除并发 race）。**修**：每实体单调计数器（构造器初始化为 `seed.<coll>.length`）或 `crypto.randomUUID()`。

**L2. `FileKbStore` 若 `rename` 在 `writeFile` 成功后失败会漏 `.tmp`** — `file-kb-store.ts:87-89`：无 try/finally，`create()` 只读 `filePath` → 孤儿 `.tmp` 永不回收。**修**：在 #H2 的 catch 里 `await unlink(tmp).catch(()=>{})`。

**L3. 无 `FileKbStore` 写失败恢复测试** — `apps/hub-server/test/kb-store-persist.test.ts`：仅 happy-path + 缺文件 seed 两测；无注入 `writeFile`/`rename` reject 的测试（既能文档化也能挡 H2 回归）。**修**：加一例 reject 写、断言报错、再断言后续 append 不被陈旧 rejection 阻塞。

**L4. `POST /api/kb/closeout` 返回 200 而非 201** — `server.ts:259-299`：它创建 archiveDocument/errorEntry/knowledgeNode/更新 issueCard，却未 `reply.code(201)`（其余 create 都设）。**修**：最终 return 前加 `void reply.code(201)`。

**L5. `static-console` 跟随 root 内 symlink 越界** — `static-console.ts:61-77`：穿越防御正确（单次解码、拒 NUL、词法 `isWithinRoot`），但 `stat`/`readFile` 跟随 symlink —— `consoleDistDir` 内指向外部的 symlink 过词法检查却读到目标。需先有文件系统/构建访问，属纵深防御。**修**：`fs.realpath()`（或 `lstat` 拒 symlink）后对真实路径重跑 `isWithinRoot`。

**L6. 飞书入站仅校验 bot @open_id，无租户/会话/发送者白名单** — `lark-gateway/src/message-handler.ts:31-36`：唯一闸是 `mentions.some(m=>m.id.open_id===cfg.LARK_BOT_OPEN_ID)`。当前无代码执行风险（WSClient 认证信道、skill 为 mock/echo、出站 CLI 用 execa argv 数组），残余是滥用/DoS：能把 bot 拉进群者即可无限驱动 skill 调度；一旦接真 LLM provider 即无限付费调用 + 攻击者可控文本。**修**：启用真 provider 前加会话/租户白名单 + 每发送者限流，校验 `tenant_key`。

**L7. 前端 `KbSimilarParams` 漏传 server 支持的 `projectId`** — `hub-console/src/api/schemas/kb.ts:28-33`：server `KbSimilarQuerySchema` 有 `projectId?` 用于语料范围（`projectId ?? kb.projectId`），但前端接口与 `client.ts` 查询串从不发。单项目无碍；多项目无法限定。**修**：`KbSimilarParams` 加 `projectId?: string` 并入 `buildQueryString`。

**L8. `SimilarIssueMatchSchema.updatedAt` 是裸 `z.string()`** — `apps/hub-contracts/src/kb-similar.ts:36`：值源自 `IssueCard.updatedAt`（`isoDateTimeSchema`），实际恒有效，但输出 schema 弱于源、与其它时间戳字段不一致。**修**：`updatedAt: isoDateTimeSchema`。

**L9. `KbCloseoutForm` 模块级 `seq` 跨重挂不重置** — `hub-console/src/features/kb/KbCloseoutForm.tsx:26-82`：`let seq=0` 在模块作用域跨卸载/重挂（切 tab/导航）持续，StrictMode 下双增 → 合成 `iss-web-YYYY-MM-DD-N` ID 非确定。**修**：`const seqRef=useRef(0); seqRef.current+=1` 按实例作用域。

**L10. `TaskForm` 冷启动 project/group 默认值变陈旧** — `PmCreatePanel.tsx:123-135`：`useState(defaults.projectId/groupId)` 只吃首挂初值；冷启动（tasks 空）初为空，`onCreated`→`invalidateQueries` 重填 tasks 后仍空（已挂载的 TaskForm 忽略重算的 defaults）。**修**：`useEffect` 在字段仍为空时从 `defaults` 同步（不覆盖用户输入），或文档化冷启动需手填。

**L11. 切数据源后 `fitView` 不重触发** — `DepGraphPage.tsx:179-196`：`source` 在 `App.tsx`，切 mock↔real 时 `DepGraphPage` 不卸载；`fitView` 仅挂载时，故新 dagre 布局可能部分/整体跑出视口。**修**：`<DepGraphPage>`（或 `<ReactFlow>`）加 `key={source}` 强制重挂，或 `useReactFlow().fitView()` 放 `useEffect`（keyed on `nodes`）。

**L12. 无 Node 版本锁** — `Dockerfile:1`：`ARG NODE_VERSION=24-bookworm-slim` 是滚动大版本 tag；无 `.nvmrc`/`engines` 字段 → 本地↔CI↔prod 可分叉、构建不可复现。**修**：钉补丁/digest，各 `package.json` 加 `"engines":{"node":">=24"}`，加 `.nvmrc`。

---

## Nits

**N1. adapter 响应 schema 把 `mode`/`status` 锁成 `z.literal('mock')`/`z.literal('accepted')`** — `apps/hub-contracts/src/schemas.ts:54-75`：共享契约写死 mock 语义；真 adapter 回 `mode:'real'`/`status:'queued'` 会让前端 Zod parse 抛错崩 UI。未来脆弱。**修**：`z.enum(['mock','real'])` / `z.enum(['accepted','queued','rejected'])`。

**N2. `rankSimilarIssues` 时间 tie-break 用字典序比较** — `apps/hub-contracts/src/kb-similar.ts:326-331`：`l.updatedAt < r.updatedAt` 仅对同形 UTC ISO 正确；`isoDateTimeSchema` 允许 `+08:00`/可选毫秒会排错（fixtures 全 `…Z` 故潜伏）。**修**：tie-break 用 `Date.parse(...)`，再退字典序、再 `issueId.localeCompare`。

**N3. `classifyReason` 的 `'sharedResourceBusy'` 分支实际死代码/无 fixture 覆盖** — `apps/hub-contracts/src/attribution.ts:110-120`：`unmetNeed` 检查在前、`findRoot` 在首个有未满足 Need 的上游即停，故该分支只在无 need 路径含 `sharesResource` 边时才触发；`fixtures.ts` 无 `sharesResource` 依赖故从未走到，且把对称互斥当有向上游边语义脆弱。**修**：加一例 `sharesResource` 驱动阻塞的 fixture 断言 `reason==='sharedResourceBusy'`，或文档化/调整优先级。

---

## 部署前必修清单（7 条）

1. **`computeCriticalSet` 加 visited 守卫** + `POST /api/dependencies` 拒自环/成环（H1）—— 止单请求卡死。
2. **`FileKbStore.writeChain` 失败后重置**（`.catch`→`Promise.resolve()`+log）（H2）—— 止静默丢数据。
3. **`/api/*` 写路由加 auth + rate-limit；未配 auth 拒 `0.0.0.0`；设 `bodyLimit`**（H3）—— H1/M6/M17 共同依赖的信任边界。
4. **`status`/`statusSource` 服务端钳制**（schema 去字段或限枚举；store 覆写不用 `??`）（H4）。
5. **create-response schema 剥掉 `confirmedBy`**（M6）。
6. **compose 接上 KB 持久**（`TEAMHUB_KB_DATA_FILE`+卷）并**删幻影 Postgres**（H5/M11）。
7. **`deriveErrorCode` 换成按 (project,date) 单调序号**（M9）—— 防同日 error-code 碰撞污染 KB 查找。
