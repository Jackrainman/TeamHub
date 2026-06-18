# 已归档 ADR（decisions-archive）

> 被 supersede 的长期决策全文，从 `decisions.md` 活账本移出（feiyue 式：活文件只留约束当前代码的 ADR）。
> 原位留 3 行 stub 指针；git 历史亦可追溯。

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

