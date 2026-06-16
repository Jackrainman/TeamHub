# SKILL.md 协议 v1.0

> 状态：draft（待用户拍板升 stable）
> 适用范围：`.agents/skills/<name>/SKILL.md` 中的「业务类 skill」
> 不适用：流程类 skill（如 `atomic-task`；见 §6.2）
> 协议版本号：v1.0
> 起草日期：2026-05-24

本协议定义 ProbeFlash 仓库内 SKILL.md 文件的格式契约：frontmatter 字段集、body section 集、字段语义约定、版本号机制、扩展机制。任何遵循 v1.0 的 SKILL.md 都应能通过本协议的哨兵检查（§7）。

本协议**不规定**业务字段（具体输入 / 输出 schema、prompt 模板、工具白名单）——这些由各 skill 自己定义。本协议只规定**协议层**：字段名、结构、语义。

## 0. 范围与非范围

### 0.1 范围

- 用户自然语言触发的业务类 skill（被语言短语触发 + 产出 markdown + 可选归档落盘）
- 落在 `.agents/skills/<name>/SKILL.md`、由 hook 同步到 `.claude/skills/`
- 单文件 skill（一个目录一个 SKILL.md）

### 0.2 非范围

- 流程类 skill（被 AI 调度而非用户触发；如 `atomic-task`），见 §6.2
- 退役 skill（落在 `.agents/skill-library/`；不被 hook / 哨兵扫），见 §6.3
- 多文件 skill（目录下含多个 markdown 互相 import 的情况）
- 运行时 schema 强校验（v1.0 仅文字描述协议；zod / AST 校验留 v1.1+ 评估）

## 1. Frontmatter 字段表

YAML frontmatter 用三横线分隔（`---` ... `---`），紧贴文件开头。

| 字段 | 必填？ | 类型 | 说明 |
|---|---|---|---|
| `name` | 必填 | kebab-case string | skill 唯一标识；必须与所在目录名一致（`.agents/skills/<name>/SKILL.md` ⇒ `name: <name>`） |
| `description` | 必填 | 一行短文 | 触发面（Claude Code / 飞书 / 其他调度方）用的一句话摘要；建议含「触发条件 + 产出形态 + 关键边界否定」三要素 |
| `trigger` | 推荐 | 一段短文 | 自然语言触发条件细节描述；与 `description` 区分：`description` 是元数据级别的一句话，`trigger` 是语义级别的展开 |
| `version` | 可选 | SemVer string | skill 自身版本（如 `v0.0.1` / `v1.0.0`）；不填默认 `v0.0.1`（首次发布） |
| `status` | 可选 | enum | `draft` / `stable` / `deprecated` / `retired`；不填默认 `stable` |
| `protocol_version` | 推荐 | SemVer string | 本 skill 遵循的协议版本（如 `v1.0`）；不填默认 `v1.0`（向后兼容老 skill） |
| `extensions` | 可选 | object | 协议未来字段的占位（如 `input_source` / `hook_chain` / `member_context` / `archive_target`）；v1.0 仅声明结构，不解释具体子字段语义；见 §5 |

### 1.1 命名约定

- `name` 必须 kebab-case（小写 + 连字符），不含点 / 下划线 / CJK。
- `description` 与 `trigger` 中文 / 英文均可；主语言建议中文（与 ProbeFlash 仓库其他文档一致）。
- `version` / `protocol_version` 字符串前缀允许 `v`（如 `v0.0.1`）也允许纯数字（`0.0.1`）；哨兵两种都接受。

### 1.2 `description` 三要素示例

以 `debug-checklist` 的 description 为例：

> "给一句调试症状描述（"自动跑点又歪了""串口又乱码"），结合当前仓库上下文（recent commits / 项目类型 / 相关文件），生成 5-8 条带依据和验证动作的检查清单；可选写入 .debug-archive/。**不依赖** ProbeFlash server / SQLite / IssueCard 任何前置条件。"

拆解：

- 触发条件 = "一句调试症状描述（"自动跑点又歪了"...）"
- 产出形态 = "5-8 条带依据和验证动作的检查清单"
- 关键边界否定 = "不依赖 ProbeFlash server / SQLite / IssueCard"

## 2. Body Section 表

Body 用 H2（`## `）划分 section。section 顺序无强制要求，但建议按下表顺序排版。

### 2.1 必填 section（8 个）

| Section（H2） | 说明 |
|---|---|
| `## 目的` | 这个 skill 解决什么问题；为什么不是别的形态；与现有方案的区分 |
| `## 触发示例` | 至少 3 个真实用户口语化触发短语（一行一条） |
| `## 输入` | 至少分 `必填` / `可选` / `不需要` 三档；建议加 `自动汇总`（skill 自取的、不要求用户给的） |
| `## 输出` | 必须给 markdown 模板原样示例（用 fenced code block 包住） |
| `## 协议` 或 `## 协议（执行步骤）` | 编号步骤列表（1. 2. 3. ...）；每一步可执行（具体调用什么工具 / 判断什么条件） |
| `## 工具调用` | 白名单工具（按 Claude Code 工具名列）+ 不调用工具的明示否定边界 |
| `## 不做的事` | bullet 列表；列硬否定边界（不做哪些事 / 不读哪些文件 / 不替代什么 / 不与哪些 skill 重叠） |
| `## DoD` 或 `## DoD（本 skill 自身的完成定义）` | 至少 1 条工程谓词式 DoD（与 `atomic-task` 的 DoD type 对照表对齐：`test -f` / `grep -q` / `npm run verify:*` 等） |

### 2.2 可选 section（4 个）

| Section（H2） | 说明 |
|---|---|
| `## 模式` | 多模式 skill 用（如日报 / 周报 / 自定时间窗）；单模式 skill 略 |
| `## 存档文件 schema` | 有产物落盘的 skill 用（如 `.debug-archive/*.md` / `docs/daily/*.md`）；建议含 frontmatter schema + body 模板；纯生成类 skill 略 |
| `## Prompt 模板要点` | 给 AI 实现侧的硬约束清单（如「每条假设必须带依据」「全部标高优先级视为没分级」） |
| `## 反馈闭环` | 用户反馈 / 失败模式 / 迭代路径 |
| `## 与其他 skill 的关系` | 上下游 / 互补 / 取代关系 |

注：v1.0 共 12 个 section 名（8 必填 + 5 可选；4 个表格行其中 1 行兼容两种命名）。

### 2.3 命名兼容

- `## 协议` 与 `## 协议（执行步骤）` 同义；哨兵接受任一形式。
- `## DoD` 与 `## DoD（本 skill 自身的完成定义）` 同义。
- 后续版本可能收紧到单一形式；v1.0 接受两种以兼容现有 3 个 skill。

## 3. 字段语义约定

1. **`name` 与目录名一致**：`.agents/skills/<dirname>/SKILL.md` 的 `name:` 字段必须 ≡ `<dirname>`；hook 同步规则依赖此约定。
2. **`trigger` 与 `## 触发示例` 互补**：前者描述触发**条件**（什么情况下应触发），后者列具体触发**短语**（用户实际会说什么）；不冗余。
3. **`description` 短 / `trigger` 长**：`description` 是一行（触发面快速匹配用），`trigger` 是一段（AI 实现侧理解语义用）。
4. **`status: deprecated` 与 `status: retired` 区分**：
   - `deprecated` = 仍在 `.agents/skills/` active 触发面，但标注「不推荐使用 / 即将退役」，新调用应转用替代 skill。
   - `retired` = 已 `git mv` 到 `.agents/skill-library/`，不在 hook / 哨兵 / 触发面内（与 AGENTS.md §9 退役流程对齐）。
5. **必填 section 不允许空内容**：可以简短（一行），但不能完全空白；空白等价于不符合协议。
6. **可选 section 可省略**：**不允许**保留 H2 标题 + 空 body；要么写要么删。
7. **section 顺序非强制**：表格内的排版建议顺序只是惯例；现有 3 个 skill 的实际顺序略有差异，v1.0 接受。

## 4. 版本号机制

### 4.1 协议版本（`protocol_version`）

- `v1.0`：本次定义，作为 baseline。
- 升 `v1.x`（minor）：向后兼容；新增可选字段、新增可选 section、放宽现有约束。
- 升 `vN.0`（major）：破坏性；删除 / 改名必填字段、删除 / 改名必填 section、收紧现有约束。

任何遵循 v1.0 的 skill 在 v1.x 升版本后仍可继续运行；哨兵不会因为协议升 v1.1 把 v1.0 skill 标 invalid。

### 4.2 skill 自身版本（`version`）

- 与协议版本独立。
- 初版 `v0.0.1`；小迭代 `v0.0.x`；进入 stable `v1.0.0`；后续按 SemVer。
- skill 内部行为变化（prompt 改了 / tool 白名单加了 / 输出模板改了）升 skill 版本；不影响 `protocol_version`。

## 5. 扩展点（extensions）

`extensions` 是协议 v1.0 的硬扩展钩子——用于在不破坏现有 frontmatter 的前提下，给后续协议版本加字段提供登记空间。

### 5.1 v1.0 占位语义

```yaml
extensions: {}
```

或

```yaml
extensions:
  input_source: ...    # 未来定义
  hook_chain: ...      # 未来定义
  member_context: ...  # 未来定义
  archive_target: ...  # 未来定义
```

v1.0 协议**不规定**任何 `extensions` 子字段的具体语义。后续版本（v1.1+）可能加：

- `input_source`：输入来自哪里（`cli` / `lark` / `dogfood-file` / `manual` / `auto-gathered`）
- `hook_chain`：与 PostToolUse / pre-commit / pre-push 等 hook 的耦合声明
- `member_context`：多人协作场景下的成员视角（如 BRIDGE skill 的「我等谁 / 谁等我」）
- `archive_target`：归档目标路径模式（如 `.debug-archive/YYYY-MM-DD-HHMM-<slug>.md`）

### 5.2 扩展使用约束

- v1.0 skill **可以**省略 `extensions`（默认空对象）。
- v1.0 skill **可以**填 `extensions: {}`（显式空）。
- v1.0 skill **不应**在 `extensions` 内放任意未约定字段（防止扩展空间被未协调的方言污染）；如有需要，应先把对应字段升级到 v1.x 协议正文。

## 6. 与现有 skill 的兼容性说明

### 6.1 v1.0 协议覆盖范围

本协议覆盖**业务类 skill**：由用户自然语言触发 + AI 调研仓库 + 产出 markdown + 可选归档落盘。

ProbeFlash 仓库当前 3 个 active 业务 skill 均在此覆盖范围内：

- `debug-checklist`
- `personal-daily-summary`
- `pre-match-checklist`

具体差距盘点见 `docs/planning/skill-protocol-migration-gap.md`；本协议本体不描述如何迁移，仅声明协议契约。

### 6.2 流程类 skill out-of-scope

流程类 skill（被 AI 调度的工作流模板，如 `atomic-task`）不在 v1.0 范围内。理由：

- 触发面不同：不被用户语言触发，被 AI 在执行其他任务时自动 invoke。
- 字段结构不同：通常无 `trigger`、无 `## 触发示例`；有 `## inputs` / `## steps` / `## rules` 列表式 section。
- 输出形态不同：可能输出 JSON 对象给上游 AI 消费，不是给用户读的 markdown。

流程类 skill 的协议化是否需要单独立 v2.0 或 `flow-protocol-v1.0`，留到 v1.0 验证一两个迭代后再评估。

### 6.3 退役 skill out-of-scope

`.agents/skill-library/` 下的 retired skill 不被 hook 同步 / 不被哨兵扫 / 不在触发面内（与 AGENTS.md §9 一致）。新 v1.0 协议**不溯及**这些已退役 skill。

## 7. 验证哨兵（如何自动检查一个 SKILL.md 是否符合协议）

v1.0 阶段**不强制**运行时哨兵；建议人工 review + 配合下列轻量谓词逐 skill 抽检：

```bash
# 占位变量
NAME=<skill-name>
F=.agents/skills/$NAME/SKILL.md

# Frontmatter 必填字段存在
grep -q "^name: " $F
grep -q "^description: " $F

# Frontmatter 可被 Python yaml.safe_load 解析
python3 -c "import yaml; yaml.safe_load(open('$F').read().split('---')[1])"

# Body 必填 section 存在（8 个）
for s in "## 目的" "## 触发示例" "## 输入" "## 输出" "## 工具调用" "## 不做的事"; do
  grep -qF "$s" $F || echo "MISSING: $s"
done
# "## 协议" 与 "## DoD" 接受两种命名（兼容现有 skill）
grep -qE "^## 协议" $F || echo "MISSING: ## 协议[（执行步骤）]"
grep -qE "^## DoD" $F || echo "MISSING: ## DoD"

# name 与目录名一致
[ "$(grep "^name: " $F | sed 's/name: //;s/ *$//')" = "$NAME" ] \
  || echo "MISMATCH: name field vs directory name"
```

未来（v1.1+）可考虑：

- 把上述谓词包成 `verify:skill-protocol` shell 脚本，挂入 `verify:all`。
- 用 zod schema 做 frontmatter 强校验。
- 用 markdown AST parser 做 section 结构校验。

v1.0 阶段保留人工 + 抽检，避免过早工程化锁定演化空间。

## 8. 关联文档

- `docs/design/D-023-skill-protocol-v1.md` —— 本协议的详细 ADR 草稿（决策理由 / 放弃方案 / 落地任务）
- `docs/planning/decisions.md` D-023 —— 聚合 ADR 条目
- `docs/planning/skill-protocol-migration-gap.md` —— 3 个现有 active 业务 skill 与 v1.0 的迁移差距清单
- `archive/legacy-harness/AGENTS-serial.md` §9 —— SKILL.md mirror rule（hook 同步 + 哨兵 + 退役流程）。**D-066 后镜像机制随串行轨退役下沉，trunk 不再镜像；当前 AGENTS.md（精简版）已无 §9，仅存档备查。**
- `archive/legacy-harness/AGENTS-serial.md` §6.0「DoD type 对照表」 —— v1.0 §2.1 末尾「工程谓词式 DoD」参照源。**D-066 后随串行轨退役下沉到存档；原 `.agents/skills/atomic-task/SKILL.md` 已不在 trunk，且该对照表本就在 AGENTS（serial）而非该 SKILL.md。**
