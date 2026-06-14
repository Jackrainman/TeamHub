---
status: superseded-by D-043
written_at: 2026-05-17
superseded_at: 2026-06-14
activated_by: 写 ADR D-020 + 修改 AGENTS.md §6 + 更新 atomic-task skill,三者全齐
note: 本文档仅是范式判断存档,激活前不构成任何工作流约束
superseded_note: D-043（2026-06-14）以「现实已用上 workflow」取代本文档旧立场——当年因「还没用上 workflow」保留 STOP、不引入 continuous、设想「人写 plan → 串行执行」的 epic 两层模式；现实演进为 workflow 连续编排（AGENTS §6.B + continuous-build skill），两层「拆解」思想被 workflow fan-out 吸收。留原位追溯，不再构成约束。
---

# 工作流范式演进（forward-looking）

> 状态：**superseded-by D-043（2026-06-14），未按本文档原方案激活**。
> 当前生效范式：`AGENTS.md §6`（D-043 双轨）+ `.agents/skills/atomic-task/SKILL.md`（§6.A 串行轨）+ `.agents/skills/continuous-build/SKILL.md`（§6.B 连续/编排轨）。
> 历史激活条件（已不适用）：原设想「写 ADR D-020 + 改 §6 + 更新 atomic-task skill」三者全齐才激活 epic 两层模式；D-043 走了不同路径——以 workflow 连续编排取代「人写 plan 串行执行」，本文档转为追溯存档，不再构成约束。下文 §3–§10 为历史范式判断，保留追溯。
> 默认读取链：**不在**。与 `visuals.md` 同位阶——仅在讨论范式演进时按需读取。

## 1. 为何写这份文档

2026-05-17 一次范式讨论里浮现的疑问：扁平 atomic 任务流在跨子系统的工作（典型例：飞书集成 LARK-01..04 / 未来 Bridge 系列）上颗粒度过碎，每条任务读起来都缺少"为什么要做"的归属。提议范式是"大任务 + 详细设计规范 → 自拆原子任务 → 单任务 commit"，与 superpowers 的 brainstorming → writing-plans → executing-plans 链同构。

冷静期内仅做判断与存档，**不切换范式**。未来真要升级到 epic 模式时，回查本文档而不是从零重推。

## 2. 现行范式速览（5 条）

| 维度 | 当前 |
|---|---|
| 任务层级 | 扁平 atomic，无 epic 层 |
| 拆解时机 | 前置——写 `backlog.md` 时人工拆，执行时禁止现场拆 |
| Completion gate | Verify Matrix + `now.md` planning sync + 单任务 commit，三件套全齐 |
| STOP 规则 | commit 后必须重新进 atomic-task skill 第 1 步，禁止自动续推 |
| 设计文档与任务的关系 | 解耦——`decisions.md` 存 ADR，`SKILL.md` 存协议，任务名不强绑文档路径 |

权威源：`AGENTS.md §6 Atomic Task Discipline` + `.agents/skills/atomic-task/SKILL.md`。

## 3. 提议范式：epic + plan + atomic 两层

```
epic（大任务）
  ├─ docs/design/<epic>.md       设计规范（目标/边界/模块划分/验收）
  ├─ docs/plans/<epic>.md        带 checkbox 的原子任务清单（plan）
  └─ atomic tasks                逐条执行，沿用现行 atomic-task skill
```

- 任务 ID：`<DOMAIN>-EPIC-<NAME>`，子任务 `<DOMAIN>-EPIC-<NAME>/T01-<SLUG>`。
- 设计规范 spec 存 `docs/design/`，可由人直接写，或借 `superpowers:brainstorming` 草拟。
- 执行清单 plan 存 `docs/plans/`，借 `superpowers:writing-plans` 的 checkbox 协议格式，但产出在项目内。
- 单原子任务的执行流程**完全不变**——仍走 atomic-task skill 的 verify + sync + commit + STOP。

## 4. 保留不变（硬约束，不可妥协）

- `AGENTS.md §5` 设计宪法（D-026 重构为 C/G/A 三层：核心 C1-C5 + 治理 G1-G5 + 反监视 A1-A4）→ 仍是 epic 立项的准入门
- `AGENTS.md §6` 单原子任务执行 / 单任务 commit / commit 后 STOP
- `AGENTS.md §7` Verify Matrix
- `AGENTS.md §8` 夜跑边界
- `decisions.md` ADR 与 `SKILL.md` 权威源地位不变

## 5. 新增点（实施期才做）

- 新 skill `.agents/skills/epic-to-plan/SKILL.md`：当 current_task 是 EPIC- 前缀时，读 design 规范 → 产 plan → 把 plan 内 checkbox 拆为子任务追加进 `backlog.md`。
- `atomic-task` skill 第 5 步分叉：
  - current_task 是 EPIC- 前缀 → 转 `epic-to-plan` skill
  - 是原子任务 → 现行流程
- `now.md` schema 新增可选字段 `current_epic`
- `backlog.md` 允许 epic 行 + 子任务从属表达（缩进或斜杠 ID）

## 6. 明确不采纳

| 项 | 原因 |
|---|---|
| `superpowers:subagent-driven-development` | continuous execution 与 §6 STOP 直接冲突；备赛期不引入 |
| `superpowers:executing-plans` 的"按预写 plan 顺推" | 与 §6 "禁止凭旧计划机械顺推"冲突；plan 仅作人类可读 wishlist，不作自动执行脚本 |
| `superpowers:brainstorming` 作为强制门 | 可选用，不入工作流；spec 也允许人直接写 |
| `docs/superpowers/specs/` / `docs/superpowers/plans/` 默认路径 | 本项目 spec 走 `docs/design/`，plan 走 `docs/plans/`，避免多顶级目录 |

## 7. 触发条件（什么时候才升级到 epic 模式）

同时满足 3 条：

1. 涉及 ≥ 3 个子模块，或跨 Skill / Bridge / Trail 任意两层以上
2. 预计可拆出 ≥ 5 个原子任务
3. 需要前置设计阶段（API 调研 / schema 设计 / 架构图）

不满足任一 → 仍按扁平 atomic 处理。

历史备赛期（`post_pivot_self_dogfood` 模式）默认**不**触发——任务都是 SKILL.md 迭代，小颗粒。当前 D-024 已切到 `team_hub_shell_design`，但本文档仍是 forward-looking 存档，未激活 epic 模式；Team Hub 后续仍按 atomic-task 单任务执行。

## 8. 首批候选（仅记录，不执行）

| 候选 | 合并自 | 启动条件 |
|---|---|---|
| `LARK-EPIC-FEISHU-INTEGRATION` | LARK-01..04 | 备赛后 + `docs/design/feishu-integration.md` 落地 |
| `BRIDGE-EPIC-ROSTER-V1` | BRIDGE-01..04 | 备赛后 + LARK epic 试点结论 |
| `TRAIL-EPIC-VIEWER-V1` | TRAIL-01..04 | `.debug-archive/` ≥ 20 条 |

## 9. 激活前必须做的 4 件事（checklist）

- [ ] 写 ADR D-020：决定采纳两层范式 + 触发条件
- [ ] 改 `AGENTS.md §6`：增 epic 分支说明，保持 STOP 不变
- [ ] 更新 `.agents/skills/atomic-task/SKILL.md`：修复 pre-pivot 残留 + 加 epic 分叉
- [ ] 新建 `.agents/skills/epic-to-plan/SKILL.md`

## 10. 冷静期回看建议

- 本文档落地后 48-72h 冷静期，不立刻进入激活流程。
- 真要激活时先用 1 个 epic 试点（推荐 LARK），跑通 → 写 ADR → 改 AGENTS.md → 才推广。
- 试点失败（plan 写完不准 / atomic 仍乱 / commit 粒度仍混）→ 回退扁平 atomic，本文档转 archived 至 `docs/archive/`。

## 11. 引用源（仅读取）

- `AGENTS.md` §2 §5 §6 §7 §8
- `docs/planning/decisions.md` D-015 / D-016 / D-018 / D-019
- `docs/planning/now.md` / `backlog.md` / `roadmap.md`
- `.agents/skills/atomic-task/SKILL.md`
- `superpowers` 包：`writing-plans` / `executing-plans` / `subagent-driven-development` / `brainstorming` 仅作概念引用
