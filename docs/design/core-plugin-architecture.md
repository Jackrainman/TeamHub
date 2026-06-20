# 底座 + 插件化架构 — 可行性与设计提案（PROPOSAL · 待决策）

> 回答用户提问：**TeamHub 能否朝「一个底座 + 不同插件」演进**（git/GitHub 本地可选、依赖图可自行增减、排班表可删减）？**能否 → 单独出设计文档**。
> 本文 = 研究结论 + 目标架构 + 分阶段路线 + 红线。**状态 = PROPOSAL，未 locked**：动代码前需用户拍板 §10 的待决策项（这是「需用户拍板的产品/架构方向」，AGENTS §5 安全边界）。
> 证据来源：源码盘点（hub-contracts/hub-server/hub-console 一手读 + 14-agent 对抗式设计审查 workflow `wf_d41c1c54-dce`，4 候选架构评分 + 3 视角对抗核实）。上游决策：`decisions.md` D-024（中枢化）/ D-028（治理为主轴 + adapter「插件位」）/ D-039（演进留地基·三支柱共享底座）/ D-041（任务为核心·视图解耦）/ D-042（store DI 扩展点）/ D-072（设置页可增减组）/ D-074（单一 VERSION）。北极星见 `team-hub-concept.md`。

---

## 0. 结论先行（TL;DR）

**能，而且地基已经走了一半。** 现有代码里三处已是插件化雏形：① store 依赖注入（`GovStore`/`KbStore`/`InvStore` 各自独立、各持自己的 snapshot，D-042）② 集成适配器注册表（`BotChannel`/`AgentBackend`/`DataSource` 三分，`DataSource.kind` **已含 `git`**）③ 派生层是纯函数（dep-graph/schedule/gaps/inventory 都由纯函数从 snapshot 算出，天然可开关）。

**但有一条诚实的判断必须先说：用户的三个诉求，并不需要一套完整的「模块注册中心」。** 对抗核实的 over-engineering 视角（已采纳）指出：5–15 人小作坊（C3）部署到单机单端口 4177，三个诉求其实只要 ~3 处外科手术 + 一个 git provider seam 就能满足；一次性铺 13-commit 的注册中心是投机性 ceremony。

因此本文给出**两层结论**，并推荐**分阶段采纳**：

| 层 | 内容 | 是否现在做 |
|---|---|---|
| **目标架构**（§2–§5） | 编译期模块注册中心：模块 = 目录三件套（server registrar / contracts 命名空间 / console PageDescriptor）+ 两条正交插件轴 | **不急着全做**；作为方向锚点 |
| **最小可行模块化**（Stage 1，§7） | 契约解耦三刀 + ScheduleStore 接口收窄 + 一个 `ENABLED` 编译期开关 + GitForgeProvider 工厂 | **推荐现在做** —— 已交付全部三诉求 |

**一句话**：把「底座 + 插件」当**方向**（值得朝它走、每一步都让代码更干净），而不是当**一次性大重构**（小作坊不需要、也扛不起其 ceremony）。完整注册中心**等到真正出现第 7 个模块或 IA-REFACTOR 落地时再让它挣到位**（YAGNI）。

---

## 1. 现状盘点：为什么「已经走了一半」

### 1.1 已存在的插件化 seam（好消息，别推倒重建）

- **Store 依赖注入**（`server.ts:100-158`，`gov-store.ts`）：`BuildHubServerOptions` 已注入 `store`/`kbStore`/`invStore`/`clock`。**INV 与 KB 已是干净独立模块**——`InventorySnapshot`/`KbSnapshot` 都不在 `GovernanceSnapshot` 内，各走自己的 store 接口（`inventory.ts` 对 governance 零 import，仅靠结构接口 `InventoryResourceRef` 接车列）。这正是「可插拔模块」的标准形态，已落地两个。
- **集成适配器注册表**（`schemas.ts:83-231`）：`BotChannel`（IM 通道）/ `AgentBackend`（技能执行器，独占 invoke/health/capabilities）/ `DataSource`（只读数据源）三分。`DataSourceSchema.kind` 枚举 **`['git','artifact']`** —— git 作为数据源**已建模**，只是 `/api/git/repos` 现在是 fixture passthrough（`server.ts:278-279`）。
- **派生即视图**：dep-graph（`toDepGraphView`）、schedule（`derivePresenceSchedule`）、gaps（`deriveDirectionGaps`）、inventory（`deriveInventoryLedger`）全是纯函数。一个「视图模块」开/关 = 注册/撤销一条路由 + 一个页面，不动数据。
- **视图解耦**（D-041）+ **设置页可配置**（D-072：分配任务的四个组「设置页可增减」）—— 运行期可配置已有先例。

### 1.2 阻挡干净插件化的三处耦合（坏消息，但都可解）

| 阻塞 | 位置 | 严重度 | 本质 |
|---|---|---|---|
| **路由是 890 行内联巨石** | `server.ts` 全部 37 路由写死在一个 `buildHubServer` 里，无 `app.register` 插件 | 高 | 加/删模块 = 改这一大函数 |
| **contracts 是一个扁平包** | `index.ts` 一处 `export *` 全域；`ScheduleSnapshot` extends `GovernanceSnapshot`；`GovernanceSnapshot` 定义在 `attribution.ts` 成单文件 fan-in | 高 | 域边界靠自觉，无结构强制 |
| **`GovStore` 是神接口** | `gov-store.ts:175-263` 把 9 个治理/PM/artifact 方法和 **10 个排班方法**（resources/sessions/relay）混在一个接口 | 高 | **「删排班」最难正因为它焊死在 GovStore 上**（对比 INV/KB 干净独立） |
| console nav 写死 | `App.tsx:25-128` 的 `ConsolePage` union + `TITLE_KEY` Record + 10 分支三元 | 中 | 加/删页面要改多处（但 TS 穷尽检查本身就是改动清单） |

> 注意：console 的「写死」是**双刃**——三元 + 闭合 union + `Record<ConsolePage,…>` 让 TS 编译器**强制**你走遍每个依赖点，今天它就是删页面的 checklist。把它换成 registry 会丢掉这层编译期穷尽保护（见 §8 反模式）。

---

## 2. 两条正交的插件轴（关键概念区分）

不要把所有「可插拔」搅成一锅。TeamHub 有**两条本质不同的轴**，各自独立注册、永不共享命名空间：

### 轴一：功能模块（Feature Module）—— 回答「哪个产品能力开着」
`pm` / `dep-graph` / `schedule` / `kb` / `inv` / `artifact`。定义**路由 + 页面**，依赖 store，靠**清单成员资格**开关。**enable / remove** 语义（增减一个能力）。这是「自己增加依赖图、删减排班表」的轴。

### 轴二：集成适配器（Integration Adapter）—— 回答「哪个外部系统接进来」
- git：`github | forgejo | bare-git | none`
- bot-channel：`feishu | wechat | qq`
- agent-backend：`hermes | openclaw | claude-code | mock`

它们有**Provider 接口 + 凭证/配置源 + 生命周期状态**，**不是**一个功能面。**swap** 语义（换一个实现）。契约家在已有的 `BotChannel`/`AgentBackend`/`DataSource` 三分里（证据确认这块设计已对）。

**「github/git 本地可选」落在轴二**，具体：

```
DataSource(kind=git)          ← 元数据描述符（status / sourceRef，已存在）
GitForgeProvider {            ← 运行期接口（新增，藏在 /api/git/repos 后面）
  listRepos(): GitRepoRef[]
  ping(): HealthState
}
createGitForgeProvider(env)   ← main.ts 启动时按 env 选实现
  ├─ GitHubProvider   (GITHUB_TOKEN + ORG)
  ├─ ForgejoProvider  (GIT_FORGE_URL + token)   ← D-038 本地 Forgejo 迁移考虑中
  └─ NullProvider     (返回 [])                  ← 默认，无 git
DataSourceSchema += optional GitForgeConfig { provider enum; baseUrl; tokenEnvVar }  // 加字段、向下兼容
```

**红线（轴隔离）**：换 forgejo→github（轴二）**绝不**碰 kb/pm/inv/schedule；关掉 schedule（轴一）**绝不**碰 `BotChannel` 列表。功能模块若要显示 repo 链接，只消费 `GitRepoRef[]` 只读数据，**永不 import provider**。`SettingsPage` 已渲染 `/api/data-sources` 返回的任何内容，换 forge 前端零改动。

---

## 3. 模块契约：一个 TeamHub 模块由什么组成

一个功能模块 = **monorepo 里的一个目录**（**不是** npm 包），暴露三件套，全部同构建、同 VERSION：

1. **SERVER** — `apps/hub-server/src/modules/<domain>/index.ts` 导出
   `registerXxxRoutes(app: FastifyInstance, deps: ModuleDeps): void`。
   在 **同一个 root 实例**上 `app.get/post/...`（**不**用 `app.register` 子实例——前缀隔离在这儿零收益，反而要重传共享状态）。`deps` 是**显式类型对象**，只携带该模块需要的 store/clock。

2. **CONTRACTS** — 目录命名空间 `apps/hub-contracts/src/modules/<domain>/*.ts`（或现有扁平文件按 barrel 重导出分组）：schema + 纯派生 + 该域 store 接口。一条仓库 lint 规则（`no-restricted-imports` / TS path）禁止跨模块深 import，**用一条 lint 拿到包边界的强制力、却不付 npm 包的代价**。

3. **CONSOLE** — `apps/hub-console/src/features/<domain>/` 导出
   `PageDescriptor { id; navLabelKey; titleKey; icon; group?; renderPage(ctx: PageContext): ReactNode }`，push 进中央 registry。

**`defineRoute` 路由工厂**（薄助手）：
```ts
defineRoute(app, { method, url, bodySchema?, responseSchema /* 必填 */, handler })
```
`responseSchema` **设为必填参数** → 每条读路由都必须声明出口 schema → **I0 confirmedBy 剥离成为编译期强制**（一条路由物理上无法不声明 egress schema 就注册）。这是本契约里**唯一有硬不变式撑腰、值得现在就做**的部分（见 §4.1 的诚实修正）。

**明确不含**（C3）：无独立 `package.json`、无独立版本、无运行期发现、无 `import(path)` 动态加载、无 RBAC 命名空间。所有模块共享**一个 VERSION、一个 Fastify 实例（含已注册的写鉴权 hook + 256KB bodyLimit）、一条 I0 出口规则**。

---

## 4. 不可插拔的内核（Core）

以下是**任何模块都不得绕过/覆盖**的、永远住在 `buildHubServer`/`server.ts`/`main.ts` 的核心。插件化**扩大了攻击面**，所以这些必须中心化强制，而非每个插件自觉。

### 4.1 I0 出口（核心不变式，凌驾全部）—— 含诚实修正

对抗核实（安全视角，已采纳）纠正了一个**过度承诺**：**「编译期保证 I0」言过其实**。I0 是**字段 + 上下文相关**的，**不存在也不可能有一个统一的「删掉所有人字段」过滤器**：

- `GET /api/tasks`（`server.ts:686`）返回的 `Task` **保留 `ownerId`**（D-041 ②「谁负责」是安全堆，非完成量）。
- `GET /api/resource-sessions`（`server.ts:428`）返回的 `ResourceSession` **保留 `invitedMemberIds`**（单窗操作名单，I0 注释已许可）。

一个一刀切的人字段过滤器会**砸坏产品需要的 `ownerId`/`invitedMemberIds`**。所以真正的护栏是：

- **`defineRoute` 强制 `responseSchema`**（保证有 schema，不保证 schema 无人字段）；**加上**
- **一条 contracts 出口测试**：遍历所有 egress schema，断言**无一承认 `confirmedBy` 键、无一派生自 `ActorRefSchema`**（已验证 hub-contracts 无 passthrough/catchall，Zod 默认 strip 丢未知嵌套字段）。
- 规则措辞 = **「无 `confirmedBy`/`ActorRef` + 无按人聚合视图」**，allow-list `ownerId`/`invitedMemberIds`；**不是**「无人字段」。

### 4.2 写信任边界 —— 必须 fail-closed（对抗核实 BLOCKER）

现状 hook（`server.ts:169-194`）**只在 `url.startsWith('/api/')` 且 method ∈ WRITE_METHODS 时触发**。**这是个洞**：轴二集成适配器（feishu/hermes 入站）恰恰想要 `/webhook/*` ingress——一条 `/webhook` POST 或非常规动词会**同时绕过鉴权 + 限流**。

**修正（落地前必修）**：
- `defineRoute` 设为**唯一**注册路径，对任何非 `/api/` url 在启动期 throw；
- **或**把 hook 改成 fail-closed：**对任意路径上的任意非 GET/HEAD/OPTIONS 方法都鉴权**；
- 加测试：无 token 的 `/webhook` POST 返回 401。
- 把 `registerWriteGuard(app, {writeToken, rateLimit})` 抽成具名守卫、第一个注册；把 `main.ts:120` 的 loopback/token 断言**下沉进 `buildHubServer`**（守卫随工厂走，防止 harness/备用入口裸暴露 0.0.0.0）。

### 4.3 其余内核
- **单产品 VERSION**（根 `VERSION`=0.4.0，`bump-version.sh` 同步三包）、**单端口 4177** 同托 console+API、**单部署**。**禁止 per-module 版本**（D-074）。
- 静态 console 兜底（`setNotFoundHandler` + `tryServeStaticConsole`）、`/health`、`/api/system/status`。
- **MODULE_MANIFEST 机制本身 + PageContext shell 状态**（`focusTaskId` 握手，`App.tsx:115-120` 的 PM→dep-graph 跳转）由核心拥有，**不属于任何模块**。
- D-039「保留的治理派生层」（`attribution` 的 `deriveBlockAttributions` 等）**留着可 import、但不被调用** = 一个「未注册的模块」态，**永不删**。

---

## 5. 最难的一刀：把 Schedule 从 GovStore 神接口里拆出来

这是用户「删减排班表」诉求的**真正难点**，也是对抗核实揪出**两个 BLOCKER** 的地方。`GovStore`（`gov-store.ts:175-263`）今天混了 9 个治理方法 + 10 个排班方法。目标是让 schedule 可整体移除而 inventory 不塌。

### 5.1 必须遵守的事实（已一手核实）

1. **`listResources` 有 5 个调用点**（`server.ts` 408/435/545 在排班路由内；**614/650 在 inventory 整车校验内**）。→ **`listResources`/`createResource`/`updateResourceStatus` 必须留在存活的 store 上**，inventory 模块**显式 peer-depend** ScheduleStore 取车列（`registerInvRoutes(app,{invStore, scheduleStore})`，写进 deps 类型、**不藏在闭包**）。这是**唯一一条显式跨模块 seam**。
2. **resources 落盘在独立 `resources.json`**（`file-gov-store.ts:77-194`），其加载/seed/resync 逻辑全在 `FileGovStore` 的**具体类内部** `resourcesForRollback()` / `resyncResourceSeq()`（`mock-gov-store.ts:145/154`），**这两个方法不在任何接口上**。
3. **resourceSessions / relay 故意不落盘**（D-029 粗粒度临时，重启回 seed，`file-gov-store.ts:246`）。

### 5.2 BLOCKER 1 —— ScheduleStore 先做「接口收窄视图」，不做「第二存储根」

`scheduleStore ?? (store as unknown as ScheduleStore)` 之所以安全，**完全因为它是同一个具体对象**。若有人后来注入一个**独立的** scheduleStore 对象（DI 槽的本意），`resources.json` 的持久化 + seq-resync 接线**不会随接口走**——resources 会停止持久化或 id 撞车（`res-new-N` 复用），**且零类型错误**。

**裁决**：
- **(a) 先做接口收窄**（推荐第一步）：`ScheduleStore` 只是 GovStore 之上的**接口视图**，`listResources/createResource/...` 的持久化仍绑同一个 `FileGovStore` 具体对象。**这是路由解耦，不是存储拆分。**
- **(b) 真要独立 scheduleStore**：**先**把 `loadOrSeedResources` + `resyncResourceSeq` + resources 写链抬进一个 `FileScheduleStore` 类，让持久化随接口一起搬。**(b) 没做之前，永远不要注入一个不同于 `store` 的 scheduleStore 对象。**

### 5.3 BLOCKER 2 —— 拆分前先加排班持久化 tripwire

`e2e-pillars.test.ts` **只测 KB closeout + PM tasks/deps，不碰 `/api/resources` / 重启存活**。所以「47 测 + e2e 全绿」可以成立，而**唯一落盘的排班产物 `resources.json` 已被悄悄拆坏**。

**修正（拆分前先 land 到 master）**：加一条 e2e —— POST `/api/resources` 建一台车 → 杀进程 → 同 `TEAMHUB_GOV_DATA_FILE` 目录重启 → 断言该车**及其 `res-new-N` id**（不只是长度）存活。直接覆盖 `FileGovStore.loadOrSeedResources`（`file-gov-store.ts:174-194`）这条接口拆分可能 orphan 的路径。

### 5.4 其余机械红线
- `SqliteGovStore`（19×throw 桩）拆分时必须 `implements GovStore, ScheduleStore`（否则不编译）——纯桩重定位，与接口定义同一原子 commit，让 tsc 强制。
- ScheduleStore 注释里写明 sessions/relay 方法**故意不持久化**（D-029）；删掉未用的 `resourceSessionsForRollback()` 或注明 reserved——**别在拆分里给 sessions 偷偷加 persist**（那是伪装成 refactor 的契约变更）。
- 加测试：**排班路由未注册时，`POST /api/inventory/actions` 带合法整车 holder 仍返回 201**（证明「整车数据生命周期」与「在场排班功能」已解耦）。

---

## 6. 三个用户诉求如何落地

| 诉求 | 落地动作 | 依赖 |
|---|---|---|
| **删减掉排班表** | 删 manifest 一行 `registerScheduleRoutes` + 一个 PageDescriptor + schedule 译文键。inventory 仍工作（依赖 `ScheduleStore.listResources`，仍在）。`ScheduleSnapshot extends GovernanceSnapshot` 留在 contracts（无路由注册即 unused），**落盘数据不动** | §5（ScheduleStore 收窄 + tripwire） |
| **自己增加依赖图** | dep-graph **已存在**（`toDepGraphView` + `DepGraphPage`），只是把它形式化成一个 descriptor + registrar | 几乎零成本（已在） |
| **github/git 本地可选** | 设 `GIT_FORGE_PROVIDER` env + 重启（GitHub / Forgejo / none）。无 rebuild | §2 轴二 GitForgeProvider（**唯一有真实内容的诉求**） |

---

## 7. 分阶段迁移路线（每步 = 原子 commit + verify:all 绿）

> 全程：persisted gov.json/kb.json/inventory.json/resources.json **永不被触碰**，只搬进程内接线 → **零数据迁移风险**。每个绿步按 D-064 commit+push。重启/重建前先 `scripts/backup-teamhub-data.sh`（AGENTS §2.5；fail-closed parse 意味着一处误改 schema 会 boot 时硬 throw——安全但是线上 outage）。

### Phase 0 — 契约解耦三刀（3 个原子 commit，纯 import 路径手术，零 schema 形变）
- **FIX-1**：`WeeklyMinuteWindowBaseSchema` + `weeklyMinuteWindowRefine` + `WEEKLY_MINUTE_WINDOW_REFINE_MSG` 从 `governance.ts` 移到 `common.ts` → `growth.ts` 只依赖 common，**growth→governance 边消除**，KB 簇（kb/kb-similar/kb-closeout）变干净。
- **FIX-2**：把 `GovernanceSnapshot` 从 `attribution.ts` 抽进 `gov-snapshot.ts`（import governance+growth+schemas），`attribution.ts` re-export。retarget **四个**深 importer：`schedule.ts` / `direction-gaps.ts` / `study-suggestions.ts` / **`fixtures.ts`**（对抗核实揪出第 4 个，原计划漏了）。**grep gate**：`grep -rn "GovernanceSnapshot.*from './attribution" apps/hub-contracts/src` post-commit 须零命中。
- **FIX-3**：`RelayBoardResponseSchema` 从 `pm-requests.ts` 移进 `relay.ts` → pm-requests 不再透传 schedule。
- **冻结护栏**：整个 refactor 期间 `GovernanceSnapshotSchema` / `GOVERNANCE_ARRAY_FIELDS` / `ResourcesFileSchema` **视为冻结**，任何对这三者的 diff 都越界、review 必拒。

### Phase 1 — ScheduleStore 接口收窄 + tripwire（先加测试，再拆接口）
按 §5：先 land 排班持久化 e2e tripwire（§5.3）→ 定义 `ScheduleStore`（10 方法含 `listResources`）→ `BuildHubServerOptions += scheduleStore?`（骑 D-042 既有 DI pattern）→ 具体类 `implements GovStore, ScheduleStore` → `scheduleStore ?? (store as ScheduleStore)` fallback，47 测全过同一具体对象。**这一刀单独立功（修神接口 + 让 inventory/schedule seam 显式），不绑任何注册中心决策。**

### ⟐ Stage-1 停车点（推荐先停在这）—— 已交付全部三诉求
做完 Phase 0 + Phase 1，再加两件**独立成立**的小改：
- **`ENABLED` 编译期开关**：一个 TS const `ENABLED = { schedule: true, ... }`，在 `buildHubServer`（跳过路由注册）和 `ConsoleLayout`（过滤 navItems）各读一次，~15 行，**无 manifest/descriptor/PageContext**。TS 穷尽检查保证 server/console 同步，无 404-nav 漂移。
- **Phase 5 GitForgeProvider**（见下）独立 ship。

**到此三诉求全满足**：删排班 = `ENABLED.schedule=false` + 删译文；加依赖图 = 已在；可选 git = env。**对抗核实强烈建议在此 YAGNI——下面 Stage 2 等第 7 个模块真出现再建。**

### Stage 2 — 完整注册中心（**推迟，按需懒构建**）
仅当**真有第 2、3 个新模块陆续到来**、或 IA-REFACTOR 要落 4 组导航时，才把 `ENABLED` 开关升级为：
- **Phase 2**：把每个路由块**逐字** lift 进 `modules/<domain>/index.ts` registrar，`buildHubServer` 变薄编排器（~6 commit，每 lift 后路由测过）。
- **Phase 3**：引入 `defineRoute`（必填 responseSchema）→ I0 剥离结构强制（§4.1）+ 写守卫 fail-closed（§4.2）。
- **Phase 4**：`pageRegistry.tsx` + `PageContext`，替掉 `App.tsx` 三元 + `TITLE_KEY`，`ConsoleLayout` 收 `navItems` prop。
- **Phase 5**（可提前到 Stage 1）：GitForgeProvider 接口 + 3 实现 + 工厂；`/api/git/repos` 调 `provider.listRepos()`；`DataSourceSchema += optional GitForgeConfig`。
- **Phase 6**：运行期 gate —— **见 §8 反模式，默认不做**。

---

## 8. 红线与反模式（C3 明确不做）

- **不做 npm-包-per-module**（C 候选的 31 包爆炸）：D-074 单 VERSION 打架 31 个 package.json，且需要团队没有的 Turborepo/nx——本身就违 C3。用**目录命名空间 + 一条 lint** 拿边界，不付包的代价。
- **不做动态运行期加载 / 插件市场**（D 候选）：闭门 15 人无第三方作者，`import(path)` 任意代码执行 / 依赖冲突 / audit 失败全是没人用的攻击面。且它连干净 enable/disable 都给不了（浏览器不能动态 import React 组件without module federation，关服务端剩个死 404 nav）。
- **运行期模块开关（`TEAMHUB_DISABLED_MODULES`）不是安全边界，默认不做**（对抗核实 med）：它 **fail-open**——一个掉了/打错的 env 在重启时会**悄悄重新暴露**本该关掉的模块。若 schedule 是为压住带 `invitedMemberIds` 的 `/api/resource-sessions` 而关的，一个缺失 env 就把人数据路由重新打开、还不报错。**编译期删（`ENABLED` const）才 fail-safe。** I0 敏感面（schedule / resource-sessions / tasks）**只允许编译期移除**。真要运行期 gate，**反转成 allow-list `TEAMHUB_ENABLED_MODULES`**（缺省=仅核心），掉 env 则 fail-closed。
- **不引入 per-module 版本 / RBAC / 多租户 / module federation**：整套系统保持一个 Fastify 实例、一个 VERSION、一个端口、一套 `bump-version.sh`，一个新人不查框架手册就能读懂的「纯 TS 函数调用注册」。

---

## 9. 与 IA-REFACTOR 的关系（now.md frontier 待讨论项）

IA-REFACTOR（10 平铺页 → 4 数据域分组，单开 branch）**纯在 shell/nav 层**操作（`ConsoleLayout` navItems 分组 + `App.tsx`），不碰任何功能模块内部。两种排序，对抗核实给了**相反建议**，需用户在 §10 拍：

- **目标架构视角**：先在 master 落模块 registry（它是底座），再把 IA-REFACTOR rebase 上去——分组退化成给 descriptor 加一个 `group` 字段，省掉两并行 branch 在 `translations.ts`/`App.tsx` 的 merge 冲突。
- **YAGNI 视角（对抗核实推荐）**：**反过来**——先 ship IA-REFACTOR 的 nav 分组（`ConsoleLayout` 改 `NavGroup[]`，shell-only，不碰功能内部）+ GitForgeProvider seam，两者都是**具体用户价值**；registry 当机会主义重构，等第 2、3 个模块真需要时再懒做。理由：别让一个不可见的投机底座**挡住**可见的导航改善、甚至把时间预算吃光导致 IA-REFACTOR 永不落地。
- 共识：phase-1 的「机器人队页」（resources + schedule 合并）天然是**同一 SharedResource 模型上两个视图** = 一个模块的两个 descriptor，与本架构同向。

---

## 10. 待决策项（需用户拍板，动代码前）

1. **采纳范围**：只做 **Stage 1（最小可行模块化）**，还是承诺 **Stage 2 完整注册中心**为目标？（推荐：Stage 1 现在做，Stage 2 设为「第 7 个模块/IA-REFACTOR 触发」的待命目标）
2. **排序 vs IA-REFACTOR**（§9）：先底座后 nav，还是先 nav 后底座懒构建？（对抗核实推荐后者）
3. **ScheduleStore 深度**：停在 §5.2(a) 接口收窄视图，还是要做到 (b) 独立 `FileScheduleStore`？（推荐先 (a)，(b) 等真需要独立排班存储时）
4. **git provider 落地时机**：GitForgeProvider 现在就接（D-038 本地 Forgejo 迁移仍「考虑中」/`open_for_decision: GITHUB-TO-LOCAL`），还是等 Forgejo 部署审批后？
5. 本文落地任何一刀都触 `apps/hub-*/src` 行为 → 须按 D-074 `scripts/bump-version.sh` 自增版本；架构类任务须代码级 + 契约级验证（AGENTS §4.6）。

---

### 附：四候选架构评分（workflow `wf_d41c1c54-dce`）

| 候选 | 分 | 一句话 |
|---|---|---|
| **B 编译期模块注册中心** | **9** | 最贴 C3、迁移风险最低；纯 TS、无新工具、无包爆炸、无动态 import；自动继承 I0+写守卫+bodyLimit。**胜出**（硬化：ScheduleStore 拆分提为强制 + 嫁接 C 的 GitForgeProvider） |
| C workspace-包-per-module | 5 | seam 分析最对（包边界真能挡非法跨模块 import），但 31 包对 C3 过度工程；其好点子（契约三刀/ScheduleStore/GitForgeProvider/pageRegistry）全部嫁接进 B、无需包爆炸 |
| A 特性开关 over 巨石 | 4 | 迁移最便宜，但「删排班」只是 if-gate 掉、什么都没真移除，对 GovStore 神接口零作为。**作为 Stage 1 的 `ENABLED` 开关嫁接保留** |
| D 动态运行期加载 | 2 | 直接违 C3（CORE-4 点名为过度工程）；闭门 15 人永不用；I0 退化成无界插件审计面 |
