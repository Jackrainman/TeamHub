# 挂单认领制（TASK-POST-CLAIM）

> **status: DESIGN-LOCKED v1**（2026-07-15 深夜多轮拍板收口；**实现待排期**；用户明示"先试试、边做边改"——本文所有判定阈值均为可调常量，非教条）。
> 上游 = D-085 名字三层（认领/指派理由/验收全留名于事实卡）+ D-083（Task 永不加个人 dueDate / IDENTITY-LITE session.memberId / Need 反派单先例 A2）+ `gate-checklist-iou.md`（共用同一把"结构尺"）。
> **已实现（2026-07-15 实现轮，commit `5a60344`..`bfa5d25`，VERSION 0.23.0→0.23.2）**：T1 契约 / T2 存储+路由 / T3 界面三刀全部落地，偏离回写见 §9。

## 1. 一句话定位

**系统是任务的过夜登记处，不是对讲机。** 挂单给无主的活，认领即生效；直接指派仍合法但必须写理由（分配=显式培养投资）；嘴照常用，过夜的活组长补一条。

## 2. 什么进系统（判定尺）

- **三问有一个"是"才进**：①会过夜吗 ②有人等它吗（有下游） ③换届/复盘需要记住它吗。"帮我打个螺丝"三否→不进；"组装 R1"→进。
- **灰色地带收口**：单次灰活（一忙一晚上的杂活）**不记**——Task 无个人死线 + 快慢按周判（里程碑级），一晚上在噪声底之下，不录不会扭曲任何测量；**成类灰活立户**——同一类杂活反复吃晚上=看不见的拖累，升格为常设任务（"老车维护"即先例）。
- **线下口头布置=正常路径**：制度不改变怎么说话，只改变什么必须留痕。**录入责任跟布置走：组长=本组唯一挂单员**（口头说完 30 秒补一条）。
- **漏录不追责、绝不考核录入率**（考核录入率必得垃圾录入）。拉回靠好处结构：不在系统里的活得不到"被卡"正名、复盘时不存在。兜底=补录通道（想起来给飞书助手发一句话→草稿→确认进系统，见 `inv-alert-redesign.md` §1）。

## 3. 挂单 · 认领 · 指派

- **挂单** = ownerId 为空的 Task 显式状态（posted）；组长建任务默认不选人。
- **认领** = 登录本人一键，**即生效、免组长确认**；事实卡记认领人+时刻。
- **指派仍合法** = 组长选人+**强制理由一格**（"带他上手 6020 拓展测试"）——挂单零摩擦、指派多一格，摩擦力就是制度；组长事后可转派（转派同样写理由）。
- **全队可见**（用户拍板）。主页看事（谁的组、卡在哪、门近不近），点进卡片看人（D-085 UI 规则）。配套查询：**"看谁做过这个问题"**——按关键词搜历史任务/KB 事实卡（带名），自己去联系做过的人；红线=搜索结果永不聚合成"技能画像/花名册"页。

## 4. 跨组规则

- **鼓励跨组认领简单任务**（学习通道；程序组去打螺丝的因果链靠它发生）。
- **"大任务"不看大小看结构**（机器可判，无新增字段）：**有下游依赖边（有人等）或挂门/里程碑（有门等）→ 大**。跨组认领大任务 = 该组组长一键确认。审核文案立场：把的是"砸了会连坐"的风险，**不是对外组人的不信任**。缺信号默认简单活；错放靠组长转派权兜底（事前结构信号、事后转派，两层）。
- **本组搭档规则**（用户拍板"本组必须也有人领"）：外组认领后，任务卡出现"本组搭档"空位，本组须有人补位（师傅/对接人，组长默认可自任）——**跨组是学习通道，不是甩锅通道**。系统形态=显式缺口黄标（"待本组搭档"），**不硬阻塞干活**（A1 先例：暴露缺口不拦人；全系统唯一硬闸在门上）。落地=Task 一个 optional 字段，不建新域。
- **"奠基简单活"不另建模**：担心"这简单活是别的领域的地基、砸了上层不稳"→ **画一条依赖边即可**——有了下游，它在结构尺下自动升格为大任务，审核+学长验收全自动跟上，零新结构。没画边=系统不知道=录入的锅，复盘兜底（三层网同款）。**明确拒绝**新增"基础性/重要度"字段（防屎山：制度=数据、判定=纯函数、最小 schema）。
- **已知边界（用户点出，边做边改）**：赛季后期几乎全图都在关键路径上→"大任务"变密、审核/验收变多。这不是制度失灵——是基准线如实反映"赛前每件事都连着比赛日"的真实风险。若真压垮学长带宽，调节旋钮现成：收紧"大"的定义（如只计 N 周内到期的门的挂接）——常量一改即可。

## 5. 完成与验收（两档，同一把结构尺）

| 档 | 完成判定 | 理由 |
|---|---|---|
| 简单活（无下游、不挂门） | **本人标完成+留名**；学长有**抽查打回权**（不强制每单看） | 防"交作业感"；学长不被几百个小单压死 |
| 大活（有下游或挂门） | **必须学长验收留名**才算完 | 砸了会连坐，验收才有必要性 |

盲签警示：验收签名是事实层的硬通货——一旦大家发现"签字≠看过"，门上、豁免上的所有签名跟着贬值。两档制就是让学长的签名永远签得动、签得真。

## 6. 空闲提醒（A2 合规）

- 「我的视图」空态私推**本人**："没有进行中的任务，挂单池里有 N 个活——**没把握就去问问学长**"（给新人不丢人的行动台阶，别让他发懵）。
- **永不向学长报"谁闲着"**（那是监视器）。学长看到的是**滞留的单**（公开、对事）："这单挂两周没人领"可以问，"某某闲三天"永不存在。
- 制度管留痕，文化管主动性：培养期教的习惯=干完了去池子领一个或去问学长要。

## 7. 与 Need 的边界（不合并）

**挂单是组内的任务板，Need 是跨组的门铃。** 门铃按下时任务还不存在（对方组长可能否掉需求）；门铃记录本身是归因链原料（"电路被卡在等机械开孔"=被卡正名的证据）。合并即越权（别组直接往你板子上贴活）或断链（丢被卡记录）。结构性重要的跨组接口走第三层=进设计流程（走线需求清单先例：需求方主动+前置，图纸验收检查项）——重要接口不走"帮个忙"通道。

## 8. 实现期账单（待排期）

Task 三个 optional 字段（claimedAt / assignReason / 本组搭档位，命名实现期定）+ 认领/指派/转派路由（actor 注入沿 IDENTITY-LITE）+ 大任务判定纯函数（依赖边+门挂接查询，常量可调）+ console：挂单池视图、一键认领、搭档黄标、我的视图空态文案、打回状态 + "看谁做过"关键词搜索（事实卡列表）。

## 9. 实现落点注记（2026-07-15 实现轮）

> TASK-POST-CLAIM 三刀（T1 契约 / T2 存储+路由 / T3 界面，commit `5a60344`..`bfa5d25`，VERSION 0.23.0→0.23.2）已落地，三包 `verify:all` 全绿（contracts 263 / server 344 / console 163）+ health-check 10 页 0 错 0 白屏（挂单池 tab 已补进覆盖清单，见 §9.4）+ 活体驱动认领（挂单池 2→1 张、写→刷新闭环）。本节把实现期偏离设计稿字面处如实回写，按 T1/T2/T3 三刀分组（照 `baseline-design.md` §7 / `gate-checklist-iou.md` §7 回写格式先例）。

### 9.1 契约层偏离（T1，`hub-contracts/src/pm-core.ts` + `pm-requests.ts`）

- **字段簇八个而非字面"三个"**：设计 §8 字面写"Task 三个 optional 字段（claimedAt / assignReason / 本组搭档位）"；实现按架构裁定扩为**八个**留名字段簇——`claimedAt` / `assignReason` / `assignedBy` / `partnerMemberId` / `crossClaimConfirmedBy` / `completedBy` / `reviewedBy` / `reviewNote`。依据 = 体检 `docs/archive/audits/arch-checkup-2026-07-15.md` D1 债路径②（认领/指派/搭档/跨组确认/完成/验收六个动作各自需要"谁+何时"落一笔事实，若只留三格会把 `assignedBy`/`completedBy`/`reviewedBy`/`reviewNote` 挤压进已有字段或另建实体）；八字段**全为 Task 本体 optional 标量**（照 `milestoneId?`/`investment?` 先例），**零新实体**（不复活体检 D2/③-4 点名的 `TaskProgressSignal` 死脚手架）、**零新增 dueDate**（D-083 G4 红线未碰）。
- **验收态派生不动枚举**：`deriveTaskAcceptance(task)` 纯函数输出 `notDone | selfDone | awaitingReview | accepted` 四态，`TaskStatus` 五态枚举（`pending/inProgress/blocked/done/shelved`）原样未动——大活 `done` 后仍派生为 `awaitingReview`（前端渲染"待验收"徽章），`reviewedBy` 留名后才 `accepted`。体检已核五态够用，此建模是"大活必须学长验收才算完"（§5）的落地方式，不是加状态。
- **打回必写理由留在 UX 层**：`ReviewTaskRequestSchema` 的 `note` 未在 schema 层硬绑 `outcome==='reject' ⇒ note` 必填（仅 `z.string().min(1).optional()`）——避免 schema 层强校验卡死学长"抽查快速打回"的操作节奏；UX 层（`TaskDetailDrawer`）引导必写，留名+打回理由仍都落事实卡（`reviewedBy`/`reviewNote`）。
- **读/写契约分文件**：`TasksQuerySchema`（"看谁做过" `q?` 子串搜）放 `pm-core.ts`（紧邻 `TasksResponseSchema` 读契约）；六个动作写请求（Claim/Assign/SetTaskPartner/ConfirmCrossClaim/Complete/Review）放 `pm-requests.ts`——读契约与写请求按既有文件分工各归其位，非新增文件。
- **isBig 下沉后端**：体检 D5 债顺带兑现——`TaskWithMetaSchema = TaskSchema.extend({ isBig })`，`TasksResponseSchema` 改用之；server `GET /api/tasks` 逐任务用 `isBigTask(task, dependencies)` 算好吐前端（大任务判定不再各视图重复挂一份 dep-graph 查询）；`hub-server/src/contracts.ts` 桶新增 `isBigTask` re-export。这是 `TasksResponse` 形状变更的必要波及，非越层新增功能；console 既有 `Task[]` 消费点（`PmCreatePanel`/`DepGraph`）协变兼容、零改动。
- **`GET /api/tasks?q=` 空串规则**：`?q=` 空串走 `min(1)` 校验失败 → 400（照 baseline/checklist querystring 400 先例）；无 `q` 参数或未知参数 → 返回全部任务（向后兼容既有消费点）。

### 9.2 存储层偏离（T2，`hub-server/src/store/*`）

- **窄写方法签名带显式时间戳参数**：六个新增窄写方法（`claimTask`/`assignTask`/`setTaskPartner`/`confirmCrossClaim`/`completeTask`/`reviewTask`）均带显式 `at`/`claimedAt` 时间戳参数（由路由 `ctx.clock` 算好传入），非沿用既有 `updateTaskStatus` 风格的方法内部取 `this.clock`——遵设计给定的动作契约签名；`claimedAt` 与 `updatedAt` 取同一值。三实现（mock/file/sqlite）对称落地，照 `updateTaskStatus` 受限迁移先例。
- **`statusSource` 统一裁定钉 console**：`claim`（pending→inProgress）/`complete`（→done）/`reject`（→inProgress）三处状态变都把 `statusSource` 钉为 `console`（C5，镜像既有 `updateTaskStatus` 做法）；`accept`（review 通过）不改 `TaskStatus` 故不动 `statusSource`。设计稿未明列 `statusSource` 归属，此为诚实的 C5 落地，非字面偏离。
- **清字段用解构剔除**：`assignTask`（重新指派）/`completeTask`（重开）等路径对旧留名字段用解构剔除（非置 `undefined`），落盘后该键从 JSON 消失，而非序列化为 `null`。

### 9.3 路由/鉴权层偏离（T2，`hub-server/src/server.ts` `registerPmCoreRoutes` + `authz.ts`）

- **`confirm-cross-claim` 路径全称**：路由用 `/confirm-cross-claim`（对齐 `ConfirmCrossClaimRequestSchema` 命名及契约注释里的落点建议），非 §3 行文里缩写的 `/confirm-claim`。
- **assign 名册校验（复审 nit → 已补齐，`0926fc1` v0.23.3）**：实现轮初版信任组长已过 `isGroupLeadOf` 403 授权门、不校验新 `ownerId`；复审判定会落孤儿 ownerId，收口轮补上与 `claim`/`partner` 对称的名册校验（孤儿 `ownerId` → 400「指派对象不在名册」）。
- **assign 不做状态提升**：`claim` 会把 `pending` 挂单提升为 `inProgress`；`assign` 指派后 `TaskStatus` 保持不变（`pending` 任务被指派后仍 `pending`，只是有了 owner）。语义上可解释为"已指派但未开工"，但与 claim 的提升行为不对称，属实现期未拍板细节、非设计明文要求；`isPostedTask` 仍会因 `ownerId!==null` 把它移出挂单池，无功能性 bug。
- **partner 路由不设发起人鉴权**：本组搭档补位任一成员可自行认领/组长可自任（"本组自愿补位"），无发起人身份校验——task-post-claim.md §4 明示"组长默认可自任"，spec 亦要求记 deviations，此为按 spec 落地非越权。
- **review 鉴权复用 `isGateReviewer`**：`Member.gateReviewer` 布尔位（`gate-checklist-iou.md` 落地的验收人名单）与 review 鉴权同一张名册——D-087 拍板②"验收人名单与豁免名单同语义"在此再次兑现；**验收人名单与豁免名单是同一张大三名单，非两套并行名单**。
- **review done 前置判（复审 nit → 已补齐，`0926fc1` v0.23.3）**：实现轮初版对任意 `TaskStatus` 都可 stamp 验收/打回（console 已挡但直连 API 可达，会让「被打回」派生呈现从未发生的事实）；收口轮补上前置判——非 `done` 任务 review → 409「任务尚未标完成」（照 checklist clear/waive 的 409 先例）。**刻意不加"须大活"前置**：简单活 done 后的抽查打回（§5）正是合法路径。同笔把 store 层 `reviewTask` 的 `reviewNote` 语义收敛为**一律以本轮为准**（note 未给则清上一轮残留，防 reject→accept 边角留旧打回理由）。
- **complete 无操作人=owner 强校验**：`complete` 路由无鉴权（"本人标完成，写门即可"，server 注释已披露）——任何带自己名字的操作人可标任意非终态任务完成，`completedBy` 记录的是操作人本人而非强制校验其为 `ownerId`。符合"事实层留名"模型（记录谁点的，不代它验证是否本人），但设计 §5 字面"本人标完成"未被服务端强制校验，此前实现自报已列，记录在案确认属实。

### 9.4 界面层偏离（T3，`hub-console/src/features/{pool,pm,project}/*`）

- **新增「标记完成」动作**：`TaskDetailDrawer` 加 `POST /complete` 按钮——设计 §2 只列两档验收显示+验收/打回按钮，未显列独立"标记完成"动作；但要经留名路径把任务推到 `done→awaitingReview/accepted` 派生态、留下 `completedBy`，此按钮是必要的净增，属 §5"本人标完成+留名"对齐落地，非越权新增。
- **匿名模式操作人 picker 共用一格**：`complete`/`confirm-cross-claim`/`review` 三动作在匿名模式下都需要 `ActorRef`（server 无 actorRef 会 400），照 `GateChecklistCard` waive-picker 先例在 `TaskDetailDrawer` 顶部加单一「操作人」选人（三动作共用同一个 `actorId` state）；身份模式服务端自动注入、不显该 picker。`claim`/`assign` 另有各自内嵌选人（照 spec §3 各自流程）。
- **MyView 跳挂单池落点**：跨页导航原本只有 `onNavigate(page)`、无法直接指定项目页内子视图 → 新增极轻模块 `src/features/project/project-nav.ts`（`ProjectView` 类型从 `ProjectPage` 移出 + 一次性意图 `requestProjectView`/`consumeProjectView`）；`MyViewPage` 新增 `onNavigate` prop（经 `console-pages` 透传）。空态文案 N = `DepNode.ownerId===null` 计数，零新增请求。
- **`client.getTasks` 返回类型变化**：`Task[]` → `TaskWithMeta[]`（协变兼容既有消费点 `PmCreatePanel`/`DepGraph`，零破坏）；新增 `getTasks(q?)` 与六个窄写方法，均走 `schemas/pm.ts` re-export。
- **纯函数抽层**：滞留分档/搭档黄标/跨组确认徽章/空态 N 的计算抽成 `src/features/pool/pool-utils.ts`（15 单测），`PoolPage.tsx` 只做渲染消费；`POOL_STALE_DAYS=14` 为可调常量（滞留 ≥14 天转 red）。
- **fixture 无 groupAdmin，测试内构造**：demo fixtures 无任何 `groupAdmin` 成员；组长 200 用例在测试内把 `m-ecB` 升为 `grp-ec` 的 `groupAdmin`（不改 fixtures 本体，只在测试构造自定义 snapshot）。
- **health-check 页清单机制盲区已补**：`health-check.cjs` 逐 `.nav-item` 点击的主循环覆盖不到挂单池——它是 `ProjectPage` 内的 tab、非独立 `nav-item`。已加后置块：点到含 `#project-view-pool-btn` 的项目页再点开 pool tab，同款截图+白屏/报错哨兵（现报 10 页含"挂单池"）。

### 9.5 复审补记（自报未列，独立复审补记一处）

- **review 路由缺 done/大任务前置判**：见 §9.3——自报仅提"review 鉴权复用 `isGateReviewer`"，未提可对任意状态、任意大小任务 stamp 验收/打回。UI 已挡、仅直连 API 可达、影响良性，归为设计缺省而非违规，但属未披露的行为面，此处补记。

### 9.6 红线复核结论（§5 对应 baseline/checklist 同款红线）

全部守住：`TaskStatus` 五态枚举零改动（验收态是外挂派生、非新增状态值）；无任何按人聚合/排行/技能画像端点（"看谁做过"仅返回事实卡列表，不聚合）；空闲提醒仍只私推本人（我的视图空态文案）；Task 零新增 `dueDate`；跨组"本组搭档"仍是显式黄标不硬阻塞（A1 先例）；验收人名单（`gateReviewer`）与豁免名单同一张、鉴权基元复用 `authz.ts` 的 `isGateReviewer`/`isGroupLeadOf`（体检 D6 phase2 兑现）。
