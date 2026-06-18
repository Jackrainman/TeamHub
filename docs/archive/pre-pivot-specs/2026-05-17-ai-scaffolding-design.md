---
title: AI 脚手架设计 — atomic-task 框架补强
status: archived
date: 2026-05-17
closed_at: 2026-05-18
landed_in:
  - 4c09ba1 # M1/M2/M3 落地到 .agents/skills/atomic-task/SKILL.md
  - 12e747e # C1 lark-gateway 6 文件标 forward-looking
scope: skill + planning docs only
out_of_scope: 代码 / verify 命令 / schema 变更 / 产品反馈通路
---

# AI 脚手架设计 — atomic-task 框架补强

## 0. TL;DR

lark-gateway 事件揭出 4 个 AI 脚手架失败点。本设计在**不引入 epic 范式**的前提下，通过 3 条 `atomic-task` SKILL 新规则 + `backlog.md` 加 type 列 + 已发生案例标 forward-looking，让 AI 自动跑 atomic-task 循环时不再卡 / 不发散 / 不偷偷把不该提交的文件误带进 commit。

总改动约 115 行，全 docs / skill md，无代码、无 verify 命令、无 schema 改。

## 1. 背景

### 1.1 触发事件

2026-05-17 复盘发现仓库现状与 `now.md` 严重脱节：

- `afd13db`（2026-05-17 11:04）一次 commit 落 **1713 行 / 4 文件**（`docs/agents/workflow/*` 3 份 + `docs/superpowers/plans/2026-05-16-lark-gateway.md` 1311 行），但 `backlog.md` 中**没有任何 LARK-\* 条目**
- `now.md` frontier 中 LARK-01 / LARK-02 标"待启动"，实际 1311 行 plan 已经把调研 / 设计 / 拆任务全做了
- `SKILL-01-DEBUG-CHECKLIST-V0_0_1` 在 `f5df2bf` 已落地 v0.0.1，但 `now.md` 把 DoD 写成"积累 20+ 条 archive"，**永远不可机器验证**
- `SKILL-04-PERSONAL-DAILY-SUMMARY` 状态在 `backlog.md` 是 `pending`、在 `now.md` 是 `current`

### 1.2 根因分析：4 个 AI 跑 atomic-task 循环时的脚手架失败点

| # | 失败现象 | 缺什么 |
|---|---|---|
| F1 | 选任务时去翻 `roadmap.md` 而非 `backlog.md`（LARK-\* 现象） | 候选池没闭口 |
| F2 | DoD 写成"积累 N 条 / 用过 N 次"等不可机器验证描述 | DoD 没强制工程谓词 |
| F3 | 单次大 commit 缺少"误提交自检"——lock / build / binary / 临时文件可能被静默带进 commit | 大 commit 时无误提交扫描机制 |
| F4 | 历史悬空文件（lark-gateway 6 份）AI 不知道未生效 | forward-looking 没机制标记 |

F1–F3 是新增机制；F4 是清理 F1–F3 缺失期间发生的"案发现场"。

### 1.3 不在脚手架范围的事（产品问题，明示踢出）

- 持续累积型工作的字段表达（如 dogfood note 频率 / archive 累积条数 / prompt 迭代次数）
- skill 是否真正闭环的产品判据
- `.debug-archive/` 暂存区的回路设计（用户明确：暂存不进软件设计）
- roadmap.md → backlog.md 同步协议（漏洞已识别，本次推迟）

理由：AI 脚手架 = "让 AI 自动跑循环不卡"；产品反馈通路 = "用户决定 skill 是否真有用"。两件事不该混。

## 2. 范围

### 2.1 在范围

3 项机制 + 1 项清理：

- **M1**：候选池闭口（`atomic-task` SKILL 加规则）
- **M2**：DoD 工程谓词 + type 对照表（`backlog.md` 加 type 列 + `atomic-task` SKILL 加对照表）
- **M3**：commit 大小触发误提交自检（`atomic-task` SKILL 加规则）
- **C1**：lark-gateway 6 文件 forward-looking 标记

### 2.2 不在范围

- 不引入 epic / plan 层级（用户已拍板：不激活 epic 范式）
- 不修改 `AGENTS.md §6` 三件套（最小验证 + planning sync + 单任务 commit）
- 不动 `atomic-task` SKILL 现有 14 步流程；只在 `## rules` 段追加
- 不写 git hook / git config 拦截器 / 任何脚本；M3 是 AI 行为约束，不是 git 层强制
- 不设计 Ongoing 字段 / dogfood 跟踪机制 / skill 闭环判据
- 不重写 `roadmap.md`（漏洞 3 推迟）
- 不动代码 / verify 命令 / schema

## 3. 设计

### 3.1 M1：候选池闭口

**规则全文**（加到 `.agents/skills/atomic-task/SKILL.md` 的 `## rules` 段）：

> AI 选 frontier / current_task 时，候选池**只在 `docs/planning/backlog.md`**；不读 `roadmap.md` 找候选；不从 `now.md` 现有 frontier 之外的位置自由发散。若 `now.md` 的 frontier 项在 `backlog.md` 没有对应行，视为脱节，**必须先补 backlog 再认领**；不允许"凭空 frontier"。

**适用边界**：

- `roadmap.md` 仍是长期愿景源，但**不构成 AI 候选源**；roadmap 里的项要进入执行必须先用一次原子任务（type=docs）搬到 backlog
- `now.md` 的 frontier 是 `backlog.md` 的子集投影；二者不一致时以 `backlog.md` 为准

### 3.2 M2：DoD 工程谓词 + type 对照表

#### 3.2.1 backlog.md 改造

表头加一列 `type`，每行补类型。允许值：

`code` / `skill` / `design` / `research` / `docs` / `forward-looking` / `misc`（兜底）

改造后表头示例：

```
| 任务 | 状态 | type | 内容 |
|------|------|------|------|
| SKILL-02-DOGFOOD-NOTE | pending | docs | 起 docs/dogfood/ 目录；备赛期每次用/没用都写 1-3 行；30 天后回看 |
```

#### 3.2.2 type 对照表

新增到 `atomic-task` SKILL.md，作为 `## DoD type 对照表` 段：

| type | DoD 必含 | 验证命令样例 |
|---|---|---|
| code | 代码文件落地 + 任务对应 verify 通过 | `cd apps/X && npm run verify:Y`（exit 0） |
| skill | `.agents/skills/X/SKILL.md` 落地 + `verify:skills-sync` 通过 | `cd apps/desktop && npm run verify:skills-sync`（exit 0） |
| design | `docs/design/X.md` 落地 + 在 `decisions.md` 追加 ADR 或文档自标 `status: forward-looking` | `test -f docs/design/X.md && grep -q "^status:" docs/design/X.md`（exit 0） |
| research | `docs/research/X.md` 落地 + 在 `decisions.md` 追加 1 条结论 | `test -f docs/research/X.md && grep -q "新增结论" docs/planning/decisions.md` |
| docs | grep 旧路径无残留 + yaml 可解析 + `git diff --check` 干净 | `git diff --check`；`python3 -c "import yaml; yaml.safe_load(open('X').read())"` |
| forward-looking | 单文档 + 自标 `status: forward-looking` + 自写激活条件 | `grep -q "status: forward-looking" docs/X.md`（exit 0） |
| misc | 任务认领时**明确写出**至少 1 条工程谓词式 DoD 与对应验证命令 | 任务级声明（由认领者填） |

#### 3.2.3 规则（加到 atomic-task SKILL.md `## rules`）

> AI 认领任务时，必须按 `backlog.md` 里的 `type` 字段查 `## DoD type 对照表` 确认 DoD 形式合法。DoD **必须**至少包含 1 条工程谓词：文件存在 / 命令 exit 0 / grep 命中 / schema safeParse 通过 / yaml 可解析。"积累 N 条 / 用过 N 次 / 了解了 X / 对齐了 Y / 沉淀价值"这类不可机器验证的描述**不构成 DoD**；遇到这类 DoD，视为非原子任务，AI **拒认领**并把任务退回用户重新定义。

### 3.3 M3：commit 大小触发误提交自检

**核心思想**：大 commit 本身不是问题；**误提交**才是问题。1000 行触发的是排查动作（扫描暂存区里是否有不该 commit 的文件），不是询问用户"为啥这么大"。

**规则全文**（加到 atomic-task SKILL.md `## rules`）：

> AI 在 `git commit` 之前必须跑 `git diff --cached --stat`，扣除自动生成内容（`*.lock` / `dist/` / `build/` 等），算出净改动行数。
>
> 若净行数 > **1000**，**触发误提交自检**：
>
> 1. 扫描 `git diff --cached --name-only` 输出，按以下两档判定：
>    - **高置信度（一定不该提交）**：`node_modules/` / `dist/` / `build/` / `.next/` / `.nuxt/` / `.cache/` / `*.log` / `*.tmp` / `*.pyc` / `__pycache__/` / `.DS_Store` / `Thumbs.db` / `.env*`（除 `.env.example` / `.env.template`）/ `*.swp` / `*.swo` / 任何 `>= 5 MB` 的二进制
>    - **低置信度（可能不该提交，需用户确认）**：单文件 > 500 KB / 未在上面高置信度清单但看起来像 build 产物 / 体积异常大的非文本资产
>
> 2. **若命中高置信度模式**：AI 自动 (a) 把对应模式追加到 `.gitignore`；(b) `git rm --cached <files>`；(c) 重新 `git diff --cached --stat` 复核；(d) 复核通过后正常 commit
>
> 3. **若命中低置信度模式**：AI 停下报告 (a) 当前任务；(b) 净行数；(c) 可疑文件清单 + 命中原因；(d) 询问用户：忽略 / 加 .gitignore / 拆 commit
>
> 4. **若全部正常**（净行数 > 1000 但没有命中任何模式）：直接 commit，**不需要任何特殊标签**
>
> 5. 1000 行只是触发自检的阈值，**不是 commit 上限**；自检通过的大 commit 一律放行

**阈值理由**：

- lark-gateway 1713 行是参考点：commit 本身（4 份纯文本设计文档）实际**没有误提交**——所以那次 commit 通过自检后应该放行，不应被拦
- 典型原子任务规模：docs 改动 10–200 行 / skill 改动 30–150 行 / code 修复 20–80 行 / 设计文档一次性产出 200–1500 行
- 1000 行 = 高于绝大多数原子任务的正常上限，但低于明显异常的大 commit 起点；用作"是否值得跑一次自检"的触发线
- 阈值非教条；实战可调（见 §7.1）

### 3.4 C1：lark-gateway 6 文件 forward-looking 标记

**目的**：让 AI 读到这堆文件时立即识别"未生效"，不据此立任务、不浪费 token 把它当真实状况理解。

#### 3.4.1 4 份现有文件加 frontmatter

```yaml
---
status: forward-looking
written_at: 2026-05-16
activated_by: docs/planning/workflow-evolution.md §9 4 条 checklist 全部完成
note: 本文件未构成当前工作流约束；激活前 AI 不应据此立任务、不应据此修改 backlog/now.md/decisions.md
---
```

涉及文件：

- `docs/agents/workflow/DESIGN.md`
- `docs/agents/workflow/queue.md`
- `docs/agents/workflow/state.md`
- `docs/superpowers/plans/2026-05-16-lark-gateway.md`

#### 3.4.2 2 份新建目录级 README

- `docs/agents/workflow/README.md`
- `docs/superpowers/plans/README.md`

README 模板：

```markdown
# <目录名>

> **状态：forward-looking（未生效）**

本目录所有文件状态为 `forward-looking`，未构成当前 AI 工作流约束。
激活条件见 `docs/planning/workflow-evolution.md` §9。

激活前：
- AI 读到本目录文件时**不应据此立任务**
- AI **不应据此修改** backlog.md / now.md / decisions.md
- 用户参考可以；AI 当真实状况理解不可以
```

## 4. 假设（明示）

- **A1**：用户拍板**不激活 epic 范式**；所有方案建立在此前提
- **A2**：**不修改** `AGENTS.md §6` 三件套（最小验证 + planning sync + 单任务 commit）
- **A3**：commit 1000 行自检只是脚手架内部规则，**不写 git hook、不装脚本**；纯粹是 AI 行为约束 + 模式匹配扫描
- **A4**：lark-gateway 1713 行内容本身**不审查、不重写**；只加状态标签

## 5. Open Questions（Phase 3 启动前需要拍板）

- **OQ1**：T1 里 SKILL-04 状态对齐方向——`now.md` 跟 `backlog`（标 pending）/ `backlog` 跟 `now`（标已落地）？
- **OQ2**：T1 里 frontier 重选——从 backlog 挑 `SKILL-02-DOGFOOD-NOTE` / 挑 `SKILL-03-PROMPT-ITERATION` / 留空等下次拍板？
- **OQ3**：commit 1000 行触发自检的阈值是否合理？实战可能需要观察 5–10 个真实 commit 再调；同时观察高/低置信度模式清单是否覆盖了真实出现的误提交场景

## 6. 改动清单

### T1：校正 now.md（约 25 行改动，type=docs）

**目的**：消除 `now.md` 与仓库的 4 处脱节。

**改动**：

1. 删除 frontier 中的 `LARK-01-CONNECTOR-DESIGN` 和 `LARK-02-API-INVESTIGATION`（roadmap 有、backlog 无，凭空 frontier）
2. 把 `SKILL-01-DEBUG-CHECKLIST-V0_0_1` 移到"最近完成"段，标注 `f5df2bf 已落地 v0.0.1`
3. 按 OQ1 拍板结果对齐 SKILL-04 状态
4. 按 OQ2 拍板结果决定 frontier 内容
5. 已冻结段"原 BRIDGE-02-PRINTABLE-V0：被 LARK-03 替代"——LARK-03 不存在了，改写为"暂存不动；备赛后随 LARK 系列重评"
6. **不**加 Ongoing 段
7. 已冻结段 `post_pivot_registry` 中 `BRIDGE-03-LARK-INTEGRATION` 同步修订（不再"替代 printable-v0"）

**验证**：

- `git diff --check`（exit 0）
- `python3 -c "import yaml; yaml.safe_load(open('docs/planning/now.md').read().split('\`\`\`yaml')[1].split('\`\`\`')[0])"`（exit 0）

**commit message 模板**：

```
docs(planning): 校正 now.md 对齐仓库实际

- 删 LARK-01/02 凭空 frontier（roadmap 有、backlog 无）
- 承认 SKILL-01-DEBUG-CHECKLIST-V0_0_1 在 f5df2bf 已闭环
- 对齐 SKILL-04 状态（OQ1 拍板：<方向>）
- 重写"已冻结"段（LARK-03 不再存在）
```

### T2：backlog 加 type 列 + atomic-task SKILL 加规则与对照表（约 50 行新增，type=skill）

**目的**：落地 M1 + M2 + M3 三条机制。

**改动**：

1. `docs/planning/backlog.md`：
   - 表头加 `type` 列
   - 每行补 type 字段：
     - SKILL-01..04 → `skill`（DoD 落到 SKILL.md + verify:skills-sync）
     - BRIDGE-01 → `docs`（schema markdown）
     - BRIDGE-02..04 → `design`（设计型任务）
     - TRAIL-01..04 → `design`（viewer 设计、auto-weave 设计、retire 设计）
   - "认领规则"段第 1 条加："候选池只在 `backlog.md`；`roadmap.md` 不构成候选源"

2. `.agents/skills/atomic-task/SKILL.md`：
   - `## rules` 段追加 3 条新规则（M1 / M2 / M3 全文，见 §3.1 / §3.2.3 / §3.3）
   - 新增 `## DoD type 对照表` 段（全文，见 §3.2.2）

**镜像**：改 `.agents/skills/atomic-task/SKILL.md` 会触发 `.agents/hooks/sync-skills.sh` PostToolUse hook，自动镜像到 `.claude/skills/atomic-task/SKILL.md`。

**验证**：

- `cd apps/desktop && npm run verify:skills-sync`（exit 0；漂移哨兵）
- `git diff --check`（exit 0）

**commit message 模板**：

```
skill(atomic-task): 加候选池闭口 + DoD 工程谓词对照表 + commit 误提交自检

- M1: 候选池只在 backlog.md，不读 roadmap
- M2: DoD 按 type 对照表强制工程谓词形式
- M3: 单 commit > 1000 行触发误提交自检；高置信度模式自动加 .gitignore；
       低置信度询问用户；自检通过的大 commit 直接放行
- backlog 表头加 type 列
```

### T3：lark-gateway 6 文件标 forward-looking（约 40 行 + 2 新 README，type=docs）

**目的**：落地 C1。

**改动**：

1. 4 份现有文件加 frontmatter（见 §3.4.1）
2. 新建 `docs/agents/workflow/README.md`（README 模板，见 §3.4.2）
3. 新建 `docs/superpowers/plans/README.md`（README 模板，见 §3.4.2）

**验证**：

- `grep -rl "status: forward-looking" docs/agents/workflow docs/superpowers/plans | wc -l`（期望 ≥ 6）
- `git diff --check`（exit 0）

**commit message 模板**：

```
docs: lark-gateway 设计稿与 agent workflow 协议标 forward-looking

- 4 文件加 frontmatter status: forward-looking
- 新增目录级 README 声明性质
- 激活条件指向 workflow-evolution.md §9
```

## 7. 风险与观察

### 7.1 1000 行触发阈值可能不合适

- **风险 A（阈值太低）**：单一大设计文档一次产出 1200 行触发自检但实际没有误提交，造成无谓扫描开销
- **风险 B（阈值太高）**：误提交从 1000 行以下的小 commit 偷偷溜过，自检根本不触发
- **观察**：Phase 3 后跑 5–10 个真实 commit，记录 (a) 触发自检次数；(b) 触发后真发现误提交的次数；(c) 没触发但事后发现误提交的次数。空跑率（触发但无误提交）持续 100% → 上调阈值；漏报率（没触发但有误提交）非零 → 下调阈值
- **缓解**：阈值非教条；高/低置信度模式清单也可以独立调整

### 7.2 type 枚举可能漏类型

- **风险**：将来出现新工作类型不在 7 种里
- **观察**：misc 兜底先用，统计 misc 出现率；超 2 个不同 misc 案例应该考虑新增类型
- **缓解**：misc 已留作兜底

### 7.3 forward-looking 标记被忽略

- **风险**：AI 读到带 `status: forward-looking` 文件时未识别为未生效，仍据此立任务
- **观察**：Phase 3 后跑下一轮 atomic-task 时，AI 是否正确跳过 lark-gateway / workflow-evolution 中的"任务建议"
- **缓解**：未来可在 atomic-task SKILL 的"条件读取"段加一条"读到 `status: forward-looking` 立即返回'已忽略'并不据此立任务"；本次先靠 README 与 frontmatter 标签，观察后视情况补强

### 7.4 漏洞 3（roadmap ↔ backlog 同步）继续存在

- **风险**：M1 候选池闭口防住 AI 自由发散，但 roadmap 里有的项要进 backlog 仍然没有协议
- **缓解**：Phase 3 完成后下一轮单独立任务处理（建议任务名 `SCAFFOLD-02-ROADMAP-TO-BACKLOG-PROTOCOL`）；本次不在范围

## 8. 不在范围的事（明示推迟，归类清楚）

| 项 | 性质 | 推迟原因 |
|---|---|---|
| 持续累积型字段（Ongoing 段） | 产品反馈通路 | 用户拍板：脚手架不管这类 |
| dogfood note 没人写 | 产品行为问题 | 用户行为，AI 不替你跟踪 |
| `SKILL-03-PROMPT-ITERATION` 启动判据 | 产品迭代节奏 | 用户自决 |
| Trail 触发条件重新定义 | 产品架构问题 | archive 是暂存区，roadmap §3 假设需重写，下一轮 |
| `roadmap.md` → `backlog.md` 同步协议 | 脚手架但属另一漏洞 | 单独立任务处理 |
| v0.3 时期遗留的 5 个 skill 归类 | 历史清理 | 与本次脚手架补强无依赖，单独处理 |

## 9. 验证整体设计的实战指标（Phase 3 完成后下一轮 AI 进 atomic-task 时观察）

- ✅ AI 不读 `roadmap.md` 找候选
- ✅ AI 读 `backlog.md` 时使用 type 列匹配 DoD 形式
- ✅ AI 遇到不可机器验证的 DoD 拒绝认领
- ✅ AI commit 前对净行数 > 1000 的 commit 主动触发误提交自检
- ✅ AI 读到 `status: forward-looking` 文件时跳过、不据此立任务

如以上 5 项任一失败，视为脚手架补强未达成，须立 repair task。

## 10. 引用源

- `AGENTS.md` §6 / §7
- `docs/planning/now.md`（脱节实例源）
- `docs/planning/backlog.md`（候选池）
- `docs/planning/roadmap.md` §4（LARK 系列定义来源）
- `docs/planning/workflow-evolution.md`（forward-looking 范式参考）
- `.agents/skills/atomic-task/SKILL.md`（被补强目标）
- `docs/superpowers/plans/2026-05-16-lark-gateway.md`（forward-looking 案例）
- git commits: `afd13db`（lark-gateway 1713 行落地）/ `7385281`（workflow-evolution 引入）/ `f5df2bf`（SKILL-01 v0.0.1 落地）
