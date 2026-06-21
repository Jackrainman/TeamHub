# Now

> 唯一当前战况源。Team Hub 方向已由 D-024 覆盖旧 markdown-only pivot。逐条完成时间线 → `docs/archive/completed-log.md`；pre-pivot 历史快照 → `docs/archive/v0.3-pivot/`。

```yaml
mode: collab_design
stage: "2026-06-19 **INV-BOM 内核 + PRESENCE-IMPL 安全增量落地（无人值守实现轮）**。① 库存/BOM 第三支柱 buildable-now 内核全落（contracts schema+派生+动作语义 / 落盘 InvStore / 三端点 / console 零件×车矩阵+一句话快记+缺料告警 / demo seed），三包 verify 全绿；② PRESENCE-IMPL 安全增量落地（deriveDisplayCode+SharedResource 生命周期/displayCode+canBoardResource 接力释放级联 / RelayChainView 多车接力链+卡片页降级 / 反监视护栏升结构约束 / seed 26R1·26R2），fixture 调和+总联调=全组各一人语义 DEFERRED（需 schema 定稿，见设计稿 §7.1）；③ WSL2 真机 Playwright 验收全 PASS（矩阵活体 26R1/26R2 / damage 快记 9→8 刷新 / 零 memberId 泄漏，截图入库）；④ lark-toolkit execa bin bug 修（'lark'→'lark-cli'），KB-LARK 摄入功能 DEFERRED。权威 = decisions.md D-061~D-072 + docs/archive/completed-log.md + git log。"
stage_goal: "演进留地基、AI 退出治理（治理只做人读说明视图、大三/学长判断），推进战队内部协作工具三支柱——① 战队知识库（规范+资料+调试归档+跨赛季沉淀，复用 growth.ts KnowledgeNode + 移植 Probe_Flash IssueCard→Archive 闭环）② 项目计划表（D-041：任务为核心·全员可见·依赖图+卡住必带原因·无甘特·不按人天数）③ 库存/BOM（P1，自保鲜护栏）。设计北极星 = 比死表省事 / 用着就更新（派生优先）/ AI 只当仓管·转译不下判断 / 人在环 / 小作坊轻量。事实源 = AGENTS.md §1 + docs/design/team-hub-concept.md（canonical）+ decisions.md D-039/D-041。治理 AI 派生整簇（D-032~035）挂起、复活触发 = 未来确认要 AI 参与治理判断。"
current_task: null  # 2026-06-21 图纸文件 上传→本地卷→下载 链路收口（HUB-ARTIFACT-STORE-MECH 本地卷版）+ 表单控件修缮（适配机器人/赛季 datalist 组合框·编号位收窄）+ 部署 env-var 修复（ARTIFACT_ROOT→TEAMHUB_ARTIFACT_FILES_DIR，原线上恒 404）+ 版本号 lock 漂移修复（hub-contracts/console lock 停 0.0.1 + 硬化 bump-version.sh 同步 lock + 加漂移哨兵）。三包 verify 全绿（164/194/44）+ 真机 API 冒烟（创建/上传/下载/重传清兄弟/落盘持久化/415·401·404·400 负路径）+ push origin/master（D-078）。下一可执行 = PRESENCE-RECONCILE-LOCK；其余 INV-Hermes/KB-LARK/正式部署/DEPGRAPH-AI-AUTODRAW 仍卡外部基建或需定稿。历史（2026-06-19 INV-BOM-CORE+PRESENCE-IMPL 等）见 completed-log。
repo_sync: "2026-06-19：origin/master 推进到无人值守实现轮（5cb84cb：INV-BOM-CORE + PRESENCE-IMPL 安全增量 + WSL 验收截图 + lark bin 修，4 commit 已 push）。push 凭证走共享库 ~/ruolin_huang/.gh-credentials，按 D-064 默认 commit+push（push 前 git fetch 防分叉）。rainman WSL2 真机已同步到 736f0c3 并起服 4177 跑通 Playwright 验收（loopback，TEAMHUB_INV_DATA_FILE=~/teamhub-data/inventory.json）；注意 WSL 在 ssh 会话关闭后会 reap 所有进程（含 tmux），常驻部署须保持连接或 enable-linger，验收已在单会话内完成。bundle 传 100.78.202.84 实测 ssh BatchMode 可达、字节比对无截断。详见 memory teamhub-remote-access。"
frontier:                                # PRESENCE-RECONCILE-LOCK 需定稿；其余仍卡外部基建 / 用户排期
  # ✅ IA-REFACTOR 完成(2026-06-21 终态 D-077)：①机器人队页 D-075；②项目页(看板+依赖图视图切换)③知识库(纯相似检索)④图纸档案(独立)⑤导航全摊平 8 项。**D-076 首版(知识页合并图纸+洞察折叠分组)被用户验收推翻→revert 整个 Phase2-4 从干净 D-075 重做(996df7d revert / 9c4cc5d 重做)**。终态扁平导航固定序：总览/项目/知识库/图纸档案/库存/机器人队/缺人方向/设置。本机三包 verify 全绿+i18n 双侧 467 键平衡 + **WSL2 真机 Playwright 7/7 PASS**(buildId 9c4cc5d，截图 docs/screenshots/wsl-ia-fix-*)；组合不重写/零契约改/I0 净/赛季 SeasonSelect 表单一致保留。详 decisions.md D-077(D-076 全文已归档)。
  # ✅ IA-FORM-CONSISTENCY 完成(并入 IA-REFACTOR，D-077 沿用)：赛季两处统一下拉+「其它（手填）」兜底(抽共享 components/SeasonSelect.tsx，机器人队 create 从自由文本改下拉)；第三项保留两套语义(robotCode 通用 / robotTarget 共享)、契约枚举零改、控件+文案统一。
  # ✅ ARTIFACT-FILE-CHAIN 完成(2026-06-21，D-078)：图纸 上传→本地卷→下载 链路打通(HUB-ARTIFACT-STORE-MECH 本地卷版，D-025 二进制不进 git)；文件 + 云端链接(uri)双存、行内双按钮(下载本地/打开云端)；适配机器人/赛季改 datalist 组合框(候选+手填)·robotCode 写契约放宽自由串·编号位/目标机器人收窄(.kb-field--narrow)；修部署 ARTIFACT_ROOT→TEAMHUB_ARTIFACT_FILES_DIR(原线上恒 404)+版本号 lock 漂移。三包 verify 绿(164/194/44)+真机 API 冒烟。注：SeasonSelect 上一句的「select+其它」已被本轮 datalist 组合框取代。
  - SCHEDULE-DESIGN-LOCK                  # 【已定稿+随阶段1落地·D-075】消解：根因「没法加」=SchedulePage 把整块 RelayCanvas gate 在 recommendations.length===0 后→空天死卡。已修=画布永远渲染+空态CTA引导卡(加第一棒/沿用上一天)+任务必填+每天空板+手动「沿用上一天」(纯前端复用既有端点)。定稿 docs/design/schedule-ux-lock.md。不放假 seed(守派生优先)。
  - PRESENCE-RECONCILE-LOCK               # 在场排班 fixture 调和：先出「总联调=全组各一人」收敛任务的字段/派生级定稿（仿 inv-bom-core.md），再落 m-progA→grp-ec / m-progB→grp-vision / grp-program 去领任务 + 改 ~9 测试文件断言。DEFERRED 自无人值守轮（无安全默认、波及面大），见 presence-resource-redesign.md §7.1。
  - DEPGRAPH-AI-AUTODRAW                  # AI 自动布大致 DAG + 人拖拽微调（Q2 诉求；AI 只建议不落库，卡 Hermes 触点）← 跳过
  # 已落地(2026-06-19 无人值守轮)：INV-BOM-CORE 内核(一句话快记/矩阵/缺料/落盘) + PRESENCE-IMPL 安全增量(displayCode/接力释放/接力链视图/护栏) + WSL2 验收 + lark bin 修
  # 已落地(2026-06-20 用户验收两轮，全 push origin/master + WSL 真机 Playwright 截图验)：R2 排班文案 humanize + INV「太靠外/歪」对齐修复 + R1 接力可编辑画布(RelayCanvas 替 RelayChainView，拖拽排序/ETA/拉交接线，修了首屏 visibility:hidden bug) + R3 机器人管理页(建/改状态/退役+resources.json 持久化) + A3 车→机器人全站术语 sweep + A1 排班日期选择器(今天/明天/后天+查找特定日期) + A2 接力加/删一棒(DELETE 级联删交接线)。设计文档 docs/design/sched-date-relay-robot-redesign.md。
  # 仍卡外部基建/排期：INV-Hermes 自动对话记账(卡 HUB-HERMES-ADAPTER) / KB-LARK 飞书 wiki·drive→KB 摄入(需落点 schema 定稿) / 正式部署上线(卡用户审批) / Hermes
  # 后置(D-069)：STUDY-BROAD-D039-REVIVAL(HARD-GATED 封存·B1 已拍)  ｜ KB-IMPORT-FOLLOWUP nit①② 已收口(2026-06-20，D-051 续)
  # 挂起(D-039 AI 退治理，spec 留、复活触发=未来要 AI 参与治理判断)：GOV-MEMBER-STATUS-DERIVE / GOV-RULES-LAYER-DESIGN + D-032~035 治理派生整簇 + 自动派活 + freeIdle·双写债
# P1：~~INV-BOM 内核~~(已落地 2026-06-19，自保鲜护栏=对话记账/盘点不再造静态表，Hermes 自动记账仍待 HUB-HERMES-ADAPTER)+飞书 Bitable·sheets 读写+~~修 lark-cli bin bug~~(已修 5cb84cb)；P2：资料/代码批量整理(AI 安全车道)、给老师项目级汇报
blocked: []
open_for_decision:                       # ARCH-PATH(D-028)/提醒(D-026后续→D-037)/资源(D-029)/idle三态+静默(D-032)/受众路由(D-033) 已拍；以下待用户线下细化
  - ARTIFACT-VERSION-SEMANTICS           # 图纸版本语义：v2 已落地最小+回退(D-071)；真实文件上传/存储 = ✅HUB-ARTIFACT-STORE-MECH 本地卷版已落地(D-078，文件+云端链接双存)。仍 open 的进阶语义 = 手动钉旧版 pin(append-only supersede)/按车分支/跨赛季权威指针(D-036，别做完整 PLM)；电路驱动命名规范 = 用户内部待定
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

- 2026-06-21 **图纸文件链路收口 + 表单控件修缮 + 部署/版本修复（D-078）**：系统排查需求分析后两类问题——①图纸「半成品」(只登记无上传/存储无定论/下载摆设) ②表单控件错配(适配机器人·赛季窄下拉需手填、编号位过宽)。落地：契约 `ArtifactRef.storedFile`(可选指针，向后兼容)+`POST /api/artifacts/:id/upload`(multipart·50MB·后缀白名单·先验存在避孤儿·继承 H3 鉴权)+`artifact-storage.ts` 存储接缝(本地卷·D-025 不进 git·MinIO 留接口)+`GovStore.setArtifactFile` 三实现；console 上传/替换 UI + 文件/云端链接**双存**(行内双按钮)+条件下载(消灭摆设)；适配机器人/赛季 datalist 组合框(候选+手填，复用台账)+编号位 `.kb-field--narrow` 收窄；修部署 env-var(`ARTIFACT_ROOT`→server 实读的 `TEAMHUB_ARTIFACT_FILES_DIR`，原线上恒 404)；修版本号 lock 漂移(hub-contracts/console lock 停 0.0.1→0.4.1，硬化 `bump-version.sh` 同步 lock + `check-version-bump.sh` 加漂移哨兵)。worktree 隔离开发→rebase 上并发 session 提交(零冲突·保留其未提交 WIP)→FF 合并→push。三包 verify 绿(164/194/44)+真机 API 冒烟全过。
- 2026-06-20 **版本号自动更迭失效修复（D-074）**：对照 feiyue 找根因——AGENTS 从无「要 bump」规则 + 服务端缺 Tampermonkey 那种「不自增不更新」的天然强制函数 + D-052 半拉子修复（只让 `status.ts` 读 package.json、bump 留成没人执行的 TODO）+ monorepo 多包无单一产品版本 + 零 tag。方案落地：根 `VERSION`（产品单一真相）+ `scripts/bump-version.sh`（唯一改版入口，同步三包 package.json）+ `scripts/check-version-bump.sh` 哨兵挂 `pre-commit.sh`（warn，`VERSION_BUMP_STRICT=1` 升硬门）+ AGENTS §7/§2.3 成文。据 git tree 两法收敛**当前版本重定为 v0.4.0**（产品线 v0.3→v0.4 / TeamHub 纪元 0.1→0.4），三包 0.1.0→0.4.0。
- 2026-06-19 **无人值守实现轮**（4 commit `9861850`→`5cb84cb`，逐项 verify 全绿 + push）：① INV-BOM-CORE 第三支柱内核（contracts inventory.ts schema+派生 deriveInventoryLedger/deriveShortfalls+动作语义 applyPartAction / 落盘 FileInvStore / 三端点 / console 零件×车矩阵+一句话快记+缺料告警 / demo seed，照 inv-bom-core.md locked 零猜测）；② PRESENCE-IMPL 安全增量（deriveDisplayCode+SharedResource season/version/displayCode+repair/retired/disassembling 态+canBoardResource 接力释放级联 / RelayChainView 多车接力链+卡片页降级 / 反监视护栏升结构约束 / seed 26R1·26R2）；③ WSL2 真机 Playwright 验收全 PASS（矩阵活体 26R1/26R2 / damage 快记 9→8 刷新 / 零 memberId 泄漏，截图入库 docs/screenshots/wsl-*）；④ lark-toolkit execa bin 修（'lark'→'lark-cli'）。DEFERRED（记设计稿 §7.1 + commit）：PRESENCE fixture 调和+总联调=全组各一人语义、KB-LARK wiki/drive→KB 摄入——均无安全默认/需 schema 定稿。
- 2026-06-19 在场排班优化（D-072）定稿：对抗式设计审查（`wf_2f31074c-523`，55 claims·5 视角·对抗核实）+ 用户多轮拍板 → 设计稿出定稿版（两视图删甘特 / 单层「车=带编号对象」/ 删程序组领任务留汇报视角 / 宏观维修态+注释 / 接力释放「谁可下班」语义 / 预留=扣减归车 / v=代次 / 总联调全组各一人 / 多车并排）；零代码，下一轮 PRESENCE-IMPL 起实现。
- 2026-06-19 差异化排班 S1+S2+S3 + 文案 + 审计长尾（D-069 P1 连续自主批，5 commit `ece2a3b`→`052285d`）：SCHED-WIRE-EXISTING / SCHED-MEMBER-AVAILABILITY / STUDY-NARROW-DERIVE / CONSOLE-COPY-HUMANIZE / AUDIT-FIXES-LONGTAIL，每条独立 workflow + 2-lens 对抗核实，A 档全清。
- 更早完成条目（v2 后硬化 / 图纸档案 v2 / Harness 减负 / …）→ `docs/archive/completed-log.md`（完整时间线，亦见 `git log`）。
