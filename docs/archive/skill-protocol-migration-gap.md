# SKILL.md 协议 v1.0 迁移差距清单

> 三个现有 v0.0.1 active 业务 skill 与 [`PROTOCOL-v1.0`](../../.agents/skills/PROTOCOL-v1.0.md) 的差距盘点。**本文件不改 SKILL.md，仅记录迁移工作量**——具体迁移留给后续单独任务（暂未在 backlog 立项）。

## 0. 总览

| Skill | 合规等级 | 缺失 frontmatter 字段 | 缺失必填 section | 命名差异 section | 备注 |
|---|---|---|---|---|---|
| `debug-checklist` v0.0.1 | **B** | `version` / `status` / `protocol_version` / `extensions` | 无 | `## 输出（...）`、`## Prompt 模板要点（...）`、`## 与 pre-pivot skill 的关系`、`## 协议（执行步骤）` ✓兼容、`## DoD（本 skill 自身的完成定义）` ✓兼容 | 业务字段完整；只补 frontmatter + 选择是否规范化 section 副标题 |
| `personal-daily-summary` v0.0.1 | **B** | `version` / `status` / `protocol_version` / `extensions` | 无 | `## 输出（...）`、`## Prompt 模板要点（...）`、`## 与其他 skill / facet 的关系`、`## 协议（执行步骤）` ✓兼容、`## DoD（本 skill 自身的完成定义）` ✓兼容 | 多一个可选 `## 模式` section（合规） |
| `pre-match-checklist` v0.0.1 | **B** | `version` / `status` / `protocol_version` / `extensions` | 无 | `## 输出（...）`、`## Prompt 模板要点（...）`、`## 协议（执行步骤）` ✓兼容、`## DoD（本 skill 自身的完成定义）` ✓兼容 | 工具调用栏短（纯生成类，合规） |
| `atomic-task` | **out-of-scope** | （流程类不适用） | （流程类不适用） | （流程类不适用） | v1.0 不覆盖流程类，见 §4 |

**合规等级定义**（与 PROTOCOL-v1.0 §6.1 对齐）：

- **A** = 完全合规，无需任何动作；
- **B** = 补 frontmatter 字段即可，body section 已经符合或属 v1.0 已声明的兼容形式；
- **C** = 需要重构 body section（增删 H2 标题、改写内容）；
- **out-of-scope** = 不在 v1.0 覆盖范围内（流程类 / 退役 skill）。

## 1. debug-checklist（v0.0.1）的差距

### 1.1 Frontmatter

现状：

```yaml
---
name: debug-checklist
description: ...（含触发条件 + 产出形态 + 边界否定，符合 v1.0 §1.2 三要素）
trigger: ...（一段中文展开）
---
```

差距：

- 缺 `version`（v1.0 §1 推荐字段，不填默认 `v0.0.1`——本 skill 实际就是 v0.0.1，可显式填或留空）
- 缺 `status`（不填默认 `stable`——本 skill 实际是 v0.0.1 + 已闭环，属 `stable`）
- 缺 `protocol_version`（不填默认 `v1.0`——按本协议）
- 缺 `extensions`（可选，可省略或写 `extensions: {}`）

### 1.2 Body Section

按 v1.0 §2.1 必填 section 8 项 + §2.2 可选 section 5 项核对：

| v1.0 section | debug-checklist 实际 | 状态 |
|---|---|---|
| `## 目的` | `## 目的` | ✓ |
| `## 触发示例` | `## 触发示例` | ✓ |
| `## 输入` | `## 输入` | ✓ |
| `## 输出` | `## 输出（必须是 markdown，按下面模板）` | ⚠ 副标题差异 |
| `## 协议` 或 `## 协议（执行步骤）` | `## 协议（执行步骤）` | ✓ 兼容 |
| `## 工具调用` | `## 工具调用` | ✓ |
| `## 不做的事` | `## 不做的事` | ✓ |
| `## DoD` 或 `## DoD（...）` | `## DoD（本 skill 自身的完成定义）` | ✓ 兼容 |
| `## 模式` (可选) | （无） | ✓ 单模式 skill 略 |
| `## 存档文件 schema` (可选) | `## 存档文件 schema` | ✓ |
| `## Prompt 模板要点` (可选) | `## Prompt 模板要点（用于 AI 实现侧）` | ⚠ 副标题差异 |
| `## 反馈闭环` (可选) | `## 反馈闭环` | ✓ |
| `## 与其他 skill 的关系` (可选) | `## 与 pre-pivot skill 的关系` | ⚠ 命名差异 |

### 1.3 评估

- 业务字段完整、协议要点完整、内容质量符合 v1.0 哨兵抽检要求。
- 「副标题差异」（`## 输出（必须是 markdown...）` / `## Prompt 模板要点（用于 AI 实现侧）`）——这些是把 H2 后面追加了说明性副标题。v1.0 §2.3 未对这两个 section 做兼容声明，但哨兵实际用 `grep -qE "^## 输出"` 仍命中。建议 v1.x 升版本时把「H2 主名 + 可选副标题」纳入命名兼容声明；v1.0 baseline 不放宽。
- 「`## 与 pre-pivot skill 的关系`」——这个名字反映 D-018 pivot 历史，未来 pre-pivot 退役完毕后可改名为 `## 与其他 skill 的关系`（与 v1.0 §2.2 对齐）；属于内容微调，不影响合规等级。

### 1.4 建议迁移动作（不在本期执行）

1. 在 frontmatter 末尾追加 4 行：`version: v0.0.1` / `status: stable` / `protocol_version: v1.0` / `extensions: {}`（可选）。
2. 把 `## 与 pre-pivot skill 的关系` 改为 `## 与其他 skill 的关系`（内容保留）。
3. （可选）规范化两处副标题：`## 输出（必须是 markdown，按下面模板）` → `## 输出`；`## Prompt 模板要点（用于 AI 实现侧）` → `## Prompt 模板要点`——但这是风格选择，v1.0 不强制。

## 2. personal-daily-summary（v0.0.1）的差距

### 2.1 Frontmatter

现状：`name` + `description` + `trigger`（三要素与 §1 同）。

差距：缺 `version` / `status` / `protocol_version` / `extensions`（与 §1.1 同）。

### 2.2 Body Section

| v1.0 section | personal-daily-summary 实际 | 状态 |
|---|---|---|
| `## 目的` | `## 目的` | ✓ |
| `## 触发示例` | `## 触发示例` | ✓ |
| `## 输入` | `## 输入` | ✓（含 `必填` / `可选` / `自动汇总` / `不需要` 四档，v1.0 §2.1 推荐的 `自动汇总` 已使用） |
| `## 输出` | `## 输出（必须是 markdown，按下面模板）` | ⚠ 副标题差异 |
| `## 协议` 或 `## 协议（执行步骤）` | `## 协议（执行步骤）` | ✓ 兼容 |
| `## 工具调用` | `## 工具调用` | ✓ |
| `## 不做的事` | `## 不做的事` | ✓ |
| `## DoD` 或 `## DoD（...）` | `## DoD（本 skill 自身的完成定义）` | ✓ 兼容 |
| `## 模式` (可选) | `## 模式` | ✓（日报 / 周报 / 自定 三模式） |
| `## 存档文件 schema` (可选) | `## 存档文件 schema` | ✓ |
| `## Prompt 模板要点` (可选) | `## Prompt 模板要点（用于 AI 实现侧）` | ⚠ 副标题差异 |
| `## 反馈闭环` (可选) | `## 反馈闭环` | ✓ |
| `## 与其他 skill 的关系` (可选) | `## 与其他 skill / facet 的关系` | ⚠ 命名差异（多 "/ facet"） |

### 2.3 评估

- 是三个 skill 中**最完整**的（用了可选 `## 模式` + `自动汇总` 输入档）。
- 命名差异同样属于"H2 后追加副标题"或"在主名后扩展词"，建议 v1.x 兼容；v1.0 不强制。

### 2.4 建议迁移动作（不在本期执行）

1. 在 frontmatter 末尾追加 4 行（同 §1.4）。
2. 把 `## 与其他 skill / facet 的关系` 改为 `## 与其他 skill 的关系`（或在协议 v1.x 把 "/ facet" 后缀纳入兼容）。
3. （可选）规范化两处副标题（同 §1.4）。

## 3. pre-match-checklist（v0.0.1）的差距

### 3.1 Frontmatter

现状：`name` + `description` + `trigger`。

差距：缺 `version` / `status` / `protocol_version` / `extensions`（与 §1.1 同）。

### 3.2 Body Section

| v1.0 section | pre-match-checklist 实际 | 状态 |
|---|---|---|
| `## 目的` | `## 目的` | ✓ |
| `## 触发示例` | `## 触发示例` | ✓ |
| `## 输入` | `## 输入` | ✓ |
| `## 输出` | `## 输出（必须是 markdown，按下面模板）` | ⚠ 副标题差异 |
| `## 协议` 或 `## 协议（执行步骤）` | `## 协议（执行步骤）` | ✓ 兼容 |
| `## 工具调用` | `## 工具调用` | ✓ |
| `## 不做的事` | `## 不做的事` | ✓ |
| `## DoD` 或 `## DoD（...）` | `## DoD（本 skill 自身的完成定义）` | ✓ 兼容 |
| `## 模式` (可选) | （无） | ✓ 单模式 skill 略 |
| `## 存档文件 schema` (可选) | `## 存档文件 schema` | ✓ |
| `## Prompt 模板要点` (可选) | `## Prompt 模板要点（用于 AI 实现侧）` | ⚠ 副标题差异 |
| `## 反馈闭环` (可选) | `## 反馈闭环` | ✓ |
| `## 与其他 skill 的关系` (可选) | `## 与其他 skill 的关系` | ✓ 一致 |

### 3.3 评估

- 「与其他 skill 的关系」section 命名已与 v1.0 §2.2 对齐（唯一一个完全对齐的）。
- 工具调用栏比另两个简短（纯生成类，不读 git / 不读仓库）——是业务事实，与协议无关，合规。
- 副标题差异同 §1.2 / §2.2。

### 3.4 建议迁移动作（不在本期执行）

1. 在 frontmatter 末尾追加 4 行（同 §1.4）。
2. （可选）规范化两处副标题（同 §1.4）。

## 4. atomic-task（流程类，out-of-scope）的处理

`atomic-task` 是流程类 skill（被 AI 调度的工作流模板，不被用户语言触发）。按 PROTOCOL-v1.0 §6.2，**不在 v1.0 协议覆盖范围内**。

### 4.1 结构差异（仅作记录）

| 维度 | 业务类（v1.0 覆盖） | `atomic-task`（流程类，out-of-scope） |
|---|---|---|
| Frontmatter | `name` + `description` + `trigger` + 可选字段 | 仅 `name` + `description`（无 `trigger`） |
| `## 触发示例` | 必填 | 无 |
| Body 主结构 | `## 目的` / `## 输入` / `## 输出` / `## 协议` ... | `## when to use` / `## inputs` / `## steps` / `## output` / `## rules` / `## DoD type 对照表` |
| 输出形态 | markdown 给用户读 | JSON 对象给上游 AI 消费 |
| 步骤数 | 4–6 步 | 14 步 + 多个 milestone 编号（M1/M2/M3） |

### 4.2 后续路径

- v1.0 不强行覆盖流程类，避免协议太抽象失去解释力（D-023 §3 已列为放弃方案 ④）。
- 若后续需要把流程类纳入协议，可在 v1.0 跑两三个迭代后单独立 `flow-protocol-v1.0` 或 v2.0 评估。
- 本期**不动** `atomic-task/SKILL.md`。

## 5. 迁移工作量评估

### 5.1 单 skill 迁移工作量

每个业务 skill 的迁移动作（参 §1.4 / §2.4 / §3.4）：

| 动作 | 工作量 | 风险 |
|---|---|---|
| Frontmatter 补 4 字段 | < 5 min | 低（纯追加） |
| Section 名规范化（去副标题 + 改"关系"section 名） | 10 min | 低（搜索替换） |
| 跑 `verify:skills-sync` 哨兵 + frontmatter yaml 解析 | 1 min | 低 |
| 单 skill 单任务 commit | 2 min | 低 |
| **小计 / skill** | **~20 min** | 低 |

### 5.2 三个 skill 累计

三个业务 skill 总工作量约 **1 小时**，可拆为 3 个独立原子任务（一个 skill 一个 commit），也可合为一个迁移任务一次性完成。建议按 atomic-task 原则**拆为 3 个**：

- `SKILL-MIGRATION-V1-DEBUG-CHECKLIST`
- `SKILL-MIGRATION-V1-PERSONAL-DAILY-SUMMARY`
- `SKILL-MIGRATION-V1-PRE-MATCH-CHECKLIST`

各自 DoD（design type 不适用——这是 skill 类）：

- `test -f .agents/skills/<name>/SKILL.md`（不变）
- `grep -q "^protocol_version: v1.0" .agents/skills/<name>/SKILL.md`（已声明协议版本）
- `grep -q "^version: " .agents/skills/<name>/SKILL.md`（已声明 skill 版本）
- `cd apps/desktop && npm run verify:skills-sync`（哨兵通过）
- `git diff --check` 干净

### 5.3 迁移触发条件

D-023 升 DECIDED 后再认领迁移任务；本协议 draft 阶段**不触发**迁移。

## 6. 关联文档

- `.agents/skills/PROTOCOL-v1.0.md` —— 协议本体
- `docs/design/D-023-skill-protocol-v1.md` —— 详细 ADR 草稿（决策理由 / 放弃方案）
- `docs/planning/decisions.md` D-023 —— 聚合 ADR 条目
- `docs/planning/backlog.md` SKILL-PROTOCOL-V1 —— 当前任务行
- `AGENTS.md` §9 —— SKILL.md mirror rule
- `.agents/skills/atomic-task/SKILL.md` —— DoD type 对照表（迁移任务 DoD 工程谓词参照源）
