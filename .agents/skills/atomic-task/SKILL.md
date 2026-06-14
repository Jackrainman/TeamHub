---
name: atomic-task
description: 串行执行轨（AGENTS §6.A，给无 workflow/编排能力的工具 Codex/OpenCode）：读真实状态 → 选唯一原子单元 → 执行 → 验证 → 同步 now.md → 单任务 commit → STOP，不自动顺推。共享底座（completion gate / M1 候选池闭口 / M2 DoD 谓词 / M3 误提交自检 / DoD 对照表）见 AGENTS §6.0，本 skill 不重复定义。具 workflow 编排能力的 agent（如 Claude Code）改走 §6.B + continuous-build skill。
---

## 定位（D-043 双轨）
- 本 skill = **AGENTS §6.A 串行执行轨**，给**无 workflow/编排能力的工具**（Codex / OpenCode）：一次一个原子单元、commit 后 STOP、重入选下一个。
- **共享底座单一源在 `AGENTS §6.0`**（原子单元定义 / completion gate 三件套 / 提交推送授权 / M1 候选池闭口 / M2 DoD 谓词 / M3 误提交自检 / DoD type 对照表）；本 skill **只引用、不重复**，避免与 continuous-build 漂移。
- 具 workflow 编排能力的 agent（如 Claude Code）**不走本 skill**，改走 `AGENTS §6.B` + `.agents/skills/continuous-build/SKILL.md`（连续构建、不 STOP）。

## when to use
- 一轮新工作开始；上下文重置后；上一原子单元 commit 完成后（串行轨：每次都重入本 skill 第 1 步）。
- 发现 `now.md` 与仓库实际脱节时（先修 `now.md` 再继续）。

## inputs
- 默认必读：`AGENTS.md`、`docs/planning/now.md`、`docs/planning/agent-state.json`、`git status --short`、`git log --oneline -5`、当前任务直接相关代码或专项文档。
- `docs/planning/agent-state.json` 是机器可读派生索引，不是权威事实源；若它与 `now.md` / `backlog.md` / `decisions.md` 冲突，先修索引或权威源再继续。
- 条件读取：选任务 / 校验 frontier → `backlog.md`；阶段切换 / 长期争议 → `decisions.md`；产品定义改 → `docs/product/产品介绍.md` 或当前 Team Hub 设计文档；对外口径改 → `README.md`；命中 v0.2.0 前历史背景或归档审计 → `docs/archive/`。

## steps
1. 读 `AGENTS.md` / `docs/planning/now.md` / `docs/planning/agent-state.json`，跑 `git status --short` 与 `git log --oneline -5`。
2. 若 `now.md` 与仓库实际脱节（任务已完成 / 阶段已切 / current_task 与代码不一致），**先修 `now.md` 再继续**；不允许在脱节状态下选任务。
3. 若 `agent-state.json` 与 `now.md` / `backlog.md` / `decisions.md` 冲突，先同步 `agent-state.json`；按 inputs 的"条件读取"决定是否进 `backlog.md` / `decisions.md` / `docs/product/` / `README.md` / `docs/archive/`；不命中不读。
4. 夜跑 / 无人值守 gate（参见 `AGENTS.md §8`）：若 current_task 或候选任务命中 SSH / sudo / systemd / `/opt` / 80/443 / 真实服务器 / 真实数据 / API key / 外部账号 / 用户拍板，必须停止并写 `now.md.blocked` 字段，**不得**夜跑认领。
5. 选下一原子单元时，按 `AGENTS §6.0 M1 候选池闭口`：只从 `backlog.md` 里依赖已满足、未完成的候选取首个；不发散自找事；不跳过 frontier 顺序。
6. 按 `AGENTS §6.0 M2 DoD 谓词` + 下文不再重复的「DoD type 对照表（见 §6）」校验 DoD 形式合法；不合法 → 拒认领并退回用户重定义。
7. 仅围绕当前 current_task 修改文件；不混任务、不顺手重构。
8. 架构类任务（storage / repository / closeout / adapter / backend scaffold）必须落到工程接缝（接口 / service / adapter / error model / 后端脚手架），不能停在分析结论。
9. 执行 `AGENTS.md §7 Verify Matrix` 对应那一行的命令组合；exit code != 0 一律失败；docs / planning / skills-only 任务若跳过默认项必须明确写原因。
10. 归档类任务（IssueCard / InvestigationRecord / ErrorEntry / ArchiveDocument）必须做读回验证：文件存在、条目存在、必填字段非空、schema `safeParse` 通过；失败一律视为未完成并创建 repair task。
11. 同步 `now.md`：`current_task` / `frontier` / `blocked` / 最近完成（裁剪到 5 条）；同步 `docs/planning/agent-state.json` 的 `mode` / `stage` / `current_task` / `frontier` / `blocked`；yaml 必须可被 `python3 -c "import yaml; yaml.safe_load(...)"` 解析，JSON 必须可被 `python3 -m json.tool` 解析。
12. 候选池增删 / 改名 / 重排时同步 `backlog.md`；产生新长期 ADR 时追加 `decisions.md`；产品定义 / 对外口径变化时同步对应文档。
13. `AGENTS §6.0 Completion gate 三件套`自检：(a) 最小验证已通过？(b) `now.md` 已更新？(c) 单任务 commit 已落？三者全齐才能放行。
14. 单任务 commit（commit 前跑 `AGENTS §6.0 M3 误提交自检`）；commit message 对应单一任务结果；commit 后 `git status --short` 必须为空。提交 / 推送授权见 `AGENTS §6.0`。
15. **STOP**（本轨特性）。下一原子单元必须重新进入本 skill 第 1 步，不得自动续推；连续失败两次必须升级人工确认。

## output
```json
{
  "track": "serial (AGENTS §6.A)",
  "taskId": "string",
  "changedFiles": ["string"],
  "verification": ["命令 + exit code"],
  "completionGate": "open | blocked",
  "commitHash": "string",
  "nowSyncedFields": ["current_task", "frontier", "blocked", "recently_completed"],
  "agentStateSynced": true,
  "nextStep": "STOP → 回到本 skill 第 1 步"
}
```

## rules（串行轨专属；共享底座见 AGENTS §6.0）
- **一次只允许一个原子单元处于执行中**（串行轨核心；连续/编排轨见 §6.B）。
- `now.md.frontier` 不得超过 3 个候选；完整顺序在 `backlog.md`。
- `agent-state.json` 只能是派生索引；不得只改索引而不改对应权威源。
- 禁止凭旧计划机械顺推；禁止把"规划中"写成"已完成"；禁止把占位壳说成真实功能。
- 不得跳过 planning sync 或 commit 直接进入下一原子单元。
- `completionGate = blocked` 时禁止选下一原子单元；必须先解决 gate。
- README 不是内部事实源；产品介绍不是当前战况源；archive 不是默认事实源；三者只在职责命中时读取。
- 不读取、搜索、打印、总结或提交真实 API key；真实 provider smoke 由用户本地执行。
- 验证失败不得伪造完成；应创建 repair task 或回退；连续两次修复仍失败必须升级人工确认。
- 架构类任务若只有分析结论、没有工程化验证结果，一律视为未完成。
- 不恢复已硬删除的弱化文档；交接状态只写 `now.md`。
- **候选池闭口 / DoD 谓词 / 误提交自检 / DoD type 对照表**：完整定义见 `AGENTS §6.0`（M1 / M2 / M3 + 对照表），本 skill 不重复；如需查对照表请读 `AGENTS §6`。
