# Now

> 唯一当前战况源。Team Hub 方向已由 D-024 覆盖旧 markdown-only pivot。逐条完成时间线 → `docs/archive/completed-log.md`；pre-pivot 历史快照 → `docs/archive/v0.3-pivot/`。

```yaml
mode: collab_design
stage: "2026-06-19 **在场排班优化 D-072 定稿·可起实现轮**（frontier 重开一项）。三支柱读写 + 差异化排班 S1/S2/S3 + 图纸档案 v2 + 集成模型三分 + 治理快照落盘全落；D-072 定稿后 PRESENCE-IMPL 可执行（不卡外部）；其余 INV 第三支柱 / KB-LARK / 正式部署 / DEPGRAPH-AI-AUTODRAW 仍卡外部门或用户排期。权威 = decisions.md D-061~D-072 + docs/archive/completed-log.md（逐条完成记录）+ git log。"
stage_goal: "演进留地基、AI 退出治理（治理只做人读说明视图、大三/学长判断），推进战队内部协作工具三支柱——① 战队知识库（规范+资料+调试归档+跨赛季沉淀，复用 growth.ts KnowledgeNode + 移植 Probe_Flash IssueCard→Archive 闭环）② 项目计划表（D-041：任务为核心·全员可见·依赖图+卡住必带原因·无甘特·不按人天数）③ 库存/BOM（P1，自保鲜护栏）。设计北极星 = 比死表省事 / 用着就更新（派生优先）/ AI 只当仓管·转译不下判断 / 人在环 / 小作坊轻量。事实源 = AGENTS.md §1 + docs/design/team-hub-concept.md（canonical）+ decisions.md D-039/D-041。治理 AI 派生整簇（D-032~035）挂起、复活触发 = 未来确认要 AI 参与治理判断。"
current_task: null  # 2026-06-19：D-072 在场排班优化定稿落档（设计稿定稿版 + ADR + AGENTS§1）。下一可执行 = PRESENCE-IMPL 实现轮（不卡外部，见 frontier）；其余 INV(卡 HUB-HERMES-ADAPTER)/KB-LARK(卡 LARK-BIN-PROBE)/正式部署(卡审批)/DEPGRAPH-AI-AUTODRAW(卡 Hermes) 仍卡外部门。逐条完成记录见 completed-log。
repo_sync: "2026-06-19：origin/master 推进到 D-072 定稿批（在 32e09f5 之上：设计稿定稿版 + D-072 ADR + AGENTS§1 + now sync，已 push）。push 凭证走共享库 ~/ruolin_huang/.gh-credentials，按 D-064 默认 commit+push。rainman WSL2 真机仍停 D-068(230c38e)，落后较多；演示前需 git bundle 过 SSH 同步 + 三包 verify:all + 4177 起服走查「在场排班」页——bundle 传 100.78.202.84（用户自己电脑·非默认 SSH 端口），需用户在场确认可达后执行。详见 memory teamhub-remote-access。"
frontier:                                # PRESENCE-IMPL 可执行（不卡外部）；其余仍卡外部基建 / 用户排期
  - PRESENCE-IMPL                         # 在场排班优化实现轮：D-072 已定稿(2026-06-19)→落「车=带编号对象」+宏观维修态+接力释放级联(挂车对象·不走车位枚举)/接力链(多车)视图+「谁可下班」语义/卡片页降级/视情况库存最小内核/demo seed 26R1·26R2/反监视护栏升结构约束（详见设计稿 §7）。不卡外部，可起。
  - DEPGRAPH-AI-AUTODRAW                  # AI 自动布大致 DAG + 人拖拽微调（Q2 诉求；AI 只建议不落库，卡 Hermes 触点）← 跳过
  # 仍卡外部基建/排期：INV 第三支柱(P1·卡 HUB-HERMES-ADAPTER 对话记账门) / KB-LARK(卡 LARK-BIN-PROBE) / 正式部署上线(卡用户审批) / Hermes
  # 后置(D-069)：STUDY-BROAD-D039-REVIVAL(HARD-GATED 封存·B1 已拍) / KB-IMPORT-FOLLOWUP nit①②
  # 挂起(D-039 AI 退治理，spec 留、复活触发=未来要 AI 参与治理判断)：GOV-MEMBER-STATUS-DERIVE / GOV-RULES-LAYER-DESIGN + D-032~035 治理派生整簇 + 自动派活 + freeIdle·双写债
# P1：INV-BOM-DESIGN(库存/BOM，自保鲜护栏=等 AI 读出车图核数/算余量再做，绝不再造静态表)+飞书 Bitable·sheets 读写+修 lark-cli bin bug；P2：资料/代码批量整理(AI 安全车道)、给老师项目级汇报
blocked: []
open_for_decision:                       # ARCH-PATH(D-028)/提醒(D-026后续→D-037)/资源(D-029)/idle三态+静默(D-032)/受众路由(D-033) 已拍；以下待用户线下细化
  - ARTIFACT-VERSION-SEMANTICS           # 图纸版本语义：v2 已落地最小+回退(D-071)。仍 open 的进阶语义 = 手动钉旧版 pin(append-only supersede)/按车分支/跨赛季权威指针(D-036，别做完整 PLM)；真实文件上传 = HUB-ARTIFACT-STORE-MECH(§8)；电路驱动命名规范 = 用户内部待定
  - REMOTE-ACCESS-DEPLOY                 # 远程部署 = 实验室 LAN+隧道方案与鉴权（D-036，§8 审批门后，独立基础设施轨）
  - GITHUB-TO-LOCAL                      # 程序代码 GitHub→本地 Forgejo 迁移 = 考虑中（D-038）；TeamHub 只消费 gitCommit 信号、不改 git 唯一真相
  - PULL-CLOUD-CODE                      # 定期 pull 云端代码/EDA 到本地备份 = 考虑中（D-038，与电路 EDA 云端引用相关）
  - UI-RESTYLE-AURASH                    # console 换 Aurash 暖纸风 = PILOT-FIRST 已评估、低优先级延后（D-060，docs/research/aurash-restyle-assessment.md）；动手须先过决策门，业务逻辑先行
  # PRESENCE-VIZ-RESOURCE-MODEL 已定稿(D-072，2026-06-19)→移出待定，实现轮 = frontier 的 PRESENCE-IMPL
post_pivot_registry:
  - SKILL-PROTOCOL-V1                    # 已落地草稿；作为治理触点层 skill 契约底座保留
  - BRIDGE-01-ROSTER-SCHEMA              # 模型并入治理 Task/progress；数据载体被 D-026 路线 A 反转（系统库做真相）
  - TRAIL-01-VIEWER-DESIGN               # 等治理 event/archive/artifact 原料足够后再设计
frozen:
  - ProbeFlash-v0.3.0                    # 代码已删(git 历史保留)；致命补丁走 git revert
```

## 架构定位（D-026 立魂 → D-037 回中）

四层架构 + 路线 A 详见 `AGENTS.md §1` 与 decisions.md D-026/D-037（不在此重复）。规则协调域是新增核心；已建 Hub 壳子（hub-server/contracts/console/Compose）作为触点/集成 + 展示底座保留。深设计见 `docs/design/team-hub-concept.md`（canonical）。

**产品定义**：定位从「运维 / 观测控制台」→「制度化进度治理系统」(D-026)→ **协作中枢：CASE 工具 + 团队交流中心 + 战队数据库**(D-037，给学长减负 / 给学弟指引 / 项目同步进度表)。系统是大脑 / 飞书是脸、不双写、无硬截止只轻推、**人键只回本人当帮助、第三方只见结构键（核心不变式 I0）**、给被卡的人正名而非抓摸鱼、给新人安全网。**D-039（2026-06-13）**：演进留地基 + **AI 退出治理**；产品 = 三支柱（知识库 / 项管看板 / 库存-BOM）；治理 AI 派生挂起。提醒模型 / AI 边界细则见 `AGENTS.md §2.2` A 原则 + decisions.md D-037（不再依赖 D-026 后续原文，已归档）。

## 阻塞 / 待拍板

- **真实外部 adapter**：Hermes / 小龙虾 / Claude Code 真实接入需用户提供运行方式与权限；AI 当前只能做 mock-first 适配设计。
- **真实服务器写入**：Forgejo/Gitea/bare git 部署、SSH、systemd、80/443、真实数据迁移均需用户白天审批后再做。

## 已冻结

- ProbeFlash v0.3 代码（原 apps/desktop、apps/server、release 流程）：已于 2026-06-09 删除；完整代码留 git 历史，精华见 `docs/archive/v0.3-closeout/PROBEFLASH-V03-ESSENCE.md`；致命补丁走 `git revert`。
- pre-pivot backlog 全部任务（TECH-* / AIREADY-* / REALAI-* / CODECTX-* / DEP-* / DATA-* / UI-* / CORE-* / SEARCH-*）：不再认领；详见 `docs/archive/v0.3-pivot/backlog.md`。
- 原 BRIDGE / TRAIL markdown-only 候选：已被 D-024 Team Hub 架构覆盖，后续只作为 Hub BridgeState / Trail 能力重评。

## 安全边界（pivot 后仍生效）

- 不动 v0.3 server / SQLite / API（致命补丁除外）。
- AI / Skill / Hub adapter 不读 / 打印密钥（`.env` / `*key*` / `*secret*`）。
- 真实 Hermes / 小龙虾 / Claude Code / 飞书 / Git forge smoke 由用户线下配置；AI 只做 mock-first 与只读诊断。
- 不在未审批情况下写真实服务器、SSH、systemd、80/443 或迁移真实数据。

## 最近完成（详见 `git log` 与 `docs/archive/completed-log.md`）

- 2026-06-19 在场排班优化（D-072）定稿：对抗式设计审查（`wf_2f31074c-523`，55 claims·5 视角·对抗核实）+ 用户多轮拍板 → 设计稿出定稿版（两视图删甘特 / 单层「车=带编号对象」/ 删程序组领任务留汇报视角 / 宏观维修态+注释 / 接力释放「谁可下班」语义 / 预留=扣减归车 / v=代次 / 总联调全组各一人 / 多车并排）；零代码，下一轮 PRESENCE-IMPL 起实现。
- 2026-06-19 差异化排班 S1+S2+S3 + 文案 + 审计长尾（D-069 P1 连续自主批，5 commit `ece2a3b`→`052285d`）：SCHED-WIRE-EXISTING / SCHED-MEMBER-AVAILABILITY / STUDY-NARROW-DERIVE / CONSOLE-COPY-HUMANIZE / AUDIT-FIXES-LONGTAIL，每条独立 workflow + 2-lens 对抗核实，A 档全清。
- 2026-06-18 v2 后硬化会话（`732a2c9`→`b10ba43`）：bug 检修 13 修 + 版本 0.1.0 + I0 收口（成员状态面板隐藏）+ 优化自主批 41 + C 架构清理；三包 verify:all 224 全绿。
- 2026-06-18 图纸档案 v2 机械/电路分组版本库（D-071）：ArtifactRef +5 optional 字段 + superRefine + server 派生 versionNo/kind/revision + console 表单重做；回退 = 最新即权威（append-only）。
- 更早完成条目 → `docs/archive/completed-log.md`（完整时间线，亦见 `git log`）。
