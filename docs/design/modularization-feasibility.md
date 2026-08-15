> **状态：SUPERSEDED-BY D-090（2026-08-15）**。本文保留阶段一模块化的历史推演与耦合证据，
> 不再指导后续结构。当前唯一软件架构真相为 `docs/design/software-architecture.md`：用户已拍板不承担
> 旧数据兼容，先统一生产 SQLite、配置、模块模板与架构守门，再恢复功能增长。
> 北极星不变：小作坊轻量 / 派生优先 / AI 只转译 / 人在环 / 反监视 I0。本稿只画边界与排序，不是已编译验证的迁移补丁（见 §6.3）。

# TeamHub 模块化可行性与设计

## 1. 结论先行

**能做，而且应该做——但要做对形态。** 把 TeamHub 重构成「核心模板 + 可插拔功能模块 + 垂直行业包」在结构上成立：三个独立 Store 范式（`KbStore`/`InvStore` 已经是干净拆出的接口，是现成样板）、`BuildHubServerOptions` 的 `clock/store/kbStore/invStore` 可选注入、`NavItem` 的 `disabled/tooltipKey` 态、i18n 的 `pm./kb.` 前缀分组——这些都是已经长好的接缝，注册表外壳是**顺势改造**而非逆势重写。

**推荐路线 = 方案B 的圈层心智模型（模板=核心 / 功能=模块 / 词汇=垂直包） + 方案A 的落地纪律（不拆包、在现有三包内做注册层、分阶段） + 方案C 的 subpath 导出作为可选的后期收口。** 明确**否决方案C 的「真发独立 npm 包」形态**：仓库根本没有 workspace 工具（无根 `package.json`/`pnpm-workspace`/`turbo`），子包靠 `file:../hub-contracts` + dist 互链，真拆包要先补一整套 monorepo 基建——对一个单团队部署的小作坊是教科书式过度工程，违背「小作坊轻量」北极星。

**为什么是这条路，以及一个对抗式的关键修正：** 三个方案都把「拆 `GovernanceSnapshot` 多域合一」当成游戏工作室落地的前置承重墙。**用耦合图核实后，这个判断对游戏工作室的 MVP 是错的。** `GovernanceSnapshot` 捆绑的恰好是 PM（tasks/deps/needs/groups/members）+ KB 成长（knowledgeNodes/taskKnowledgeTags）+ ARTIFACT（artifacts）——而游戏工作室要启用的正是这三个域（项目管理 + 知识库 + 资产归档）。游戏工作室不要的是 `ScheduleSnapshot extends GovernanceSnapshot` 追加的那一层（resources/sessions/relay），而那一层是**独立的 extends + 独立的路由 + 独立的 store 方法 + 独立的 nav 项**，天然可省。

**结论：拆 `GovernanceSnapshot` 是「把 PM 当独立产品卖给第三方」才需要的最贵承重墙，它不在游戏工作室租户的关键路径上。** 真正卡住游戏工作室的只有三件，按真实爆炸半径排序：

1. **`RobotTarget` 必填字段**（`governance.ts:128` Task / `:41` Project.min(1)）——唯一需要 schema 改 + 数据迁移的硬骨头；
2. **机器人词汇硬编码枚举**（GroupKind/ownerGroup/PartCategory/ArtifactKind/season）——降级为注入式词汇即可，不需拆 snapshot；
3. **`fixtures.ts` 多域 spread**（`:503` `{...governanceScenarioFixture}`）——不拆就没法给无机器人租户一份干净首屏 seed。

i18n 巨表（1328 行）和 `GovernanceSnapshot`/`GovStore` 拆分都**不在关键路径上**，可以延后到真有第三方复用需求时再做。这把全部三个方案自报的 L 级工作量，对「先跑出一个游戏工作室租户」这个目标砍到了 **M**。

---

## 2. 现状耦合诊断

### 2.1 已天然解耦（直接复用，绿）

| 接缝 | file:symbol | 说明 |
|---|---|---|
| 独立 Store 范式 | `gov-store.ts` 内 `KbStore` / `InvStore` 接口 | 已与 GovStore 分离、可经 `BuildHubServerOptions.{kbStore,invStore}` 独立注入——是分拆的现成模板 |
| 核心服务 DI | `BuildHubServerOptions.{clock, writeToken, rateLimit, consoleDistDir}` | 干净注入点，核心宿主可直接复用 |
| 跨域原语 | `common.ts:ActorRefSchema / isoDateTimeSchema` | 合法核心层原语，全域 import，不动（唯一瑕疵见下 §2.3） |
| KB 契约三件套 | `kb.ts` / `kb-similar.ts` / `kb-closeout.ts` | 零机器人词汇，游戏工作室原样复用做 bug 追踪 + 复盘归档 |
| SYSTEM 域 | `schemas.ts` 的 BotChannel/AgentBackend/DataSource/HubEvent + `system-status.ts` | 完全通用，platform 枚举结构上可换 slack/discord |
| INV 资源引用 | `inventory.ts:InventoryResourceRef`（只要 id/name/displayCode?） | 刻意与 SharedResource 解耦，是正确的抽象示范 |
| 通用组件层 | `components/{Field,FormGrid,Combobox,SegToggle,MetricTile,SideDrawer,...}` | 除 SeasonSelect 外无任何机器人/赛季词，直接进核心 |
| 前端代码分割先例 | `ProjectPage` 懒加载 `DepGraphPage` chunk | 证明按域 lazy-load 已可行 |
| 条件 nav 先例 | `NavItem.disabled / tooltipKey`（库存曾标"开发中"） | 扩成"未启用即不渲染"是小改 |

### 2.2 真正拦路的硬耦合（红，给 file:符号）

**① `fixtures.ts` 多域 seed（拦"干净租户首屏"的真墙）**
- `fixtures.ts:503` `scheduleScenarioFixture = {...governanceScenarioFixture, resources, resourceSessions, relayHandoffs}` —— PM 与 SCHEDULE seed 在 JS 对象层面焊死；
- `fixtures.ts:524` 仪表台 fixture 再 spread schedule；`:671-673` `GM6020_HOLDERS/C620_HOLDERS/MC_HOLDERS` 硬编码 `res-r1/res-r2` —— INV demo 跨域外键引 SCHEDULE 资源；
- `fixtures.ts:441-442` `grp-convergence` 总联调任务、`:499-500` `SCENARIO_WINDOW_WEEKDAY/CONVERGENCE` 日期锚点（hub-server 直接 import）。
- **后果**：不拆 fixtures，任何无机器人租户首屏都会看到 R1/R2 实验室。

**② `RobotTarget` 必填渗透（爆炸半径最大、唯一需数据迁移）**
- `governance.ts:22` `RobotTargetSchema = z.enum(['R1','R2','shared'])`；
- `:128` `Task.robotTarget`（必填）、`:41` `Project.robotTargets z.array(...).min(1)`（必填数组）、`:420` `SharedResource.robotTarget`（必填）、`:305` `DepNode.robotTarget`（**派生投影**，由 `toDepGraphView` 生成，非落盘）。
- **对抗式精确化**：真正需要迁移的**落盘**必填字段只有 `Task.robotTarget` + `Project.robotTargets`；`SharedResource.robotTarget` 属 SCHEDULE 垂直域（游戏工作室不启用即无此记录）；`DepNode.robotTarget` 是派生投影、改投影函数即可。**所以 PM-only 租户的真实迁移面 = 2 个字段。**
- **意外利好**：`:133` `convergenceScope: z.enum(['allLeafGroups']).optional()` **已经是 optional**——三个方案都把"总联调漏进 PM"当硬伤，实际它已可空，PM 核心保留一个泛化的可选 `milestoneGate?` 槽即可，由 robotics 垂直解释为"总联调"，零迁移。

**③ `GovernanceSnapshot` 多域合一（最贵承重墙，但不在游戏工作室关键路径上）**
- `attribution.ts:46` `export interface GovernanceSnapshot`（**手写 interface，非 z.infer**，D-051，因 `ScheduleSnapshot extends` 它）；
- `:69` `GovernanceSnapshotSchema.passthrough()`（fail-closed 解析单源）+ `:90` `GOVERNANCE_SNAPSHOT_ARRAY_KEYS`（克隆隔离单源）+ drift-canary 测试 + `file-gov-store.ts` 落盘 `gov.json` 兼容。
- **后果**：要"PM 不带 KB/ARTIFACT"必须先拆它（改 interface + schema + array-keys 表 + ScheduleSnapshot extends + 落盘迁移 + drift-canary）。**但游戏工作室要的就是 PM+KB+ARTIFACT 三域，可整体复用 `GovernanceSnapshot`、只用它（不用 ScheduleSnapshot）+ 剥机器人词汇 → 本墙可延后。**

**④ `governance.ts` 659 行 god 文件**
- 同文件容纳 PM 实体层（Season/Project/Group/Member/Task/Dependency/Need）与 SCHEDULE 基础设施（SharedResource/ResourceSession/RelayHandoff/Presence*/WeeklyMinuteWindow + `canBoardResource`/`deriveDisplayCode`，`:364-428`）。两域不拆此文件无法分别打包；是 schedule 垂直化的物理前置。

**⑤ i18n 巨表（中等拦路，非结构致命）**
- `translations.ts` 1328 行平坦对象，`TranslationKey = keyof typeof zh` 全局联合类型。前缀（pm./kb./schedule.）是唯一软域界，TS 不强制。**对抗式判断：游戏工作室只需在巨表之上叠一层"词汇覆盖层"（override `pm.field.robotTarget` 标签），不需要先做 per-module 拆分**——全量拆 TranslationKey 是可维护性收口，可延后。

**⑥ nav 手写注册（结构债，低风险）**
- `App.tsx` if-else render chain + `ConsoleLayout.ConsolePage` 手写联合类型 + `navItems` 静态数组 + `TITLE_KEY` —— **加一页要改 4 处**。这是注册表能直接消灭的、最划算的纯结构改造。

**⑦ server 平铺 + client 单体**
- `server.ts` 1025 行 `buildHubServer`、40 条手写 `app.get/post/patch/delete`，无 Fastify plugin register；
- `api/client.ts` 566 行单一 client，所有页接受同一 `HubApiClient` prop，无法按域裁剪。

**⑧ `GovStore` god-interface**
- `gov-store.ts:183` `closeoutKbNode`（**KB 写方法住在 GovStore**，而 `getKbSnapshot/appendCloseout` 在 KbStore → `POST /api/kb/closeout` 是跨 store 两步写）；`:188` `appendArtifact`、`:207-260` schedule 8 方法。god-interface 横跨 PM+SCHEDULE+ARTIFACT+KB 写。

**⑨ 跨域 import 环（必须先剪，否则 pm/kb 无法脱 schedule 编译）**
- `pm-requests.ts:14` `import { RelayStageSchema } from './relay.js'` —— PM 写契约硬耦合进 relay → schedule → governance 全量；
- `growth.ts:4` import 自 `./governance.js`（`WeeklyMinuteWindowBaseSchema`，供 `MemberAvailability.recurringBusy` 复用周分钟段原语）—— KB 成长层反依赖 governance。

### 2.3 `common.ts` 共享类型（核心原语 + 一处需放宽）

`common.ts:ActorRefSchema` 是全域确认者标记（confirmedBy/recordedBy）的合法核心原语，**不拆**。唯一瑕疵：`source` 枚举含 `'lark'`（飞书），是渠道泄漏进核心原语——核心层应放宽为开放字符串或可注入来源枚举，飞书/slack/discord 作为渠道值由垂直/集成层提供。

---

## 3. 推荐架构

### 3.1 三圈层

```
核心模板 (core)            —— 所有租户完全一致、零机器人语义
  ├─ 跨域原语 + I0 反监视不变量（一次性强制，对所有模块生效）
  ├─ 纯 DAG 归因内核（只吃 tasks/deps/needs，与机器人无关）
  ├─ 宿主外壳（server bootstrap / console shell / DI 接缝）
  └─ 装配契约（ModuleDescriptor + TenantConfig + VocabularyRegistry）
        ↓ 注册
功能模块 (modules)          —— 6 个可开关包，各自五件套
  pm-core* / knowledge-base / ledger / archive / system* / presence-schedule
  (*=核心常装)
        ↓ 注入词汇/seed/i18n
垂直包 (verticals)          —— 只注入领域词汇，不含核心逻辑
  robotics-vertical / game-studio-vertical
```

### 3.2 核心模板装什么

- **I0 反监视不变量（北极星，必须核心层一次性强制）**：派生输出主键只允许 `task/group/dependency/need`，永无 `memberId` 维度键。这不是机器人概念，是产品底线，对所有模块统一生效——避免多租户走样把排名维度偷偷加回去。
- **纯 DAG 归因内核**：`attribution.ts` 的 `deriveBlockAttributions/toDepGraphView/wouldCreateCycle/computeCriticalSet` + `direction-gaps.ts` 的 `deriveDirectionGaps`。这些只读 PM+KB 成长字段、**从不读 artifacts/schedule**（耦合图已证），逻辑上本就可分。核心化需把签名从"吃 `GovernanceSnapshot`"改为"吃最小 `PmGraph` 接口"——这是编译重构，但低风险（纯类型收窄）。
- **宿主外壳**：server 的 Fastify bootstrap + clock/writeToken/rateLimit/consoleDist 干净接缝 + `artifact-storage` 抽成可注入 `BlobStore`（现读 `process.env.TEAMHUB_ARTIFACT_FILES_DIR`，无 DI 缝）；console 的 App 壳 + 三 Provider + 通用组件层 + `HubApiClient` 工厂基座。
- **装配契约（只定接口不含实现）**：`ModuleDescriptor` + `TenantConfig` + `VocabularyRegistry`。
- **从 governance 上移到 core 的共享原语**：`WeeklyMinuteWindowBaseSchema/weeklyMinuteWindowRefine`（剪断 `growth.ts→governance.ts` 那条边的前置）。
- **核心默认空 seed**（`TEAMHUB_DEMO_SEED=false` 已存在），演示数据由垂直包提供。

### 3.3 模块清单与边界（契约 + store + 路由 + 页面 + i18n + nav）

| 模块 | 契约 | store | 路由 | 页面 | i18n | nav | 域属性 |
|---|---|---|---|---|---|---|---|
| **pm-core**(核心必装) | `pm-core.ts`(Task/Dep/Need/Group/Member/Season/Project，robotTarget 注入式) + `attribution` + `direction-gaps` + `pm-requests`(先剪 relay import) | 从 GovStore 切出 `PmStore` | `/api/tasks` `/api/dependencies(+waive)` `/api/needs` `/api/dep-graph` `/api/group-gaps` | PmBoardPage / PmCreatePanel / DepGraphPage / ProjectPage / GapsPage | `pm.*` `depgraph.*` `gaps.*` | project + gaps | mixed（通用内核 + 机器人词需注入） |
| **knowledge-base**(可选) | `kb.ts` `kb-similar.ts` `kb-closeout.ts` + growth 知识树部分 | `KbStore`（已独立·样板） | `/api/kb/similar` `/api/kb/closeout` | KbSearchPage / KbCloseoutForm | `kb.*` | knowledge | **generic·零改动** |
| **ledger**(可选) | `inventory.ts`（PartAction 日志 + TrackedPart 血缘 + 缺料告警 = 通用内核；矩阵列轴 robot→deployableUnit） | `InvStore`（已独立·样板） | `/api/inventory*` | InvPage / InvLedgerTable / InvQuickRecordForm（去 `DEFAULT_PROJECT_ID='prj-robots'`） | `inv.*` | inv | mixed |
| **archive**(可选) | `ArtifactRef`(从 schemas.ts 剥离独立) + `artifact-version`；ownerGroup/kind 注入式 | 新拆 `ArtifactStore`(appendArtifact/setArtifactFile/list) | `/api/artifacts*` + 上传 | ArchivePage（robotCode→注入式"目标维度"） | `archive.*` | archive | mixed |
| **system**(核心常装) | BotChannel/AgentBackend/DataSource/HubEvent + `system-status.ts` | mock 静态列表 | `/api/system/status` `/api/bot-channels` `/api/agent-backends` `/api/data-sources` `/api/events` `/health` | SettingsPage / OverviewPage(按启用模块裁剪扇出) | `settings.*` `overview.*` `toolbar.*` `nav.*` | overview + settings | **generic** |
| **presence-schedule**(robotics 垂直专属·游戏工作室不注册) | `schedule.ts` `relay.ts` + 从 governance.ts 迁出的 `schedule-infra.ts`(SharedResource/Session/Relay/Presence*/canBoardResource/deriveDisplayCode) | 从 GovStore 切出 `ScheduleStore`(~10 方法，数据已在私有数组) | `/api/schedule` `/api/resources*` `/api/resource-sessions*` `/api/relay*` | FleetPage(=Resources+Schedule) / RelayCanvas / relay-lanes / carry-over | `schedule.*` `resources.*` `fleet.*` | fleet | **robotics-only** |

`ModuleDescriptor` 形如：
```ts
{ id, dependsOn[], contractsFragment?, buildStore(ctx)?, registerRoutes(app, ctx)?,
  pages: [{ key, navItem, titleKey, lazyComponent }], i18n: { zh, en }, domainVocab? }
```

### 3.4 两条机制（务必分清「开关模块」与「注入词汇」）

**A. 模块开关（装配层，纯结构、低风险）**
- `TenantConfig.enabledModules: ModuleId[]`。
- server：`buildHubServer` 从 1025 行平铺函数瘦成宿主——遍历 `enabledModules`，对每模块 `app.register(modulePlugin)`（替掉 40 条手写路由）；未启用模块的端点根本不挂。
- console：用「页面注册表数组」替掉 `App.tsx` if-else + `ConsolePage` 联合类型 + `navItems` + `TITLE_KEY`（4 处合一）；`HubApiClient` 工厂按启用模块切片，各页只拿本域方法。
- **这一层最便宜，是纯设计 + 小编译。**

**B. 领域词汇注入（三通道，决定机器人 vs 游戏工作室差异）**
1. **enum/schema 通道（最硬，分两步走）**：
   - *便宜版（先做）*：`Task.robotTarget`/`Project.robotTargets` 改 `.optional()`，核心新增泛化 `targetLabel?: string` 槽；闭集校验下沉到「租户 `VocabularyRegistry` 校验器（路由层）+ UI 下拉 + i18n 标签」。robotics 垂直把 `targetLabel` 选项收紧为 R1/R2/shared。代价=放弃编译期 enum 约束换运行期可注入（与本仓严格 schema 文化是真权衡）。`ArtifactRef.ownerGroup/kind` 本就 optional，最易先示范。
   - *彻底版（后做，可不做）*：pm 声明 `TaskBaseSchema`，robotics 包 `TaskBaseSchema.extend({ robotTarget: RobotTargetSchema })`。更干净但与 `z.infer` 共享类型冲突，大编译重构。
2. **fixtures 通道**：`fixtures.ts` 拆 per-module seed builder（`buildPmSeed/buildKbSeed/buildLedgerSeed/buildArchiveSeed`），SCHEDULE 用 `buildScheduleSeed(pmSeed)` 函数组合**替掉对象 spread**；修 INV→SCHEDULE 跨域外键；保留 `SCENARIO_WINDOW_*`（server 直接 import 的锚点）。
3. **i18n 通道**：先在巨表上叠「租户词汇覆盖层」（override 标签键），**不强制立刻拆 per-module**；后期再按前缀拆命名空间文件 + 重构 `TranslationKey`。

**垂直包** = `(enabledModules 子集 + VocabularyRegistry + seedBuilder + i18n 覆盖)` 的一个打包，与模块清单**正交**，不含任何核心逻辑。

---

## 4. 两个租户画像

**机器人战队** = `enabledModules: [pm-core, knowledge-base, ledger, archive, system, presence-schedule]` + `robotics-vertical`（含 R1/R2/CAN/3508 现有 seed、`deriveDisplayCode`、`guessSeason`、ownerGroup/PartCategory 收紧枚举、`deriveArtifactKind` 的 ec/vision→firmware 分支）。即今天的全套。

**小游戏工作室** = `enabledModules: [pm-core, knowledge-base, ledger?, archive, system]`（关掉 `presence-schedule`，`ledger` 可选）+ `game-studio-vertical`。直接零改动可用：knowledge-base（bug 追踪 + 复盘归档）、system（换 Slack/Discord）。

### 词汇替换表

| 机器人概念 | file:symbol | 游戏工作室替换 | 落地方式 |
|---|---|---|---|
| **R1/R2/shared** | `governance.ts:22 RobotTargetSchema`，Task/Project 必填 | `targetLabel` = 目标平台/特性域（PC/PS5/Mobile 或 渲染/物理/UI/关卡） | 核心字段改 optional + 泛化槽；robotics 垂直注入选项 |
| **displayCode（26R1）** | `governance.ts:406 deriveDisplayCode` | **省略**（schedule-only，不启用即无）；若 ledger 需要则用 deployable-unit.label | 函数移进 robotics 垂直包 |
| **relay 接力 / presence 在场排班** | `schedule.ts` `relay.ts` 整域 | **整域省略**——游戏工作室无"谁得到现场用这台机器人"语义 | 不注册 presence-schedule 模块 |
| **BOM（parts×robot，motor/esc）** | `inventory.ts:PartCategorySchema`；矩阵列=resourceId FK | parts×deployable-unit（构建机/测试主机）；类目→GPU/CPU/devkit/license/consumable | ledger 矩阵列轴抽象 + PartCategory 注入式 |
| **season 赛季** | `governance.ts` season；`SeasonSelect.guessSeason`(month≤4→year-1) | 开发周期/版本号（dev-cycle/sprint） | guessSeason 移进 robotics 垂直；game-studio 自定推断或手填 |
| **convergence 总联调** | `governance.ts:133 convergenceScope.optional()`；`grp-convergence` 哨兵 | milestoneGate 里程碑闸门（垂直切片/demo 前的全队对接节点） | **字段已 optional**，PM 核心保留泛化槽；DAG 渲染逻辑通用、仅换词；哨兵组逻辑随 schedule 垂直走 |
| GroupKind(mechanical/electrical/program) | `governance.ts:50` | art/code/design/audio | 注入式枚举 |
| ownerGroup(mechanical/electrical/ec/vision) | `schemas.ts ArtifactRef.ownerGroup` | 美术/程序/音频/策划 | 注入式 + `deriveArtifactKind` 分支移进 robotics |
| ArtifactKind 含 rosbag / firmware；CAD `.step/.f3d` | `schemas.ts` / `constants.ts:ARTIFACT_KIND_KEY` / accept | rosbag→playtest 录像；firmware→build 产物；`.step/.f3d`→`.blend/.fbx/.max` | 注入式 kind + accept |
| BotChannel feishu/wechat/qq | `schemas.ts` | slack/discord/teams | 结构通用，换值即可 |
| ActorRef.source 'lark' | `common.ts:ActorRefSchema` | 开放来源 | 核心放宽为可注入 |

**诚实记一笔的能力缺口**：游戏工作室若要排期，需要的是「通用 sprint/milestone 时间线」——这是一个**新模块**，不是 presence-schedule 换皮（presence 的形状是"物理在场用机器人"，本质不可复用）。任何方案都补不上这个缺口，需新写。

---

## 5. 增量迁移路径

> 原则：尊重小作坊轻量。**先拿到"一个能演示的游戏工作室租户"，再谈彻底拆分。** 每步标注 `[纯设计]`（现在就能写文档/零编译）或 `[编译重构]`（改代码 + 重测）及风险档。

### 第 0 步：不破坏现状的预备（纯设计 + 零风险结构）
- `[纯设计]` 写定本设计文档：ModuleDescriptor / TenantConfig / VocabularyRegistry 契约、6 模块边界、词汇映射表、目标依赖图、subpath 导出拓扑。
- `[纯设计]` 设计稿：console 路由表替 if-else、client 按域切片、nav 由注册表生成、server per-module Fastify register。
- **不动任何 schema、不碰落盘格式。**

### 第 1 步：剪两条跨域 import 环（编译重构·低风险·机械）
- `[编译重构-L风险低]` 上移 `WeeklyMinuteWindowBaseSchema/weeklyMinuteWindowRefine` 到 core，剪 `growth.ts→governance.ts`；
- `[编译重构-L风险低]` 把 `pm-requests.ts:14` 对 `RelayStageSchema` 的依赖移到 schedule 模块的写契约里，剪 `pm-requests→relay`。
- **这两条不剪，pm/kb 永远无法脱 schedule 编译——是后续一切的前置。**

### 第 2 步：装配外壳（编译重构·低风险·有先例）
- `[编译重构-M]` console 页面注册表 + nav 自注册 + `HubApiClient` 按域切片（消灭 App.tsx 4 处同改）；
- `[编译重构-M]` server `buildHubServer` 改 per-module Fastify `register`（multipart 已是 register 先例）；
- `[编译重构-S]` **让 presence-schedule 可省**：游戏工作室租户不注册其路由、不渲染 fleet nav——**注意此步无需拆 ScheduleStore**，GovStore 的 schedule 方法对游戏工作室单纯不被调用即可。这是"关掉机器人专属"的最便宜实现。

### 第 3 步：governance.ts 物理拆分（编译重构·中风险·纯搬移）
- `[编译重构-M]` 拆 `governance.ts` → `pm-core.ts`（Task/Dep/Need/Group/Member/Season/Project）+ `schedule-infra.ts`（SharedResource/Session/Relay/Presence*/canBoardResource/deriveDisplayCode）。纯搬移，但下游 import 到处要改、需全量重测。

### 第 4 步：RobotTarget 去渗透（编译重构·中风险·**唯一带数据迁移**）
- `[编译重构-M带迁移]` `Task.robotTarget` + `Project.robotTargets` 改 `.optional()` + 新增泛化 `targetLabel?`；改 `toDepGraphView` 投影；改消费点（PmBoardPage 卡 / DepGraphPage 节点 line116/132/543 / PmCreatePanel ROBOT_TARGETS 表单）；配 `gov.json` 迁移脚本（既有记录回填 robotTarget→targetLabel）。
- **这是唯一需要数据迁移的一刀，单独立项、配迁移脚本、配回归测试。**

### 第 5 步：fixtures 拆分（编译重构·中风险）
- `[编译重构-M]` `fixtures.ts` 拆 per-module seed builder + `buildScheduleSeed(pmSeed)` 替对象 spread；修 INV→SCHEDULE 外键；出 `game-studio` seed 包（首屏不再见 R1/R2）；保留 `SCENARIO_WINDOW_*` 锚点。

### 第 6 步：词汇注入收口（编译重构·中风险）
- `[编译重构-M]` `ArtifactRef.ownerGroup/kind`、`PartCategory` 泛化为注入式 + `deriveArtifactKind`/`OWNER_GROUP_ORDER`/`guessSeason` 移进 robotics 垂直；i18n 叠租户覆盖层（**先不拆 per-module**）。
- **到此，游戏工作室租户可演示。** 关键路径到 6 步为止。

### 延后（仅当真有第三方/外部复用需求才上，否则不做）
- `[编译重构-L最高风险]` 拆 `GovernanceSnapshot` → PmSnapshot/KbGrowthSnapshot/ArtifactLog（动 interface + schema + ARRAY_KEYS + ScheduleSnapshot extends + `gov.json` 落盘迁移 + drift-canary，SSOT-B1 债）。**游戏工作室不需要这一刀。**
- `[编译重构-M]` 从 GovStore 拆 `PmStore/ScheduleStore/ArtifactStore`（数据已在私有数组、KbStore/InvStore 是样板）+ `closeoutKbNode` 跨 store 两步写收口。
- `[编译重构-M]` i18n 全量拆 per-module + 重构 `TranslationKey` 联合类型（1328 行，机械低风险但量大）。
- `[基建-暂缓]` subpath 导出 `@teamhub/hub-contracts/{core,pm,kb,...}`（C-lite，拿八成按域 tree-shake 收益、不发独立包）。
- `[否决]` 真发 N 个独立 npm 包 + 补 pnpm/turbo workspace + 手排 file: 链——出现第三方复用前**不做**。

---

## 6. 风险与不做的事

### 6.1 过度工程红线（小作坊北极星）
- **不发独立 npm 包**：无 workspace 工具，真拆要先补 monorepo 基建，单团队部署收益为负。落地形态止于"三包内注册表 + 按域目录纵切 + 可选 subpath 导出"。
- **装配层必须极薄**：模块/manifest/注册表机制若比被服务的应用还重，就违反 C3 小作坊。注册表只做"遍历 enabledModules → register"，不引入 IoC 容器/插件市场/动态加载。
- **只有 2 个租户画像时，多包版本漂移/N 套构建/链管理成本可能高于收益**——收益与租户数正相关。在游戏工作室租户真正临近落地前，第 3–6 步都是投机性通用化，可只停在"第 0 步设计文档 + 第 1–2 步外壳"。

### 6.2 违背派生优先 / I0 / AI 只转译的雷
- **I0 反监视**：所有拆分**绝不可**引入 `memberId` 维度的排名/统计键。核心层一次性强制"派生输出主键 ∈ {task/group/dependency/need}"，对所有模块生效；新模块/垂直包接入时 code review 必查这条。词汇注入只换 label，不得新增人维度聚合。
- **派生优先**：归因/关键链/方向缺口算法（`deriveBlockAttributions` 等）原样不动，绝不为模块化改成静态表或缓存快照。`InventoryResourceRef`、`deriveDisplayCode` 这类"用着就更新"的派生保持派生。
- **AI 只转译不下判断**：模块化不得新增任何"模块自动判断该启用什么/自动归因"的逻辑；enabledModules 是人填的租户配置，词汇是人提供的垂直包。装配机制是纯结构，不含任何 LLM 判断。

### 6.3 当前不能编译验证的限制（只读静态分析）
- 本文所有 file:line 引用来自静态阅读 + grep，**未编译未跑**。第 1 步剪 import 环、第 3 步拆 governance、第 4 步 robotTarget 迁移的真实 TS 报错面与 `z.infer` 类型连锁，需在实际编译后才能完全确认；尤其 `GovernanceSnapshot` 手写 interface 与 `ScheduleSnapshot extends` 的类型耦合（D-051），任何拆分都要以 `tsc` + drift-canary 测试 + 既有 `gov.json` 加载实测三重验证，本文给的是设计与排序、不是已验证的迁移补丁。
- `gov.json` 落盘兼容性（第 4 步 robotTarget 迁移、延后项的 snapshot 拆分）只能在有真实落盘数据的部署机（WSL2 测试机）上验证回填脚本，不能在纯静态分析阶段保证零数据丢失。
- 词汇注入"enum→string + 运行期校验器"放弃编译期枚举安全，其回归面（原本编译器拦住的非法值现在要靠测试拦）只有在改完跑全量测试后才显形——这是真权衡，不是免费午餐。
