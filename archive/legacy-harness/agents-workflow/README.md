# Agent Workflow（forward-looking）

> **状态：forward-looking（未生效）**

本目录所有文件状态为 `forward-looking`，**未构成当前 AI 工作流约束**。
激活条件见 `docs/planning/workflow-evolution.md` §9（4 条 checklist 全部完成）。

激活前：

- AI 读到本目录文件时**不应据此立任务**
- AI **不应据此修改** `docs/planning/backlog.md` / `docs/planning/now.md` / `docs/planning/decisions.md`
- 用户参考可以；AI 当真实状况理解不可以

当前生效工作流权威源（D-043 双轨）：

- `AGENTS.md` §6 Build Discipline（§6.0 共享底座 + §6.A 串行轨 + §6.B 连续/编排轨）
- `.agents/skills/atomic-task/SKILL.md`（§6.A 串行，无编排能力工具）
- `.agents/skills/continuous-build/SKILL.md`（§6.B 连续/编排，具 workflow 能力的 agent 如 Claude Code）
