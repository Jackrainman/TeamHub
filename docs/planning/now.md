# Now

> 唯一当前战况源。Team Hub 方向已由 D-024 覆盖旧 markdown-only pivot。pre-pivot 历史快照 → `docs/archive/v0.3-pivot/`。

```yaml
mode: team_hub_shell_design
stage: Team Hub 战队中枢概念冻结 + 技术栈拍板完成；AI 默认上下文已瘦身
stage_goal: 以 docs/design/team-hub-concept.md + docs/design/team-hub-stack-decision.md + D-024/D-025 为事实源，后续按 Node/TypeScript 统一栈推进 Hub 后端壳子、控制台壳子、adapter 接口与 Compose 部署；Skill/Bridge/Trail 作为 Hub 下能力位保留；AI 每轮默认读 AGENTS.md + now.md + agent-state.json + git 状态，backlog/decisions/roadmap/设计文档按条件读取
current_task: null  # HUB-STACK-DECISION 已闭环；下一步需重新走 atomic-task，从 frontier 选择唯一候选
frontier:
  - HUB-BACKEND-SCAFFOLD
  - HUB-CONSOLE-SCAFFOLD
  - HUB-GIT-FORGE-DESIGN
blocked: []
post_pivot_registry:
  - SKILL-PROTOCOL-V1                    # 已落地草稿；待后续决定是否按 D-024 重新纳入 Hub skill adapter 契约
  - BRIDGE-01-ROSTER-SCHEMA              # 被 Hub BridgeState 契约覆盖，后续不按旧 markdown-only 任务推进
  - TRAIL-01-VIEWER-DESIGN               # 等 Hub 有 archive / artifact / event 原料后再设计
frozen:
  - ProbeFlash-v0.3.0                    # 不再加功能、不重构；致命补丁除外
```

## 当前任务

_无。WORKFLOW-CONTEXT-SLIM-01（docs/planning）**已闭环**：新增 `docs/planning/agent-state.json` 作为机器可读派生索引，`AGENTS.md` 与 `atomic-task` 已把默认读取链缩短为 `AGENTS.md` + `now.md` + `agent-state.json` + git 状态；`backlog.md` / `decisions.md` / `roadmap.md` / Team Hub 设计文档改为按条件读取。后续仍以 `now.md` / `backlog.md` / `decisions.md` 为权威源，`agent-state.json` 只做索引。下一步必须重新走 atomic-task 从 frontier 认领唯一候选。_

## 架构定位（2026-06-06）

Teamhub = 战队中枢 / Team Hub；飞书 = 入口与通知层；Hermes / 小龙虾 / Claude Code / pf-skills = adapter 候选；战队服务器 = Git / artifact / 控制台运行层。详见 `docs/design/team-hub-concept.md`、`docs/design/team-hub-stack-decision.md`、D-024 与 D-025。旧 Skill/Bridge/Trail 三 facet 保留为能力分类，但实现边界从 markdown-only 升级为 Hub 后端 + 控制台 + 插件接口。

## 阻塞 / 待拍板

- **真实外部 adapter**：Hermes / 小龙虾 / Claude Code 真实接入需要用户提供运行方式与权限；AI 当前只能做 mock-first 适配设计。
- **真实服务器写入**：Forgejo/Gitea/bare git 部署、SSH、systemd、80/443、真实数据迁移均需用户白天审批后再做。

## 已冻结

- ProbeFlash v0.3 全部代码（apps/desktop、apps/server、release 流程）：不再加功能、不再重构、不再写 verify。
- pre-pivot backlog 全部任务（TECH-* / AIREADY-* / REALAI-* / CODECTX-* / DEP-* / DATA-* / UI-* / CORE-* / SEARCH-*）：不再认领；详细见 `docs/archive/v0.3-pivot/backlog.md`。
- **原 BRIDGE / TRAIL markdown-only 候选**：已被 D-024 Team Hub 架构覆盖，后续只作为 Hub BridgeState / Trail 能力重评，不按旧任务直接认领。

## 安全边界（pivot 后仍生效）

- 不动 v0.3 server / SQLite / API（致命补丁除外）。
- AI / Skill / Hub adapter 不读 / 打印密钥（`.env` / `*key*` / `*secret*`）。
- 真实 Hermes / 小龙虾 / Claude Code / 飞书 / Git forge smoke 由用户线下配置；AI 只做 mock-first 与只读诊断。
- 不在未审批情况下写真实服务器、SSH、systemd、80/443 或迁移真实数据。

## 最近完成（详见 `git log`）

- 2026-06-06 WORKFLOW-CONTEXT-SLIM-01 — AI 默认上下文瘦身：新增 `docs/planning/agent-state.json`（schema_version 1，派生索引，记录 mode/stage/current_task/frontier/blocked/active_decisions/default_reads/conditional_reads/active_task_index/hard_stops）；`AGENTS.md` 默认读取链从 planning 四件套改为 `AGENTS.md` + `now.md` + `agent-state.json` + git 状态，`backlog.md`/`decisions.md`/`roadmap.md`/Team Hub 设计文档按条件读取；`.agents/skills/atomic-task/SKILL.md` 同步 agent-state 规则；`backlog.md` 记录本任务 DoD。
- 2026-06-06 HUB-STACK-DECISION — Team Hub 技术栈拍板：新增 `docs/design/team-hub-stack-decision.md`（status: decided，Node/TypeScript 统一栈、`apps/hub-server` + `apps/hub-console` 新包、React/Vite/TanStack Query/Zod/shadcn 控制台分层、Compose 硬部署门槛、同镜像换 `.env`、生产 Postgres + SQLite fallback、artifact/log/firmware/rosbag 只做索引和 volume/外部存储边界、Forgejo 默认 Git 中枢、Ubuntu 20.04 过渡/22.04-24.04 公网建议、lark 三包接入策略、Hermes/小龙虾/Claude Code mock-first adapter）；`decisions.md` D-025 追加；`backlog.md`/`now.md` 同步。
- 2026-06-06 HUB-CONCEPT-01 — Team Hub 概念设计与边界确认：新增 `docs/design/team-hub-concept.md`（status: stable，覆盖目标/非目标/总体架构/模块边界/业务模型 v0/API 草案/构建步骤/`xju-feiyue` 复用判断/技术栈分歧/工作流判断/后续候选队列）；`.gitignore` 忽略 `xju-feiyue/`；D-024 拍板 Team Hub 覆盖旧 markdown-only 边界；`now.md` / `backlog.md` / `roadmap.md` / `AGENTS.md` 同步。
- 2026-05-24 SKILL-PROTOCOL-V1 — SKILL.md 协议 v1.0 baseline 落地：`.agents/skills/PROTOCOL-v1.0.md`（协议本体 8 节，frontmatter 7 字段 + body 8 必填 H2 + 4–5 可选 H2 + extensions 扩展钩子 + 双 SemVer 版本号）+ `docs/planning/skill-protocol-migration-gap.md`（3 个 active 业务 skill 均评 B 级合规，工作量 ~20 min/skill；atomic-task 列 out-of-scope）+ `docs/design/D-023-skill-protocol-v1.md`（详细 ADR 草稿 status: draft，4 个放弃方案）+ `decisions.md` D-023 聚合段；7 项验证全过含 `verify:skills-sync` exit 0；**不动**三个现有 SKILL.md（迁移留 SKILL-MIGRATION-V1-* 系列后续任务，待 D-023 升 DECIDED 后认领）。
- 2026-05-22 backlog 加 BRIDGE-05-RESEARCH-POOL 候选（pending 备赛后 + 边界待拍板）：「待研究池 + 接棒」——闲时自驱认领研究项 + 接力产出文档与代码。三条边界待拍板：(a) 产能比较禁区（接棒次数上 UI 即 implicit 排名，违反设计宪法 §2）；(b) schema 选型（独立子段并行 vs 学习链串行接力）；(c) 与 BRIDGE-04 / TRAIL-02 / TRAIL-04 重叠面合并评估不单独认领。不进 frontier，备赛后随 BRIDGE 系列统一拍板。
