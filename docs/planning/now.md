# Now

> 唯一当前战况源。Team Hub 方向已由 D-024 覆盖旧 markdown-only pivot。pre-pivot 历史快照 → `docs/archive/v0.3-pivot/`。

```yaml
mode: collab_design
stage: 2026-06-14 KB-CORE 战队知识库·核心已落地（frontier#1 done，D-044，§6.B continuous-build 连续构建 U1~U6b 各自 verify+单独 commit+push 45bbeaf→226e838）：移植 Probe_Flash IssueCard→…→ArchiveDocument 调试闭环 Zod 链(kb.ts，去 repoSnapshot/保留三字段)+rankSimilarIssues 相似检索纯函数(kb-similar.ts)+buildCloseoutFromIssue/deriveKnowledgeNodeFromIssue 结案派生(kb-closeout.ts)+kbStore 收窄独立 KbStore(兑现 base 收口刀对抗核实)+InMemoryKbStore+GET /api/kb/similar(A4 note)+POST /api/kb/closeout(InMemoryGovStore.closeoutKbNode 写实现 I0 安全)。4-opus 对抗核实(wf_fc3f1282-bbf，231K token)裁 ship/mustFix=0。设计+落地说明=docs/design/kb-core.md(触发表/死表基线/findability/护栏)。老实定位：录入交互未接通(等 Hermes 统一触点)、不宣称已解 C1。前序 base 两刀(首刀 GET /api/dep-graph + 收口刀 GovStore 写白名单+kbStore/invStore 扩展点+SqliteGovStore stub)done；D-043 构建纪律双轨化(§6.0 共享底座+§6.A 串行/§6.B 连续)。verify：hub-contracts 41 测/hub-server 28 测/git diff --check/skills-sync 全过。下一步=frontier#1 PM-BOARD-DESIGN(项目计划表，写侧从零，承接 GovStore 录入簇实现)。权威=decisions.md D-044/D-043/D-042/D-041 + AGENTS §6 + docs/design/{kb-core,three-pillar-feasibility}.md。
stage_goal: 以 D-039 + plan file noble-soaring-gem.md + AGENTS.md 为事实源，演进留地基、AI 退出治理（治理只做人读说明视图、大三/学长判断），推进战队内部协作工具三支柱：① 战队知识库（规范+资料+调试归档+跨赛季沉淀，复用 growth.ts KnowledgeNode + 移植 Probe_Flash IssueCard→Archive 闭环）② 项目计划表（D-041：任务为核心·全员可见·依赖图+卡住必带原因·无甘特·不按人天数；复用 Task/Dep/Need 补 due/优先级 + 依赖录入）③ 库存/BOM（P1，自保鲜护栏）；共享底座（持久层 + real CRUD 路由）先行、一次三根受益。设计北极星=比死表省事/用着就更新(派生优先)/AI 只当仓管·转译不下判断/人在环/小作坊轻量。D-041 构建定调：中心实体=任务（围任务转不围人转）/视图解耦（项目进度 vs 个人成长共享任务底座）/“项目”=标签/先地基后视图/“和人关系”三堆判定尺（事·物=安全｜找谁对接=安全止于找谁｜谁快谁慢=人治封存）。治理 AI 派生整簇（D-032~035）挂起、想法不丢，复活触发=未来确认要 AI 参与治理判断。AI 每轮默认读 AGENTS.md + now.md + agent-state.json + git 状态，backlog/decisions/roadmap/设计文档按条件读取
current_task: PM-BOARD-DESIGN  # KB-CORE done(D-044)后顺推 PM。已落 PM 后端录入簇+读视图：createTask/createDependency(clamp active)/createNeed(clamp open) 写实现 + POST /api/tasks·dependencies·needs + GET /api/tasks 读视图（hub-server verify 36 测）。用户拍板 Q1=confirmedBy 作 ActorRef 内部凭证(永不经读视图暴露/排名)、Q2=本轮后端录入簇+读视图(console UI 下一轮)。在途：opus 对抗核实 PM 录入簇(涉 I0) → PM 设计文档+ADR。console PM 看板 UI 留下一轮
frontier:                                # base 两刀 + KB-CORE done → 推进到 PM；KB-LARK(hardblock LARK-BIN-PROBE)/INV/Hermes 后置；治理派生(GOV-MEMBER-STATUS-DERIVE)仍挂起
  - PM-BOARD-DESIGN                      # frontier#1 项目计划表(D-041 定调/D-042 收口)：任务为核心·全员可见·依赖图+状态+缺口+分工，卡住必带原因=结构键(在等哪个上游任务/组/Need)·无甘特·不按人。D-042：删 Member.status/freeIdle 展示通道(取最新版 D-041)；confirmedBy=timestamp 非 memberId；blockedBy 走 Dependency 边派生不在 Task 上另存(G2)；dueDate 本轮不引入(违 G4)，priority 改 criticalChain 派生。承接 base 收口刀：实现 GovStore 录入簇 createTask/createDependency/createNeed(当前 throw 后置)、DependencyDraft/NeedDraft 的 status 写实现期校验/clamp 初始态；人治视图封存(D-041 7③)。读侧资产齐(toDepGraphView/DAG 页)，写侧从零(console 零 mutation 基础设施)
# P1：INV-BOM-DESIGN(库存/BOM，自保鲜护栏=等 AI 读出车图核数/算余量再做，绝不再造静态表 P13)+飞书 Bitable·sheets 读写+修 lark-cli bin bug；P2：资料/代码批量整理(AI 安全车道)、给老师项目级汇报
# 挂起(D-039 AI 退治理，spec 留、复活触发=未来要 AI 参与治理判断)：GOV-MEMBER-STATUS-DERIVE / GOV-RULES-LAYER-DESIGN + D-032~035 治理派生整簇(GovernanceCue/silence 分河/give-floor/k-anon/audience 路由/阈值派生) + 自动派活 + freeIdle·双写债
blocked: []
open_for_decision:                       # ARCH-PATH(D-028)/提醒(D-026后续)/资源(D-029)/idle三态+静默(D-032)/受众路由(D-033) 已拍；SCHED-WINDOW/INVITED 排班可视化细项随 D-039 治理挂起(见 decisions.md D-029)；以下待用户线下细化
  - ARTIFACT-VERSION-SEMANTICS           # 图纸版本语义：谁 bump / 自动 vs 手动 / 当前权威版指针 / 撞坏回退 / 按车分支（D-036 数据河，别做完整 PLM）
  - REMOTE-ACCESS-DEPLOY                 # 远程部署=实验室 LAN+隧道方案与鉴权（D-036，§8 审批门后，独立基础设施轨）
  - GITHUB-TO-LOCAL                      # 程序代码 GitHub→本地 Forgejo 迁移=考虑中（D-038，2026-06-12）；TeamHub 只消费 gitCommit 信号、不改 git 唯一真相
  - PULL-CLOUD-CODE                      # 定期 pull 云端代码/EDA 到本地备份=考虑中（D-038，与电路 EDA 云端引用相关）
post_pivot_registry:
  - SKILL-PROTOCOL-V1                    # 已落地草稿；作为治理触点层 skill 契约底座保留
  - BRIDGE-01-ROSTER-SCHEMA              # 模型并入治理 Task/progress；数据载体被 D-026 路线 A 反转（系统库做真相）
  - TRAIL-01-VIEWER-DESIGN               # 等治理 event/archive/artifact 原料足够后再设计
frozen:
  - ProbeFlash-v0.3.0                    # 代码已删(git 历史保留)；致命补丁走 git revert
```

## 当前任务

_无。HUB-COMPOSE-SMOKE 已闭环：Docker CLI/Compose 可用后，修复 Hub 镜像 runtime 依赖打包问题并跑通 `scripts/verify-hub-compose.sh`，已完成 Hub + Postgres build/up、health/API/static console smoke 与自动清理。下一步按 §6 双轨从 frontier 选候选（Claude Code 走 §6.B continuous-build 连续构建 / 弱工具走 §6.A atomic-task 串行）。_

## 架构定位（D-026 立魂 → D-037 回中）

四层架构 + 路线 A 详见 `AGENTS.md §1` 与 D-026/D-037（不在此重复）。规则协调域是新增核心；已建 Hub 壳子（hub-server/contracts/console/Compose）作为触点/集成 + 展示底座保留。深设计见 `docs/design/team-hub-concept.md`（canonical）。

**产品定义（D-026 立魂 → D-037 回中）**：定位从”运维 / 观测控制台”→”制度化进度治理系统”(D-026)→ **协作中枢：CASE 工具 + 团队交流中心 + 战队数据库**(D-037，给学长减负 / 给学弟指引 / 项目同步进度表)。系统是大脑 / 飞书是脸、不双写、无硬截止只轻推、**人键只回本人当帮助、第三方只见结构键（核心不变式 I0）**、给被卡的人正名而非抓摸鱼、给新人安全网。**D-039 第一轮落地细化（2026-06-13）**：演进留地基 + **AI 退出治理**（治理降为人读说明、大三/学长判断）；产品 = 战队内部协作工具三支柱（知识库 / 项管看板 / 库存-BOM）；治理 AI 派生挂起、想法不丢（见 `decisions.md` D-039 + backlog "挂起" 段）。事实源 `docs/design/team-hub-concept.md`（涉及产品形态 / 领域模型 / 中央视图 / 飞书·Git 边界时优先读）。

## 阻塞 / 待拍板

- ~~架构走法（D-026 开放项）~~：**已于 2026-06-11 拍定（D-028）治理为主轴**——治理实体进 hub-contracts 核心域（common/governance/growth/attribution），成长轴落同包独立文件域；已落地。
- ~~提醒可见范围/送达模型~~：**2026-06-10 拍定 + D-037 收窄**（私聊本人、升级的是事不是人、AI 起草不发送/建议不判定/检索不评价；**D-037：人键提醒只回本人 + AI 建议、不上报队长，问责上移废除**）——见 `decisions.md` D-026 后续 + D-037。
- **真实外部 adapter**：Hermes / 小龙虾 / Claude Code 真实接入需要用户提供运行方式与权限；AI 当前只能做 mock-first 适配设计。
- **真实服务器写入**：Forgejo/Gitea/bare git 部署、SSH、systemd、80/443、真实数据迁移均需用户白天审批后再做。

## 已冻结

- ProbeFlash v0.3 代码（原 apps/desktop、apps/server、dev-start.sh、release 流程）：已于 2026-06-09 删除；完整代码留 git 历史，精华见 `docs/archive/v0.3-closeout/PROBEFLASH-V03-ESSENCE.md`；致命补丁走 `git revert`。
- pre-pivot backlog 全部任务（TECH-* / AIREADY-* / REALAI-* / CODECTX-* / DEP-* / DATA-* / UI-* / CORE-* / SEARCH-*）：不再认领；详细见 `docs/archive/v0.3-pivot/backlog.md`。
- **原 BRIDGE / TRAIL markdown-only 候选**：已被 D-024 Team Hub 架构覆盖，后续只作为 Hub BridgeState / Trail 能力重评，不按旧任务直接认领。

## 安全边界（pivot 后仍生效）

- 不动 v0.3 server / SQLite / API（致命补丁除外）。
- AI / Skill / Hub adapter 不读 / 打印密钥（`.env` / `*key*` / `*secret*`）。
- 真实 Hermes / 小龙虾 / Claude Code / 飞书 / Git forge smoke 由用户线下配置；AI 只做 mock-first 与只读诊断。
- 不在未审批情况下写真实服务器、SSH、systemd、80/443 或迁移真实数据。

## 最近完成（详见 `git log`）

- 2026-06-14 KB-CORE 战队知识库·核心 (frontier#1 done, D-044) — §6.B continuous-build 连续构建 7 原子单元(U1~U6b，各自 verify+单独 commit+push `45bbeaf`→`226e838`)：① `kb.ts` 移植 Probe_Flash `IssueCard→InvestigationRecord→ErrorEntry→ArchiveDocument` Zod 链(保留 normalizedSummary/relatedFiles/relatedCommits·去 repoSnapshot·isoDateTime 统一·verbatimModuleSyntax) + `kbScenarioFixture`(跨赛季 CAN/3508/MicroROS) ② `kb-similar.ts` 移植 `rankSimilarIssues` 纯函数(逐字等价打分；findSimilarIssuesForIssue 的 StorageRepository IO 不移植) ③ `kb-closeout.ts` 移植 `buildCloseoutFromIssue`(now/id/errorCode opts 注入保持纯) + 新增 `deriveKnowledgeNodeFromIssue` ④ kbStore 类型 `GovStore`→独立 `KbStore`(兑现 base 收口刀对抗核实 deferToNextKnife：IssueCard 不在 GovernanceSnapshot)+`InMemoryKbStore` ⑤ `GET /api/kb/similar`(症状→top-N，A4 护栏 `note` 焊进响应) ⑥ `POST /api/kb/closeout` + `InMemoryGovStore.closeoutKbNode` 写实现(I0 安全：补 id/createdAt clock 注入·克隆 knowledgeNodes 不污染 fixture·无人维度·errorCode clock+issue.id 确定性派生·缺 rootCause→422 不伪造完成)。**4-opus 对抗核实**(`wf_fc3f1282-bbf`，231K token：3 lens[移植保真+TS/宪法 §5/路由·Store 集成]→1 综合)逐条 grep+typecheck+test 实证裁 **ship、mustFix=0**(3 nit 均诚实标注或顺手收口 U6b)。设计+落地说明=`docs/design/kb-core.md`(触发表/死表基线/findability/护栏)。**老实定位**：录入交互未接通(等 Hermes 统一触点)、不宣称已解 C1。验证：hub-contracts verify:all 41 测/hub-server verify:all 28 测/git diff --check/skills-sync 全过。

- 2026-06-14 D-043 构建纪律双轨化（宪法）— 化解"atomic-task 串行 STOP 是全员硬律、拖累 Claude Code workflow"的张力（甲方：还用弱工具→必须双轨、要物理隔离但怕漂移）。**`AGENTS §6` 重写为双轨三段**：§6.0 共享底座（工具无关单一源，吸收 completion gate + 提交授权 + M1 候选池闭口 / M2 DoD 谓词 / M3 误提交自检 + DoD 对照表）+ §6.A 串行轨（无编排能力工具 Codex/OpenCode：一次一个→STOP→重入）+ §6.B 连续/编排轨（具 workflow 能力如 Claude Code：拆原子单元喂 workflow 连续构建·不强制 STOP·每单元仍各自验证+单独 commit·小改动直接做不强起 workflow）。**分档按能力**(非工具名)。**物理隔离两 skill**：`atomic-task` 收窄为 §6.A 串行（M1/M2/M3/DoD 表外移引用 §6.0）+ 新建 `continuous-build` §6.B（引用 §6.0、与 atomic-task 互不依赖→不漂移）。`workflow-evolution.md` 标 superseded-by D-043（当年无 workflow 故保留 STOP 的旧立场被现实推翻）。Explore 全仓扫交叉引用定改动面。纯 docs/planning/skills、零代码。验证：git diff --check + now.md yaml + agent-state json + verify-skills-sync（新/改 skill 镜像）+ grep 无悬挂引用。

- 2026-06-13 HUB-SERVER-GOV-SCAFFOLD base 收口刀 (frontier#1 done, D-042 决策 5①) — 化解"四次重建底座"违 C3：① `gov-store.ts` GovStore 加写方法白名单签名 `createTask/createDependency/createNeed/closeoutKbNode`（draft 入参 = `Omit<Entity, server 生成字段>` 派生，**仅签名、实现后置=throw**，C3 不一把梭不实现写入簇/路由）+ reserved `InvStore` 接口（INV 唯一需扩 schema 的根，PartStock 本刀不建）② `server.ts BuildHubServerOptions` 加 `kbStore?: GovStore`/`invStore?: InvStore` 扩展点（KB 复用同快照不扩 interface）③ 新增 `SqliteGovStore` 持久化切换合约 stub（同 GovStore 接口全 throw not-implemented，证 InMemory→SQLite 不必一次性重建）④ `InMemoryGovStore` 写方法 throw "实现后置"（读路径 getSnapshot 不变）。**workflow 实现 → 4-opus 对抗核实**(run `wf_fe26249b-4a1`，190K token：3 lens[ts 健全/宪法 C2·G2·I0·C3/sqlite·INV·KB 三方可扩展不重建]→1 综合)裁 **ship、mustFix=0**：宪法四闸接口层全守(白名单无 memberId 横比/无 setTaskBlockedBy 双写/closeoutKbNode 不引入人维度/A1 缺口归组)、ts 健全(Omit draft 正确·InvStore weak-type 拒乱注入·throw stub 返回类型相容)、sqlite/INV 扩展真成立。核实抓出我注释 2 处过度声称(KB `/api/kb/similar` 语料 IssueCard 不在快照、kbStore 类型过早收窄)已修注释为诚实标注(守 §10)，对应实现转 deferToNextKnife(承接 KB-CORE/PM/部署刀，已记 backlog + frontier)。验证：hub-server verify:all 18 测(+4 新 scaffold)/hub-contracts verify:all 29 测零回归/git diff --check/skills-sync/now.md yaml/agent-state json 全过。

- 2026-06-13 D-042 需求分析(闸门)+需求可行性分析+构建定基调 — 20-agent 闸门式 workflow(`wf_0ef0d4cc-4c8`，1.26M token：5 分析器需求闸门[宪法=opus]→opus 裁定→5 haiku 实证→4 sonnet 评估→4 opus 对抗核实→1 opus 综合)。**需求分析闸门 proceed/0 阻断**(14 条遗留全 major/minor)；可行性裁定 base/kb/pm=conditional、INV 经甲方决策改写。甲方五条定基调：①**冲突取最新版**(D-041 优先→PM 删 Member.status/freeIdle 展示通道) ②**Hermes/openclaw=统一触点能力·最后做·先搭壳子**(新需求=项目需具备调用 hermes 能力) ③**库存不冻结·留着排最后·对话记账防死**+一次盘点建底+缺口汇报+"大概账"定位 ④**base 补收口刀**(GovStore 写方法白名单+扩展点) ⑤**KB 拆 CORE/LARK、PM 结构键、dueDate 不引入**。分析记录=`docs/design/three-pillar-feasibility.md`(D-042)。对抗核实抓出初稿 3 处幻觉(8 GET 一把梭/INV 不存在的 DoD/PM 改名方案)已纠正。纯 docs/planning。验证：git diff --check + now.md yaml + agent-state json + verify:all 零回归。

- 2026-06-13 D-041 三支柱构建前设计定调 — 甲方设计对话拍板：**中心实体=任务**（系统围任务转不围人转；澄清主键焦虑=每实体各有简单 id、无联合主键，真问题是“围着什么转”=任务）；**②项管看板→“项目计划表”**（全员可见·依赖图+卡住必带原因·无甘特·不按人天数，推翻上一轮“只管理者看”）；**视图解耦**（项目进度 vs 个人成长 D-027 只共享任务底座·互不依赖·成长轴后置）；**“项目”=标签**（不纠结几个项目）；**先地基后视图**（任务+谁负责+谁依赖谁先行，甘特/按人天数/可见性细分皆后置且改动便宜）；**“和人关系”三堆判定尺**（事·物=安全｜找谁对接=安全止于找谁｜谁快谁慢·在不在干活=人治封存）。细化 D-039/D-040、推翻 D-037 可见性草案、确认 D-027 解耦后置。纯 docs/planning（decisions D-041 + now + agent-state + concept §10 + backlog PM 行）。验证：git diff --check + now.md yaml + agent-state json + skills-sync。

- 更早条目（**HUB-SERVER-GOV-SCAFFOLD 首刀** GET /api/dep-graph(D-040)、**D-040** 三支柱需求设计分析(14-agent)+破冰序 base→kb→pm→inv+首任务收敛 GET /api/dep-graph、**D-039** AI 退出治理+演进留地基+三支柱(知识库/项管/库存)+知识根合并+死表头号约束、**D-038** 目标结构最终确认(真相分域/飞书纯被动脸/图纸按组分治/只自建四样)、**D-037** 定位回中(CASE+交流+数据库)+核心不变式 I0+silence 纯自指、**D-036** 数据河 build 轨方向 + **D-035** give-floor+修正测量四段 + **D-034** 数据生命线分组化(silence 按组分河) + **D-033** 受众路由/角色模型(captainMemberId/leadMemberId/observerMemberIds) + **D-032** 治理提示层 GovernanceCue 统一 + Member.status 全派生 + 私下 silence（**D-037 收窄为纯自指**）、**D-031** 概念调研 9 agent + frontier 重排（数据生命线命门比录入更深）、**GOV-C4-FIX**(`17316cc`) 修两处 C4 破口 + 锚定测、**D-030** 文档瘦身 −46%、GOV-SCHED-MODEL/**D-029** 差异化在场排班 + `derivePresenceSchedule`、GOV-DATAMODEL-VIZ-ARCHPATH/**D-028** 治理为主轴 + 依赖链归因视图、GOV-REMIND-AXIS-DECIDE/**D-027** 成长轴 + 提醒模型、PF-V03-CLEANUP / HUB-COMPOSE-SMOKE 等）见 `git log` 与 `decisions.md`——已裁剪到 5 条（AGENTS §6）。
