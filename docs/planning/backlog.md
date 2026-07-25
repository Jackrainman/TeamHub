# Backlog（Team Hub）

> 一行一候选；状态字段：`current` / `pending` / `done` / `frozen` / `decision-needed` / `superseded-by-D024`。当前唯一任务见 `now.md`，长期路线见 `roadmap.md`，长期决策见 `decisions.md`。pre-pivot backlog 历史快照 → `docs/archive/v0.3-pivot/backlog.md`。

## 认领规则（Team Hub）

1. 每次只认领一个原子任务，未 commit 不进入下一任务。
2. 当前允许的任务类型（D-026 `governance_design`）：**治理概念/数据模型/规则层/展示汇报/触点派生设计 + 成长轴（D-027 知识图谱/订阅）+ 对应 schema 与代码 + 文档 reframe**。真实 Hermes / 小龙虾 / Claude Code / 服务器写入必须用户线下配置或审批。一项待拍板（架构走法）的深设计先搭骨架留待定（提醒模型已 2026-06-10 拍定）。
3. ProbeFlash v0.3 已冻结：不再认领 TECH / AIREADY / REALAI / CODECTX / DEP / DATA / UI / CORE / SEARCH 任务；致命补丁除外。
4. 每个代码任务必须先有接口契约或 schema；控制台 UI 任务必须先有页面状态与 API mock 设计。
5. 候选池只在本文件；`roadmap.md` 不构成候选源。若 `now.md` frontier 项在本文件无对应行，视为脱节，必须先补本文件再认领；不允许"凭空 frontier"。

## P0 — 协作中枢（D-026 立魂 / D-037 回中 / **D-039 治理派生挂起、AI 退治理**）

> 四层架构推进。**D-039（2026-06-13）**：第一轮治理判断回归人（大三/学长看"人读说明视图"自行协调），**AI 退出治理**——治理派生整簇（D-032～D-035）挂起（见下方"挂起 — 治理 AI 派生"段）；本轮主线转为**三支柱**（见下一节）。下表 GOV-* 派生行已就地标挂起；DAG·阻塞归因视图（D-028）/ 排班视图（D-029）保留为**人读说明**。

| 任务 | 状态 | type | 内容 |
|------|------|------|------|
| GOV-REFRAME-DOCS | done(2026-06-09) | docs | D-026 立魂文档重构（宪法 C/G/A 三层+AGENTS+下游引用迁移）；真相=git log |
| GOV-CONCEPT-REWRITE | pending | design | 概念文档完整重写（§6-§8 细化到已落地 schema）；身份段已随 D-037 回中（协作中枢：CASE+交流中心+数据库）；§10/§12 锚点已随 D-028/D-037 回填，余下深写待做 |
| GOV-DATA-MODEL-DESIGN | done(2026-06-11, D-028) | design | 治理数据模型进 hub-contracts（governance/growth/attribution+fixtures+归因单测）；设计=`docs/design/gov-data-model.md` |
| GOV-RULES-LAYER-DESIGN | **挂起 (D-039)** | design | **挂起**（治理 AI 派生；复活触发=未来确认要 AI 参与治理判断）。原设计：规则/协调层：卡点/过载/缺口/沉默判定；进度派生信号阈值（commit 频率 / check-in 形态 / 沉默天数）。注：MVP 已落地结构性"被卡 vs 摸鱼"判别（attribution.ts）；**D-037：silence 等人键信号只回本人 + AI 建议、不上报管理者（I0），结构信号才给协调者**；本任务做完整阈值/沉默检测 |
| GOV-VIZ-DAG-DESIGN | done(2026-06-11, D-028) | design | console 依赖链·阻塞归因视图（@xyflow+DepGraph 契约）；设计=`docs/design/gov-viz-dag.md` |
| GOV-SCHED-MODEL-DESIGN | done(2026-06-11, D-029) | design | SharedResource/ResourceSession+`derivePresenceSchedule` 纯函数（组键无 memberId）；设计=`docs/design/gov-oncall-schedule.md` |
| GOV-SCHED-VIZ-DESIGN | **组键 wiring 部分解封 (D-069)** / AI 判断仍挂起 | design | **D-069（2026-06-18）部分解封**：组键「谁该在场」活页面 + `derivePresenceSchedule` 接出已立项为 `SCHED-WIRE-EXISTING`（见上「P1 — 差异化排班」段，A1 组级均衡、无 memberId）。**仍挂起的是 AI 判断那一半**（自动派活 / AI 排候选人 = D-041 决策 7③ 人治封存，复活触发=未来确认要 AI 参与治理判断，与 GOV-RULES-LAYER/GOV-MEMBER-STATUS-DERIVE 同组）。spec=`gov-oncall-schedule.md` 保留 |
| GOV-REPORT-DESIGN | pending | design | 给老师的项目级自动汇报（不含个人比较，C2/A2）|
| GOV-LARK-DERIVE-DESIGN | pending | design | 触点层：飞书动作→状态派生映射（@ / 卡片 / 一键 check-in）+ 提醒送达（提醒模型已拍定：私聊本人、起草不发送、升级的是事不是人，见 D-037 / archive「D-026 后续」）；复用 Lark 三包 |
| HUB-SERVER-GOV-SCAFFOLD | 首刀 + 收口刀 done / 写入簇实现 pending (**D-039 共享底座**) | code | **D-039 重定位为三支柱共享底座**：持久层（现全 mock）+ real CRUD 路由骨架（知识库/项管/库存 的 `GET/POST /api/...`）+ `now=server clock` 注入——所有真实数据流的物理出入口，**做一次三根受益**。**首刀已落地（2026-06-13）**：`GET /api/dep-graph` + `GovStore`/`InMemoryGovStore`(seed)/`Clock` 注入解 real 模式 404。**收口刀已落地（2026-06-13，frontier#1 done）**：`GovStore` 加写方法白名单签名（`createTask`/`createDependency`/`createNeed`/`closeoutKbNode`，draft 入参 = Omit 派生、仅签名实现后置=throw）+ `BuildHubServerOptions` 加 `kbStore?: GovStore`/`invStore?: InvStore` 扩展点 + 持久化切换合约 `SqliteGovStore` stub（同接口全 throw not-implemented），化解"四次重建底座"违 C3；4-opus 对抗核实裁 ship（C2/G2/I0/C3 接口层全守、ts 健全、sqlite/INV 三方可扩展不重建）。**后续承接（对抗核实 deferToNextKnife）**：① 写入簇实现 + real CRUD 路由（PM/KB-CORE 落地各自补 body 解析 `options.kbStore ?? store`）② **KB 相似检索语料 IssueCard 不在 GovernanceSnapshot 内 → KB-CORE 落地需把 `kbStore` 类型从 GovStore 收窄为独立 KbStore（加 getIssueCards 读口，对称 InvStore 占位；仅触该字段、不动 store/路由签名、PM 不受影响）**；结案派生 KnowledgeNode 这半复用同快照成立 ③ confirmedBy 写实现记 {source,at} 不存裸 memberId 历史（守 I0）④ DependencyDraft/NeedDraft 的 status 写实现期校验/clamp 初始态 ⑤ SqliteGovStore 接 better-sqlite3/drizzle（待部署服务器审批）⑥ presence/drizzle |
| GOV-MEMBER-STATUS-DERIVE | **挂起 (D-039)** | code | **挂起**（治理 AI 派生，AI 退治理；复活触发=未来确认要 AI 参与治理判断；freeIdle/双写债一并冻此）。原设计：`Member.status` 全派生（Task 真相、禁手写、杀与 Task.status 双写 G2）+ 三态 uncovered/blocked/capacityFreed + 私下 silence（**D-037：只回本人 + AI 建议、不上报管理者 I0**）→ 收成 `GovernanceCue`；spec=`docs/archive/suspended-specs/{gov-cue-layer,gov-role-visibility}.md`（挂起·D-037 收窄）；落地须读 group.kind 分河（D-034 降级）+ give-floor（D-035）+ parity 测试 + **修 freeIdle 语义债（uncovered/真闲拆分、前瞻"可接任务"框架、复核 freeIdleCount/标签）+ Member.status 双写债（fixtures 手填却标 derived）** |
| GOV-DEP-INTAKE-DESIGN | **已并入 PM-BOARD-DESIGN (D-042)** | design | （依赖录入并入项目计划表那一根，勿单独认领）**DAG 数据命门**：队长布置任务那一下顺手连依赖 + AI 预填建议依赖 / Need 的一屏录入交互（页面状态 + API mock）；目标 = DAG 录入即长出、不额外打卡（C1 低录入 / G2 不双写）；用锚点场景（视觉A采集→电控B调底盘→机械C装臂→电路D配合）当样例；真实写路径 `POST /api/tasks` + `POST /api/deps` 后置 mock-first（待服务器审批）。无此项则归因 / 排班 / 知识树全在 fixtures 上演 |
| ARCH-PATH-DECISION | done(2026-06-11, D-028) | design | 拍定治理为主轴：治理实体进 hub-contracts 核心域，hub-* 壳子降为触点/展示底座 |
| REMIND-MODEL-DECISION | done(2026-06-10) | design | 提醒模型拍定（私聊本人/起草不发送/升级事不升级人）；见 `docs/archive/decisions-archive.md`「D-026 后续」 |

## P0 — 三支柱（D-039 第一轮落地，演进留地基 / AI 不碰治理）

> 三根全 P0（**D-040 破冰序 `base → kb → pm → inv`**，**D-042 定基调**：base 补收口刀、KB 拆 CORE/LARK、PM 删 Member.status+结构键、INV 留着排最后对话记账防死、Hermes 最后接）。frontier 顺序：**三支柱读写全 done（KB-CORE D-044 / PM D-045 / 读视图 D-046 / KB 闭环 D-047 / 写侧表单 D-048 / 设置页 D-049 / KB 导入 D-050，2026-06-14）→ 下一批待用户排期：AUDIT-FIXES（部署前必修 7 条）/ CONSOLE-COPY-HUMANIZE / INV 第三支柱 / 部署上线**（KB-LARK/Hermes 后置）。设计北极星：比死掉的表格更省事 ｜ 用着就更新（派生优先）｜ AI 只当仓管·转译不下判断 ｜ 人在环 ｜ 小作坊轻量。共享底座 = `HUB-SERVER-GOV-SCAFFOLD`（持久层 + real CRUD 路由），任一根先做都先过它。详见 `docs/archive/three-pillar-feasibility.md`。

| 任务 | 状态 | type | 内容 |
|------|------|------|------|
| KB-CORE-DESIGN | done(2026-06-14, D-044) | design | IssueCard 闭环+相似检索+结案派生知识节点落地；真相=`docs/design/kb-core.md` + completed-log |
| KB-LARK-DESIGN | pending (P0, **hardblock LARK-BIN-PROBE**, D-042 拆) | design | **战队知识库·飞书层**（拉飞书 wiki·drive 资料、规范入口 findability）：依赖 `LARK-BIN-PROBE` 实测定 bin/method 名后才进 `boundary.ts` 白名单。当前飞书通道零实现（白名单仅 `im.v1.message.create`），故拆出后置；纯本地 KB-CORE 不依赖它、可先行 |
| PM-BOARD-DESIGN | done(2026-06-14, D-045/D-046/D-048) | design | 后端录入簇+读视图+写侧表单全落地（I0 读写边界=confirmedBy 内部凭证）；真相=`docs/design/pm-board.md` |
| KB-IMPORT-PROBEFLASH | done(2026-06-14, D-050) | code | ProbeFlash `.debug-archive` 一次性导入 CLI（`npm kb:import`）；nit 收口见 KB-IMPORT-FOLLOWUP |
| KB-IMPORT-FOLLOWUP | done(2026-06-20, D-051 续) | code | 二次对抗审计 3 缺陷硬化（撞 slug/日历/EISDIR）+nit①②收口；hub-server 149 测绿 |
| INV-BOM-DESIGN | pending (P1；**07-15 D-086 修正**：对话记账判死作废"主力"定位，防死改"必要动作的副产品"；缺料双报警×赛场打标×粒度分级设计已出=`docs/design/inv-alert-redesign.md` DESIGN-DRAFT，实现不排期) | design | **库存/BOM**（低频但找一次要命）：零件台账（3508/达妙6220/备件/坏件/每车 BOM 用量余量）。**D-042 定位 = 不冻结·留着·排最后·重要**。防死机制：**对话记账（主力，靠 Hermes：说"坏了一个 3508"助手记一笔，依赖 `HUB-HERMES-ADAPTER`）+ 一次性盘点建底（起步，老师也要）+ 看图算量（增强，后续；本地大内存可兜底）**；新增 **缺口主动向用户汇报**；老实定位 = **"大概有什么/还有没有"非精确实时账**（静默拿走的漏认了）；**锁松一档**=不禁止做，但做时必须带对话记账低门槛入口、不许做成纯手敲死表。`PartStock/BomEntry/DamagedPart` 新建（confirmedBy=timestamp 守 I0、AI 草稿态 confirmedBy=null 守 C4、不回写 Bitable 守 G2）。归战队数据库家族（同机械图纸档案库 D-038）|
| LARK-BIN-PROBE | pending（跨根前置，D-040） | probe/fix | **lark bin 双语义债实测 + 统一修**（KB R5 拉飞书资料 / INV bitable 的前置）：`cli-bridge.ts:17,47` 调 `execa('lark', …)` 但 `:22` 报错写 `'lark-cli not found'`，KB/INV 设计修复方向相反、无法从代码判定。**实测由用户在 WSL2（100.78.202.84）跑**（那台是测试机、不默认 SSH）：`which lark && which lark-cli && lark --version`；bin 名错→改 execa 参数，否则→改 message。顺带可实测 `wiki.v1.documents.get` / `bitable…record.search` method 名（风险5）。详见 `docs/archive/three-pillar-reqdesign.md` §4 |
| HUB-HERMES-ADAPTER | pending (**最后做**, D-042) | code/design | **统一触点能力：项目调用 Hermes/openclaw**（四层架构最上层，先搭壳子→最后接，一次接多根受益）。能力是真的（Hermes 已接通能调飞书 CLI），缺口在项目侧"去调用助手"的对接代码。接上后：库存**对话记账**（"坏了一个 3508"→助手记一笔同步表）+ 知识库随手沉淀 + 进度表随口更新 走同一条路。接时核 `LARK-BIN-PROBE` 细节、mock-first、§3/§8 审批门后。归 D-036 openclaw=Hermes 类 adapter 轨（≠ 否决的 openclaw-lark 协议桥）|

## P1 — Console 收尾 / UI 打磨（D-048 后，2026-06-14 立项；当轮只记录未实现）

> 用户 2026-06-14：humanizer-zh skill 已装（全局 `~/.claude/skills/humanizer-zh`，是去 AI 味改写指南）；下面两项**只先记录**、本轮不实现，等用户排期。完整执行细节见 plan `~/.claude/plans/git-humanizer-zh-skill-dapper-pearl.md` 第 2/3 步。

| 任务 | 状态 | type | 内容 |
|------|------|------|------|
| SELF-ITERATE-SKELETON-D053 | done(2026-06-14, D-053) | skill | 自迭代外环 §6.C 落地；后随 D-066 退役冻结，`completion-model.yaml` 现存 `archive/legacy-harness/` |
| CONSOLE-LOWRISK-BATCH-D052 | done(2026-06-14, D-052) | code | 版本跟随 package.json+删死导航+重复真相下沉 contracts；commit `8ab93cf`/`44b7fcc`/`8ea6579` |
| CONSOLE-COPY-HUMANIZE | done(2026-06-19) | chore | 用户可见文案去 AI 味（主体随 D-058 完成，KB_SIMILAR_NOTE 1 串收口） |
| INTEGRATIONS-TO-SETTINGS | done(2026-06-15, D-057) | code | 「适配器」→「集成」归设置页只读子节+总览精简 |
| DEPGRAPH-ENTRY-OVERLAY | done(2026-06-15, D-056) | code | 依赖图录入浮层+看板↔依赖图互通+I0 负责人降级 DetailPanel |
| DEPGRAPH-DRAG-CONNECT | done(2026-06-14, Option A) | code | 画布拖拽连线建依赖（type=blocks+前端守自edge/重边/成环） |
| DEPGRAPH-AI-AUTODRAW | pending (P1, D-052 立项) | code | **AI 自动画大致 DAG + 人微调（Q2 新诉求）** —— 给一批任务/自然语言描述，AI（经 Hermes 触点或直接 LLM）产出**草拟依赖边**布到画布，人再拖拽增删微调（接 DEPGRAPH-DRAG-CONNECT）。AI 只**建议**不落库，人确认才写。依赖 Hermes 触点能力（后置）；可先做"给现有任务集建议缺失边"的轻版 |
| CONSOLE-SETTINGS-PAGE | done(2026-06-14, D-049) | code | 设置页真页面落地（数据源/语言/后端地址/关于） |
| OOP-QUALITY-ROADMAP | done(2026-06-22) | code | OOP+质量四批次（`882fd56`/`2fd6970` v0.7.5→0.7.6/`21ea803`/`c7d410f`） |
| VISUAL-POLISH-A-H | done(2026-06-23~24) | code | 视觉打磨 A-H 全批+暗色主题（`54dcfa6`…`657f208`） |
| PLAYWRIGHT-HEALTHCHECK-CONSOLIDATE | done(2026-06-24) | code | Playwright 体检收口进 hub-console devDep（`2231903`/`b4ac8d8`，`npm run health-check`） |
| AUDIT-FIXES-2026-06-14 | 必修 7 条 (D-059) + 2nd 批 (D-065) + **长尾 14 修 done (2026-06-19)** / 余 defer | code | **代码审计修复批次** —— 详单见 `docs/archive/audits/code-audit-2026-06-14.md`（15-agent 对抗审计，confirmed 42：High 5 / Med 16 / Low 12 / Nit 3）。**部署前必修 7 条 done (D-059)**：H1 环守卫 / H2 写链重置 / H3 写鉴权+限流+bodyLimit / H4 status clamp / M6 剥 confirmedBy / H5+M11 compose / M9 单调序号。**2nd 批 done (D-065，2026-06-15 审计后 server 硬化)**：M8（invoke safeParse+400）/ L4（closeout 201）/ M13（构造器补全克隆 8 数组）/ M21（console 写侧测试）+ 预写部署代码（SystemStatus.mode enum / trustProxy / DEMO_SEED 空板）。**长尾 14 修 done (2026-06-19，wf_70fbdabb)**：M7(getSnapshot 浅拷贝)/M15(nodesDraggable)/M18(IssueCard .min)/M19(closeout .trim().min→400)/L1(单调 ID)/L5(static-console realpath)/L7(KbSimilar projectId)/L8(updatedAt isoDateTime)/L9(seq useRef)/L10(冷启动 defaults)/L12(.nvmrc+engines)/N1(adapter enum)/N2(tie-break Date.parse)/N3(sharedResourceBusy 测试+I0 护栏)；2-lens 双 ship/mustFix=0·三包 verify 绿(95/136/35)。**defer/已做**：M8/M9/M10/M16/M17主体/L4/L11 复核已落或不适用、M14(DepGraph selectedId 重接线无法确证无回归)·M17 .max 阈值未定·M20 workspace infra 侵入。**L6 已修（2026-07-03，`9676461`，见 GATEWAY-INBOUND-WHITELIST-L6）——42 条全清**。**仍 decision-needed**：bridge/members（用户拍暂留·部署前必处理）、ownerId/ownerLabel 设计张力（AGENTS §5 对账） |
| GATEWAY-INBOUND-WHITELIST-L6 | done(2026-07-03, `9676461`) | code | lark-gateway 入站白名单+限流；审计 42 条至此全清 |
| FORM-ADDLEG-INLINE-TASK | pending（07-02 表单审计遗留补记） | code | 接力画布「加一棒」表单支持**就地新建任务**（现只能从已有任务下拉选，任务不存在时须先去项目页建再回来）；随 SCHED-NARROW 一轮做或独立小刀 |
| UX-SCAN-BACKLOG-2026-07-12 | pending（B0 sonnet 9 页×4 主题扫描，交互/信息架构类分流） | code | **UX 扫描 backlog 项**（详单=`docs/design/design-language.md` §10 第二表）：我的视图空态自相矛盾+黑话；知识库首屏空壳无预览/角标；总览空态大卡压实据+统计卡异常态规则不一+黑话无解释；依赖图无图例+空态详情面板占 1/3 屏；学习方向电控卡过载破网格+缺口三处重复表达；图纸档案 artifact:// 裸链接+分组标题层级倒挂；日期输入原生 mm/dd/yyyy；库存追踪方式选择器散装；warm 主题区分度弱；面包屑与品牌名重复。视觉/结构类 8 条（U1–U8）已分流进 DESIGN-LANG B1–B5 批次顺带修复，不在此表 |

## P1 — 差异化排班 + 缺人方向 + 学习建议（D-069 立项，A1 组级均衡 + B1 窄义；不复活 D-039）

> 用户 2026-06-18 提「不同上课时间 + 平均排班 / 什么方向缺人 / AI 分析谁去学」。可行性 workflow `wf_6f935ab0-027` 拆三子诉求；用户两个 §5 产品方向决策拍**保守合宪项**：**A1**=排班只到组级（个人课表默认 private、自愿录入、明细永不外露，聚合成组级 headcount，输出无 memberId）、**B1**=AI 学习建议只到知识点 + 只私下回本人（不让 AI 把具体人配对缺口 = 不复活 D-039）。**积木已在**：`schedule.ts derivePresenceSchedule`（D-029，写完但**零运行时引用** = 第一次真正接出）、`growth.ts`（D-027 KnowledgeNode/MemberKnowledge/TaskKnowledgeTag）、`attribution.ts`（缺口归因）。详见 `decisions.md` D-069。**实现期纪律**：排班输出永远组键、严禁按人出场次数均衡器；缺口渲染绝不下钻到人；S3 窄义边界（让队长看匹配/AI 排序候选人即跨进广义 = 未经拍板复活），守住。

| 任务 | 状态 | type | 内容 |
|------|------|------|------|
| GAP-DIRECTION-SCHEMA | done(2026-06-18, `73373ca`/`f2ee082`) | code | `DirectionGapSchema`（组键+detectedBy:derived，零 memberId/score） |
| GAP-DIRECTION-DERIVE | done(2026-06-18, `73373ca`/`f2ee082`) | code | `deriveDirectionGaps` 纯函数（按组聚合 open+escalated 缺口） |
| GAP-DIRECTION-ROUTE-CONSOLE | done(2026-06-18, `b35d1ae`) | code | `GET /api/group-gaps`+缺人方向页；页面后经 D-083 改造为「学习方向」（见 LEARN-DIRECTION-REDESIGN） |
| SCHED-WIRE-EXISTING | done(2026-06-19) | code | `derivePresenceSchedule` 首次接出（POST /api/resource-sessions+GET /api/schedule+SchedulePage） |
| SCHED-MEMBER-AVAILABILITY | done(2026-06-19) | code | 组级容量（MemberAvailability+deriveGroupAvailability）；⚠D-083 课表判伪需求停止扩建（schema/派生保留） |
| STUDY-NARROW-DERIVE | done(2026-06-19) | code | `deriveStudySuggestions` 窄义纯函数（B1 不复活 D-039）；私下推本人渠道仍 gated on HUB-HERMES-ADAPTER |
| STUDY-BROAD-D039-REVIVAL | **HARD-GATED do-not-build**（B1 已拍、广义封存） | design | **S3 广义：AI 把具体人配对技能缺口 / 能力排序**——命中 `decisions.md` D-039 明文复活触发。默认 **do-not-build**；仅在用户**另立 §5 拍板**「要让 AI 参与对人的治理判断」后才立项，前置 = decisions.md 追一条新 ADR 显式复活 D-039 + 从挂起区取回 D-032~D-035 补 k-anon/audience 护栏。未拍板前任何 PR **不得引入「AI 输出指向具体人的学习指派或能力排序」**，开发者不得自行启用 |

## 挂起 — 治理 AI 派生（D-039：AI 退出治理，想法不丢）

> D-039：第一轮治理判断回归人（大三/学长看"人读说明视图"自行协调），AI 不参与治理。以下整簇 spec 保留、代码本就近零、**不删**，冻在此处。**复活触发条件 = 未来确认要让 AI 参与治理判断**（自动分辨 blocked-idle vs lazy-idle / 自动派活 / 自动 silence）；届时从这里取回图纸。

- `GovernanceCue` 多态 schema + `deriveMemberStatus` 五态（uncovered/blocked/capacityFreed/silence/working）— D-032
- silence 分河（机械/电路=artifactUpload、程序=git、兜底=check-in）+ 保守过渡铁律 + presence 佐证 — D-034
- give-floor + 暴露必带给予不变式 + 修正测量四段 — D-035
- 受众路由（audience 三值 taskOwnerPrivate/subjectGroupLead/teamCoordinator）+ k-anon + I0 机器实现 — D-033/D-037
- `RulesConfig` 阈值（kind-keyed silenceDays/cooldown）/ `deriveNeedEscalations` / `deriveOverloadSignals` 完整阈值派生 — D-032/D-031
- 自动派活（远期 AI 辅助派活）
- 关联代码债（随挂起）：`freeIdle` uncovered/真闲拆分 + `Member.status` 双写

## P0 — 数据河 build 轨（D-036，方向已定，实现审批门后）

> 治理信号的上游河流（C5：每组一条河，D-034）。方向已定（图纸喂信号 / 程序薄封装 git / openclaw=Hermes 类 adapter / 远程=LAN+隧道），实现是 server/基础设施任务、§8 审批门后；本轮只登记方向 + 未决项，避免重复探索。

| 任务 | 状态 | type | 内容 |
|------|------|------|------|
| HUB-ARTIFACT-ARCHIVE-V2 | done(2026-06-18, D-071) | code | 图纸档案=机械/电路分组版本库（5 optional 字段+server 派生版本号） |
| HUB-ARTIFACT-VERSION-DESIGN | pending（数据河，**进阶语义部分被 D-071 覆盖**） | design | 图纸/artifact 版本上服务器：扩展 `ArtifactRef`(schemas.ts:95-111) 加 kind + 版本链 + 按天/robotTarget 分类；**上传→`artifactUpload` 进度信号**（喂机械/电路河，D-034）；mock-first；字节进 volume/MinIO、不入 git/治理库（D-025 边界）。**D-038 按组分治**：机械=本地存储真相（见下行）、电路=云端引用（`kind:'eda'`+externalUrl 不存二进制）、程序=git。未决：版本语义（谁 bump / 当前权威版指针 / 撞坏回退 / 按车分支）、上传 UX 须比微信省事（C1）、存储/备份/审批（§3/§8）。别做完整 PLM（C3）|
| HUB-ARTIFACT-STORE-MECH | done(2026-06-21, D-078) | code/design | 本地卷版图纸文件链路（upload/storedFile/文件+云端双存）；AI 看图算量+MinIO 切换仍 pending |
| HUB-GIT-ADAPTER-DESIGN | pending（数据河） | design | 程序薄封装 git（git 仍唯一真相 G2、不另造 VCS C3）：一键"保存版本"=底层 commit+push；git push→`gitCommit` 进度信号（喂程序河，D-034）；双重职责=降门槛 + 让程序 silence 信号可信。可并入既有 `HUB-GIT-FORGE-DESIGN`。未决：交互形态（Lark 卡片 / console 按钮）、鉴权 |
| GOV-REMOTE-ACCESS-DESIGN | pending（基础设施） | design | 在外访问 = 实验室 LAN + 隧道（用户 2026-06-12）：治理服务器在内网，备赛在外要隧道/反代才能直连；与 Hermes/openclaw adapter 轨**区分**（adapter=能力、隧道=访问路径）。真痛点=在外 Cue 送得到（飞书走 Lark 云本可达）+ 信号收得进。§8 审批门后，独立基础设施轨，别缠治理设计 |

## P0 — 成长轴 / 机器人知识图谱（与治理主干并列，D-027）

> 反监视正面纲领：把"系统给得比拿得多"（A3）做厚。三级=本周在做→知识树→兴趣方向；护栏=兴趣数据归本人 / 无可比进度不排名 / MVP 不做课程平台。

| 任务 | 状态 | type | 内容 |
|------|------|------|------|
| AXIS-KNOWLEDGE-MODEL-DESIGN | done(2026-06-11, D-028) | design | growth.ts KnowledgeNode/MemberKnowledge/TaskKnowledgeTag（护栏落 schema 形状）；展示/标注 MVP 见下方 pending 行 |
| AXIS-TREE-VIZ-DESIGN | pending | design | 知识树展示（人的未来），与依赖图（项目的未来）双图对称；**无完成率/不排名/不跨人对比**（C2/A1）|
| AXIS-TASK-ANNOTATE-MVP | pending | design | MVP：布置任务时 AI 建议涉及知识点 + 挂资料/去年做过谁；树从标注长出，不预设本体（C3）|
| AXIS-LARK-DIGEST-DESIGN | pending | design | 飞书订阅 digest：相关知识/缺口/新资料定时私推；参考 feiyue `_conf_crawl_loop`（72h 爬+推）模式；复用 Lark 三包 |

## P0 — 模块化架构（D-081/D-082，2026-07 插件化重构阶段一 + 前置）

> 战队机器人垂直场景内核向其他协作场景（游戏工作室/软件开发等）复用。两阶段：阶段一（已完成）把机器人单体模块化成 CASE base + 机器人层、master 不动；阶段二从合并后 master 切 game-studio/software-dev 垂直包 worktree。设计北极星 `docs/design/modularization-feasibility.md`（已执行）；`core-plugin-architecture.md` PROPOSAL 已搁置归档 `docs/archive/`（D-083）。

| 任务 | 状态 | type | 内容 |
|------|------|------|------|
| MODULARIZATION-PHASE1 | done(2026-07-03, D-081) | code | feat/plugin-core 6 commit（`6fc32fb`→`c84f4a9`）FF 合并 master，v0.9.7 |
| DAILY-PLAN-PRESETS | done(2026-07-03, D-082, `51fb377`) | code | defaultPreset 一键铺表格；实现口径=D-082（D1/D2/D3 全选 A） |
| PHASE2-CONSOLE-ASSEMBLY | done(2026-07-03, `aaa4209`) | code | console 装配接线；main.ts tenantConfig 债已由 AUDIT-DEBT-2026-07 清（2026-07-12） |
| MODULARIZATION-PHASE2 | **后置 (D-083)** | code | 游戏包推迟——先把 Robocon 垂直包写明白（D-083 §7）；届时再从 master 切 game-studio/software-dev 等垂直包 worktree |

## P0 — 防爆肝双主轴（D-083，2026-07-11 立项：路线 v4）

> 产品重定义（`docs/design/product-redefine-2026-07.md`，DECIDED）：给没有项目经理的小团队一个代打项目经理的工具，把赛前爆肝摊平到整个赛季。双主轴=防爆肝（倒排基准线）+防"大号 AI MCP"（学习方向）。宪法修正（G4 里程碑例外/I0 口径降级/AI 排人三红线）见设计稿 §3。按 v4 顺序认领。

| 任务 | 状态 | type | 内容 |
|------|------|------|------|
| BASELINE-DESIGN | done(2026-07-11) | design | `docs/design/baseline-design.md` DESIGN-LOCKED v1（三版车模板/验证门/投资三维）；真实时间线赛后回填 v2 |
| TASK-POST-CLAIM | done(2026-07-15) | code | 挂单认领制（`5a60344`..`bfa5d25`，v0.23.0→0.23.2，D-088）；真相=`docs/design/task-post-claim.md` §9 |
| GATE-CHECKLIST-IOU | done(2026-07-15) | code | 门检查单与欠条（`f2ceffb`..`86bcc3d`，v0.22.0→0.22.3，D-087）；真相=`docs/design/gate-checklist-iou.md` §7 |
| BASELINE-CORE | pending（**下一 workflow**，口径=baseline-design.md） | code | 基准线实现：Season 接线（现死脚手架）+ baseline schema 落 zod（独立域，Task 永不加 dueDate）+ 独立 baselineStore（InMemory/File+落盘 baseline.json）+ 路由（含过门 POST 带验收人、证据引用 artifact）+ deriveBaselineDrift 周粒度纯函数+单测 + 总览页首屏"基准线 vs 实际" + Robocon 模板 v1 seed（相对周占位）；投资标签本轮只落 schema+录入+最简示警 |
| IDENTITY-LITE | pending（v4 第 2 刀） | code | 轻身份登录**双模式**：匿名模式整体保留供选择（=今日形态）；身份模式=匿名可读一切+登录才写/个人视图（选人+可选 PIN，无邮箱注册）。改动面（审计实measured）：confirmedBy/ownerId 从客户端自报改**服务端按 session 注入**（≥6 写路由+5 Draft 类型）+前端身份挂载点（PageRenderCtx 加 identity 槽）+queryKey 身份维度+**PmCreatePanel ownerId 自由文本→选人**+Member 加 optional pinHash（不存明文）。main.ts loopback 判定盲区（反代部署）一并修 |
| MY-VIEW | pending（依赖 IDENTITY-LITE） | code | 我的视图：我负责的任务∩未被依赖卡住的（blockedBy 派生已有）；GET /api/tasks 加按 session ownerId 过滤或新开 /api/my/tasks；不碰课表（D-083 判伪需求） |
| STORE-SPLIT-SQLITE | pending（v4 第 4 刀） | code | 先按 pm-core/schedule 边界把 GovStore god-interface（21 方法/6 域）拆 PmStore+ScheduleStore（KbStore/InvStore 是先例），id/clamp 抽独立纯函数三实现共享；resourceSessions/relayHandoffs 8 方法先补落盘设计；再装依赖分模块增量迁 SQLite（SqliteGovStore 现纯 throw 零依赖） |
| LEARN-DIRECTION-REDESIGN | pending（v4 第 5 刀） | code/design | 缺人方向页→「学习方向」：**跨工种学习地图**（设计稿 §5 初稿：电控学机械结构/电路懂走线防接线员/机械深耕物理空间/视觉懂电控极限与 sim-real 差距+**AI 边界横切列**=能验收 AI 输出的最低知识集）×队内缺口（deriveDirectionGaps 已有）；只对本人可见、只建议不指派；兴趣声明**暂不建**（D-083） |
| AUDIT-DEBT-2026-07 | pending（可穿插） | code | 解耦审计债（设计稿 §9-④）：GroupKindSchema 机器人闭集放宽（比照 RobotTarget 收口法）/ convergenceScope 字面量判断收口 / **pm-requests.ts 解绑 robotics 词汇 import**（闭集校验挪路由层 VocabularyRegistry）/ main.ts tenantConfig 接线 / App.tsx 工具条特例入注册表 / GovernanceSnapshot 三处手写同步收单源 |
| SCHED-NARROW | pending（低优先，随动线调整） | code/docs | 在场排班/接力收窄定位（D-083 §7）：退出日常动线、只服务关键窗口（联调日/赛前冲刺）；导航/文案随 LEARN-DIRECTION-REDESIGN 一轮调整；课表围绕排班停建（MemberAvailability schema/派生保留不扩建） |

## P0 — 公测补强（2026-07-24 立项：初始化/PIN 死锁 + 向导补强，待一起修复）

> 用户 2026-07-24 实测部署命中初始化/PIN 死锁（未导名册未设队长 → 导入后不知 PIN → 全部写设置锁死）。
> 活体复现三条死锁路径 + 修复刀划分 = `docs/design/onboarding-pin-deadlock-2026-07-24.md`（先写代办、待一起修复）。

| 任务 | 状态 | type | 内容 |
|------|------|------|------|
| PIN-DEADLOCK-RECOVERY | done(2026-07-24，`c23667c` v0.28.0) | code | **loopback 操作员可重置 PIN**：`DELETE /api/members/:id/pin` 对裸 socket=loopback 的请求豁免 superAdmin 判定。DEPLOY §7.1 改三级 |
| SETUP-WIZARD-ROSTER | done(2026-07-24，`5941be1` v0.31.0) | code | **向导全屏初始化门**：①你是谁→bootstrap 一笔建人+授旗+设 PIN+登录态 ②导入名册 ③确认组长 ④进 app |
| MEMBER-PM-FLAG | done(2026-07-24，`b6281bc` v0.29.0) | code | **管理员拆正交旗标** `Member.projectManager`；MemberRole 收敛 member/groupAdmin |
| ROSTER-CSV-3COL | done(2026-07-24，`0cc0ac4` v0.30.0) | code | **名册 CSV 3 列 + 确认组长页**；importRoster 不写 role 重导不洗组长 |
| PROGRAM-GROUP-ABSTRACT | done(2026-07-24，`f13fb37` v0.32.0) | design/code | **程序组=结构派生抽象**（有子组不可选）；读写两端统一叶子组集合 + 最小组管理端点/设置页组分区 |
| WRITE-GATE-SESSION | done(2026-07-25，`364ce97` v0.33.0) | code | **写门放行登录/会话/引导端点**：身份模式有效会话=已鉴权，session/bootstrap/roster/loopback PIN 恢复免 Bearer；修非 loopback 部署初始化 401 死锁 |

## P0 — 公测打磨轮 + 初始化向导 v3（2026-07-25 立项：冒烟反馈 + 「初始化一次问完」）

> 设计真相 = `docs/design/onboarding-init-wizard-2026-07-25.md`（问题清单/拍板决策/契约形状/边界复核）。
> 向导八步：who→roster→leads→season→fleet→inventory→kb→done，每步可跳过。

| 任务 | 状态 | type | 内容 |
|------|------|------|------|
| EMPTY-BOARD-DEFAULT-GROUPS | pending（刀⑤） | code | 空板预建 fixtures 同构组树（程序母→电控/视觉；机械/电路顶层）；store `ensureDefaultGroups()` 判空幂等 |
| GRADE-7-TIERS | pending（刀⑥） | code | MemberGrade 扩 grad1/2/3（graduate 留 legacy）；bootstrap 向导问年级下拉；验收派生含全部 ≥大三档 |
| ROSTER-IMPORT-PREVIEW | pending（刀⑦） | code | `POST /api/roster/preview` 只解析不落库 + import 扩 JSON rows；console 预览表行内年级下拉/组 datalist，确认再导 |
| MEMBER-PAGE-UX | pending（刀⑧） | code | 三件套：验收人只读徽标（纯年级派生）/ PIN 明文副本 `pinPlaintext` + `GET /api/members/:id/pin`（本人或持旗）+「显示PIN」按钮 / 成员表单行布局 |
| SEASON-SUGGEST | pending（刀⑨） | code | `suggestSeason(now)` 日期派生（8–12月→次年赛季）；总览空态+设置页一键创建（读不落库） |
| FLEET-BATCH-INIT | pending（刀⑩） | code | `POST /api/resources/batch`（zod 全验任一坏整批 400；displayCode 照派生 + status 补迁移）+ 向导车队表格步（几台/能用/在修） |
| INV-BULK-IMPORT | pending（刀⑪） | code | 库存批量导入仿名册：contracts inventory-import（模板/解析/行号）+ template/preview/import 三端点 + store `importPartTypes`（partNumber 幂等 upsert）+ 向导库存步（可跳过）+ InvPage 入口 |
| KB-BULK-MD-IMPORT | pending（刀⑫） | code | `POST /api/kb/import-docs`（multipart 多 md→ArchiveDocument generatedBy:manual）+ kb store `addArchiveDocuments` + 向导知识库步（可跳过） |
| WIZARD-SEASON-STEP | pending（刀⑬） | code | 向导赛季步：suggestSeason 预填 + 学期开始/比赛日两锚点 → createSeason + 锚点齐则 generateRoboconBaselineTemplate+PATCH 落基准线模板；可跳过 |
| KB-AI-STRUCT | pending（研究项，2026-07-25 用户猜想） | research | 知识库初始化引入 AI 分析：导入一堆文件→AI 创建结构化文档/知识库。猜想阶段，先积累批量导入语料（KB-BULK-MD-IMPORT）再评估 |
| CHECKLIST-TPL-IMPORT | pending（缺口） | code | 检查单模板无任何导入通道（schema 已落四字段、store 只读、无端点无脚本）；等复盘产出模板时补最小导入 |
| INTEG-CONFIG | pending（缺口） | design | git 仓库/飞书/bot-channels 全是 mock 只读端点、无配置入口；真实接入前需设计配置面（与 REMOTE-ACCESS-DEPLOY 相关） |

## P1 — 文档与 harness 减负（2026-07-24 立项，三路 explore 量化报告为据）

> 三路 explore 量化（2026-07-24）：planning 三活文件 371K 约 60% 是历史日志/落地账单；docs 全树 16M 中 screenshots 占 87.5%（**单独决策，不在本批**）；harness 环节里 skills 软链从未安装、debug 卡 6 周零新增、版本钩子链机制写了没装。两刀均不碰 `apps/hub-*/src`、不 bump。

| 任务 | 状态 | type | 内容 |
|------|------|------|------|
| DOCS-SLIM | done(2026-07-24，全部六项：①`cf869e6` ②`4ef1ef4` ③`c458c8f` ④`f20507d` ⑤`9ba5bad` ⑥同 commit 末刀) | docs | **活账本纪律执行**（D-070/D-073 现成基建）：①now.md 56K→~15K（frontier 17 done 条压一行指针/最近完成留 3 条/repo_sync 历史段移 archive）②decisions.md ~25 个落地账单段（D-044~D-082 区间）压 3 行 stub+全文移 decisions-archive ③backlog done 行（55%）压「任务名\|done\|日期+D号」一行+死引用路径修（completion-model/agent-state→archive/legacy-harness）④死文件 12 篇移 docs/archive（planning 死报告 5+design 历史稿 4+aurash+superpowers spec+dogfood）⑤7 篇文档头状态回写（setup-wizard/sched-date-relay/depgraph-drag-connect/daily-plan-presets/modularization-feasibility/presence-reconcile-lock + gov-oncall-schedule:38 标 superseded）⑥deploy 单一真相（RUNBOOK 首启动段改指针、guide FAQ 忘 PIN 同步 v0.27.0 产品通道） |
| HARNESS-DIET | done(2026-07-24, `4a6cb0c`/`dfcc32d`) | chore | **失效环节砍/降级**：①skills 砍死件（debug-checklist+PROTOCOL-v1.0 移 archive/legacy-harness，personal-daily-summary 删或补用法，留 kb-debug/pre-match-checklist）②砍 .debug-archive 双轨（tracked README 移除，gitignore 保留）③AGENTS §6 debug 卡规则如实降级（事故复盘可直接进 design/planning）+§4「改 skill 必重链」改「要用才装」④版本钩子链：本机跑 install-hooks.sh 使反射真活（AGENTS §7 纪律兑现） |

## P0 — Team Hub 壳子（已落地，作为治理触点/集成 + 展示底座保留）

| 任务 | 状态 | type | 内容 |
|------|------|------|------|
| WORKFLOW-CONTEXT-SLIM-01 | done(2026-06-06) | docs | agent-state.json 机器索引（后随 D-066 退役，现存 `archive/legacy-harness/`） |
| HUB-CONCEPT-01 | done(2026-06-06, D-024) | design | `docs/design/team-hub-concept.md`（canonical）落地 |
| HUB-STACK-DECISION | done(2026-06-06, D-025) | design | `docs/archive/team-hub-stack-decision.md`（Node/TS 统一栈+Compose 硬要求） |
| HUB-BACKEND-SCAFFOLD | done(2026-06-07) | code | `apps/hub-server` 包起手（Fastify+Zod+契约测试） |
| HUB-CONTRACTS-V0 | done(2026-06-07) | code | `apps/hub-contracts` 共享契约包（Zod schema+fixtures） |
| HUB-CONSOLE-SCAFFOLD | done(2026-06-07) | code | `apps/hub-console` 包起手（React/Vite+mock/real split） |
| HUB-CONSOLE-PREVIEW-SCRIPT | done(2026-06-07) | code | `scripts/preview-hub-console.sh`+preview:local |
| HUB-COMPOSE-SCAFFOLD | done(2026-06-07) | code | Dockerfile+compose.yaml+verify-hub-compose.sh（幻影 postgres 后由 D-059 删除） |
| HUB-LARK-WIRE | done(2026-06-07) | code | lark 三包 Hub 事件接线（mock-first） |
| HUB-ADAPTERS-MOCK | done(2026-06-07) | code | mock AI adapter helpers（后由 D-062 重建为 BotChannel/AgentBackend/DataSource 三分） |
| HUB-GIT-FORGE-DESIGN | pending（触点层） | design | 战队服务器 Git 中枢方案：Forgejo/Gitea/bare git 取舍、push/pull 工作流、artifact 不入 Git 策略、备份边界；D-026 后归触点/集成层，并入 Git 提交→进度派生（见 GOV-LARK-DERIVE / GOV-RULES-LAYER）；真实服务器操作另开任务审批 |

## P0 — Skill 自用闭环（备赛期窗口）

| 任务 | 状态 | type | 内容 |
|------|------|------|------|
| SKILL-01-DEBUG-CHECKLIST-V0_0_1 | done(`f5df2bf`) | skill | 已闭环；skill 后随 HARNESS-DIET 移 `archive/legacy-harness/` |
| SKILL-02-DOGFOOD-NOTE | done(`f5df2bf`) | docs | `docs/archive/dogfood-readme.md` 落地（流程从未运转，2026-07-24 归档） |
| SKILL-03-PROMPT-ITERATION | pending（dogfood ≥ 30 天） | skill | 基于 dogfood 数据调 SKILL.md 的 prompt 模板；只动 SKILL.md，不动其他 |
| SKILL-04-PERSONAL-DAILY-SUMMARY | done(`93dc7d0`) | skill | 已闭环 |
| SKILL-05-PRE-MATCH-CHECKLIST | done(`9beb907`) | skill | 已闭环 |

## P0 — Skill 协议层（备赛期收敛）

| 任务 | 状态 | type | 内容 |
|------|------|------|------|
| SKILL-PROTOCOL-V1 | done(2026-05-24, D-023) | design | 协议本体+迁移差距清单（PROTOCOL-v1.0.md 后随 HARNESS-DIET 移 `archive/legacy-harness/`） |

## P0 — LARK 飞书接入（备赛期 stage_goal 之一）

| 任务 | 状态 | type | 内容 |
|------|------|------|------|
| LARK-02-CAPABILITY-MIRROR | done(2026-05-19, D-020) | research | `docs/research/lark-api-capability.md` 事实底座 |
| LARK-OSS-SCAN | done(2026-05-19, D-020 后续) | research | `docs/research/lark-oss-candidates.md`；路径 A 基座=`@larksuiteoapi/node-sdk` |
| LARK-PATH-DECISION | done(2026-05-19, D-021) | docs | 拍板路径 A（SDK+Long Connection） |
| LARK-01-CONNECTOR-ARCH | done(2026-05-19, D-021 后续) | design | `docs/design/lark-connector.md`（v2 见 LARK-CLI-04） |
| LARK-03-MIN-INTEGRATION | done(2026-05-19) | code | lark-gateway 子包 mock-first；真实飞书 smoke 留用户线下 |
| LARK-ONBOARD-GUIDE | done(2026-05-19) | docs | `docs/research/lark-onboard-guide.md`（lark-cli 路径见 LARK-CLI-05） |
| LARK-CLI-01 | done(2026-05-21, `e3e2069`) | code | lark-toolkit 子包（boundary 白名单+cli-bridge） |
| LARK-CLI-02 | done(2026-05-21, `ea41c74`) | code | pf-skills 子包（createSkillDispatcher） |
| LARK-CLI-03 | done(2026-05-21, `7c47f9a`) | code | lark-gateway 瘦身（ws-client，src 9→7） |
| LARK-CLI-04 | done(2026-05-21, `fef9e77`) | docs | D-022 DECIDED+lark-connector v2 |
| LARK-CLI-05 | done(2026-05-21, `8b7bb5b`) | docs | onboard-guide 加 lark-cli 路径（留手填 fallback） |
| LARK-CLI-06 | done(2026-05-21, `4d5854a`) | docs | `docs/research/lark-cli-dev-usage.md` |

## P1 — Legacy Bridge 候选（被 Hub 覆盖，待重评）

| 任务 | 状态 | type | 内容 |
|------|------|------|------|
| BRIDGE-01-ROSTER-SCHEMA | superseded-by-D024 | docs | 旧 markdown-only ROSTER schema 被 Hub `BridgeMemberState` / `bridge` API 覆盖；不直接认领，必要时拆为 HUB-CONTRACTS/HUB-CONSOLE 子任务 |
| BRIDGE-02-PRINTABLE-V0 | superseded-by-D024 | design | 旧纯 markdown 打印模板暂不推进；若需要纸面检查单，后续作为 Hub 输出视图单独设计 |
| BRIDGE-03-READONLY-VIEWER | superseded-by-D024 | design | 旧只读 viewer 被 Hub 控制台覆盖；不再从 v0.3 UI 改造 |
| BRIDGE-04-WORKLOAD-VISIBILITY | superseded-by-D024 | design | 核心边界保留为 Hub BridgeState：只显示任务阻塞和求助，不显示人与人产能排名 |
| BRIDGE-05-RESEARCH-POOL | superseded-by-D024 | design | 待研究池/接棒与 Hub Bridge / Trail / 周报重叠，后续需在 Hub 信息模型内重评 |

## P2 — Legacy Trail 候选（被 Hub 覆盖，待重评）

| 任务 | 状态 | type | 内容 |
|------|------|------|------|
| TRAIL-01-VIEWER-DESIGN | superseded-by-D024 | design | Trail viewer 等 Hub event/archive/artifact 原料足够后重评，不再以 `.debug-archive ≥ 20` 作为唯一启动条件 |
| TRAIL-02-AUTO-WEAVE | superseded-by-D024 | design | 自动织摘要保留为 Hub Trail 能力位，暂不直接认领 |
| TRAIL-03-V03-UI-RETIRE | frozen | design | v0.3 UI 已冻结，不再规划改造为 Trail viewer |
| TRAIL-04-WEEKLY-SUMMARY | superseded-by-D024 | design | 周报能力保留，但输入源扩展为 Hub event/archive/artifact/git/飞书后再设计 |

## 已冻结（pre-pivot，不再认领）

- TECH-01..10 全部完成 → 冻结于 v0.3
- AIREADY-02..10：部分完成；剩余不再推进
- REALAI-05..09：等真实 provider key smoke；不再推进
- CODECTX-01..09：bundle CLI / repo connector；不再推进
- DEP-08：release update / rollback verify；不再推进
- DATA-01..07：服务器路径 backup/restore 复验；不再推进
- UI-GATE-06、UI-* 系列：不再推进
- CORE-07..09、SEARCH-05..06：不再推进
- 历史详情见 `docs/archive/v0.3-pivot/backlog.md`。
- 仅当 v0.3 出致命安全 / 数据破坏问题时再开补丁任务。

## Decision-needed

- 战队服务器 Git 中枢：Forgejo / Gitea / bare git 取舍，真实部署另开审批任务。
- Hermes / 小龙虾 / Claude Code / **openclaw** adapter：真实接入方式、权限和运行边界需用户提供。**openclaw 澄清（用户 2026-06-12）= Hermes 类 AI/命令 adapter，归 mock-first adapter 轨，≠ D-020/D-021 否决的 `openclaw-lark` 飞书协议桥（协议错位）**。
- `ARTIFACT-VERSION-SEMANTICS`（图纸版本语义）/ `REMOTE-ACCESS-DEPLOY`（远程部署=LAN+隧道方案与鉴权）：见 D-036 + 数据河 build 轨；细化待用户线下。
- `GITHUB-TO-LOCAL`（程序代码 GitHub→本地 Forgejo 迁移）= 用户 2026-06-12 **考虑中**，未决（D-038）。无论迁不迁，TeamHub 只消费 git 的 `gitCommit` 信号、不改 git 唯一真相（G2）。
- `PULL-CLOUD-CODE`（定期 pull 云端代码/EDA 到本地备份）= 用户 2026-06-12 **考虑中**，未决（D-038，与电路 EDA 云端引用相关）。
- **I0 人名读端点（bug 巡检 2026-06-18 复核）**：dep-graph `ownerLabel`=「谁负责哪个模块」用户拍板**保留**（属协作信息/找谁对接，非监视，化解 AGENTS §5 ownerId/ownerLabel 张力的展示侧）；Overview「成员状态面板」（逐人 idle/working/blocked/offline 广播）用户拍板**暂时隐藏**（与「不抓摸鱼」冲突 + 旧脚手架），console 已移除该 section。**残留**：`GET /api/bridge/members` 端点 + `BridgeMemberStateSchema` 保留但已无消费方——**部署前若不恢复应一并移除/收口**（仍是公开读端点，fixture-only 暂无真 PII）。
- `LOGIN-PERMISSION-UI`（**未来考虑**，用户 2026-06-18）：加登录界面以区分不同人的能力/权限并**显著标明**。是「成员面板」恢复的前置与上位设计——有了身份/权限边界后，逐人信息才有合规的受众路由（关联挂起的 D-033 受众路由）。未立项、待用户排期。

## 当前不做

- 不为 v0.3 加新功能、不重构、不 polish。
- 不做完整 RBAC / 多租户 / 大型项目管理系统——治理是轻量（三层角色 + 可配置组织树 + 无硬截止，C3）。
- 不做人与人比较的产能排名 / 绩效统计——任何角色含老师都不得见（C2 + 反监视 A1）。任务阻塞可见（"这个任务卡了 3 天需要人帮"）≠ 产能排名（"张三比李四干得多"），前者允许。
- 不在飞书与系统之间双写（路线 A，G2）；不设硬截止 deadline，只发轻提醒（G4）。
- 不做 RAG / embedding / 炼丹。
- 不抢占服务器 80 端口；不升级系统 Node；不读 / 搜索 / 提交真实 API key。
- 不依赖学校战队配合作为产品验证。
