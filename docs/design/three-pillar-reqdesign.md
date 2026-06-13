---
status: analysis
date: 2026-06-13
owner: Teamhub
scope: requirement-design-analysis
decision: D-040（采纳破冰顺序 + 首任务收敛）
source: 14-agent dynamic workflow（5 haiku 资产盘点 → 4 sonnet 设计 → 4 对抗核实[base=opus] → 1 opus 综合）
---

# 三支柱 + 共享底座 需求设计分析（D-039 落地路径）

> 本文是 D-039「战队内部协作工具三支柱」的需求设计分析记录，**非默认读取链**（选 frontier 任务 / 破冰时读）。
> 权威决策见 `decisions.md` D-040；任务行见 `backlog.md`。对抗核实层用 grep 实证抓出了初稿设计的错误，下文结论已据此收敛。

## 1. 破冰顺序（采纳）：`base → kb → pm → inv`

| 序 | 根 | 理由（含实证） |
|---|---|---|
| 1 | **共享底座** `HUB-SERVER-GOV-SCAFFOLD` | grep 实证唯一无争议起点：`server.ts` 仅 9 条 mock 路由 + `:100` `setNotFoundHandler`，零治理路由；`hub-console/src/api/client.ts:87` real 模式打 `GET /api/dep-graph` 而该端点**未注册**（404）。三根都依赖一个能读写的 Store + 出入口。 |
| 2 | **知识库** `KB-LIBRARY` | 痛点最高频最锐（同一 CAN/MicroROS/电机 bug 跨赛季重踩，单次 1–4h）；相似 bug 提示是纯读取派生、见效快。排 2 因移植债未清（见 §3）。 |
| 3 | **项管看板** `PM-BOARD` | 日频、最省力，但「录入绑在建任务动作」是自我引用——任务录入 UI 本身就是要新建的；写入链最重、依赖底座。 |
| 4 | **库存/BOM** `INV-BOM`（P1） | 自保鲜双上游（飞书 Bitable 拉取 + AI 读图）未落地，就绪前只剩人工录入 ≈ 死表。 |

## 2. 共享底座首任务（收敛后，frontier#1 的第一刀）

**对抗核实推翻了初稿**：底座初稿铺了 8 条 `/api/governance/*` GET，但 verify(opus) 实证前端实际只缺 `/api/dep-graph` 这一条，初稿偏偏没有它，反而铺了一堆暂无消费方的端点 + 写入簇 + 双 drizzle stub（违 C3）。收敛后第一刀：

**首任务 = 注册 `GET /api/dep-graph`**，直接 `return DepGraphSchema.parse(toDepGraphView(snapshot, clock.now().toISOString()))`，snapshot 来自新建 `MockStore(seed governanceScenarioFixture)`。

**DoD**：① `src/store/gov-store.ts`（`GovStore` interface，本任务只读方法）② `src/store/mock-gov-store.ts`（`InMemoryGovStore`，构造接受 `seed?`，默认 `governanceScenarioFixture`）③ `src/clock.ts`（`Clock`/`RealClock`/`MockClock`）④ `server.ts:100` 404 handler 前注册路由，`BuildHubServerOptions` 扩展 `store?`/`clock?`（默认 MockStore + RealClock）⑤ `curl /api/dep-graph` 200 且过 `DepGraphSchema.parse`；console real 模式 DepGraph 页不再 404 ⑥ `test/dep-graph-route.test.ts`（复用 `routes.test.ts` 的 `app.inject`+`parse` 模式）⑦ `hub-server` + `hub-contracts` `verify:all` 全过、单任务 commit、**STOP 不顺推写入簇** ⑧ C2 自检：返回主键全是 task/group/dependency/need，无 memberId 维度。

**边界（本轮不做，守 C3）**：POST/PUT 写入簇（避免被当主录入口退化成新死表 + 触 G2 双写）、`GET /api/governance/presence`（依赖已挂起的 D-032~035）、`bootstrap` 的 drizzle 双 stub、PUT 状态机/DAG 环检测/FK 强制；`projectId` 写死 `prj-robots`、缺省不校验。

**接口契约草图**：
```ts
// src/store/gov-store.ts —— 本轮只需读方法（写方法后置）
export interface GovStore {
  getSnapshot(projectId: string): Promise<GovernanceSnapshot>;
  // listGroups/listMembers/listTasks/... 按需，写方法（createTask 等）后置
}
// src/clock.ts
export interface Clock { now(): Date; }
export class RealClock implements Clock { now() { return new Date(); } }
export class MockClock implements Clock { constructor(private f: Date) {} now() { return this.f; } }
// server.ts
export interface BuildHubServerOptions {
  consoleDistDir?: string;
  store?: GovStore;  // 默认 InMemoryGovStore(seed governanceScenarioFixture)
  clock?: Clock;     // 默认 RealClock
}
// GET /api/dep-graph → DepGraphSchema.parse(toDepGraphView(await store.getSnapshot('prj-robots'), clock.now().toISOString()))
```
实证：`toDepGraphView` @ `attribution.ts:270`（签名 `(snapshot, now: string)`）；`DepGraphSchema` @ `governance.ts:306`；`governanceScenarioFixture: GovernanceSnapshot` @ `fixtures.ts:237`。

## 3. 逐根设计摘要 + 最大风险

- **base**：为 hub-server 加 `GovStore` interface + `MockStore`(seed) + `Clock` 注入 + CRUD 路由骨架。**风险**：范围易一把梭（违 C3）→ 已按 §2 收敛为读取链第一刀。
- **kb**：从 Probe_Flash 移植 `IssueCard/ErrorEntry/ArchiveDocument/closeout/similar-issues` 到 `hub-contracts/src/kb.ts`，做知识树浏览 + 相似 bug 提示 + 结案副产品自动挂 `KnowledgeNode` + 飞书拉资料。**风险（移植债，落地前必处理）**：`rankSimilarIssues` 核心输入是 `IssueCard[]` 非 `ErrorEntry[]`（需 adapter）；`buildCloseoutFromIssue` 读 `normalizedSummary/relatedFiles` 而新 `DebugIssueCardSchema` 若删这两字段会 TS 报错；`R5` 的飞书 wiki API method 名 + lark bin 名需 WSL2 实测（见 LARK-BIN-PROBE）。
- **pm**：状态列看板 + 列表双视图，任务详情侧板显示依赖上游（**任务名非人名**）/ 未满足 Need / 协作者；依赖录入并入建任务动作，AI 预填 `confirmedBy=null` 不参与归因。**风险**：「录入绑已有动作」自我引用（录入 UI 本身要新建）；继承 freeIdle 测量错误（读手填 `Member.status`，属已挂起治理派生债）→ 看板比 DAG 显眼会放大误判，本轮 UI 降级标注「状态待确认」、不修底层（守 D-039 边界）。
- **inv（P1）**：新建 `PartStock/BomEntry` schema，零件余量台账 + 每车 BOM 核对 + 坏件追踪，AI 读图提取 BOM 草稿须人确认，飞书 Bitable 单向拉取。**风险**：自保鲜双上游悬空（AI 读图依赖 pending 的 `HUB-ARTIFACT-STORE-MECH`、bitable method 名无实证）；`reuseMap` 多处幻觉（详见 §4）。

## 4. 跨根风险（落地前必处理）

1. **lark bin 双语义债**：`cli-bridge.ts:17/47` 调 `execa('lark', …)` 但 `:22` 报错写 `'lark-cli not found'`，KB 与 INV 设计对修复方向判断相反 → 单拆 `LARK-BIN-PROBE` 微任务先实测定论（见 backlog）。
2. **跨根 store 重复建设**：base 的 `GovStore` interface 必须可被 kb/inv 扩展（同一 MockStore 多 seed 几张表），否则四次重建底座。
3. **派生上游悬空**：本轮落地的是「读取+展示派生结果」，真实派生链（git/lark→进度、AI 读图）未接通 → **别宣称已解 C1**（用着就更新）。
4. **reuseMap 幻觉**（主 INV，部分 KB）：把「需新建/改 schema/跨仓提取」包装成「直接复用」→ 每根落地前 `reuseMap` 逐条 grep 验真，分开标注「复用 vs 新建/变更」。
5. **未验证飞书 API method 名**（`wiki.v1.documents.get` / `bitable…record.search`）：须 WSL2 `lark-cli` 实测后才进 `boundary.ts` 白名单，否则静默失败。
6. **C2/freeIdle 测量错误继承**：属已挂起治理派生债（D-031/D-039 边界），PM 只 UI 降级标注、不修底层。
7. **原子任务纪律**：各根 `buildNew` 都是多文件跨三层大块，必须按 atomic-task 拆，base 首任务只做 §2 的读取链、做完 STOP 不顺推。

## 5. 复用资产盘点要点

- **hub-contracts**：`Task/Dependency/Need/Group/Member`（状态机/owner 齐，PM 仅缺 `dueDate/priority` 两字段）、`growth.ts` `KnowledgeNode/MemberKnowledge/TaskKnowledgeTag`（KB 底座，护栏在 schema 形状）、`attribution.ts` `toDepGraphView/deriveBlockAttributions`（纯函数）、`fixtures.ts` `governanceScenarioFixture`。
- **Probe_Flash**（`~/ruolin_huang/Probe_Flash`，同源）：`IssueCard→InvestigationRecord→ErrorEntry→ArchiveDocument` Zod 链 + `buildCloseoutFromIssue`/`rankSimilarIssues` 纯函数（KB 可移植，注意 §3/§4 债）。
- **hub-server**：Fastify 壳，9 条 mock 路由，无持久层、无治理路由。**hub-console**：React/Vite 壳，`client.ts` mock/real 切分，DAG 页（@xyflow）可作 KB/PM UI 模式。**lark-toolkit**：`boundary.ts` 白名单当前仅 `im.v1.message.create`，wiki/drive/bitable 走 CLI 通道（bin bug 待修，见风险 1/5）。
