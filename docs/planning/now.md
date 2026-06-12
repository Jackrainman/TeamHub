# Now

> 唯一当前战况源。Team Hub 方向已由 D-024 覆盖旧 markdown-only pivot。pre-pivot 历史快照 → `docs/archive/v0.3-pivot/`。

```yaml
mode: collab_design
stage: 2026-06-12 D-038 目标结构最终确认：拆飞书命门(lark-cli 146 scope ready)+两 workflow(对抗核实10/前例调研7)→真相分域边界(关系·派生·按组横比→本地、给人看的通知文档→飞书、图纸按组分治)、否决飞书 base 当业务真相(三透镜 G2双写+I0/C2横比+bitable无有向边)、飞书纯被动薄集成(@才答、~1天webhook+卡片、不碰Base/Task API、真相不入飞书、Hermes被动)、图纸按组分治(机械SolidWorks无云端→本地存储/版本管理 第4样自建,兑现D-034微信迁服务器、电路EDA云端引用、程序git当前GitHub迁本地Forgejo考虑中)、只自建四样(DAG引擎/阻塞归因负载/节点图全员+个人详情/机械图纸本地库)、DAG给所有人+个人详情弥补;前例佐证聊天当脸+本地后端成熟、全自建负价值(Huly)。pull云端代码+GitHub迁本地=考虑中。计划全文=~/.claude/plans。纯docs/planning未碰服务器。【前序 D-037 回中】用户触底反思"为让 silence 不像监视堆了 D-032~035 一整套去名机器=诊断它根上是监视形状"，拍板彻底改。定位从"制度化进度治理系统"→ CASE 工具 + 团队交流中心 + 战队数据库（给学长减负/给学弟指引/项目同步进度表）。核心不变式 I0=人键输出只回本人当帮助、第三方只见结构键。silence 收纯自指（只回本人+AI 建议、砍问责上移/管理者面）；开放问题"没派活+被卡+没主动接"=机会导向协调视图（管理者只看待派活+过载组+组级前瞻余力，不点个人）；A3 重述为纯给予；D-034 k-anon/保守铁律重机器降级为低风险自助提示；图纸轨重心移到战队数据库(archive-first,完成一版即传)。子 agent 审计证 D-032~036 几乎全 spec-only→本轮近纯文档：改 decisions(D-037 ADR)/AGENTS §1·§4·§5(顶置 I0)/gov-cue-layer/gov-role-visibility(大幅收窄)/team-hub-concept/gov-data-model(图纸档案)/planning。freeIdle 代码债记归 GOV-MEMBER-STATUS-DERIVE。未碰服务器、未碰真实数据
stage_goal: 以 D-026/D-027/D-028/D-029/D-037 + docs/design/team-hub-concept.md + AGENTS.md §1/§4/§5(I0) 为事实源，按四层架构推进数据真相层（项目/赛季·成员角色资历·组织树·任务依赖·Need·共享资源·图纸档案库）→ 规则协调层（被卡正名·缺口/过载暴露·给本人的自指帮助）→ 展示汇报层（机会导向协调视图·老师项目级汇报）→ 触点集成层，并行成长轴（知识树/订阅，D-027）；核心不变式 I0=人键只回本人、第三方只见结构键；AI 每轮默认读 AGENTS.md + now.md + agent-state.json + git 状态，backlog/decisions/roadmap/设计文档按条件读取
current_task: null  # D-037 文档已落地（定位回中+人键自指化）；frontier 顺序需在新 thesis 下重评（输入侧信号河 vs 拓扑录入 vs 补派生引擎），地基 HUB-SERVER-GOV-SCAFFOLD 仍建议先
frontier:                                # 顺序=D-038 确认地基→派生→录入不变；机械图纸本地库(HUB-ARTIFACT-STORE-MECH,第4样自建)置后；飞书被动 bot 在 GOV-DEP-INTAKE 前
  - HUB-SERVER-GOV-SCAFFOLD              # 可变内存 GovernanceStore + 协调路由骨架(/api/dep-graph 等) + now=server clock 注入 — 所有真实数据流的物理出入口；server.ts 现仅 broker fixtures 路由，real 模式 GET /api/dep-graph 直接 404
  - GOV-MEMBER-STATUS-DERIVE             # Member.status 全派生(Task 真相,禁手写,杀双写 G2) + 三态 uncovered/blocked/capacityFreed + 私下 silence(D-037 只回本人+AI 建议,砍问责上移) → 收成 GovernanceCue。spec：gov-cue-layer.md + gov-role-visibility.md(D-037 收窄)；落地须读 group.kind 分河(D-034 降级) + give-floor(D-035) + parity 测试 + 修 freeIdle 语义债(uncovered/真闲拆分,前瞻框架) + Member.status 双写债
  - GOV-DEP-INTAKE-DESIGN                # 依赖录入交互(队长顺手连依赖+AI预填) — 前两者落地后才有真实写入/读取出入口；D-031 由 top-1 降为 top-3
# 退出 top-3(仍 backlog)：GOV-RULES-LAYER-DESIGN(=GovernanceCue 生产者层,D-032/D-034/D-035 已给图纸：分河信号+四段意图+give-floor) / GOV-CONCEPT-REWRITE / GOV-SCHED-VIZ-DESIGN
# 新增 backlog(D-031 调研补漏)：OverloadSignal 派生 / Need open→escalated 转换 / LARK-CARD-CHANNEL+LarkMemberBinding(GOV-LARK-DERIVE 两件前置) — 三者 D-032 后均归入 GovernanceCue 生产者
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

**产品定义（D-026 立魂 → D-037 回中）**：定位从”运维 / 观测控制台”→”制度化进度治理系统”(D-026)→ **协作中枢：CASE 工具 + 团队交流中心 + 战队数据库**(D-037，给学长减负 / 给学弟指引 / 项目同步进度表)。系统是大脑 / 飞书是脸、不双写、无硬截止只轻推、**人键只回本人当帮助、第三方只见结构键（核心不变式 I0）**、给被卡的人正名而非抓摸鱼、给新人安全网。事实源 `docs/design/team-hub-concept.md`（涉及产品形态 / 领域模型 / 中央视图 / 飞书·Git 边界时优先读）。

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

- 2026-06-12 D-038 目标结构最终确认 — 拆开飞书命门(lark-cli 146 scope 已 ready)+两个 dynamic workflow(结构对抗核实 10 agent/公开前例调研 7 agent)：确认真相分域边界(关系·派生·按组横比→本地、给人看的通知文档→飞书、图纸按组分治)，**否决飞书 base 当业务真相**(三透镜 G2双写+I0/C2横比+bitable无有向边)；飞书纯被动薄集成(@才答、~1天webhook+卡片、不碰Base/Task API、真相不入飞书、Hermes被动)；**图纸按组分治**(机械SolidWorks无云端→本地服务器存储/版本管理 第4样自建,兑现D-034微信迁服务器、电路EDA云端引用、程序git当前GitHub迁本地Forgejo考虑中、pull云端代码考虑中)；**只自建四样**(DAG引擎/阻塞归因负载/节点图全员+个人详情页/机械图纸本地库)；DAG给所有人看+个人详情弥补。前例佐证聊天当脸+本地后端成熟、全自建负价值(Huly)。事实源=plan file(~/.claude/plans)+两 workflow。纯 docs/planning。验证：git diff --check + now.md yaml + agent-state json + skills-sync。
- 2026-06-12 D-037 产品定位回中 + 人键自指化（彻底去监视味）— 用户触底反思"为让 silence 不像监视堆了 D-032~035 一整套去名机器 = 诊断它根上是监视形状"，拍板彻底改：定位从"制度化进度治理系统"→ **CASE 工具 + 团队交流中心 + 战队数据库**（给学长减负 / 给学弟指引 / 项目同步进度表）；**核心不变式 I0** = 人键输出只回本人当帮助、第三方只见结构键；silence 纯自指（砍问责上移 / 管理者面）；开放问题"没派活+被卡+没主动接"= **机会导向协调视图**（管理者只看待派活 + 过载组 + 组级前瞻余力，不点人）；A3 重述纯给予；D-034 k-anon/保守铁律重机器降级；图纸轨重心移到战队数据库(archive-first)。子 agent 三路审计证 D-032~036 几乎全 spec-only → 本轮近纯文档：decisions(D-037 ADR) / AGENTS §1·§4·§5(顶置 I0) / gov-cue-layer / gov-role-visibility(大幅收窄) / team-hub-concept / gov-data-model(图纸档案) / planning。freeIdle 代码债记归 GOV-MEMBER-STATUS-DERIVE。纯 docs/planning、未碰服务器。验证：`git diff --check` + now.md yaml + agent-state json + skills-sync。
- 2026-06-12 D-036 数据河 build 轨方向 + 未决项登记 — 用户新语境（机械图纸微信传→上服务器、程序需版本管理但 git 难、openclaw/hermes 远连）的四问拍板：图纸上服务器**喂硬件进度信号**（artifactUpload）+ 程序**薄封装 git**（git 仍唯一真相 G2）+ openclaw=**Hermes 类 AI/命令 adapter**（mock-first 轨，≠ 否决的 openclaw-lark）+ 远程=**LAN+隧道**（独立基础设施轨 §8）。登记 P1–P12 pitfalls 避免重复探索。`backlog.md` 新增 HUB-ARTIFACT-VERSION-DESIGN / HUB-GIT-ADAPTER-DESIGN / GOV-REMOTE-ACCESS-DESIGN + openclaw 澄清；`now.md` 加 ARTIFACT-VERSION-SEMANTICS / REMOTE-ACCESS-DEPLOY。纯 docs/planning。验证：`git diff --check` + now.md yaml + agent-state json + skills-sync。
- 2026-06-12 D-035 化解层 give-floor + 修正测量第 4 段 — 3-agent 核实判"3b 整体后置给知识树"holds=false（代码证 `relatedKnowledgeFor` 从当前/被卡任务取知识，`capacityFreed` 的人 `currentTaskId→null` 无键可取 → 暴露成 idle 却零给予 = 破 A3、复活 freeIdle 污名）。决策：四段意图 `修正测量→暴露→问责→化解`；化解叉 3a 人力调度(治理) / 3b 自我成长(知识树整棵后置)；**give-floor**=capacityFreed 无过载组时从本人私有 `MemberKnowledge`(interested/learning) 平铺取 resourceLinks、**仅 taskOwnerPrivate**（tree-free，不等 D-027）；**暴露必带给予不变式**（发第三方的 surface 必配同主体 give Cue）守在单测。`gov-cue-layer.md` §4/§5/§7 同步。纯 docs/planning。验证：`git diff --check` + now.md yaml + agent-state json + skills-sync。
- 2026-06-12 D-034 数据生命线分组化 — silence 信号偏差的真正修法（C5 每组一条数据河）：3-agent 产品核实 REJECT「摸鱼可见」抓到信号源偏差是 schema 级 C2/A1/G5 破口（「零进展」只 commit/check-in、无 GroupKind 维度 → 程序 commit 不断、硬件物理活零 commit，同努力对硬件"静默"、冤枉 freshman 机械新生）。决策：机械/电路河=图纸版本上传（新 `ProgressSignalKind='artifactUpload'`）、程序河=git（薄封装降门槛）、兜底=自然 check-in（非打卡）；**保守铁律**=各河接入前非 program 组 git 缺失不触发 silence；presence 佐证（复用 `derivePresenceSchedule`）；`RulesConfig` 改 kind-keyed `silenceDays` + 新 `silenceCueCooldownDays`；parity 单测要求。`gov-cue-layer.md` §4/§5/§6 同步。纯 docs/planning。验证：`git diff --check` + now.md yaml + agent-state json + skills-sync。
- 更早条目（**D-033** 受众路由/角色模型(captainMemberId/leadMemberId/observerMemberIds) + **D-032** 治理提示层 GovernanceCue 统一 + Member.status 全派生 + 私下 silence（**D-037 收窄为纯自指**）、**D-031** 概念调研 9 agent + frontier 重排（数据生命线命门比录入更深）、**GOV-C4-FIX**(`17316cc`) 修两处 C4 破口 + 锚定测、**D-030** 文档瘦身 −46%、GOV-SCHED-MODEL/**D-029** 差异化在场排班 + `derivePresenceSchedule`、GOV-DATAMODEL-VIZ-ARCHPATH/**D-028** 治理为主轴 + 依赖链归因视图、GOV-REMIND-AXIS-DECIDE/**D-027** 成长轴 + 提醒模型、PF-V03-CLEANUP / HUB-COMPOSE-SMOKE 等）见 `git log` 与 `decisions.md`——已裁剪到 5 条（AGENTS §6）。
