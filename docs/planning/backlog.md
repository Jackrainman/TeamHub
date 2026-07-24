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
| GOV-REFRAME-DOCS | done | docs | 已落地 2026-06-09；D-026 + 设计宪法 C/G/A 三层重构 + AGENTS §1/§4/§5 + README + roadmap + now + backlog + concept 骨架 + 下游引用迁移；见 `now.md` 最近完成 |
| GOV-CONCEPT-REWRITE | pending | design | 概念文档完整重写（§6-§8 细化到已落地 schema）；身份段已随 D-037 回中（协作中枢：CASE+交流中心+数据库）；§10/§12 锚点已随 D-028/D-037 回填，余下深写待做 |
| GOV-DATA-MODEL-DESIGN | done | design | 已落地 2026-06-11（D-028）；`apps/hub-contracts` 新增 `common/governance/growth/attribution`（Season/Project/Group/Member/Task/有向 Dependency/Need/TaskProgressSignal/BlockAttribution/DepGraph 视图 + `deriveBlockAttributions`/`toDepGraphView`）+ 真实场景 fixtures + 11 项归因单测；`verify:all` 全过；设计见 `docs/design/gov-data-model.md` |
| GOV-RULES-LAYER-DESIGN | **挂起 (D-039)** | design | **挂起**（治理 AI 派生；复活触发=未来确认要 AI 参与治理判断）。原设计：规则/协调层：卡点/过载/缺口/沉默判定；进度派生信号阈值（commit 频率 / check-in 形态 / 沉默天数）。注：MVP 已落地结构性"被卡 vs 摸鱼"判别（attribution.ts）；**D-037：silence 等人键信号只回本人 + AI 建议、不上报管理者（I0），结构信号才给协调者**；本任务做完整阈值/沉默检测 |
| GOV-VIZ-DAG-DESIGN | done | design | 已落地 2026-06-11（D-028）；`apps/hub-console`"依赖链·阻塞归因"视图（`@xyflow/react`，blocked-idle 斜纹+锁/free-idle 虚线/gap/关键链 高亮，被卡去学中性入口）+ DepGraph 视图契约 + mock 由 `toDepGraphView` 派生；`verify:all` + preview 走查通过；设计见 `docs/design/gov-viz-dag.md` |
| GOV-SCHED-MODEL-DESIGN | done | design | 已落地 2026-06-11（**D-029**，差异化在场排班=杀手锏立项）；`apps/hub-contracts` 新增 `SharedResource`/`ResourceSession`/`PresenceRecommendation`（governance.ts）+ `derivePresenceSchedule` 纯函数（schedule.ts）+ 锚点场景 + 车撞坏 down 变体 fixtures + 12 项排班单测；持有组在场 / live 上游随叫 / 被卡去学 / 资源 down 整片去学 / 无关组沉默，输出无 memberId 维度（反排名）；`verify:all` 全过 26 测；设计见 `docs/design/gov-oncall-schedule.md` |
| GOV-SCHED-VIZ-DESIGN | **组键 wiring 部分解封 (D-069)** / AI 判断仍挂起 | design | **D-069（2026-06-18）部分解封**：组键「谁该在场」活页面 + `derivePresenceSchedule` 接出已立项为 `SCHED-WIRE-EXISTING`（见上「P1 — 差异化排班」段，A1 组级均衡、无 memberId）。**仍挂起的是 AI 判断那一半**（自动派活 / AI 排候选人 = D-041 决策 7③ 人治封存，复活触发=未来确认要 AI 参与治理判断，与 GOV-RULES-LAYER/GOV-MEMBER-STATUS-DERIVE 同组）。spec=`gov-oncall-schedule.md` 保留 |
| GOV-REPORT-DESIGN | pending | design | 给老师的项目级自动汇报（不含个人比较，C2/A2）|
| GOV-LARK-DERIVE-DESIGN | pending | design | 触点层：飞书动作→状态派生映射（@ / 卡片 / 一键 check-in）+ 提醒送达（提醒模型已拍定：私聊本人、起草不发送、升级的是事不是人，见 D-037 / archive「D-026 后续」）；复用 Lark 三包 |
| HUB-SERVER-GOV-SCAFFOLD | 首刀 + 收口刀 done / 写入簇实现 pending (**D-039 共享底座**) | code | **D-039 重定位为三支柱共享底座**：持久层（现全 mock）+ real CRUD 路由骨架（知识库/项管/库存 的 `GET/POST /api/...`）+ `now=server clock` 注入——所有真实数据流的物理出入口，**做一次三根受益**。**首刀已落地（2026-06-13）**：`GET /api/dep-graph` + `GovStore`/`InMemoryGovStore`(seed)/`Clock` 注入解 real 模式 404。**收口刀已落地（2026-06-13，frontier#1 done）**：`GovStore` 加写方法白名单签名（`createTask`/`createDependency`/`createNeed`/`closeoutKbNode`，draft 入参 = Omit 派生、仅签名实现后置=throw）+ `BuildHubServerOptions` 加 `kbStore?: GovStore`/`invStore?: InvStore` 扩展点 + 持久化切换合约 `SqliteGovStore` stub（同接口全 throw not-implemented），化解"四次重建底座"违 C3；4-opus 对抗核实裁 ship（C2/G2/I0/C3 接口层全守、ts 健全、sqlite/INV 三方可扩展不重建）。**后续承接（对抗核实 deferToNextKnife）**：① 写入簇实现 + real CRUD 路由（PM/KB-CORE 落地各自补 body 解析 `options.kbStore ?? store`）② **KB 相似检索语料 IssueCard 不在 GovernanceSnapshot 内 → KB-CORE 落地需把 `kbStore` 类型从 GovStore 收窄为独立 KbStore（加 getIssueCards 读口，对称 InvStore 占位；仅触该字段、不动 store/路由签名、PM 不受影响）**；结案派生 KnowledgeNode 这半复用同快照成立 ③ confirmedBy 写实现记 {source,at} 不存裸 memberId 历史（守 I0）④ DependencyDraft/NeedDraft 的 status 写实现期校验/clamp 初始态 ⑤ SqliteGovStore 接 better-sqlite3/drizzle（待部署服务器审批）⑥ presence/drizzle |
| GOV-MEMBER-STATUS-DERIVE | **挂起 (D-039)** | code | **挂起**（治理 AI 派生，AI 退治理；复活触发=未来确认要 AI 参与治理判断；freeIdle/双写债一并冻此）。原设计：`Member.status` 全派生（Task 真相、禁手写、杀与 Task.status 双写 G2）+ 三态 uncovered/blocked/capacityFreed + 私下 silence（**D-037：只回本人 + AI 建议、不上报管理者 I0**）→ 收成 `GovernanceCue`；spec=`docs/archive/suspended-specs/{gov-cue-layer,gov-role-visibility}.md`（挂起·D-037 收窄）；落地须读 group.kind 分河（D-034 降级）+ give-floor（D-035）+ parity 测试 + **修 freeIdle 语义债（uncovered/真闲拆分、前瞻"可接任务"框架、复核 freeIdleCount/标签）+ Member.status 双写债（fixtures 手填却标 derived）** |
| GOV-DEP-INTAKE-DESIGN | **已并入 PM-BOARD-DESIGN (D-042)** | design | （依赖录入并入项目计划表那一根，勿单独认领）**DAG 数据命门**：队长布置任务那一下顺手连依赖 + AI 预填建议依赖 / Need 的一屏录入交互（页面状态 + API mock）；目标 = DAG 录入即长出、不额外打卡（C1 低录入 / G2 不双写）；用锚点场景（视觉A采集→电控B调底盘→机械C装臂→电路D配合）当样例；真实写路径 `POST /api/tasks` + `POST /api/deps` 后置 mock-first（待服务器审批）。无此项则归因 / 排班 / 知识树全在 fixtures 上演 |
| ARCH-PATH-DECISION | done | design | 已于 2026-06-11 拍定（**D-028**）：治理为主轴——治理实体进 hub-contracts 核心域（common/governance/growth/attribution），hub-\* 壳子降为触点/展示底座，成长轴落同包独立文件域 |
| REMIND-MODEL-DECISION | done | design | 已于 2026-06-10 拍定；提醒=队长轮询自动化、私聊本人、升级的是事不是人、AI 起草不发送/建议不判定/检索不评价；见 `docs/archive/decisions-archive.md`「D-026 后续」 |

## P0 — 三支柱（D-039 第一轮落地，演进留地基 / AI 不碰治理）

> 三根全 P0（**D-040 破冰序 `base → kb → pm → inv`**，**D-042 定基调**：base 补收口刀、KB 拆 CORE/LARK、PM 删 Member.status+结构键、INV 留着排最后对话记账防死、Hermes 最后接）。frontier 顺序：**三支柱读写全 done（KB-CORE D-044 / PM D-045 / 读视图 D-046 / KB 闭环 D-047 / 写侧表单 D-048 / 设置页 D-049 / KB 导入 D-050，2026-06-14）→ 下一批待用户排期：AUDIT-FIXES（部署前必修 7 条）/ CONSOLE-COPY-HUMANIZE / INV 第三支柱 / 部署上线**（KB-LARK/Hermes 后置）。设计北极星：比死掉的表格更省事 ｜ 用着就更新（派生优先）｜ AI 只当仓管·转译不下判断 ｜ 人在环 ｜ 小作坊轻量。共享底座 = `HUB-SERVER-GOV-SCAFFOLD`（持久层 + real CRUD 路由），任一根先做都先过它。详见 `docs/design/three-pillar-feasibility.md`。

| 任务 | 状态 | type | 内容 |
|------|------|------|------|
| KB-CORE-DESIGN | **done (2026-06-14, D-044)** | design | **战队知识库·核心**已落地（§6.B 连续构建 U1~U6b + 4-opus 对抗核实 ship/mustFix=0）：移植 `IssueCard→…→ArchiveDocument` 闭环到 `kb.ts`（保留三字段 / 去 repoSnapshot / verbatimModuleSyntax）+ `rankSimilarIssues`(kb-similar.ts) + `GET /api/kb/similar`(A4 note) + `buildCloseoutFromIssue`+`deriveKnowledgeNodeFromIssue`(kb-closeout.ts) + `POST /api/kb/closeout`（结案派生 KnowledgeNode 持久，`InMemoryGovStore.closeoutKbNode` 实现 I0 安全）+ kbStore 收窄独立 `KbStore`（兑现 base 收口刀对抗核实）。设计+落地说明=`docs/design/kb-core.md`（触发表/死表基线/findability/护栏）。verify：hub-contracts 41 测 / hub-server 28 测。**后续**：录入交互随 Hermes 统一触点 / IssueCard↔Task+TaskKnowledgeTag 随 PM / console KB 页 / 真实持久层待审批 |
| KB-LARK-DESIGN | pending (P0, **hardblock LARK-BIN-PROBE**, D-042 拆) | design | **战队知识库·飞书层**（拉飞书 wiki·drive 资料、规范入口 findability）：依赖 `LARK-BIN-PROBE` 实测定 bin/method 名后才进 `boundary.ts` 白名单。当前飞书通道零实现（白名单仅 `im.v1.message.create`），故拆出后置；纯本地 KB-CORE 不依赖它、可先行 |
| PM-BOARD-DESIGN | **done：后端 (D-045) + console 读视图 (D-046) + 写侧表单 (D-048) 全落地，2026-06-14** | design | **项目计划表**（D-041 定调）。**后端录入簇+读视图**（§6.B + 2-opus 对抗核实 ship）：`createTask`/`createDependency`(clamp active)/`createNeed`(clamp open+claimedByMemberId=null A2 反派单) + `POST /api/tasks`·`/api/dependencies`·`/api/needs` + `GET /api/tasks`。**console 写侧表单 (D-048)**：`PmCreatePanel` 段控三表单（布置任务/连依赖/暴露需求·依赖需求走 live 任务下拉·成功 invalidate 看板·自edge 守卫）+ 冷启动空板引导；2-lens 对抗核实 wf_af4c88df-309 ship/i0Clean/mustFix=0。**I0 读写边界（用户 Q1）**：confirmedBy=ActorRef 内部凭证，只收集/POST/回建边本人，**第三方读视图/UI 零渲染**（SECRET 探针实证守住）；blockedBy 走 Dependency 边 `toDepGraphView` 派生(G2)；dueDate 不引入(G4)；ownerId 仅「谁负责」(C2)。设计+落地=`docs/design/pm-board.md`。**后续（非 frontier）**：依赖录入 AI 预填（GOV-DEP-INTAKE 并入）/ criticalChain→priority 派生 / 真实 status 派生上游。人治视图（按人天数/甘特/空闲检测）封存（D-041 7③）|
| KB-IMPORT-PROBEFLASH | **done (D-050, 2026-06-14)** | code | **ProbeFlash `.debug-archive` 一次性导入**已落地：纯解析器 `src/import/parse-debug-archive.ts`(frontmatter/slug/历史日期/TAG_VOCAB/best-effort 抽段，一文件=一卡)+ 导入 CLI `src/import/import-debug-archive.ts`(组 IssueCard→canonical `buildCloseoutFromIssue` 注入历史时戳→`FileKbStore`，skip-existing 幂等，README 跳)+ `deriveErrorCode` 抽 `src/kb/error-code.ts` + `npm kb:import` 脚本。**独立 CLI 非走 POST /api/kb/closeout**(那条用当前钟丢历史)。C2/I0 无人维度·§10 不杜撰·G2 不双写。hub-server verify:all(65 测含 23 新)+6 档案实跑 5 导入+召回实证+3-lens 对抗核实 wf_a52195b7-44e ship(block 仅 DoD 已闭/H2 deferred)。真实语料写入=部署机 operator 跑(见 D-050 运行)。4 nit→`KB-IMPORT-FOLLOWUP` |
| KB-IMPORT-FOLLOWUP | **done (2026-06-20；nit ①② 收口，D-051 续)** | code | **D-051 独立二次对抗审计(wf_74dee37d-59b)硬化已收口**：除 D-050 的 nit ③④ 外，二审另抓 3 条真实正确性/§10 缺陷并修——**fileNameToSlug 撞 slug→静默丢档**(哈希后缀单射)、**toIsoDateTime 不查日历→整档 failed**(Date.UTC 反查)、**EISDIR 崩整批**(withFileTypes+isFile + readFile try/catch)；顺手收 SKIP_FILES 大小写(④)/extractSection `**`残留(③)/死代码/isCli 正则。+9 测、verify:all 绿。**nit ①② 已收口（2026-06-20）**：① IMPORT_FORCE 重导经核早已按确定主键 upsert（commit `732a2c9`）→ 幂等不膨胀，补回归测锁定；② `extractSection` 段内续行改空格接、仅段间 `；`（rawInput 全文不变、召回无损），补回归测。hub-server verify:all 绿（149 测）。详 decisions.md D-051 收口段 |
| INV-BOM-DESIGN | pending (P1；**07-15 D-086 修正**：对话记账判死作废"主力"定位，防死改"必要动作的副产品"；缺料双报警×赛场打标×粒度分级设计已出=`docs/design/inv-alert-redesign.md` DESIGN-DRAFT，实现不排期) | design | **库存/BOM**（低频但找一次要命）：零件台账（3508/达妙6220/备件/坏件/每车 BOM 用量余量）。**D-042 定位 = 不冻结·留着·排最后·重要**。防死机制：**对话记账（主力，靠 Hermes：说"坏了一个 3508"助手记一笔，依赖 `HUB-HERMES-ADAPTER`）+ 一次性盘点建底（起步，老师也要）+ 看图算量（增强，后续；本地大内存可兜底）**；新增 **缺口主动向用户汇报**；老实定位 = **"大概有什么/还有没有"非精确实时账**（静默拿走的漏认了）；**锁松一档**=不禁止做，但做时必须带对话记账低门槛入口、不许做成纯手敲死表。`PartStock/BomEntry/DamagedPart` 新建（confirmedBy=timestamp 守 I0、AI 草稿态 confirmedBy=null 守 C4、不回写 Bitable 守 G2）。归战队数据库家族（同机械图纸档案库 D-038）|
| LARK-BIN-PROBE | pending（跨根前置，D-040） | probe/fix | **lark bin 双语义债实测 + 统一修**（KB R5 拉飞书资料 / INV bitable 的前置）：`cli-bridge.ts:17,47` 调 `execa('lark', …)` 但 `:22` 报错写 `'lark-cli not found'`，KB/INV 设计修复方向相反、无法从代码判定。**实测由用户在 WSL2（100.78.202.84）跑**（那台是测试机、不默认 SSH）：`which lark && which lark-cli && lark --version`；bin 名错→改 execa 参数，否则→改 message。顺带可实测 `wiki.v1.documents.get` / `bitable…record.search` method 名（风险5）。详见 `docs/design/three-pillar-reqdesign.md` §4 |
| HUB-HERMES-ADAPTER | pending (**最后做**, D-042) | code/design | **统一触点能力：项目调用 Hermes/openclaw**（四层架构最上层，先搭壳子→最后接，一次接多根受益）。能力是真的（Hermes 已接通能调飞书 CLI），缺口在项目侧"去调用助手"的对接代码。接上后：库存**对话记账**（"坏了一个 3508"→助手记一笔同步表）+ 知识库随手沉淀 + 进度表随口更新 走同一条路。接时核 `LARK-BIN-PROBE` 细节、mock-first、§3/§8 审批门后。归 D-036 openclaw=Hermes 类 adapter 轨（≠ 否决的 openclaw-lark 协议桥）|

## P1 — Console 收尾 / UI 打磨（D-048 后，2026-06-14 立项；当轮只记录未实现）

> 用户 2026-06-14：humanizer-zh skill 已装（全局 `~/.claude/skills/humanizer-zh`，是去 AI 味改写指南）；下面两项**只先记录**、本轮不实现，等用户排期。完整执行细节见 plan `~/.claude/plans/git-humanizer-zh-skill-dapper-pearl.md` 第 2/3 步。

| 任务 | 状态 | type | 内容 |
|------|------|------|------|
| SELF-ITERATE-SKELETON-D053 | **done (2026-06-14；D-053；git diff --check + yaml 解析 + skills-sync 绿)** | skill | **自迭代外环 §6.C 落地** —— frontier+backlog 双重耗尽时查完成度→有 gap 合成大目标→materialize-before-action 物化进 backlog 再驱动（M1 逃生阀，不绕过闭口只合规往里加）。落 `.agents/skills/self-iterate/SKILL.md`（8 硬化步）+ `AGENTS §6.C`（单一源）+ `docs/planning/completion-model.yaml`（机器谓词完成度）。3-opus 设计+对抗红队 `wf_3845c9c0-aa2` 硬化：§5 宪法门（硬封挂起治理簇 D-032~035）/epic cap≤1/done 只认谓词重跑/anchor 守 M1。保守默认 `audited:false`→合成 propose-and-stop，人审 completion-model 一次后置 `true` 才自动驱动 |
| CONSOLE-LOWRISK-BATCH-D052 | **done (2026-06-14；三包 verify:all 绿；commit 8ab93cf/44b7fcc/8ea6579)** | code | **低风险收尾批（D-052 / 用户 Q4「直接连续跑」）** —— ① 版本跟随 package.json（status.ts createRequire + console mock 导入，诉求7）② 删 5 死导航占位 + unused 图标 + 5 nav.* 键 + Mock 文案白话化（"Mock 数据"→"演示数据"、"真实 API"→"真实数据"，诉求4 一刀 + 诉求8）③ 重复真相下沉 hub-contracts 单一源（deriveErrorCode / Health·SystemStatus / Create\*Request 三组跨包去重，石山重灾区②）。零行为变化、re-export 保路径 |
| CONSOLE-COPY-HUMANIZE | **done (2026-06-19；主体早随 D-058 做完，本轮 inventory 复核 6 串=5 已自然保留、仅 KB_SIMILAR_NOTE 1 串收口)** | chore | **清理用户可见文案的"AI 味/治理黑话"**，用 humanizer-zh 原则改写（保留真信息如"全员可见"，删口号+宪法代号 C2/I0/A1+度量黑话"词重合度/同因/派生/归组不归人"；**只改 value 不动 key**，zh/en 两处同步）。**剩余**约 6 处：`apps/hub-console/src/i18n/translations.ts` 的 `pm.create.title`(录入·全员可见的协作真相)/`pm.create.subtitle`(不记谁快谁慢、不排名)/`pm.field.needDescription`(归组不归人→建议「需要什么·按组」)/`kb.empty`/`kb.closeout.intro`/`kb.closeout.success.knowledge`(派生知识点)；后端可见串 `apps/hub-server/src/contracts.ts` `KB_SIMILAR_NOTE`(已下沉为 re-export，源在 server) + `apps/hub-contracts/src/kb-closeout.ts` `deriveKnowledgeNodeFromIssue` 的 `踩过的坑：` 前缀。**连带**：grep 改字面量的测试同步改；三包 verify:all |
| INTEGRATIONS-TO-SETTINGS | **done (2026-06-15, D-057)** | code | **「适配器」→「集成」并归设置页（Q1 拍板）** —— ① i18n 把残留 `overview.metric.adapters`/`overview.panel.adapters` 等面向用户的「适配器」标签改「集成」(zh+en)；② 设置页 `SettingsPage.tsx` 新增「集成 / Integrations」**只读**子节，复用总览 adapter 面板组件展示对接状态；③ 主页 Overview 精简——adapter 面板移除或降级为一行「去设置查看」，保留「最近事件」+ 系统指标。语义=连接社媒/外部应用（飞书/Hermes/git/未来 QQ 微信钉钉）。不引入真实触点接入（仍 mock-first） |
| DEPGRAPH-ENTRY-OVERLAY | **done (2026-06-15, D-056)** | code | **依赖图右上角录入浮层（Q2 拍板）** —— 依赖图升主舞台：右上角加「录入」按钮 → 弹**近全屏遮罩浮层 drawer**（背景遮罩、内容叠在依赖图之上，点空白/遮罩退回）承载 `PmCreatePanel`；依赖图原只调 getDepGraph，嵌入后补调 getTasks 填下拉；`onCreated` 同时 invalidate `tasks` + `dep-graph` 两 query 才即时重绘。互通：看板卡片加「在依赖图查看此节点」跳转。**I0 护栏**：依赖图节点 ownerLabel 降级到 DetailPanel（不在节点上常显），加「负责人≠进度快慢」说明 |
| DEPGRAPH-DRAG-CONNECT | **done (2026-06-14；Option A，用户拍板；hub-console verify:all 绿)** | code | **画布拖拽连线建依赖（Q3 拍板）** —— xyflow `onConnect`：拖源 handle(底)→目标 handle(顶) = 源阻塞目标。**已核实事实**(`wf_3845c9c0-aa2`)：`DepNode.id===Task.id`(可直传)；`createDependency({projectId:graph.projectId, fromTaskId:source(阻塞方), toTaskId:target(被阻), type:'blocks', source:'human', confirmedBy:合成 console actor 使边显红})`；只 invalidate `['dep-graph',source]` 自动重绘。**关键安全**：后端 POST /api/dependencies **零语义校验**(不拒自 edge/重边/成环，AUDIT H1 未修)——**前端 onConnect 必须客户端守 自 edge+重边+成环(`wouldCreateCycle` DFS)**，否则一条成环边让下次 getDepGraph 死循环卡死服务器。I0 已核：重绘走 toDepGraphView 不外露 confirmedBy/人维度。改面：`DepGraphPage.tsx`(nodesConnectable→true + onConnect + useMutation + 3 守卫 + 反馈条) + i18n 6 键。**已实现 (Option A，用户拍板)**：固定 type='blocks' + 非 null console confirmedBy → mutate → invalidate ['dep-graph'] 重布局；前端守 自edge/重边/成环(`wouldCreateCycle` DFS)；+i18n 6 键 + 反馈条。改 DepGraphPage.tsx/translations.ts/styles.css。**注**：后端 POST /dependencies 拒环仍是部署前必修(AUDIT-H1)，前端守卫是 demo 期止血不替代 |
| DEPGRAPH-AI-AUTODRAW | pending (P1, D-052 立项) | code | **AI 自动画大致 DAG + 人微调（Q2 新诉求）** —— 给一批任务/自然语言描述，AI（经 Hermes 触点或直接 LLM）产出**草拟依赖边**布到画布，人再拖拽增删微调（接 DEPGRAPH-DRAG-CONNECT）。AI 只**建议**不落库，人确认才写。依赖 Hermes 触点能力（后置）；可先做"给现有任务集建议缺失边"的轻版 |
| CONSOLE-SETTINGS-PAGE | **done (2026-06-14；verify:all 绿 + playwright 验收)** | code | **把侧栏灰占位「设置」做成真页面** `features/settings/SettingsPage.tsx`：收纳 数据源(real/mock，复用 App `source`/`setSource`)/语言(`useI18n` lang)/后端地址(`localStorage['teamhub.apiBase']` 覆盖 VITE_API_BASE + 重置)/关于(service·version·mode 取 `/api/system/status`)。接线：`ConsoleLayout` `ConsolePage` 加 `'settings'` + 给设置项 `page:'settings'`(**只解禁这一个**)；`App.tsx` 路由 + 下传 setSource；i18n settings.* 键 zh/en 同步。**用户定：适配器/事件/协作桥/git/图纸 这些灰占位先留着不动**，等定优先级/设计。赛季/项目切换器无后端、不做 |
| OOP-QUALITY-ROADMAP | **done (2026-06-22，批次 A+C1 `882fd56` / 批次 B SSOT `2fd6970` v0.7.5→0.7.6 / 补测 C2/C6/C7/C8 `21ea803` / C3/C4 抽纯模块 `c7d410f`)** | code | **OOP+代码质量审计路线图**（`3a26e9b` 立项：技术版+大白话版）落地四批次——死代码/抽函数/relay 跨窗修复/writeToken 测试 + GovernanceSnapshot SSOT 收口 + buildLanes/actorFromName 抽 sibling 纯模块+单测 + 补测试空洞；函数式内核刻意别 OOP 化 |
| VISUAL-POLISH-A-H | **done (2026-06-23~24，批次 A-H `54dcfa6`…`657f208`)** | code | **视觉打磨全批**：交互态/阴影分档/对比度/圆角/字重收口(A) / 缺失样式补齐(B) / 视觉层级配色(C) / 可访问性 resources-table th scope=col(E) / 文案去 AI 味 zh 破折号收口(F) + 暗色模式第三套主题(H，最后做、独立可回滚) |
| PLAYWRIGHT-HEALTHCHECK-CONSOLIDATE | **done (2026-06-24，`2231903`/`b4ac8d8`)** | code | Playwright 体检收口进 `hub-console` 自身 devDep：`e2e/health-check.cjs` + `npm run health-check`，不再借 feiyue-test |
| AUDIT-FIXES-2026-06-14 | 必修 7 条 (D-059) + 2nd 批 (D-065) + **长尾 14 修 done (2026-06-19)** / 余 defer | code | **代码审计修复批次** —— 详单见 `docs/planning/code-audit-2026-06-14.md`（15-agent 对抗审计，confirmed 42：High 5 / Med 16 / Low 12 / Nit 3）。**部署前必修 7 条 done (D-059)**：H1 环守卫 / H2 写链重置 / H3 写鉴权+限流+bodyLimit / H4 status clamp / M6 剥 confirmedBy / H5+M11 compose / M9 单调序号。**2nd 批 done (D-065，2026-06-15 审计后 server 硬化)**：M8（invoke safeParse+400）/ L4（closeout 201）/ M13（构造器补全克隆 8 数组）/ M21（console 写侧测试）+ 预写部署代码（SystemStatus.mode enum / trustProxy / DEMO_SEED 空板）。**长尾 14 修 done (2026-06-19，wf_70fbdabb)**：M7(getSnapshot 浅拷贝)/M15(nodesDraggable)/M18(IssueCard .min)/M19(closeout .trim().min→400)/L1(单调 ID)/L5(static-console realpath)/L7(KbSimilar projectId)/L8(updatedAt isoDateTime)/L9(seq useRef)/L10(冷启动 defaults)/L12(.nvmrc+engines)/N1(adapter enum)/N2(tie-break Date.parse)/N3(sharedResourceBusy 测试+I0 护栏)；2-lens 双 ship/mustFix=0·三包 verify 绿(95/136/35)。**defer/已做**：M8/M9/M10/M16/M17主体/L4/L11 复核已落或不适用、M14(DepGraph selectedId 重接线无法确证无回归)·M17 .max 阈值未定·M20 workspace infra 侵入。**L6 已修（2026-07-03，`9676461`，见 GATEWAY-INBOUND-WHITELIST-L6）——42 条全清**。**仍 decision-needed**：bridge/members（用户拍暂留·部署前必处理）、ownerId/ownerLabel 设计张力（AGENTS §5 对账） |
| GATEWAY-INBOUND-WHITELIST-L6 | **done (2026-07-03, `9676461`)** | code | **AUDIT-FIXES L6 快赢**：`lark-gateway` 入站消息处理补租户/发送者白名单校验 + 限流，堵住无鉴权入站面；随 07-03 五件套落地（lark-gateway 29 测入 506 测全绿）——**42 条审计至此全清** |
| FORM-ADDLEG-INLINE-TASK | pending（07-02 表单审计遗留补记） | code | 接力画布「加一棒」表单支持**就地新建任务**（现只能从已有任务下拉选，任务不存在时须先去项目页建再回来）；随 SCHED-NARROW 一轮做或独立小刀 |
| UX-SCAN-BACKLOG-2026-07-12 | pending（B0 sonnet 9 页×4 主题扫描，交互/信息架构类分流） | code | **UX 扫描 backlog 项**（详单=`docs/design/design-language.md` §10 第二表）：我的视图空态自相矛盾+黑话；知识库首屏空壳无预览/角标；总览空态大卡压实据+统计卡异常态规则不一+黑话无解释；依赖图无图例+空态详情面板占 1/3 屏；学习方向电控卡过载破网格+缺口三处重复表达；图纸档案 artifact:// 裸链接+分组标题层级倒挂；日期输入原生 mm/dd/yyyy；库存追踪方式选择器散装；warm 主题区分度弱；面包屑与品牌名重复。视觉/结构类 8 条（U1–U8）已分流进 DESIGN-LANG B1–B5 批次顺带修复，不在此表 |

## P1 — 差异化排班 + 缺人方向 + 学习建议（D-069 立项，A1 组级均衡 + B1 窄义；不复活 D-039）

> 用户 2026-06-18 提「不同上课时间 + 平均排班 / 什么方向缺人 / AI 分析谁去学」。可行性 workflow `wf_6f935ab0-027` 拆三子诉求；用户两个 §5 产品方向决策拍**保守合宪项**：**A1**=排班只到组级（个人课表默认 private、自愿录入、明细永不外露，聚合成组级 headcount，输出无 memberId）、**B1**=AI 学习建议只到知识点 + 只私下回本人（不让 AI 把具体人配对缺口 = 不复活 D-039）。**积木已在**：`schedule.ts derivePresenceSchedule`（D-029，写完但**零运行时引用** = 第一次真正接出）、`growth.ts`（D-027 KnowledgeNode/MemberKnowledge/TaskKnowledgeTag）、`attribution.ts`（缺口归因）。详见 `decisions.md` D-069。**实现期纪律**：排班输出永远组键、严禁按人出场次数均衡器；缺口渲染绝不下钻到人；S3 窄义边界（让队长看匹配/AI 排序候选人即跨进广义 = 未经拍板复活），守住。

| 任务 | 状态 | type | 内容 |
|------|------|------|------|
| GAP-DIRECTION-SCHEMA | done (2026-06-18, 73373ca·f2ee082) | code | **S2 `DirectionGapSchema`**（governance.ts）：字段 id/groupId（或 skillKey）/neededSkills[]/evidenceTaskIds[]/evidenceNeedIds[]/severity enum/factStatement/detectedBy:`z.literal('derived')`/detectedAt，**逐字对齐 `OverloadSignalSchema` 的「组键 + factStatement + detectedBy:derived」范式，无 memberId/score/percent**，导出 type + `GroupGapsResponseSchema`；schema 注释写明「缺口归组不归人(A1)、neededSkills 不得反推具体人」。DoD = `grep -E "DirectionGapSchema|GroupGapsResponseSchema" apps/hub-contracts/src/governance.ts` 命中 + 该 schema 块 `grep -c memberId`=0 + hub-contracts `verify:all` exit 0 |
| GAP-DIRECTION-DERIVE | done (2026-06-18, 73373ca·f2ee082) | code | **S2 纯函数 `deriveDirectionGaps(snapshot, now): DirectionGap[]`**（attribution.ts 或新 direction-gaps.ts）：按 Need.providerGroupId/neededSkills 聚合 open+escalated 的 Need，融合 `deriveBlockAttributions` 的 rootBlockerGroupId 频次；输出组键、零 memberId 字段。DoD = 新增导出函数 + 单测覆盖（a) open+escalated 按组聚合 (b) 输出 JSON 序列化后 `grep` 不到 memberId/displayName/confirmedBy (c) 无缺口→空数组（沉默）；hub-contracts `verify:all` exit 0。依赖 GAP-DIRECTION-SCHEMA |
| GAP-DIRECTION-ROUTE-CONSOLE | done (2026-06-18, b35d1ae)；**页面将改造为「学习方向」（D-083，见 LEARN-DIRECTION-REDESIGN）** | code | **S2 `GET /api/group-gaps` + console 方向缺口面板**：server.ts 调 `deriveDirectionGaps` 返回 `GroupGapsResponseSchema`（活体 curl 实测返回组级缺口、JSON 内无人字段）；console 渲染「X 组有 N 个 open/escalated 缺口、缺 [neededSkills]」，文案中性、不出现人名/认领人，永不下钻到人。DoD = 路由注册 + 一次活体 curl JSON `grep` 无 memberId + 前后端 `verify:all` exit 0。依赖 GAP-DIRECTION-DERIVE/SCHEMA |
| SCHED-WIRE-EXISTING | **done (2026-06-19)** | code | **S1 把已有 `derivePresenceSchedule` 接出来（组键，零新维度）**：`GovStore` 白名单加 `createResourceSession`/`listResourceSessions`（InMemory/File/Sqlite 三实现，create 时 clamp source/confirmedBy 初始态）+ `POST /api/resource-sessions`（队长录占用窗口）+ `GET /api/schedule?windowLabel=`（调 derivePresenceSchedule，返回**已定义但未接路由的** `PresenceScheduleResponseSchema`）+ console `SchedulePage`（接 App.tsx ConsolePage 联合类型 + 导航）。**不引入任何 memberId 维度**。注意 H3 写端点鉴权（新写端点复用 onRequest 钩子口径）。DoD = 活体 curl POST 一个 session 后 GET /api/schedule 返回 present/onCall/free 组键建议 + 返回 JSON `grep` 不到 memberId/出勤计数 + 三包 `verify:all` exit 0 |
| SCHED-MEMBER-AVAILABILITY | **done (2026-06-19)；⚠D-083 停止扩建**（课表判伪需求：课表是贴给老师看的、实际"没课就来"；schema/派生保留、不再围绕课表建排班） | code | **S1「不同上课时间」→ 组级容量（护栏密集）**：新增 `MemberAvailabilitySchema`（memberId/recurringBusy:{dayOfWeek,startMin,endMin,label?}[]/visibility 默认 `private`\|`aggregateOnly`，注释写明「A2 类本人私有信号、明细永不进第三方视图、绝不跨窗按人累计，复用 `ResourceSession.invitedMemberIds` 单窗不累计边界」）+ 可选 `WindowDef` 锚定 ResourceSession（dayOfWeek/startMin/endMin，未锚定静默退化）+ 纯函数 `deriveGroupAvailability(...)→Map<(window,group),capacity>`（**仅输出组级 headcount 整数，无「谁有空/没空」**）+ `derivePresenceSchedule` 附加 optional `feasibility`(ample/tight/conflict，课表缺失或窗未锚定时为 null)。DoD = 单测 (a) feasibility 缺省时输出与现行 fixture **完全一致**（向后兼容）(b) 任何派生输出 JSON `grep` 不到个人课表明细/memberId 出勤次数 (c) 不存在「本周谁到场最少→多排谁」按人均摊逻辑；`verify:all` exit 0 |
| STUDY-NARROW-DERIVE | **纯函数 done (2026-06-19)** / 私下推本人渠道 gated on Hermes/lark | code | **S3 窄义 `deriveStudySuggestions(snapshot)`（不复活 D-039）**：join open `Need.neededSkills` × `KnowledgeNode`（按 name/groupId），输出组级「此知识点关联你组的 N 个 open 缺口」，**永不命名具体人**；私有变体仅产「本人 interested/learning 的方向有 open 缺口」且标 `audience=selfPrivate`。AI 侧仍只走现有 `TaskKnowledgeTag` source=aiSuggested→人 confirmedBy，不新增 AI 对人拍板路径。DoD = 单测 (a) 输出 `grep` 不到他人 memberId (b) 私有建议只含本人 memberId 且不进任何 group/captain 聚合视图 (c) 不读他人 private MemberKnowledge (d) 不产生「AI 指派某人去学」结构；`verify:all` exit 0。**私下推本人**（飞书/lark-cli 私聊）阻塞于 `HUB-HERMES-ADAPTER`/`LARK-BIN-PROBE`，渠道接通前只能本人页面被动展示 |
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
| HUB-ARTIFACT-ARCHIVE-V2 | **done (2026-06-18, D-071)** | code | **图纸档案重塑为机械/电路分组版本库**（用户 PM 视角讨论）：ArtifactRef 加 ownerGroup/season/robotCode/versionNo/subType 5 个 optional 字段；写契约 superRefine（电路必须 subType·机械必须无）；server 派生 versionNo（四键自增）/kind（电路驱动→firmware）/revision=`v${n}`（两纯函数 `artifact-version.ts`·前端预览复用）；console 表单重做（段控组/R1R2/子类型·赛季默认 guessSeason·机构新增-下拉·版本预览·两级分组+历史桶+「当前版」徽章·关联仓库仅电路驱动）。回退=最新即权威（派生·纯 append-only）·手动 pin 不做（违 C3）。程序组排除。workflow `wf_57c7f730-a0d` 2-lens 核实 i0Clean+抓 1 真 bug 收口·三包 verify:all 绿 62/115/11+本地 smoke。**后续**：真实文件上传=HUB-ARTIFACT-STORE-MECH(§8)/电路驱动命名规范(用户内部)/进阶版本语义见 ARTIFACT-VERSION-SEMANTICS |
| HUB-ARTIFACT-VERSION-DESIGN | pending（数据河，**进阶语义部分被 D-071 覆盖**） | design | 图纸/artifact 版本上服务器：扩展 `ArtifactRef`(schemas.ts:95-111) 加 kind + 版本链 + 按天/robotTarget 分类；**上传→`artifactUpload` 进度信号**（喂机械/电路河，D-034）；mock-first；字节进 volume/MinIO、不入 git/治理库（D-025 边界）。**D-038 按组分治**：机械=本地存储真相（见下行）、电路=云端引用（`kind:'eda'`+externalUrl 不存二进制）、程序=git。未决：版本语义（谁 bump / 当前权威版指针 / 撞坏回退 / 按车分支）、上传 UX 须比微信省事（C1）、存储/备份/审批（§3/§8）。别做完整 PLM（C3）|
| HUB-ARTIFACT-STORE-MECH | **本地卷版 done (2026-06-21, D-078)**（AI 看图算量增强仍 pending） | code/design | 机械组 SolidWorks 图纸**本地版本库**：战队服务器做唯一备份/版本管理真相。**已落地（本地卷版）**：`ArtifactRef.storedFile` 指针 + `POST /api/artifacts/:id/upload`（multipart 50MB·后缀白名单·先验存在避孤儿·H3 鉴权）+ `artifact-storage.ts` 存储接缝（字节进本地卷 `TEAMHUB_ARTIFACT_FILES_DIR`、D-025 不进 git、MinIO 留可换接口）+ `GovStore.setArtifactFile` 三实现 + console 上传/替换 UI（**文件 + 云端链接双存、行内双按钮**）+ 修部署 env-var（旧 `ARTIFACT_ROOT` 名字错→恒 404）。版本链/任意版本检索复用 D-071 versionNo。**仍 pending**：AI 看图算量（INV 看图提 BOM 增强，零代码）；MinIO 切换（接口已留）；上传 UX 进一步优化（C1）。**对照**：电路 EDA=云端引用、程序=git（迁本地 Forgejo 考虑中 `GITHUB-TO-LOCAL`）|
| HUB-GIT-ADAPTER-DESIGN | pending（数据河） | design | 程序薄封装 git（git 仍唯一真相 G2、不另造 VCS C3）：一键"保存版本"=底层 commit+push；git push→`gitCommit` 进度信号（喂程序河，D-034）；双重职责=降门槛 + 让程序 silence 信号可信。可并入既有 `HUB-GIT-FORGE-DESIGN`。未决：交互形态（Lark 卡片 / console 按钮）、鉴权 |
| GOV-REMOTE-ACCESS-DESIGN | pending（基础设施） | design | 在外访问 = 实验室 LAN + 隧道（用户 2026-06-12）：治理服务器在内网，备赛在外要隧道/反代才能直连；与 Hermes/openclaw adapter 轨**区分**（adapter=能力、隧道=访问路径）。真痛点=在外 Cue 送得到（飞书走 Lark 云本可达）+ 信号收得进。§8 审批门后，独立基础设施轨，别缠治理设计 |

## P0 — 成长轴 / 机器人知识图谱（与治理主干并列，D-027）

> 反监视正面纲领：把"系统给得比拿得多"（A3）做厚。三级=本周在做→知识树→兴趣方向；护栏=兴趣数据归本人 / 无可比进度不排名 / MVP 不做课程平台。

| 任务 | 状态 | type | 内容 |
|------|------|------|------|
| AXIS-KNOWLEDGE-MODEL-DESIGN | done | design | 已落地 2026-06-11（D-028）；`apps/hub-contracts/src/growth.ts`：`KnowledgeNode`（parentNodeId 默认 null 不预设本体）+ `MemberKnowledge`（visibility 默认 private、无 score/完成率）+ `TaskKnowledgeTag`（AI 建议+人审核）；护栏落在 schema 形状。展示/标注 MVP/digest 仍 pending |
| AXIS-TREE-VIZ-DESIGN | pending | design | 知识树展示（人的未来），与依赖图（项目的未来）双图对称；**无完成率/不排名/不跨人对比**（C2/A1）|
| AXIS-TASK-ANNOTATE-MVP | pending | design | MVP：布置任务时 AI 建议涉及知识点 + 挂资料/去年做过谁；树从标注长出，不预设本体（C3）|
| AXIS-LARK-DIGEST-DESIGN | pending | design | 飞书订阅 digest：相关知识/缺口/新资料定时私推；参考 feiyue `_conf_crawl_loop`（72h 爬+推）模式；复用 Lark 三包 |

## P0 — 模块化架构（D-081/D-082，2026-07 插件化重构阶段一 + 前置）

> 战队机器人垂直场景内核向其他协作场景（游戏工作室/软件开发等）复用。两阶段：阶段一（已完成）把机器人单体模块化成 CASE base + 机器人层、master 不动；阶段二从合并后 master 切 game-studio/software-dev 垂直包 worktree。设计北极星 `docs/design/modularization-feasibility.md`（已执行）；`core-plugin-architecture.md` PROPOSAL 已搁置归档 `docs/archive/`（D-083）。

| 任务 | 状态 | type | 内容 |
|------|------|------|------|
| MODULARIZATION-PHASE1 | **done (2026-07-03, D-081)** | code | feat/plugin-core 6 commit：剪两条跨域 import 环（growth→governance/pm-requests→relay）/ 装配契约 ModuleDescriptor+TenantConfig / `governance.ts` 拆 `pm-core.ts`+`schedule-infra.ts` / RobotTarget 枚举渗透改 optional（Task/Project）+ 迁移脚本 / fixtures 拆 per-module builder / verticals-robotics 词汇包成形。07-02 WSL 三包 verify:all 432 测全绿 + 迁移脚本真 gov.json 副本零丢失 + Playwright health-check 8 页 0 错等价 master + 真实未迁移 gov.json 新 schema 加载成功；07-03 FF 合并 master（c84f4a9）已 push |
| DAILY-PLAN-PRESETS | **done (2026-07-03, D-082, `51fb377`)** | code | 每车 defaultPreset 一键铺表格→微调→进泳道图，收口日期锚定空屏债；实现口径见 D-082（复用优先/PATCH preset 端点/批量建 session 原子端点/空状态路由）；随 07-03 五件套本机 506 测全绿验证（v0.10.3） |
| PHASE2-CONSOLE-ASSEMBLY | **done (2026-07-03, `aaa4209`)** | code | 阶段二前置收口：console 装配接线（TenantConfig 运行期过滤 + 词汇覆盖接线 + GET /api/groups）+ 非默认 TenantConfig 装配路径测试。⚠审计补正（2026-07-11）：`main.ts` 真实启动路径仍未传 tenantConfig（恒吃缺省全模块开），归 AUDIT-DEBT-2026-07 |
| MODULARIZATION-PHASE2 | **后置 (D-083)** | code | 游戏包推迟——先把 Robocon 垂直包写明白（D-083 §7）；届时再从 master 切 game-studio/software-dev 等垂直包 worktree |

## P0 — 防爆肝双主轴（D-083，2026-07-11 立项：路线 v4）

> 产品重定义（`docs/design/product-redefine-2026-07.md`，DECIDED）：给没有项目经理的小团队一个代打项目经理的工具，把赛前爆肝摊平到整个赛季。双主轴=防爆肝（倒排基准线）+防"大号 AI MCP"（学习方向）。宪法修正（G4 里程碑例外/I0 口径降级/AI 排人三红线）见设计稿 §3。按 v4 顺序认领。

| 任务 | 状态 | type | 内容 |
|------|------|------|------|
| BASELINE-DESIGN | **done (2026-07-11，`docs/design/baseline-design.md` DESIGN-LOCKED v1)** | design | 用户拍板五细节全落：战队级一条链+Task.milestoneId? 多对一；周粒度红黄绿（内置默认+手写覆盖）；验证门=大二提交证据(视频/图片，**字节走 artifact 本地卷、store 只存引用**)+大三验收留名；投资三维 horizon×value×timeAccumulation（调参=高时间积累；sim2real=未来×高价值重点保护）；**三版车节奏模板 v1**（V1 实验积累→G1 问题清单收敛拍板 V2→寒假 sim2real→G2 第二学期 1-2 周 V2 拼装→G3 期中前 V3 出车→G4 整车试跑→调参入场；版次可裁剪、门不消失）。⏳真实时间线用户赛后回填模板 v2 |
| TASK-POST-CLAIM | **done（✅2026-07-15 实现完成，`5a60344`..`bfa5d25`，v0.23.0→0.23.2）** | code | **挂单认领制**（口径=`docs/design/task-post-claim.md`）：Task 八字段留名簇（claimedAt/assignReason/assignedBy/partnerMemberId/crossClaimConfirmedBy/completedBy/reviewedBy/reviewNote）+ isBigTask/deriveTaskAcceptance/isPostedTask 结构尺派生 + 六窄写路由（claim/assign/partner/confirm-cross-claim/complete/review，actor 注入沿 IDENTITY-LITE，review 鉴权复用 isGateReviewer）+ console 挂单池视图/一键认领/搭档黄标/两档验收/我的视图空态文案/"看谁做过"事实卡搜索。真相=task-post-claim.md §9 |
| GATE-CHECKLIST-IOU | **done（✅2026-07-15 实现完成，`f2ceffb`..`86bcc3d`，v0.22.0→0.22.3）** | code | **门检查单与欠条**（口径=`docs/design/gate-checklist-iou.md`）：GateChecklistItem schema（挂门或自选到期日/origin=template\|iou/豁免=大三+强制理由+留名）+ gate pass 校验拦截（检查项全非 pending 才可过门）+ deriveChecklistDrift 派生（欠条到期红）+ console 门详情检查单卡+全局 30 秒"快记欠条"入口 + 模板 seed 留空等复盘导入。真相=`gate-checklist-iou.md` §7 |
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
| PIN-DEADLOCK-RECOVERY | pending（方案已录，待修复批） | code | **loopback 操作员可重置 PIN**：`DELETE /api/members/:id/pin` 对裸 socket=loopback 的请求豁免 superAdmin 判定（把 DEPLOY §7.1 手工清 gov.json 降级为一条 curl；宿主操作员本就能改文件，不引入新权限面）。注意：判裸 socket 不吃 TRUST_PROXY 转发头；inject 测试装置默认 127.0.0.1，既有 403 用例须显式非 loopback。DEPLOY §7.1 改三级（产品通道→loopback curl→手工清） |
| SETUP-WIZARD-ROSTER | pending（方案已录，待修复批） | code | **向导强制名册导入步 + 操作者即管理员**：身份模式正式安装首重启后进全屏初始化门（identity 且名册无 superAdmin 时出现，完成才进 app）：①导入名册 CSV（空名册豁免已有）②选「我是名册里的谁」+设 PIN → 前端静默免密登录 + `POST /api/setup/super-admin` → 已登录 superAdmin 态落 app。匿名/demo 路径不出现 |
| ROSTER-CSV-3COL | pending（**3 个开放问题待拍板**，见方案文档 §3 刀③） | code | **名册 CSV 5 列→3 列 + 组别可选择/可筛选**：现 姓名/年级/组/组长/验收人 → 减三列（候选 姓名/年级/组），组别改可筛选控件。待拍板：保留哪三列 / 组别选择形态（逐行下拉 or 统一选组）/ 组长任命动线 |
| PROGRAM-GROUP-ABSTRACT | **decision-needed**（摸底 agent 进行中，结果出来后讨论） | design | **程序组残留收口**：D-072 口径程序组非领任务单元（仅汇报视角），但用户导入选组时看到「程序」。用户意向=程序作抽象类（视觉/电控继承），少量场景显示或 DB 层筛选。待摸底报告（fixtures/契约/console 组选择器/server 组匹配/活文档陈旧表述）后定方案 |

## P0 — Team Hub 壳子（已落地，作为治理触点/集成 + 展示底座保留）

| 任务 | 状态 | type | 内容 |
|------|------|------|------|
| WORKFLOW-CONTEXT-SLIM-01 | done | docs | 已落地于 2026-06-06；新增 `docs/planning/agent-state.json` 作为机器可读派生索引，缩短 AI 默认读取链为 `AGENTS.md` + `now.md` + `agent-state.json` + git 状态；更新 `AGENTS.md` 与 `atomic-task` skill，明确 `backlog.md` / `decisions.md` / `roadmap.md` / Team Hub 设计文档按条件读取；DoD = `python3 -m json.tool docs/planning/agent-state.json` + `now.md` yaml 可解析 + `grep "agent-state.json" AGENTS.md .agents/skills/atomic-task/SKILL.md` + `git diff --check` + `verify:skills-sync` |
| HUB-CONCEPT-01 | done | design | 已落地于 2026-06-06；`docs/design/team-hub-concept.md`（status: stable，目标/非目标/总体架构/模块边界/业务模型 v0/API 草案/构建步骤/`xju-feiyue` 复用判断/技术栈分歧/工作流判断/后续候选队列）+ `decisions.md` D-024 + `.gitignore` 忽略 `xju-feiyue/` + planning/roadmap/AGENTS 同步；DoD = `test -f docs/design/team-hub-concept.md` + `grep "D-024" docs/planning/decisions.md` + `git diff --check` + `now.md` yaml 可解析 + `verify:skills-sync` |
| HUB-STACK-DECISION | done | design | 已落地于 2026-06-06；`docs/design/team-hub-stack-decision.md`（status: decided，Node/TypeScript 统一栈；新包 `apps/hub-server` / `apps/hub-console`；控制台借鉴 `xju-feiyue` 的 React/Vite/TanStack Query/Zod/shadcn 分层但业务重写；Docker Compose 硬要求；同镜像换 `.env`；生产 Postgres + SQLite fallback；artifact/log/firmware/rosbag 只做索引和 volume/外部存储边界；Forgejo 默认 Git 中枢；Ubuntu 20.04 过渡、22.04/24.04 公网建议；lark 三包接入；Hermes/小龙虾/Claude Code mock-first adapter）+ `decisions.md` D-025 + planning 同步；DoD = `test -f docs/design/team-hub-stack-decision.md` + `grep "D-025" docs/planning/decisions.md` + `git diff --check` + `now.md` yaml 可解析 + `verify:skills-sync` |
| HUB-BACKEND-SCAFFOLD | done | code | 已落地于 2026-06-07；新增 `apps/hub-server/` 独立 npm 包（Fastify + Zod + TypeScript strict），提供 `/health`、`/api/system/status`、`/api/adapters` mock endpoint、响应契约与 route contract tests；不接真实外部服务；DoD = `cd apps/hub-server && npm run verify:all` + `cd apps/desktop && npm run typecheck && npm run build && npm run verify:all` + `cd apps/server && npm run verify:deploy-prep` + `git diff --check` + `now.md` yaml 可解析 + `python3 -m json.tool docs/planning/agent-state.json` + `verify:skills-sync` |
| HUB-CONTRACTS-V0 | done | code | 已落地于 2026-06-07；新增 `apps/hub-contracts/` 共享契约包，导出 `HubEvent` / `AdapterDescriptor` / `BridgeMemberState` / `GitRepoRef` / `ArtifactRef` Zod schema、错误体与列表响应 schema、API contract fixtures；`apps/hub-server` 改用共享 adapter 契约与 fixtures；DoD = `cd apps/hub-contracts && npm run verify:all` + `cd apps/hub-server && npm run verify:all` + `cd apps/desktop && npm run typecheck && npm run build && npm run verify:all` + `cd apps/server && npm run verify:deploy-prep` + `git diff --check` + `now.md` yaml 可解析 + `python3 -m json.tool docs/planning/agent-state.json` + `verify:skills-sync` |
| HUB-CONSOLE-SCAFFOLD | done | code | 已落地于 2026-06-07；新增 `apps/hub-console/` 独立 npm 包（React/Vite/TypeScript、TanStack Query、lucide、共享契约 `file:../hub-contracts`），实现 API client、schema parse、mock/real backend split、总览页 mock 数据和运维控制台壳子；DoD = `cd apps/hub-console && npm run verify:all` + Playwright 桌面/移动截图 smoke + `cd apps/hub-contracts && npm run verify:all` + `cd apps/hub-server && npm run verify:all` + `cd apps/desktop && npm run typecheck && npm run build && npm run verify:all` + `cd apps/server && npm run verify:deploy-prep` + `git diff --check` + `now.md` yaml 可解析 + `python3 -m json.tool docs/planning/agent-state.json` + `verify:skills-sync` |
| HUB-CONSOLE-PREVIEW-SCRIPT | done | code | 已落地于 2026-06-07；新增 root `scripts/preview-hub-console.sh` 与 `apps/hub-console` `preview:local` 入口，默认 mock preview，支持 `TEAMHUB_API_BASE` 切 real API；DoD = `bash -n scripts/preview-hub-console.sh` + `cd apps/hub-console && npm run verify:all` + `cd apps/desktop && npm run verify:skills-sync` + `git diff --check` |
| HUB-COMPOSE-SCAFFOLD | done | code | 已落地于 2026-06-07；新增 root `Dockerfile`、`.dockerignore`、`compose.yaml` core stack（`hub + postgres`）、`deploy/teamhub.env.example` 与 `scripts/verify-hub-compose.sh`；Hub server 支持同镜像托管已构建控制台静态文件，并补齐控制台 real 模式需要的 mock-first `/api/events`、`/api/bridge/members`、`/api/git/repos`、`/api/artifacts`；未接真实公网、不写真实服务器。DoD 已完成：Hub 三包 verify、desktop/server/lark 三包既有 verify、非 Docker 本地 static/API smoke、compose yaml parse、脚本语法、生产依赖 audit 0 漏洞；Docker CLI/Compose 可用后，已修复 runtime 镜像缺少 `apps/hub-contracts` 生产依赖的问题，并通过 `scripts/verify-hub-compose.sh` 完成 Hub + Postgres build/up、health/API/static console smoke 与自动清理 |
| HUB-LARK-WIRE | done | code | 已落地于 2026-06-07；`apps/lark-gateway` 增加 `src/hub.ts`，把飞书消息归一化为 Hub `message.received` 事件，并在 `handleMessage` 中支持可选 Hub event sink；`apps/lark-toolkit` 增加 Hub adapter descriptor；`apps/pf-skills` 增加 Hub adapter descriptor 与 `skill.completed` 事件映射；三包均通过 `@teamhub/hub-contracts` schema 测试。mock-first，不执行真实飞书 smoke |
| HUB-ADAPTERS-MOCK | done | code | 已落地于 2026-06-07；`apps/hub-contracts` 新增 adapter health / capabilities / invoke request/response schema 与 fixtures；`apps/hub-server` 新增 Hermes / 小龙虾 / Claude Code mock AI adapter helpers，并暴露 `GET /api/adapters/:id/health`、`GET /api/adapters/:id/capabilities`、`POST /api/adapters/:id/invoke`；只返回 mock stub，不接真实凭证、不调用真实外部命令 |
| HUB-GIT-FORGE-DESIGN | pending（触点层） | design | 战队服务器 Git 中枢方案：Forgejo/Gitea/bare git 取舍、push/pull 工作流、artifact 不入 Git 策略、备份边界；D-026 后归触点/集成层，并入 Git 提交→进度派生（见 GOV-LARK-DERIVE / GOV-RULES-LAYER）；真实服务器操作另开任务审批 |

## P0 — Skill 自用闭环（备赛期窗口）

| 任务 | 状态 | type | 内容 |
|------|------|------|------|
| SKILL-01-DEBUG-CHECKLIST-V0_0_1 | done | skill | 已落地 v0.0.1 于 `f5df2bf`；DoD = SKILL.md 落地 + verify:skills-sync 通过（已闭环） |
| SKILL-02-DOGFOOD-NOTE | done | docs | 目录 + 模板已落地于 `f5df2bf`（`docs/dogfood/README.md`）；DoD = `test -f docs/dogfood/README.md`（已闭环）。"每次写 1-3 行"是行为非任务、"30 天后回看"是产品观察非工程谓词，按 M2 均不入原子任务 DoD |
| SKILL-03-PROMPT-ITERATION | pending（dogfood ≥ 30 天） | skill | 基于 dogfood 数据调 SKILL.md 的 prompt 模板；只动 SKILL.md，不动其他 |
| SKILL-04-PERSONAL-DAILY-SUMMARY | done | skill | 已落地 v0.0.1 于 `93dc7d0`；DoD = SKILL.md 落地 + verify:skills-sync 通过（已闭环） |
| SKILL-05-PRE-MATCH-CHECKLIST | done | skill | 已落地 v0.0.1 于 `9beb907`；DoD = SKILL.md 落地 + verify:skills-sync 通过（已闭环） |

## P0 — Skill 协议层（备赛期收敛）

| 任务 | 状态 | type | 内容 |
|------|------|------|------|
| SKILL-PROTOCOL-V1 | done | design | 已落地于 2026-05-24；`.agents/skills/PROTOCOL-v1.0.md`（协议本体 8 节）+ `docs/archive/skill-protocol-migration-gap.md`（3 个 active 业务 skill + 1 个流程类 skill 的迁移差距清单，3 个 skill 均评 B 级合规）+ `docs/design/D-023-skill-protocol-v1.md`（详细 ADR 草稿，status: draft）+ `decisions.md` D-023 聚合段；7 项验证全过含 `verify:skills-sync` exit 0；**不动**三个现有 SKILL.md（迁移留 SKILL-MIGRATION-V1-* 系列后续任务，待 D-023 升 DECIDED 后认领） |

## P0 — LARK 飞书接入（备赛期 stage_goal 之一）

| 任务 | 状态 | type | 内容 |
|------|------|------|------|
| LARK-02-CAPABILITY-MIRROR | done | research | 已落地于 2026-05-19；`docs/research/lark-api-capability.md` + `decisions.md` D-020；gemini 两份报告事实底座固化到工程仓库 |
| LARK-OSS-SCAN | done | research | 已落地于 2026-05-19；`docs/research/lark-oss-candidates.md` + decisions.md 追 D-020 后续结论；路径 A 最优基座 = `@larksuiteoapi/node-sdk`，路径 B ~250 行核心代码 |
| LARK-PATH-DECISION | done | docs | 用户已拍板（2026-05-19）路径 A（`@larksuiteoapi/node-sdk`），SDK 长期依赖 + Long Connection 模式 + "先接进去看看再优化"；decisions.md D-021 落终态 DECIDED |
| LARK-01-CONNECTOR-ARCH | done | design | 已落地于 2026-05-19；`docs/design/lark-connector.md` (status: draft) + decisions.md D-021 后续；Mock-first 设计，apps/lark-gateway/ 子包 7 模块，3 秒 ack 边界，4 字段 .env |
| LARK-03-MIN-INTEGRATION | done（代码部分） | code | 已落地于 2026-05-19；`apps/lark-gateway/` 子包（9 src + 3 test + 7 配置）；24/24 单测；typecheck/build/verify:all 全通；Mock-first 模式（claude/deepseek 抛错）；不引入 LLM SDK / 不调真实飞书 API。**真实飞书连通 smoke + 接入真实 LLM provider 留用户线下**（见 LARK-ONBOARD-GUIDE） |
| LARK-ONBOARD-GUIDE | done | docs | 已落地于 2026-05-19；`docs/research/lark-onboard-guide.md`（status: stable，11 节）；§0 前置自检 + §1-§3 飞书后台动作 + §4 .env 填写 + §5 本地 smoke 走查 + §6 可选接 LLM + §7 可选部署 + §8 排查 + §10 完成 checklist。**下一步全部在用户侧**（按 guide §0-§5 走通）；§1-§5 文字将在 LARK-CLI-05 改写为 lark-cli 路径（保留手填 fallback） |
| LARK-CLI-01 | done | code | 已落地于 2026-05-21（commit `e3e2069`）；`apps/lark-toolkit/` 子包（5 src + 4 test）；`boundary.route` 白名单（`im.v1.message.create` → sdk，其他 → cli）+ `cli-bridge` 懒检查 `lark --version` ≥ 1.x；13 单测全过；`@probeflash/lark-toolkit` |
| LARK-CLI-02 | done | code | 已落地于 2026-05-21（commit `ea41c74`）；`apps/pf-skills/` 子包（6 src + 3 test）；`createSkillDispatcher(cfg)` closure 捕获 mode + `dispatch(symptom)` 单参；mockChecklist 文案行为契约从 lark-gateway 迁移；9 单测全过；`@probeflash/pf-skills`，零运行时依赖 |
| LARK-CLI-03 | done | code | 已落地于 2026-05-21（commit `7c47f9a`）；`apps/lark-gateway/` 瘦身：新增 `ws-client.ts` + 删 `lark-client.ts` / `reply-sender.ts` / `skill-dispatcher.ts` + `message-handler.ts` 改 `Toolkit` + `SkillDispatcher` 注入 + `event-router.ts` 改 `buildEventDispatcher(cfg, toolkit, skills)` + `main.ts` 装配链 + `package.json` 加 `file:` 依赖；测试重写 10 + config 8 = 18/18 PASS；gateway src 9 → 7（net -175 行）；`verify:all` 三关 PASS |
| LARK-CLI-04 | done | docs | 已落地于 2026-05-21（commit `fef9e77`）；`decisions.md` 追 D-022 (DECIDED) + `docs/design/lark-connector.md` 重写 v2 (status: stable，三包架构 + createToolkit/createSkillDispatcher/buildEventDispatcher 接口契约 + §9 实现通道列) + `roadmap.md` §4 出站扩展通道标注 + `AGENTS.md` §2 lark-cli skills 命名预警 + §3 lark-cli auth boundary；git diff --check 干净 + frontmatter yaml 解析通过 |
| LARK-CLI-05 | done | docs | 已落地于 2026-05-21（commit `8b7bb5b`）；`docs/research/lark-onboard-guide.md` §0/§4/§5/§8/§10 改写加 lark-cli 路径并保留 fallback：§0 加 lark-cli 安装检查 + §4 拆 4.A (lark config init + lark auth login) 与 4.B (手填 fallback) 加二选一警告 + §5 拆 5.A/5.B/5.C + §8.5 加 lark-cli 排查 + §10 checklist 同步；DoD `grep "cp .env.example"` 仍命中 + `grep -c "lark config init\|lark auth login\|lark doctor"` = 8 + `git diff --check` 干净 + frontmatter yaml 解析通过 |
| LARK-CLI-06 | done | docs | 已落地于 2026-05-21（commit `4d5854a`）；`docs/research/lark-cli-dev-usage.md` 新建 (status: stable, 7 节：安装/鉴权/dev 自检/只读 API/写入审批/排查/与仓库关系/范围外) + `AGENTS.md` §7 Verify Matrix 加 lark-cli 接入行；DoD `test -f docs/research/lark-cli-dev-usage.md` + `grep "lark-cli 接入" AGENTS.md` 命中 + `git diff --check` 干净（exit 0） |

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
