# 架构体检报告 — 两刀实现前置门（2026-07-15）

> **背景**：D-087（GATE-CHECKLIST-IOU）+ D-088（TASK-POST-CLAIM）设计锁定后、实现轮开工前的阶段 0 架构体检（用户手令："有严重设计问题就停"）。
> **方法**：workflow `wf_031f4f71-14b` —— 3×sonnet 并行读察三包（hub-contracts / hub-server / hub-console，各自评估挂接点 fit 与设计债 severity）→ 严重候选 2×opus 对抗核实 → 1×opus 终审（独立抽查源码复核）。
> **裁定：`continue`（放行阶段 1/2 施工）**。三包读察零 blocked、全部债判 minor、无候选升到对抗核实门槛；终审独立抽查四个最高风险点全部证伪为"净新增工作"或"可绕开的陷阱"。
> 本报告 = 终审 reportMd 原文，供阶段 1/2 实现直接引用落点。

---

## TeamHub 架构体检终审 — 两刀（GATE-CHECKLIST-IOU / TASK-POST-CLAIM）承载力

裁定：**continue（放行阶段 1/2 施工）**。三包读察未发现任何 `blocked` 挂点，全部设计债判 `minor`，无候选升到对抗核实门槛（三包 `verified` 皆空）。我对四个最高风险点独立抽查了源码，结论：没有"实现会长歪"或"必须先重构才能动"的结构性阻塞。以下为拍板依据 + 供后续实现 agent 直接引用的落点账本。

### ① 逐包挂接点结论（clean 落点，阶段 1/2 可直接引用）

**apps/hub-contracts（域与纯函数）**
- 刀A 新域 `GateChecklistItem`/`ChecklistTemplate`：新建独立文件，逐字照抄 `baseline.ts:9-28` 文件头 + `inventory.ts:106-121` 的"独立 Snapshot、不进 GovernanceSnapshot"范式。已核：`baseline.ts:12-23` 明写"独立域文件·独立 store·独立落盘"，`inventory.ts:106` 明写"独立于 GovernanceSnapshot"——两个现成模板。**新域不进 GovernanceSnapshot ⇒ 不触碰 attribution.ts:44-45 的手写同步雷区**（该雷区只在给 GovernanceSnapshot 加新数组键时才触发）。
- 刀A `anchor: {milestoneId}|{dueAt}` 二选一：套 `pm-requests.ts` 既有 superRefine 互斥先例。
- 刀A `deriveChecklistDrift`（欠条到期红）：**不塞进 `deriveBaselineDrift`**（MilestoneDrift 主键是 milestoneId，dueAt 欠条塞不进），而是照 `baseline.ts:328/367` 的 `deriveInvestmentWarnings`/`deriveTimeAccumulationFlags` 姊妹函数并列新增。已核：这两个姊妹派生函数存在，风格（阈值常量、不加权、精简 interface）可照搬。
- 刀B Task 三个 optional 字段（claimedAt/assignReason/搭档位）：照 `pm-core.ts:194/201/204` 的 convergenceScope?/milestoneId?/investment? 纯增量 optional 先例。已核：`attribution.ts:88` 是 `tasks: z.array(TaskSchema)`，新增标量 optional 自动跟随，**无需动 GOVERNANCE_SNAPSHOT_ARRAY_KEYS**（那只管新数组键）。
- 刀B 挂单态：`Task.ownerId` 已 nullable（`pm-core.ts:183`），posted = 派生过滤，零 schema 改动。
- 刀B 大任务判定纯函数：`task.milestoneId != null`（已有字段）或 `dependencies.some(d => d.fromTaskId === task.id && d.status !== 'waived')`。已核：Dependency.fromTaskId=上游方向定义清楚（`pm-core.ts:227`），同形过滤在 attribution.ts 已写过两次；阈值做成可调导出常量照 `BASELINE_DRIFT_LOOKAHEAD_WEEKS`（已核存在，`baseline.ts:197`）。
- 刀B 打回：TaskStatus 五态（`pm-core.ts:155-161`）已够，状态迁移路由零迁移图约束（`server.ts:828` 直接 safeParse 放行任意方向），done→pending/inProgress 合法，**无需新增枚举值**。

**apps/hub-server（store + 路由）**
- 刀A checklist store 三件套：逐字照抄 `baseline-store.ts` + mock/file 两实现 + `main.ts:129-145` 的 env 接线 + `server.ts` 的 BuildHubServerOptions/ModuleRouteCtx 字段。
- 刀A 过门拦截：`server.ts:751-758` 的 evidenceRefs 孤儿校验（读另一 store、命中即 400）是逐字同形先例——换成"读 checklistStore 里挂该 milestoneId 的项、有 pending 就 400"，落在 `passMilestone`（766 行）之前。已核该路由本身就是"路由层组合两 store"的现成先例。
- 刀B 认领/指派/转派窄写方法：照 `pm-core-store.ts` 的 updateTaskStatus/waiveDependency 受限迁移方法先例，三套 store 各 5-10 行对称补齐；actor 注入照 `server.ts` 6 处 `request.identity ? sessionActor(...) : parsed.data.xxx` 范式。**已核 sessionActor 精确 6 处用（764/868/897/1209/1231/1391），与设计文档"6 写路由先例"字面吻合**。
- 刀B "看谁做过"搜历史 Task：`GET /api/tasks` 加一个 optional `q=` querystring 子串过滤，照 BaselineQuerySchema 范式，非新子系统。

**apps/hub-console（前端）**
- 刀A 全局"快记欠条"入口：`App.tsx:120-136` console-toolbar__actions 是全站唯一全局工具条，IdentityBar 同位置先例；配 SideDrawer（ProjectPage 用法先例）。
- 刀A 总览告警区欠条提示：`BaselineOverview.tsx:253-268` 的 investmentWarnings 块（baseline-warn 容器 + .map）原样复制一块，紧邻现有两块挂。
- 刀A 验收人名单设置页：`SettingsPage.tsx` 的 SeasonsSection（面板+列表+表单+queryKey 失效）逐字可抄。
- 刀B 我的视图空态：`MyViewPage.tsx` 已拉全量 DepNode，posted 数 = `nodes.filter(n => n.ownerId===null).length`，零新请求——本刀最干净挂点。
- 刀B 挂单池视图：`ProjectPage.tsx` board/graph 双视图是现成"加第三视图"模板（ProjectView 联合类型 + SegToggle + tabpanel）。
- 刀B 一键认领/搭档黄标：`PmBoardPage.tsx` badges 区加第三个 badge（tone 用现成 badge--amber），认领按钮照 DepGraphPage 的 waive 按钮 mutation 先例；唯一管道活=从 ProjectPage 透传 identity（透传链已存在）。
- 刀B 组长确认候选人：**不需要给 Group 加 leadMemberId**——`role==='groupAdmin' && groupId===task.groupId` 即可筛出（MemberRole 已有 groupAdmin、Member.groupId 已挂组，均已核）。

### ② 确认的严重问题

**无。** 四个被标 awkward / 疑似 blocked 的候选，抽查后全部证伪为"净新增工作"或"可绕开的陷阱"，无一构成 stop：

1. **组长确认是否两段式状态机（hub-contracts 判 awkward 的歧义点）** — 已由设计文档消解。task-post-claim.md §3 认领"即生效、免组长确认"；§4 跨组大任务"组长一键确认"配"错放靠组长转派权兜底（事前结构信号、事后转派）"；§4 搭档规则"不硬阻塞干活（A1 先例：暴露缺口不拦人；**全系统唯一硬闸在门上**）"。三处合读 ⇒ 跨组确认是**事后留名/转派**而非 claim 生效前的卡启动闸 ⇒ 落地为 confirmedBy 式 optional ActorRef 字段，**不是新状态机**。字段形状选得下来，歧义已闭合。
2. **验收人名单 + 按名单鉴权（三包共同判 awkward，库里首次出现的鉴权形态）** — 是净新增面（Group 无写路由、Member 仅 PIN 单点写、MemberRole 无"验收人"档），但 **additive，非 refactor-first**：新建一个最小 roster（Member 加 optional 布尔位 + 一条 PATCH，或独立小实体 + 建/查两端点）+ 鉴权照 `server.ts:638-643` PIN 路由的"布尔条件 + 403"内嵌写法。设计文档 §3 已明确指定该落点。不阻塞两刀主干。
3. **KB 事实卡"带名"搜索疑似 blocked（hub-contracts）** — 抽查后是**范围决策，非阻塞**，且红线由"不动 KB"来保护：设计文档 §3"看谁做过"的名字来自 **Task.ownerId→displayName**，不是给 KB 卡加人名。实现只做历史 Task 搜索（title/rawSummary + ownerId 显名，clean）；**不给 IssueCard/ErrorEntry 加 actor/taskId**——那才会违反 KB 头部 C2 反排名红线（`kb.ts:26`）。即"KB 那半不做"是正解，红线被保全。
4. **TaskProgressSignal 死脚手架（形状正好匹配留名需求）** — 已核 hub-server/hub-console 全仓 grep 零命中（总 14 处全在 hub-contracts=定义+导出+测试）。是**陷阱不是必经路**：复活它要从零接 store+路由+快照，成本高于直接在 Task 上加 completedBy?/reviewedBy? optional ActorRef（照 `baseline.ts` passedBy / `pm-core.ts:233` Dependency.confirmedBy 先例）。绕开即可。

### ③ 一般债清单（绕行 / 顺手修）

| # | 债 | 位置 | 处理 | 阶段 1/2 建议 |
|---|---|---|---|---|
| D1 | `updateTaskStatus(taskId, status)` 是全库唯一不带 actor 的状态写方法 | `pm-core-store.ts:107` + mock/file/sqlite 三实现 + `server.ts:821-835` | 两条等价路径：①给方法加 `actor?` 形参；②在 Task 本体加 `completedBy?/reviewedBy?` ActorRef 字段、由新窄路由写（走"加字段"流水线，连签名都不必动） | **值得顺手修**：刀B 打回/大活验收留名共卡这一点，推荐路径②（更省、不动现有路由签名） |
| D2 | TaskProgressSignal 零消费死脚手架 | `pm-core.ts:275-283` | 维持现状，勿为"形状合适"复活 | 不修（阶段实现时避坑即可） |
| D3 | 验收人名单落地后若不接线鉴权=摆设：gate-pass 现 passedBy="谁登录就是谁"，无任何名单/grade 校验 | `server.ts:761-764` | Settings UI 可先落，但必须同步让 gate-pass/waive 路由读该名单做 403 校验 | **排期强提醒**：刀A 实现时 UI 与鉴权接线必须同批，否则豁免权形同虚设 |
| D4 | PmTaskCard 纯展示卡，四个新写动作（认领/指派理由/转派/打回）挤一张小卡 | `PmBoardPage.tsx:128-163` | 加 onOpenDetail 回调 + 复用 ProjectPage 的 SideDrawer 盛放动作 | 视觉拥挤时顺手抽详情抽屉，非阻塞 |
| D5 | 大任务徽章跨视图取数：board 视图不查依赖图边（边只在 dep-graph 查询可见） | `PmBoardPage.tsx:44-47` | 首选把判定下沉到后端算好吐给前端（照 isConvergenceTask 先例）；次选 board 额外挂一份 dep-graph 查询 | 阶段 1 后端下沉更干净 |
| D6 | 库里零"按名单/角色"鉴权先例（PIN 那次只是自我核对），刀A 豁免权与刀B 组长确认都从零起步 | `server.ts:638-643` | 各自照"布尔条件 + 403"内嵌路由；两刀都落地时把条件提成小 helper（如 `isGroupLeadOf(identity, groupId)`）避免走样 | **值得顺手修**：两刀共用 helper，防同逻辑两处各写 |

### ④ 裁定与依据

**verdict = continue。**

- **无 blocked 挂点、无 severe 债**：三包读察一致，且终审独立抽查证实所有 clean 挂点均有可照抄的现成先例（独立域文件、superRefine 互斥、姊妹派生函数、z.array(TaskSchema) 自动透传、sessionActor 6 路由、SideDrawer/SegToggle/identity 透传链）。
- **四个高风险候选逐一证伪为 stop 条件**（见 ②）。
- **符合 D-088 防屎山基准**：两刀落地全程"制度=数据（独立轻量域/optional 字段）、判定=纯函数（deriveChecklistDrift / 大任务判定）、最小 schema（不加大小/重要度/dueDate 字段）、不建新子系统"，未触碰任一红线（Task 永不加个人 dueDate；名字只在事实卡、不聚合不按人筛；空闲提醒只私推本人）。
- **放行不等于零风险**：D1/D3/D6 三条 `amplifiedByKnives` 债请阶段 1/2 按上表顺手收口——尤其 **D3（验收人名单 UI 必须与鉴权接线同批）** 与 **D6（组长/验收人鉴权提共享 helper）**，建议实现首刀就带上。

阶段 0 门放行。
