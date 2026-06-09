---
name: atomic-task
description: 读真实状态 → 选唯一原子任务 → 执行 → 验证 → 同步 now.md → 单任务 commit → STOP；不自动顺推。合并自原 planning + task-execution + task-verification 三视角。
---

## when to use
- 一轮新工作开始；上下文重置后；上一任务 commit 完成后。
- 发现 `now.md` 与仓库实际脱节时（先修 `now.md` 再继续）。

## inputs
- 默认必读：`AGENTS.md`、`docs/planning/now.md`、`docs/planning/agent-state.json`、`git status --short`、`git log --oneline -5`、当前任务直接相关代码或专项文档。
- `docs/planning/agent-state.json` 是机器可读派生索引，不是权威事实源；若它与 `now.md` / `backlog.md` / `decisions.md` 冲突，先修索引或权威源再继续。
- 条件读取：选任务 / 校验 frontier → `backlog.md`；阶段切换 / 长期争议 → `decisions.md`；产品定义改 → `docs/product/产品介绍.md` 或当前 Team Hub 设计文档；对外口径改 → `README.md`；命中 v0.2.0 前历史背景或归档审计 → `docs/archive/`。

## steps
1. 读 `AGENTS.md` / `docs/planning/now.md` / `docs/planning/agent-state.json`，跑 `git status --short` 与 `git log --oneline -5`。
2. 若 `now.md` 与仓库实际脱节（任务已完成 / 阶段已切 / current_task 与代码不一致），**先修 `now.md` 再继续**；不允许在脱节状态下选任务。
3. 若 `agent-state.json` 与 `now.md` / `backlog.md` / `decisions.md` 冲突，先同步 `agent-state.json`；按 inputs 的"条件读取"决定是否进 `backlog.md` / `decisions.md` / `docs/product/` / `README.md` / `docs/archive/`；不命中不读。
4. 夜跑 / 无人值守 gate（参见 `AGENTS.md §7`）：若 current_task 或候选任务命中 SSH / sudo / systemd / `/opt` / 80/443 / 真实服务器 / 真实数据 / API key / 外部账号 / 用户拍板，必须停止并写 `now.md.blocked` 字段，**不得**夜跑认领。
5. 选下一任务时只能从依赖已满足、未完成的候选里取首个；不发散自找事；不跳过 frontier 顺序。
6. 仅围绕当前 current_task 修改文件；不混任务、不顺手重构。
7. 架构类任务（storage / repository / closeout / adapter / backend scaffold）必须落到工程接缝（接口 / service / adapter / error model / 后端脚手架），不能停在分析结论。
8. 执行 `AGENTS.md §6 Verify Matrix` 对应那一行的命令组合；exit code != 0 一律失败；docs / planning / skills-only 任务若跳过默认项必须明确写原因。
9. 归档类任务（IssueCard / InvestigationRecord / ErrorEntry / ArchiveDocument）必须做读回验证：文件存在、条目存在、必填字段非空、schema `safeParse` 通过；失败一律视为未完成并创建 repair task。
10. 同步 `now.md`：`current_task` / `frontier` / `blocked` / `night_run` / 最近完成（裁剪到 5 条）；同步 `docs/planning/agent-state.json` 的 `mode` / `stage` / `current_task` / `frontier` / `blocked` / active task index；yaml frontmatter 字段必须可被 `python3 -c "import yaml; yaml.safe_load(...)"` 解析，JSON 必须可被 `python3 -m json.tool` 解析。
11. 候选池增删 / 改名 / 重排时同步 `backlog.md`；产生新长期 ADR 时追加 `decisions.md`；产品定义 / 对外口径变化时同步对应文档。
12. Completion gate 三件套自检：(a) 最小验证已通过？(b) `now.md` 已更新？(c) 单任务 commit 已落？三者全齐才能放行。
13. 单任务 commit；commit message 对应单一任务结果；commit 后 `git status --short` 必须为空；不 push 除非用户明确要求。
14. **STOP**。下一任务必须重新进入本 skill 第 1 步，不得自动续推；连续失败两次必须升级人工确认。

## output
```json
{
  "taskId": "string",
  "changedFiles": ["string"],
  "verification": ["命令 + exit code"],
  "completionGate": "open | blocked",
  "commitHash": "string",
  "nowSyncedFields": ["current_task", "frontier", "blocked", "night_run", "recently_completed"],
  "agentStateSynced": true,
  "nextStep": "回到本 skill 第 1 步"
}
```

## rules
- 同一时刻只允许一个原子任务处于执行中。
- `now.md.frontier` 不得超过 3 个候选；完整顺序在 `backlog.md`。
- `agent-state.json` 只能是派生索引；不得只改索引而不改对应权威源。
- 禁止凭旧计划机械顺推；禁止把"规划中"写成"已完成"；禁止把占位壳说成真实功能。
- 不得跳过 planning sync 或 commit 直接进入下一任务。
- README 不是内部事实源；产品介绍不是当前战况源；archive 不是默认事实源；三者只在职责命中时读取。
- 不读取、搜索、打印、总结或提交真实 API key；真实 provider smoke 由用户本地执行。
- 验证失败不得伪造完成；应创建 repair task 或回退；连续两次修复仍失败必须升级人工确认。
- `completionGate = blocked` 时禁止选下一任务；必须先解决 gate。
- 架构类任务若只有分析结论、没有工程化验证结果，一律视为未完成。
- 不恢复已硬删除的弱化文档；交接状态只写 `now.md`。
- **候选池闭口（M1）**：选 frontier / current_task 时，候选池**只在 `docs/planning/backlog.md`**；不读 `roadmap.md` 找候选；不从 `now.md` 现有 frontier 之外的位置自由发散。若 `now.md` 的 frontier 项在 `backlog.md` 没有对应行，视为脱节，**必须先补 backlog 再认领**；不允许"凭空 frontier"。
- **DoD 工程谓词（M2）**：认领任务时，必须按 `backlog.md` 里的 `type` 字段查 `## DoD type 对照表` 确认 DoD 形式合法。DoD 必须至少包含 1 条工程谓词（文件存在 / 命令 exit 0 / grep 命中 / schema safeParse 通过 / yaml 可解析）。"积累 N 条 / 用过 N 次 / 了解了 X / 对齐了 Y / 沉淀价值"这类不可机器验证描述**不构成 DoD**；遇到这类 DoD，视为非原子任务，**拒认领**并退回用户重新定义。
- **commit 误提交自检（M3）**：在 `git commit` 之前必须跑 `git diff --cached --stat`，扣除自动生成内容（`*.lock` / `dist/` / `build/` 等），算出净改动行数。若净行数 > **1000**，触发误提交自检：(1) 扫描 `git diff --cached --name-only` 输出，匹配高置信度模式（`node_modules/` / `dist/` / `build/` / `.next/` / `.nuxt/` / `.cache/` / `*.log` / `*.tmp` / `*.pyc` / `__pycache__/` / `.DS_Store` / `Thumbs.db` / `.env*`（除 `.env.example` / `.env.template`）/ `*.swp` / `*.swo` / >= 5 MB 二进制）；命中则自动追加 `.gitignore` + `git rm --cached <files>` + 复核后正常 commit。(2) 命中低置信度模式（>500KB / 异常资产）→ 停下询问用户。(3) 全部正常 → 直接 commit，不需要任何特殊标签。1000 行只是触发自检的阈值，**不是 commit 上限**；自检通过的大 commit 一律放行。

## DoD type 对照表

`backlog.md` 中每个任务都标注一个 `type` 字段；认领任务时按下表查 DoD 必须形式。

| type | DoD 必含 | 验证命令样例 |
|---|---|---|
| code | 代码文件落地 + 任务对应 verify 通过 | `cd apps/X && npm run verify:Y`（exit 0） |
| skill | `.agents/skills/X/SKILL.md` 落地 + `verify:skills-sync` 通过 | `bash .agents/scripts/verify-skills-sync.sh`（exit 0） |
| design | `docs/design/X.md` 落地 + 在 `decisions.md` 追加 ADR 或文档自标 `status: forward-looking` | `test -f docs/design/X.md && grep -q "^status:" docs/design/X.md`（exit 0） |
| research | `docs/research/X.md` 落地 + 在 `decisions.md` 追加 1 条结论 | 同 design 形式 |
| docs | `git diff --check` 干净 + yaml 可解析 + grep 旧路径无残留 | `git diff --check`；`python3 -c "import yaml; yaml.safe_load(open('X').read())"` |
| forward-looking | 单文档 + 自标 `status: forward-looking` + 自写激活条件 | `grep -q "status: forward-looking" docs/X.md`（exit 0） |
| misc | 任务认领时**明确写出**至少 1 条工程谓词式 DoD 与对应验证命令 | 任务级声明（由认领者填） |

**规则**（与 `## rules` 段 M2 互引）：

- DoD 形式不符合表中任一行的任务，视为非原子任务，AI **拒认领**
- 类型枚举可扩展；新增类型必须同时在本表和 backlog.md 出现
- `misc` 是兜底，应该尽量避免；统计 misc 出现率超 2 个不同案例时考虑新增类型
