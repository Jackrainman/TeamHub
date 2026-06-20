# 在场排班 UX — buildable-now 锁定设计（SCHEDULE-DESIGN-LOCK）

> 权威实现规格。消解 frontier `SCHEDULE-DESIGN-LOCK`：用户「现在什么都没有、也没办法加」。
> 零件已就位（A1 日期选择器 / A2 加删一棒 / RelayCanvas 拖拽·ETA·交接线），整页「空了怎么起头、怎么加第一棒」未锁。本文锁定后可无人值守落实现、零猜测。
> 上游：D-029（排班派生）/ D-069（组级容量）/ D-072（`presence-resource-redesign.md`：两视图·三态去钟点·「谁可下班」·机器人=带编号对象）/ IA 阶段 1（`sched-date-relay-robot-redesign.md` §B：机器人队页 = 机器人管理 + 在场排班合一）。
> 风格仿 `inv-bom-core.md`。状态：随 D-075 落地（分支 `ia-phase1-fleet`）。

## 0. 根因诊断 + 已锁决策

### 0.0 「什么都没有、也没办法加」的真根因（已核实代码）
1. **gate bug（主因，前端）**：`SchedulePage.tsx` 把整块 `<RelayCanvas>`（含「+加一棒」工具条与空态）gate 在 `recommendations.length === 0` 之后。`recommendations` 来自 `derivePresenceSchedule`，只在「有已确认 session」时才产出。**一个 session 都没有的新一天 → 0 条 recommendation → 整个 RelayCanvas 连同它的加棒入口被替换成一张没有任何按钮的冷启动卡**。RelayCanvas 自带的工具条 + 空态永远到不了屏幕。→ 这就是「什么都没有 + 没法加」。
2. **A1 后 `'今晚'` seed 不可达（次因，数据）**：唯一 seed session 钉死 `windowLabel: '今晚'`，而 A1 落地后 UI 全按真实日期（`isoToday()`）切换、日期选择器选不出 `'今晚'` → 默认进来必空板。
3. **录入前置（再次因，已被 IA 缓解一半）**：加一棒要同时选**机器人**（boardable）+ **任务**（带 groupId）。缺机器人 → IA 阶段 1 合并后同页可就地建；缺任务 → 仍需去项目看板（任务录入是阶段 2 才并入的项目域）。

### 0.1 三问锁定（速览）
| # | 议题 | 决定 |
|---|---|---|
| Q1 | 空态 | RelayCanvas **永远渲染**（不再被 `recommendations.length` 短路）；空板 = **带 CTA 的引导卡**（`+ 加第一棒` 直接打开加棒表单 + `沿用上一天计划`），不是静态告示。 |
| Q2 | 录入动线 | 空板 → `+ 加第一棒` → 选机器人 + 选任务 → 第一棒落板。**任务必填**（不做无任务棒）。`noOptions` 拆「缺机器人（就地建）」「缺任务（跳项目看板）」两条可执行引导。 |
| Q3 | 默认数据 | **每天空板起步 + 手动「沿用上一天计划」按钮**（纯前端、复用既有端点、人点才结转）。**不自动结转、不建每日计划死表、不放假 seed 数据**。 |

### 0.2 不放假 seed（守 派生优先 / 别建幽灵数据）
不给 demo 钉一条「今天」假 session。理由：① mock store 用 FixedClock，UI 用真实 `new Date()`，钉死日期必错配；② 往 seed 加 session 会牵动 ~4–8 个测试文件的精确断言；③ 更根本——**一天的计划 = 该 `windowLabel` 下的 resourceSessions 集合（派生事实），用着才有、不用就空**，钉假数据违背「别建没人填的死表」。空板**不是 bug、是正确态**，只要它**可操作**（Q1 引导卡）即可。WSL demo 的故事走「现加一棒 → 切天 → 沿用上一天」，全程真实操作产生数据。

### 0.3 红线（结构约束，非散文）
- **I0 反监视**：本页任何新 UI 的键只能 group / resource / task。「沿用上一天」结转**逐字段只取** resourceId/windowLabel/orderInWindow/holderGroupId/holderTaskId，`invitedMemberIds` **恒传 `[]`**（绝不从源 session 拷，即便 `GET /api/resource-sessions` 读视图带它——那是「本窗操作名单」，I0 许可存在但**永不渲染、永不跨日结转**）。`eta` 不结转（昨天的预估今天无意义）；handoffs 不结转（接力线当天临时拍板，跨日易悬空）。
- **人在环**：「沿用上一天」是人点的一次性动作，落库即确认（`confirmedBy: console`）；绝不自动跨日。
- **助人语气**：空态/引导文案「谁先上、谁能先走」，不出现「停活/考勤/谁没来」。

## 1. 空态（Q1）
- `SchedulePage`：删 `recommendations.length === 0 ? 冷卡 : <RelayCanvas/>` 三元，改**无条件渲染 `<RelayCanvas/>`**；「各组详情」`schedule-detail` 网格单独 gate `recommendations.length > 0`（只 gate 它自己）。
- `RelayCanvas` 空分支（`stages.length === 0`）：保留顶部工具条（含两 CTA），冷卡内再给两个主 CTA：
  - `+ 加第一棒` → `setShowAddForm(true)`（复用现有 state，立即弹加棒表单）。
  - `沿用上一天计划` → `handleCarryOver`（§3）。
- 复用既有 `.pm-coldstart` 类，零新样式。

## 2. 录入动线（Q2）
- 完整链：进页默认今天 → 空板引导卡 `+ 加第一棒` → `AddLegForm`（选 boardable 机器人 + 选任务）→ `handleAddLeg` POST `/api/resource-sessions`（windowLabel=当前日期、orderInWindow=该机器人末棒+1、holderGroupId=task.groupId、holderTaskId=task.id、`invitedMemberIds:[]`、confirmedBy=console）→ refetch → 第一张卡上板。此链当前已通，唯一断点是 §0.0 #1 gate bug，修了即通。
- **任务必填**：`derivePresenceSchedule` 三态（present/onCall/free）靠 `holderTaskId` 沿 DAG 反查上下游；无任务棒只产出持有组 present、不产 onCall/free →「谁可下班」语义塌掉。故 `AddLegForm` 的 `valid = Boolean(resource) && Boolean(task)` 不变。
- `noOptions` 拆两条可执行引导（替原 `addEmpty` 死胡同）：
  - `resources.length === 0` → `schedule.relay.addEmptyRobot`「还没有可上场的机器人，先在上面新建一台。」（机器人队页同页上半区即机器人区）。
  - `tasks.length === 0` → `schedule.relay.addEmptyTask`「还没有任务可排，先去项目看板建一条任务。」

## 3. 默认数据 / 沿用上一天（Q3）— 纯前端，零端点/契约改动
放置：RelayCanvas 工具条「+加一棒」右侧 + 空态引导卡内各一个（同一 handler）。

`handleCarryOver` 行为：
1. `prevIso = isoPrevDay(当前 windowLabel)`（`date-utils.ts` 新增纯函数）。
2. `client.getResourceSessions()` → 过滤 `windowLabel === prevIso`（该读视图含 `holderTaskId`，复用既有 `GET /api/resource-sessions`，**零新端点**）。
3. 空 → banner `schedule.relay.carryEmpty`「上一天也没排，没东西可沿用。」不写入。
4. 否则逐条经**纯函数 `buildCarryOverDraft(session, targetWindowLabel, actor)`** 构造请求 → `client.createResourceSession`。该纯函数是 I0 结构 guard 落点：**只取** resourceId/projectId/orderInWindow/holderGroupId/holderTaskId，`invitedMemberIds:[]`、`eta:null`、`note:null`、`confirmedBy=actor`、`windowLabel=targetWindowLabel`。
5. 当天已有棒 → 先 `window.confirm`（`schedule.relay.carryConfirm`）避免重复叠加；全部成功 → `refetch` + banner `carryDone`{n}。
6. **不结转 handoffs**（接力线当天自己拉）。

## 4. 涉及文件 / 端点
- 前端：`SchedulePage.tsx`（删 gate）、`RelayCanvas.tsx`（空态 CTA + carry handler + noOptions 拆分）、`date-utils.ts`（`isoPrevDay`）、新 `carry-over.ts`（纯函数 `buildCarryOverDraft`）+ `test/carry-over.test.ts`、`i18n/translations.ts`（§5 新键 zh+en）。
- 后端 / 契约：**零改动**（复用 `GET /api/resource-sessions`、`POST /api/resource-sessions`、`GET /api/relay`、`DELETE /api/resource-sessions/:id`）。
- **不做**：mock-gov-store 假 seed（§0.2）；`CreateResourceSessionResponseSchema` 不改（`invitedMemberIds` 留存是 I0 许可的「操作名单」，移除会破既有契约/测试——guard 落在 `buildCarryOverDraft` 不外传，而非删字段）。

## 5. 新增 i18n keys（zh+en 双侧）
`schedule.relay.empty.title/body/addFirst`、`schedule.relay.carryOver/carryConfirm/carryEmpty/carryDone/carryError`、`schedule.relay.addEmptyRobot/addEmptyTask`。`{n}`/`{detail}` 走既有插值。旧 `schedule.relay.empty` 可保留兜底；旧 `addEmpty` 由两条新分态取代（保留键、不再引用亦无害）。

## 6. 验收
- 本机：console `verify:all` 全绿（新 `carry-over.test.ts` 派生纯函数单测 + 新 i18n 双侧 + typecheck）。contracts/server 测试不变（无契约/路由改动、无 seed 改动）。
- WSL 真机 Playwright（前端改动必真机验——R1 首屏 visibility:hidden 教训）：① 切空天见引导卡 + 两 CTA；② `+加第一棒` 能加成第一张卡（验 gate bug 已修）；③ `沿用上一天` 把上一天棒复制过来、order 保序；④ 上一天也空 → `carryEmpty` 无写入；⑤ `grep memberId` 返回体 + DOM 为空、结转后 sessions `invitedMemberIds` 全 `[]`。
