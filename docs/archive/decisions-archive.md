# 已归档 ADR（decisions-archive）

> 被 supersede **或已定型** 的长期决策全文 / 完整推演，从 `decisions.md` 活账本移出（feiyue 式：活文件只留约束当前代码的 ADR）。
> 「已定型」= 决策早已拍板落地、结论仍生效，但当初的选项对比 / 可行性 / 拍板动作等推演已成历史，无需再占活文件。
> 原位留 stub 指针（状态 + 结论 + 仍生效约束）；git 历史亦可追溯。

---

## D-043 — 构建纪律双轨化：连续构建（Claude Code/workflow）vs 串行 atomic-task（弱工具），共享底座抽 §6.0 单一源

- 状态：**SUPERSEDED-BY D-066**（2026-06-15 harness 全改：主手册精简为 CC-centric、双轨/self-iterate 退役进 `archive/legacy-harness/`；串行轨 fallback = `archive/legacy-harness/AGENTS-serial.md` §6.A。原 DECIDED 全文留存追溯）
- 状态：**DECIDED**（甲方 2026-06-14 设计对话拍板；本 ADR = 构建纪律范式权威源；**supersede** `docs/planning/workflow-evolution.md` 的「保留 STOP / 不引入 continuous」旧立场；纯 docs/planning/skills，代码零改）
- 日期：2026-06-14
- 上下文：D-042 后开始三支柱连续构建，暴露旧 `AGENTS §6 Atomic Task Discipline` 的张力——它把「一次一个原子任务 + commit 后 STOP + 重走 atomic-task skill 第 1 步」当成**全员硬律**。但 `atomic-task` 是 `.agents/skills/` 三方共用权威源（§9：Codex / OpenCode / Claude Code 共读），而**只有 Claude Code 有 `Workflow` 工具**。这套串行 STOP 节流阀本是给「无编排能力工具」防跑飞的，当成全员硬律就**拖累 Claude Code 的连续构建 / workflow 编排**。甲方明确：**还会用弱工具**（Codex/OpenCode），故不能只留一套；倾向**物理隔离**两套，但担心「两份会漂移」。`workflow-evolution.md`（2026-05-17 forward-looking）当年因「还没用上 workflow」而明确**保留 STOP、不引入 continuous**，并设想「人写 plan → 串行执行」的 epic 两层模式——这一前提已被「现在用 workflow 自动 fan-out / 编排」的现实推翻。
- 核心洞察：
  1. **STOP 是「无编排能力」的护栏，不是普世真理。** 串行 + commit 后 STOP 防的是没有编排器的工具一路跑飞；有了 workflow（能确定性 fan-out / pipeline / 对抗核实）的 agent，连续构建是安全的，STOP 反成枷锁。故分档依据 = **能力**（有无 workflow/编排），不绑工具名。
  2. **「物理隔离怕漂移」的解 = 共享底座抽到中立单一源。** 把两套**共有**的工程卫生（原子单元定义 / completion gate 三件套 / 提交推送授权 / M1 候选池闭口 / M2 DoD 谓词 / M3 误提交自检 / DoD type 对照表）从 `atomic-task/SKILL.md` 抽到 `AGENTS §6.0`，两个 skill **只引用 §6.0、互不依赖** → 物理隔离（各读各的 skill）+ 单一源（底座不重复）→ 化解漂移担忧。
  3. **原子提交卫生与 STOP 是两件事。** 甲方拍板：保留「每原子单元各自验证通过 + 单独 commit/push」，只取消「全员硬 STOP / commit 后必须重走 skill」。连续 ≠ 大杂烩提交。
- 决策（甲方 2026-06-14 拍板）：
  1. **`AGENTS §6` 重写为双轨三段**：**§6.0 共享底座**（工具无关、所有 agent 必守，吸收 M1/M2/M3 + DoD 对照表 + completion gate + 提交授权）；**§6.A 串行轨**（无编排能力工具 Codex/OpenCode：一次一个 → 验证 → sync → commit → **STOP** → 重入）；**§6.B 连续/编排轨**（具 workflow 能力的 agent 如 Claude Code：拆原子单元清单喂 workflow 连续/并行、**不强制 STOP**、每单元仍各自 completion gate、小改动直接做不强起 workflow）。
  2. **分档按能力**（有无 workflow/编排），举例工具名但不绑死（将来弱工具有了编排自动适用）。
  3. **物理隔离两个 skill**：`atomic-task`（§6.A 串行，保留+收窄定位，M1/M2/M3/DoD 表改为引用 §6.0）；新建 `continuous-build`（§6.B 连续，引用 §6.0）。二者只依赖 §6.0、互不交叉引用。
  4. **保留每原子单元验证+单独 commit 卫生**；取消全员硬 STOP。
  5. **supersede `workflow-evolution.md` 旧立场**：当年「保留 STOP / 不引入 continuous / 人写 plan 串行执行 epic 两层」被本 ADR 取代——两层「拆解」思想被 workflow fan-out 吸收（continuous-build 的「分解→喂 workflow」），但执行引擎从「串行 STOP」换成「workflow 连续编排」。该文档标 `superseded-by D-043`、留原位追溯。
- supersedes / 细化：
  - **`AGENTS §6 Atomic Task Discipline`** → 重写为 `§6 Build Discipline（双轨）`；旧「同一时刻只允许一个原子任务」「commit 后必须重走 skill」降级为 §6.A 串行轨专属。
  - **`workflow-evolution.md`**（forward-looking，未激活）→ 旧立场被 supersede（见决策 5）。
  - **`.agents/skills/atomic-task/SKILL.md`** → 收窄为串行轨；底座外移引用 §6.0。
  - **不改** §5 设计宪法 / §7 Verify Matrix / §8 安全门 / §9 Skills Mirror 机制；DoD 对照表的历史抄录（`docs/superpowers/specs/` / `docs/archive/`，过去记录）。
- 影响：本 ADR + `AGENTS.md §6`（重写）+ `.agents/skills/atomic-task/SKILL.md`（收窄）+ `.agents/skills/continuous-build/SKILL.md`（新建，镜像 `.claude/skills/`）+ `docs/planning/workflow-evolution.md`（标 superseded）+ `docs/agents/workflow/README.md`（footer「当前生效工作流权威源」更新为双轨）+ `docs/design/team-hub-concept.md`（§12 + 概念段 §6 引用软化为双轨）+ `now.md`/`agent-state.json`（最近完成 + stage + 口径对齐双轨）。**纯 docs/planning/skills，不碰代码 / 服务器 / 真实数据**；hub `verify:all` 不涉及（未碰 apps/）。
- 事实源：本 ADR；2026-06-14 设计对话（甲方拍板：保留每单元验证+commit、取消全员 STOP、还用弱工具→双轨、物理隔离）；Explore 全仓交叉引用扫描（atomic-task / STOP / completion gate / DoD 对照表 / §6↔§7§8§9 / skill-library 同步）；`workflow-evolution.md`（被 supersede 的旧范式）；`AGENTS §6`/`§9`（被改）；`~/.claude/CLAUDE.md`（workflow 模型分档与 token 纪律）。


---

## D-053 — 自迭代外环（§6.C）+ 完成度模型 + M1 逃生阀（materialize-before-action）

- 状态：**SUPERSEDED-BY D-066**（2026-06-15 harness 全改：自迭代外环退役进 `archive/legacy-harness/`，`completion-model.yaml`/`agent-state.json`/`self-iterate` skill 一并冻结；D-039 AI 已退治理，外环不再驱动产品方向。原 IMPLEMENTED 全文留存追溯）
- 状态：**DECIDED / IMPLEMENTED**（2026-06-14；3-opus 设计→对抗红队 workflow `wf_3845c9c0-aa2` 硬化后落地；docs/skill/planning 纯文，verify 见下）
- 日期：2026-06-14
- 上下文：用户「搭建一个自迭代骨架，没任务时自行查看项目完成度，完成度不够则自动设立大目标、用 workflow 推进，atom-task 只用于提正确率+拆子 agent，让你能自己自然迭代而不是一直停下来等我看」。D-052 已注记**自迭代引擎其实已在**（§6.B continuous-build），过去每轮收尾即停的直接原因是 **frontier 空**（§6.0 M1 候选池闭口规定候选只在 backlog、不发散）+ 安全门 + 方向待拍。痛点不是缺引擎，是缺**外环**：frontier 空时谁来「找下一个大目标」。
- 核心张力与化解：「自动设立大目标」表面与 **M1 候选池闭口**（不读 roadmap 找候选、不凭空 frontier）冲突。化解 = **materialize-before-action 逃生阀**：外环不直接驱动凭空目标，而是先把合成的 epic **写成真 backlog 行（带 M2 工程谓词、状态 pending）+ 追本类 ADR + 进 frontier 并单独 commit**，唯此 commit 后该 epic 才成为「与人立项无异的普通 in-backlog M1 候选」再驱动。M1 的「候选只在 backlog」由此守住（外环只是**合规地往闭池里加**，不是绕过它）。
- 决策（落地形态）：
  1. **新增 §6.C 自迭代外环**（`AGENTS.md` §6 下，与 §6.0/§6.A/§6.B 并列，单一源）：8 步循环（读状态→frontier ready?→backlog ready?→**双重耗尽**则完成度检查→有 gap 合成 epic→物化进 backlog→交回 §6.B 驱动→守门重入），叠在 §6.B 之上、**驱动步引用交回 §6.B 不复写**（物理隔离不漂移）。
  2. **新建 `docs/planning/completion-model.yaml`**（derived-spec，低于 backlog/decisions）：每 deliverable 一条**机器可判谓词**（cmd_exit0/file_exists/grep_hit/…），gap = 谓词失败或 not-started，按 priority 排，gaps[0] = 下一大目标。seeded：KB/PM 读写 + KB-IMPORT + 设置页 = done（谓词当前过）；DEPGRAPH-* / INTEGRATIONS / COPY-HUMANIZE / AUDIT-H1·H3 = gap；INV-BOM/DEPLOY/AI-AUTODRAW = 产品门/§8 门（required 但合成时 open_for_decision）。
  3. **新建 skill `.agents/skills/self-iterate/SKILL.md`**：外环完整协议（8 硬化步 + 三锁逃生阀 + §5 门 + epic cap + budget/repair/cycle 守门 + must-stop + 输出 schema）；走 §9 镜像（Write 触发 sync hook）。
- **对抗红队硬化（`wf_3845c9c0-aa2` 裁「ship-able ONLY after guards」）——未硬化前不可夜跑**，三处致命缺陷已补：
  - **§5 宪法门缺失**（致命）：原设计 §8/§6.0 筛**不含 §5**，opus 合成的「大目标」由 roadmap 措辞、紧邻**挂起治理簇**（D-032~D-035：deriveMemberStatus/silence/谁慢了/受众路由），可能合成出违 I0/A1/C2/G2/G4 的 epic（如「完成计数看板」「成员状态派生」）而过掉所有现有筛 → **补：§5 门作合成第 0 子步 + 挂起治理簇硬封为 must-stop（自迭代永不复活，其复活触发是人类显式决策）**。
  - **EPIC CAP 缺失**：「双重耗尽」非真终止——逃生阀重填它刚抽干的池，无 cap 会整晚跨 roadmap 造活且「什么都没可信地完成」→ **补：每 invocation ≤1 合成，驱动完 STOP 等人审 checkpoint**。
  - **completion-model 自著可伪造 done**：自己写的 yaml + 弱 grep 谓词可让真 gap（AUDIT-H3 零鉴权、INV 支柱未建）读成 done 而早停 → **补：交叉核对每个 pending backlog 行 + done-flip 时 Bash 重跑谓词读 exit 0 + 禁 haiku 步写 'done'**。
  - 另补：M1「framing-not-harvesting」靠 **anchor 检查**钉死（gap 须溯到现存 backlog 行/已 accepted ADR，roadmap 只措辞）；§8+§5 **逐原子单元**重筛（非逐 epic）；每轮 fetch-before-push 防跨机分叉。
- 保守默认：`completion-model.yaml.audited:false` ⇒ 合成只 **propose-and-stop**（提议 epic + open_for_decision + STOP），**人审 completion-model 一次**（确认谓词打在真接缝、required/优先级合理）后置 `audited:true` 才 **propose-and-drive**。红队明确建议首版如此。
- 宪法守恒：纯 docs/skill/planning，无领域/契约/代码改动。**§5 宪法对外环每一步、每一原子单元同样硬**；I0/A1/C2/G2/G4 任何 auto-set 的 epic 必须照样过 §5 闸（与人立项同门）；M1 由 materialize-before-action 守、不凭空 frontier；§8 边界不变、自迭代不得越界；§10 完成度只认谓词通过、不认状态文字（物化 commit ≠ 功能 done）。
- 老实定位：① 外环在**单次 invocation 内**连续自迭代，**不是**跨进程永动机（agent 仍由调用触发；跨 invocation 续跑靠 `/loop` 或 ScheduleWakeup，本轮不建）；② 首版合成为 propose-and-stop（待 completion-model 人审），用户要的「全自动设目标+驱动」在 `audited:true` 后生效，一行翻转；③ completion-model 谓词是**近似**完成度信号（grep/exit code），非形式化证明，故须人审一次 + 交叉对账兜底。
- 验证：`git diff --check` 干净；`python3 -c yaml.safe_load` 解析 now.md + completion-model.yaml；`bash .agents/scripts/verify-skills-sync.sh`（新 skill 镜像一致）；grep 无悬挂引用（§6.C/D-053/self-iterate 交叉引用闭合）。
- 影响 / 落地：新 `.agents/skills/self-iterate/SKILL.md`（+ 镜像 `.claude/skills/`）、`docs/planning/completion-model.yaml`；改 `AGENTS.md`（§6.C）、`docs/planning/{decisions.md（本 ADR）, backlog.md, now.md, agent-state.json}`。**未来自迭代外环合成的 epic ADR 从 D-054 起编号。**
- 事实源：本 ADR；`AGENTS.md §6.C`；`.agents/skills/self-iterate/SKILL.md`；`docs/planning/completion-model.yaml`；workflow `wf_3845c9c0-aa2`（设计+红队）；用户 2026-06-14「搭建自迭代骨架」请求。

---

## v0.3 时代 ADR 簇（D-005 / D-006 / D-009 / D-014 / D-016）

> 从 `decisions.md` 活账本移出（2026-06-19 中等档压缩）。这些是 v0.3 ProbeFlash 时代的 ADR，D-018 已整体冻结 v0.3、代码 2026-06-09 删除（git 历史留存）；仍存活的一句事实已留在 decisions.md cluster stub。全文如下。

## D-005：schema 校验采用 zod，不走手写 type guard 路线
- 日期：2026-04-21
- 决策：`apps/desktop` 的运行时 schema 校验统一使用 [`zod`](https://zod.dev)（v3.x）。类型与校验都以 zod schema 为单一事实源，通过 `z.infer` 派生 TS 类型；读盘、AI 输出入库均使用 `safeParse` 以拿到结构化错误。
- 原因：单一事实源避免双份漂移；`safeParse` 返回结构化 `error.issues[]`，满足"仅重生无效字段"的反馈闭环；4 个实体多嵌套场景下手写 guard 代码量过大；zod 是纯本地 devDep，不引入远端调用；tree-shakable，社区成熟。
- 放弃方案：手写 `is*` type guard（样板量大、易漂移）；`ajv` + JSON Schema（双源易脱节）；`valibot`（生态较薄）。
- 适用范围：`apps/desktop` 与后续 Node 侧统一用 zod；`.agents/skills/*/SKILL.md` 里的 JSON 示例仍是规则说明。

## D-006：S1-A3 本地存储采用浏览器 localStorage
- 日期：2026-04-21
- 决策：S1-A3 阶段 IssueCard 的本地持久化使用 `window.localStorage`，键名固定为 `repo-debug:issue-card:<id>`。读取后必须经 `IssueCardSchema.safeParse`：通过返回 `{ok:true, card}`；未命中 / JSON 损坏 / schema 不符返回结构化错误（`not_found` / `parse_error` / `validation_error`），不得静默降级。
- 原因：最短路径跑通 MVP 闭环，与 S1-A4 进度解耦；纯浏览器本地持久化，不引远端调用、不依赖额外 MCP；Node 侧用 Map polyfill 即可 round-trip 黑盒测试；覆盖"重开"语义。
- 放弃方案：`.debug_workspace/active/<issueId>.json`（需 fs/IPC 桥接）；IndexedDB（key-value 单实体场景过重）；内存单例（不跨刷新）。
- 适用范围：仅 S1-A3 IssueCard 持久化；后续 InvestigationRecord / ErrorEntry / ArchiveDocument 落盘归 S2 归档链路。当前主链路已迁到 HTTP + SQLite，localStorage 仅作 fallback / verify 路径。

## D-009：S3 切换为存储迁移与服务器化
- 日期：2026-04-22
- 决策：S3 阶段切换为"存储迁移与服务器化"。当前优先目标是把前端从 localStorage 演示版升级为同一 WiFi 下可访问、服务器端长期存储的版本。
- 本阶段不做：AI、RAG、权限系统、Electron、fs/IPC、大 UI 重构、复杂统计、云同步或公网多租户。
- 原因：局域网共享与服务器长期存储是从静态演示走向战队可用的最短路径；继续推 AI/Electron 不解决多设备共享与数据长期保存。
- 放弃方案：localStorage 强行演示团队共享；立刻写后端跳过环境盘点；转向 AI/RAG。
- 影响：`current_mode = server_storage_migration` 至今仍生效；本地 WSL 最小闭环已通，正在做服务器路径下数据安全验证（DATA-01/03）。

## D-014：服务器部署采用 release tarball first
- 日期：2026-04-26
- 决策：服务器部署以 GitHub Release tarball 为主路径：下载固定版本资产，校验 `SHA256SUMS.txt`，解压到 `/home/hurricane/probeflash/releases/vX.Y.Z`，独立 Node runtime 启动，`current` symlink 指向当前版本，SQLite/日志/env 保存在 `/home/hurricane/probeflash/shared/`；服务器不作为开发 checkout，`git pull` 只是开发/调试方式，非正式部署方式。
- 原因：release 部署可重复、可校验、可回滚；避免源码树漂移、误用系统 Node v10、误删持久数据或把开发态当生产；`current` symlink + `releases/` + `shared/` 让版本切换与数据持久化解耦。
- 放弃方案：服务器长期 `git pull`；把 `shared/data` 放进 release 目录；未校验 SHA256 直接运行；写 `/opt`；直接 systemd；抢占 80；升级全局 Node。
- 影响：DEP-01~06 已按此路径完成（含 systemd reboot 验证）；后续升级 / 回滚遵循同一约定。

## D-016：UI 大问题先进入受控 UI 修复链路，TECH-07 只作为中间支撑
- 日期：2026-04-30
- 决策：B 组 repo-local 功能完成后，优先进入受控 UI 修复链路而非先做 broad refactor；具体顺序：`UI-01` → `UI-GATE-01` → `TECH-07` → `UI-GATE-02` → `UI-MOD-01` → `UI-GATE-03` → `UI-RELAYOUT-01` → `UI-GATE-04` → `UI-POLISH-02` → `UI-GATE-05` → `UI-POLISH-03` → `UI-GATE-06`。每个 gate 必须等用户人工 review 通过才能继续。
- 原因：UI 是当前验收观感最大问题；UI 改动必须先有信息架构与人工方向确认；`TECH-07` 价值是降低 `App.tsx` 冲突面，不应独立变成技术洁癖式重构。
- 放弃方案：B 组后直接做 `TECH-08` / `TECH-09` / `TECH-10`；全量重写 `App.tsx`；绕过人工确认大改 UI；引入组件库或 broad CSS reset。
- 影响：UI gate 链已执行至 UI-GATE-06；当前必须停在用户人工 review 桌面/移动端观感，未通过前不得自动进入下一轮 polish。**已被 D-018 覆盖：v0.3 整体冻结，UI-GATE-06 不再推进。**

---

## D-021 — 飞书 gateway 路径选型：完整推演（已定型）

> 决策已定（路径 A：`@larksuiteoapi/node-sdk` + Long Connection，2026-05-19 用户拍板并上线），活账本只留结论 + 当前约束。以下是当初的选项 A/B 全描述、权衡表、备赛期可行性、「拍板已落实动作」清单，以及 `D-020 后续`（OSS-SCAN 结论）/ `D-021 后续`（lark-connector 设计草案）两子节全文。

## D-021：飞书 gateway 路径选型——用开源 SDK 还是自写最小 gateway
- 日期：2026-05-19（草稿）→ 2026-05-19（用户拍板）
- 状态：**DECIDED**。2026-05-19 用户拍板路径 A，附加两项接受："SDK 作长期依赖"、"启用 SDK 的 Long Connection 模式"。用户原话："A，全部接受，先接进去看看，有问题或者有时间再去优化"。
- 输入来源：D-020 + D-020 后续（`docs/research/lark-api-capability.md` + `docs/research/lark-oss-candidates.md`）
- 决策范围：备赛期 ProbeFlash 实现"飞书 @机器人 收到调试症状 → 调 debug-checklist skill → 飞书群内回复检查单"最小闭环的代码层选型

### 最终决策（2026-05-19 用户拍板）
**路径 A：用 `@larksuiteoapi/node-sdk` 作为飞书侧基座。**

附加决定（用户已接受）：
1. **`@larksuiteoapi/node-sdk` 作为长期依赖**：接受上游政策变更带来的迁移成本；备赛期不预留"脱依赖"的工程预算。
2. **启用 Long Connection 模式作为备赛期短期方案**：用 SDK 内置的长连接订阅模式绕开"固定公网 IP 白名单"约束；备赛期不要求用户先准备固定公网 IP 服务器。备赛后若有时间或出现具体性能问题，再切换到 Webhook + 固定 IP 模式。
3. **执行节奏**："先接进去看看，有问题或者有时间再去优化"——LARK-01 / LARK-03 / LARK-ONBOARD 推进时按 MVP 范围执行，不在 MVP 阶段做性能优化 / 容错加固 / SDK 替换准备。

### 决策依据（拍板前的 AI 推荐 + 用户接受）
理由（按权重排序）：
1. **能力契合 8/8 直接覆盖**——`lark-api-capability.md` §8.1 列的 MVP 8 项需求被 SDK 全部内置，无认知缺口。
2. **加解密链路自实现是大风险**——AES-256-GCM 解密 + HMAC 签名校验自己写时错一行就漏数据/拒收事件，备赛期没时间打磨这条链路。SDK 已经在生产规模下打磨过，复用边际收益显著高于自写。
3. **备赛期时间窗短**——~50 行 vs ~250 行 + 单测 的差距，在备赛期约 1 周的窗口内是"半天 vs 三天"的差距，且后者还要承担加解密 bug 的潜伏成本。
4. **路径 A 不阻断后续脱开**——如果未来要去依赖，gateway 部分可以局部替换；SDK 引入的代码集中在 1-2 个文件，迁移成本可控。
5. **OpenClaw 系桥接器（如 `clawdbot-feishu`）协议方向错位**——ProbeFlash 不是 LLM agent，不应套用 agent channel 协议。

### 选项 A（已采纳）：用开源 SDK `@larksuiteoapi/node-sdk`
- 仓库：`larksuite/node-sdk`（MIT，TypeScript 原生，2026-05-14 推送，267 stars）
- ProbeFlash 集成代码量：~50 行（构造 Client + EventDispatcher.register + Long Connection 启动 + im.message.create）
- 已内置：Token 自动刷新 / AES-256-GCM 解密 / Challenge-Response / 签名校验 / Express+Koa 适配器 / 长连接模式（备赛期主用此模式）
- 引入依赖：`@larksuiteoapi/node-sdk` 一个 npm 包

### 选项 B（未采纳）：自写最小 gateway（零飞书 SDK 依赖）
- 工程量估算：~250 行核心代码 + 加解密链路单测（详见 `lark-oss-candidates.md` §5.1）
- 模块：Webhook 入口 / Challenge-Response / AES-256-GCM 解密 / HMAC-SHA256 签名校验 / Token 缓存与刷新 / 消息发送 / 错误处理与指数退避
- 已存在的脚手架：`docs/archive/pre-pivot-plans/2026-05-16-lark-gateway.md`（保持 `status: forward-looking`；本 ADR 选路径 A，不激活此 plan）
- 引入依赖：仅 Express + Node `crypto`（标准库）；可选 `zod` 做 payload 校验

### 主要权衡

| 维度 | 路径 A 优势 | 路径 B 优势 |
|------|------------|------------|
| 时间窗 | 集成快 | — |
| 依赖控制 | — | 零飞书依赖，无版本锁 |
| 加解密 / 签名链路 | 内置已验证 | 完全可控、可审计 |
| 后续扩展（卡片 / 多维表格 / OAuth） | 低成本 | 高成本（逐 API 自实现） |
| Bundle 大小 | 较大但可 tree-shake | 最小 |
| 备赛后回看 | 上游政策变更需迁移 | 自己持续跟官方文档 |

### 备赛期可行性
两条路径均备赛期可行：
- 路径 A 备赛期可行性：**强**——约半天到一天可跑通 webhook 入站 + 回复消息闭环（前提：用户线下完成飞书后台注册 + 4 个凭证写入 `.env`）。
- 路径 B 备赛期可行性：**中**——~3 天工作量（含加解密单测）；需用户对加密代码有时间审计；若加密链路 bug 排查容易吃掉一天以上。

两条路径都**不依赖** AnyBridge / 多维表格 / 卡片流式更新（都在 MVP 外）。
两条路径都**必须**先解决：
- 4 个凭证：`app_id` / `app_secret` / `encrypt_key` / `verification_token`（用户线下注入 .env）

固定公网 IP 在本 ADR 决策下**不再是路径 A 的硬约束**（启用 Long Connection 模式绕开）；备赛期保留固定 IP 准备工作给"将来切换到 Webhook 模式"，不阻塞备赛期 MVP。

### 拍板已落实的动作（2026-05-19）
1. ✅ 本 ADR 头部从 `（草稿 / DECISION-NEEDED）` 改为 `DECIDED`；"AI 推荐"段已重写为"最终决策"。
2. → LARK-01-CONNECTOR-ARCH 从 `now.md.blocked` 提升到 `frontier`（本 commit 同步）。
3. → `docs/archive/pre-pivot-plans/2026-05-16-lark-gateway.md` 保持 `status: forward-looking`（路径 A 不激活此 plan）。
4. → LARK-03-MIN-INTEGRATION 推进时直接基于 `@larksuiteoapi/node-sdk` Long Connection 模式实现。

### 放弃方案（不考虑）
- `larksuite/oapi-sdk-nodejs`：DEPRECATED，3 年未更新（D-020 后续段已列）
- `lark-openapi-mcp`：MCP 协议方向相反，给"LLM 调飞书 API"用，不是"飞书消息进 ProbeFlash"
- `openclaw-lark` / `clawdbot-feishu` / `AlexAnys/feishu-openclaw`：OpenClaw 协议错位，ProbeFlash 不是 LLM agent
- 飞书 AnyBridge 商业集成平台：备赛期不采购商业版
- 飞书原生自动化流：免费版 200 次/月 死锁（D-020 § 自动化流）
- 自写最小 gateway（选项 B）：路径 A 已采纳，本期不并行做 B；备赛后若出现 SDK 锁定 / 性能问题再重评

### D-021 后续：lark-connector 设计草案落地（2026-05-19, LARK-01-CONNECTOR-ARCH）
- `docs/design/lark-connector.md`（status: draft）已落地：11 节覆盖范围 / 模块拆分 / 接口契约 / 数据流 / 错误模型 / 凭证边界 / 部署形态 / 测试策略 / 扩展路线 / LARK-03 验收标准。
- 关键架构决定（在 D-021 框架内）：
  1. 新建独立子包 `apps/lark-gateway/`（不动 v0.3 冻结代码）
  2. 采用 SDK `WSClient` + `EventDispatcher` 底层 API（非高级 `createLarkChannel`），保留显式控制
  3. **Mock-first 调度模式**：`skill-dispatcher.ts` 提供 mock / claude / deepseek 三分支，MVP 阶段强制 mock；claude/deepseek 留 stub 抛错。理由：MVP 不踩"真实 provider key"边界，飞书链路先打通
  4. Long Connection 模式下不需 encrypt_key / verification_token（连接时鉴权，事件明文推送）→ .env 仅 4 字段：`LARK_APP_ID` / `LARK_APP_SECRET` / `LARK_BOT_OPEN_ID` / `LARK_DOMAIN` + 模式开关 `PROBEFLASH_SKILL_MODE`
  5. 3 秒 ack 边界：mock 模式纯本地字符串拼接远在 50ms 内；后续接 LLM 时改异步链路
  6. SDK 集群行为：Long Connection 不广播，多实例只 1 个随接 → 战队服务器跑 1 实例足够
- 本条不构成新决策，是 D-021 的实现细节展开；LARK-03 代码落地后如有偏差回头更新 design doc 并把 status 升 `stable`。

---

## D-026 — 制度化进度治理系统 thesis + 设计宪法三层重构：完整论述

> 「制度化进度治理系统」产品定位已被 D-037（定位回中：CASE 工具 + 交流中心 + 数据库）+ D-039（AI 退出治理）实质反转；四层架构骨架 + I0/C/G/A 宪法仍是承重件，现行正文在 `AGENTS.md §1/§2/§5` 与 `docs/design/team-hub-concept.md`。decisions.md 留宪法/架构 stub。以下是 D-026 主体 + 「D-026 后续：提醒模型 / AI 边界拍板」全文（提醒模型的 A3/A4 执行细则现行版在 `AGENTS.md §2.2` A 原则 + D-037）。

## D-026 — Teamhub 升级为制度化进度治理系统 + 设计宪法三层重构

- 状态：**DECIDED**
- 日期：2026-06-09
- 上下文：2026-06-08 讨论中用户把 Teamhub 的"魂"讲清楚了，方向比 D-024/D-025 更进一步。D-024 把 Teamhub 定位为"信息路由器 + 后端运维控制台 + adapter 底座"（监控 broker），并在 `team-hub-concept.md §4` 把"大型项目管理系统 / 权限系统 / 多租户"列为非目标。但真实需求是：跨组协调 + 管进度 + 不让某些人干太多；当进度卡住、当事人羞于开口时，靠制度让系统替他把卡点说出来，并提前暴露"没人去满足的隐含依赖"，让所有人动起来。这恰恰要求被 D-024 列为非目标的能力（轻量项目管理 + 角色 + 组织树）。监控 broker 定位与该魂结构错配，需自觉演进。
- 决策：
  1. **产品定位**：Teamhub 从"监控 / adapter broker"升级为**制度化进度治理系统**（机器人战队、5-15 人小作坊、无硬截止、轻量）。
  2. **四层架构**（每层只依赖下层）：①数据真相层（项目/赛季 · 成员+角色+资历 · 可配置组织树 · 任务+依赖 DAG · 前置需求 Need）→ ②规则/治理层（卡点 / 过载 / 沉默 / 升级判定——产品的魂）→ ③展示/汇报层（动态最短任务周期图 · 给老师的自动汇报）→ ④触点/集成层（飞书是脸 · Hermes / 小龙虾 / Claude Code / Git adapter）。
  3. **路线 A（系统是大脑、飞书是脸）**：真相在系统关系库；飞书只做汇报 / 通知 / 一键 check-in / 自动生成老师汇报；**不双写**。飞书多维表格因关系弱 / QPS 低 / 写冲突 / 上手难，**不作数据层**。
  4. **三层角色 + 资历维度**：super admin（系统维护者 + 队长）/ group admin（组长）/ member（队员）；member 带年级 / 资历维度，系统对低资历更主动兜底。组织树可配置（机械 / 电路 / 程序{电控, 视觉}，可能合并），不写死。
  5. **按赛季分项目**：RoboCon 每年新车 = 新项目；人员 / 经验跨赛季沉淀。
  6. **前置需求 Need = 一等公民**：任务→需求{描述, 提供方, 状态}；人工填 / AI 建议 / 本人确认。
  7. **进度自动派生 + 无硬截止**：状态尽量从 Git 提交 + 轻 check-in + 沉默超期检测派生，不要求队员日常打卡；不设 deadline，只发可一键回的轻提醒（在忙 / 不太会 / 缺个东西 / 正常推进中），系统不猜原因。
  8. **可视化 = 动态最短任务周期图**：任务依赖 DAG，高亮关键链 / 收敛点（总联调）/ 阻塞链；缺口 = "待点亮的红点"。先做"结构 + 状态"高亮版，CPM 精确工期为远期。
  9. **设计宪法三层重构（方案 2）**：把原 5 条扁平宪法重构为【核心原则 C1-C5】+【治理专属原则 G1-G5】+【反监视四原则 A1-A4】；源在 `AGENTS.md §5`，README / roadmap 派生。旧 `#1-#5` 映射 `#1→C1 … #5→C5`。
  10. **已建 Hub 壳子复用**：hub-server / hub-contracts / hub-console / Compose 作为四层架构里的"触点/集成 + 展示底座"保留；治理域是新增核心。
- **supersede 的旧非目标（本 ADR 有意识推翻）**：
  - `team-hub-concept.md §4` / D-024："不做大型项目管理系统" → 改为"做**轻量**进度治理（5-15 人、无硬截止、结构+状态）"。
  - `team-hub-concept.md §4` / D-024 / `backlog.md`："不做权限系统、多租户" → 改为"做**轻量**三层角色 + 可配置组织树，不做完整 RBAC / 多租户 / 大型 PM"。
  - `docs/superpowers/specs/2026-05-18-bridge-roster-design.md`：飞书多维表格做数据 backbone（人填→系统只读）→ 被路线 A **反转**（系统库做真相，飞书是脸）。模型可复用，载体反转。
  - 旧六段式 Hub 架构（Ingress→Router→Adapter→Bridge→Index→Console）→ 升级为四层，新增"规则/治理层"为魂。
- **被继承 / 部分覆盖的 ADR**：
  - D-018 / D-019：设计宪法来源，被本 ADR 三层重构**继承 + 强化**（D-019"产能不可比"升级为反监视四原则 A，红线扩展到任何角色含老师）。
  - D-024 / D-025：技术栈结论（Node/TS、Postgres、Forgejo、Compose）仍有效；产品定位（监控 broker）被本 ADR 覆盖为治理系统。
  - D-020 / D-021 / D-022：飞书路径 A（SDK + Long Connection）仍有效，作为触点 / 集成层实现。
- 替代项：
  - 守在 D-024 监控 broker 定位：实现轻，但承载不了"制度化暴露卡点 / 缺口"的魂，与真实需求结构错配。
  - 保持 5 条扁平宪法只加子句（方案 1）：下游编号不破，但新魂藏在追加条里主次不突出（用户拍板方案 2 重构分层）。
  - 飞书多维表格做数据层：关系弱 / QPS 低 / 写冲突 / 上手难（上次推广失败主因），否决。
- **开放（待后续拍板，不阻塞本 ADR）**：
  - 架构走法：治理为主轴（hub-contracts 设治理为核心域）vs 治理作 Hub 之上平行模块。
  - ~~提醒可见范围 / 送达机制~~ → **已于 2026-06-10 拍定，见下「D-026 后续：提醒模型 / AI 边界拍板」**。
- 适用范围：mode `governance_design`；后续治理数据模型、规则层、展示 / 汇报层、触点集成的所有新工作。v0.3 冻结包仅历史 + 致命补丁。
- 后续任务：治理数据模型 epic（Project/Season、Member+role+资历、Group 组织树、Task+Dependency、Need）→ 规则 / 治理层 epic（卡点 / 过载 / 沉默 / 升级）→ 展示层（动态最短任务周期图、老师汇报）→ 触点层（飞书 check-in / 通知派生）。
- 事实源：`docs/design/team-hub-concept.md`（重写中，骨架先行）+ `AGENTS.md §1 / §4 / §5`。

### D-026 后续：提醒模型 / AI 边界拍板（2026-06-10，REMIND-MODEL）
- 触发：用户由"把先进技术包装成更精细、更隐蔽的监视器 = 换不来效率反而是控制"的反思，重新界定 AI 在治理里该做 / 不该做什么。判别标准：**被观察者是否是信号的第一受益人、能否无代价地忽略提醒**——若系统价值只在"上面能看到下面"时才成立，则措辞再温柔也是刷了漆的监视器。
- 拍定（解决 D-026「提醒可见范围 / 送达机制」开放项）：
  1. **提醒 = 队长轮询劳动的自动化替身**，不是新增一个"系统盯人"的功能。第一受益人是被催的队员（一条可一键回、可忽略的消息）与队长（不必逐个开口催）；它替换掉的是已经存在、更难受的"人盯人"。
  2. **送达 = 私聊本人**：「该你动了」类提醒先私下给本人，帮忙口吻、可一键回（在忙 / 不太会 / 缺个东西 / 正常推进中）。
  3. **可见范围 = 升级的是事不是人**：对轻提醒的沉默**不**升级为对人的负面信号；只有"某个 Need 持续无人认领"这一**事实**（不挂人名）才升级为缺口任务级、对相关方可见。老师只看项目级，组长看本组缺口级（任务缺 X，不是人慢）。
  4. **AI 边界三分界（C4 / A 的执行细则）**：**起草不发送**（AI 把"找电路组要测试板"的话起草好，发送键本人按——"替你说"收缩为"帮你开口"，agency 留在本人，开口的成长也归本人）；**建议不判定**（"疑似卡住"是系统内部状态，对人输出永远是疑问句不是结论，判定权留本人 / 组长）；**检索不评价**（知识 / 历史 / 找对人放开手脚做，因检索过去不评价现在的人）。
- 落点：`AGENTS.md §5` A3 / A4 同步锐化（"替你开口"→"帮你开口（起草不发送）"；A4 增"沉默不升级为对人信号、AI 建议不判定 / 检索不评价"）；`now.md.open_for_decision` 移除 REMIND-MODEL（ARCH-PATH 仍开放）。
- 关联：本拍板确立"系统给得比拿得多"是观察资格来源；其正面纲领（给的那一侧做厚）由 D-027（成长轴 / 知识图谱）承载。

