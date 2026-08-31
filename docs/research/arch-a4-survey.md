---
kind: research
status: active
domain: architecture
truth_for: arch-unify-a4-survey
checked_at: 2026-08-31
review_after: 2026-11-30
---

# ARCH-UNIFY A4 架构现状调查报告

> 性质：只读调查。本文是本次任务唯一允许写入的文件，未修改任何源代码、未做任何 git 写操作。
> 调查时间：2026-08-31（report HEAD = `e9a2e94bbe30aceed77dfa768e4e0cb0135252b5`，
> `chore(harness): REIMBURSE-OFD-PARSE 落 done-tonight v0.59.0`）。
> ⚠️ 主 agent 正同仓并行做重构，本报告以「本次实际读到的文件内容」为准；若之后文件被改，以新 HEAD 为准。

## 0. 调查方法与口径

- 依据总纲 `docs/design/software-architecture.md`（第 4/5/8/9/10/11/12/14 章）逐域核对三包同构模板。
- 三包同构模板判据：
  - contracts：`apps/hub-contracts/src/domains/<domain>/` 下 `model/requests/policies[/import/export]/index`；
  - server：`apps/hub-server/src/modules/<domain>/` 下 `routes/service/repository/sqlite-repository/index`；
  - console：`apps/hub-console/src/features/<domain>/` 下 `api/hooks[/components]/index`。
- 所有行数为 `wc -l` 实测；import 关系为 `rg` 实测（含 `dist/` 内的为编译产物，报告只统计 `src/`）。
- 架构门实测：`node scripts/verify-architecture.mjs` → **EXIT=0，绿**（详见 §3）。

---

## 1. 每域迁移状态表

| 域 | contracts（domains/ 三包同构） | server（modules/ 三包同构） | console（features/ 三包同构） | 状态 |
|---|---|---|---|---|
| **reimburse**（A3 模板） | ✅ `domains/reimburse/` model/requests/policies/import/export/index | ✅ `modules/reimburse/` routes(125)/service(287)/repository(45)/sqlite-repository(140)/index | ✅ `features/reimburse/` api/hooks/components/index/ReimbursePage | **已迁移**（A3 试点，最完整） |
| **checklist** | ✅ `domains/checklist/` model/requests/policies/index | ✅ `modules/checklist/` routes(80)/service(132)/repository(49)/sqlite-repository(92)/index | ✅ `features/checklist/` api/hooks/index + components/(2 个) | **已迁移**（A4 首刀，C2） |
| **baseline** | ✅ `domains/baseline/` model/requests/policies/index | ✅ `modules/baseline/` routes(63)/service(82)/repository(53)/sqlite-repository(64)/index | ✅ `features/baseline/` api/hooks/index —— ⚠️ **缺 components/ 与独立页面**（UI 仍在 overview/console-pages） | **部分迁移**（console 侧不完整） |
| **inventory**（ledger） | ❌ `contracts/inventory.ts`(494) + `inventory-import.ts`(169) | ❌ `routes/ledger.ts`(251, inv 段) + `store/gov-store.ts` 的 `InvStore` + `store/sqlite-inv-store.ts`(228) | ❌ `features/inv/` 仅 hooks.ts(1)；`api/segments/domain.ts`(inv 段) + `api/schemas/inv.ts` | **未迁移** |
| **knowledge**（kb） | ❌ `kb.ts`(203)+`kb-similar.ts`(368)+`kb-closeout.ts`(410) | ❌ `routes/kb.ts`(227) + `store/gov-store.ts` 的 `KbStore` + `store/sqlite-kb-store.ts`(71) + `kb/error-code.ts` | ❌ `features/kb/` 无 hooks/api；`api/segments/domain.ts`(kb 段)+`api/schemas/kb.ts` | **未迁移** |
| **artifacts**（archive） | ❌ `artifact.ts`(67)+`artifact-version.ts`(45)+`artifact-requests.ts`(90) | ❌ `routes/archive.ts`(188) + `store/artifact-store.ts`(46) + `GovStore.ArtifactStore` 交叉 | ❌ `features/archive/` 无 hooks/api/index；`api/segments/domain.ts`(artifact 段) | **未迁移** |
| **schedule**（含 relay） | ❌ `schedule.ts`(612)+`schedule-infra.ts`(252)+`schedule-requests.ts`(120)（`schedule.ts:11/18`、`schedule-infra.ts:10` 直接 import `pm-core.ts`） | ❌ `routes/schedule.ts`(221) + `store/schedule-store.ts`(186) + `sqlite-gov-repository.ts` schedule 段 | ❌ `features/schedule/` 无 api/hooks/index；`api/segments/schedule.ts`+`hooks/useSchedule.ts`+`relay-canvas/useRelayMutations.ts` | **未迁移** |
| **pm/system**（A5 收口对象） | ❌ `pm-core.ts`(831)+`pm-requests.ts`(221)+`identity.ts`(137) | ❌ `routes/pm.ts`(56)+`members.ts`(283)+`roster.ts`(89)+`tasks.ts`(278)+`tasks-claim.ts`(206) + `store/pm-core-store.ts`(355)+`store/gov-store-logic.ts`(424)+`sqlite-gov-repository.ts` pm 段 | ❌ `features/pm/` 无 hooks/api；`api/segments/system-pm.ts`+`members.ts` + `hooks/useTasks.ts`/`useRoster.ts` | **未迁移**（最大 god） |
| **relay** | （并入 schedule） | `routes/schedule.ts` relay 端点段 | `features/schedule/relay-canvas/*`(useRelayMutations.ts 147) | 随 schedule |
| **archive** | （并入 artifacts） | `routes/archive.ts` | `features/archive/` | 随 artifacts |
| **system**（平台） | `schemas.ts`(245) 段 + `system-status.ts`(76) | `routes/system.ts`(100) | `api/segments/system-pm.ts`(system 段) | 平台域，未按域模板迁 |
| **lark/integrations** | `lark-integration.ts`(74) | `routes/lark.ts`(162) + `store/lark-integration-store.ts`(50) | `api/segments/members.ts`(lark 段) | 未迁移（集成域，A4 清单外） |

**小结**：三包同构模板只在 **reimburse / checklist / baseline** 三个域成立（reimburse、checklist 完整，baseline console 缺 components/Page）。其余业务域全部仍在旧路径：contracts 根级文件、server `routes/*.ts` + `store/*`、console `api/segments/*` + 页面内裸 hook。与总纲 §16 A4「checklist → baseline → inventory → knowledge → artifacts → schedule → PM/system」推进方向一致：前两步已落，后面五个域（inventory/knowledge/artifacts/schedule/pm）未动。

---

## 2. god 文件残余清单（含行数与 import 方）

### 2.1 contracts 根级多域文件（`apps/hub-contracts/src/`）

| 文件 | 行数 | 被谁 import（src/ 内） | 说明 |
|---|---|---|---|
| `pm-core.ts` | **831** | `index.ts`、`pm-requests.ts`、`schedule.ts`、`schedule-infra.ts`、`attribution.ts`、`gov-report.ts`、`identity.ts`、`resource-requests.ts`、`roster-import.ts`、`fleet-import.ts`、`fixtures/pm-seed.ts`、`domains/baseline/policies.ts`、`verticals/robotics.ts` | season/group/member/task/dependency/need/direction/dep-graph 全挤一文件；是 contracts 层最重的 god |
| `pm-requests.ts` | 221 | `index.ts` | pm 写请求（members/setup 段） |
| `schedule.ts` | 612 | `index.ts`（`export *`） | 在场排班；还 import `pm-core.ts`/`schedule-infra.ts`/`growth.ts` |
| `schedule-infra.ts` | 252 | `schedule.ts`、`index.ts` | 依赖 `pm-core.ts` |
| `attribution.ts` | 566 | `index.ts` | 归因算法；import `pm-core.ts`+`growth.ts`+`artifact.ts` |
| `gov-report.ts` | 458 | `index.ts` | 跨 pm/schedule/inventory/baseline 的项目汇报投影 |
| `inventory.ts` | 494 | `index.ts`、`inventory-import.ts` | 库存域 |
| `kb.ts`+`kb-similar.ts`+`kb-closeout.ts` | 203+368+410 | `index.ts` | 知识库域 |
| `artifact.ts`+`artifact-version.ts`+`artifact-requests.ts` | 67+45+90 | `index.ts`、`attribution.ts` | 归档物域 |
| `schemas.ts` | 245 | `index.ts`、`apps/hub-console/src/constants.ts`（注释提及） | bot/adapter/event 平台契约 + 弃用兼容 |
| `fixtures.ts` | 4（瘦 barrel）→ 实质 `fixtures/api-contracts.ts`(355)+`pm-seed.ts`(140)+`scenario-seeds.ts`(384) | `index.ts`（显式列出） | 跨域 demo builder；`pm-seed.ts` import `pm-core.ts` |
| `index.ts` | 367 | 全仓入口 | 对 pm-core/schedule/schedule-infra/growth/attribution/inventory/kb/gov-report 等仍 `export *`/显式 re-export（reimburse/checklist/baseline 已是显式 public API） |

### 2.2 server 端 god（`apps/hub-server/src/`）

| 文件 | 行数 | 被谁 import | 说明 |
|---|---|---|---|
| `store/gov-store.ts` | 163 | 15 个 `routes/*.ts` + `server.ts` + `modules/checklist/service.ts` + `modules/reimburse/service.ts` + 各 store | `GovStore = PmCoreStore & ArtifactStore & ScheduleStore` 三域交叉接口 + `KbStore`/`InvStore` 接口；`getSnapshot()` 是 god 万能快照 API |
| `store/sqlite-gov-repository.ts` | **778** | `server.ts`、`store/sqlite-unified.ts` | **一个类同时实现 pm/artifact/schedule 三域**（12 张表）；A5 首要拆除对象 |
| `store/gov-store-logic.ts` | 424 | `sqlite-gov-repository.ts`、`store/gov-store.ts` | pm 域对象构造/状态机纯函数（应迁 `modules/pm/policies` 或 contracts） |
| `store/pm-core-store.ts` | 355 | `gov-store.ts` | pm 域接口 |
| `store/schedule-store.ts` | 186 | `gov-store.ts` | schedule 域接口 |
| `store/sqlite-unified.ts` | 337 | `main.ts`、`server.ts` | 唯一 composition（保留，是目标路径） |
| `store/sqlite-inv-store.ts` | 228 | `sqlite-unified.ts` | 独立 InvStore SQLite 实现 |
| `routes/*.ts`（15 文件） | **2610 合计**（tasks 278/members 283/ledger 251/schedule 221/kb 227/archive 188/helpers 172/lark 162…） | `server.ts`（registerXxx） | 旧路由目录；`reimburse/checklist/baseline` 已冻结不在其中 |
| `route-schemas.ts` | 30 | `routes/kb.ts`、`routes/schedule.ts` | KB/schedule/baseline 三域 query schema 小 god |
| `server.ts` | 346 | 组合根 | 超建议阈值 300 行，但仍是「装配外壳」性质 |

### 2.3 console 端多域文件（`apps/hub-console/src/api/`）

| 文件 | 行数 | 覆盖域 | import 方 |
|---|---|---|---|
| `segments/domain.ts` | 103 | artifacts + kb + inventory（3 域） | `api/client.ts` |
| `segments/system-pm.ts` | 210 | system + pm + artifacts（3 域） | `api/client.ts` |
| `segments/members.ts` | 152 | members + session + setup + roster + lark（≥5 域） | `api/client.ts` |
| `segments/schedule.ts` | 113 | schedule + relay + resources（3 域） | `api/client.ts` |
| `schemas/pm.ts`(54)/`schemas/schedule.ts`(39)/`schemas/inv.ts`/`schemas/kb.ts`/`schemas/resources.ts`/`schemas/system.ts` | — | 客户端响应 schema 镜像 | 各 segment |

`api/client.ts` 目前 `HubApiClient = SystemPmSegment & ScheduleSegment & MembersSegment & DomainSegment & ReimburseSegment & ChecklistSegment & BaselineSegment`（4 个旧多域段 + 3 个新单域段共存）。

### 2.4 测试侧残余（编译/测试引 god，供 A5 清理参考）

- `apps/hub-server/test/support/`：`inmemory-gov-store.ts`/`inmemory-gov-store-pm.ts`/`inmemory-gov-store-artifact.ts`/`inmemory-gov-store-schedule.ts` 等按三域拆的 fake + `build-test-hub-server.ts`。
- `apps/hub-server/test/routes.test.ts` 等直接 import `@teamhub/hub-contracts` 的 pm-core 符号。

---

## 3. 架构门白名单现状

脚本：`scripts/verify-architecture.mjs`（`ARCHITECTURE_BASELINE`，规则+文件+精确命中数三元组，命中数减少/文件消失反而报错）。

### 3.1 当前全部 25 条白名单

**multi-domain-client-segment（4 条）**：

| 规则 | 文件 | 命中数（覆盖域数） |
|---|---|---|
| multi-domain-client-segment | `apps/hub-console/src/api/segments/domain.ts` | 3 |
| multi-domain-client-segment | `apps/hub-console/src/api/segments/members.ts` | 2 |
| multi-domain-client-segment | `apps/hub-console/src/api/segments/schedule.ts` | 2 |
| multi-domain-client-segment | `apps/hub-console/src/api/segments/system-pm.ts` | 3 |

**raw-react-query（21 条，对应 HOOKS-1-TAIL）**：

| 文件 | 命中数 |
|---|---|
| `App.tsx` | 4 |
| `features/archive/ArchivePage.tsx` | 3 |
| `features/dep-graph/DepGraphPage.tsx` | 1 |
| `features/direction/DirectionPage.tsx` | 1 |
| `features/identity/IdentityBar.tsx` | 3 |
| `features/inv/InvQuickRecordForm.tsx` | 1 |
| `features/inv/sub/CreatePartTypeForm.tsx` | 1 |
| `features/kb/KbSearchPage.tsx` | 1 |
| `features/myview/MyViewPage.tsx` | 1 |
| `features/overview/sub/BaselineStates.tsx` | 1 |
| `features/pm/PmCreatePanel.tsx` | 1 |
| `features/resources/sub/CreateResourceForm.tsx` | 1 |
| `features/resources/sub/ResourceRow.tsx` | 2 |
| `features/schedule/relay-canvas/useRelayMutations.ts` | 5 |
| `features/schedule/RelayCanvas.tsx` | 1 |
| `features/schedule/SchedulePage.tsx` | 2 |
| `features/settings/sub/useSettingsMutations.ts` | 3 |
| `features/settings/sub/useSettingsQueries.ts` | 3 |
| `hooks/useRoster.ts` | 3 |
| `hooks/useSchedule.ts` | 3 |
| `hooks/useTasks.ts` | 2 |

### 3.2 门当前是否绿

```
$ node scripts/verify-architecture.mjs
软件架构检查通过：3 个 workspace package，25 项迁移基线。   （EXIT=0，绿）
```

门本身还负责：workspaces 覆盖、单 lockfile、VERSION/包版本一致、三包禁止依赖方向、contracts 禁 Fastify/React/node:sqlite、route 禁 import SQLite 具体实现、禁 `File*Store`/`PersistedFile`/`TEAMHUB_*_DATA_FILE`/生产 InMemory、`reimburse/checklist` 模板必需/禁用旧路径——**这些当前全部通过**。注意：`baseline` 模板未被门强制（`verifyMigratedDomainTemplates` 只校验 reimburse、checklist 两域），且门尚未启用「模块 registry 三端 ID 一致」「组合根/单文件行数阈值」两类检查（总纲 §14 注明在模板落地后启用）。

---

## 4. 裸 useQuery/useMutation 残余（HOOKS-1-TAIL）

- 门规则：`useQuery/useMutation(` 只允许出现在 `features/<domain>/hooks.ts` 或平台 bootstrap `hooks/useHubMutation.ts`，其余一律计为 raw。
- 现状：**21 个文件、共 44 处裸调用**（与白名单逐条完全一致；门绿证明无新增、无逃逸）。
- 分布（按待迁域归类）：
  - **pm**：`PmCreatePanel.tsx`(1)、`hooks/useTasks.ts`(2)、`hooks/useRoster.ts`(3) → 6
  - **schedule**：`useRelayMutations.ts`(5)、`RelayCanvas.tsx`(1)、`SchedulePage.tsx`(2)、`hooks/useSchedule.ts`(3) → 11
  - **settings**（system 运维）：`useSettingsMutations.ts`(3)、`useSettingsQueries.ts`(3) → 6
  - **kb**：`KbSearchPage.tsx`(1) → 1
  - **inv**：`InvQuickRecordForm.tsx`(1)、`sub/CreatePartTypeForm.tsx`(1) → 2
  - **archive**：`ArchivePage.tsx`(3) → 3
  - **其他平台/横切**：`App.tsx`(4，bootstrap)、`IdentityBar.tsx`(3)、`DepGraphPage.tsx`(1)、`DirectionPage.tsx`(1)、`MyViewPage.tsx`(1)、`BaselineStates.tsx`(1)、`CreateResourceForm.tsx`(1)、`ResourceRow.tsx`(2) → 14
- 合法保留（feature hooks.ts 内）：`features/{reimburse,checklist,baseline,inv,workbench}/hooks.ts` 共 8 处，不计违规。
- 对应 todo「HOOKS-1-TAIL ~19 处」：白名单实际 **21 个文件条目**（44 次调用），与 ~19 处口径接近（可能按「需迁移页面/文件数」另计）。建议以白名单 21 条为唯一真相。

---

## 5. 违规与风险清单（按严重度排序，对照总纲第 4/8/9/10/11/12 章）

### P0（阻断 A5 收口、必须拆）
1. **God repository 单类跨三域** — `store/sqlite-gov-repository.ts`(778) 一个类同时实现 pm-core/artifact/schedule 三域接口（12 张表、11 条 id 序列）。违反 §4「repository 调用另一个领域 repository」/§8.3「一域一 repository」；`getSnapshot()` 是 §8.3 明令禁止的「万能 snapshot API」。import 方：`server.ts`、`store/sqlite-unified.ts`。
2. **God store 交叉接口 + 万能快照** — `store/gov-store.ts`(163) `GovStore = PmCoreStore & ArtifactStore & ScheduleStore`，被 15 个 route + 2 个已迁移 module service + server.ts 共同 import；`getSnapshot()` 向所有消费方暴露全量快照，无法做窄 port 隔离。
3. **Route 内业务编排（最重）**：
   - `routes/ledger.ts`(251)：`POST /api/hermes/inbound` 里整段库存查询/记账/调拨业务逻辑（§8.1「route 不允许计算状态/构造实体」），`GET /api/inventory` 在 route 拼 inv+schedule 快照，`POST /api/inventory/actions` 在 route 校验 holder 合法性。
   - `routes/tasks.ts`(278)：`POST /api/tasks` 在 route 做 convergence-scope/哨兵组/叶子组业务校验，`POST /api/seasons` 在 route 做重名/日期校验。
   - `routes/schedule.ts`(221)：`POST /api/resource-sessions/batch` 在 route 做整批外键校验循环（resourceId/group/task/order 冲突）。
   - `routes/archive.ts`(188)：上传在 route 内做文件系统读写（§8.1 越权；artifact-storage 是 infra 不应在 route）。
4. **已迁移 service 仍依赖完整 GovStore（跨域非窄 port）** — `modules/checklist/service.ts`(第 ~10 行 import gov-store，`waiveItem` 用 `gov.getSnapshot().members` 判 gateReviewer)；`modules/reimburse/service.ts`(第 ~12 行 import gov-store，`isAdmin` 用 `gov.getSnapshot().members`)。违反 §8.2「跨域依赖通过窄 port 注入」——应注入 `MembersAdminPort`/`GateReviewerPort`。

### P1（A4 各域迁移时的固定工作项）
5. **contracts 根级 god 文件与 index.ts 全量 re-export** — `pm-core.ts`(831)/`schedule.ts`(612)/`attribution.ts`(566)/`gov-report.ts`(458)/`inventory.ts`(494)/kb*.ts 等；`index.ts`(367) 对它们 `export *`。违反 §9「每域独立 model/requests/policies，禁止新 schemas.ts 式 god」。
6. **console 4 个多域 segment + 21 处裸 hook** — 违反 §10「一域一 segment」「裸 useQuery 只许在 feature hooks」。当前全部在白名单内（§3）。
7. **route 手写 CSV 导出** — `routes/export.ts`(80) 自带 `csvEscape/toCsv`。§11.2 要求 CSV 统一在 `hub-server/src/platform/export/`，且**该目录目前不存在**（§5 风险项：导出基础设施尚未落地，A4 需先建再迁 export 路由）。
8. **时间未走 Clock 注入** — `routes/gov-report.ts`（`buildGovReport` 的 `generatedAt: new Date().toISOString()`）直用 `new Date()`。违反 §12「禁止业务代码散落 new Date()」。

### P2（结构债，A5 一并处理）
9. **`route-schemas.ts`(30) 三域 query schema 小 god** — 应随各域迁入 contracts 对应 domains。
10. **测试侧旧路径** — `test/support/inmemory-gov-store*.ts` 等按三域拆的 fake 与 `test/routes.test.ts` 直接吃 pm-core 符号；A5 需随 GovStore 拆除同步收敛。
11. **baseline console 模板不完整**（缺 components/Page），门未覆盖 baseline 模板。

---

## 6. A4 迁移顺序建议

### 6.1 依赖关系（谁被谁 import，决定顺序）

```
pm-core（根，无人依赖它；被 schedule/attribution/gov-report/identity/roster/... import）
  ├─ schedule ← ledger(/api/inventory 读 resources)、gov-report、lark
  ├─ inventory ← reimburse(StockInPort，已窄化)、search、export、gov-report
  ├─ knowledge ← search；kb-closeout 复用了 pm 的 closeoutKbNode
  ├─ artifacts ← search(artifactDocuments)、export?、gov-report
  └─ system(mock) 无业务依赖
```

已迁域：baseline ← checklist（双向窄 port，已解耦）；reimburse → inventory（窄 StockInPort + UoW，已解耦）；reimburse/checklist → pm.members（**仍是完整 GovStore，未窄化**）。

### 6.2 建议顺序与每域预估工作量（以 reimburse 迁移 ≈ 3~4 天 为参照系）

| 顺序 | 域 | 依据 | 预估工作量 |
|---|---|---|---|
| 1 | **artifacts**（archive） | 契约已基本独立（artifact*.ts 202 行，最小）；`ArtifactStore` 接口已从 GovStore 拆出；console ArchivePage 仅 117 行。先迁可把 artifacts 表/seq 从 `sqlite-gov-repository` 摘出，是 GovStore 瘦身的第一步。 | **S**（约 1~1.5 天）：新建 `modules/archive/{routes,service,repository,sqlite-repository}`，从 GovStore 摘 artifact 段，console `api/hooks/index`，拆 domain.ts 的 artifact 段，白名单 -1 |
| 2 | **knowledge**（kb） | `KbStore` 已独立、`sqlite-kb-store.ts` 已是独立 SQLite 实现（71 行，改造量小）；closeout 里 knowledge_nodes 属 pm，可先留窄 port。 | **M**（约 2~3 天）：wrap 现有 sqlite-kb 为 repository+service，迁 `routes/kb.ts`(227) 编排，console kb `api/hooks`，拆 domain.ts kb 段 |
| 3 | **inventory**（ledger） | `InvStore` 独立、`sqlite-inv-store.ts`(228) 已是独立实现；但 route 里 hermes 编排（约 90 行）需下沉 service，且读 schedule resources（窄 port `ListResourcesPort`）。 | **M**（约 2~3 天）：`modules/inventory/{routes,service,repository,sqlite-repository}`，hermes inbound 迁入 service，拆 domain.ts inv 段，窄化 reimburse 对 inventory 的已有 StockInPort |
| 4 | **schedule**（+relay） | 契约文件大且 import pm-core（需先拆 pm 契约层才能完全独立，或先迁行再回头拆）；console 侧最重（RelayCanvas 347 + SchedulePage 200 + relay-canvas 5 文件 + carry-over/today-plan/date-utils）。 | **L**（约 3~4 天）：`modules/schedule/{routes,service,repository,sqlite-repository}`，从 sqlite-gov-repository 摘 schedule 三表，console `features/schedule/{api,hooks,index}`，`hooks/useSchedule.ts`+`useRelayMutations.ts` 收进 feature hooks，拆 segments/schedule.ts |
| 5 | **pm/system**（最大 god） | 被依赖最多、体量最大，最后迁（总纲 §16 明确「最后拆 GovernanceSnapshot/GovStore」）；contracts `pm-core.ts`(831)+`pm-requests.ts`(221) 拆 `domains/pm-core/{model,requests,policies}`，server 四 route 文件（pm/members/roster/tasks/tasks-claim，共 ~912 行）→ `modules/pm/`，`gov-store-logic.ts`(424)→policies/service，`pm-core-store.ts`(355)→repository port，sqlite-gov-repository pm 段→`modules/pm/sqlite-repository`；console `features/pm`+`features/settings/setup` 的 hooks、`segments/system-pm`/`members`、`hooks/useTasks`/`useRoster`。 | **XL**（约 1 周，建议拆 3~4 刀：先摘 members/roster、再 tasks/deps/needs、再 knowledge_nodes、最后删 GovStore） |
| 6 | **A5 归零** | pm 迁完后：删 `gov-store.ts`/`sqlite-gov-repository.ts`/`gov-store-logic.ts`/`pm-core-store.ts`/`schedule-store.ts`/`artifact-store.ts` 残余、`schemas.ts` 弃用段、`route-schemas.ts`，拆 `index.ts` 全量 re-export，清 25 条白名单，收敛 test/support 旧 fake | 与第 5 步合并计 |

**A4 整体预估**：约 2~3 周（artifacts S + kb/inventory M×2 + schedule L + pm/system XL）；完成判据 = 每个域三包同构 + GovStore 只剩 pm 域 + 白名单降到只含 pm 相关条目。

### 6.3 关键前置
- 先落 §11.2 的 `hub-server/src/platform/export/` 基础设施，再迁 `routes/export.ts`，否则 A4 期间导出自定义会被复制多份。
- 先给 reimburse/checklist 两个 service 的 `gov.getSnapshot().members` 换成窄 `AdminPort`/`GateReviewerPort`（P0-4），解除已迁域对 GovStore 的残留依赖，再动 GovStore 拆分。
- 每刀保持 `node scripts/verify-architecture.mjs` 绿；白名单条目只随迁刀收缩，不允许新增。

---

## 摘要（报告全文速览）

- **门状态**：`verify-architecture.mjs` 绿（EXIT=0），25 条白名单 = 4 条多域 segment + 21 条裸 hook，与代码逐条一致。
- **已迁域**：reimburse（A3 模板，三包最完整）、checklist（完整）、baseline（console 缺 components/Page）——三包同构仅此三个域成立。
- **未迁域**：artifacts、knowledge、inventory、schedule(+relay)、pm/system 全部仍在旧路径（contracts 根级文件 + server `routes/*`+`store/*` + console `api/segments/*`）。
- **god 残余**：contracts `pm-core.ts`(831)/`schedule.ts`(612)/`attribution.ts`(566)/`gov-report.ts`(458)/`inventory.ts`(494)/kb*.ts(981) 等；server `sqlite-gov-repository.ts`(778，单类跨三域)、`gov-store.ts`(163，三域交叉接口)、`gov-store-logic.ts`(424)、`routes/*.ts`(合计 2610)；console `segments/domain.ts`(103)/`system-pm.ts`(210)/`members.ts`(152)/`schedule.ts`(113)。
- **裸 hook**：21 文件 / 44 处（pm 6、schedule 11、settings 6、kb 1、inv 2、archive 3、其他平台 14）。
- **最高风险**：gov repository/store 三域混一 + 15 个 route 直接吃 GovStore + ledger/tasks/schedule 三个 route 内含业务编排 + reimburse/checklist service 仍依赖完整 GovStore（未窄 port）+ route 手写 CSV（platform/export 目录尚未建立）。
- **迁移建议**：artifacts → knowledge → inventory → schedule → pm/system（最后拆 GovStore），预估 2~3 周；先建 export 基础设施、先窄化两个已迁 service 的 GovStore 依赖。
