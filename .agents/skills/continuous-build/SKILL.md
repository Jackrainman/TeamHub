---
name: continuous-build
description: 连续 / 编排执行轨（AGENTS §6.B，给具 workflow 编排能力的 agent 如 Claude Code）：读真实状态 → 把目标拆成原子单元清单（每单元带 DoD + 验证 + 依赖）→ 喂 workflow 连续/并行构建；每单元各自验证 + 单独 commit，但**不 STOP**、可接续下一个；小改动直接做不强起 workflow。共享底座（completion gate / M1 候选池闭口 / M2 DoD 谓词 / M3 误提交自检 / DoD 对照表）见 AGENTS §6.0，本 skill 不重复。无 workflow 能力的工具改走 §6.A + atomic-task skill。
---

## 定位（D-043 双轨）
- 本 skill = **AGENTS §6.B 连续 / 编排执行轨**，给**具 workflow 编排能力的 agent**（如 Claude Code）：把目标拆成原子单元喂 workflow 连续/并行构建，**每单元各自走 completion gate，但不强制 commit 后 STOP**，可一路接续。
- **共享底座单一源在 `AGENTS §6.0`**（原子单元定义 / completion gate 三件套 / 提交推送授权 / M1 候选池闭口 / M2 DoD 谓词 / M3 误提交自检 / DoD type 对照表）；本 skill **只引用、不重复**，与 atomic-task 共享同一底座、互不依赖。
- 无 workflow/编排能力的工具（Codex / OpenCode）**不走本 skill**，走 `AGENTS §6.A` + `.agents/skills/atomic-task/SKILL.md`（串行、commit 后 STOP）。

## when to use
- 具 workflow 能力的 agent 接到一个目标 / epic / 多步任务，需要连续构建多个原子单元。
- 适合：跨子系统、可拆出多个原子单元、或需要 fan-out / 对抗核实的工作。
- 单个小改动（一个原子单元就能完成）→ **直接做**（读状态 → 改 → 验证 → planning sync → 单独 commit，仍走 §6.0 completion gate 三件套），**不必起 workflow、不必读完本 skill**（向下兼容，守 token 纪律）。

## inputs
- 默认必读：`AGENTS.md`、`docs/planning/now.md`、`docs/planning/agent-state.json`、`git status --short`、`git log --oneline -5`、目标直接相关代码或专项文档。
- 条件读取：选任务 / 校验 frontier → `backlog.md`；阶段切换 / 长期争议 → `decisions.md`；产品定义 → 当前设计文档；对外口径 → `README.md`。
- 工具能力前置：本 skill 依赖 `Workflow`；无该工具的 agent 不适用（改走 atomic-task）。

## steps
1. 读真实状态：`AGENTS.md` / `now.md` / `agent-state.json` + `git status --short` + `git log --oneline -5`；脱节先修 `now.md`。
2. **分解**：把目标拆成**原子单元清单**——每单元 = 一个可独立验证 + 单独 commit 的改动，标注 `{DoD（含至少 1 条工程谓词，按 §6.0 M2 + DoD 对照表）, 验证命令, 依赖（前序单元 / 外部闸门）}`。候选来源守 `§6.0 M1`（只在 `backlog.md`，不凭空发散）。
3. **安全 gate（§3 / §8）**：任一单元命中 SSH / sudo / systemd / `/opt` / 80·443 / 真实服务器写入 / 真实数据迁移 / API key / 外部账号 / 需用户拍板 → 该单元标 blocked、不自动做，写 `now.md.blocked`，其余可做的继续。
4. **编排构建**：用 `Workflow` 把无依赖的单元 `parallel` fan-out、有依赖链的用 `pipeline`；大任务可叠对抗核实（opus 多 lens → 综合）。模型分档守 `~/.claude/CLAUDE.md`（检索 haiku / 实现 sonnet / 对抗核实·关键判断 opus）。单元少或简单 → 直接顺序做，不强起 workflow。
5. **每单元各自走 §6.0 completion gate**：最小验证通过（§7）+ planning sync + 单独 commit（commit 前跑 §6.0 M3 误提交自检）。**一单元一 commit，原子提交卫生不丢。**
6. **连续推进（本轨特性）**：一个原子单元 completion gate 通过后**直接接续下一个、不 STOP、不必重走第 1 步**（与 §6.A 相反）；但每串构建始终受 §3/§8 安全边界与 §6.0 M1/M2/M3 约束。连续构建中任一单元命中 **§8 停止条件**（verify 失败且当前边界内不可修复 / planning 与代码冲突且无法判断谁 stale / 任务边界不清 / 连续两次修复仍失败）即**中断该串、按 §6.0 + §8 升级人工**，不得因「不 STOP」节奏继续推进。
7. **架构类单元**（storage / repository / closeout / adapter / backend scaffold）必须落到工程接缝、有代码级 + 契约级验证，不停在分析结论。
8. **阶段性 planning sync**：连续构建可在每个 commit 同步关键字段（current_task / blocked），frontier / 最近完成（裁剪到 5 条）至少在一串构建告一段落时整理；保持 `now.md` yaml 与 `agent-state.json` 可解析。
9. 推送授权见 `§6.0`（completion gate 后可直接 push origin/master，push 前 fetch 查分叉）。

## output
```json
{
  "track": "continuous (AGENTS §6.B)",
  "goal": "string",
  "atomicUnits": [
    { "id": "string", "dod": "string", "verify": "命令 + exit", "deps": ["string"], "commitHash": "string|pending|blocked" }
  ],
  "workflowRuns": ["wf_id (可选)"],
  "nowSynced": true,
  "blocked": ["命中 §3/§8 的单元"],
  "nextStep": "可继续下一原子单元，或一串告一段落后整理 frontier"
}
```

## rules（连续轨专属；共享底座见 AGENTS §6.0）
- **可连续构建、不强制 commit 后 STOP**；但**绝不**把多个原子单元揉成一个大杂烩 commit——粒度仍是「一原子单元一 commit」（§6.0）。
- 不因「能连续」就跳过任一单元的验证 / planning sync / 单独 commit（completion gate 对每个单元都成立）。
- 小改动直接做、不强起 workflow；workflow 是放大器不是必经路径（token 纪律，`~/.claude/CLAUDE.md`）。
- 安全边界（§3 / §8）对连续构建同样硬：命中即该单元 blocked，不得因连续节奏而越界。
- **候选池闭口 / DoD 谓词 / 误提交自检 / DoD type 对照表 / 提交推送授权**：完整定义见 `AGENTS §6.0`，本 skill 不重复。
- 与 `atomic-task`（§6.A 串行轨）共享同一 §6.0 底座、互不依赖：二者是同一构建纪律的两种节奏，不交叉引用对方内部步骤。
