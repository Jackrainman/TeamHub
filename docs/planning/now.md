# Now

> 唯一当前战况源。Team Hub 方向已由 D-024 覆盖旧 markdown-only pivot。pre-pivot 历史快照 → `docs/archive/v0.3-pivot/`。

```yaml
mode: governance_design
stage: 2026-06-11 ultracode 概念调研（9 agent：ground→6 区设计→opus 缺失综合→opus 对抗 critic，结论全回源核实）→ 用户选范围 2+1。范围 2（已落 commit 17316cc）：修两处一行级 C4 破口（relatedKnowledgeFor 不过滤 confirmedBy + computeCriticalSet 喂全量 deps 而非 liveDeps），各配锚定测，hub-contracts 29 测 + hub-console 4 测全过。范围 1（本步，纯 docs/planning）：frontier 重排（D-031）——数据生命线命门（server 治理骨架 + idle 派生）比"录入"更深，提到 GOV-DEP-INTAKE 之前
stage_goal: 以 D-026/D-027/D-028/D-029 + 重写中的 docs/design/team-hub-concept.md + AGENTS.md §1/§4/§5 为事实源，按四层架构推进数据真相层（项目/赛季·成员角色资历·组织树·任务依赖·Need·共享资源/占用窗口）→ 规则治理层（卡点/过载/沉默/升级 + 差异化在场派生）→ 展示汇报层 → 触点集成层，并行成长轴（知识图谱/订阅，D-027）；已建 Hub 壳子降为触点/集成+展示底座复用；AI 每轮默认读 AGENTS.md + now.md + agent-state.json + git 状态，backlog/decisions/roadmap/设计文档按条件读取
current_task: null  # D-031 重排已落；下一步从 frontier 选 HUB-SERVER-GOV-SCAFFOLD(地基，建议先)；GOV-MEMBER-STATUS-DERIVE 的第三态待讨论项4拍
frontier:                                # 顺序=用户 2026-06-11 选定(D-031 重排)：地基→idle 派生→录入
  - HUB-SERVER-GOV-SCAFFOLD              # 可变内存 GovernanceStore + 治理路由骨架(/api/dep-graph 等) + now=server clock 注入 — 所有真实数据流的物理出入口；server.ts 现仅 broker fixtures 路由，real 模式 GET /api/dep-graph 直接 404
  - GOV-MEMBER-STATUS-DERIVE             # Member.status idle/working/blocked 纯函数派生(现为手填硬常量却标 derived，无派生函数) + 解决与 Task.status 双写(违 G2) + 第三态"未录入"(否则 freeIdle 把没被录入的人误判成摸鱼) — schema 待讨论项4拍
  - GOV-DEP-INTAKE-DESIGN                # 依赖录入交互(队长顺手连依赖+AI预填) — 前两者落地后才有真实写入/读取出入口；D-031 由 top-1 降为 top-3
# 退出 top-3(仍 backlog)：GOV-RULES-LAYER-DESIGN / GOV-CONCEPT-REWRITE / GOV-SCHED-VIZ-DESIGN
# 新增 backlog(D-031 调研补漏)：OverloadSignal 派生(负载侧只有空 schema) / Need open→escalated 转换(A4 施压机制现为死代码) / LARK-CARD-CHANNEL+LarkMemberBinding(GOV-LARK-DERIVE 两件前置)
blocked: []
open_for_decision:                       # ARCH-PATH(D-028) / 提醒模型(D-026 后续) / 资源建模(D-029) 已拍；以下为 D-029 留待用户线下的细节
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

- 2026-06-11 D-031 概念调研 + frontier 重排 — ultracode 9 agent（ground→6 区设计→opus 缺失综合→opus 对抗 critic）调研后续概念设计并找缺失，结论全回源核实。关键发现：数据生命线命门（hub-server 治理路由全空 + `Member.status` 无派生函数却标 derived + 与 Task.status 双写 + freeIdle 把"未录入"误判成摸鱼）比"录入"更深；3 处"看似已 ship 实则空壳"（OverloadSignal 零派生 / Need escalated 死代码 / lark-toolkit 仅 reply）。**frontier 重排（D-031）：地基(HUB-SERVER-GOV-SCAFFOLD)→idle 派生(GOV-MEMBER-STATUS-DERIVE)→录入**。纯 docs/planning。验证：`git diff --check` + now.md yaml + agent-state json + skills-sync。
- 2026-06-11 GOV-C4-FIX (`17316cc`) — 修两处宪法 C4 破口（`relatedKnowledgeFor` 不过滤 confirmedBy / `computeCriticalSet` 喂全量 deps 而非 liveDeps），各暂被 fixtures 掩盖、接真实 AI 即爆；各配锚定测（在 buggy 代码上会失败：satisfied 边退出关键链、confirmedBy=null 标注不进 relatedKnowledge）。验证：`hub-contracts verify:all` 29 测 + `hub-console verify:all` 4 测+build 全过（mock 经 toDepGraphView 派生，无回归）。
- 2026-06-11 D-030 文档瘦身 — 文档保留规则立 ADR；`superpowers/plans`(4038 行)归档 + `product-definition` 并入 canonical `concept.md`(杀双写)；活文档 −46%；引用同步(now/connector/decisions)。lark 调研暂留待 GOV-LARK-DERIVE。验证：`git diff --check` + now.md yaml + agent-state json + skills-sync。
- 2026-06-11 planning-sync — 录入交互补立项（GOV-DEP-INTAKE，DAG 数据命门）+ frontier 重排（录入→规则→concept 回写）+ concept.md 追上 D-028/D-029（修 §6/§8 stale 标记）；纯 docs/planning，未动代码。验证：`git diff --check` + now.md yaml 可解析 + `python3 -m json.tool agent-state.json` + skills-sync。
- 2026-06-11 GOV-SCHED-MODEL — 差异化在场排班（**D-029**，杀手锏立项：通用 PM 没有的"按依赖位置 on-call"）；`hub-contracts` 新增 `SharedResource`/`ResourceSession`/`PresenceRecommendation`（`governance.ts`）+ `derivePresenceSchedule` 纯函数（`schedule.ts`）+ 锚点场景 + 车撞坏 down 变体 fixtures + 12 项排班单测。派生：持有组在场 / live 上游组随叫 / 被卡组去学（挂"可看的资料"）/ 资源 down 整片去学 / 无关组沉默；输出主键 group/resource/task **无 memberId 维度**（反排名），`invitedMemberIds` 仅单窗名单不跨窗累计。验证：`verify:all` 全过 26 测（typecheck+test+build）。设计 + 一屏交互（页面状态 + API mock）见 `docs/design/gov-oncall-schedule.md`；活页面 = frontier `GOV-SCHED-VIZ-DESIGN`。
- 更早条目（GOV-DATAMODEL-VIZ-ARCHPATH/**D-028** 治理为主轴 + 依赖链归因视图、GOV-REMIND-AXIS-DECIDE/**D-027** 成长轴 + 提醒模型、PF-V03-CLEANUP / HUB-COMPOSE-SMOKE / HUB-ADAPTERS-MOCK / HUB-LARK-WIRE 等）见 `git log` 与 `decisions.md`——已裁剪到 5 条（AGENTS §6）。
