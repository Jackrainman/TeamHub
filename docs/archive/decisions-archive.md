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

---

## D-076 — IA 重构阶段 2/3/4：项目页 + 知识页 + 导航分组（一轮收尾）+ 表单一致性【SUPERSEDED-BY D-077·全文归档】

> 2026-06-21 被 D-077 supersede（用户验收：知识页错误合并图纸档案＝两数据域八竿子打不着、洞察分组不该可折叠）。下为 D-076 原文全文，留作真相可追溯。活账本仅留 stub（见 decisions.md D-076）。Phase 2「项目页」设计仍有效、被 D-077 沿用。

- 状态：**DECIDED / IMPLEMENTED / VERIFIED / MERGED（已并入 master `4da245e`，2026-06-20 干净 ff push origin/master——云端 `a4033b8` 先已并入工作分支；分支 `ia-phase2-4` 已 push、可清）**（2026-06-20；前端为主 + 零契约/端点改；4 层 workflow 落 3 commit；本机三包 `verify:all` 全绿 + **WSL2 真机 Playwright 10/10 PASS** buildId `d0f858c`，截图 `docs/screenshots/wsl-ia-phase2-4-*`，结果 `wsl-ia-phase2-4-results.json`）。
- 上下文：D-075 阶段 1（机器人队页）已落地，但用户 2026-06-20「左侧还是一大堆」——阶段 1 仅 10→9 看不出，视觉 declutter 全在阶段 2-4。沿用 D-075「组合不重写」。spec = `docs/planning/ia-refactor-next-prompts.md` PROMPT 1+2，上游 `docs/design/sched-date-relay-robot-redesign.md` §B。本轮单开 `ia-phase2-4`、不在 master 直改；master 回并推迟到收尾（云端 a4033b8 已干净并入工作分支，merge-tree 零冲突实证）。
- **用户拍板的覆盖项（优先于 spec 旧措辞）**：
  1. **gaps = C（独立顶级洞察项，非并入项目页 Tab）**：用户要求「以用户视角再讲一遍」后拍板——「缺人方向」是全队层面、只读、扫一眼的体检报告（哪个组缺哪个方向人手、只到组不点名＝I0），性质同「总览」＝仪表盘，故**留作顶级导航项、归洞察区与总览并排**，不并进项目页。→ 项目页只合 看板+依赖图（两视图切换），导航 **9→8→7**（非旧 spec 的 9→7→6）。原 spec「gaps 降为项目页洞察 Tab」与「洞察区＝总览/缺人方向」自相矛盾，C 解之。
  2. **Phase 4 = 仅导航分组，无工作台**：落地页**保留「总览」不变**（不新建工作台页、不做被卡项 CTA 落地页）——避免唯一非「组合」的新页。砍掉旧 PROMPT 1 Phase 4 的「默认落地改工作台」那段。侧栏平铺→分组：主操作区(项目/知识/库存/机器人队) ｜ 洞察区(总览/缺人方向，可折叠) ｜ 设置。
  3. **表单一致性（PROMPT 2）并入 Phase 3**（archive 表单搬进知识页时顺手对齐机器人队 create 表单）：① 赛季统一**下拉** `seasonOptions(now)` ±2 年自动猜 + 「其它/手填」兜底（覆盖历史车，无需问用户）；② 第三项**保留两套语义**（`archive.robotCode` R1/R2/universal＝图纸适配哪台车 ｜ `fleet.robotTarget` R1/R2/shared＝实体占哪编号位），**契约枚举值不动**，只统一控件风格 + 文案规范（「通用」vs「共享」各自语义清晰）；③ 两处控件够像可抽共享 `<SeasonSelect>`，否则不强求。
- 决策（沿用 D-075 组合不重写、零契约/端点改）：
  - **Phase 2「项目」页** `features/project/ProjectPage.tsx` 新建：组合 `<PmBoardPage>`+`<DepGraphPage>`，顶部视图切换（看板⇄依赖图）；单一录入入口（一个 `PmCreatePanel`，去依赖图页重复建边/建任务入口）+ 单一改状态入口（两视图都能改）；`App.tsx` 的 `focusTaskId` 跨页跳转改**页内视图切换 + 选中**、去跨页 plumbing。导航删 pm/dep-graph 加 project，gaps 留。【D-077 沿用此页设计】
  - **Phase 3「知识」页** `features/knowledge/KnowledgePage.tsx` 新建：组合 `<KbSearchPage>`+`<ArchivePage>` 多 Tab；KB 结果 `archiveFileName`/归档指针做可点链→跳档案 Tab 定位。导航删 kb/archive 加 knowledge。+ 表单一致性（见覆盖项 3）。【❌ D-077 推翻：知识页与图纸档案拆开】
  - **Phase 4 导航分组**：`ConsoleLayout` `navItems`→分组 `navGroups`（主操作区/洞察区可折叠/设置）；`ConsolePage` 联合 + `App.tsx` 三元 + `TITLE_KEY` 收口；i18n nav.* 重整 + 删孤儿键（双侧成对）。落地页留 `overview`。【❌ D-077 推翻：导航全摊平、删折叠组】
  - 终态导航 7 项：`overview`(洞察) / `project` / `gaps`(洞察) / `knowledge` / `inv` / `fleet` / `settings`。【D-077 改 8 项扁平】
- 铁律（继承 D-075）：组合不重写（`PmBoardPage`/`DepGraphPage`/`KbSearchPage`/`ArchivePage` 原样复用，只外层加视图/Tab 容器 + query-key 协调仿 D-075 prefix 失效）；@xyflow 两块画布（依赖图嵌 Tab 后）容器定高仿 D-075 `clamp` 防塌高/visibility:hidden；I0 反监视（项目页/缺人 Tab 仍只到组、不下钻人，grep memberId 净）；契约/端点零改（仅 UI）；本机三包 `verify:all` 全绿（typecheck 兜 union 收口 + i18n 双侧 key 平衡）；WSL2 4177 真机 Playwright + 截图 `docs/screenshots/wsl-ia-phase2-4-*`；3-4 独立 commit、收尾 push。
- 工作流：4 层 workflow（design 3 opus 并行 / 对抗式风险审查 2 opus 出 12 条 must-fix·4 blocker 全处理 / 实现 3 opus 顺序 Phase2→3→4 各 commit·各阶段 console verify:all 全绿 / 终验 1 sonnet 三包 verify + grep + i18n 平衡）。commit：Phase2 `9b090b7` / Phase3 `9147462` / Phase4 `d0f858c`。
- **实现期已落决策（两处对原 spec 的合理偏离 + 一处设计选择）**：
  1. **archiveFileName 不做可点链（spec 偏离·已采纳）**：原 spec「KB 结果 archiveFileName 做可点链跳图纸档案 Tab 定位」基于一个误判——KB 的 `archiveFileName` 是**调试结案归档 markdown**（`.debug_workspace/archive/YYYY-MM-DD_<slug>.md`，源 `kb-similar.ts` firstArchive.fileName）；而「图纸档案(archive)」页渲染的是 `ArtifactRef[]`（CAD 图纸/固件 + 版本时间线）。**两个不同数据域、无外键**，仅共用「archive」字样。做成跳转链会指向不存在对象。故知识页两 Tab 纯并置、archiveFileName 保持 KbResultCard 里只读 mono 展示。契约/端点零改。（spec 写成「可点链」是当初把两个 archive 混淆，实现期风险审查捕获。）【D-077 据此把两页彻底拆开】
  2. **抽了共享 `<SeasonSelect>`（采纳 spec 选项③）**：赛季「下拉 + 其它（手填）兜底」逻辑抽进 `components/SeasonSelect.tsx`，archive 提交表单与 fleet create 表单两处复用。机器人队 create 赛季从自由文本 `<input>` 改为下拉（真机实证：select 含「其它（手填）」option）。robotCode/robotTarget 枚举值零改。【D-077 沿用】
  3. **导航分组形态**：主操作区**无组标题**（项目/知识库/库存/机器人队 直接顶部排列）、洞察区有可折叠标题「洞察」（总览/缺人方向）、设置无标题——比「每组都加标题」更干净，洞察区因要折叠才需 header。【❌ D-077 推翻：删折叠】
- 验证：本机 console/contracts/server 三包 `verify:all` 全绿；i18n zh/en 双侧各 465 键平衡；终态导航 7 项 [overview/project/gaps/knowledge/inv/fleet/settings]。**WSL2 真机 Playwright 10/10 PASS**（rainman@100.78.202.84，buildId `d0f858c`，bundle 过 SSH 传 + 单会话起服 4177 + Playwright，截图 `docs/screenshots/wsl-ia-phase2-4-*` + `wsl-ia-phase2-4-results.json`）。
- 事实源：本 ADR；spec `docs/planning/ia-refactor-next-prompts.md` PROMPT 1+2；上游 `docs/design/sched-date-relay-robot-redesign.md` §B；前序 D-075（阶段 1）。后继 D-077（修正）。

---

## D-060 — console 换 Aurash 风格 UI 评估：PILOT-FIRST，当前低优先级延后（业务逻辑先行）【SUPERSEDED-BY D-084·全文归档】

> 2026-07-12 被 D-084 supersede（用户拍板改走科技风方向，落地为第 4 套主题 `tech` 并设默认；Aurash 暖纸风换肤提案就此关闭）。下为 D-060 原文全文，留作真相可追溯。活账本仅留 stub（见 decisions.md D-060）。

- 状态：**DECIDED / DEFERRED**（2026-06-15）——结论已定、暂不动手；优先级靠后，先理业务逻辑。
- 日期：2026-06-15
- 上下文：用户问「换 Aurash 风格 UI 是否可行/合适」。Aurash 前端（`/home/winbeau/wenbiao_zhao/Aurash/frontend`，= AGENTS §2 警告的 `xju-feiyue` 参考项目，业务模型禁搬入）栈 = Tailwind 3.4 + shadcn/ui(new-york/stone) + 19 Radix primitive + tokens.css 单色源 HSL 桥 + next-themes + sonner；console 现状 = 单一手写 `styles.css`(1392 行) + CSS-var 主题、无 Tailwind/Radix/router/暗色/toast、`App.tsx` useState 切页、@xyflow 画依赖图、zh/en 双语、I0 反排名读视图。先出结论给用户拍板、不直接重写。
- 调研：6-agent workflow `wf_0d35c8af-968`（2 sonnet 侦察 + 3 opus 对立视角[拥护/质疑/务实] + 1 opus 综合）；结论关键事实经 orchestrator 对代码核实（OverviewPage 零共享 primitive / @xyflow style import + EDGE_COLORS JS 常量 / 3 条 I0 串行号 / styles.css 1392 行 / 五库全无）。
- 决策（结论）：**PILOT-FIRST**。
  1. **Phase 0（换 ~15 个 `:root` token + 2 字体，<1 天，0 .tsx/0 依赖/0 框架风险）拿 ~80% 暖纸风视觉收益**——只想要"好看"到此为止。
  2. 全套 Tailwind+Radix+shadcn = **7–14 人天**，唯一真工程收益 a11y（录入浮层无焦点陷阱/Esc/焦点恢复）只在浮层/表单 + 设置页 select **两处**有意义 → 对一个在跑/双语/~10–20 人用的 5 页内部工具**默认不做**；先用 **OverviewPage** 试点（~1–1.5 天）+ 决策门（verify:all 绿 + 团队主观签字 + bundle 增量可接受 + 其余四页无回归）验证再决定整站。
  3. 全套 19-Radix Option C（2–4 人周，+60–100KB gzip JS）= 过度工程，不做。
  4. **共存关键开关 `corePlugins:{preflight:false}`**（否则砸烂 @xyflow + styles.css 盒模型）。
- 护栏（重写时不可破）：① I0 反排名 3 条承重串（`depgraph.entry.note`/`depgraph.detail.ownerNote`/`pm.create.subtitle`）+ ownerLabel 不上节点脸 + 看板无人均列 + `claimedByMemberId` 强制 null（AGENTS §5 / D-056）；② zh/en 编译期 parity（`Record<TranslationKey>`）；③ @xyflow 契约（preflight:false + `.dag-node--blocked-idle` 斜纹手写 CSS + EDGE_COLORS/NODE_W/H 手改）；④ **绝不搬 xju-feiyue 业务模型**（`cat-*`/`tag-*`/`ai-*` token、credits/conferences/schools/admin 组件、飞跃品牌文案——AGENTS §2）。
- 老实定位：本条是**"优化"类，排名靠后**；用户明示先把业务逻辑理清（"业务也有点问题"）。UI 评估只落档不驱动，动手前须过决策门。
- 事实源：本 ADR；`docs/research/aurash-restyle-assessment.md`（status: deferred，完整 ①②③④ + 分歧）；workflow `wf_0d35c8af-968`；`AGENTS §2`（xju-feiyue 禁搬入）/ `D-056`（I0 读视图）。

---

## D-018：v0.3.0 退役；新方向以 Skill / Bridge / Trail 三 facet 替代单体 issue tracker
- 日期：2026-05-07
- 决策：ProbeFlash v0.3.0 作为完整作品冻结，不再加功能 / 重构 / polish / 写新 verify。后续方向不再做单体 issue tracker，按时间维度拆成三个独立 facet：
  - **当下**：Skill `debug-checklist`——一句症状描述 → 5-8 条带依据和验证动作的检查清单 → 可选写入 `.debug-archive/*.md`。
  - **现在 / 即将**：Bridge（联调板）—— `ROSTER.md` 极简看板，记"我做什么 / 等谁 / 谁等我"，无 server。
  - **过去**：Trail（足迹档案）——静态 viewer，读 `.debug-archive/`，三种视图（个人足迹 / 模块史 / 赛季年鉴）。

  所有数据为 markdown + git native，无 SQLite，无新 server。备赛期只允许 Skill 自用 dogfood；Bridge / Trail 备赛后启动。
- 原因：v0.3 形态本质是"跨组需求单"——为大组织异步协作 + 责任划分 + audit 设计。但目标用户（机器人战队）是 5-15 人小作坊：群里吼一声 / 私聊就解决，结构性不需要 ticketing。"做出来没人用"不是工程缺陷而是形态错配。同时确认两条产品宪法：(1) 填写的成本必须由当下回报抵消——v0.3 让人填"过去发生了什么"，填者当下不受益所以失败，新形态只允许"当下填、当下受益"的输入；(2) 让协作摩擦可见，让产能不可比——量化贡献会异化协作文化（GitHub PR review queue 是好的反例，contribution graph 是坏的反例）。
- 放弃方案：继续推 AIREADY / REALAI / CODECTX / DEP / DATA / UI / CORE / SEARCH 等围绕 v0.3 的演进；为小作坊加权限 / 多租户 / 协作隔离；做 RAG / embedding / Electron。
- 适用范围：v0.3 全部冻结（仅致命补丁）；新工作只在 `.agents/skills/debug-checklist/`、`.debug-archive/`、（备赛后）`docs/bridge/`、`docs/trail/`。pre-pivot 计划全部归档到 `docs/archive/v0.3-pivot/`。
- 影响：`now.md.mode = post_pivot_self_dogfood`；备赛期只允许 skill 自用与 dogfood 记录；D-005 / D-006 / D-009 / D-014 / D-015 / D-016 仍作为 v0.3 的历史 ADR 保留，但不再驱动新工作；本 ADR 之后所有新决策都以 Skill / Bridge / Trail 为框架。

---

## D-044 — KB-CORE 落地：移植 Probe_Flash 调试闭环 + 相似检索 + 结案派生知识节点（frontier#1 done）

- 状态：**DECIDED / IMPLEMENTED**（2026-06-14；§6.B continuous-build 连续构建 U1~U6 各自 verify+单独 commit+push；4-opus 对抗核实裁 ship/mustFix=0）
- 日期：2026-06-14
- 上下文：D-042 定基调「KB 拆 CORE/LARK、KB-CORE 零飞书可立即开工、四根里最快交付」+ base 收口刀 done。KB-CORE = 三支柱第一支柱第一刀，痛点 = 同一 CAN/MicroROS/电机 bug 跨赛季重踩（D-039 用户原声）。资产 = Probe_Flash（同源）`IssueCard→InvestigationRecord→ErrorEntry→ArchiveDocument` 调试闭环 + `rankSimilarIssues`/`buildCloseoutFromIssue` 纯函数可移植 + `growth.ts KnowledgeNode` 复用。
- 决策（落地形态）：
  1. **移植调试闭环 schema 链**到 `hub-contracts/src/kb.ts`：保留 `normalizedSummary/relatedFiles/relatedCommits`（否则 `buildCloseoutFromIssue` TS2339）；**去掉 `repoSnapshot`**（Probe_Flash desktop 专用 git 快照，TeamHub git 关联走治理 gitCommit 信号 + relatedCommits，不内嵌、不双写 G2）；时间统一 `isoDateTimeSchema`；`IssueStatus` 值 camelCase 对齐 TeamHub 约定（诚实标注，无活数据互通）。
  2. **移植 `rankSimilarIssues` 纯函数**（`kb-similar.ts`，逐字等价打分/排序）；Probe_Flash 的 `findSimilarIssuesForIssue`（StorageRepository IO）**不移植**——IO 由 `GET /api/kb/similar` 路由读 `KbStore` 后喂纯函数，本层保持全纯可单测。
  3. **移植 `buildCloseoutFromIssue` 纯函数 + 新增 `deriveKnowledgeNodeFromIssue`**（`kb-closeout.ts`）：结案派生归档+错误表+已归档卡+知识节点 draft（「用着就沉淀」）；`now/errorEntryId/errorCode/generatedBy` 由 opts 注入（不移植 Date.now/Math.random helper，路由用 clock 确定性派生）。
  4. **兑现 base 收口刀对抗核实 deferToNextKnife**：相似检索语料 IssueCard 不在 `GovernanceSnapshot` 内 → `kbStore` 类型由 `GovStore` **收窄为独立 `KbStore`**（`getKbSnapshot`；`InMemoryKbStore` seed `kbScenarioFixture`）；结案派生 `KnowledgeNode` 那半仍走 `GovStore.closeoutKbNode` 复用同快照（对抗核实确认成立）。
  5. **实现 `InMemoryGovStore.closeoutKbNode`**（base 收口刀只钉签名 throw 的写白名单，本刀落 KB 这一项）：补 id+createdAt（clock 注入）、追加节点、构造期克隆 `knowledgeNodes` 不污染共享 fixture；`createTask/createDependency/createNeed` 仍后置（PM 落地补）。
  6. **路由**：`GET /api/kb/similar`（症状→top-N，A4 护栏 `note` 焊进响应）+ `POST /api/kb/closeout`（缺 rootCause→422 不伪造完成、body 非法→400；errorCode 由 clock+issue.id 确定性派生匹配 `DBG-YYYYMMDD-NNN`）。
- 宪法守恒（4-opus 对抗核实逐条核实 clean）：**I0**（KnowledgeNode/归档无人维度，generatedBy=ai/manual/hybrid 非人名，不可 groupBy「谁结案最多」）/ **C2**（召回项+语料无 memberId/ownerId）/ **A4·C4**（相似检索只列候选+客观 reasons、不断言同因、由人选用）/ **G2**（不回写飞书、blockedBy 不另存）/ **C1**（写入兜底、不退化主录入死表）/ **C3**（不过度建设，PM 录入簇仍后置）。
- 老实定位（不过度声称）：真实录入上游（调试动作→时间线录入交互）**未接通**（等 §5 Hermes 统一触点层），**不宣称已解 C1**；当前落地 = 读召回 + 结案派生 + 写出入口 + 锚点语料。持久层 InMemory 重启丢失为预期（SqliteGovStore stub 待部署审批）。
- 对抗核实：`wf_fc3f1282-bbf`（3 lens[移植保真+TS / 宪法 / 路由·Store 集成]=opus → 1 opus 综合，231K token）裁 **ship、mustFix=0**；3 条 nit（IssueStatus camelCase 改名 / derivePrevention 中文+errorEntryId 确定性[均 §10 标注] / 测试未用 import）——后两条已顺手收口（U6b），第一条诚实标注留存。
- 影响 / 落地：`hub-contracts/src/{kb,kb-similar,kb-closeout}.ts` + `fixtures.ts`(kbScenarioFixture) + `index.ts`；`hub-server/src/{server,contracts}.ts` + `store/{gov-store,mock-gov-store,mock-kb-store}.ts` + 4 测试文件。verify：hub-contracts 41 测 / hub-server 28 测 / git diff --check / skills-sync 全过。commit U1~U6b（`45bbeaf`→`226e838`）。
- 后续（backlog/frontier）：**KB-LARK**（飞书拉资料，hardblock `LARK-BIN-PROBE`）/ 录入交互（随 Hermes 统一触点）/ IssueCard↔Task 关联 + `TaskKnowledgeTag` 派生（随 PM）/ 真实持久层（待审批）/ console KB 页（复用 @xyflow）。
- 事实源：本 ADR；`docs/design/kb-core.md`（设计 + 落地说明）；`docs/design/three-pillar-feasibility.md` D-042 §3；对抗核实 `wf_fc3f1282-bbf`；Probe_Flash `apps/desktop/src/{search/similar-issues,domain/closeout,domain/schemas/issue-card}.ts`（移植源，v0.3 冻结）。

---

## D-045 — PM 项目计划表后端落地：录入簇 + 读视图 + confirmedBy 内部凭证（I0 读写边界拍板）

- 状态：**DECIDED / IMPLEMENTED-PARTIAL**（2026-06-14；§6.B 连续构建 PM-U1 + 录入簇 slice + cleanup 各自 verify+commit；2-opus 对抗核实 ship/mustFix=0；**console 看板 UI 后置**）
- 日期：2026-06-14
- 上下文：KB-CORE done 后顺推 frontier#1 PM（D-041 定调「任务为核心·全员可见·依赖图+卡住带原因·无甘特·不按人」/ D-042 收口）。PM 复用现有 `Task/Dependency/Need` 不新建领域模型，承接 base 收口刀「录入簇 createTask/createDependency/createNeed 实现后置」。连续构建即触一个 **§8 设计闸**：依赖/Need 的 `confirmedBy` 在现 schema 是 `ActorRef{id,displayName,source}`（含可 groupBy 的 memberId），与 D-042「confirmedBy=timestamp 非 memberId 守 I0」字面冲突——planning↔代码冲突 + 涉 I0 反监视核心不变式，**不可静默猜**，故 AskUserQuestion 拍板。
- 用户拍板（2026-06-14）：
  - **Q1 = ActorRef 作内部凭证**：confirmedBy 保持 `ActorRef`，作**内部归因凭证**（`isLiveEdge` 判 `!== null` 决定是否参与归因 C4）；I0 靠**永不经读视图对第三方暴露、永不用于排名**守，而非靠 schema 去掉人 id。与现有 fixture + base 收口刀 4-opus 核实一致。（备选「source-only 凭证」未采。）
  - **Q2 = 本轮后端录入簇 + 读视图 API**；console 写侧 UI（@xyflow 板 + mutation 表单 + 冷启动空板）后置下一轮。
- 决策（落地形态）：
  1. **写实现（mock-gov-store.ts）**：`createTask`（补 id/时间戳 + 默认 status=pending/statusSource=console C5、lastProgressAt=null）/ `createDependency`（**clamp status=active** D-042 初始态）/ `createNeed`（**clamp status=open/openedAt=now/escalatedAt=null/claimedByMemberId=null** —— A2 反派单：新缺口必未认领）；构造期克隆 tasks/deps/needs/knowledgeNodes 不污染共享 fixture。
  2. **Draft 类型（gov-store.ts）**：`DependencyDraft` 去 status、`NeedDraft` 去 status/claimedByMemberId（clamp 初始态归 Store）。
  3. **路由（server.ts）**：`POST /api/tasks`·`/api/dependencies`·`/api/needs`（201/400）+ `GET /api/tasks` 读视图。
  4. **I0 读写边界（命门）**：写入侧 confirmedBy 记 ActorRef 内部凭证；**读出侧任何第三方可见路由永不输出 confirmedBy**——`GET /api/dep-graph`（toDepGraphView 只带 ownerLabel/blockedByLabel 结构键）、`GET /api/tasks`（Task 本无 confirmedBy）；**不提供** `GET /api/dependencies`/`GET /api/needs` 裸对象读路由；创建响应回完整对象=回给建边本人（非第三方），不构成暴露。
- 宪法守恒（2-opus 对抗核实 clean，含**对抗探针实证**）：探针 POST `confirmedBy={id:'m-secret-leaker',displayName:'SECRET_NAME_LEAK'}` 后 `GET /api/dep-graph`+`/api/tasks` 响应体均不含泄露标记 → **I0 守住**。C2（无完成量维度，ownerId 仅「谁负责」D-041 安全堆）/ G2（blockedBy 不在 Task 上另存、纯 Dependency 边派生）/ A1（缺口归组 providerGroupId）/ A2（claimedByMemberId clamp null 反派单）/ G4（不引入 dueDate）。
- 老实定位（不过度声称）：**console 看板 UI 未做**；真实 status 派生上游（git/lark→status）未接通，`statusSource=console` 是兜底录入、**不宣称已解 C1/C5**；持久层 InMemory 重启丢失为预期（SqliteGovStore stub 待部署审批 §8）；`criticalChain→priority`/双视图/AI 预填依赖录入后置。
- 对抗核实：`wf_86ad9d6b-45a`（2 lens[I0 暴露面 / 写实现健全]→1 综合，152K token）裁 **ship、mustFix=0**；nit（死代码+失真注释 / 创建可夹带 claimedByMemberId 派单 / 往返测覆盖）已由 PM-cleanup 收口。
- 影响 / 落地：`hub-server/src/{server,contracts}.ts` + `store/{gov-store,mock-gov-store}.ts` + 3 测试文件。verify：hub-server verify:all 37 测 / git diff --check / skills-sync 全过。commit PM-U1`7218a67` + 录入簇`6cb38c8` + cleanup`3bbf919`。
- 后续（backlog/frontier）：**console PM 看板页**（下一轮 frontier，复用 @xyflow DAG 页模式 + mutation 表单 + 冷启动引导）/ 依赖录入 AI 预填（confirmedBy=null 不归因）/ criticalChain→priority 派生 / 真实 status 派生上游随触点层。
- 事实源：本 ADR；`docs/design/pm-board.md`（设计 + 落地说明）；`docs/design/three-pillar-feasibility.md` D-042 §3 / `decisions.md` D-041（定调）；对抗核实 `wf_86ad9d6b-45a`；用户 2026-06-14 Q1/Q2 拍板。

---

## D-046 — hub-console 两支柱页落地 + 整体汉化（frontier#1 console UI done）

- 状态：**DECIDED / IMPLEMENTED**（2026-06-14；§6.B 连续构建；3-lens 对抗审计 ship；verify:all 绿；本地 Playwright 真机视觉验收）
- 日期：2026-06-14
- 上下文：D-044(KB-CORE)/D-045(PM 后端) 落地后，frontier#1 仅剩 console 读视图 UI（PM 看板 + KB 检索），且用户要求「整体汉化（中文默认可切英文）」。后端 `GET /api/kb/similar`·`/api/tasks` 已就绪，前端只消费、不新增写路由（写侧 mutation 表单仍后置）。
- 决策（落地形态）：
  1. **KB 相似检索页**（`features/kb/KbSearchPage.tsx`）：症状 + 标签表单 → `client.getKbSimilar` → 候选卡（title/status/匹配度/tags/重合依据 reasons/errorCode/根因·处理摘要/归档）。**A4 护栏可见**：原样呈现后端 `note`（「只列候选、不断言同因、由人选用」）+ reasons 客观重合依据，无「系统判定同因」措辞。Mock 模式复用**同一后端纯函数** `rankSimilarIssues` 跑 `kbScenarioFixture`（离线可演示）。
  2. **PM 任务看板页**（`features/pm/PmBoardPage.tsx`）：`client.getTasks` → 5 列（pending/inProgress/blocked/done/shelved）看板。**C2 反排名**：卡片只显 title/rawSummary（人原话）/robotTarget/intrinsicComplexity，**无 ownerId/负责人/完成量**；列计数与汇总只按 status（任务键），永不 groupBy(memberId)。无写流程故 A2 未触发。
  3. **整体汉化**：i18n 扩 enum 映射（adapter/member/event/artifact/health 状态）+ aria-label landmark（控制台导航/系统摘要/依赖摘要/任务摘要）+ 语言自名（中文/EN）全过 `t()`；总览残留后端枚举裸串收口；zh/en **143:143 键严格对称**。用户数据（displayName/uri/branch/capabilities/rawSummary）保持后端原样不机翻。
  4. **接线**：client 扩 `getKbSimilar/getTasks`（real fetch + mock 双轨，均过 Zod fail-closed）；console-local `schemas/kb.ts` 镜像响应契约（沿用 system.ts 做法）；ConsoleLayout 加两导航项 + App 四路路由 + TITLE_KEY。
- 宪法守恒（3-lens 对抗审计 `wf_64a78d61-109`，1 opus[I0/宪法] + 2 sonnet[i18n 完整/UX 正确]）：**I0/C2/A2/A4 = ship**（KB 全 issue/errorCode 键无人维度、note+reasons 原样；PM 无人维度、列计数按 status）；i18n 初判 mustFix（4 处硬编码 aria/语言自名绕过 t()）已全部收口 + 补 DepGraph aria；UX = ship（5 nit：0 命中计数冗余 / dup-key 兜底 / 路由末支显式 / 死键清理 全修）。
- 老实定位（不过度声称）：**写侧 mutation 表单（建任务/依赖/Need）未做**——两页均为读视图（KB 含 1 次检索交互）；真实 status 派生上游仍未接通（看板 status 来自 mock-first 锚点场景）；持久层 InMemory 重启丢失为预期。
- 影响 / 落地：`hub-console/src/{App,i18n/translations,api/client}.tsx?` + `features/{kb,pm,overview,dep-graph}` + `components/layout/ConsoleLayout` + `api/{schemas/kb,mock/{kb,tasks}}` + `styles.css` + `test/client.test.ts`（+3 测）。verify：hub-console verify:all（typecheck + 7 测 + build）全过。
- 后续（backlog/frontier）：PM/KB **写侧 mutation 表单**（建任务/依赖/Need + 结案录入，调 POST 路由）/ 依赖录入 AI 预填 / 真实 status 派生上游随触点层 / 远程部署正式化（D-036 REMOTE-ACCESS-DEPLOY）。
- 事实源：本 ADR；`docs/design/{pm-board,kb-core}.md`；对抗审计 `wf_64a78d61-109`；用户 2026-06-14「整体汉化 + 继续完成其他功能 + 用 workflow」请求。

---

## D-048 — PM/KB 写侧 web 表单：console 录入口落地（frontier#1 PM-KB-WRITE-FORMS done）

- 状态：**DECIDED / IMPLEMENTED**（2026-06-14；§6.B 连续构建 → 落地；hub-console verify:all 绿；本地真机端到端（real 后端 + Playwright）四表单全过 + 闭环召回实证 + 2-lens 对抗核实 ship/mustFix=0）
- 日期：2026-06-14
- 上下文：base 两刀 + KB-CORE（D-044）+ PM 后端（D-045）+ console 读视图/汉化（D-046）+ KB 闭环/skill（D-047）已就绪，但**两支柱的「人在浏览器里录入」通道仍缺**：PM 后端 `POST /api/tasks·dependencies·needs` 与 KB `POST /api/kb/closeout` 只有 skill/curl 口，无 web 表单（D-045 §7 用户 Q2 明确 console UI 留下一轮）。用户本轮指令：「还有什么没做完的自己认领去做，然后 ssh 到我电脑上展示」——认领 frontier#1 PM-KB-WRITE-FORMS。
- 决策（落地形态，纯 hub-console 写侧，零后端改动）：
  1. **API client 写侧**（`api/client.ts` + 新 `api/schemas/pm.ts`）：`createTask`/`createDependency`/`createNeed`/`closeoutKb` 四 mutation。请求 schema **与后端同法从 hub-contracts 派生**（`TaskSchema.omit(...)` 等，结构天然同步、不手抄字段）。**mock 模式闭包内可变任务表**（写表单无后端也即时反映在看板，演示/视觉验收用）；mock closeout **复用 canonical `buildCloseoutFromIssue` 纯函数**（不在前端复刻派生逻辑）+ 补 deriveErrorCode/draft→node 两步。
  2. **PM 录入面板**（新 `features/pm/PmCreatePanel.tsx`）：段控切换 布置任务/连依赖/暴露需求 三表单；依赖/需求的 from/to/onTask 走 **live 任务下拉**；成功后 `invalidateQueries(['tasks',source])` 看板即时刷新；自edge 守卫；冷启动空板引导（`PmBoardPage` `pm-coldstart`）。
  3. **KB 结案表单**（新 `features/kb/KbCloseoutForm.tsx` + `KbSearchPage` 加 检索/结案 标签）：最小人本字段合成 IssueCard（status=resolved）+ rootCause/resolution 必填；成功展示 errorCode/归档文件/派生知识点 + `invalidateQueries(['kb-similar',source])`（D-047 回灌后刷新检索）。
  4. **整体汉化**：新增 ~75 文案键 **zh/en 同步**（`Record<TranslationKey,string>` 类型强制 parity，typecheck 即守）；select/datalist/段控/banner CSS。
- **I0 命门（PM 写侧最敏感）**：`confirmedBy`（依赖/需求）= 录入本人凭证、**只在写表单收集 + POST 入参 + 回建边本人的创建响应**，**任何第三方读视图/UI 永不渲染**；UI 不显谁快谁慢/完成量；ownerId 仅「谁负责」(D-041 安全堆)。**对抗探针实证**：POST `confirmedBy={id:m-secret-leaker, displayName:SECRET_NAME_LEAK}` 后 `GET /api/dep-graph`+`/api/tasks` 响应体均无泄露；代码自审 `confirmedBy` 仅出现在注释 + 请求构造，零渲染路径。
- 宪法守恒：I0（confirmedBy 不暴露/不排名）；C2（看板主键 task/status 无 memberId 维度、无完成量）；A1（Need 归组 providerGroupId 不归人）；A2（创建 Need omit claimedByMemberId，后端强制 null=反派单）；G2（卡住原因走 Dependency 边派生不在 Task 另存）；G4（无 dueDate/甘特）；A4（KB 检索 note 候选不断言同因）。
- 验证：hub-console `verify:all`（typecheck/7 测/build）全过；**本地真机端到端**（hub-server:4177 真实后端 + Playwright real 模式）：建任务→看板出现 / 连依赖→成功 / 暴露需求→201 / 结案→errorCode+归档+知识点 → **切检索同症状召回刚归档的卡（closeout→corpus→similar 闭环实证）**；四 POST 路由 curl 往返全过；I0 SECRET 探针读视图干净；**2-lens 对抗核实**（`wf_af4c88df-309`：opus I0 + sonnet 正确性 → opus 综合）裁 **ship、i0Clean=true、mustFix=0**，2 nit（KbCloseoutForm `source` 死 prop + 结案后未失效 kb-similar 缓存）已合并修复（接 source 进 invalidate）。
- 老实定位（不过度声称）：mock task 表是闭包态、切数据源即重置（非真持久）；冷启动空板引导仅 PM（KB 一向有空态文案）；真实 status 派生上游（git/lark→status）仍未接通，`statusSource=console` 是兜底录入，**不宣称已解 C1/C5**；ProbeFlash `.debug-archive` 一次性导入（KB-IMPORT-PROBEFLASH）仍后置。
- 影响 / 落地：`apps/hub-console/src/`：新 `api/schemas/pm.ts` + `features/pm/PmCreatePanel.tsx` + `features/kb/KbCloseoutForm.tsx`；改 `api/client.ts`/`api/schemas/kb.ts`/`features/pm/PmBoardPage.tsx`/`features/kb/KbSearchPage.tsx`/`i18n/translations.ts`/`styles.css`。
- 后续（backlog/frontier）：KB-IMPORT-PROBEFLASH（`.debug-archive` 7 md best-effort 导入）；依赖录入 AI 预填（GOV-DEP-INTAKE 并入）；criticalChain→priority 派生展示；真实 status 派生上游随触点层；KB-LARK / INV / Hermes 后置。
- 事实源：本 ADR；`docs/design/{pm-board,kb-core}.md`；对抗核实 `wf_af4c88df-309`；用户 2026-06-14「认领未完成 + ssh 展示」请求。

---

## D-047 — AI + 知识库闭环 MVP：closeout 回灌 + JSON 落盘 + kb-debug skill（服务器为单一真相）

- 状态：**DECIDED / IMPLEMENTED**（2026-06-14；plan mode 设计 → 落地；hub-server verify:all 42 测绿；本地真机端到端闭环+持久化实测过）
- 日期：2026-06-14
- 上下文：用户要"一个简单的 AI+知识库"——本地 Claude Code 排 bug 时查团队相似历史、解完上传沉淀。相似检索（ProbeFlash 已做、TeamHub 已移植 `rankSimilarIssues`）和网页给人看（D-046 KB 页）已就绪，但 Explore 实证**闭环是断的**：`KbStore` 只读无写、`POST /api/kb/closeout` 只写 KnowledgeNode 不回灌检索语料（上传完下次 similar 查不到）、InMemory 重启全丢。**ProbeFlash 关键教训**：v0.3"服务器+SQLite"形态因"填的成本没当下回报"无人用；本设计让 skill **排障完自动归档**破此局。
- 用户拍板（2026-06-14，plan mode 两问）：
  - **三件全做**：持久化 + closeout 回灌 + skill。
  - **检索=关键词重合**：沿用 `rankSimilarIssues`，零依赖、ProbeFlash 同路、故意不用向量；留 embedding 扩展点本轮不做。
  - **服务器为单一真相**：skill POST 到服务器，**本地不再产 `.debug_archive`、信息全留服务器**（用户明确）；服务器已能渲染 `markdownContent` 供导出，不双写（G2）。
- 决策（落地形态）：
  1. **闭环（回灌）**：`KbStore` 接口加 `appendCloseout({issueCard,errorEntry,archiveDocument})`（gov-store.ts）；closeout 路由派生成功后回灌检索语料（server.ts，issueCard 按 id upsert 成 archived 版）——上传后下次 similar 即可召回。
  2. **持久化**：新 `FileKbStore`（JSON 落盘、原子写 tmp+rename、fail-closed 加载：文件损坏抛不静默覆盖）；`main.ts` 读 `TEAMHUB_KB_DATA_FILE` 注入（注入点 `options.kbStore` 现成），未设维持 InMemory（mock-first 不变）。**不引 sqlite**（SQLite 留扩展，照 sqlite-gov-store stub）。
  3. **skill `kb-debug`**（`.agents/skills/kb-debug/{SKILL.md,kb-client.sh}` 源 + `.claude/skills/` 镜像）：`debug-checklist` 的**服务器版进化**——recall（症状→`/api/kb/similar`，A4 候选不断言同因）+ archive（解完组装 closeout payload→`/api/kb/closeout`，`generatedBy=ai` 不记人名）；瘦客户端 `kb-client.sh`（ping/similar/closeout，`KB_BASE_URL` 环境配，curl→服务器无 CORS）；**不写任何本地文件**。
- 宪法守恒：C2（语料/回灌主键 issue/errorCode 无人维度）；I0（generatedBy=ai/manual/hybrid 不记结案人）；A4（recall 只列候选，note+reasons 原样，不断言同因）；G2（服务器单一真相，不双写本地 markdown）。
- 老实定位（不过度声称）：**写侧仍是 AI 组装 IssueCard**（无简化 archive 端点）；**时钟仍是 FixedClock**（mock-first）→ closeout 的 errorCode 日期/时间戳钉在场景时刻 2026-06-11，真实时钟是部署 follow-up（errorCode 仍按 issueId 哈希唯一）；ProbeFlash `.debug-archive`（7 md）批量导入后置（Part C，用户"可讨论"）；embedding 语义检索后置；LAN 托管 + 飞书登录独立基础设施轨（REMOTE-ACCESS-DEPLOY）。
- 验证：hub-server `verify:all`（typecheck + 42 测 + build）全过，含**往返测**（closeout→similar 召回）+ **落盘测**（FileKbStore append→新实例加载仍在）；**本地真机端到端**：`TEAMHUB_KB_DATA_FILE` 起服务 → `kb-client.sh` ping/similar(空)/closeout/similar(召回 iss-e2e-1) → 杀进程重启 → similar **仍召回**（持久化实证）；skills-sync + `git diff --check` 干净。
- 影响 / 落地：`apps/hub-server/src/{main,server}.ts` + `store/{gov-store,mock-kb-store,file-kb-store}.ts` + 2 测试文件 + `.agents/skills/kb-debug/`。
- 后续（backlog/frontier）：ProbeFlash `.debug-archive` 一次性导入（markdown→IssueCard best-effort 解析器）；真实时钟注入（持久模式配 RealClock，需调和治理 fixture 冻结）；简化 archive 端点（server 端建 IssueCard 让 skill payload 更瘦）；embedding 重排；LAN 托管 + 飞书登录。
- 事实源：本 ADR；plan file `linear-herding-blanket.md`；Explore 调研（TeamHub KB 后端两洞 + ProbeFlash 设计参考）；用户 2026-06-14「AI+知识库 / skill / 服务器为单一真相」请求。

---

## D-052 — 提案审查裁决 + Q1–Q4 拍板 + 低风险收尾批落地 + 依赖图新功能立项

- 状态：**DECIDED**（裁决 + 立项）/ **低风险批 IMPLEMENTED**（2026-06-14；hub-contracts 41 测 / hub-server 74 测 / hub-console typecheck+7 测+build 全绿；3 code commit `8ab93cf`/`44b7fcc`/`8ea6579`）
- 日期：2026-06-14
- 上下文：用户一次性提一批诉求（5 个灰导航项语义 / 适配器改名 / 看板≈依赖图能否合并 / 暴露需求是什么 / 全项目石山梳理 / skill 适配 workflow 自迭代 / 版本不更新 / mock 是什么），要求**先用 workflow 探明合理性再讨论**。9-agent 调研 workflow `wf_def55d4d-916`（5 survey[sonnet] + 3 石山审计[opus] → 1 opus 综合，~62 万 token）产逐条裁决 + 22 条石山 finding + 自迭代方案。基于综合结论问 4 题（Q1–Q4），用户拍板如下。
- 关键发现（纠偏）：5 个灰导航项**非空壳**——后端路由 `GET /api/{adapters,events,bridge/members,git/repos,artifacts}` 均已实现、数据已在总览五面板渲染；真正"死"的只是侧栏 5 个 `page===undefined` 的禁用按钮（把已有内容当"即将上线"占位）。
- 决策（用户拍板）：
  1. **命名（Q1）**：「适配器」→ **集成 / Integrations**，且**归入设置页**（非主页）。语义 = 连接到社媒 / 外部应用（飞书 / Hermes / git / 未来 QQ 微信钉钉等触点）。
  2. **看板 × 依赖图（Q2）**：**不合并**（两页交互范式不同：看板=线性状态流"做了多少"、依赖图=空间 DAG"为什么卡"；硬合并触 I0 反排名风险=完成数×负责人姓名同屏可读出"谁干得多"）。但**依赖图升为主舞台**——录入做成**右上角按钮 → 近全屏遮罩浮层**叠在依赖图之上、点空白处退回；并新增 **AI 自动画大致 DAG + 人手动微调**。
  3. **连依赖（Q3）**：用户要的"连线"**不是改按钮名**，是**在画布上拖拽连线建依赖**（从节点 A 拖到节点 B → 自动建边 + 重绘 DAG，xyflow `onConnect`）。
  4. **暴露需求（澄清）**：= "制度化替你开口"——被卡的人登记缺口挂到任务、卡点自动进依赖图全员可见、不催某个人；A2 反派单（缺口归组不归人、接口层物理拒收"指派给谁"）。建议 UI 标签改「登记缺口」（"暴露"有"被揭穿"负面语感）。
  5. **自迭代（Q6 诉求）**：引擎**已落地**（`continuous-build` skill + AGENTS §6.B 连续/编排轨，D-043；D-044~D-052 全走它）。频繁停下是**制度刻意设计的人在环**三类：① §6.0 M1 候选池闭口（frontier 空就停，当前正是）② §8 安全门（SSH/sudo/部署/密钥 blocked）③ 产品方向待拍。后两类不该自动化绕过。**解锁 = 保持 frontier 非空（本 ADR 已补）+ 可选补带 budget 守门的 frontier-loop 编排骨架**。
- 低风险收尾批（Q4 拍板"直接连续跑"，本 ADR 已实现 3 commit）：
  1. **版本跟随 package.json**（诉求7）：hub-server/status.ts `createRequire` 读包根 version、console mock 导入 package.json version；不再写死 0.0.1（`8ab93cf`）。
  2. **删 5 死导航 + Mock 文案白话化**（诉求4 一刀 + 诉求8）：ConsoleLayout 删 适配器/事件/协作桥/git/图纸 5 禁用项 + unused 图标 + 5 个 nav.* i18n 键；"Mock 数据"→"演示数据"、"真实 API"→"真实数据"、错误提示同步（`44b7fcc`）。
  3. **重复真相下沉 hub-contracts**（石山重灾区②）：deriveErrorCode / Health·SystemStatus / Create\*Request 三组跨包逐字复刻下沉单一源、两端 re-export 保路径、零行为变化（`8ea6579`）。
- 新功能立项（→ backlog P1，未实现，下一批 frontier）：`INTEGRATIONS-TO-SETTINGS`（集成面板进设置 + 适配器→集成 标签 + 主页精简到"最近事件+指标"）、`DEPGRAPH-ENTRY-OVERLAY`（依赖图右上角录入遮罩浮层 + 看板→依赖图跳转 + I0 ownerLabel 降级到 DetailPanel）、`DEPGRAPH-DRAG-CONNECT`（xyflow 拖拽连线建依赖 + 自动重绘）、`DEPGRAPH-AI-AUTODRAW`（AI 自动布大致 DAG + 人微调）。
- 石山热力图（调研产，供 AUDIT/重构排期，非本轮全修）：① **挂起域死重量**（D-039 治理派生簇 schedule.ts 272 行 + governance schema + SqliteGovStore 靠测试锁活，零运行时引用、虚胖 3-4×）② **重复真相**（本轮已收口 deriveErrorCode/Create\*/Health）③ **模型口径分叉 + 谎标**（两套 Member；statusSource derived/git/lark 无生产者纯装饰；mode=z.literal 切真即崩）④ **前端结构债**（死导航[本轮已删]/死链接 href=#/source prop drill 4 层/孤儿字段）。
- 老实定位：本 ADR 只落地"低风险批"3 项；命名进设置 / 依赖图浮层 / 拖拽连线 / AI 布图 **均未实现**（立项 backlog）；石山①③④ 多数未修（AUDIT-FIXES / 后续重构）；真实 status 派生上游仍未接通。
- 验证：三包 verify:all 全绿（见状态行）；git diff --check 干净；3 commit 各自过 gate。
- 事实源：本 ADR；调研 workflow `wf_def55d4d-916`；用户 Q1–Q4 拍板；`docs/planning/backlog.md`（新立项 4 项 + 低风险批 done 行）；`code-audit-2026-06-14.md`（石山交叉引用）。

---

## D-051 — KB-IMPORT 独立二次对抗审计 + 正确性硬化（KB-IMPORT-FOLLOWUP 部分收口）

- 状态：**DECIDED / IMPLEMENTED**（2026-06-14；hub-server verify:all 绿[typecheck + 74 测含 +9 新 + build]；6 真实归档重跑 5 导入 + 召回/I0 实证）
- 日期：2026-06-14
- 上下文：D-050 落地后另起一轮**独立**多维对抗审计（`wf_74dee37d-59b`，4 finder 按档分模型[parser/schema-recall/I0-constitution=opus、cli-io=sonnet] → 每条候选 3 票 majority 核实，61 agent / 1.99M token），对**已提交的** KB-IMPORT 代码做第二意见。该轮抓出 D-050 那轮（`wf_a52195b7-44e`）**漏掉的 3 条真实正确性 / §10 缺陷**——独立二审的价值实证：
  - **fileNameToSlug 撞 slug → 静默丢档**（confirmed 3/3，§10）：旧算法 `ascii.length>=3` 直接返回前缀、`.slice(0,48)` 截断、非 ascii 丢字，使 `CAN问题归档甲.md`/`…乙.md`→同 `can`、`26R2历史Bug归档-CAN甲/乙.md`→同 `26r2-bug-can`、`a_b`/`a-b`→同串；同 `issueId` → 第二份归档被 CLI 当「已导入」`skipped-existing` **静默丢弃**（无 warning、退出码 0、与良性「重跑跳过」同形），语料缺失。
  - **toIsoDateTime 不查日历有效性 → 整档 failed 而非兜底**（confirmed 3/3，§10）：`2026-02-30`/`2026-04-31` 范围内但不存在，旧实现返回非法 ISO → 下游 Zod 拒 → 整张档案 `failed`，而非按 best-effort 落兜底日期导入；违文档自述「解析失败返回 null」。
  - **readFile/readdir EISDIR 崩整批**（confirmed 3/3）：名字以 `.md` 结尾的子目录 / 不可读文件使 `readFile` 抛 EISDIR/EACCES，**未捕获 → 整批导入中断**、后续文件全丢、无 summary。
- 决策（落地形态，纯 hub-server import 层硬化，零 contracts/console 改动）：
  1. **slug 单射**：`fileNameToSlug` 无条件拼**全名确定性哈希后缀**（`<可读前缀>-<6 字符 base36>`），截断/非 ascii/标点折叠都不再撞。代价（诚实标注）：与旧算法 slug 不同 → 仅影响**未来**导入；部署语料已冻结、一次性工具不回灌冲突。
  2. **日历校验**：`toIsoDateTime` 加 `Date.UTC` 反查（`Date.UTC` 确定性、非 `Date.now`/`Math.random`），非法日历日返回 null → `deriveDate` 续试后续日期源最终落兜底。
  3. **IO 健壮**：`readdir(_, {withFileTypes:true})` + `dirent.isFile()` 跳子目录；`readFile` 包 try/catch（失败记 `failed` + continue，不中断整批）。
  4. **顺手收口**：`SKIP_FILES` 改小写比较（覆盖 `Readme.md`/`README.MD` 变体，KB-IMPORT-FOLLOWUP nit ④）；`extractSection` 先剥 marker 再剥前导符号 + 清残留 `**`（nit ③）；删 `toInputIssueCard` 死代码 `if(!parsed)throw`（参数收紧为非 null `ParseResult`）；`isCli` 正则匹配 `.js`/`.ts` 两入口。
- 宪法守恒：纯正确性 / IO 硬化，**不触人维度**——I0 探针（`GET /api/kb/similar` 重跑 grep `memberId/ownerId/confirmedBy/m-*`）CLEAN；C2/A4/G2 不变（generatedBy=hybrid、客观 TAG_VOCAB、只 append 同一语料）。**驳回项**（majority 未过）：markdownContent/fileName 偶含人名外露（条件性、by-design 自由文本回显，非违宪，且依赖未证实的 rawInput 脱敏前提）；IMPORT_FORCE 重导无去重（仅磁盘膨胀、召回零影响，降为 nit）。
- 老实定位：① KB-IMPORT-FOLLOWUP 的 nit ①（IMPORT_FORCE 去重）②（汇总文档 rootCause `；`串接）**仍未做**——前者本轮二审确认仅存储卫生、召回无损，后者全文留 rawInput 故召回无损，均非阻塞保留；② `extractSection` 仍可能留 `(commit xxx):` 片段（commit 哈希是有用召回信号、by-design 外露，不再清）；③ 名字含人名的自由文本若进归档正文会随 rawInput/rootCause 进语料（团队自著调试笔记、当前数据是 commit 哈希；非本轮范围）。
- 验证：hub-server `verify:all`（typecheck + 74 测 + build）全过，新增 9 测（toIsoDateTime 日历边界 / fileNameToSlug 撞区消歧 4 例 / runImport IO：子目录跳过·README 大小写·撞 slug 两卡·重跑幂等）；6 真实归档重跑 5 导入 0 失败、slug 哈希后缀化、debug-checklist 日期由文件名正确解析（不再落兜底）、CAN/UART 查询召回 iss-pf-*、I0 探针 CLEAN。
- 影响 / 落地：改 `apps/hub-server/src/import/{parse,import}-debug-archive.ts` + `test/parse-debug-archive.test.ts`；新 `test/import-debug-archive.test.ts`。
- 后续（backlog）：`KB-IMPORT-FOLLOWUP` 收窄为剩余 nit ①②（非阻塞）；H2（FileKbStore writeChain）仍归 `AUDIT-FIXES`（长驻服务器路径）。
- **收口（2026-06-20，nit ①② 全清）**：① nit① 经核 `appendCloseoutInto`（`mock-kb-store.ts`）早在 commit `732a2c9` 起已按**确定主键 upsert**（issueCard.id / errorEntry.id=`err-<issueId>` / archive.issueId，全确定）→ IMPORT_FORCE 重导本就幂等、数组不膨胀；非「修复」而是**证实 + 补回归测锁定**（`import-debug-archive.test.ts`：force 重导后三数组长度恒定）。② nit② `extractSection` 段内续行改**空格接**、仅段与段间用 `；`（消「因为电压；超过阈值」式伪分句；rawInput 全文不变、kb-similar 关键词召回无损），补回归测（`parse-debug-archive.test.ts`：段内空格 / 段间 `；`）。hub-server verify:all 绿（149 测含 +3 新）。`KB-IMPORT-FOLLOWUP` 全收口。
- 事实源：本 ADR；独立二审 `wf_74dee37d-59b`（vs D-050 的 `wf_a52195b7-44e`）；`docs/planning/backlog.md` KB-IMPORT-FOLLOWUP；D-050。

---

## D-050 — KB-IMPORT-PROBEFLASH：ProbeFlash .debug-archive 一次性导入（frontier#1 done）

- 状态：**DECIDED / IMPLEMENTED**（2026-06-14；hub-server verify:all 绿[typecheck+65 测含 23 新解析测+build]；6 真实归档实跑 5 导入 + 召回实证；3-lens 对抗核实 wf_a52195b7-44e 裁 ship[block 仅 DoD/流程非正确性，3 mustFix 已闭]）
- 日期：2026-06-14
- 上下文：frontier#1 最后一项。把 `debug-checklist` skill 攒的历史调试归档（`Probe_Flash/.debug-archive`，6 md：异构——部分 YAML frontmatter、部分裸检查清单、单文件常汇总多 bug）一次性灌进 KB 检索语料，让历史经验跨赛季可召回。**一次性非长期同步**（用户已定后续本地不再产 archive、全留服务器）。
- 决策（落地形态，纯 hub-server，零 contracts/console 改动）：
  1. **纯解析器** `src/import/parse-debug-archive.ts`（零 IO 可单测）：frontmatter 拆分 + 文件名→ascii slug + 日期派生（frontmatter date→文件名日期→正文「生成于」→兜底常量）+ 领域词表 TAG_VOCAB 客观打标 + best-effort 抽根因/修复/预防段。**一文件=一张归档卡**（汇总文档无可靠 bug 边界，best-effort 下「整篇可召回」比「假装精确拆分」诚实，rawInput 存全文供关键词扫描）。
  2. **导入 CLI** `src/import/import-debug-archive.ts`：读归档目录→解析→组 IssueCard(status=resolved)→canonical `buildCloseoutFromIssue`（**注入历史时戳**：errorCode/归档名反映 bug 当年日期 `DBG-<历史日期>-NNN` 而非 server 当前钟）→`FileKbStore.appendCloseout`（与 server `TEAMHUB_KB_DATA_FILE` 同一落盘文件）。skip-existing 幂等（重跑跳过已导）。README 跳过。**为何独立 CLI 非走 POST /api/kb/closeout**：那条路由用当前钟戳（丢历史）；CLI 复用同一 canonical 纯函数 + 同一持久层，不复刻派生逻辑（§10/G2）。
  3. **重构** `deriveErrorCode` 从 `server.ts` 抽到 `src/kb/error-code.ts`（CLI 与 server 共用同一确定性派生，DRY）。
  4. **npm 脚本** `kb:import`（`node dist/import/import-debug-archive.js`）+ 操作流程入档（见下「运行」）。
- 宪法守恒：**C2/I0 无人维度**——`generatedBy='hybrid'`（来源枚举非人名）、主键 issue/errorCode、标签是客观 TAG_VOCAB 正则命中、绝不写 memberId/MemberKnowledge；**C4/§10 不杜撰**——抽不到根因/修复段给诚实指向性兜底（「详见归档正文」）+ warning 不静默；**G2 单一真相**——只 append 到 server 读的同一语料、不双写。
- **对抗核实**（`wf_a52195b7-44e`，3-lens[I0/C2 + 解析保真/写安全 + 诚实/DoD]→综合）：两技术 lens 均 ship、仅 nit；裁 **block 仅因 DoD/流程**（未提交/无 ADR/无脚本），三项已闭即 ship。**H2（FileKbStore writeChain 无 .catch）判 stays-deferred**——顺序 one-shot CLI + skip-existing 重跑可恢复，咬不到；留 AUDIT-FIXES 批次（服务器长驻路径才需修）。
- 老实定位（不过度声称）：① 汇总文档的结构化 rootCause 是多 bug 串接（`；` 连）非单一结论，全文留 rawInput 故召回无损但结构字段是 mash-up；② IMPORT_FORCE=1 重导会重复 errorEntry/archiveDocument（默认 skip-existing 幂等不受影响，已记 nit）；③ extractSection 有残留 markdown 加粗/表格行（仅影响展示、不影响关键词召回）；④ SKIP_FILES 大小写鲁棒性 gap（真实档案仅 README.md 不受影响）。以上 4 nit 入 backlog `KB-IMPORT-FOLLOWUP`，非阻塞。
- 运行（一次性，operator 在部署机跑）：`cd apps/hub-server && npm run build && npm run kb:import -- <archiveDir> <permanent-dataFile>`（如 WSL2：`~/projects/TeamHub/.../Probe_Flash/.debug-archive` → `~/teamhub-data/kb.json`），再以 `TEAMHUB_KB_DATA_FILE=<同一文件>` 起 server，`/api/kb/similar` 即召回。**实证**：本地跑 6 档案 5 导入 0 失败，errorCode 历史化（DBG-20260515-714 等），4 条代表查询（FreeRTOS HardFault / 夹爪抬升 / 串口 IDLE DMA / 达妙上电）均召回 iss-pf-* 历史 bug。
- 影响 / 落地：新 `apps/hub-server/src/import/{parse,import}-debug-archive.ts` + `src/kb/error-code.ts` + `test/parse-debug-archive.test.ts`（23 测）；改 `src/server.ts`（deriveErrorCode 抽出）+ `package.json`（kb:import）。
- 后续（backlog）：`KB-IMPORT-FOLLOWUP`（4 nit）；真实时钟注入；embedding 重排；console KB 页加「上传归档」入口（当前只有检索+结案表单，批量导入是 CLI）。
- 事实源：本 ADR；`docs/planning/backlog.md` KB-IMPORT-PROBEFLASH；对抗核实 `wf_a52195b7-44e`；用户 2026-06-14「直接连做直到功能做完，用 workflow」+「连 WSL 展示 + 说明剩余」请求。

---

## D-049 — Console 设置页落地 + 代码审计落档（CONSOLE-SETTINGS-PAGE done / AUDIT 记录）

- 状态：**DECIDED / IMPLEMENTED**（2026-06-14；hub-console verify:all 绿 + 本地 Playwright 真机视觉验收；审计为落档非修复）
- 日期：2026-06-14
- 上下文：D-048 后用户先要一次代码级审计（15-agent 对抗，产出 confirmed 42），再把已立项的 `CONSOLE-SETTINGS-PAGE`（commit 4c65b61 记录待做）提为优先级 #1 做出来；审计修复按用户定「等彻底构建完统一批次」后置。
- 决策（落地形态）：
  1. **设置页**（新 `features/settings/SettingsPage.tsx`）四节：数据源（real/mock 段控，复用 App `source`/`setSource`）/ 语言（zh/en 段控，`useI18n().setLang`）/ 后端地址（`localStorage['teamhub.apiBase']` 覆盖 `VITE_API_BASE`，Apply/Reset 走 `reload`，mock 模式置灰）/ 关于（`client.getSystemStatus()` 取 service·version·mode + 回显 `client.mode`）。
  2. **接线**：`ConsoleLayout` `ConsolePage` 加 `'settings'` + nav 项 `page:'settings'`（**只解禁这一个灰项**，其余灰项按用户定先留）；侧栏底部「语言/数据源」两快捷切换**移进设置页、侧栏移除**（用户选）；`App.tsx` `readApiBase()` + `TITLE_KEY` + 路由分支下传 client/source/setSource；`api/client.ts` 加 `getSystemStatus()`（接口 + mock + real）；i18n +23 `settings.*`（zh/en 对称）− 8 孤儿 `control.*`；`styles.css` 删 `.console-controls/.control-toggle*` + 加 `.settings-*`。
  3. **审计落档**：`docs/planning/code-audit-2026-06-14.md`（confirmed 42：High 5/Med 16/Low 12/Nit 3 + 部署前必修 7 条）；`backlog.md` 加 `AUDIT-FIXES-2026-06-14` 索引行（修复后置）。
- 宪法守恒：纯前端设置 + 文档，无领域/契约改动；I0/C2 等不触（设置页无人维度、不写治理数据）。审计本身确认读路径 I0 守住（dep-graph 边不带 actor 字段、`toDepGraphView` 只出结构键）。
- 老实定位（不过度声称）：**审计 42 条仅落档、未修**（含 H1 依赖环卡死 / H2 FileKbStore 写链中毒 / H3 写端点零鉴权 等部署前必修，归 AUDIT-FIXES 批次，真开工可起新 ADR）；后端地址覆盖靠 `reload` 重建 client（非热切）；设置页不含赛季/项目切换（无后端、不做）。
- 验证：hub-console `verify:all`（typecheck + 7 测 + build）全过；本地 Playwright 真机：设置页四节齐全、`getSystemStatus` real 路径拉到 teamhub-hub-server/0.0.1/mock-first、侧栏旧切换消失、「设置」可点其余灰项仍禁、唯一 console error 为 favicon 404（无关）；git diff 自审 6 改 2 新无杂散、`grep control.*` 0 残留。
- 影响 / 落地：新 `apps/hub-console/src/features/settings/SettingsPage.tsx` + `docs/planning/code-audit-2026-06-14.md`；改 `apps/hub-console/src/{App,api/client,components/layout/ConsoleLayout,i18n/translations,styles.css}` + `docs/planning/backlog.md`。
- 后续（backlog/frontier）：**AUDIT-FIXES-2026-06-14** 修复批次（部署前必修 7 条优先）；CONSOLE-COPY-HUMANIZE（文案去 AI 味，姊妹 P1 未做）；其余灰占位（适配器/事件/桥/git/图纸）待定优先级/设计。
- 事实源：本 ADR；`docs/planning/code-audit-2026-06-14.md`；`backlog.md` CONSOLE-SETTINGS-PAGE/AUDIT-FIXES；plan `~/.claude/plans/rosy-giggling-dolphin.md`；用户 2026-06-14「记录审计 + 设置页优先 + git diff 审计」请求。

---

## D-055 — 4 弱完成度谓词收口为 verify:all + 人审置 `audited:true`（自驱动启用）

- 状态：**DECIDED / IMPLEMENTED**（2026-06-14）
- 日期：2026-06-14
- 上下文：D-053 把自驱动收在 `completion-model.yaml.audited` 一个开关后——`false` 时外环找到 gap 也只 propose-and-stop，须人审 completion-model 一次（确认谓词都打在真接缝上）后置 `true` 才 propose-and-drive。审计时发现 4 个标 `done` 的交付物谓词过弱（只验"文件/字符串在不在"，验不到功能真过）：`PILLAR-KB-READWRITE`（grep `api/kb/closeout`）、`KB-IMPORT-PROBEFLASH`（grep `kb:import`）、`PILLAR-PM-READWRITE`（file_exists `PmCreatePanel.tsx`）、`CONSOLE-SETTINGS-PAGE`（file_exists `SettingsPage.tsx`）。这正是 `now.md` 记录的 AUDIT-H1 弱谓词诈胡（谓词含前端路径被误判 PASS）同一失败模式——`audited:true` 下让外环信弱谓词,可能把伪 done 当真、拿假基线合成下一目标。
- 决策：
  1. **4 条谓词换硬（AND 形式，非纯替换）**：`predicate_kind` 统一改 `cmd_exit0`，谓词 = `<原接缝锚点检查> && npm --prefix <包> run verify:all`。保留接缝特异性（否则 PM/SETTINGS 会塌成同一条 console verify:all，违反"谓词打在真接缝"），把判据从"存在"升到"存在且该包 typecheck+test+build 全绿"。
  2. **人审一次完成 → `audited: false→true`、`synthesis_mode: propose-and-stop→propose-and-drive`**。自此外环在双重耗尽找到 gap 时自动 合成→物化→交回 §6.B 驱动；**§5 宪法门 / §8 安全门 / `epic_cap_per_invocation:1` 三道闸门不变**，干完 1 个 epic 仍 STOP 上报。
- 取舍 / 老实定位：① PM/SETTINGS 共用 console verify:all、KB-CORE/KB-IMPORT 共用 server verify:all，完成度检查时各跑 2 次重复 suite——仅"双重耗尽"（罕见）触发，可接受。② verify:all 是包级（typecheck+test+build），非该 feature 的端到端行为测——但已远强于 file_exists/grep，且包内任何回归都会把它翻回 gap（更保守、更诚实）。③ 翻 `true` 不等于"现在立刻自动跑"：frontier 现有 5 条收尾活，外环短期走不到第 5 步；首个会被自动合成的 gap 是 `DEPGRAPH-ENTRY-OVERLAY`（priority 12，将编号 D-054——D-053 已为外环自合成 epic 预留 D-054 起）。
- 验证：4 条新谓词从 repo 根逐条 `bash -c '<predicate>'; echo $?` 全 = 0（hub-console 7 测+build 绿、hub-server 74 测+typecheck+build 绿）；`grep audited\|synthesis_mode completion-model.yaml` 确认 true / propose-and-drive。
- 宪法守恒：纯 planning 改动（completion-model.yaml + 本 ADR），无领域/契约/代码改动；§5/§8/epic_cap 闸门一字未动。
- 事实源：本 ADR；`docs/planning/completion-model.yaml`（行 15-16 开关 + 4 条 cmd_exit0 谓词）；`AGENTS.md §6.C` / `D-053`；`now.md` 第 7 行 AUDIT-H1 弱谓词教训；用户 2026-06-14 选「先换硬 4 谓词再翻 true」。

---

## D-056 — DEPGRAPH-ENTRY-OVERLAY：依赖图录入浮层 + 看板↔依赖图互通 + I0 负责人降级（frontier done）

- 状态：**DECIDED / IMPLEMENTED**（2026-06-15）
- 日期：2026-06-15
- 上下文：D-052 提案审查后立项的 console 收尾批第 1 项（完成度模型 gaps[0]，priority 12）。用户「按顺序做 frontier 能执行的所有任务、用 workflow 连续执行」。承接 D-052 Q2 拍板：依赖图升主舞台、录入做近全屏遮罩浮层（非新页面）、看板与依赖图不合并但互通。
- 决策（实现定调）：
  1. **录入浮层（非内嵌、非跳页）**：依赖图右上角「录入」按钮 → `position:fixed inset:0` 遮罩 + 居中 drawer 承载现成 `PmCreatePanel`（复用 D-048 写侧表单，零后端改动）。backdrop `role=presentation`+onClick 关、drawer `role=dialog`+`aria-modal`+stopPropagation。点空白/遮罩退回（用户诉求）。
  2. **依赖图补 `getTasks`**：原只调 `getDepGraph`；嵌入 PmCreatePanel 后补 `useQuery(['tasks',source])`（**与 `PmBoardPage` 同 queryKey、缓存共享、不双取**）填依赖/需求下拉。`onCreated` **同时失效 `['tasks',source]`+`['dep-graph',source]` 两查询**才即时重绘（少一个则图或看板滞后）。
  3. **看板↔依赖图互通（结构键路由，守 I0）**：`PmTaskCard` 加「在依赖图查看」按钮 → `onOpenInDepGraph(task.id)` → `App.focusTaskId` 暂存 → 切 dep-graph → `DepGraphPage` useEffect 图加载后按 `graph.nodes[].id===task.id` 选中并消费 focus。**传的是 task.id 结构键、非人 id**；早返回守卫（`!focusTaskId||!graph` return）防 onConsumeFocus 内联箭头换引用导致的重复触发。
  4. **I0 负责人降级（核心护栏）**：节点卡片 `dag-node__owner` **去掉 ownerLabel**、只留结构键（组·车）；`ownerLabel` 降级到 DetailPanel 按需显 + 新增「负责人只表分工·不代表进度快慢」反排名说明；topbar 加「图上只显任务/组/卡点·不排个人」。从「人维度画布常显」降到「按需显+反排名免责」。
- 对抗核实：`wf_9a77daa8`（2-lens：opus I0 暴露面 + opus React/TS 正确性，并行）双裁 **ship / mustFix=0**。I0 lens 实证净改善（移除一项画布常显人维度 + 反排名说明、focusTaskId 走结构键、PmCreatePanel confirmedBy 仅写侧不回显、无新 rank/快慢字段进读视图）；正确性 lens 实证 useEffect 无无限循环（focusTaskId 置 null 早返回幂等）、queryKey 共享无双取、空 tasks 各表单降级（needTwoTasks/needOneTask/optional chaining）不崩、props 可选缺省安全、无未用 import、既有 onConnect/拖拽连线未动。唯一非阻塞 note（onConnect useCallback deps 列了未读的 `source`）属**既有**、非本批引入，不在本 PR 修。
- 老实定位：DEPGRAPH-AI-AUTODRAW（AI 自动布大致 DAG）仍后置（依赖 Hermes 触点产品门，跳过）；真实 status 派生上游未接通；浮层未做 Esc 关闭（非必需）。
- 验证：hub-console `verify:all`（typecheck + 7 测 + vite build）全绿；完成度谓词硬化为 `grep PmCreatePanel … && npm --prefix apps/hub-console run verify:all`（D-055 同法），从 repo 根重跑 exit 0 才翻 done。纯 hub-console 前端，零 contracts/server/契约改动。
- 事实源：本 ADR；`apps/hub-console/src/features/dep-graph/DepGraphPage.tsx`（录入浮层 + getTasks + focus useEffect + ownerLabel 降级）/ `features/pm/PmBoardPage.tsx`（卡片跳转）/ `App.tsx`（focusTaskId）/ `i18n/translations.ts`（+6 键 zh/en）/ `styles.css`（浮层样式）；`D-052`（立项 + Q2 拍板）/ `D-048`（复用 PmCreatePanel）/ `D-055`（谓词硬化同法）；workflow `wf_9a77daa8`。

---

## D-057 — INTEGRATIONS-TO-SETTINGS：适配器→集成 + 设置页只读集成子节 + 总览精简（frontier done）

- 状态：**DECIDED / IMPLEMENTED**（2026-06-15）
- 日期：2026-06-15
- 上下文：D-052 提案审查 Q1 拍板的 console 收尾批第 2 项（完成度模型 priority 20）。诉求 4：「适配器」是技术黑话，用户语义是「集成 / 连外部应用」（飞书 / Hermes / git / 未来 QQ 微信钉钉）；且总览首屏被一排对接状态占住、喧宾夺主。
- 决策（实现定调）：
  1. **「适配器」→「集成」（仅文案，zh+en）**：所有面向用户的 `适配器`/`Adapters` 标签改 `集成`/`Integrations`（`overview.metric.adapters`、`overview.panel.adapters`、`enum.event.adapter.health.changed`）。**只改 value 不动 key**；状态枚举（已启用/已禁用/降级/未配置）是状态词、保留不动。
  2. **设置页新增「集成」只读子节**：`SettingsPage.IntegrationsSection` 用 `useQuery(['hub-overview',source])`——**与总览同 queryKey、复用同一份 getOverview 缓存、不双取**——只读渲染 `adapters.adapters`（displayName/capabilities/status pill），isLoading/error/empty 三态降级。**不引入真实触点接入**（仍 mock-first，语义是"对接状态只读展示"）。
  3. **总览精简到「指标 + 最近事件」**：删 adapter 详情 `panel-wide` 区，连带删只服务它的 `AdapterRow`/`StatusPill`/`ADAPTER_STATUS_KEY`/`AdapterDescriptor` import（全转移到设置页，避免 `noUnusedLocals` 报错），改成一行「集成对接状态已移到设置页 →」链接（`onNavigate('settings')`，App 传 `setPage`）；summary-strip 的「集成」指标 tile（enabled/total）保留。
- 对抗核实：`wf_f40f5aea`（2-lens：opus I0 暴露面 + opus React/TS 正确性，并行）双裁 **ship / mustFix=0**。I0 lens grep 实证 IntegrationsSection **只渲染 adapters 外部应用描述符**（`AdapterDescriptorSchema` 无 memberId，fixtures displayName 全是应用名 Feishu/Hermes/Git）、对 bridgeMember/memberId/rank 零命中——「集成」是连应用不是人，无人维度泄漏；relabel 未动任何含人字段（面向人的 bridge tile 原样保留）。正确性 lens 实证 queryKey byte 一致共享缓存无双取、删的 4 个 helper 零残留引用（typecheck 绿坐实）、`INTEGRATION_STATUS_KEY` 覆盖 4 枚举（Record 编译期强制）、5 新键 zh/en parity、`status-disabled` CSS 类存在不崩。
- 顺手收口：核实指出删 adapter panel 后 `overview.panel.adapters`/`overview.meta.unconfigured` 成孤儿 key（无消费方）→ grep 确认零引用后从 zh+en 删除（i18n 不留死键）。
- 老实定位：仍 mock-first；真实飞书/Hermes/git 触点接入后置（Hermes 统一触点门，本批不碰）。
- 验证：hub-console `verify:all`（typecheck + 7 测 + vite build）全绿（含孤儿 key 清理后重跑）；完成度谓词硬化为 `grep -qi 'integration' SettingsPage.tsx && npm --prefix apps/hub-console run verify:all`，从 repo 根重跑 exit 0 才翻 done。纯 hub-console 前端，零 contracts/server 改动。
- 事实源：本 ADR；`apps/hub-console/src/features/settings/SettingsPage.tsx`（IntegrationsSection）/ `features/overview/OverviewPage.tsx`（删 panel + 一行链接）/ `App.tsx`（onNavigate）/ `i18n/translations.ts`（relabel + 5 新键 − 2 孤儿）/ `styles.css`；`D-052`（立项 Q1）；workflow `wf_f40f5aea`。

---

## D-058 — CONSOLE-COPY-HUMANIZE：用户可见文案去 AI 味 / 治理黑话（护栏语义保留，frontier done）

- 状态：**DECIDED / IMPLEMENTED**（2026-06-15）
- 日期：2026-06-15
- 上下文：D-052 提案审查后 console 收尾批第 3 项（完成度模型 priority 25）。三支柱读写跑通后，UI 文案积了一批"治理黑话 / AI 味"——「协作真相」「词重合度」「同因」「派生知识点」「归组不归人」——对外行用户费解。用 humanizer-zh 原则去味，但**死守一条线：去黑话不能丢护栏语义**（A4 相似检索免责 / C2 反排名 / A1 缺口归组不归人 都是反监视铁律的用户可见落点）。
- 决策（实现定调）：
  1. **只改 value 不动 key、zh/en 同步**：6 处 console i18n——`pm.create.title`（删「协作真相」→「全员都看得到」）/`pm.create.subtitle`（「不记谁快谁慢、不排名」→「不比谁快谁慢」）/`pm.field.needDescription`（「归组不归人」→「按组，不点人」）/`kb.empty`（去「词重合度/同因」黑话）/`kb.closeout.intro`（去「派生知识点」）/`kb.closeout.success.knowledge`（「派生知识点」→「存下的知识点」）。
  2. **后端可见串同步**：`hub-server` `KB_SIMILAR_NOTE` 去「词重合」黑话改「匹配程度」、「同因」→「就是同一个原因」，**显式保留「不断言」**（`kb-similar-route.test.ts:22` 断言 `body.note` 含「不断言」）；连带把 console `api/mock/kb.ts` 的演示 note 对齐同句（其注释本就承诺"与后端 A4 措辞一致"）。
  3. **刻意保留不动**：`deriveKnowledgeNodeFromIssue` 的「踩过的坑：」知识节点名前缀——既是 `gov-store-scaffold.test.ts:66` 的测试输入数据，又本就是地道人话（非黑话），改它有害无益；源码注释 / `pm-routes.test.ts` 注释里的「归组不归人」是内部 A1 原则说明、非用户可见 copy，不动。
- 护栏语义保全（本任务红线）：逐条核实去黑话后 A4（只列候选·不断言同因·由人选用）、C2（不比快慢·反排名）、A1（缺口按组不点人）实质全部保留、无削弱无反转，未引入任何「谁快谁慢/排名/盯人」暗示。
- 对抗核实：`wf_8c5051bf`（2-lens：opus 护栏语义保全 + sonnet 保真 / 测试安全）双裁 **ship / mustFix=0**。护栏 lens 逐条确认反监视语义保留；保真 lens 确认零测试断言被撞（`不断言`/`踩过的坑：` 都还在）、`归组不归人` 已从 translations.ts 彻底消失（仅余源码注释）、zh/en parity、无事实增删。
- 验证：`hub-console` + `hub-server` 双 `verify:all` 全绿（hub-server 74 测含 kb-similar-route、hub-console 7 测 + build）；完成度谓词硬化为 `! grep -q '归组不归人' translations.ts && npm --prefix apps/hub-console run verify:all && npm --prefix apps/hub-server run verify:all`，从 repo 根重跑 exit 0 才翻 done。
- 事实源：本 ADR；`apps/hub-console/src/i18n/translations.ts`（6 键 zh/en）/ `api/mock/kb.ts`（mock note）/ `apps/hub-server/src/contracts.ts`（KB_SIMILAR_NOTE）；`D-052`（立项）/ `humanizer-zh` 技能；workflow `wf_8c5051bf`。

---

## D-059 — AUDIT-FIXES：7 条联网部署前必修一次落地（frontier done）

- 状态：**DECIDED / IMPLEMENTED**（2026-06-15）
- 日期：2026-06-15
- 上下文：`code-audit-2026-06-14.md`（15-agent 对抗审计、confirmed 42）列「部署前必修 7 条」，D-049 落档时定「本轮只落档、修复后置」。三支柱读写 + console 收尾批跑通后，本批一次性补齐这 7 条信任边界 / 可用性 / 持久性缺陷——目标是把「现只内网 demo 安全」抬到可联网部署。
- 决策（逐条修复定调）：
  1. **H1 依赖环 → DoS**：`attribution.ts` `computeCriticalSet` 回溯加 `visited` 守卫（防 parent 链成环死循环卡死整个 server 事件循环——这是**已有环**的读路径兜底）；新增纯函数 `wouldCreateCycle(deps, from, to)`（自环 + 从 to DFS 可达 from，自身有 `seen` 守卫故对已含环的图也 DoS 安全）；`POST /api/dependencies` 落库前调它拒自环/成环（400）——后端原零语义校验、是新边的防线。
  2. **H2 写链中毒**：`FileKbStore.persist` 拆成 `op = writeChain.then(writeOnce)` + `writeChain = op.catch(()=>undefined)`（失败隔离、链 reset 为 resolved，避免一次磁盘抖动后每次 persist 静默跳过、内存与磁盘分叉）+ 返回 `op` 给调用方拿真实错误；`writeOnce` 失败 `unlink` 残留 .tmp（L2）。
  3. **H3 写端点零鉴权**：Fastify 构造 `bodyLimit:256KB`（M17）+ `onRequest` 钩子（仅 `POST /api/*`）——配了 `TEAMHUB_WRITE_TOKEN` 则强制 `Bearer`（401），每 IP 固定窗口限流（429，用真实墙钟 `Date.now` 与派生 clock 解耦、每实例独立）；`main.ts` 非 loopback（≠127.0.0.1/::1/localhost）且未配 token → **拒绝启动**（避免裸暴露未鉴权写端点）。`BuildHubServerOptions` 加 `writeToken?`/`writeRateLimit?`。
  4. **H4 字段注入**：`CreateTaskRequestSchema`（hub-contracts 单一源）status 钳到 `z.enum(['pending','inProgress'])`、statusSource 钳到 `z.enum(['lark','git','console'])`——拒客户端注入 `done`/`shelved`（跳过工作伪造完成）/ `derived`（冒充系统派生信号、违 C5）。**保留** git/lark 派生信号建 `inProgress` 任务的合法用法（取「限制 enum」而非「整删字段」，正是为不破该合法用例 + 既有测试）。
  5. **M6 I0**：`CreateDependency/NeedResponseSchema` `omit({confirmedBy:true})`——创建响应不把 ActorRef 送过边界（读视图永不回人键，也不给未来 GET 路由留照抄模板）。
  6. **H5/M11 compose**：删幻影 Postgres（服务 / `depends_on` / `DATABASE_URL` / `pg_data` 卷——hub-server 无 PG 客户端、从不读，原配置白等 ~60s + 误导运维）；接 KB 持久（`TEAMHUB_KB_DATA_FILE` + `hub_kb` 卷，否则容器重启丢全部 IssueCard/ErrorEntry/Archive）；`deploy/teamhub.env.example` 补 `TEAMHUB_KB_DATA_FILE` + `TEAMHUB_WRITE_TOKEN`（compose bind 0.0.0.0 故必须非空，与 H3 拒启动逻辑闭环）。
  7. **M9 errorCode 碰撞**：`deriveErrorCode(now, issueId, sequence?)` 加可选单调序号（省略回退哈希，供 CLI 历史导入 / console mock 无 store 访问处用）；结案路由用「同日既有 ErrorEntry 数 + 1」传入——消除哈希 mod 1000 在 ~38 次/日生日碰撞 → 静默覆盖污染 `kb-similar` 跨赛季查找。
- 测试：`+11` 测——新 `audit-fixes.test.ts`（10：H1 自环/成环不落库、M6 dep/need 响应无 confirmedBy、H4 done/derived→400 + 合法 inProgress/git→201、H3 401/正确 Bearer→201/GET 放行/限流 429）+ `kb-store-persist.test.ts` H2 失败隔离（1，确定性失败注入=父目录换文件让 mkdir 抛 EEXIST）+ 新 `cycle-guard.test.ts`（6：自环/空图/2 节点回边/传递环 A→B→C+C→A/DAG 不环/已含环 DoS 安全）；**更新** `kb-closeout-route.test.ts` errorCode 测试从 `.toBe`（同码复现=审计指出的碰撞 bug）改 `.not.toBe`（M9 单调不碰撞契约，诚实反映新行为）。
- 对抗核实：`wf_99ea69cb`（3-lens：opus 安全/绕过 + opus 正确性 + opus 回归/完整，并行）**全 ship、mustFix=0**。安全 lens 实证无可绕过（`wouldCreateCycle` DFS 方向对、`computeCriticalSet`/`findRoot` 读路径都有 visited 守卫、唯一依赖写入口走环检测、`onRequest` 钩子覆盖全部 5 个 `POST /api/*`、`isLoopback` 判定把 0.0.0.0 正确视为需 token、bodyLimit 在构造生效、H4 store 无旁路）；正确性 lens 用独立脚本实证 H2 链 reset+串行化保留、M9 两次结案不同码且格式不破、H4 enum 拒注入、M6 Zod 默认 strip 真剥 confirmedBy；回归 lens 实证 7 条全落、现有 POST 测试不被鉴权/限流误伤（都无 token + 默认 120/窗）、compose env_file+0.0.0.0+main.ts 拒启动闭环（容器能起）。
- 老实定位（非部署阻断）：rate-limit key=`request.ip` 在反代后塌成单桶（无 trustProxy/X-Forwarded-For）；Bearer 非定长比较（时序攻击 out-of-scope）；`TEAMHUB_WRITE_TOKEN` 出厂占位值，env 注释明示暴露前改强随机串（`openssl rand -hex 32`）。`wouldCreateCycle` 已补 hub-contracts 直接单测（核实建议的传递环用例）。
- 验证：`hub-contracts` 47 测 / `hub-server` 85 测 / `hub-console` 7 测 + build 三包 `verify:all` 全绿；`git diff --check` 干净；AUDIT-H1-CYCLE-GUARD / AUDIT-H3-WRITE-AUTH 完成度谓词硬化为「接缝锚 grep + hub-server verify:all」，从 repo 根重跑 exit 0 才翻 done。
- 事实源：本 ADR；`code-audit-2026-06-14.md`（7 条必修清单）；`apps/hub-contracts/src/{attribution,error-code,pm-requests}.ts` / `apps/hub-server/src/{server,main,contracts,store/file-kb-store}.ts` / `compose.yaml` / `deploy/teamhub.env.example` / 4 测试文件；`D-049`（落档）/ `D-055`（谓词硬化同法）；workflow `wf_99ea69cb`。

---

## D-061 — v1 能跑产品：治理快照落盘 + 图纸提交日志 + 删 mock 单后端（workflow 连续构建）

- 状态：**DECIDED / IMPLEMENTED**（2026-06-15）
- 日期：2026-06-15
- 上下文：用户以 PM 视角定 v1 = **「先做出来一个能跑的、接口都能接进来」**，明确「不要急着说这里没接那里没接」（真实上游派生是 by-design 后置、非 bug）。PM 体检发现真正挡「能跑」的硬伤：**PM/治理数据不落盘**——KB 有 `FileKbStore`（重启不丢），但 gov 只有 `InMemoryGovStore`（seed 演示 fixture）+ `SqliteGovStore` throw 桩，真实模式录的任务/依赖/缺口**重启清零、还被演示假数据占着**；且 mock 数据源开关造成「切源即重置」困惑；图纸档案只有扁平 2 条 fixture、无机构/版本/历史。用户拍板用 workflow 连续做掉。
- 决策（实现定调）：
  1. **图纸提交日志模型**：`ArtifactRefSchema`（hub-contracts）加可选 `mechanism`(机构/部件) + `revision`(第几版) + `submittedVia`(git/lark/console 来源 seam)，向后兼容；「提交日志/时间线」= 同机构多条 `ArtifactRef` 按 `createdAt` 排。
  2. **图纸搬进治理快照**：`GovernanceSnapshot`（**手写 TS interface in attribution.ts，非 zod schema**——design-lock 纠正 A2 措辞）加 `artifacts: ArtifactRef[]`；`GET /api/artifacts` 改读 `(await store.getSnapshot()).artifacts`。**保留** `artifactRefFixtures`/`apiContractFixtures.artifacts` 导出（`fixtures.test.ts` 未改仍断言）。
  3. **`FileGovStore`**（NEW hub-server，**1:1 镜像 `FileKbStore`**）：原子 tmp+rename 写 + writeChain 失败隔离（AUDIT H2 同法）+ `create(file, seed)` 读盘或 seed+persist + 载入走 `GovernanceSnapshotSchema` fail-closed；写白名单（createTask/createDependency/createNeed/closeoutKbNode）内嵌 `InMemoryGovStore` 复用 id/时戳/clamp 逻辑零漂移、每次写后 `persist()`。`main.ts` 读 `TEAMHUB_GOV_DATA_FILE`→`FileGovStore.create()` 注入 `buildHubServer({store})`（镜像 KB 块，H3 loopback/token 逻辑不动）。compose + env.example 加 `TEAMHUB_GOV_DATA_FILE` + `hub_gov` 卷（镜像 KB H5）。
  4. **种子**：`governanceScenarioFixture.artifacts` = 8 条真实版本日志（底盘 v1/v2/v3、抬升机构 v1/v2、夹爪 v1、视觉模组固件 v1/v2，各带 mechanism+revision+kind+date+uri[+relatedCommit]）。fresh 数据文件 seed 此快照（**空板起步是后置 1-flag，本轮用户明确要测试种子数据**）。
  5. **删 mock 数据源模式**：删 `apps/hub-console/src/api/mock/*`，去 `source: mock|real` 开关（App/ConsoleLayout/SettingsPage），`createHubApiClient` 恒真实；重写 `client.test.ts` 3 个 mock 测为注入 fetcher 的真实模式测（保覆盖）；删死 i18n 键 + 把 8 条「切到演示数据」误导文案改指「检查后端地址/服务」；zh/en `Record<TranslationKey>` parity + 3 条 I0 串原样。
  6. **console 图纸档案页**：NEW `features/archive/ArchivePage.tsx`——`getArtifacts()`（新增到 HubApiClient）→按机构分组（无机构归「未分组」末位）、组内日期倒序、组按最新活跃排，每条显 名·版本徽章·类型·日期·关联提交·地址；真实导航项 `nav.archive`（FileStack 图标，**非禁用**，在 PM 与灰 INV 之间）+ App 页切换 + i18n 9 键 zh/en。**I0**：artifact 无人维度，页不显人/排名。
- 构建方式：7-agent workflow `wf_eb55b2ca-8fe`（design-lock[opus 验架构+出 per-unit DoD]→后端实现[opus]→删mock[opus]→档案页[opus]→3-lens 对抗核实[opus 并行：I0护栏/正确性·回归/DoD·诚实]→repair[未触发]）。design-lock 抓出 6 处真实接缝（GovernanceSnapshot 是 interface 非 schema、required 字段涟漪 schedule fixtures 经 spread 继承、apiContractFixtures.artifacts 消费方、client.test.ts 路径、DataSource 线程、getArtifacts 不存在需新增）并校正实现，**architectureOk:true**。6 原子 commit `5a2c96d→01d06f4`（先在 feature 分支，我 ff master 后 push）。
- 对抗核实：3-lens **全 ship、mustFix=0**。I0 lens grep 实证 3 条 I0 串 zh+en 原样 + 无人维度新增；正确性 lens 独立跑三包 verify:all 全绿 + 实证 FileGovStore 落盘/round-trip；DoD lens 实证 8 单元全落、commit 原子+本地未推、无 §10 过度声称。2 条非阻塞 nit（`routes.test.ts` artifacts 只断言 length>0 不证 store-sourcing；`gov-store-persist.test.ts` 未断言新字段 round-trip——功能已 smoke 实证）。
- **我（主循环）独立验证**：三包 `verify:all` 重跑 exit 0（hub-contracts 47 测 / hub-server 89 测[+4 gov-store-persist：seed-on-fresh/重启不丢/corrupt fail-closed/H2 写链不中毒] / hub-console 6 测 + build）；`git diff --check` 干净；**真机 smoke**（4199 单端口 console+API+`TEAMHUB_GOV_DATA_FILE`）：`GET /api/artifacts` 返 8 条版本日志（机构/版本/来源/日期/关联commit）、FileGovStore 落盘 15KB 文件含 8 artifacts+8 tasks（重启不丢实证）、Playwright 视觉档案页按机构分组时间线正确、mock 文案/开关消失、4177 旧实例未碰。
- 老实定位（非阻塞）：真实 status / 图纸上游派生仍未接（seam 留 `statusSource`/`submittedVia` 枚举 + `store?: GovStore` 注入口，等 Hermes/飞书/Git 触点）；fresh 文件 seed 测试数据、空板起步是后置 1-flag；2 条测试断言强度 nit 待排（功能已实证）；OverviewPage→档案页链接（低优先级）未加。
- 事实源：本 ADR；`apps/hub-contracts/src/{schemas,attribution,fixtures}.ts` / `apps/hub-server/src/{server,main}.ts` + `store/file-gov-store.ts` + `test/gov-store-persist.test.ts` / `apps/hub-console/src/features/archive/ArchivePage.tsx` + `api/client.ts` + `App.tsx` + `components/layout/ConsoleLayout.tsx` + `i18n/translations.ts` / `compose.yaml` / `deploy/teamhub.env.example`；workflow `wf_eb55b2ca-8fe`；`D-042`（base 收口刀 GovStore 扩展点）/ `D-059`（FileKbStore H2/H5 同法）/ `D-049`（设置页）。

---

## D-062 — 集成模型地基重建：扁平 AdapterDescriptor → BotChannel / AgentBackend / DataSource 三分

- 状态：**DECIDED / IMPLEMENTED**（2026-06-15）
- 日期：2026-06-15
- 上下文：旧的扁平 `AdapterDescriptor` 把"机器人触点 / AI 后端 / 只读数据源"三类语义混成一张表——`kind` 字段是装饰、无人 switch、invoke 契约错配、status 假值、lark 有三个互不相连化身，难以演进真实接入。同时认证模型拍定 = **A「公共后端、无登录」**（服务端无账号/session/JWT，唯一鉴权是全队共用 `TEAMHUB_WRITE_TOKEN` 仅挡非 loopback 的 POST；飞书/微信/QQ 当通知渠道、非登录方式；"我的视图/按人记账"才需上 B 登录，已推迟）。详见 memory `teamhub-integration-model` + 计划文件 `a-qq-bot-hermes-openclaw-agent-shimmering-cherny.md`。
- 决策（实现定调）：
  1. 拆成三个一等公民：**`BotChannel`**（飞书/微信/QQ，连接型 status，动词 receive/reply/push）/ **`AgentBackend`**（hermes/openclaw/claude-code，唯一有 invoke/health/capabilities，字段 `backendId`）/ **`DataSource`**（git-forge/artifact-store，只读，`sourceRef`；artifact-store=`filebrowser://artifacts` 预留 Filebrowser 落点）。
  2. 路由：`/api/adapters*` → `/api/bot-channels` + `/api/agent-backends`（+ `:backendId/health|capabilities|invoke`）+ `/api/data-sources`。
  3. `AdapterDescriptorSchema` **弃用保留**（lark-gateway/lark-toolkit/pf-skills 三个真 app 的 hub.ts 仍用它自描述，删了得罪 3 个 app）。删 xiaolongxia、pf-skills 移出集成列表。
  4. mock：`mock-adapters.ts` → `mock-integrations.ts`（bot-channel + data-source），`mock-ai-adapters.ts` → `mock-agent-backends.ts`。
  5. console 设置页集成子节按三类分小节渲染；i18n zh+en + styles。
- 老实定位（非阻塞）：`HubEventSourceSchema` 仍混 bot/agent/内部源（事件源枚举清理推迟）；飞书真实连接状态探测推迟（`BotChannel.status` 现为诚实占位）；系统状态 `adapters` 字段语义漂移为 agent-backend 计数（靠 i18n 标签消解）；真实触点接入仍 mock-first。
- 验证：hub-contracts 47 测 / hub-server 91 测 / hub-console 6 测 全绿 + 三包 build + 活体 curl 三组新端点过；3 个 bot app 未装 vitest 跑不了但未改其源、依赖符号保留。
- 事实源：本 ADR；`apps/hub-contracts/src/{schemas,fixtures,index}.ts` / `apps/hub-server/src/{contracts,server,status}.ts` + `mock-integrations.ts` + `mock-agent-backends.ts` / `apps/hub-console/src/{api,features/settings/SettingsPage,i18n/translations,styles}`；memory `teamhub-integration-model`；`D-057`（适配器→集成进设置）/ `D-061`（v1 能跑产品）。

---

## D-063 — 依赖图运维操作：任务状态流转 + 连线作废（软删除）

- 状态：**DECIDED / IMPLEMENTED**（2026-06-15）
- 日期：2026-06-15
- 上下文：依赖图只能「建任务 / 建依赖」，无法把「进行中」任务标完成、无法删错连的依赖。根因是 `GovStore` 故意的「只建不改」写白名单（C3 小作坊：无 update/delete/list 全家桶），且任务状态本设想由 git/lark 派生信号推出、但该管线尚未接 → 实际部署里状态=创建时手填、永不变化（用户实测「进行中删不掉/标不了完成」）。详见 plan `distributed-rolling-parasol.md`。
- 决策（实现定调）：
  1. **不引入通用 CRUD**，框定为「既有枚举上的受限状态机迁移」：`TaskStatus` 用既有 `done`/`shelved`（标完成是合法迁移，区别于建任务期「禁 done」防伪造）；`DependencyStatus` 用既有 `waived`（人工判定作废=**软删除**，保留 confirmedBy/createdAt 可审计，**不物理删**）。
  2. 新写入全用 **POST 子资源动作**：`POST /api/tasks/:id/status`、`POST /api/dependencies/:id/waive`——因写鉴权钩子（H3）只拦 `POST /api/*`，用 PATCH/DELETE 会**绕过 Bearer 鉴权 + 限流**。
  3. **C5**：`statusSource` 一律 server 钉 `console`（最低优先源；请求 schema 不收 statusSource，结构上杜绝冒充 derived/git/lark）。**I0**：响应剥 confirmedBy。**视图**：`toDepGraphView` 边循环跳过 `waived`（从图隐藏），`satisfied` 仍可见。waive 只删边不可能成环、无需 cycle 守卫。
  4. console：`DetailPanel` 加「标记完成 / 重新打开」按钮 + 全状态下拉（搁置走内联二次确认）；连线**点选 → 画布顶部删除确认条**（`deleteKeyCode=null` 禁删除键防误删）；删除条**优先于残留成功/错误横幅**显示（否则建依赖的成功横幅会挡住删除条 = 用户实测「删不掉」根因）；成功/错误横幅 **4s 自动消失**。
  5. `GovStore` 接口加 `updateTaskStatus`/`waiveDependency`（InMemory/File 实现 + Sqlite stub）；未命中 id 返回 null → 路由 404；File 仅命中才落盘。
- 验证：hub-contracts **48** 测 / hub-server **101** 测 / hub-console **7** 测 全绿 + 三包 build + 本机活体 curl（200/400/404 + waived 隐藏）+ **WSL2 真机部署活体验收**（rainman@DESKTOP-Jackrainman 127.0.0.1:4177，git-bundle/patch 过 SSH，标完成/删连线浏览器实测）。
- 事实源：本 ADR；plan `distributed-rolling-parasol.md`；`apps/hub-contracts/src/{pm-requests,attribution}.ts` / `apps/hub-server/src/{store/{gov-store,mock-gov-store,file-gov-store,sqlite-gov-store},contracts,server}.ts` / `apps/hub-console/src/{api/client,api/schemas/pm,features/dep-graph/DepGraphPage,i18n/translations,styles}`；`D-059`（H3 写鉴权 / H4 status clamp）/ `D-042`（写白名单初始态 clamp）。

---

## D-065 — 审计后 server 硬化 + 写侧正确性批（写侧小批 + 预写部署代码合并 pass）

- 状态：**DECIDED / IMPLEMENTED**（2026-06-15）
- 日期：2026-06-15
- 上下文：用户问「项目还有哪些可优化 / 构建」→ 跑 14-agent 审计 workflow（`wf_2f92f9cc-bd7`：6 finder[审计项重对账 / 新代码 bug / I0 安全 / 架构工具 / 前端 / 构建路线图]→对抗核实→综合）产 38 优化 + 24 构建。用户拍板：先做两批无外部门、可立即落地的——「写侧正确性小批」+「预写部署代码」，因都改 `server.ts`/契约层，合并成一次 pass。bridge/members 逐人状态板（唯一确认 I0 违反）用户拍**暂时保留**、标真实部署前必处理（fixture-only + 治理层 D-039 已挂起，现不急）。
- 决策（实现定调）：
  1. **写侧正确性（已对抗核实）**：`POST /api/agent-backends/:id/invoke` `.parse`→`safeParse`+400（M8 旧账，D-062 改路由名漏补，全 POST 唯一抛错处）；`POST /api/kb/closeout` 补 `reply.code(201)`（L4）；`InMemoryGovStore` 构造器补全克隆 groups/members/taskKnowledgeTags（M13，8 数组与 `FileGovStore.cloneSnapshot` 对齐）；补 console 写侧测试 createTask/createDependency/createNeed/closeoutKb + 400-detail 透出（M21）+ hub-server invoke-400 回归。
  2. **预写部署代码（上线等 §8 审批、代码先就位）**：`SystemStatusResponseSchema.mode` `z.literal('mock-first')`→`z.enum(['mock-first','real','hybrid'])`（real/hybrid 部署 server 自解析自身响应不再 500）+ `buildSystemStatusResponse` 加 mode 参默认 mock-first；`buildHubServer` 加 `trustProxy?` 透传 Fastify + `TEAMHUB_TRUST_PROXY=true`（4177 反代/隧道后面不开则写限流塌成全队单桶=DoS）；`TEAMHUB_DEMO_SEED=false` 空板起步（V1-FOLLOWUP-2，fresh 落盘文件 seed 空板、不进演示假数据，仅影响新建文件）+ env.example 补 token 强随机提示 / TRUST_PROXY / DEMO_SEED。
  3. **不在本批动**：bridge/members（用户拍暂留）、ownerId/ownerLabel（D-041 安全堆设计张力非泄漏，待 AGENTS §5 措辞对账）、前端 a11y 簇（M14/15/16）、M20 workspace 工具、KB schema 双声明等长尾 → 留后续 console 批 / 部署批。
- 验证：三包 verify:all 全绿（hub-contracts 48 / hub-server **102**[+1 invoke-400] / hub-console **9**[+2 写侧]）+ git diff --check 干净 + 真机 smoke（`TEAMHUB_DEMO_SEED=false` → /api/tasks·/api/artifacts 空、season 元信息留；默认 → 8 任务 + 8 图纸；mode 仍 mock-first 正常解析）。
- 事实源：本 ADR；审计 workflow `wf_2f92f9cc-bd7`；`apps/hub-contracts/src/system-status.ts` / `apps/hub-server/src/{server,status,main,store/mock-gov-store}.ts` + `test/{routes,kb-closeout-route}.test.ts` / `apps/hub-console/test/client.test.ts` / `deploy/teamhub.env.example`；`code-audit-2026-06-14.md`（M8/L4/M13/M17/M20/M21 源）/ `D-059`（H1~M9 部署前必修首批）/ `D-061`（V1-FOLLOWUPS）。

---

## D-067 — 图纸档案可写：POST /api/artifacts + console 登记表单（V1-FOLLOWUPS 收尾）

- 状态：**DECIDED / IMPLEMENTED**（2026-06-16，commit `b7eaf4b`）
- 日期：2026-06-16
- 上下文：用户「teamhub 后续还有什么任务，有的话顺推」。盘点 frontier：可执行项仅剩 V1-FOLLOWUPS（低优先级·非阻塞），余皆卡用户排期或外部基建（INV/Hermes/KB-LARK/正式部署/治理派生挂起）。V1-FOLLOWUPS 四子项中 ②（空板起步）早于 D-065 已 done，①③④ 未做。顺推图纸档案从「只读 + 8 条种子」升为可写。
- 决策：
  1. **append-only 提交日志，不解版本进阶语义**：本刀只做「机构能记一条新版本日志」的 append；图纸版本进阶语义（谁 bump / 自动 vs 手动 / 当前权威版指针 / 撞坏回退 / 按车分支）仍是 `ARTIFACT-VERSION-SEMANTICS`（open_for_decision），不在本刀触及。`revision` 是提交者自填自由字符串、无自动版本号语义。
  2. **写白名单第五个 append 写法 `appendArtifact`**：`GovStore.appendArtifact(draft: ArtifactDraft)`，`ArtifactDraft = Omit<ArtifactRef,'id'|'createdAt'|'submittedVia'>`。三 Store：InMemoryGovStore 补 id/createdAt/`submittedVia:'console'` 后 push（照搬 createTask）；FileGovStore 写后 `persist()`（原子 tmp+rename，落盘累积，`GovernanceSnapshotSchema` 已含 `artifacts` 无需改 schema）；SqliteGovStore throw NOT_IMPLEMENTED stub。
  3. **请求契约收紧只在写侧**：`CreateArtifactRequestSchema = ArtifactRefSchema.omit({id,createdAt,submittedVia}).extend({mechanism,revision: z.string().min(1)})`——base `ArtifactRefSchema` 三字段保 `optional`（向后兼容 8 条种子 + git 录入的可选字段、不破 fail-closed 加载），仅写侧强制 mechanism/revision 必填。schema 落 `pm-requests.ts`（单一源，非 schemas.ts）；server 经 `contracts.ts` 间接层 re-export。
  4. **C5 submittedVia 由 server 钉 console**：请求 schema `omit` 掉 submittedVia（客户端注入被 Zod strip），store 在 `...draft` spread 后硬覆盖 `submittedVia:'console'`（防御纵深）。人工录入是最低优先源，git/lark 派生信号未来可覆盖。
  5. **I0 图纸日志永无人维度**：`ArtifactRef` 无任何 person 字段、不引用 ActorRef；日志主键 = 机构 mechanism + 版本 revision + 归档物 name/uri，绝不加「提交人/确认人」。对抗探针实测：夹带 memberId/submittedBy/confirmedBy 经 Zod 默认 strip，既进不了落盘也回显不出。表单不收人名、读视图（ArchivePage/OverviewPage）不渲染提交人。
  6. **H3 鉴权自动继承**：POST /api/artifacts 注册在 onRequest 钩子之后，自动受全 POST /api/\* 的 Bearer + 限流 gate，零旁路、不另写鉴权。
- 落地面：`hub-contracts/pm-requests.ts`（Create*Schema/type）；`hub-server`（contracts.ts re-export / server.ts POST 路由 / store{gov,mock-gov,file-gov,sqlite-gov}.ts）；`hub-console`（api/client.ts + api/schemas/pm.ts barrel / features/archive/ArchivePage.tsx 表单 / features/overview/OverviewPage.tsx 链接 / i18n）。**①** 硬化 2 测（routes 证 store-sourcing / persist 断言 mechanism·revision·submittedVia round-trip）。**写路径测试补全**：pm-routes +2（201·夹带 lark 被 omit·落盘 +1 / 缺字段 400）+ client.test M21 补 createArtifact。
- 构建：4-phase workflow `wf_1097920a-e67`（design-lock[opus 抓 15 接缝]→后端[opus]→前端[sonnet]→2-lens 对抗核实[opus×2：I0/反排名 + 正确性/回归/DoD]双 **ship·mustFix=0·i0Clean**）；首跑第 2 verify lens 中断、`resumeFromRunId` 续跑命中前序 cache。
- 验证：三包 verify:all 全绿（hub-contracts 48 / hub-server **109**[+2 artifact 路由测] / hub-console 9）；git diff --check 干净；真机 4188 smoke（POST 夹带 submittedVia=lark→被压成 console、缺 mechanism/revision→400、GET 8→9、落盘文件含新条 round-trip）。
- 老实定位：图纸版本进阶语义仍 open（ARTIFACT-VERSION-SEMANTICS）；真实图纸上游派生（git/lark 自动登记）未接、靠表单录入兜底；InMemory id `artifact-new-${len+1}` 跨重启非全局唯一（沿用 create* 既有约定、非本刀引入）。**frontier 自此真正见底**——下一步全卡用户排期或外部基建（Hermes/飞书/SSH/§8 审批）。
- 事实源：本 ADR；`now.md`「最近完成 2026-06-16」；commit `b7eaf4b`；workflow `wf_1097920a-e67`。

---

## D-068 — 设置页风格切换器：运行时主题（经典绿 / 暖纸 Aurash），纯 CSS-variable 换肤

- 状态：**DECIDED / IMPLEMENTED**（2026-06-16）
- 日期：2026-06-16
- 上下文：V1-FOLLOWUPS 收尾后用户问「接下来需要排版的部分」。frontier 上唯一视觉/排版条目 = `UI-RESTYLE-AURASH`（D-060，已决策但搁置，PILOT-FIRST）。澄清后用户给的不是「一次性换肤」，而是 **「做一个切换风格的功能，在设置里」**——即运行时主题切换器。这恰把 D-060 Phase 0（换 token，<0.5 天拿 80% 视觉收益）包装成可回退的 opt-in 功能。
- 决策：
  1. **纯 CSS-variable 主题，不引框架**：明确**不是** D-060 那条 7–14 人天 Tailwind+Radix 迁移，而是其 token 层的「可切换」版。全站组件早已消费 `var(--*)`，故第二套 token 挂在 `:root[data-theme='warm']`（特异度 0,2,0 > `:root`），切换属性即整站换肤、**绝大多数组件零改动**。无 preflight / 无 @xyflow reset 风险 / 零新依赖。
  2. **架构逐行镜像 i18n 语言切换**：新 `theme/index.tsx` 照搬 `i18n/index.tsx`——`ThemeProvider`（localStorage `teamhub.theme` 持久 + `documentElement.dataset.theme` + `useEffect` 同步）/ `useTheme()`（未挂 Provider 即 throw）/ 纯函数 `normalizeTheme(value): Theme`（未知值 fallback，供单测，不测 DOM）。`main.tsx` `<ThemeProvider>` 包 `<LanguageProvider>`。
  3. **默认 classic（现行绿），暖纸 opt-in**：`DEFAULT_THEME='classic'`，无 `data-theme` 属性时与现状像素一致、不惊扰现有用户。暖纸起步调色 = 米色面 `#f7f6f3` + 暖白卡 `#fffdf9` + 近黑字 `#37352f` + 发丝线 + 暖炭侧栏 `#2b2922` + serif 标题（Georgia/Songti/Noto Serif）；accent（绿/红/琥珀/蓝 + `*-soft`）暂留为状态语义色、跨主题通用，起步值可在 4177 实时微调。
  4. **tokenize 少量硬编码色**：原写死的 `:root` 页底色、`.console-sidebar` bg/text 提升为 `--page-bg`/`--sidebar-bg`/`--sidebar-text`；`h1/h2` 加 `font-family: var(--font-title)`（classic 默认 `inherit` 仍 Inter）。设置页加「外观」section，复用既有 `segClass` + `.seg` 控件（零新 CSS），i18n 加 4 键 zh/en（`Record<TranslationKey>` 编译期强制对称）。
- 落地面：`hub-console` 新 `theme/index.tsx`、`main.tsx`（挂载）、`styles.css`（tokenize + 暖纸覆盖块）、`features/settings/SettingsPage.tsx`（外观区块）、`i18n/translations.ts`（4 键 ×2）、新 `test/theme.test.ts`（normalizeTheme 2 测）。后端/契约**零改动**。
- D-060 护栏守住：不引 Tailwind/Radix（无 preflight 风险）；不碰 I0 反排名 3 承重串；zh/en 编译期对称；**未从 xju-feiyue/Aurash 拷 tokens.css**（暖纸值手挑中性结构色）；不引 dueDate、不加排名维度。
- 验证：hub-console verify:all（typecheck 强制 parity + 11 测[+2 theme] + build）全绿；hub-contracts/hub-server verify:all 零回归（48 / 109）。**头无界面浏览器，故走构建产物 + 活体 serve 核实**：产出 CSS 含暖纸 token 块（`f7f6f3`/`2b2922`/`37352f`/`Georgia` 实测在 dist）+ tokenized `var(--page-bg|sidebar-bg|font-title)`；JS bundle 含 `teamhub.theme`/`dataset.theme`/`ThemeProvider` 守卫 + i18n `teamhub.lang` 未损；hub-server 起 4177 托管 console：`GET /`=200、index 引新 bundle、served CSS 可达 `f7f6f3`、`GET /api/artifacts`=200。
- 老实定位（已知边界，不假装全覆盖）：**dep-graph 连线色不随主题变**——`DepGraphPage.tsx` 的 `EDGE_COLORS` 与选中边 `stroke:'#2f6f9f'` 是 JS 常量/写死 hex，CSS-variable 主题碰不到，v1 保持原样（红/蓝/琥珀/灰为状态语义色，跨主题可接受）；`.dag-node--*` 斜纹用 token → 随主题变。**真实视觉切换（整站换色 + 侧栏 + serif + 刷新保持）需用户在 4177 浏览器实眼验收**（headless 不可代替）。暖纸调色为起步值、待主观微调。
- 事实源：本 ADR；`now.md`「最近完成 2026-06-16」；D-060 + `docs/research/aurash-restyle-assessment.md`。

---

## D-077 — IA 重构修正：图纸档案拆回独立页 + 导航全摊平 + 缺人方向置末

- 状态：**DECIDED / IMPLEMENTED / VERIFIED（本地 master `9c4cc5d`，revert D-076 代码 → 从干净 D-075 处重做；本机三包 `verify:all` 全绿 + i18n 双侧 467 键平衡 + WSL2 真机 Playwright 7/7 PASS buildId `9c4cc5d`，截图 `docs/screenshots/wsl-ia-fix-*`）；待 push origin/master**（2026-06-21）。
- 上下文：D-076 阶段 2-4 并入 master 后用户验收发现两处设计错误：① 知识库把「图纸档案」和「相似搜索」合一是错的——KB 相似检索（调试结案 markdown 域）与图纸档案（CAD `ArtifactRef` 域）**八竿子打不着**（正是 D-076 实现期「archiveFileName 不做链」捕获的同一数据域分歧的延续）；② 「洞察」分组**不该可折叠**。
- **用户拍板**：
  1. **图纸档案拆回独立顶级页**（知识库 = 纯相似检索 `KbSearchPage`；图纸档案 = 独立 `ArchivePage`）。
  2. **导航全摊平**：删「洞察」折叠分组，无分组、无折叠。
  3. **缺人方向留、置末**（设置之前）。
  4. **git 方式 = revert 整个 Phase2-4 再从干净（D-075）处重做**：好坏交织在同一 commit（P3 含好的 SeasonSelect、P4 含要的扁平基础）、commit 粒度无法只回退坏的；revert 是新增反向 commit、不改写已推送历史。
- 终态导航（8 项·扁平·固定顺序）：`overview` 总览 / `project` 项目(看板+依赖图视图切换) / `knowledge` 知识库(纯相似检索) / `archive` 图纸档案(独立) / `inv` 库存 / `fleet` 机器人队 / `gaps` 缺人方向 / `settings` 设置。
- 实现（沿用 D-075「组合不重写」）：
  - **revert**（commit `996df7d`）：`git revert d0f858c 9147462 9b090b7` + 删过时截图 `wsl-ia-phase2-4-*` → 回 D-075 干净基线，console src 实测与基线零 diff。
  - **重做**（commit `9c4cc5d`）：复用已验证好件（从被 revert 的 commit 取回 `ProjectPage.tsx` 看板+依赖图、`SeasonSelect.tsx` 赛季下拉一致、去重录入入口的 `DepGraphPage.tsx`、接 SeasonSelect 的 `ArchivePage`/`ResourcesPage`）；新写 `App.tsx`（路由 8 分支·删 focusTaskId·knowledge→KbSearchPage·archive→ArchivePage）、`ConsoleLayout.tsx`（扁平 `navItems` 8 项·新序·`ConsolePage` 联合 = overview\|project\|knowledge\|archive\|inv\|fleet\|gaps\|settings）、`i18n`（加 nav.project/nav.knowledge/toolbar.title.project·knowledge/project.view.*/season.* · 删 nav.depGraph/nav.pm/nav.kb + 对应 title · **保留** nav.archive/toolbar.title.archive、toolbar.title.kb=KbSearchPage 内层用）、`styles.css`（取 P3 版含 project-view-switch+season、无 nav-group）。**不重建** `KnowledgePage`。
- 铁律：组合不重写；契约/端点零改；`robotCode`/`robotTarget` 枚举不动；I0 反监视；i18n 双侧成对。
- 验证：本机 contracts 151 / server 186 / console(typecheck+test+build) 三包 `verify:all` 全绿；i18n zh/en 各 467 键平衡、无单侧孤儿；grep 实测无残留对已删 page id / i18n 键 / `KnowledgePage` 的引用。**WSL2 真机 Playwright 7/7 PASS**（rainman@100.78.202.84，buildId `9c4cc5d`，bundle 过 SSH + 单会话起服 4177，截图 `docs/screenshots/wsl-ia-fix-*` + `wsl-ia-fix-results.json`）：①扁平导航 8 项按序[总览/项目/知识库/图纸档案/库存/机器人队/缺人方向/设置] ②无折叠组(nav-group-header=0) ③项目页依赖图渲染无 visibility:hidden(react-flow 8 节点·任一 hidden=false) ④知识库=纯相似检索(主区图纸 Tab=0) ⑤图纸档案独立页+赛季下拉其它 ⑥机器人队 create 赛季下拉其它 ⑦I0 项目+知识库 DOM 无 memberId。（测试机一度 ssh 超时离线、/tmp 被清；改 bundle+runner 落 ~/ 持久目录 + FETCH_HEAD detached checkout 后跑通。）
- 事实源：本 ADR；plan `~/.claude/plans/binary-munching-valley.md`；前序 D-076（全文 → `docs/archive/decisions-archive.md`）/ D-075（阶段 1）。
- 上下文：D-075 阶段 1（机器人队页）已落地，但用户 2026-06-20「左侧还是一大堆」——阶段 1 仅 10→9 看不出，视觉 declutter 全在阶段 2-4。沿用 D-075「组合不重写」。spec = `docs/planning/ia-refactor-next-prompts.md` PROMPT 1+2，上游 `docs/design/sched-date-relay-robot-redesign.md` §B。本轮单开 `ia-phase2-4`、不在 master 直改；master 回并推迟到收尾（云端 a4033b8 已干净并入工作分支，merge-tree 零冲突实证）。
- **用户拍板的覆盖项（优先于 spec 旧措辞）**：
  1. **gaps = C（独立顶级洞察项，非并入项目页 Tab）**：用户要求「以用户视角再讲一遍」后拍板——「缺人方向」是全队层面、只读、扫一眼的体检报告（哪个组缺哪个方向人手、只到组不点名＝I0），性质同「总览」＝仪表盘，故**留作顶级导航项、归洞察区与总览并排**，不并进项目页。→ 项目页只合 看板+依赖图（两视图切换），导航 **9→8→7**（非旧 spec 的 9→7→6）。原 spec「gaps 降为项目页洞察 Tab」与「洞察区＝总览/缺人方向」自相矛盾，C 解之。
  2. **Phase 4 = 仅导航分组，无工作台**：落地页**保留「总览」不变**（不新建工作台页、不做被卡项 CTA 落地页）——避免唯一非「组合」的新页。砍掉旧 PROMPT 1 Phase 4 的「默认落地改工作台」那段。侧栏平铺→分组：主操作区(项目/知识/库存/机器人队) ｜ 洞察区(总览/缺人方向，可折叠) ｜ 设置。
  3. **表单一致性（PROMPT 2）并入 Phase 3**（archive 表单搬进知识页时顺手对齐机器人队 create 表单）：① 赛季统一**下拉** `seasonOptions(now)` ±2 年自动猜 + 「其它/手填」兜底（覆盖历史车，无需问用户）；② 第三项**保留两套语义**（`archive.robotCode` R1/R2/universal＝图纸适配哪台车 ｜ `fleet.robotTarget` R1/R2/shared＝实体占哪编号位），**契约枚举值不动**，只统一控件风格 + 文案规范（「通用」vs「共享」各自语义清晰）；③ 两处控件够像可抽共享 `<SeasonSelect>`，否则不强求。
- 决策（沿用 D-075 组合不重写、零契约/端点改）：
  - **Phase 2「项目」页** `features/project/ProjectPage.tsx` 新建：组合 `<PmBoardPage>`+`<DepGraphPage>`，顶部视图切换（看板⇄依赖图）；单一录入入口（一个 `PmCreatePanel`，去依赖图页重复建边/建任务入口）+ 单一改状态入口（两视图都能改）；`App.tsx` 的 `focusTaskId` 跨页跳转改**页内视图切换 + 选中**、去跨页 plumbing。导航删 pm/dep-graph 加 project，gaps 留。
  - **Phase 3「知识」页** `features/knowledge/KnowledgePage.tsx` 新建：组合 `<KbSearchPage>`+`<ArchivePage>` 多 Tab；KB 结果 `archiveFileName`/归档指针做可点链→跳档案 Tab 定位。导航删 kb/archive 加 knowledge。+ 表单一致性（见覆盖项 3）。
  - **Phase 4 导航分组**：`ConsoleLayout` `navItems`→分组 `navGroups`（主操作区/洞察区可折叠/设置）；`ConsolePage` 联合 + `App.tsx` 三元 + `TITLE_KEY` 收口；i18n nav.* 重整 + 删孤儿键（双侧成对）。落地页留 `overview`。
  - 终态导航 7 项：`overview`(洞察) / `project` / `gaps`(洞察) / `knowledge` / `inv` / `fleet` / `settings`。
- 铁律（继承 D-075）：组合不重写（`PmBoardPage`/`DepGraphPage`/`KbSearchPage`/`ArchivePage` 原样复用，只外层加视图/Tab 容器 + query-key 协调仿 D-075 prefix 失效）；@xyflow 两块画布（依赖图嵌 Tab 后）容器定高仿 D-075 `clamp` 防塌高/visibility:hidden；I0 反监视（项目页/缺人 Tab 仍只到组、不下钻人，grep memberId 净）；契约/端点零改（仅 UI）；本机三包 `verify:all` 全绿（typecheck 兜 union 收口 + i18n 双侧 key 平衡）；WSL2 4177 真机 Playwright + 截图 `docs/screenshots/wsl-ia-phase2-4-*`；3-4 独立 commit、收尾 push。
- 工作流：4 层 workflow（design 3 opus 并行 / 对抗式风险审查 2 opus 出 12 条 must-fix·4 blocker 全处理 / 实现 3 opus 顺序 Phase2→3→4 各 commit·各阶段 console verify:all 全绿 / 终验 1 sonnet 三包 verify + grep + i18n 平衡）。commit：Phase2 `9b090b7` / Phase3 `9147462` / Phase4 `d0f858c`。
- **实现期已落决策（两处对原 spec 的合理偏离 + 一处设计选择）**：
  1. **archiveFileName 不做可点链（spec 偏离·已采纳）**：原 spec「KB 结果 archiveFileName 做可点链跳图纸档案 Tab 定位」基于一个误判——KB 的 `archiveFileName` 是**调试结案归档 markdown**（`.debug_workspace/archive/YYYY-MM-DD_<slug>.md`，源 `kb-similar.ts` firstArchive.fileName）；而「图纸档案(archive)」页渲染的是 `ArtifactRef[]`（CAD 图纸/固件 + 版本时间线）。**两个不同数据域、无外键**，仅共用「archive」字样。做成跳转链会指向不存在对象。故知识页两 Tab 纯并置、archiveFileName 保持 KbResultCard 里只读 mono 展示。契约/端点零改。（spec 写成「可点链」是当初把两个 archive 混淆，实现期风险审查捕获。）
  2. **抽了共享 `<SeasonSelect>`（采纳 spec 选项③）**：赛季「下拉 + 其它（手填）兜底」逻辑抽进 `components/SeasonSelect.tsx`，archive 提交表单与 fleet create 表单两处复用。机器人队 create 赛季从自由文本 `<input>` 改为下拉（真机实证：select 含「其它（手填）」option）。robotCode/robotTarget 枚举值零改。
  3. **导航分组形态**：主操作区**无组标题**（项目/知识库/库存/机器人队 直接顶部排列）、洞察区有可折叠标题「洞察」（总览/缺人方向）、设置无标题——比「每组都加标题」更干净，洞察区因要折叠才需 header。
- 验证：本机 console/contracts/server 三包 `verify:all` 全绿；i18n zh/en 双侧各 465 键平衡；终态导航 7 项 [overview/project/gaps/knowledge/inv/fleet/settings]。**WSL2 真机 Playwright 10/10 PASS**（rainman@100.78.202.84，buildId `d0f858c`，bundle 过 SSH 传 + 单会话起服 4177 + Playwright，截图 `docs/screenshots/wsl-ia-phase2-4-*` + `wsl-ia-phase2-4-results.json`）：①侧栏分组渲染(nav-group=3·洞察 header) ②导航 7 项内容正确 ③洞察区可折叠(展开→折叠→再展开) ④项目页默认看板 ⑤**依赖图嵌视图切换后渲染无 visibility:hidden**(react-flow 8 节点全 visible·任一 hidden=false·画布高 568——D-075 踩过的塌高/首屏空白回归未现，条件 mount 方案生效) ⑥知识页双 Tab(相似检索/图纸档案) ⑦图纸表单赛季下拉+其它 ⑧机器人队 create 赛季下拉+其它(原自由文本) ⑨I0 反监视：项目页+知识页 DOM 无 memberId。
- 事实源：本 ADR；spec `docs/planning/ia-refactor-next-prompts.md` PROMPT 1+2；上游 `docs/design/sched-date-relay-robot-redesign.md` §B；前序 D-075（阶段 1）。

---

## D-078 — 图纸文件链路收口（HUB-ARTIFACT-STORE-MECH 本地卷版）+ 表单控件修缮 + 部署/版本号修复

- 状态：**DECIDED / IMPLEMENTED / VERIFIED（origin/master `0259c18`，worktree 隔离开发→rebase 上并发 session 提交→FF 合并→push；三包 `verify:all` 全绿 164/194/44 + 真机 API 冒烟全过）**（2026-06-21）。
- 上下文：用户「系统性排查需求分析里的半成品」。揪出两类：①**图纸档案半成品**——只登记元数据、无文件上传；存储落点/是否用 git「看似无定论」（实则 D-025/D-038 早定：二进制不进 git、进本地卷/MinIO，只是没落代码）；下载按钮是摆设（无上传路径→卷里永无文件→恒 404，且**部署 env-var 名写错** `ARTIFACT_ROOT`≠server 实读的 `TEAMHUB_ARTIFACT_FILES_DIR`→线上双重 404）。②**表单控件错配**——适配机器人/赛季是窄下拉但战队编号会变需手填；编号位（robotTarget）2 字符却撑半幅栅格。另用户追加发现**版本号 lock 漂移**（hub-contracts/console package-lock 顶层 version 仍停 0.0.1）。
- **用户拍板（三轮）**：① 存储 = **本地卷**（`TEAMHUB_ARTIFACT_FILES_DIR`，git 已否，MinIO 留可换接口）；② 适配机器人/赛季 = **组合框（候选+手填）**；③ 文件来源 = **本地文件 + 云端链接双存、行内双按钮并列**（先答「单选+文件优先」，再追问「我都有呢」后改为都可填、不互斥）。
- 决策/实现：
  1. **契约**：`ArtifactRefSchema.storedFile`（可选嵌套 filename/ext/sizeBytes/contentType/sha256/uploadedAt，全可选向后兼容旧 8 seed+JSON）；`CreateArtifactRequestSchema` omit storedFile（服务器独占，禁客户端注入）+ **robotCode 由 `z.enum(R1/R2/universal)` 放宽为 `z.string().min(1)`**（手填；不进版本键故安全）；新增 `UploadArtifactResponseSchema`。
  2. **存储接缝** `apps/hub-server/src/artifact-storage.ts`：唯一触碰 `TEAMHUB_ARTIFACT_FILES_DIR` 的模块（MinIO 换点），原子写 tmp→rename + 清异后缀旧兄弟 + sha256 + 删孤儿。
  3. **store**：`GovStore.setArtifactFile`（就地 idx 改 storedFile、非 append、重传=覆盖）三实现（InMemory / File 落盘回滚 / Sqlite stub）。
  4. **路由** `POST /api/artifacts/:id/upload`（`@fastify/multipart` 单文件 50MB·后缀白名单以后缀为准·**先验归档物存在再写盘**避孤儿·落盘指针失败删字节·继承 H3 写鉴权+限流）；`download` 改用 `getArtifactDir` 单一真相。
  5. **console**：`client.uploadArtifactFile`+`postFormData`（不手设 content-type）；ArchivePage 登记表单加文件 input（可选）+ 文件/云端链接**双存**（create 成功链式上传）；每条图纸行**下载(本地)+打开链接(云端)双按钮并列**·有谁显谁·都无灰显「暂无文件」+ 行内「上传/替换文件」——**消灭下载摆设**。新增通用 `Combobox`（input+datalist）；适配机器人/赛季改组合框（机器人候选取台账 displayCode 26R1/26R2+通用，复用 `getResources`）；`SeasonSelect` 由 select+其它 改 datalist；编号位/目标机器人套 `.kb-field--narrow` 收窄、`Field` 加 className 透传。i18n zh/en 成对。
  6. **部署修复**：`compose.yaml`/`start-teamhub.sh`/`deploy/teamhub.env.example` 把 `ARTIFACT_ROOT` 改成 server 实读的 `TEAMHUB_ARTIFACT_FILES_DIR`（默认 `~/teamhub-data/artifacts`，挂卷重启不丢）。
  7. **版本号 lock 漂移修复**：hub-contracts/console package-lock 自指 version `0.0.1`→`0.4.1`；硬化 `bump-version.sh`（node 同步三包 lock 的 @teamhub 自指/跨链 version，JSON 往返实测保留 npm 格式）；`check-version-bump.sh` 加 VERSION↔package.json/lock 漂移哨兵（warn）。
- 守恒/红线（I0）：storedFile 全链路（契约/上传/落盘/读视图）无人员维度；上传 source 仍 server 钉、append-only 不开 update/delete；robotCode 放宽不影响版本键（组+赛季+机构三键）。
- 验证：三包 `verify:all` 全绿（contracts 164 / server 194[+8 upload] / console 44）；**真机 API 冒烟**（本地起 server + FileGovStore）：手填 `26R3-试制`→201、上传 .md→storedFile 正确+落卷、download→拿字节、重传 .txt→清旧兄弟磁盘仅一份、`gov.json` 持久化指针（重启不丢）；负路径 415（坏后缀）/401（无 Bearer）/404（坏 id 无孤儿）/400（空 robotCode、未配目录）全对。WSL2 真机浏览器走查 = 下一步（见 push 后 WSL 构建轮）。
- 并发处理：本轮单开 worktree `feat/artifact-archive-chain` 开发；另一 session 同时在 master 提交（M14/M16/M17+审计+presence 文档）。收尾 = rebase 到其最新提交（零文件重叠、零冲突）→ 无损丢弃 main 冗余 lock 噪声（我提交已含）→ **保留其未提交 WIP `docs/design/presence-reconcile-lock.md`**（未碰）→ FF 合并 → push。
- 事实源：本 ADR；plan `~/.claude/plans/git-workflow-adaptive-grove.md`；前序 D-071（图纸档案 v2）/ D-074（版本号纪律）/ D-025·D-038（二进制不进 git·机械本地存真相）；backlog `HUB-ARTIFACT-STORE-MECH`（本刀本地卷版收口，AI 看图算量增强仍 pending）。

---

## D-081 — 模块化阶段一收口：机器人单体拆成 CASE base + 机器人层

- 状态：**DECIDED / IMPLEMENTED / VERIFIED（分支 `feat/plugin-core` 6 commit `6fc32fb`→`c84f4a9`，07-03 FF 合并 origin/master，VERSION 0.9.7）**（2026-07-03）。
- 上下文：TeamHub 内核目前与「机器人战队」垂直场景强耦合（术语/枚举/fixtures 全写死机器人语义），后续要向游戏工作室/软件开发等其他协作场景复用，须先把内核模块化。`docs/design/modularization-feasibility.md` 定两阶段：阶段一先在同一 master 上把单体拆成 CASE base + 机器人层（不建新 worktree、不破坏现有部署）；阶段二再从合并后 master 分出 game-studio/software-dev 等垂直包 worktree。
- 决策/实现（feat/plugin-core，6 commit）：
  1. **剪两条跨域 import 环**（`6fc32fb`）：growth→governance、pm-requests→relay，为后续拆包解除循环依赖。
  2. **装配外壳 + 装配契约**（`3542845`）：新增 `ModuleDescriptor`/`TenantConfig` 契约——每个垂直包声明自己提供的模块，租户配置决定装配哪些模块，为阶段二垂直包留好接口。
  3. **`governance.ts` 拆分**（`dafc68a`）：巨文件拆成 `pm-core.ts`（项目管理核心，跨垂直通用）+ `schedule-infra.ts`（排班基础设施，机器人场景更重但结构仍通用）。
  4. **`RobotTarget` 去渗透**（`e583643`）：Task/Project 上原本写死的机器人枚举字段改 optional，非机器人垂直包可以不填；配套迁移脚本 `scripts/migrate-robottarget.mjs` 处理旧数据。
  5. **fixtures 拆 per-module builder**（`15d2ec1`）：原单块 fixtures.ts 多域 seed 拆成各模块独立 builder，便于阶段二垂直包只装配自己需要的种子数据。
  6. **verticals-robotics 词汇包成形**（`c84f4a9`）：机器人特有词汇（displayCode/robotTarget 等）收进独立词汇注入层，为阶段二游戏工作室/软件开发词汇包打样。
- 验证：07-02 WSL 全绿——三包 `verify:all` 432 测、迁移脚本 `scripts/migrate-robottarget.mjs` 在真实 gov.json 副本上跑零丢失、Playwright health-check 8 页 0 错等价 master、真实未迁移的 gov.json 在新 schema 下加载成功（向后兼容实证）。07-03 FF 合并 master（`c84f4a9`）已 push origin。
- 设计真相 = `docs/design/modularization-feasibility.md`（本轮实际执行的方案）；`core-plugin-architecture.md` 是更宽的长期愿景，仍 **PROPOSAL**、与本轮实现尚未对齐（→ 2026-07-11 D-083 裁定搁置归档，现在 `docs/archive/`）。
- **已知延后（阶段二前置，未在本轮做）**：① console 侧装配未接线——`console-pages.tsx` 仍是全量静态注册，未消费 `TenantConfig`；② `i18n/vocabulary-overrides.ts` 未接线，词汇包目前只在 contracts 层生效；③ `GovStore` god-interface 仅在独立部署（非 monorepo 内共享）场景才会成为真实阻塞，本轮不处理；④ i18n 巨表未拆分（未按模块拆分翻译键）；⑤ 测试从未跑过非默认 TenantConfig 的装配路径——现有 432 测全部走默认（机器人）装配。
- 阶段二：从合并后 master 切 `game-studio`/`software-dev` 等垂直包 worktree；前置 = 上述①②延后项先补上（见 backlog `PHASE2-CONSOLE-ASSEMBLY`）。
- 事实源：本 ADR；`docs/design/modularization-feasibility.md`；`docs/archive/core-plugin-architecture.md`（PROPOSAL，D-083 搁置归档）；memory `teamhub-modularization`。

---

## D-082 — daily-plan-presets 实现拍板

- 状态：**DECIDED（口径已锁，2026-07-03 实现轮启动）**。
- 上下文：设计稿 `docs/design/daily-plan-presets.md` 于 06-24 完成三项决策（D1/D2/D3 均选 A，见该文档 §6）：D1 = 表格「今日任务」格挂正式任务、轻量录入；D2 = `defaultPreset.lineup=[{groupId,taskId?}]`，铺出来组+任务都预填；D3 = 赛季第一天无「昨天」时「继续昨天」按钮灰掉+提示。本条把设计稿锁定为**实现口径**，解冻进入本轮实现。
- 决策（实现口径，四点）：
  1. **采纳 §6.D1「复用优先」优化全文**：每车 `defaultPreset.lineup[].taskId` 挂**常驻任务**（如 26R1「系统调试」是持续复用的同一个 Task，不每天新建）；表格里输任务名先**按该车现有任务标题匹配复用**，匹配不到才**显式确认**建新任务（非静默暴增）；**不自动建空依赖任务**——无依赖车默认 present、不假装智能。
  2. **`defaultPreset` 写回端点** = `PATCH /api/resources/:id/preset`，镜像既有 `status` 端点的鉴权/校验模式（H3 写鉴权口径不变）。
  3. **「确认」批量建 session** = `POST /api/resource-sessions/batch` 原子端点：全体校验通过后一次性落盘，避免半成功状态（部分车建成、部分车失败导致数据不一致）。
  4. **§5 空状态路由 + fixtures 收口**：当日 `ResourceSession` 数为 0 时自动落到表格页（而非空白泳道图）；demo 车 fixtures 顺带种好 `defaultPreset`——这一并是「日期锚定空屏债」（换天首屏空屏，见 D-075 已修的舍弃预烤 seed 教训）的收口刀。既有锚点 seed（06-21/06-28 场景）**保留不拆**，仍服务差异化三态/总联调全组演示。
- 守恒/红线（I0）：预设/表格/泳道图全程只到**组**级，绝不渲染/录入/派生 `memberId`/`invitedMemberIds`/出勤维度；`carryForwardPlan` 与新纯函数 `deriveTodayPlanFromPresets` 均恒清空 `invitedMemberIds`（继承 D-075 carry-over 红线）。
- 事实源：本 ADR；设计稿 `docs/design/daily-plan-presets.md`（§4 数据模型 + §6 决议）；前序 D-075（SCHEDULE-DESIGN-LOCK，carry-over 纯函数先例）。
