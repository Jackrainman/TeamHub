---
name: self-iterate
description: 自迭代外环（AGENTS §6.C，叠在 §6.B 连续轨之上，给具 workflow 编排能力的 agent 如 Claude Code）：frontier 与 backlog 都无 ready 候选时→读 completion-model.yaml 做完成度检查→有 gap 则合成「大目标」epic→先 MATERIALIZE 成 backlog 行 + decisions ADR（M1 逃生阀：materialize-before-action）→交回 §6.B continuous-build 驱动→单次 invocation 内连续自迭代，仅 §8 安全门 / §5 宪法门 / 产品方向 fork / budget 耗尽 才停。atom-task 只用于提正确率 + 拆子 agent。共享底座（completion gate / M1 / M2 / M3）见 AGENTS §6.0，本 skill 不重复。
---

## 定位（D-053 自迭代外环 §6.C）
- 本 skill = **AGENTS §6.C 自迭代外环**，是 **§6.B 连续/编排轨之上的一层循环外壳**，**不替换 §6.B**。当 `current_task=null` / frontier 空、且 agent 具 `Workflow` 能力时启动；驱动一个 8 步循环直到 §8 安全门 / §5 宪法门 / 产品方向 fork / budget 耗尽。
- **驱动（第 7 步）只引用、不复写 §6.B**：分解/fan-out/completion gate 全归 `continuous-build` skill（§6.B）；本 skill 只拥有「选择 + 完成度检查 + 合成 + 物化 + 守门」的外环逻辑（步 1–6、8），步 7 当作对 §6.B 的不透明 handoff。**不把 §6.B 步骤文字抄进本 skill**（物理隔离、不漂移，与 §6.A/§6.B 同纪律）。
- **共享底座单一源在 `AGENTS §6.0`**（原子单元 / completion gate 三件套 / 提交推送授权 / M1 候选池闭口 / M2 DoD 谓词 / M3 误提交自检 / DoD 对照表）；本 skill 只引用、不重复。
- 无 workflow 能力的工具（Codex / OpenCode）**不走本 skill**（步 7 依赖 Workflow），走 §6.A + `atomic-task`。

## when to use
- frontier 空 / `current_task=null` 且 agent 具 `Workflow` 能力，用户要求「连续自迭代到做完 / 没事自己找该做的」。
- 不适合：单个明确小任务（直接做）、frontier 仍有 ready 候选（直接走 §6.B 不必起外环）、弱工具（走 §6.A）。

## inputs
- 默认必读：`AGENTS.md`（§5/§6/§8）、`docs/planning/now.md`、`docs/planning/agent-state.json`、`docs/planning/completion-model.yaml`、`git status --short`、`git log --oneline -5`。
- 条件读取：选/校验候选 → `backlog.md`；合成 epic 时**仅为给 gap 措辞边界** → `roadmap.md`（步 5b 唯一许可，且只措辞不取候选）；长期决策 → `decisions.md`。
- 工具前置：步 7 依赖 `Workflow`；无该工具不适用。

## steps（8 步硬化循环；分支见每步）
1. **READ STATE（haiku）**：`git fetch`；`origin/master` 有分叉先 rebase/merge 干净，无法快进 → STOP（§8 冲突）。读 AGENTS/now/agent-state/completion-model + git 状态。now.md 与仓库脱节先**修**再重入步 1——但**修复重入上限 2 次**，且修复必须真改状态/清掉脱节标志；no-op 修复或第 3 次脱节 → STOP（§8 不可解）。**haiku 步禁写任何 'done' 状态**。
2. **FRONTIER-READY?（haiku）**：按序走 frontier，每项查 backlog 行（M1）。READY = 有 backlog 行 + 状态 pending/current + 依赖满足 + **过 §8 边界筛** + **过 §5 宪法筛**（非挂起 GOV-* / 非排名 / 非监视项）。有 READY → 设 current_task → 步 7；frontier 项无 backlog 行 = DRIFT，先同步（删或补 backlog 行）；否则 → 步 3。
3. **BACKLOG-READY?（haiku）**：M1 闭口兜底，扫**全部** backlog 行找 pending/current + 依赖满足 + DoD 过 M2 + 过 §8/§5 筛 + 非挂起治理簇的首个；有 → 提进 frontier（单 planning-sync commit，fetch-before-push）→ 步 7；否则（frontier 与 backlog **双重耗尽**）→ 步 4。**双重耗尽是通向合成的唯一触发**。
4. **COMPLETION-CHECK（opus）**：载 `completion-model.yaml`（**derived-spec，权威性低于 backlog/decisions**）。对每个 `required:true` deliverable 用 Bash 跑机器谓词读退出码；done = 谓词过，gap = 谓词失败或 not-started。**交叉核对**：每个 pending/current 的 backlog 行必须能对应到某谓词通过的 deliverable，或显式 `required:false` 带理由；任一未对账的 pending 行 ⇒ 模型不完整。按 priority 排 gap。**分支**：模型完整（全 required 谓词过）且全 pending 行已对账 → STOP 干净，记「候选池+frontier 空且完成模型无缺口」上报；未对账 pending 行 → 升级（模型不完整，**不得**宣称 done）；有真 gap → 步 5。
5. **SYNTHESIZE EPIC（opus）— 多门把守**：
   - **5a §5 宪法门（最先，机器可判）**：若 gap/epic 触及 {confirmedBy 外露、谁快谁慢、完成计数、按人/产能排名、成员互比、硬截止/甘特、已在飞书的流程双写}（I0/A1/C2/G2/G4），**或映射到任何挂起 GOV-* / D-032~D-035 治理簇** → `open_for_decision`，STOP。**自迭代外环永不复活「复活触发=人类确认要 AI 参与治理判断」的挂起项**。
   - **5b ANCHOR 检查（守 M1）**：gap 必须源自某 `backlog_id:null` 的 completion-model deliverable，且其范围**已被某现存 backlog 行或已 accepted 的 decisions ADR 蕴含**；`roadmap.md` 仅在 gap 存在性已锚定后、**只为措辞边界**打开，**绝不**用于发现/收割候选（M1）。只有 roadmap 文本、无 backlog/decisions 锚 = 收割 → 禁止 → `open_for_decision`。
   - **5c §8 筛**：gap 需 §8 禁动作或产品方向拍板 → `open_for_decision`，STOP。
   - **5d EPIC CAP**：本次 invocation 已合成过 1 个 epic → STOP 上报（不进第二次合成）。
   - 过门后起草 epic `{id, goal, boundary, modules, 原子单元分解, 每单元 DoD（≥1 条可达工程谓词）, deps, §8+§5 筛, 关闭哪个 completion-model 行}`。
   - **保守默认（首次未审计前）**：`completion-model.yaml.audited:false` 时，合成只 **propose-and-stop**（写 `open_for_decision` 提议 + STOP 等人审 completion-model），不自动驱动；人审一次后置 `audited:true` 才 **propose-and-drive**（合成→物化→驱动）。
6. **MATERIALIZE INTO BACKLOG（sonnet 写、opus 审）— 逃生阀铰链**：把 epic 写成真 backlog 行 `| id | pending | type | 含 M2 谓词的内容 |`（状态恒 **pending、绝不 done**）；每单元谓词**先跑一次确认当前因正确的边界内原因 FAIL**（非因边界被挡）；追 decisions ADR（下一空号，当前从 D-054 起）记录触发的 gap/completion-model 行 + 过了哪些 §5/§8 门；加 id 进 frontier + agent-state.frontier；把 completion-model gap 行 `backlog_id` 指向新行（状态仍 pending/not-started）。**此 planning-only 改动作 1 个原子单元 commit**（git diff --check + yaml 可解析 + verify-skills-sync），fetch-before-push。**唯有此 commit 落地后**，epic 才成为普通的 in-backlog M1 候选 → 步 7。verify 失败修一次，第二次失败 → STOP 升级（§6.0/§8）。
7. **DRIVE — 引用交回 §6.B continuous-build**（不复写其内部步骤；本 skill 只是外壳）。**本次只驱动这 1 个 epic**。每原子单元起手**重跑 §8 边界筛 + §5 宪法筛**；sonnet 建 / opus 对抗核实，受 budget 约束——**每次 Workflow fan-out 前重查 budget**，硬守 finder≤8 / verifier≤3 / pipeline>parallel（`~/.claude/CLAUDE.md`）；每单元各自过 §6.0 completion gate（任务专属 §7 verify 须真覆盖改动 + planning sync + 单任务 commit + M3）。本 epic 单元间**不强制 STOP**。**分支**：单元命中 §8 禁边界 → 标 blocked、继续兄弟单元，若 epic 核心单元全 blocked 则该 epic 本是 §8 项 → 回退其 frontier 入口、STOP；单元 verify 边界内不可修 / planning-代码冲突 / 边界不清 / 两次修复失败 → 断链升级（§6.0+§8）；epic 全单元 done（gate 干净、谓词重过）→ 步 8。
8. **REPEAT GUARD（haiku 同步、谓词重跑判 done）**：重同步 now/agent-state 的 frontier + 最近完成（裁到 5）；fetch-before-push。**把 completion-model deliverable 翻 'done' 只能靠写入时用 Bash 重跑其谓词读到 exit 0**——绝不凭状态文字、绝不凭物化 commit 落地（物化 commit 是 planning-only、非功能 done）。查 budget（> 最坏下一轮 reserve）+ 全局 invocation/cycle 上限 + 是否命中 §8/§5/产品 fork。**关键**：若本次 invocation 已合成过新 epic → 在此 STOP 上报供人审（epic cap），不进第二次合成。**分支**：已合成 epic / budget·上限耗尽 / 命中 §8·§5·产品 fork → STOP，出夜跑式报告（done/commits/verify/blocked/下一步最小动作/是否需人介入）；否则（本次只走了普通 in-backlog M1 选择、budget OK、无门）→ 重入步 1。

## runaway / 安全守门（必守）
- **EPIC CAP**：每次 invocation 至多合成+物化 1 个 epic；驱动完即 STOP 上报、等人审，再不进第二次合成。逃生阀是「每晚一次的 checkpoint 事件」，不是发电机。双重耗尽**不是**重填许可（draining→refilling 不重置 cap）。
- **§5 宪法门 + 挂起治理簇硬封**：任何 gap/epic 先过 §5（I0/A1/C2/G2/G4），命中即 STOP；挂起 GOV-*/D-032~D-035 自迭代永不复活。
- **BUDGET**：全局 invocation 上限 + 每轮 drive 花费上限；reserve 按**最坏** drive 轮（max fan-out × opus verify）定，非均值；每次 fan-out 前重查。`budget.total && budget.remaining() > N` 守门。
- **REPAIR CAP**：步 1 脱节修复重入 ≤2；no-op 或第 3 次 → STOP。步 7 单元修复守 §8 两次规则。
- **CYCLE CAP**：每次 invocation 设 max-loop-cycles 兜底，便宜但无尽的循环也终止上报。
- **NO-DONE-BY-TEXT**：haiku 步（1/2/3/8）禁写任何 'done'；'done' 须写入时重跑工程谓词读 exit 0（同时杀掉「伪造停」「伪造续」「规划当完成」）。

## must-stop（命中即停、写 open_for_decision 或升级）
- top gap 映射到挂起治理簇 / GOV-* / D-032~D-035，或措辞需挂起簇 → STOP。
- §5 宪法门失败（触 I0/A1/C2/G2/G4）→ STOP，不合成。
- gap 需 §8 禁动作（SSH/sudo/systemd/opt/80·443/真实写服务器/部署/迁移/改真实数据/apikey/外部账号）或产品方向拍板（INV 需 Hermes 触点 / KB-LARK 需 lark 写权 / 部署）→ STOP。
- 本次已物化+驱动 1 个 epic（epic cap）→ STOP 上报。
- budget 低于最坏下一轮 reserve / 命中全局·cycle·每轮上限 → STOP 出报告。
- 脱节 ≤2 修复内不可解 / no-op / planning-代码 stale 侧不可判 → STOP。
- `origin/master` 分叉不可干净快进 → STOP（§8）。
- 物化 verify 修一次仍失败，或步 7 单元两次修复仍失败 → STOP 升级。
- completion-model 宣称「完整」但有 pending/current backlog 行未对账 → 模型不完整，**不得** STOP-as-complete，升级。
- 谓词在 §8 边界内结构性不可满足（gap 本地永不可闭）→ 边界项，`open_for_decision`，STOP。

## output
```json
{
  "track": "self-iterate outer loop (AGENTS §6.C)",
  "loopCycles": 0,
  "completionGaps": ["completion-model 行 id"],
  "epicsSynthesized": ["materialize 的 epic id（≤1）"],
  "materializedBacklogIds": ["写进 backlog 的新行 id"],
  "drivenAtomicUnits": [{ "id": "string", "commitHash": "string|blocked" }],
  "blocked": ["命中 §8/§5 的单元或 gap"],
  "stoppedBy": "epic-cap | §8-gate | §5-gate | product-fork | budget | desync | model-incomplete | complete-to-spec"
}
```

## rules（外环专属；共享底座见 §6.0，驱动见 §6.B）
- 外环只拥有步 1–6、8；步 7 **引用交回** §6.B，不复写其分解/gate 文字。
- 任何 auto-set 的 epic **必须照样过 `AGENTS §5` 宪法闸**（与人立项同门）；§5 是任何 facet 设计的准入门。
- **完成度只认谓词通过、不认状态文字**（§10）；物化 commit ≠ 功能 done；haiku 步禁写 done。
- 候选池闭口（M1）靠 **materialize-before-action** 守：合成的 epic 先成 backlog 行再驱动，凭空 frontier 仍禁。
- `roadmap.md` 仅步 5b 为措辞边界打开，绝不作候选源。
- 与 `atomic-task`（§6.A）/`continuous-build`（§6.B）共享 §6.0 底座、互不依赖：三者是同一构建纪律的三种节奏，不交叉引用对方内部步骤。
- 安全边界（§3/§8）与 §5 宪法对外环每一步、每一原子单元同样硬。
