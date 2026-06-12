# Now

> 唯一当前战况源。Team Hub 方向已由 D-024 覆盖旧 markdown-only pivot。pre-pivot 历史快照 → `docs/archive/v0.3-pivot/`。

```yaml
mode: governance_design
stage: 2026-06-12 D-033 ROLE-VISIBILITY / CUE-AUDIENCE-ROUTING 拍定（关闭 D-032 §3 OPEN）：role enum 不动；队长/老师=项目级指派（captainMemberId/observerMemberIds[]）、组长=Group.leadMemberId、superAdmin 收窄为配置非受众；audience 最终三值 taskOwnerPrivate/subjectGroupLead/teamCoordinator + 路由表 + 可见性双轴；silence 纯 pull + 问责上移（用户选 A）；两轮对抗审计必修（去名宽视图/factStatement 文本红线/老师 k-anon rollup/良基兜底/dedupe）。spec 落 docs/design/gov-role-visibility.md。本轮已落 D-034 数据生命线分组化（silence 按组数据河：机械/电路=图纸版本上传 artifactUpload、程序=git 薄封装、兜底=自然 check-in；保守铁律=非 program 组 git 缺失不触发；presence 佐证；kind-keyed silenceDays + cooldown；修硬件组 commit 偏差 C2/A1/G5），D-035 化解层 give-floor（capacityFreed 无过载组→本人私有兴趣链 relatedKnowledge 仅私发 + 暴露必带给予不变式 + 修正测量第 4 段意图），续做 D-036 数据河 build 轨登记。纯 docs/planning，未动代码
stage_goal: 以 D-026/D-027/D-028/D-029 + 重写中的 docs/design/team-hub-concept.md + AGENTS.md §1/§4/§5 为事实源，按四层架构推进数据真相层（项目/赛季·成员角色资历·组织树·任务依赖·Need·共享资源/占用窗口）→ 规则治理层（卡点/过载/沉默/升级 + 差异化在场派生）→ 展示汇报层 → 触点集成层，并行成长轴（知识图谱/订阅，D-027）；已建 Hub 壳子降为触点/集成+展示底座复用；AI 每轮默认读 AGENTS.md + now.md + agent-state.json + git 状态，backlog/decisions/roadmap/设计文档按条件读取
current_task: null  # D-031 重排已落；下一步从 frontier 选 HUB-SERVER-GOV-SCAFFOLD(地基，建议先)；GOV-MEMBER-STATUS-DERIVE 的第三态待讨论项4拍
frontier:                                # 顺序=用户 2026-06-11 选定(D-031 重排)：地基→idle 派生→录入
  - HUB-SERVER-GOV-SCAFFOLD              # 可变内存 GovernanceStore + 治理路由骨架(/api/dep-graph 等) + now=server clock 注入 — 所有真实数据流的物理出入口；server.ts 现仅 broker fixtures 路由，real 模式 GET /api/dep-graph 直接 404
  - GOV-MEMBER-STATUS-DERIVE             # Member.status 全派生(Task 真相,禁手写,杀双写 G2) + 三态 uncovered/blocked/capacityFreed + 私下 silence 信号 → 收成 GovernanceCue。spec 已落 gov-cue-layer.md(D-032) + gov-role-visibility.md(D-033 受众/角色/问责上移)；落地须读 group.kind 分河信号(D-034) + give-floor(D-035) + parity 测试
  - GOV-DEP-INTAKE-DESIGN                # 依赖录入交互(队长顺手连依赖+AI预填) — 前两者落地后才有真实写入/读取出入口；D-031 由 top-1 降为 top-3
# 退出 top-3(仍 backlog)：GOV-RULES-LAYER-DESIGN(=GovernanceCue 生产者层,D-032/D-034/D-035 已给图纸：分河信号+四段意图+give-floor) / GOV-CONCEPT-REWRITE / GOV-SCHED-VIZ-DESIGN
# 新增 backlog(D-031 调研补漏)：OverloadSignal 派生 / Need open→escalated 转换 / LARK-CARD-CHANNEL+LarkMemberBinding(GOV-LARK-DERIVE 两件前置) — 三者 D-032 后均归入 GovernanceCue 生产者
blocked: []
open_for_decision:                       # ARCH-PATH(D-028)/提醒(D-026后续)/资源(D-029)/idle三态+静默(D-032)/受众路由(D-033) 已拍；以下待用户线下细化
  - SCHED-WINDOW-GRANULARITY             # 窗口是否要精确钟点(startsAt/endsAt)，当前粗粒度 windowLabel + orderInWindow
  - SCHED-INVITED-MEMBER-DISPLAY         # 单窗 invitedMemberIds 在 UI 展示到什么程度（可操作 vs 不沉淀出勤档案）
post_pivot_registry:
  - SKILL-PROTOCOL-V1                    # 已落地草稿；作为治理触点层 skill 契约底座保留
  - BRIDGE-01-ROSTER-SCHEMA              # 模型并入治理 Task/progress；数据载体被 D-026 路线 A 反转（系统库做真相）
  - TRAIL-01-VIEWER-DESIGN               # 等治理 event/archive/artifact 原料足够后再设计
frozen:
  - ProbeFlash-v0.3.0                    # 代码已删(git 历史保留)；致命补丁走 git revert
```

## 当前任务

_无。HUB-COMPOSE-SMOKE 已闭环：Docker CLI/Compose 可用后，修复 Hub 镜像 runtime 依赖打包问题并跑通 `scripts/verify-hub-compose.sh`，已完成 Hub + Postgres build/up、health/API/static console smoke 与自动清理。下一步需重新走 atomic-task，从 frontier 选择唯一候选。_

## 架构定位（2026-06-09，D-026）

四层架构 + 路线 A 详见 `AGENTS.md §1` 与 D-026（不在此重复）。治理域是新增核心；已建 Hub 壳子（hub-server/contracts/console/Compose）作为触点/集成 + 展示底座保留。深设计见重写中的 `docs/design/team-hub-concept.md`。

**产品定义锐化（2026-06-08, D-026 draft）**：定位从“运维 / 观测控制台”锐化为“**制度化进度治理系统**”——系统是大脑 / 飞书是脸、不双写、无硬截止只轻推、暴露需求不暴露人、中央视图 = 动态依赖图（务实版）、给新人安全网。事实源 `docs/design/team-hub-concept.md`（已并入 product-definition v0，D-030；涉及产品形态 / 领域模型 / 中央视图 / 飞书·Git 边界时优先读）。

## 阻塞 / 待拍板

- ~~架构走法（D-026 开放项）~~：**已于 2026-06-11 拍定（D-028）治理为主轴**——治理实体进 hub-contracts 核心域（common/governance/growth/attribution），成长轴落同包独立文件域；已落地。
- ~~提醒可见范围/送达模型~~：**已于 2026-06-10 拍定**（提醒=队长轮询自动化、私聊本人、升级的是事不是人、AI 起草不发送/建议不判定/检索不评价）——见 `decisions.md` D-026 后续。
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

- 2026-06-12 D-035 化解层 give-floor + 修正测量第 4 段 — 3-agent 核实判"3b 整体后置给知识树"holds=false（代码证 `relatedKnowledgeFor` 从当前/被卡任务取知识，`capacityFreed` 的人 `currentTaskId→null` 无键可取 → 暴露成 idle 却零给予 = 破 A3、复活 freeIdle 污名）。决策：四段意图 `修正测量→暴露→问责→化解`；化解叉 3a 人力调度(治理) / 3b 自我成长(知识树整棵后置)；**give-floor**=capacityFreed 无过载组时从本人私有 `MemberKnowledge`(interested/learning) 平铺取 resourceLinks、**仅 taskOwnerPrivate**（tree-free，不等 D-027）；**暴露必带给予不变式**（发第三方的 surface 必配同主体 give Cue）守在单测。`gov-cue-layer.md` §4/§5/§7 同步。纯 docs/planning。验证：`git diff --check` + now.md yaml + agent-state json + skills-sync。
- 2026-06-12 D-034 数据生命线分组化 — silence 信号偏差的真正修法（C5 每组一条数据河）：3-agent 产品核实 REJECT「摸鱼可见」抓到信号源偏差是 schema 级 C2/A1/G5 破口（「零进展」只 commit/check-in、无 GroupKind 维度 → 程序 commit 不断、硬件物理活零 commit，同努力对硬件"静默"、冤枉 freshman 机械新生）。决策：机械/电路河=图纸版本上传（新 `ProgressSignalKind='artifactUpload'`）、程序河=git（薄封装降门槛）、兜底=自然 check-in（非打卡）；**保守铁律**=各河接入前非 program 组 git 缺失不触发 silence；presence 佐证（复用 `derivePresenceSchedule`）；`RulesConfig` 改 kind-keyed `silenceDays` + 新 `silenceCueCooldownDays`；parity 单测要求。`gov-cue-layer.md` §4/§5/§6 同步。纯 docs/planning。验证：`git diff --check` + now.md yaml + agent-state json + skills-sync。
- 2026-06-12 D-033 ROLE-VISIBILITY / CUE-AUDIENCE-ROUTING — 关闭 D-032 §3 OPEN：role enum 不动；队长/老师=项目级指派（`captainMemberId`/`observerMemberIds[]`）、组长=`Group.leadMemberId`、superAdmin 收窄为配置非受众；audience 最终三值 `taskOwnerPrivate/subjectGroupLead/teamCoordinator` + 路由表 + 可见性双轴；silence 纯 pull + 问责上移（用户选 A：只私发本人、本组 console 事键快照、组长负责注意）；两轮对抗审计（8-agent 宪法 + 3-agent 产品目标）必修硬化：去名宽视图 / factStatement 文本红线 / 老师 k-anon rollup / noticer 老师终极兜底 / owner==lead 上抬 / dedupe / null captain。spec 落 `docs/design/gov-role-visibility.md`；`gov-cue-layer.md` §2/§3/§4/§8 同步。纯 docs/planning。验证：`git diff --check` + now.md yaml + agent-state json + skills-sync。
- 2026-06-11 D-032 治理提示层 GovernanceCue — 讨论拍定：idle 检测 reframe 为建设性提示触发器（去学/去聊/中性颜色）；`Member.status` 全派生（Task 真相、杀双写 G2）+ 三态 uncovered/blocked/capacityFreed + 私下 silence 信号；idle/静默/Need 升级/过载 收成一个 `GovernanceCue` 多态层（反排名守一个 schema、`audience` 路由多态、受众到人靠送达层即时解析不落人名）。spec 落 `docs/design/gov-cue-layer.md`，`GOV-RULES-LAYER` 重定义为 Cue 生产者层。纯 docs/planning。验证：`git diff --check` + now.md yaml + agent-state json + skills-sync。
- 2026-06-11 D-031 概念调研 + frontier 重排 — ultracode 9 agent（ground→6 区设计→opus 缺失综合→opus 对抗 critic）调研后续概念设计并找缺失，结论全回源核实。关键发现：数据生命线命门（hub-server 治理路由全空 + `Member.status` 无派生函数却标 derived + 与 Task.status 双写 + freeIdle 把"未录入"误判成摸鱼）比"录入"更深；3 处"看似已 ship 实则空壳"（OverloadSignal 零派生 / Need escalated 死代码 / lark-toolkit 仅 reply）。**frontier 重排（D-031）：地基(HUB-SERVER-GOV-SCAFFOLD)→idle 派生(GOV-MEMBER-STATUS-DERIVE)→录入**。纯 docs/planning。验证：`git diff --check` + now.md yaml + agent-state json + skills-sync。
- 更早条目（**GOV-C4-FIX**(`17316cc`) 修两处 C4 破口（relatedKnowledgeFor/computeCriticalSet）+ 锚定测、**D-030** 文档瘦身 −46%、2026-06-11 planning-sync 录入立项 + frontier 重排、GOV-SCHED-MODEL/**D-029** 差异化在场排班 + `derivePresenceSchedule`、GOV-DATAMODEL-VIZ-ARCHPATH/**D-028** 治理为主轴 + 依赖链归因视图、GOV-REMIND-AXIS-DECIDE/**D-027** 成长轴 + 提醒模型、PF-V03-CLEANUP / HUB-COMPOSE-SMOKE 等）见 `git log` 与 `decisions.md`——已裁剪到 5 条（AGENTS §6）。
