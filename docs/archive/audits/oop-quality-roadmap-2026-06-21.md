<!--
来源：teamhub-oop-quality-audit workflow（run wf_5bf74cc0-14b，2026-06-21）。
62 agents / 8 维 finder / 逐条 opus 对抗核实。裁定：52 findings → 21 genuine-debt + 31 set-aside。
报告先行：本轮零源码改动；落地由 owner 逐批 greenlight，再开独立落地 workflow。
-->

# TeamHub OOP 结构 & 代码质量 ROADMAP

> 报告先行 · 任何改动尚未落地。本文按"风险升序 / 价值降序"分批，供 owner 逐批 greenlight。
> 每条都附 file:line 证据、具体改法、影响文件、verify 命令、铁律检查、工作量。

---

## 1. 摘要

**整体是健康的。** 功能核心三支柱（治理/知识库/库存）读写闭环、宪法铁律（I0 反泄漏 / A1 反排名 / C5 派生优先 / C3 命名写白名单 / G2 单一真相）、以及 contracts + server 的测试覆盖都过硬：

- **铁律落点扎实**：响应 schema 在视图层统一剥 `confirmedBy`（I0），派生主键全是 task/group/dependency/need 无 memberId 维度（A1/A4），status/statusSource 由 store 写时钳制（C5），写口是命名白名单无物理 delete（C3），落盘只进系统库不双写飞书（G2）。
- **契约优先架构成型**：纯派生函数（`derivePresenceSchedule`/`deriveRelayBoard`/`classifyReason`/`applyPartAction`）都在 hub-contracts 里、可单测、有覆盖。
- **fail-closed 持久化已加固**：写链中毒（H2）已修 + 回归测试；schema 字段上限（M17/M18）、空串拒绝（M19）、useRef 序号（L9）、冷启动同步（L10）等长尾审计项均已落地。
- **InventorySnapshot 是 SSOT 范本**：`InventorySnapshotSchema` 在 hub-contracts、类型 `z.infer` 派生，schema 即真相，结构上无法 drift——这是其他快照该向之看齐的标杆。

**真正需要动的，都是潜伏型维护风险，不是活跃缺陷**，集中在三处：

1. **GovernanceSnapshot 的"接口/解析 schema/克隆键表"三处手工同步**（靠一条 SYNC 注释守，无编译期保护）——目前 11/11 字段对得上，但下次给接口加字段时极易漏同步，落盘加载会静默丢字段。
2. **server.ts 路由层的重复样板**（ScheduleSnapshot 装配重复 2 处、safeParse→400 重复 17 处）+ 一处跨窗校验缺失（relay-handoffs）。
3. **hub-console 纯函数 + client 写侧的测试空洞**（buildLanes / actorFromName / date-utils / 库存写方法 / writeToken 鉴权头 / 上传 multipart 路径均零覆盖）。

外加几处低价值清理（死方法、死代码 `void`、stale `as any` 强转）。**没有一项触碰铁律红线**——下面每条都做了铁律检查确认。

---

## 2. 真实结构债（按批次）

> 所有 verify 命令：在受影响包目录跑 `npm run verify:all`（= typecheck && test && build）。涉及 hub-server/src 行为文件改动的，按 AGENTS §7 用 `scripts/bump-version.sh` 升 patch，勿手改。

### 批次 A — Quick-win（最低风险，先做）

纯删除 / 纯类型 / 纯字符串提取，零功能变更或行为等价。

---

#### A1 · ISP-1：删死方法 `resourceSessionsForRollback()`

- **问题**：`InMemoryGovStore.resourceSessionsForRollback()` 是死回滚面——全仓零调用，且 resourceSessions 根本不落盘（`FileGovStore.createResourceSession` 委托 inner 但**不调** `persist()`，D-029 内存设计），其 JSDoc 描述的"persist() 失败时撤回窗口"场景在代码里不存在。
- **证据**：`mock-gov-store.ts:131-138`（方法 + JSDoc）；`grep resourceSessionsForRollback` 全仓仅 1 处命中（自身声明，已核实）。
- **改法**：整段删除该方法及其 JSDoc。**不要**做 finding 里附带的 ISP 接口抽取（`GovRollbackable`/`InvRollbackable` + 重打 `inner` 类型）——组合优于继承是刻意的零重复设计，这些方法结构上必须非 private 才能被组合实例触达；公共 `GovStore`/`InvStore` 接口已正确省略全部回滚方法，真正的 ISP 边界已经干净。其余三个 `@internal` 回滚方法（`snapshotForRollback`/`resourcesForRollback`/`resyncResourceSeq`）原样保留。
- **影响文件**：`apps/hub-server/src/store/mock-gov-store.ts`（仅删 L131-138）。
- **verify**：`cd apps/hub-server && npm run verify:all`。
- **铁律检查**：纯删除，返回类型是无人维度的 `ResourceSession[]`；I0/A1/C5/C3/G2 全不触。
- **工作量**：S。

---

#### A2 · F6：删死代码 `void windowLabel`

- **问题**：`void windowLabel;` 无编译效果（`noUnusedLocals` 未开，仅 `strict:true`；无 ESLint）、无运行时效果，且误导——文件内其它 `void` 全是 `void reply.code(...)` 丢 Promise，读者会误以为 windowLabel 无去处；实则它经 `parsed.data` 整体传入 `store.createRelayHandoff` 并落盘，是承重字段（`deriveRelayBoard` 按 windowLabel 过滤）。
- **证据**：`server.ts:724`（`void windowLabel; // 仅校验已隐含在 schema…`，已核实）；`server.ts:725` 传 `parsed.data` 整体。
- **改法**：删 L724。最干净：从解构里也去掉未单独引用的 `windowLabel`——`const { fromSessionId, toSessionId } = parsed.data;`，注释挪到解构行说明 windowLabel 由 schema `.min(1)` 校验、随 `parsed.data` 透传。
- **影响文件**：`apps/hub-server/src/server.ts`。
- **verify**：`cd apps/hub-server && npm run verify:all`（运行时字节级不变）。
- **铁律检查**：I0 剥 confirmedBy 在响应 schema 处不动；写口仍走 `createRelayHandoff`（C3）；无 status/双写。全安全。
- **工作量**：S。

---

#### A3 · T6 / linting-suppressions：删 stale `as any` + 孤儿 disable 注释

- **问题**：i18n key 上的 `as any` 是**过时残留**——key 早已补进 `translations.ts`（提交时序：key 落于 cfa098d 08:14，cast 落于 9a0fee5 08:28），强转如今反而**击穿** `TranslationKey = keyof typeof zh` 的编译期拼写护栏（decisions.md 488/686/700/800 刻意依赖的 `Record<TranslationKey>` parity）。另有多处 `eslint-disable-next-line` 是孤儿——本仓**无 ESLint**（quality gate = `verify:all`），这些注释悬空无工具消费。
- **证据**：实测仅 **2 处**真 `as any` 在 `t()` 上：`GapsPage.tsx:65`、`SettingsPage.tsx:288`（已核实）；其余 disable 注释（`SettingsPage.tsx:50/52/54`、`ResourcesPage.tsx:60/62/260`）上方是 `Record<…, TranslationKey>` 字面量值或合法 `t()`，无 cast。经验证删全部 8 处后 `npm run typecheck`（strict）exit 0 干净。
- **改法**：
  - `GapsPage.tsx:65` → `t('gaps.card.needCount', { n: gap.evidenceNeedIds.length })`（删 cast + 上方 disable 注释 L64）。
  - `SettingsPage.tsx:288` → `t('settings.section.connection')`（删 cast + L287 注释）。
  - 删 `SettingsPage.tsx:50/52/54`、`ResourcesPage.tsx:60/62/260` 的孤儿 disable 注释（行内字面量/`t()` 已被各自 `Record` 类型检查）。
  - **拒绝** finding 提议的 `safe-keys.ts` helper / "legacy" union 成员——那会在不需要的边界重新引入 `any`，削弱编译期护栏。
- **影响文件**：`GapsPage.tsx`、`SettingsPage.tsx`、`ResourcesPage.tsx`。
- **verify**：`cd apps/hub-console && npm run verify:all`。
- **铁律检查**：纯 i18n 显示键清理，GapsPage 自身注释确认无 memberId（仅 groupId+方向+缺口数，I0/A1 干净）；无 status/端点/双写。全安全。
- **工作量**：S（findings 标 M 偏高，实测 S）。

---

#### A4 · F5：抽 `firstZodMsg` helper，收口 17 处 safeParse→400

- **问题**：`parsed.error.issues[0]?.message ?? <fallback>` 模式**重复 17 次**（实测，非 finding 说的 14），三种 fallback（`'invalid body'`×13、`'windowLabel required'`×2、`'invalid query'`×1）。错误格式若变（如改成返回全部 issues），17 行须一致改。
- **证据**：`server.ts` grep `parsed.error.issues[0]` = 17（已核实）。
- **改法**：模块作用域加一行 helper（用 inline import type，不动顶部 import 块）：
  ```ts
  function firstZodMsg(err: import('zod').ZodError, fallback = 'invalid body'): string {
    return err.issues[0]?.message ?? fallback;
  }
  ```
  17 处替换为 `{ detail: firstZodMsg(parsed.error) }`（query 路由传 `'invalid query'`，两处 windowLabel 路由传 `'windowLabel required'` 并可收回单行 `.send`）。
- **影响文件**：`apps/hub-server/src/server.ts`。
- **verify**：`cd apps/hub-server && npm run verify:all`（routes.test.ts 只断言 400 + `typeof detail==='string'`，行为不变）；按 §7 用 `scripts/bump-version.sh` 升 patch。
- **铁律检查**：`detail` 只携带 Zod 字段形状校验信息，永无人键信号；不改任何读响应 schema。I0/A1/C5/C3/G2 全不触。
- **工作量**：S。

---

#### A5 · F1：relay-handoffs 跨窗 session 校验（含语义缺陷修复 + 测试）

- **问题**：POST `/api/relay-handoffs` 只校验 session ID **存在**（`Set.has`），不校验两个 session 的 `windowLabel` 与 handoff 一致。可 POST `{toSessionId:'sess-convergence-day-r1'(窗 06-28), windowLabel:'06-21'}`——两 ID 都过存在性检查，但 `deriveRelayBoard` 按 windowLabel 独立过滤 stages 与 handoffs，导致接力画布出现悬空边（端点 session 不在该窗 stages 里）。次生：`wouldCreateCycle` 也跨窗汇集 relayHandoffs，污染环检测。
- **证据**：`server.ts:702-708`（仅 `sessionIds.has`）；不变量文档 `governance.ts:500`「fromSessionId → toSessionId 均指向同窗 ResourceSession」+ `fixtures.ts:494`「靠 windowLabel 分流、互不串场」；`relay.ts:98-100` 独立过滤；`relay-route.test.ts` 无跨窗用例。
- **改法**：把仅存在性的 guard 换成单次 fetch 的 Map，一并校存在 + 同窗（复用路由已有的 `listResourceSessions()` 调用，不加额外 store 读）：
  ```ts
  const sessionsById = new Map(
    (await store.listResourceSessions()).map((s) => [s.id, s] as const),
  );
  const fromSession = sessionsById.get(fromSessionId);
  const toSession = sessionsById.get(toSessionId);
  if (!fromSession || !toSession) {
    void reply.code(400).send({ detail: 'from/to session not found' });
    return;
  }
  if (fromSession.windowLabel !== windowLabel || toSession.windowLabel !== windowLabel) {
    void reply.code(400).send({
      detail: 'from/to sessions must belong to the same windowLabel as the handoff',
    });
    return;
  }
  ```
  后续自环/环检测 guard 不变。
- **影响文件**：`apps/hub-server/src/server.ts` + 新增测试 `apps/hub-server/test/relay-route.test.ts`（镜像现有"session 不存在→400"块：`windowLabel=SCENARIO_WINDOW_WEEKDAY` + `toSessionId='sess-convergence-day-r1'`(窗=CONVERGENCE) → 断言 400）。
- **verify**：`cd apps/hub-server && npm run verify:all`；按 §7 升 patch。
- **铁律检查**：只比较 windowLabel（结构键）+ 返回通用 detail 串，无 memberId/confirmedBy 跨边界。I0/A1/C5/C3/G2 全保留。
- **工作量**：S。

---

#### A6 · F2（+F4 顺带）：抽 `buildScheduleSnapshot` helper，收口 2 处装配重复

- **问题**：`/api/schedule`(L540-550) 与 `/api/relay`(L677-686) 的 ScheduleSnapshot 装配块逐字相同（4 次顺序 store 读 + 同一对象 spread）。未来任何装配变化（如接 SqliteGovStore 加异步路径 / 加 ScheduleSnapshot 字段）须改两处，必漏一处。
- **证据**：`server.ts:540-550` ≡ `server.ts:677-686`（唯一差别是 L543 一行内联注释，已核实可执行码字节相同）。
- **改法**：模块作用域加 helper（顺带把 4 个独立顺序 await 改 `Promise.all`，即顺手了结 F4 的并行化；F4 单独看是优化不存在的未来 store，但搭车这里零成本）：
  ```ts
  async function buildScheduleSnapshot(store: GovStore): Promise<ScheduleSnapshot> {
    const [snapshot, resources, resourceSessions, relayHandoffs] = await Promise.all([
      store.getSnapshot(),
      store.listResources(),
      store.listResourceSessions(),
      store.listRelayHandoffs(),
    ]);
    return { ...snapshot, resources, resourceSessions, relayHandoffs };
  }
  ```
  两处替换为 `const scheduleSnapshot = await buildScheduleSnapshot(store);`，L543 解释注释搬进 helper。
- **影响文件**：`apps/hub-server/src/server.ts`。
- **verify**：`cd apps/hub-server && npm run verify:all`（响应体零变化，下游 derivers + fail-closed 响应 schema 不动）；按 §7 升 patch。
- **铁律检查**：返回值与原值逐字段一致，`PresenceScheduleResponseSchema`/`RelayBoardResponseSchema` 仍剥 confirmedBy/拒 memberId（I0/A1）；4 个独立读、无写交错，Promise.all 安全。
- **工作量**：S。

---

#### A7 · M7：三个 list 方法返回浅拷贝（封装对齐 getSnapshot）

- **问题**：`getSnapshot()` 已返回克隆（防外部拿 live 引用 push/splice 绕过写白名单），但后加的三个 list 方法返回 **live 引用**，封装契约不对称。当前消费方全只读（spread/.map/.parse/纯派生），**无活跃缺陷**，但破契约。
- **证据**：`mock-gov-store.ts:286`(`return this.resources`)、`:337`(`return this.resourceSessions`)、`:404`(`return this.relayHandoffs`)；对比 `:119` getSnapshot 走 `cloneArrayFields`。live 可变引用应只经 `@internal *ForRollback()` 派发（`FileGovStore` 回滚正是用 `resourcesForRollback()` 而非 `listResources()`）。
- **改法**：三处改浅拷贝并各加一行 M7 注释：`return [...this.resources];` / `return [...this.resourceSessions];` / `return [...this.relayHandoffs];`。浅拷贝足够（无消费方改元素）。`FileGovStore` 委托 inner，无需改。可选加 store 级测试断言 `listResources() !== resourcesForRollback()` 引用不同。
- **影响文件**：`apps/hub-server/src/store/mock-gov-store.ts`。
- **verify**：`cd apps/hub-server && npm run verify:all`；按 §7 升 patch。
- **铁律检查**：浅拷贝仅换容器，元素身份不变，无新字段暴露；confirmedBy 剥离在响应 schema 处不变（I0/A1）；status 写时钳制不动（C5）。全安全。
- **工作量**：S。

---

#### A8 · DD-1：路由 URL 字符串常量收口（**全量或不做**）

- **问题**：`/api/kb/closeout` 等路由路径在 client 与 server 各自硬编码字符串字面量，server 改名 client 静默 404 无编译信号。schema 已经 hub-contracts 共享（D-052），路径串是 client/server 契约最后一块未收口。
- **证据**：`client.ts:341`(`${baseUrl}/api/kb/closeout`)、`server.ts:948`(`app.post('/api/kb/closeout', ...)`)；无 `api-paths` 模块（grep 干净）。
- **改法**：新建 `apps/hub-contracts/src/api-paths.ts` 导出 `HUB_API_PATHS`，从 barrel 导出；**覆盖全部 ~35 路由**，参数化路由用 builder fn（`taskStatus: (id) => '/api/tasks/${id}/status'`）。server 注册 + client URL 模板引用。**关键：全量或不做**——只保护 2/35 端点的半吊子比统一字面量更糟。
- **影响文件**：新增 `apps/hub-contracts/src/api-paths.ts` + `index.ts`；`apps/hub-server/src/server.ts`；`apps/hub-console/src/api/client.ts`。
- **verify**：三包各 `npm run verify:all`；server 改动按 §7 升 patch。
- **铁律检查**：纯字符串常量提取，不改响应形状/status/端点语义/双写。I0/A1/C5/C3/G2 全不触。
- **工作量**：M（全量机械一次性提交）。**低价值**（单部署 app，client+server 同 commit 同 VERSION，D-074），不优先。

---

### 批次 B — 结构性（SSOT 收口，需触 contracts 包）

风险略高（跨包移动 + passthrough 语义），但价值高：把"三处手工同步"收成一处真相。

---

#### B1 · SSOT-1：GovernanceSnapshotSchema 迁入 hub-contracts + load-time 防丢护栏

- **问题**：`GovernanceSnapshot` 手写 interface（attribution.ts）与解析用 `GovernanceSnapshotSchema`（file-gov-store.ts 私有 z.object）物理解耦，仅靠手写 SYNC 注释守同步。schema 是裸 `z.object()` 无 `.passthrough()`，Zod 默认剥未知键——未来给 interface 加字段但漏加 schema，会在**每次 server 重启的落盘加载**（唯一调用点 file-gov-store.ts:155）静默丢字段。当前 11/11 字段对得上，**无活跃缺陷**，属潜伏维护风险（应为 LOW 非 medium）。对比 InventorySnapshot：schema 在 contracts、类型 z.infer 派生，结构上无法 drift。
- **证据**：`attribution.ts:28-30` SYNC 注释（已核实）+ `:32-47` 11 字段 interface；`file-gov-store.ts:62-74` 11 字段私有 schema、`:155` 唯一 parse 点；`inventory.ts:109-123` 对照范本。
- **改法**：
  1. `attribution.ts` 加 `import { z } from 'zod'`（值导入）+ 把现有 `type` 导入提升为值导入（`GroupSchema/MemberSchema/TaskSchema/DependencySchema/NeedSchema` from `./governance.js`、`KnowledgeNodeSchema/TaskKnowledgeTagSchema` from `./growth.js`、`ArtifactRefSchema` from `./schemas.js`——均已 barrel 导出，无循环依赖：governance/growth/schemas 不反向 import attribution）。导出 `export const GovernanceSnapshotSchema = z.object({ ...11 字段同 file-gov-store... }).passthrough();`。
  2. `file-gov-store.ts` 删本地 schema(L62-74)，改从 `@teamhub/hub-contracts` import。
  3. **保留**手写 `GovernanceSnapshot` interface 不变（D-051 设计锁：interface 非 z.infer，因 `ScheduleSnapshot extends GovernanceSnapshot`）。
  4. **诚实更新 SYNC 注释**：`.passthrough()` 只堵了 load-time 数据丢失这一条腿——新增**数组**字段仍须加进 `GOVERNANCE_ARRAY_FIELDS`(file-gov-store.ts:91-100) 做克隆隔离，否则重蹈 M7/M13 可变快照引用 bug。这不是完整 SSOT 统一。
  5. **推荐 drift-canary**（优于静默 passthrough）：hub-contracts 加一行测试断言 schema key 集 === fixture 形状 GovernanceSnapshot 的 keys，未来接口加字段时**测试失败**而非运行时静默消失。
- **影响文件**：`apps/hub-contracts/src/attribution.ts`、`apps/hub-server/src/store/file-gov-store.ts`、（可选 test）`apps/hub-contracts/test/`。
- **verify**：`cd apps/hub-contracts && npm run verify:all`，再 `cd apps/hub-server && npm run verify:all`；server 改动按 §7 升 patch。
- **铁律检查**：schema 只解析 server 自己序列化的 gov.json（单调用点，从不解析客户端请求体）；`.passthrough()` 无 I0/A1/C5/C3/G2 攻击面；read-response confirmedBy 剥离（M6）与写侧 status 钳制是独立层，不被此 load schema 触及。安全。
- **工作量**：S。

---

#### B2 · SSOT-2：GOVERNANCE_SNAPSHOT_ARRAY_KEYS 单一源（收口克隆键表）

- **问题**：`GOVERNANCE_ARRAY_FIELDS` 在 file-gov-store.ts 与 mock-gov-store.ts **逐字重复**，靠 SYNC 注释守。漏同步则某 store 的克隆漏一个数组→外部读到 live 可变引用绕过写白名单（M7 式隔离破裂）。
- **证据**：`file-gov-store.ts:91-100` ≡ `mock-gov-store.ts:39-48`（已核实两处 grep 命中）；`mock-gov-store.ts:37` 注释承认"逐字对应…须同步两处"。
- **改法**：hub-contracts `attribution.ts` 紧挨 interface 下导出 `export const GOVERNANCE_SNAPSHOT_ARRAY_KEYS: ReadonlyArray<keyof GovernanceSnapshot> = ['groups','members','tasks','dependencies','needs','knowledgeNodes','taskKnowledgeTags','artifacts'] as const;`（attribution.js 已从 index.ts 再导出）。两 store 删本地 const，import 并传给 `cloneArrayFields()`（调用点无需其它改动）。保留 `keyof GovernanceSnapshot` 类型。更新 SYNC 注释注明克隆键表已单源——但**明确保留** `GovernanceSnapshotSchema` 仍须手工同步的警告（B1 才收口那条；若 B1/B2 同批落地则一并更新）。加一行测试断言两 store 的 getSnapshot 对每个键返回的数组与 seed 引用不同。
- **影响文件**：`apps/hub-contracts/src/attribution.ts`、`apps/hub-server/src/store/file-gov-store.ts`、`apps/hub-server/src/store/mock-gov-store.ts`、（test）`apps/hub-server/test/`。
- **verify**：contracts 与 server 各 `npm run verify:all`；server 改动按 §7 升 patch。
- **铁律检查**：仅把内部克隆键表迁入 contracts，不改任何读视图/响应 schema/派生字段/端点/双写。getSnapshot 是内部 API，HTTP 响应在视图层剥 confirmedBy，故此项是 in-process M7 类隔离，**非** I0 读边界泄漏（finding 的 I0 risk 偏高）。安全。
- **工作量**：S。**建议与 B1 同批落地**（同一文件、同一收口主题）。

---

#### B3 · DD-3：displayCode 由 store 内部派生（封死"禁手写"漏洞）

- **问题**：`ResourceDraft = Omit<SharedResource, 'id'|'status'|'statusReason'|'statusSource'|'updatedAt'>` **未** omit `displayCode`，故 draft 接受手写 displayCode。"displayCode 禁手写"（D-072 §3.2 K）仅在 HTTP schema 层（`CreateResourceRequestSchema` omit）守；任何直调 `store.createResource()` 的代码（未来集成 / Hermes / 测试脚手架）可塞手造 displayCode 绕过派生。`status`/`statusSource`/`updatedAt` 已被 omit 且 store 重钉、真正不可设，`displayCode` 是同族派生字段却留口子。持久化测试 `resource-route.test.ts:285/313/325` 已直接塞 displayCode，固化了禁忌模式。
- **证据**：`gov-store.ts:130-133` ResourceDraft；`governance.ts:429` `displayCode: z.string().min(1).optional()`；HTTP 边界已封 `pm-requests.ts:245-252` + 路由 `server.ts:584-596` 经 `deriveDisplayCode` 注入。
- **改法**（取更强方案，使不变量不可破而非仅更好标注）：
  1. ResourceDraft 加 `'displayCode'` 进 Omit。
  2. 各 store `createResource` impl（`mock-gov-store.ts:295-307` + FileGovStore 委托）内重派生：`const displayCode = draft.season !== undefined ? deriveDisplayCode(draft.season, draft.robotTarget, draft.version ?? 1) : undefined;` 与已钉的 status/statusSource 一起设上。
  3. 删路由层冗余派生(`server.ts:584-587`)，draft 仅传人工输入字段（如同从不传 status）。
  4. 改三处持久化测试：draft 去掉 displayCode 字面量，改断言返回/落盘 resource 上的 displayCode（`expect(created.displayCode).toBe('26R2')`），证明 store 派生。
  5. JSDoc 改为"displayCode 由 store 内部经 deriveDisplayCode 派生，调用方绝不传"。
  - 若偏好轻触可退回 finding 方案一（Omit + 重加为带文档的 optional 字段），但 re-derive 严格更优（使不变量不可破 + 消除路由/store 派生分裂）。
- **影响文件**：`apps/hub-server/src/store/gov-store.ts`、`apps/hub-server/src/store/mock-gov-store.ts`、`apps/hub-server/src/server.ts`、`apps/hub-server/test/resource-route.test.ts`。
- **verify**：`cd apps/hub-server && npm run verify:all`；按 §7 升 patch。
- **铁律检查**：不引入 memberId/人维度（I0）；无人对人视图（A1/C2）；不加通用 CRUD 动词（C3——是收窄输入非加面）；不双写飞书（G2）；使 displayCode 像 status 一样 server-owned，**强化** C5 派生优先；写白名单律保留（同名方法、更窄输入）。安全。
- **工作量**：S。

---

### 批次 C — 测试（纯加测，零生产码风险）

全是 hub-console 纯函数 / client 写侧的覆盖空洞。本仓约定「测逻辑不测 DOM」，已有 `carry-over.test.ts`/`theme.test.ts` 范式可循。

---

#### C1 · FT-06：client.ts writeToken → Bearer 鉴权头路径完全无测试 ⚠️最高优先

- **问题**：`writeToken` 是 H3 零鉴权写端点在远程部署时的**唯一客户端侧机制**。`server.ts:208` 把 `authorization === 'Bearer ${writeToken}'` 作为配置后的唯一写门，`main.ts:120` 拒绝非 loopback 主机无 token 绑定。若 `?.trim() || undefined` 吞掉合法 token 或 trim 损坏 token，生产会静默 401 无测试捕获。现有测试**零** writeToken、**零** authorization 断言。
- **证据**：`client.ts:173`(`options.writeToken?.trim() || undefined`)、`:514-516`(sendJson 设头)、`:543-544`(postFormData 同逻辑)；`test/client.test.ts` 无 writeToken。
- **改法**：加两例（沿用 M21 fetcher-mock 范式）：(1) 正向：`createHubApiClient({..., writeToken:'tok-abc'})` → 调 `createTask` → 断言捕获的 `init.headers.authorization === 'Bearer tok-abc'`；并覆盖 multipart 路径（`uploadArtifactFile`，postFormData 有自己一份头逻辑）。(2) 守卫：`writeToken:'  '`（纯空白）→ 断言捕获 headers **无** `authorization` 键（验 L173 守卫）。
- **影响文件**：`apps/hub-console/test/client.test.ts`。
- **verify**：`cd apps/hub-console && npm run verify:all`（纯加测，无生产码、无版本 bump）。
- **铁律检查**：writeToken 是基础设施鉴权凭据，无人维度。I0/A1/C5/C3/G2 全不触。
- **工作量**：S。

---

#### C2 · FT-04：date-utils.ts 7 个导出纯函数零覆盖

- **问题**：`toIso/toMd/isoToday/isoTomorrow/isoDayAfter/isoPrevDay/relativeSegments` 零测试。`isoPrevDay` 用于 RelayCanvas.tsx:577 接力 carry-over（schedule 最 I0 关键路径之一）；line 42 防护 `if (!m) return iso`（legacy 自由文本 windowLabel 如'今晚'不崩）无测试；`toIso` 刻意避 `toISOString()` 防 UTC 偏移日移是核心正确性不变量却无回归测试。
- **证据**：`date-utils.ts` 导出 7 函数；`test/` 无 date-utils/isoPrevDay grep 命中；`RelayCanvas.tsx:577` + `SchedulePage.tsx:28` 消费。
- **改法**：新增 `test/date-utils.test.ts`（vitest，match theme.test.ts 纯逻辑风格）。**始终传显式 Date 参数**确保确定性。用例：(1) `toIso(new Date(2026,5,21))==='2026-06-21'`（local 非 UTC）；(2) `isoPrevDay('2026-03-01')==='2026-02-28'`（月界非闰）；(3) **加闰年硬化** `isoPrevDay('2024-03-01')==='2024-02-29'`；(4) `isoPrevDay('2026-01-01')==='2025-12-31'`（年界）；(5) `isoPrevDay('今晚')==='今晚'` 与 `isoPrevDay('')===''`（L42 守卫无抛）；(6) `relativeSegments(new Date(2026,5,21)).map(s=>s.iso)===['2026-06-21','2026-06-22','2026-06-23']` + 断言 labelKeys；(7) `toMd(new Date(2026,5,21))==='6/21'`。
- **影响文件**：新增 `apps/hub-console/test/date-utils.test.ts`。
- **verify**：`cd apps/hub-console && npm run verify:all`。
- **铁律检查**：纯日期数学，无人键信号；carry-over 的 I0 守卫（invitedMemberIds=[]/eta=null）在 `buildCarryOverDraft` 已被 carry-over.test.ts 覆盖，本测不削弱。全安全。
- **工作量**：S。

---

#### C3 · FT-01：buildLanes 纯函数（RelayCanvas）未导出未测

- **问题**：`buildLanes(stages): Lane[]` 纯函数（按 resourceId 分组保首现顺序，每泳道按 orderInWindow 排序）模块私有、零测试。回归（如按 resourceId 排泳道）会损坏泳道渲染且无测捕获。姊妹 `buildCarryOverDraft` 已抽出独立 .ts 并单测——同范式可循。
- **证据**：`RelayCanvas.tsx:51-67`；grep `buildLanes` 仅定义处。
- **改法**：把 `buildLanes` + `Lane` 类型抽到新 `src/features/schedule/relay-lanes.ts`（**勿**从 .tsx 导出——本仓约定测试避免 import .tsx 以躲 @xyflow CSS 副作用），RelayCanvas import 回来。新增 `test/relay-lanes.test.ts`，最小 `RelayStage` fixture，4 例：空→`[]`；单资源多 stage→一泳道按 orderInWindow 升序；两资源交错(A,B,A)→恰两泳道按首现序（非 resourceId 序）；单资源 orderInWindow [2,0,1]→泳道内 [0,1,2]。
- **影响文件**：新增 `apps/hub-console/src/features/schedule/relay-lanes.ts`（+ RelayCanvas.tsx import）、新增 `test/relay-lanes.test.ts`。
- **verify**：`cd apps/hub-console && npm run verify:all`。
- **铁律检查**：`RelayStage` 结构上无 memberId（sessionId/resourceId/groupId/orderInWindow），测之不触人键信号。I0/A1/C5/C3/G2 全安全。
- **工作量**：S。

---

#### C4 · FT-03：actorFromName 纯函数（PmCreatePanel）未导出未测

- **问题**：`actorFromName(name): ActorRef|null` 产出依赖/需求创建的 `confirmedBy`（I0 敏感）。空/空白→null；非空→`{id:kebab, displayName:trim, source:'console'}`。零测试。
- **证据**：`PmCreatePanel.tsx:567-572`，仅 L341/L448 引用；`'console'` 是合法 ActorRef.source（common.ts:16）。
- **改法**：抽到 sibling 纯模块 `src/features/pm/actor.ts`（镜像 carry-over 约定），PmCreatePanel import。新增 `test/pm-create.test.ts`：(1) `''`→null；(2) `'   '`→null；(3) `'张 三'`→`{id:'张-三', displayName:'张 三', source:'console'}`；可选 (4) `'m-1'` 幂等。直接断言"空/空白 confirmer 产 null confirmedBy"的 I0 不变量。**勿**塞进无关的 `archive-depgraph-bugs.test.ts`。
- **影响文件**：新增 `apps/hub-console/src/features/pm/actor.ts`（+ PmCreatePanel import）、新增 `test/pm-create.test.ts`。
- **verify**：`cd apps/hub-console && npm run verify:all`。
- **铁律检查**：测之**强化** I0（钉死空 confirmer→null）；不触 A1/C5/C3/G2。安全。
- **工作量**：S。

---

#### C5 · FT-09：layoutGraph 纯函数（DepGraphPage）未测，dagre 映射未验

- **问题**：`layoutGraph(graph): {nodes,edges}` 调 dagre 后映射成 ReactFlow Node/Edge，模块私有零测试。不变量：每入节点→一出节点 `type:'dep'`；blocking 边→`animated:true`；非 normal 边→`strokeWidth:2.2`，normal→1.5；`data.depNode` 身份；`stroke`/`markerEnd.color === EDGE_COLORS[kind]`。
- **证据**：`DepGraphPage.tsx:143-174`；`toCycleDeps` 已在 `dep-graph-cycle-guard.test.ts` 测，同法可循。
- **改法**：抽纯映射到新 `src/features/dep-graph/dep-graph-utils.ts`（导出；**勿**从 .tsx 导出，避 @xyflow CSS）。新增 `dep-graph-layout.test.ts`，最小 DepGraph fixture（2 节点 + 一 blocking + 一 normal 边）。**只断结构不变量**：节点数相等且 `type:'dep'`；`data.depNode` 身份等同；`animated === (kind==='blocking')`；`strokeWidth` 按 **kind**（非 isCritical——finding 措辞不准，是 `kind!=='normal'→2.2`）；`stroke`/`markerEnd.color === EDGE_COLORS[kind]`。dagre `position.x/y` 仅断 `Number.isFinite`，**绝不**断确切值（dagre 输出非契约）。
- **影响文件**：新增 `apps/hub-console/src/features/dep-graph/dep-graph-utils.ts`（+ DepGraphPage import）、新增 `test/dep-graph-layout.test.ts`。
- **verify**：`cd apps/hub-console && npm run verify:all`。
- **铁律检查**：映射结构键（group/robot/status），不触 confirmedBy(I0)/排名(A1)/status 派生(C5——status 仍 server-owned 透传)。安全。
- **工作量**：M（dagre + 抽取）。**低价值**（硬化第三方 layout 上的薄三元胶水），可后置。

---

#### C6 · FT-05：client.ts 库存写方法无覆盖

- **问题**：`upsertPartType`(POST /api/inventory/part-types) 与 `recordPartAction`(POST /api/inventory/actions) 走与已测写方法同一 `postJson`，但 INV 建时漏加测试。路径/schema 正确性未验。库存契约本身已被 server `inv-routes.test.ts` + contracts `inventory.test.ts` 覆盖——空洞窄在 console 接线。
- **证据**：`client.ts:391-408`；`test/client.test.ts` grep 零 upsertPartType/recordPartAction。
- **改法**：`test/client.test.ts` 加一块「库存写侧」（镜像 M21 块 L189）。fetcher mock 按路径分发：`/api/inventory/part-types` 返 `{partType: inventoryScenarioFixture.partTypes[0]}`、`/api/inventory/actions` 返 `{action: inventoryScenarioFixture.actions[0]}`（fixture 已从 hub-contracts 导出）。每方法断言：URL 命中、`method==='POST'`、body round-trip、响应解析不抛。**recordPartAction 请求体勿带 recordedBy**（server 钉 source，C5），不断言 memberId（schema 结构排除，I0）。可选顺带 `getInventory` 读方法。
- **影响文件**：`apps/hub-console/test/client.test.ts`。
- **verify**：`cd apps/hub-console && npm run verify:all`。
- **铁律检查**：`recordedBy` 永无 memberId（inv-bom-core.md:70），I0 守；不设 recordedBy(C5)；测命名写白名单方法**强化** C3。安全。
- **工作量**：S。

---

#### C7 · FT-07：uploadArtifactFile（postFormData multipart 路径）未测

- **问题**：`uploadArtifactFile` 是唯一走 `postFormData` 的方法——唯一构造 FormData 且**刻意省 content-type** 让浏览器设 multipart boundary 的路径。server 端点已被 `artifact-upload.test.ts` 覆盖，但 console 客户端 FormData 构造未验（content-type 省略契约易被静默破坏）。
- **证据**：`client.ts:375-382`(uploadArtifactFile)、`:534-553`(postFormData)；`test/client.test.ts` 无 upload。`UploadArtifactResponseSchema === {artifact: ArtifactRefSchema}`，fixture 复用 `governanceScenarioFixture.artifacts[0]`。
- **改法**：加测试：fetcher 对 `/upload` 结尾路径返 `{artifact: governanceScenarioFixture.artifacts[0]}`。`await client.uploadArtifactFile('artifact-gripper-v1', new File(['data'],'chassis.pdf'))` → 断言：res.artifact.id 真（验解析）；URL 以 `/api/artifacts/artifact-gripper-v1/upload` 结尾；`init.method==='POST'`；`init.body instanceof FormData`；content-type **未**手设（`headers['content-type']===undefined`，浏览器掌 boundary）。Node v24 全局 File/FormData，默认 Node env 无需额外 setup。可选加 writeToken 变体验 Bearer 经 postFormData。
- **影响文件**：`apps/hub-console/test/client.test.ts`。
- **verify**：`cd apps/hub-console && npm run verify:all`。
- **铁律检查**：upload 携 storedFile 无人维度；FormData body/headers 断言不泄人键。`/upload` 是命名子动作非通用 CRUD(C3)；source/submittedVia server 钉(C5)。安全。
- **工作量**：S。

---

#### C8 · FT-08：utils.ts helpers（parseList/errorDetail/segClass）跨特性使用却无测

- **问题**：三个 helper 被多 feature 文件用（parseList: 2 处；errorDetail: 6 处；segClass: 6 处），零测试。`parseList` 边界对表单提交（tags/collaborators/neededSkills）承重：空→[]、单值→['x']、尾逗号→不带空尾、逗号间空白裁剪。
- **证据**：`utils.ts` 三纯 helper；grep 确认跨特性使用 + 零测试。
- **改法**：新增 `test/utils.test.ts`。parseList：`''`→[]、`'x'`→['x']、`'a,b'`→['a','b']、`'a,b,'`→['a','b']（无空尾）、`' a , b '`→['a','b']。errorDetail：`new Error('m')`→'m'、非 Error `'oops'`→'oops'。segClass：`true`→含 `--active`、`false`→不含。纯函数无 mock 无 DOM，镜像 theme.test.ts 风格。
- **影响文件**：新增 `apps/hub-console/test/utils.test.ts`。
- **verify**：`cd apps/hub-console && npm run verify:all`。
- **铁律检查**：utils.ts 零人键面（无 confirmedBy/silence/status）；观察性测试不触任何铁律。安全。
- **工作量**：S。

---

#### C9 · SSOT-5：GovernanceSnapshotSchema 字段覆盖回归测试

- **问题**：persist 测试只断各自写过的字段，不断**全部** GovernanceSnapshot 字段经 parse() 存活。若 schema 漏一字段，Zod 静默剥，测试仍过。首个 drift 征兆将是生产重启静默丢数据而非测试失败。`artifacts` 偶然被守（seed + appendArtifact 测断言其存活），其余 10 字段裸奔。
- **证据**：`gov-store-persist.test.ts:17-61`；grep `GovernanceSnapshotSchema` 在 *.test.ts 零命中；对比 InventorySnapshot 因 z.infer 不可漏。
- **改法**：加测试（`gov-store-persist.test.ts` 或新 `gov-store-schema.test.ts`）：导出当前私有的 `GovernanceSnapshotSchema`（导出无害，使可直测）；`const parsed = GovernanceSnapshotSchema.parse(JSON.parse(JSON.stringify(governanceScenarioFixture)))` 然后 `expect(Object.keys(parsed).sort()).toEqual(Object.keys(governanceScenarioFixture).sort())`。fixture 是 typed GovernanceSnapshot 字面量，TS 强制其携全部必填键，故传递性证明 schema ⊇ 接口必填字段——未来加字段漏 schema 即测试失败而非生产静默丢。可选加"缺一数组字段则拒"的 fail-closed 断言。**勿**折进 SSOT-1（那是更大重构），此独立测试是最小独立守卫。
- **影响文件**：`apps/hub-server/test/gov-store-persist.test.ts`（或新文件）+ `file-gov-store.ts` 导出 schema。
- **verify**：`cd apps/hub-server && npm run verify:all`。
- **铁律检查**：纯加测，构内存 blob 调 parse 断 keys；不触任何读写路径/派生字段/端点/双写。安全。
- **工作量**：S。**注**：若 B1 落地，schema 迁入 contracts 后此守卫可改成对 contracts 内 schema 断言，或被 B1 的 drift-canary 取代——两者择一即可，避免重复。

---

## 3. 刻意不动（set-aside）

每条一行理由。**default-to-deliberate**：代码/注释/决策已证成的模式不当债处理。

| ID | 标题 | 不动理由 |
|---|---|---|
| SSOT-3 | KbSnapshot 同型三处同步 | **刻意设计**：与 Gov 同口径的 fail-closed load 边界（attribution.ts SYNC 注释明指 KB 是 intended matching pattern）；提议"mirror Inventory"本身事实错误（INV 也重复数组键表）。 |
| SSOT-4 | INVENTORY_ARRAY_FIELDS 双处重复 | **刻意设计**：六处一致模式（Gov/KB/Inv×两 store）+ 注释化 SYNC 契约；该键表是 store 写时可变隔离子集，迁入 contracts 会把 server 内部 mutation 细节泄进纯契约层。 |
| ISP-2 | 跨支柱 closeout 写无补偿路径 | **刻意设计**：server.ts:982-987 五行注释明述 saga-without-compensation MVP（log+throw+幂等 upsert 重试自愈）；提议的 rollback 会引入物理 delete 违 C3 写白名单。 |
| F3 | 1023 行 buildHubServer 单体 | **刻意设计**：专属设计文档 `core-plugin-architecture.md` 标"待决策未 locked"，14-agent 评审建议 YAGNI 延后；AGENTS §5 框架引入/大重构需白天审批；且提议的 fastify-plugin 子实例会危及 I0 写边界 hook（非铁律安全）。 |
| F4 | 四次顺序 store 读应 Promise.all | **无效**：前提错误——FileGovStore 读路径**无文件 IO**（构造时一次载入内存），await 微任务即解；只对不存在的 SqliteGovStore 有意义。已在 A6 顺手并行化。 |
| DD-2 | applyPartAction 双 switch | **刻意设计**：逐字镜像 locked spec `inv-bom-core.md §2` 的两列表（按数量件 vs 个体件），两 switch 是不同语义 seam 非同级重复；合并反而重引 guard。 |
| DD-4 | capacityFeasibility 阈值魔数 | **刻意设计**：单 5 行纯函数内、相邻 JSDoc 已拼出含义（0冲突/1紧/≥2充裕），D-029 open 已在码/文档/changelog 三处记其临时性；提取常量是文件一贯回避的 ceremony。 |
| FT-02 | groupArtifacts 纯函数未测 | **无效**：finding 核心 bug 不存在——`if(!byOwner.has(og))` 已对 null 去重，不会产重复 null section（实测一个 null section）；"未导出"是本仓刻意约定（测镜像纯函数非导出组件内部）。 |
| T1 | 无 ESLint 配置 | **刻意设计**：TS strict（含 noUnusedLocals/Parameters）作 lint floor 是既定 posture；引 5 个 devDep + flat config + 接 verify gate 属 §5 框架引入需审批；7/9 disable 注释是 stale no-op。 |
| T2 | 无 Prettier 配置 | **刻意设计**：D-066 §5「不做全套 CI」+ D-074 §4「不引根 package.json」两 ADR 明拒；小作坊 LAN-only，格式靠 TS strict + reviewer。 |
| T3 | 无 root npm workspace（M20） | **刻意设计（已延后）**：= 跟踪项 M20，code-audit/backlog/decisions/completed-log 四处记"workspace infra 侵入·决策门"反复排除；dist race 仅理论（无并行 build workflow）。 |
| T4 | Node 版本三处指定 | **已修复**：= L12（.nvmrc+三 package.json engines+Dockerfile 钉版本），completed-log 记 DONE；三 format 是各工具所需表示、均同步 major 24。 |
| T5 | React hooks eslint-disable 无理由 | **刻意设计**：ESLint 未配置故注释惰性；上方两行注释已述刻意冷启动单向同步 + 防覆盖 guard，linter 名义修法会每键击重跑 effect（错）。 |
| T7 | 无 pre-commit/lint-staged hook | **已修复**：D-074 已落 scripts/pre-commit.sh + install-hooks.sh（secret 扫描 + 空白 + 版本 sentinel + 可选 PRE_COMMIT_VERIFY=1 跑 verify:all）；提议的 lint-staged 链调用不存在的 ESLint/Prettier。 |
| H2 | 写链 IO 错误中毒 | **已修复**：三处写链均带 `op.catch(()=>undefined)` 复位 + persist() 返真 op promise；kb/gov-store-persist 测试注入失败后断言后续写仍落盘。 |
| M9 | deriveErrorCode `% 1000` | **刻意设计**：`% 1000` 是承重格式护栏（NNN 须恰 3 位，padStart 不截断），改裸 sequence 会在第 1000 次同日 closeout 产 4 位→违 ERROR_CODE_PATTERN→500，是净回归。 |
| M14 | ReactFlow 选中态分裂 | **已修复**：commit 989dd32，`displayNodes` memo 从单源 `selectedId` 派生 selected 标志，含程序化 focusTaskId 跳转。 |
| M16 | tab panel 缺 ARIA 关联 | **已修复**：commit 3a22e30，tab 按钮加 id + panel 包 `role=tabpanel`+aria-labelledby+tabIndex（PmCreatePanel/KbSearchPage 双向关联完整）。 |
| M17a/M17b/M18/M19 | KB schema 缺上限/允空串/延迟校验 | **已修复**：kb.ts/kb-closeout.ts 字段均带 `.max()` 上限常量 + `.min(1)` + `.trim()`；server bodyLimit 256KB；提交 e70916f/22a66a6/052285d。 |
| M20 | 无 root workspace · contracts 编译两次 | **刻意设计（已延后）**：见 T3；Dockerfile 串行编两次无容器内 race；§5 侵入 infra 决策门排除。 |
| N3 | sharedResourceBusy 死分支 | **已修复**：attribution.test.ts:85-127 三例驱动该分支 + I0 回归守（断言无 member/owner/count/rank 键）。 |
| L7/L8/L9/L10/L11 | KbSimilarParams projectId / updatedAt 弱 schema / seq 跨挂载 / 冷启动 defaults / fitView | **全已修复**：projectId 已链路打通；updatedAt 已 isoDateTimeSchema；seq 已 useRef 实例级；冷启动 useEffect 已加；L11 moot（SOURCE 恒 'real'/nodesDraggable=false）。 |
| non-null-assertions | 归因/归档非空断言 | **刻意设计**：两处 `!` 均有前置 set/has 保证（`noUncheckedIndexedAccess` 未开故技术冗余但自文档）；全仓仅 2 处，无 lint 规则；finding 提议的预播种已实现于 attribution.ts:201。 |
| console-logging | import CLI 的 console.log | **刻意设计**：全在 CLI `main()` 入口（isCli 门），与 main.ts 一致约定；runImport 核心返结构化 summary 不 log；无 no-console 规则。 |
| json-parse-in-hub-gateway | lark-gateway JSON.parse | **无效**：hub.ts/message-handler.ts 均已 try/catch + 运行时 `typeof` 守卫优雅降级；finder 自标 "No change required"，无债可改。 |

---

## 4. 建议执行顺序（批次依赖）

```
批次 A（Quick-win，独立可并行，最先做）
  A1 删死方法 ── 独立
  A2 删 void  ── 独立
  A3 删 as any ── 独立（hub-console）
  A4 firstZodMsg ── 独立（hub-server）
  A5 relay 跨窗校验 ── 独立（hub-server，含测试）
  A6 buildScheduleSnapshot（吃掉 F4）── 独立（hub-server）
  A7 M7 浅拷贝 ── 独立（hub-server）
  A8 路由 URL 常量（全量或不做）── 低价值，可单列或缓做
        │
        ▼
批次 B（结构性 SSOT，触 contracts 包；B1+B2 强烈建议同批）
  B1 GovernanceSnapshotSchema 迁 contracts + passthrough + drift-canary
  B2 GOVERNANCE_SNAPSHOT_ARRAY_KEYS 单源  ── 与 B1 同文件同主题，同批落地
  B3 displayCode store 内派生 ── 独立于 B1/B2，可并行
        │
        ▼
批次 C（测试，零生产码风险，可随时插队；除 C9 外不依赖 A/B）
  C1 writeToken Bearer ⚠️最高优先（H3 部署门关键）
  C2 date-utils（I0 邻接 carry-over）
  C3 buildLanes ·  C4 actorFromName（I0 confirmedBy）·  C6 库存写 ·  C7 upload multipart ·  C8 utils
  C5 layoutGraph（低价值，可最后）
  C9 GovernanceSnapshotSchema 覆盖测试 ── 若 B1 落地则与 B1 的 drift-canary 二选一，避免重复
```

**关键依赖与提示**：

1. **A6 吃掉 F4**：buildScheduleSnapshot 顺手把 4 次顺序读改 Promise.all，F4 无需单列。
2. **B1 + B2 同批**：同改 `attribution.ts` + 两 store，分批会两次触同文件 + 两次 SYNC 注释更新。落地后**统一**更新 SYNC 注释。
3. **C9 与 B1 互斥取一**：B1 落地后 schema 在 contracts、可加 drift-canary，C9 的独立守卫可省（或反之先做 C9 当独立最小守卫，B1 再收口）。**勿两者都做**造重复。
4. **C1 最该先做**：是远程部署（REMOTE-ACCESS-DEPLOY / H3）的写鉴权唯一客户端机制，部署前必须有测试守。
5. **批次内并行**：A、C 各项彼此独立可并行 greenlight；B 内 B3 独立于 B1/B2。
6. **版本 bump**：凡触 `apps/hub-server/src` 行为文件（A4/A5/A6/A7/B1/B2/B3）按 AGENTS §7 用 `scripts/bump-version.sh` 升 patch，**勿**手改 VERSION。纯测试加测（批次 C 多数）无需 bump。
7. **铁律总结**：本 ROADMAP 全部条目经铁律检查，**无一触碰** I0/A1/C5/C3/G2 红线——B1 的 .passthrough() 只作用于 server 自己 gov.json 的 load（单调用点、从不解析客户端输入），B3 反而**强化** C5，C1/C4 的测试**强化** I0。
