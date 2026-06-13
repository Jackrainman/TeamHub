# Now

> 唯一当前战况源。Team Hub 方向已由 D-024 覆盖旧 markdown-only pivot。pre-pivot 历史快照 → `docs/archive/v0.3-pivot/`。

```yaml
mode: collab_design
stage: 2026-06-13 D-039 方向重新瞄准：第一轮 AI 退出治理(治理判断回归人/大三看「人读说明视图」、AI 不判定·派活·排名→反监视机器整套失去存在理由一并挂起)、演进留地基(schema/console/server/lark-toolkit/skills 复用，过度旋转的只是治理派生层)；产品=战队内部协作工具三支柱(知识库=规范+资料+调试归档/项管看板/库存-BOM 全 P0)；知识根合并(规范=最高频入口，建 KnowledgeNode+移植 Probe_Flash IssueCard→Archive 闭环)；死表格 P13(旧实验室资源表没人用+飞书多维表格失败=同 C1 死法→库存须等 AI 自保鲜读图核数/算余量再做 P1)；轻重缓急=共享底座(持久层+real CRUD,现 mock/404,一次三根受益)→P0 知识库/P0 看板→P1 库存→P2 整理/汇报→挂起治理派生。Probe_Flash 与 TeamHub 同源(已交付 IssueCard 闭环)。纯 docs/planning 草案待用户复核 commit。【前序 D-038 目标结构最终确认】拆飞书命门(lark-cli 146 scope ready)+两 workflow(对抗核实10/前例调研7)→真相分域边界(关系·派生·按组横比→本地、给人看的通知文档→飞书、图纸按组分治)、否决飞书 base 当业务真相(三透镜 G2双写+I0/C2横比+bitable无有向边)、飞书纯被动薄集成(@才答、~1天webhook+卡片、不碰Base/Task API、真相不入飞书、Hermes被动)、图纸按组分治(机械SolidWorks无云端→本地存储/版本管理 第4样自建,兑现D-034微信迁服务器、电路EDA云端引用、程序git当前GitHub迁本地Forgejo考虑中)、只自建四样(DAG引擎/阻塞归因负载/节点图全员+个人详情/机械图纸本地库)、DAG给所有人+个人详情弥补;前例佐证聊天当脸+本地后端成熟、全自建负价值(Huly)。pull云端代码+GitHub迁本地=考虑中。计划全文=~/.claude/plans。纯docs/planning未碰服务器。【前序 D-037 回中】用户触底反思"为让 silence 不像监视堆了 D-032~035 一整套去名机器=诊断它根上是监视形状"，拍板彻底改。定位从"制度化进度治理系统"→ CASE 工具 + 团队交流中心 + 战队数据库（给学长减负/给学弟指引/项目同步进度表）。核心不变式 I0=人键输出只回本人当帮助、第三方只见结构键。silence 收纯自指（只回本人+AI 建议、砍问责上移/管理者面）；开放问题"没派活+被卡+没主动接"=机会导向协调视图（管理者只看待派活+过载组+组级前瞻余力，不点个人）；A3 重述为纯给予；D-034 k-anon/保守铁律重机器降级为低风险自助提示；图纸轨重心移到战队数据库(archive-first,完成一版即传)。子 agent 审计证 D-032~036 几乎全 spec-only→本轮近纯文档：改 decisions(D-037 ADR)/AGENTS §1·§4·§5(顶置 I0)/gov-cue-layer/gov-role-visibility(大幅收窄)/team-hub-concept/gov-data-model(图纸档案)/planning。freeIdle 代码债记归 GOV-MEMBER-STATUS-DERIVE。未碰服务器、未碰真实数据
stage_goal: 以 D-039 + plan file noble-soaring-gem.md + AGENTS.md 为事实源，演进留地基、AI 退出治理（治理只做人读说明视图、大三/学长判断），推进战队内部协作工具三支柱：① 战队知识库（规范+资料+调试归档+跨赛季沉淀，复用 growth.ts KnowledgeNode + 移植 Probe_Flash IssueCard→Archive 闭环）② 项管看板（复用 Task/Dep/Need 补 due/优先级 + 看板·列表页 + 依赖录入）③ 库存/BOM（P1，自保鲜护栏）；共享底座（持久层 + real CRUD 路由）先行、一次三根受益。设计北极星=比死表省事/用着就更新(派生优先)/AI 只当仓管·转译不下判断/人在环/小作坊轻量。治理 AI 派生整簇（D-032~035）挂起、想法不丢，复活触发=未来确认要 AI 参与治理判断。AI 每轮默认读 AGENTS.md + now.md + agent-state.json + git 状态，backlog/decisions/roadmap/设计文档按条件读取
current_task: null  # D-039 方向文档草案落地（演进留地基/AI 退治理/三支柱轻重缓急），待用户复核后 commit；之后从 frontier 选共享底座或某支柱破冰
frontier:                                # D-039 重排：共享底座→P0 知识库→P0 项管看板；原 frontier#2 治理派生(GOV-MEMBER-STATUS-DERIVE)挂起
  - HUB-SERVER-GOV-SCAFFOLD              # D-039 共享底座：持久层 + real CRUD 路由(知识库/项管/库存 GET·POST /api/...) + now=server clock；现全 mock、real GET /api/dep-graph 404；做一次三根受益。原 GovernanceStore/派生语义随治理挂起，先服务 CRUD
  - KB-LIBRARY-DESIGN                    # P0 战队知识库(最高频痛点：仓库乱要统一规范)：规范入口+资料 findability+调试归档+跨赛季沉淀，一根「找得到的战队知识」；复用 growth.ts KnowledgeNode + 移植 Probe_Flash IssueCard→InvestigationRecord→ErrorEntry→Archive 闭环；写/浏览/搜索+拉飞书 wiki·drive。北极星=用着就沉淀，不做事后填总结
  - PM-BOARD-DESIGN                      # P0 项管看板(高强度+最省力)：复用 Task/Dep/Need 补 due/优先级+看板·列表页+依赖录入(并入原 GOV-DEP-INTAKE)；治理判断交人(大三/学长看 A 做完/B 忙疯自行协调)，AI 不派活·不排名
# P1：INV-BOM-DESIGN(库存/BOM，自保鲜护栏=等 AI 读出车图核数/算余量再做，绝不再造静态表 P13)+飞书 Bitable·sheets 读写+修 lark-cli bin bug；P2：资料/代码批量整理(AI 安全车道)、给老师项目级汇报
# 挂起(D-039 AI 退治理，spec 留、复活触发=未来要 AI 参与治理判断)：GOV-MEMBER-STATUS-DERIVE / GOV-RULES-LAYER-DESIGN + D-032~035 治理派生整簇(GovernanceCue/silence 分河/give-floor/k-anon/audience 路由/阈值派生) + 自动派活 + freeIdle·双写债
blocked: []
open_for_decision:                       # ARCH-PATH(D-028)/提醒(D-026后续)/资源(D-029)/idle三态+静默(D-032)/受众路由(D-033) 已拍；以下待用户线下细化
  - SCHED-WINDOW-GRANULARITY             # 窗口是否要精确钟点(startsAt/endsAt)，当前粗粒度 windowLabel + orderInWindow
  - SCHED-INVITED-MEMBER-DISPLAY         # 单窗 invitedMemberIds 在 UI 展示到什么程度（可操作 vs 不沉淀出勤档案）
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

_无。HUB-COMPOSE-SMOKE 已闭环：Docker CLI/Compose 可用后，修复 Hub 镜像 runtime 依赖打包问题并跑通 `scripts/verify-hub-compose.sh`，已完成 Hub + Postgres build/up、health/API/static console smoke 与自动清理。下一步需重新走 atomic-task，从 frontier 选择唯一候选。_

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

- 2026-06-13 D-039 方向重新瞄准 — 用户在"未确认/待补全"盘点中拍板：第一轮 **AI 退出治理**（治理判断回归人/大三看"人读说明视图"，AI 不判定·派活·排名 → 反监视机器整套失去存在理由、一并挂起）、**演进留地基**（schema/console/server/lark-toolkit/skills 复用，过度旋转的只是治理派生层）；产品 = **战队内部协作工具三支柱**（知识库 / 项管看板 / 库存-BOM，全 P0）；**知识根合并**（规范=最高频入口，建 KnowledgeNode + 移植 Probe_Flash IssueCard→Archive）；**死表格头号约束 P13**（旧资源表没人用=同飞书多维表格死法 C1 → 库存须等 AI 自保鲜再做 P1）。两路 Explore 证 Probe_Flash 与 TeamHub 同源、地基可复用、库存 greenfield、lark-toolkit 仅发消息。D-032~035 治理派生挂起（spec 留、复活触发=未来要 AI 参与治理判断）。纯 docs/planning 草案待复核。事实源=plan file `noble-soaring-gem.md`。验证：`git diff --check` + now.md yaml + agent-state json + `verify:all` 零回归。
- 2026-06-12 D-038 目标结构最终确认 — 拆开飞书命门(lark-cli 146 scope 已 ready)+两个 dynamic workflow(结构对抗核实 10 agent/公开前例调研 7 agent)：确认真相分域边界(关系·派生·按组横比→本地、给人看的通知文档→飞书、图纸按组分治)，**否决飞书 base 当业务真相**(三透镜 G2双写+I0/C2横比+bitable无有向边)；飞书纯被动薄集成(@才答、~1天webhook+卡片、不碰Base/Task API、真相不入飞书、Hermes被动)；**图纸按组分治**(机械SolidWorks无云端→本地服务器存储/版本管理 第4样自建,兑现D-034微信迁服务器、电路EDA云端引用、程序git当前GitHub迁本地Forgejo考虑中、pull云端代码考虑中)；**只自建四样**(DAG引擎/阻塞归因负载/节点图全员+个人详情页/机械图纸本地库)；DAG给所有人看+个人详情弥补。前例佐证聊天当脸+本地后端成熟、全自建负价值(Huly)。事实源=plan file(~/.claude/plans)+两 workflow。纯 docs/planning。验证：git diff --check + now.md yaml + agent-state json + skills-sync。
- 2026-06-12 D-037 产品定位回中 + 人键自指化（彻底去监视味）— 用户触底反思"为让 silence 不像监视堆了 D-032~035 一整套去名机器 = 诊断它根上是监视形状"，拍板彻底改：定位从"制度化进度治理系统"→ **CASE 工具 + 团队交流中心 + 战队数据库**（给学长减负 / 给学弟指引 / 项目同步进度表）；**核心不变式 I0** = 人键输出只回本人当帮助、第三方只见结构键；silence 纯自指（砍问责上移 / 管理者面）；开放问题"没派活+被卡+没主动接"= **机会导向协调视图**（管理者只看待派活 + 过载组 + 组级前瞻余力，不点人）；A3 重述纯给予；D-034 k-anon/保守铁律重机器降级；图纸轨重心移到战队数据库(archive-first)。子 agent 三路审计证 D-032~036 几乎全 spec-only → 本轮近纯文档：decisions(D-037 ADR) / AGENTS §1·§4·§5(顶置 I0) / gov-cue-layer / gov-role-visibility(大幅收窄) / team-hub-concept / gov-data-model(图纸档案) / planning。freeIdle 代码债记归 GOV-MEMBER-STATUS-DERIVE。纯 docs/planning、未碰服务器。验证：`git diff --check` + now.md yaml + agent-state json + skills-sync。
- 2026-06-12 D-036 数据河 build 轨方向 + 未决项登记 — 用户新语境（机械图纸微信传→上服务器、程序需版本管理但 git 难、openclaw/hermes 远连）的四问拍板：图纸上服务器**喂硬件进度信号**（artifactUpload）+ 程序**薄封装 git**（git 仍唯一真相 G2）+ openclaw=**Hermes 类 AI/命令 adapter**（mock-first 轨，≠ 否决的 openclaw-lark）+ 远程=**LAN+隧道**（独立基础设施轨 §8）。登记 P1–P12 pitfalls 避免重复探索。`backlog.md` 新增 HUB-ARTIFACT-VERSION-DESIGN / HUB-GIT-ADAPTER-DESIGN / GOV-REMOTE-ACCESS-DESIGN + openclaw 澄清；`now.md` 加 ARTIFACT-VERSION-SEMANTICS / REMOTE-ACCESS-DEPLOY。纯 docs/planning。验证：`git diff --check` + now.md yaml + agent-state json + skills-sync。
- 2026-06-12 D-035 化解层 give-floor + 修正测量第 4 段 — 3-agent 核实判"3b 整体后置给知识树"holds=false（代码证 `relatedKnowledgeFor` 从当前/被卡任务取知识，`capacityFreed` 的人 `currentTaskId→null` 无键可取 → 暴露成 idle 却零给予 = 破 A3、复活 freeIdle 污名）。决策：四段意图 `修正测量→暴露→问责→化解`；化解叉 3a 人力调度(治理) / 3b 自我成长(知识树整棵后置)；**give-floor**=capacityFreed 无过载组时从本人私有 `MemberKnowledge`(interested/learning) 平铺取 resourceLinks、**仅 taskOwnerPrivate**（tree-free，不等 D-027）；**暴露必带给予不变式**（发第三方的 surface 必配同主体 give Cue）守在单测。`gov-cue-layer.md` §4/§5/§7 同步。纯 docs/planning。验证：`git diff --check` + now.md yaml + agent-state json + skills-sync。
- 2026-06-12 D-034 数据生命线分组化 — silence 信号偏差的真正修法（C5 每组一条数据河）：3-agent 产品核实 REJECT「摸鱼可见」抓到信号源偏差是 schema 级 C2/A1/G5 破口（「零进展」只 commit/check-in、无 GroupKind 维度 → 程序 commit 不断、硬件物理活零 commit，同努力对硬件"静默"、冤枉 freshman 机械新生）。决策：机械/电路河=图纸版本上传（新 `ProgressSignalKind='artifactUpload'`）、程序河=git（薄封装降门槛）、兜底=自然 check-in（非打卡）；**保守铁律**=各河接入前非 program 组 git 缺失不触发 silence；presence 佐证（复用 `derivePresenceSchedule`）；`RulesConfig` 改 kind-keyed `silenceDays` + 新 `silenceCueCooldownDays`；parity 单测要求。`gov-cue-layer.md` §4/§5/§6 同步。纯 docs/planning。验证：`git diff --check` + now.md yaml + agent-state json + skills-sync。
- 更早条目（**D-033** 受众路由/角色模型(captainMemberId/leadMemberId/observerMemberIds) + **D-032** 治理提示层 GovernanceCue 统一 + Member.status 全派生 + 私下 silence（**D-037 收窄为纯自指**）、**D-031** 概念调研 9 agent + frontier 重排（数据生命线命门比录入更深）、**GOV-C4-FIX**(`17316cc`) 修两处 C4 破口 + 锚定测、**D-030** 文档瘦身 −46%、GOV-SCHED-MODEL/**D-029** 差异化在场排班 + `derivePresenceSchedule`、GOV-DATAMODEL-VIZ-ARCHPATH/**D-028** 治理为主轴 + 依赖链归因视图、GOV-REMIND-AXIS-DECIDE/**D-027** 成长轴 + 提醒模型、PF-V03-CLEANUP / HUB-COMPOSE-SMOKE 等）见 `git log` 与 `decisions.md`——已裁剪到 5 条（AGENTS §6）。
