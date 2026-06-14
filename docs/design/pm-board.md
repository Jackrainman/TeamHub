---
status: implemented-partial
date: 2026-06-14
owner: Teamhub
scope: 项目计划表（PM-BOARD）设计 + 后端录入簇/读视图落地说明
decision: D-045（PM 后端录入簇 + 读视图落地；console 看板 UI 后置）
frontier: '#1 PM-BOARD（KB-CORE 后第二支柱；本轮后端，console UI 下一轮）'
source: §6.B continuous-build 连续构建（PM-U1 + 录入簇 slice 各自 verify+commit）+ 2-opus 对抗核实 + 用户拍板 Q1/Q2
---

# 项目计划表（PM-BOARD）设计

> D-039 三支柱之②「项目计划表」（原"项管看板"，D-041 改名定调）。**非默认读取链**（PM 相关任务时读）。
> 权威决策见 `decisions.md` D-045 / D-041（定调）/ D-042（收口）；任务行见 `backlog.md` PM-BOARD-DESIGN。

## 0. 一句话

围**任务**转（不围人转）的一份**全员可见**共享真相：任务 + 谁负责 + 依赖图 + 卡住原因（结构键）+ 缺口。
消灭"我以为"，**不按人天数、无甘特、不显示谁快谁慢**（C2 反排名 / I0 反监视）。

## 1. 定调（D-041）+ 收口（D-042）

- **中心实体 = 任务**（每实体各有简单 id，真问题是"围着什么转"=任务）。
- **全员可见**（推翻上一轮"只管理者看"）：依赖图 + 状态 + 缺口 + 分工。
- **卡住必带原因 = 结构键**：在等哪个上游任务/组/Need；点开才见组，对接才见人；**禁"光秃秃天数+人名"**。
- **无甘特**（违 G4 暂缓）；**不按人天数/快慢/在不在干活**（人治视图封存，D-041 7③）。
- **D-042 收口**：删 `Member.status`/freeIdle 任何展示通道（取最新版 D-041）；`dueDate` 本轮不引入（G4）；
  `priority` 改 `criticalChain` 派生；`blockedBy` 走 Dependency 边由 `toDepGraphView` 派生、**不在 Task 上另存**（G2）。

## 2. 复用资产（不新建领域模型）

`Task / Dependency / Need / Group / Member`（状态机/owner 齐，`apps/hub-contracts/src/governance.ts`）+
`toDepGraphView / deriveBlockAttributions`（纯函数派生 DAG + 阻塞归因）+ `DepGraphSchema`（读视图契约）。
PM **不引入新 schema**——只补 GovStore 写实现 + 录入路由 + 读视图路由（承接 base 收口刀录入簇）。

## 3. I0 读写边界（PM 的命门——确认凭证 vs 第三方可见）

> 这是 PM 最敏感的设计点（碰 I0 反监视核心不变式），用户已拍板（Q1）。

- **写入侧**：`Dependency.confirmedBy` / `Need.confirmedBy` = `ActorRef{id, displayName, source}`，记**谁确认了这条边/需求**——
  **作内部归因凭证**（`isLiveEdge` 判 `confirmedBy !== null` 决定是否参与归因传播 C4）。
- **读出侧（关键护栏）**：**任何第三方可见的读视图永不输出 confirmedBy**——
  - `GET /api/dep-graph`（`toDepGraphView`）：节点只带 `ownerLabel`/`blockedByLabel`（结构键=上游任务名），**无 confirmedBy、无人完成量**。
  - `GET /api/tasks`：`Task` schema **本就无 confirmedBy**；`ownerId`=「谁负责」是 D-041 安全堆（可见），无完成量维度（C2）。
  - **不提供** `GET /api/dependencies`/`GET /api/needs` 的裸对象读路由（会泄露 confirmedBy）；依赖/缺口的结构视图一律走 dep-graph 投影。
- **创建响应**回完整对象（含 confirmedBy）= 回给**建边本人**（非第三方），不构成 I0 暴露。
- **用户拍板（Q1，2026-06-14）**：取「ActorRef 作内部凭证」——I0 靠**不暴露/不排名**守，而非靠 schema 去掉人 id；
  与现有 fixture + base 收口刀 4-opus 核实一致。（备选「source-only 凭证」未采。）

## 4. 触发表（用户动作 → 派生路径 → 写目标）

| 用户动作（本就会做） | 派生路径 | 写目标 | 路由 |
|---|---|---|---|
| 布置一个任务 | server 补 id/时间戳 + 默认(status=pending/statusSource=console C5) | `Task` | `POST /api/tasks` |
| 顺手连依赖「这步在等 X」 | clamp status=active（D-042 初始态） | `Dependency`（有向边） | `POST /api/dependencies` |
| 暴露前置需求「缺懂 RTOS 的人」 | clamp status=open、归组不归人(A1) | `Need`（一等公民 G3） | `POST /api/needs` |
| 看板/列表读进度 | `toDepGraphView` 实时派生 | **只读** | `GET /api/tasks` + `GET /api/dep-graph` |
| 看"谁卡了谁" | Dependency 边经 `toDepGraphView` 派生 blockedByLabel | **只读**（结构键，无人） | `GET /api/dep-graph` |

**卡住原因永不在 Task 上另存**（G2）：由人建 Dependency 边派生。**不引入 dueDate**（G4）。

## 5. 死表基线

| 维度 | 死表（要避免）| PM-BOARD |
|---|---|---|
| 录入触发 | 专门填进度表/甘特 | 挂在"布置任务/连依赖/暴露需求"的自然动作上 |
| 卡住原因 | 光秃秃"延期 N 天 + 人名" | 结构键（在等哪个上游任务/组/Need），点开才见组、对接才见人 |
| 排名诱惑 | 谁完成多/谁快谁慢/在不在干活 | **无**（C2/I0）：无完成量维度、人治视图封存 |
| 确认凭证 | 暴露"谁确认/谁负责排名" | confirmedBy 内部凭证不暴露；ownerId 仅"谁负责"分工 |
| 截止压迫 | dueDate + 甘特倒计时 | 无 dueDate、无甘特（G4 无硬截止只轻推）|

## 6. 落地清单（§6.B 连续构建）

| 单元 | 产出 | commit |
|---|---|---|
| PM-U1 | `GovStore.createTask` 写实现 + `POST /api/tasks`（status/statusSource 默认）| 7218a67 |
| PM-录入簇 | `createDependency`(clamp active)/`createNeed`(clamp open) 写实现 + `POST /api/dependencies`·`/api/needs` + `GET /api/tasks` 读视图 + Draft 去 status | 6cb38c8 |
| PM-cleanup | 对抗核实收口：删死代码 + A2 反派单硬化(claimedByMemberId clamp null) + 往返测 | 3bbf919 |

验证：hub-server verify:all 37 测 / git diff --check / skills-sync 全过。

**2-opus 对抗核实**（`wf_86ad9d6b-45a`：I0 暴露面 + 写实现健全 → 综合）裁 **ship、mustFix=0**。
**I0 经对抗探针实证守住**：POST 一条 `confirmedBy={id:'m-secret-leaker', displayName:'SECRET_NAME_LEAK'}`
的依赖后，`GET /api/dep-graph` 与 `GET /api/tasks` 响应体均**不含** confirmedBy/泄露标记——「永不经读视图暴露」
保证成立。两 nit（死代码+失真注释 / 创建可夹带 claimedByMemberId 派单）已由 PM-cleanup 收口（后者硬化为 A2 反派单）。

## 7. 本轮边界（老实定位，不过度声称）

- **console 看板 UI 未做**（用户 Q2=本轮后端录入簇+读视图优先）：写侧从零的 React mutation UI（@xyflow 板 + 任务/依赖表单）+ 冷启动空板处理留**下一轮**。
- `criticalChain` 派生 priority、列表/看板双视图、依赖录入 AI 预填均后置。
- 持久层 InMemory 重启丢失为预期（SqliteGovStore stub 待部署审批 §8）。
- 真实进度派生上游（git/lark→status）未接通——本轮 `statusSource=console` 是兜底录入，**不宣称已解 C1/C5**。

## 8. 后续（backlog/frontier）

- **console PM 看板页**（下一轮 frontier）：复用 hub-console DAG 页（@xyflow）模式；列表+看板双视图；mutation 表单调本轮 POST 路由；冷启动空板引导。
- **依赖录入 AI 预填**（并入原 GOV-DEP-INTAKE）：布置任务顺手连依赖，AI 预填 `confirmedBy=null` 不参与归因。
- **criticalChain → priority 派生**展示；真实 status 派生上游（git/lark 信号）随触点层接通。
