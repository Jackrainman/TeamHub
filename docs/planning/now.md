# Now

> 唯一当前战况源。Team Hub 方向已由 D-024 覆盖旧 markdown-only pivot。逐条完成时间线 → `docs/archive/completed-log.md`；pre-pivot 历史快照 → `docs/archive/v0.3-pivot/`。

```yaml
mode: collab_design
stage: "2026-07-11 **产品重定义（D-083）**。开源·防爆肝双主轴·四把刀拍板：①倒排基准线（赛季→学期→阶段类型+里程碑链+验证门+投资类任务防砍示警）②轻身份登录双模式（匿名模式整体保留供选择）③我的视图 ④store 拆分+SQLite。宪法修正：G4 里程碑例外（里程碑有日期、Task 永不带个人 dueDate、快慢派生）+ I0 口径降级（分析对准事不对准人、不做排行榜、登录后本人视图合法）+ AI 排人三红线（事实拼盘不排序/拍板留名归人/只在决策现场）。课表排班砍（伪需求）、在场排班收窄到关键窗口、缺人方向→学习方向、兴趣声明暂不建、游戏包+对外文档+PHASE2 后置。真相 = decisions.md D-083 + docs/design/product-redefine-2026-07.md（解耦审计 wf_66e13d79-814 账单入其 §9）。权威 = decisions.md + docs/archive/completed-log.md + git log。"
stage_goal: "演进留地基、AI 退出治理（治理只做人读说明视图、大三/学长判断），推进战队内部协作工具三支柱——① 战队知识库（规范+资料+调试归档+跨赛季沉淀，复用 growth.ts KnowledgeNode + 移植 Probe_Flash IssueCard→Archive 闭环）② 项目计划表（D-041：任务为核心·全员可见·依赖图+卡住必带原因·无甘特·不按人天数）③ 库存/BOM（P1，自保鲜护栏）。设计北极星 = 比死表省事 / 用着就更新（派生优先）/ AI 只当仓管·转译不下判断 / 人在环 / 小作坊轻量。事实源 = AGENTS.md §1 + docs/design/team-hub-concept.md（canonical）+ decisions.md D-039/D-041。治理 AI 派生整簇（D-032~035）挂起、复活触发 = 未来确认要 AI 参与治理判断。"
current_task: "2026-07-25 **公测打磨轮+初始化向导 v3 落地中**（设计真相=docs/design/onboarding-init-wizard-2026-07-25.md，两轮提问拍板：PIN 明文副本+显示端点 / CSV 预览表可编辑 / 验收人纯年级派生 / 年级七档 / 赛季日期派生 / 车队·库存·KB 全进向导可跳过）：刀⑤默认四组 ⑥年级七档 ⑦名册预览表 ⑧成员页 UX ⑨赛季建议 ⑩车队批量 ⑪库存导入 ⑫KB md 导入 ⑬向导赛季+比赛日步。前批：公测补强刀①~④ ✅(v0.28.0~0.32.0) + 部署重置 ✅ + 写门 401 死锁修复 ✅(v0.33.0 `364ce97`：身份模式有效会话=已鉴权，session/bootstrap/roster/loopback PIN 恢复免 Bearer)。"
repo_sync: "2026-07-25：写门 401 死锁修复（`364ce97`，v0.33.0 minor：身份模式写门认有效会话或 Bearer 任一，登录/首启动向导/loopback PIN 恢复免 Bearer——修非 loopback 部署初始化被 401 锁死；server 437 测全绿）+ 部署实例重置完成（/home/ubuntu/TeamHub，buildId 364ce97）。2026-07-24：公测补强刀④ PROGRAM-GROUP-ABSTRACT（v0.32.0）+ 刀② SETUP-WIZARD-ROSTER（v0.31.0）+ 刀③ ROSTER-CSV-3COL（v0.30.0）+ 刀②b MEMBER-PM-FLAG（v0.29.0）+ 刀① PIN-DEADLOCK-RECOVERY（v0.28.0）+ HARNESS-DIET/DOCS-SLIM（不 bump）。更早账单 → docs/archive/completed-log.md + git log。"
frontier:                                # 本轮(07-11~07-12)=路线 v4 五把刀全部落地收口；✅ 条目真相统一 → docs/archive/completed-log.md + git log；下一批见下方「后置」
  - PIN-RESET                           # ✅ 已落地(2026-07-23，v0.27.0，minor)
  - SETUP-WIZARD                        # ✅ 已落地(2026-07-23，三刀，v0.27.0)
  - K6-CLOCK-EMPTYBOARD                 # ✅ 已落地(2026-07-16，`e698ffe`，v0.24.3，patch)
  - K8-ROSTER-IMPORT                    # ✅ 已落地(2026-07-16，`94cdfdf`，v0.25.0，minor)
  - BETA-READINESS                      # ✅ 已落地(2026-07-16，四刀 K1-K4 `975ea45`..`638c46a`，v0.24.0→0.24.2)
  - K1-AUTHZ-FOUNDATION                 # ✅ 已落地(2026-07-16，`975ea45`，v0.24.0，minor，D-089)
  - K2-IDENTITY-EXPERIENCE              # ✅ 已落地(2026-07-16，`ba48956`，v0.24.1，patch)
  - TASK-POST-CLAIM                     # ✅ 已落地(2026-07-15，`5a60344`..`bfa5d25`，v0.23.0→0.23.2，D-088)
  - VISUAL-VITALITY                     # ✅ 已落地(2026-07-13~15，三批+并入 master `e75506b`，v0.19.5→0.21.1)
  - GATE-CHECKLIST-IOU                  # ✅ 已落地(2026-07-15，`f2ceffb`..`86bcc3d`，v0.22.0→0.22.3，D-087)
  - BASELINE-DESIGN                     # ✅ 设计已锁(2026-07-11，baseline-design.md v1)
  - BASELINE-CORE                       # ✅ 已落地(2026-07-11，`d3db6fe`..`e3a76a9`，v0.10.3→0.11.5)
  - IDENTITY-LITE                       # ✅ 已落地(2026-07-11~12，`4a2acd9`..`8978308`，v0.12.0→0.12.2)
  - MY-VIEW                             # ✅ 已落地(2026-07-12，`6be2545`..`bb3f70d`，v0.12.2→0.13.1)
  - STORE-SPLIT-SQLITE                  # ✅ 已落地(2026-07-12，`47c2f65`..`1616c4f`，v0.13.2→0.14.1)
  - LEARN-DIRECTION-REDESIGN            # ✅ 已落地(2026-07-12，`f98c9d3`..`7841a9c`，v0.14.1→0.15.1)
  - AUDIT-DEBT-2026-07                  # ✅ 已落地(2026-07-12，`538ea9a`..`d1a8aed`，v0.15.2→0.15.5)
  - MODULARIZATION-PHASE2                 # 后置(D-083)：游戏包推迟，先把 Robocon 写明白；届时再切垂直包 worktree
  - DEPGRAPH-AI-AUTODRAW                  # AI 自动布大致 DAG + 人拖拽微调（AI 只建议不落库，卡 Hermes 触点）← 跳过
  # 公测准备余项(2026-07-16 文档轮后)：① ✅Excel 名册导入(已落地 K8-ROSTER-IMPORT v0.25.0，见上) ② ✅README 重写+部署指南+队员上手页(2026-07-16 文档轮落地，含 AI 部署提示词四件套+备份脚本五域扩展) ③ ✅打 tag(v0.25.0=公测就绪点①；v0.27.0=公测就绪点② 已打并推送+GitHub Release 已发，2026-07-23，含 SETUP-WIZARD 三刀+PIN-RESET+nit③) ④ 检查单模板(等复盘产出) ⑤ ✅push 已恢复(07-16 用户重建 PAT；根因=旧 token 30 天到期+credential-store 拒后自抹致 0 字节之谜) ⑥ 复审 4 nit——nit③ TOCTOU ✅已修(2026-07-23 v0.27.0，guard 收进 setMemberRole 临界区)，nit①②④ 维持原裁留档(beta-readiness §6 尾注记) ⑦ ✅PIN 重置写口已落地(2026-07-23 PIN-RESET v0.27.0，见上 frontier 首行)
  # 公测补强代办(2026-07-24 立项)：刀①~④ ✅已全部落地(v0.28.0~v0.32.0)；刀⑤ 运维动作 ✅(2026-07-25：部署重置+用户冒烟中)；追加修复=写门 401 死锁 ✅(v0.33.0)
  # 公测打磨轮+向导 v3(2026-07-25 立项，设计真相=docs/design/onboarding-init-wizard-2026-07-25.md)：刀⑤默认四组 ✅(v0.34.0)/⑥年级七档 ✅(v0.35.0)/⑦名册预览表 ✅(v0.36.0)/⑧成员页UX(PIN显示+验收人只读+单行)/⑨赛季建议/⑩车队批量/⑪库存导入/⑫KB md导入/⑬向导赛季步——落地中
  # 排班收窄(D-083)：在场排班/接力退出日常动线，只服务「人必须凑齐」的关键窗口(联调日/赛前)；课表围绕排班停建(伪需求，MemberAvailability schema/派生保留不扩建)
  # 仍卡外部基建/排期：INV-Hermes 自动对话记账(卡 HUB-HERMES-ADAPTER) / KB-LARK 飞书 wiki·drive→KB 摄入(需落点 schema 定稿) / 正式部署上线(卡用户审批) / Hermes
  # 后置(D-069)：STUDY-BROAD-D039-REVIVAL(HARD-GATED 封存·B1 已拍；D-083 AI 三红线延续其精神)
  # 挂起(D-039 AI 退治理，spec 留、复活触发=未来要 AI 参与治理判断)：GOV-MEMBER-STATUS-DERIVE / GOV-RULES-LAYER-DESIGN + D-032~035 治理派生整簇 + 自动派活 + freeIdle·双写债
  # 历史已落地条目(IA-REFACTOR D-077 / ARTIFACT-FILE-CHAIN D-078 / PRESENCE-RECONCILE D-079 / DAILY-PLAN-PRESETS D-082 / PHASE2-CONSOLE-ASSEMBLY 等)→ docs/archive/completed-log.md + git log
# P1：~~INV-BOM 内核~~(已落地 2026-06-19，自保鲜护栏=对话记账/盘点不再造静态表，Hermes 自动记账仍待 HUB-HERMES-ADAPTER)+飞书 Bitable·sheets 读写+~~修 lark-cli bin bug~~(已修 5cb84cb)；P2：资料/代码批量整理(AI 安全车道)、给老师项目级汇报
blocked: []
open_for_decision:                       # ARCH-PATH(D-028)/提醒(D-026后续→D-037)/资源(D-029)/idle三态+静默(D-032)/受众路由(D-033) 已拍；以下待用户线下细化
  - ARTIFACT-VERSION-SEMANTICS           # 图纸版本语义：v2 已落地最小+回退(D-071)；真实文件上传/存储 = ✅HUB-ARTIFACT-STORE-MECH 本地卷版已落地(D-078，文件+云端链接双存)。仍 open 的进阶语义 = 手动钉旧版 pin(append-only supersede)/按车分支/跨赛季权威指针(D-036，别做完整 PLM)；电路驱动命名规范 = 用户内部待定
  - REMOTE-ACCESS-DEPLOY                 # 远程部署 = 实验室 LAN+隧道方案与鉴权（D-036，§8 审批门后，独立基础设施轨）
  - GITHUB-TO-LOCAL                      # 程序代码 GitHub→本地 Forgejo 迁移 = 考虑中（D-038）；TeamHub 只消费 gitCommit 信号、不改 git 唯一真相
  - PULL-CLOUD-CODE                      # 定期 pull 云端代码/EDA 到本地备份 = 考虑中（D-038，与电路 EDA 云端引用相关）
  # PRESENCE-VIZ-RESOURCE-MODEL 已定稿(D-072，2026-06-19)→移出待定，实现轮 = frontier 的 PRESENCE-IMPL
  # UI-RESTYLE-AURASH 已拍板关闭(D-060 SUPERSEDED-BY D-084，2026-07-12)→移出待定；用户改选科技风，落地=第4主题 tech 并设默认（332c354..04654b3），Aurash 暖纸风提案不再是候选方向
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

- 2026-07-16 **BETA-READINESS 四刀 + 复审收口（`975ea45`..本 docs commit，VERSION 0.23.3→0.24.2）**：K1-K4 四刀落地后的 docs 收口——新增 `docs/design/beta-readiness-2026-07-16.md` 回写四刀架构裁决（双模式非对称/敏感门只身份模式生效/superAdmin 诞生=setup 路由+PIN 同笔/About 运行模式行退役+deployment 回显字段口径）与实现期偏离；复审逐文件核实四刀 diff，留档一处良性「点了才 403」nit（Settings 页「成员与权限」角色下拉/验收人复选框 + 「赛季」建表单前端仅判断是否已登录、未判断是否为 superAdmin，未套上 K2 已建立的前置资格判范式；服务端鉴权本身正确，仅前端可发现性未达同轮标准，本轮判定留档不修）；三包 `verify:all` 终态复核全绿（contracts 273/server 360/console 163，较 K1 落地时的 266/359/163 因后续两刀新增用例而推高）。`now.md` current_task/repo_sync/frontier 同步、「下一步待定」改列公测准备余项（Excel 名册导入/README 重写/打 tag/检查单模板）。纯 docs commit 不 bump。
- 2026-07-16 **K3 部署信息刀落地（v0.24.2，patch）**：设置页新增「部署信息」分区（五域 storage 落盘路径 mono / 内存态琥珀警示「重启即丢」+ 登录模式 + 启用模块 + buildId + 运行时长人话化 + 图纸上传启用状态）——契约 `SystemStatusResponse` 增 optional `deployment` 字段（敏感值如 writeToken 绝不进来）；`main.ts` 启动时收集五域 store/后端/路径 + 启用模块 + 图纸目录 + 构建标识经 `BuildHubServerOptions` 传入回显；About 页删除恒为 `'mock-first'` 从未被验证过的「运行模式」行（schema `mode` 字段保留兼容）；图纸档案页 `artifactUploadEnabled===false` 时禁用行内上传按钮 + title 说明。contracts schema 测试(4) + server 路由 file/memory 两形态回显测试；三包 verify:all 全绿 + health-check 10 页 0 错。一个 commit push。
- 2026-07-16 **K4 配置面还债刀落地（无 apps/hub-*/src 改动，VERSION 不变仍 0.24.2）**：`deploy/teamhub.env.example` 删 6 个全仓 grep 复核零命中的死变量（`PUBLIC_BASE_URL`/四个 `ADAPTER_*_MODE`/`ARTIFACT_STORE`），补 7 个真读取变量各一行中文注释（`TEAMHUB_GOV_BACKEND`/`TEAMHUB_GOV_SQLITE_FILE`/`TEAMHUB_BASELINE_DATA_FILE`/`TEAMHUB_CHECKLIST_DATA_FILE`/`TEAMHUB_IDENTITY_MODE`/`TEAMHUB_TENANT_MODULES`/`HUB_PORT`）；`compose.yaml` 补 `TEAMHUB_BASELINE_DATA_FILE`+`TEAMHUB_CHECKLIST_DATA_FILE` 落挂卷 + 新增 `hub_baseline`/`hub_checklist` 两卷（此前这两域每次容器重启静默清零，本刀主修的数据丢失黑洞）；`start-teamhub.sh` 说明块补 `TEAMHUB_TRUST_PROXY`/`TEAMHUB_DEMO_SEED` 两条环境变量说明；`scripts/verify-hub-compose.sh` 删对已不存在的 postgres 服务的残留引用。仅文档/配置改动，未触发版本 bump（`check-version-bump.sh` 只在暂存 `apps/hub-*/src` 时反射）。一个 commit push。
- 更早完成条目（07-16 K2/K1 身份两刀、07-15 门检查单+挂单认领+视觉三批、07-12 交互/UI 三连+tech 换肤+路线 v4 收口、07-11 BASELINE-CORE+产品重定义 D-083、07-03 五件套、07-01 模块化阶段一、06 月批次等）→ `docs/archive/completed-log.md`（完整时间线，亦见 `git log`）。
