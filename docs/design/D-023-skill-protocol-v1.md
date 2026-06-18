---
title: D-023 SKILL.md 协议 v1.0
status: draft
date: 2026-05-24
version: v0.1
decisions: []
related_tasks:
  - SKILL-PROTOCOL-V1
supersedes: []
---

# D-023 — SKILL.md 协议 v1.0（详细 ADR 草稿）

> 状态：**draft**（待用户拍板升 DECIDED）。本文件是 `docs/planning/decisions.md` 中 D-023 聚合段的展开版，含决策理由、放弃方案、适用范围、影响。协议正文不重复，见 `.agents/skills/PROTOCOL-v1.0.md`。

## 0. 上下文

ProbeFlash v0.4 阶段已落地 3 个 active 业务 skill（`debug-checklist` / `personal-daily-summary` / `pre-match-checklist`，均 v0.0.1 闭环）；第 4 个 active skill `atomic-task` 是流程类。3 个业务 skill 在 frontmatter 字段集、输入字段细分、输出 schema、约束格式、section 命名上**没有统一约定**：

- Frontmatter：均含 `name` / `description` / `trigger`，但都缺 `version` / `status` / `protocol_version` / `extensions` 这类协议元字段。
- Body：必填 section 集合相同（12 个），但命名细节有差异（`## 输出` vs `## 输出（必须是 markdown，按下面模板）`，`## 与 pre-pivot skill 的关系` vs `## 与其他 skill / facet 的关系` 等）。
- 输入字段细分：三个 skill 互不一致（必填/可选/不需要/自动汇总 四档不齐）。

随着 LARK-CLI 系列（D-022）闭环 + 飞书集成那批 skill 即将上来（debug-checklist 走飞书入口、未来 BRIDGE / TRAIL 也会出 skill），**N 个新 skill 进入触发面之前需要先收敛协议层**——否则下游：

- `verify:skills-sync` 哨兵 + 未来的 `verify:skill-protocol` 都要按 N 种格式适配；
- Claude Code / 飞书的触发面调度逻辑无法假定字段名；
- 用户线下 onboard 文档（`lark-onboard-guide.md` 等）需要针对每个 skill 单独写说明；
- 后续做 zod schema 强校验时面对的是"N 种方言"而非"1 个协议"。

本 ADR 把"协议层"定义出来作为 v1.0 baseline，作为后续所有 skill 的契约底座。

## 1. 决策

**定义 [SKILL.md 协议 v1.0](../../.agents/skills/PROTOCOL-v1.0.md)，作为 `.agents/skills/<name>/SKILL.md` 中「业务类 skill」的格式契约**：

- Frontmatter：必填 `name` / `description`；推荐 `trigger` / `protocol_version`；可选 `version` / `status` / `extensions`。
- Body：8 必填 H2 section + 4–5 可选 H2 section。
- 字段语义：`name` 与目录名一致；`trigger` 与 `## 触发示例` 互补；`status: deprecated` 与 `status: retired` 区分。
- 版本号：协议层用 `protocol_version: v1.0`；skill 自身用 `version: v0.0.1` / `v1.0.0`；两者独立 SemVer。
- 扩展机制：`extensions: {}` 作为未来字段（`input_source` / `hook_chain` / `member_context` / `archive_target`）的硬钩子；v1.0 仅声明结构不规定子字段语义。
- 哨兵：v1.0 阶段**不强制**自动哨兵；提供轻量谓词清单供人工抽检；运行时 schema 校验留 v1.1+ 评估。

**不覆盖**：流程类 skill（如 `atomic-task`）、退役 skill（`.agents/skill-library/`）、多文件 skill。

**不动现有 SKILL.md**：三个业务 skill 的迁移到 v1.0 留作后续单独任务（见 §5），本期**只立协议、不动 skill**。

## 2. 协议要点（不重复正文，仅列锚点）

协议本体见 `.agents/skills/PROTOCOL-v1.0.md`。本 ADR 仅做锚点指引：

- §0 范围与非范围
- §1 Frontmatter 字段表（7 个字段）
- §2 Body Section 表（8 必填 + 5 可选）
- §3 字段语义约定（7 条）
- §4 版本号机制（协议版本 + skill 版本）
- §5 扩展点（`extensions` 占位）
- §6 与现有 skill 的兼容性说明（覆盖范围 + 流程类 out-of-scope + 退役 skill out-of-scope）
- §7 验证哨兵（人工抽检谓词；v1.x+ 可考虑自动化）
- §8 关联文档

迁移差距见 `docs/archive/skill-protocol-migration-gap.md`（3 个 active 业务 skill + 1 个流程类 skill 的差距清单 + 迁移工作量评估）。

## 3. 放弃方案

### 3.1 路径 ①：不统一协议，每 skill 自由发挥

**放弃理由**：

- 当前 3 个 skill 各有方言（虽差异不大），未来 N 个 skill 上来后会有 N 种格式。
- 下游 `verify` 哨兵 / 飞书 / Claude Code 触发面 / 未来的 schema 强校验都需对每个 skill 单独适配——边际成本随 skill 数线性上升，最终不可持续。
- 协议是低成本投资（一次定义，长期受益），而方言是高成本债务。

### 3.2 路径 ②：直接立 zod schema 强制校验

**放弃理由**：

- 备赛期工程预算紧（D-022 三包拆分刚落地，AI 侧待用户线下走 onboard），不应在用户线下走通飞书之前花预算搞 schema 工程化。
- 当前 3 个 skill 的字段差异（如 `自动汇总` 输入档只有 `personal-daily-summary` 用）还在演化，强制 schema 会过早锁定。
- v1.0 文字协议跑通迁移后，再考虑 zod schema 是更稳健路径（先证明协议可用，再把协议自动化）。
- 用户在本任务的约束里明示「先用文字描述协议，不需要立刻写 zod schema」，与本 ADR 一致。

### 3.3 路径 ③：照搬 Anthropic 官方 Skills 协议

**放弃理由**：

- 官方 Skills 协议是 **LLM 工具调用契约**（agent 调用 OpenAPI / function call schema），覆盖"AI 怎么调用一个 skill"的场景。
- ProbeFlash 的 Skill 是**调度领域 skill**——用户自然语言触发 + AI 调研仓库 + 输出 markdown + 可选归档落盘——形态、触发面、输入输出都不同。
- 与 AGENTS.md §2 末尾"lark-cli skills vs ProbeFlash skills 命名预警"同源：字面同名但完全不同体系，不会互通也不应互相 import。
- 不排除未来在 v2.0 重新评估"是否要靠近官方协议以接入未来工具链"，但 v1.0 baseline 不绑定。

### 3.4 路径 ④：把流程类 skill 也纳入 v1.0

**放弃理由**：

- `atomic-task` 是被 AI 调度的工作流模板，不被用户语言触发；frontmatter 无 `trigger` 字段，body 无 `## 触发示例` section；step 多达 14 步含 milestone 编号（M1/M2/M3）；输出是给上游 AI 消费的 JSON 而非给用户读的 markdown。
- 强行把流程类纳入业务类协议会让协议太抽象（要么字段全选 `可选` 失去解释力，要么塞两套并行字段让协议变臃肿）。
- 留作 v1.0 baseline 跑两三个迭代后，单独立 `flow-protocol-v1.0` 或 v2.0 评估是否合并；当前 v1.0 仅覆盖业务类，简洁可解释。

## 4. 适用范围与影响

### 4.1 适用范围

- `.agents/skills/<name>/SKILL.md` 中的业务类 skill（用户语言触发 + 产出 markdown + 可选归档）。
- 当前覆盖：3 个 active 业务 skill。
- 后续覆盖：未来新增的业务 skill（含飞书 / BRIDGE / TRAIL 系列）。

### 4.2 影响

**对现有 skill（v0.0.1 三件套）**：

- 全部评估为合规等级 **B**（业务字段完整，仅缺 4 个 frontmatter 元字段 + 部分 section 命名差异）。
- **本期不动 SKILL.md**；迁移留后续单独任务。
- 协议 v1.0 在升 DECIDED 后立即对**新 skill** 生效；对**老 skill** 通过迁移任务逐个达到 v1.0 合规。

**对新 skill（即将上来的飞书 / BRIDGE / TRAIL skill）**：

- 应直接按 v1.0 协议落地，包括 `protocol_version: v1.0` + `version: v0.0.1` + 8 必填 section。
- 哨兵抽检谓词见 PROTOCOL-v1.0 §7。

**对未来协议演化**：

- v1.x（minor）：新增可选字段 / 新增可选 section / 放宽兼容声明（如把 `## 输出（...）` 副标题纳入命名兼容）。
- v2.0（major）：删除 / 改名必填字段或必填 section。
- `extensions` 字段在 v1.0 阶段是占位；v1.x 起会逐步定义子字段（如 `input_source` / `hook_chain`）。

**对 AGENTS.md §9 SKILL.md mirror rule**：

- 无影响。hook 同步 / 哨兵 / 退役流程不变。
- `PROTOCOL-v1.0.md` 放在 `.agents/skills/` 顶层（非子目录），`verify-skills-sync.sh` 用 `diff -rq` 全树比对——已读脚本确认兼容。

## 5. 落地任务

### 5.1 本任务（SKILL-PROTOCOL-V1）

- 状态：current
- 产出（4 份变更）：
  - `.agents/skills/PROTOCOL-v1.0.md`（协议本体）
  - `docs/archive/skill-protocol-migration-gap.md`（迁移差距清单）
  - `docs/design/D-023-skill-protocol-v1.md`（本文件，详细 ADR 草稿）
  - `docs/planning/decisions.md` 末尾追 D-023 聚合段
- DoD：三个产出文件 `test -f` + `grep -q "^status:" docs/design/D-023-skill-protocol-v1.md` + `git diff --check` 干净 + frontmatter yaml 可解析 + `verify:skills-sync` 通过

### 5.2 后续任务（待 D-023 升 DECIDED 后认领）

- `SKILL-MIGRATION-V1-DEBUG-CHECKLIST`（独立原子任务）
- `SKILL-MIGRATION-V1-PERSONAL-DAILY-SUMMARY`（独立原子任务）
- `SKILL-MIGRATION-V1-PRE-MATCH-CHECKLIST`（独立原子任务）

每个迁移任务工作量约 20 min（参 `skill-protocol-migration-gap.md` §5）。

### 5.3 不在本期评估的下游任务

- v1.1 加 `extensions` 子字段语义（`input_source` 等）。
- v1.x 加自动哨兵脚本（`verify:skill-protocol`）。
- v1.x / v2.0 评估是否覆盖流程类 skill。

## 6. 关联文档

- `.agents/skills/PROTOCOL-v1.0.md` —— 协议本体
- `docs/planning/decisions.md` D-023 —— 聚合 ADR 条目
- `docs/archive/skill-protocol-migration-gap.md` —— 3 个 active skill 与 v1.0 的迁移差距清单
- `docs/planning/backlog.md` SKILL-PROTOCOL-V1 —— 当前任务登记行
- `docs/planning/now.md` —— current_task / frontier 同步源
- `AGENTS.md` §9 —— SKILL.md mirror rule（hook + 哨兵 + 退役）
- `AGENTS.md` §2 末尾 —— lark-cli skills 命名预警（与本协议覆盖范围划清边界）
- `.agents/skills/atomic-task/SKILL.md` —— DoD type 对照表（v1.0 §2.1 工程谓词式 DoD 参照源）

## 7. 关联 ADR

- **D-018**：pivot 后 Skill / Bridge / Trail 三 facet（本协议是 Skill facet 的契约底座）
- **D-022**：lark-cli 接入 + 三包拆分（后续飞书 skill 输出会按 v1.0 协议）
- **D-019**：明确"阻塞可见但不比产能"——宪法 C2 的边界线（D-026 重构为 C/G/A 三层，旧 #2→C2；业务字段约束的隐含来源，但本协议层不涉及）
