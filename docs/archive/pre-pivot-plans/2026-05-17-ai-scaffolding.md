---
status: archived
written_at: 2026-05-17
closed_at: 2026-05-18
landed_in:
  - 4c09ba1 # T1/T2/T3 (M1/M2/M3 三条 atomic-task 规则)
  - 12e747e # C1 (lark-gateway 6 文件标 forward-looking)
note: 本 plan 已实施完毕;checkbox 未回填 [x],事实以 landed_in commit 为准
---

# AI 脚手架补强（atomic-task 框架）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 落地 spec `docs/superpowers/specs/2026-05-17-ai-scaffolding-design.md` 中的 M1 / M2 / M3 + C1：让 AI 跑 atomic-task 循环时候选池闭口、DoD 强制工程谓词、大 commit 触发误提交自检、lark-gateway 6 文件标 forward-looking。

**Architecture:** 3 个独立的原子任务 + 1 个清理 = 4 个原子任务串行。每任务一次 commit，commit 前自检 `git diff --cached --stat` 净行数。无代码、无 verify 命令、无 schema 改。全 docs / skill markdown。

**Tech Stack:** Markdown / YAML frontmatter / Python `yaml.safe_load`（验证用）/ Node `verify:skills-sync`（镜像同步检查）

---

## Prerequisites（执行前用户必须答）

执行 T1 前必须答：

- **OQ1**：SKILL-04-PERSONAL-DAILY-SUMMARY 状态对齐方向
  - 选项 A：改 backlog 标已落地（承认事实——`93dc7d0` commit 已落地 v0.0.1）★ Plan 默认
  - 选项 B：改 now.md 回 pending（与 backlog 对齐为未启动）
- **OQ2**：T1 frontier 重选
  - 选项 A：留空 frontier 等 T1/T2/T3 完成后下次拍板 ★ Plan 默认
  - 选项 B：从 backlog 挑 SKILL-02-DOGFOOD-NOTE
  - 选项 C：从 backlog 挑 SKILL-03-PROMPT-ITERATION

Plan 内步骤按默认值（OQ1=A、OQ2=A）写。如选其他选项，请在 T1 step 5 的文本里替换对应行。

---

## File Structure

| 文件 | 操作 | 任务 | 职责 |
|---|---|---|---|
| `docs/planning/now.md` | 修改 | T1 | 删凭空 frontier / 承认 SKILL-01 已闭环 / 对齐 SKILL-04 / 重写已冻结段 |
| `docs/planning/backlog.md` | 修改 | T2 | 表头加 type 列 / 每行补 type 字段 / 认领规则加候选池闭口 |
| `.agents/skills/atomic-task/SKILL.md` | 修改 | T2 | rules 段加 3 条新规则 / 新增 DoD type 对照表段 |
| `.claude/skills/atomic-task/SKILL.md` | 自动同步 | T2 | PostToolUse hook 自动镜像 |
| `docs/agents/workflow/DESIGN.md` | 修改 | T3 | **无现有 frontmatter**，在文件顶端新加一块 |
| `docs/agents/workflow/queue.md` | 修改 | T3 | **已有 frontmatter**，merge 加 status / written_at / activated_by / note |
| `docs/agents/workflow/state.md` | 修改 | T3 | **已有 frontmatter**，同上 merge |
| `docs/superpowers/plans/2026-05-16-lark-gateway.md` | 修改 | T3 | **无现有 frontmatter**，在文件顶端新加一块 |
| `docs/agents/workflow/README.md` | 创建 | T3 | 目录级 forward-looking 声明 |
| `docs/superpowers/plans/README.md` | 创建 | T3 | 目录级 forward-looking 声明 |

**注意**：SKILL-04 状态对齐方向（OQ1）若选 B，需要把改动从 T1（改 now.md）转到 T2（改 backlog.md）。Plan 默认按 A 来。

---

## 任务执行顺序

**T1 → T2 → T3**

- **T1 先做**：让 now.md 立即对齐仓库实际（消脱节），之后任何任务都不会因为 now.md 凭空 frontier 而误导
- **T2 第二**：新规则落地后，T3 commit 前就能享受到 M3 误提交自检的好处
- **T3 最后**：清理历史悬空文件，不影响前两任务的执行

三者无硬依赖；调换顺序不会破坏正确性。

---

## Task T1: 校正 now.md（type=docs）

**Files:**
- Modify: `docs/planning/now.md`

**预计净行数变化**：约 25 行（删 ~15 行、加 ~10 行）。远低于 1000 行触发线。

- [ ] **Step 1: Read 当前 now.md 全文**

读 `docs/planning/now.md`，确认 yaml frontmatter 与"最近完成"段的当前格式。

- [ ] **Step 2: 跑 git status / log 确认仓库状态**

```bash
git status --short
git log --oneline -5
```

期望：
- `git status --short` 干净（无未提交改动）或仅 `docs/planning/now.md` 在 staging
- `git log --oneline -5` 显示最近 commit 含 `86cdedf`（spec 修订）

如果不干净且非 `now.md` 单文件，停下问用户原因。

- [ ] **Step 3: 修改 yaml frontmatter 中的 frontier**

把 `now.md` 第 10-14 行（frontier 段）：

```yaml
frontier:
  - SKILL-01-DEBUG-CHECKLIST-V0_0_1      # current；debug-checklist v0.0.1 自用
  - SKILL-04-PERSONAL-DAILY-SUMMARY      # current；v0.0.1 已落地，备赛期可用
  - LARK-01-CONNECTOR-DESIGN             # pending；飞书 agent 架构设计
  - LARK-02-API-INVESTIGATION            # pending；调研飞书开放平台能力边界
```

替换为（OQ2 默认：留空 frontier）：

```yaml
frontier: []  # T1/T2/T3 完成后下次重新拍板；不预选
```

**OQ2=B 选 SKILL-02 时**：替换为
```yaml
frontier:
  - SKILL-02-DOGFOOD-NOTE                # pending（备赛期 dogfood 容器）
```

**OQ2=C 选 SKILL-03 时**：替换为
```yaml
frontier:
  - SKILL-03-PROMPT-ITERATION            # pending（待 dogfood 数据足够）
```

- [ ] **Step 4: 删除"当前任务"段中已闭环的子节**

把 `now.md` 第 26-29 行（SKILL-01 子节）：

```markdown
### SKILL-01-DEBUG-CHECKLIST-V0_0_1（进行中）
- 目标：`.agents/skills/debug-checklist/SKILL.md` 持续迭代，自用喂养 debug-archive
- 边界：只动 SKILL.md；不动 v0.3 代码
- DoD：每次调试问题都尝试用 skill 记录，积累 20+ 条 archive
```

整段**删除**（包括空行）。

把 `now.md` 第 31-34 行（SKILL-04 子节，OQ1=A 默认：承认已落地，从"当前任务"挪走）：

```markdown
### SKILL-04-PERSONAL-DAILY-SUMMARY（已落地，使用中）
- 目标：个人日报/周报生成，结合 git log 和口述补充
- 状态：v0.0.1 已落地于 `.agents/skills/personal-daily-summary/SKILL.md`
- 用途：备赛期记录技术学习轨迹（ROS/MPC/RL方向），为明年知识传承留素材
```

整段**删除**。

**OQ1=B（改 now.md 回 pending）时**：把这段改为：
```markdown
### SKILL-04-PERSONAL-DAILY-SUMMARY（pending）
- 与 backlog 状态对齐；待启动
```
不删除。

把 `now.md` 第 36-39 行（LARK-01）和 41-48 行（LARK-02）**整段删除**：

```markdown
### LARK-01-CONNECTOR-DESIGN（待启动）
- 目标：设计 ProbeFlash ↔ 飞书 的双向对接架构
- 核心问题：飞书作为输入数据源（替代微信），ProbeFlash 作为中央处理枢纽
- 产出：`docs/design/lark-connector-arch.md`

### LARK-02-API-INVESTIGATION（待启动）
- 目标：调研飞书开放平台 API 能力边界
- 关键确认项：
  - 能否读取群聊消息？权限审批难度？
  - 多维表格 API 的读写能力？
  - webhook 推送延迟和可靠性？
  - 企业内部应用 vs 第三方应用的权限差异？
- 产出：飞书能力评估报告，决定哪些数据走飞书、哪些留本地
```

理由：roadmap 有、backlog 无的凭空 frontier，由 M1 候选池闭口禁止。

- [ ] **Step 5: 修改 yaml frontmatter 中的 current_task**

把 `current_task: SKILL-01-DEBUG-CHECKLIST-V0_0_1` 改为：

```yaml
current_task: null  # T1/T2/T3 完成后下次重新拍板
```

- [ ] **Step 6: 重写"已冻结"段中关于 LARK-03 的行**

把 `now.md` "已冻结"段中：

```markdown
- **原 BRIDGE-02-PRINTABLE-V0**：被 LARK-03 替代，不再推进纯静态方案
```

改为：

```markdown
- **原 BRIDGE-02-PRINTABLE-V0**：暂存不动；备赛后随 BRIDGE 系列重评（LARK-03 当前不在候选池）
```

同段中 `post_pivot_registry` 的 `BRIDGE-03-LARK-INTEGRATION` 行：

```yaml
  - BRIDGE-03-LARK-INTEGRATION           # 飞书对接版本，替代原 printable-v0
```

改为：

```yaml
  - BRIDGE-03-LARK-INTEGRATION           # 备赛后随 LARK 系列重评
```

- [ ] **Step 7: 在"最近完成"段顶部追加 SKILL-01 闭环条目**

在 `now.md` "## 最近完成"段（约第 73 行）下，第一条之前追加：

```markdown
- 2026-05-17 SKILL-01-DEBUG-CHECKLIST-V0_0_1 工程闭环承认：v0.0.1 在 `f5df2bf` 已落地于 `.agents/skills/debug-checklist/SKILL.md`；DoD（"积累 20+ 条 archive"）属产品价值非工程谓词，不在原子任务 DoD 范围。
- 2026-05-17 AI 脚手架设计 spec 起草（`da1b666`）+ M3 修订（`86cdedf`）：`docs/superpowers/specs/2026-05-17-ai-scaffolding-design.md`。
```

把"最近完成"段裁剪到最多 5 条（按 atomic-task SKILL 第 10 步规则）。当前是 5 条，加 2 条后 = 7 条，**删除最老的 2 条**（"2026-05-15 STM32 问题归档" 和 "2026-05-15 新增 skill: pre-match-checklist"）。

- [ ] **Step 8: 跑 git diff 复核**

```bash
git diff docs/planning/now.md
```

期望：约 25 行变化（insertions + deletions），所有改动都在 frontier / current_task / "当前任务"段 / "已冻结"段 / "最近完成"段。无意外文件改动。

- [ ] **Step 9: 跑验证命令**

```bash
git diff --check
python3 -c "import yaml; content = open('docs/planning/now.md').read(); fm = content.split('\`\`\`yaml')[1].split('\`\`\`')[0]; yaml.safe_load(fm); print('yaml OK')"
```

期望：
- `git diff --check` exit 0（无空白错误）
- yaml 解析输出 `yaml OK`，exit 0

如果 yaml 解析失败，回退 step 3/5/6 检查 yaml 缩进。

- [ ] **Step 10: 检查暂存区是否仅 now.md**

```bash
git add docs/planning/now.md
git diff --cached --stat
```

期望：仅 `docs/planning/now.md | XX +XX -X`，净行数 < 1000，不触发 M3 自检（M3 此时也还没落地，但作为习惯先看）。

- [ ] **Step 11: Commit**

```bash
git commit -m "$(cat <<'EOF'
docs(planning): 校正 now.md 对齐仓库实际

- 删 LARK-01/02 凭空 frontier（roadmap 有、backlog 无）
- 承认 SKILL-01-DEBUG-CHECKLIST-V0_0_1 在 f5df2bf 已工程闭环（v0.0.1）
- SKILL-04 状态对齐（OQ1=A：承认 93dc7d0 已落地）
- 重写"已冻结"段（LARK-03 不再存在；BRIDGE-03 备赛后重评）
- "最近完成"段裁剪到 5 条；追加本次 spec / scaffolding 工作记录

承接 spec da1b666 + 86cdedf。
EOF
)"
```

- [ ] **Step 12: 复核 commit 落地**

```bash
git log --oneline -1
git status --short
```

期望：
- 最新 commit 是本次 T1 commit
- `git status --short` 输出为空（工作树干净）

T1 完成。STOP。下次启动 T2 前重新进 atomic-task skill 第 1 步。

---

## Task T2: backlog 加 type 列 + atomic-task SKILL 加规则与对照表（type=skill）

**Files:**
- Modify: `docs/planning/backlog.md`
- Modify: `.agents/skills/atomic-task/SKILL.md`
- Auto-mirror: `.claude/skills/atomic-task/SKILL.md` (PostToolUse hook)

**预计净行数变化**：约 50 行（backlog +15 / SKILL +35）。远低于 1000 行触发线。

- [ ] **Step 1: Read 当前 backlog.md**

读 `docs/planning/backlog.md` 全文，特别是表头和认领规则段。

- [ ] **Step 2: 改 backlog.md 表头加 type 列**

把 backlog.md 第 12-13 行（P0 段表头）：

```markdown
## P0 — Skill 自用闭环（备赛期窗口）

| 任务 | 状态 | 内容 |
|------|------|------|
```

改为：

```markdown
## P0 — Skill 自用闭环（备赛期窗口）

| 任务 | 状态 | type | 内容 |
|------|------|------|------|
```

P0 段下面 4 行任务（SKILL-01..04），每行加 type 字段：

```markdown
| SKILL-01-DEBUG-CHECKLIST-V0_0_1 | done | skill | 已落地 v0.0.1 于 f5df2bf；DoD = SKILL.md 落地 + verify:skills-sync 通过（已闭环） |
| SKILL-02-DOGFOOD-NOTE | pending | docs | 起 `docs/dogfood/` 目录；备赛期每次用 / 没用都写 1-3 行；30 天后回看 |
| SKILL-03-PROMPT-ITERATION | pending | skill | 基于 dogfood 数据调 SKILL.md 的 prompt 模板；只动 SKILL.md，不动其他 |
| SKILL-04-PERSONAL-DAILY-SUMMARY | done | skill | 已落地 v0.0.1 于 93dc7d0；DoD = SKILL.md 落地 + verify:skills-sync 通过（已闭环） |
```

**OQ1=B（标 pending）时**：SKILL-04 行状态字段 `done` → `pending`，内容字段也相应改回。Plan 默认按 A。

- [ ] **Step 3: 改 P1 / P2 表头并补 type**

P1（Bridge）表头同样加 type 列：

```markdown
## P1 — Bridge（备赛后启动）

| 任务 | 状态 | type | 内容 |
|------|------|------|------|
| BRIDGE-01-ROSTER-SCHEMA | pending（备赛后） | docs | 在 `docs/bridge/ROSTER.schema.md` 起一份 markdown schema；先打印贴墙试用 |
| BRIDGE-02-PRINTABLE-V0 | pending（备赛后） | design | schema 跑通后做一个能打印的纯 markdown 模板，无网页 |
| BRIDGE-03-READONLY-VIEWER | pending（备赛后） | design | 决定要不要做 web 只读视图；要做就把 v0.3 网页 UI 改造为 markdown viewer |
| BRIDGE-04-WORKLOAD-VISIBILITY | pending（备赛后） | design | "谁被任务卡住 + 需要什么帮助"——只显示任务阻塞，不显示人与人的产能排名。可辅助"简单任务的人去帮卡住的人"配对 |
```

P2（Trail）表头同样：

```markdown
## P2 — Trail（archive 数据足够后启动）

| 任务 | 状态 | type | 内容 |
|------|------|------|------|
| TRAIL-01-VIEWER-DESIGN | pending（archive ≥ 20 条） | design | 设计三种视图：个人足迹 / 模块史 / 赛季年鉴 |
| TRAIL-02-AUTO-WEAVE | pending | design | AI 把 `.debug-archive/` + 个人日报织成"成长摘要" |
| TRAIL-03-V03-UI-RETIRE | pending | design | v0.3 网页 UI 退役为 Trail 的 markdown viewer |
| TRAIL-04-WEEKLY-SUMMARY | pending | design | 自动聚合个人日报/周报 + debug 记录，生成"这周干了啥"的可分享摘要。直接回答老师/学长问话 |
```

- [ ] **Step 4: 在 backlog.md 认领规则段加 M1 候选池闭口**

把 backlog.md 第 5-10 行（"## 认领规则（pivot 后）"段）：

```markdown
## 认领规则（pivot 后）

1. 每次只认领一个原子任务，未 commit 不进入下一任务。
2. 备赛期只允许 SKILL 类自用任务；BRIDGE / TRAIL 都 pending 到备赛后。
3. ProbeFlash v0.3 已冻结：不再认领 TECH / AIREADY / REALAI / CODECTX / DEP / DATA / UI / CORE / SEARCH 任务；致命补丁除外。
4. 冷静期：决定写代码前让判断沉 48-72h，不冲动开新坑。
```

替换为（追加第 5 条）：

```markdown
## 认领规则（pivot 后）

1. 每次只认领一个原子任务，未 commit 不进入下一任务。
2. 备赛期只允许 SKILL 类自用任务；BRIDGE / TRAIL 都 pending 到备赛后。
3. ProbeFlash v0.3 已冻结：不再认领 TECH / AIREADY / REALAI / CODECTX / DEP / DATA / UI / CORE / SEARCH 任务；致命补丁除外。
4. 冷静期：决定写代码前让判断沉 48-72h，不冲动开新坑。
5. 候选池只在本文件；`roadmap.md` 不构成候选源。若 `now.md` frontier 项在本文件无对应行，视为脱节，必须先补本文件再认领；不允许"凭空 frontier"。
```

- [ ] **Step 5: Read 当前 atomic-task SKILL.md**

读 `.agents/skills/atomic-task/SKILL.md` 全文，特别是 `## rules` 段（约第 43-53 行）。

- [ ] **Step 6: 在 atomic-task SKILL.md `## rules` 段追加 M1 / M2 / M3 三条**

在 `.agents/skills/atomic-task/SKILL.md` 的 `## rules` 段最末（"- 不恢复已硬删除的弱化文档；交接状态只写 `now.md`。"行之后）追加：

```markdown
- **候选池闭口（M1）**：选 frontier / current_task 时，候选池**只在 `docs/planning/backlog.md`**；不读 `roadmap.md` 找候选；不从 `now.md` 现有 frontier 之外的位置自由发散。若 `now.md` 的 frontier 项在 `backlog.md` 没有对应行，视为脱节，**必须先补 backlog 再认领**；不允许"凭空 frontier"。
- **DoD 工程谓词（M2）**：认领任务时，必须按 `backlog.md` 里的 `type` 字段查 `## DoD type 对照表` 确认 DoD 形式合法。DoD 必须至少包含 1 条工程谓词（文件存在 / 命令 exit 0 / grep 命中 / schema safeParse 通过 / yaml 可解析）。"积累 N 条 / 用过 N 次 / 了解了 X / 对齐了 Y / 沉淀价值"这类不可机器验证描述**不构成 DoD**；遇到这类 DoD，视为非原子任务，**拒认领**并退回用户重新定义。
- **commit 误提交自检（M3）**：在 `git commit` 之前必须跑 `git diff --cached --stat`，扣除自动生成内容（`*.lock` / `dist/` / `build/` 等），算出净改动行数。若净行数 > **1000**，触发误提交自检：(1) 扫描 `git diff --cached --name-only` 输出，匹配高置信度模式（`node_modules/` / `dist/` / `build/` / `.next/` / `.nuxt/` / `.cache/` / `*.log` / `*.tmp` / `*.pyc` / `__pycache__/` / `.DS_Store` / `Thumbs.db` / `.env*`（除 `.env.example` / `.env.template`）/ `*.swp` / `*.swo` / >= 5 MB 二进制）；命中则自动追加 `.gitignore` + `git rm --cached <files>` + 复核后正常 commit。(2) 命中低置信度模式（>500KB / 异常资产）→ 停下询问用户。(3) 全部正常 → 直接 commit，不需要任何特殊标签。1000 行只是触发自检的阈值，**不是 commit 上限**；自检通过的大 commit 一律放行。
```

- [ ] **Step 7: 在 atomic-task SKILL.md 文件末追加 ## DoD type 对照表 段**

在 `.agents/skills/atomic-task/SKILL.md` 文件末（`## rules` 段最后一条之后）追加完整新段：

````markdown

## DoD type 对照表

`backlog.md` 中每个任务都标注一个 `type` 字段；认领任务时按下表查 DoD 必须形式。

| type | DoD 必含 | 验证命令样例 |
|---|---|---|
| code | 代码文件落地 + 任务对应 verify 通过 | `cd apps/X && npm run verify:Y`（exit 0） |
| skill | `.agents/skills/X/SKILL.md` 落地 + `verify:skills-sync` 通过 | `cd apps/desktop && npm run verify:skills-sync`（exit 0） |
| design | `docs/design/X.md` 落地 + 在 `decisions.md` 追加 ADR 或文档自标 `status: forward-looking` | `test -f docs/design/X.md && grep -q "^status:" docs/design/X.md`（exit 0） |
| research | `docs/research/X.md` 落地 + 在 `decisions.md` 追加 1 条结论 | 同 design 形式 |
| docs | `git diff --check` 干净 + yaml 可解析 + grep 旧路径无残留 | `git diff --check`；`python3 -c "import yaml; yaml.safe_load(open('X').read())"` |
| forward-looking | 单文档 + 自标 `status: forward-looking` + 自写激活条件 | `grep -q "status: forward-looking" docs/X.md`（exit 0） |
| misc | 任务认领时**明确写出**至少 1 条工程谓词式 DoD 与对应验证命令 | 任务级声明（由认领者填） |

**规则**（与 `## rules` 段 M2 互引）：

- DoD 形式不符合表中任一行的任务，视为非原子任务，AI **拒认领**
- 类型枚举可扩展；新增类型必须同时在本表和 backlog.md 出现
- `misc` 是兜底，应该尽量避免；统计 misc 出现率超 2 个不同案例时考虑新增类型
````

- [ ] **Step 8: 跑 git diff 复核**

```bash
git diff docs/planning/backlog.md .agents/skills/atomic-task/SKILL.md
```

期望：约 50 行变化，覆盖 backlog 表头 / 表行 / 认领规则段 + SKILL.md rules 段 + DoD type 对照表段。

- [ ] **Step 9: 跑 verify:skills-sync 验证镜像**

镜像由 `.agents/hooks/sync-skills.sh` PostToolUse hook 自动触发；写完 `.agents/skills/atomic-task/SKILL.md` 后 `.claude/skills/atomic-task/SKILL.md` 应该已同步。如果 hook 未跑（sandbox 限制），需要手动：

```bash
cp -p .agents/skills/atomic-task/SKILL.md .claude/skills/atomic-task/SKILL.md
```

然后跑漂移哨兵：

```bash
cd apps/desktop && npm run verify:skills-sync
```

期望：exit 0，输出"skills synced"或类似 OK 消息。如果 exit != 0，按提示修复（通常是 `.claude/skills/` 漂移）。

- [ ] **Step 10: 跑 git diff --check**

```bash
git diff --check
```

期望：exit 0（无空白错误）。

- [ ] **Step 11: 把改动加入暂存区 + 检查净行数**

```bash
git add docs/planning/backlog.md .agents/skills/atomic-task/SKILL.md .claude/skills/atomic-task/SKILL.md
git diff --cached --stat
```

期望：3 文件，净行数 < 1000（实际约 50-60 行），不触发 M3 自检。

如果意外发现其他暂存文件，停下检查原因（M3 自检逻辑：可能命中高置信度模式应该自动加 .gitignore）。

- [ ] **Step 12: Commit**

```bash
git commit -m "$(cat <<'EOF'
skill(atomic-task): 加候选池闭口 + DoD 工程谓词对照表 + commit 误提交自检

- M1 候选池闭口：选 frontier 只在 backlog.md，不读 roadmap.md，凭空 frontier 必须先补 backlog
- M2 DoD 工程谓词：按 type 对照表强制（code/skill/design/research/docs/forward-looking/misc 共 7 类）；
       "积累 N 条 / 用过 N 次"等不可机器验证描述拒认领
- M3 commit 误提交自检：单 commit 净行数 > 1000 触发；高置信度模式（lock/build/binary/临时/env 等）
       AI 自动加 .gitignore + git rm --cached；低置信度询问用户；自检通过的大 commit 直接放行
- backlog 表头加 type 列（P0/P1/P2 三段共 12 行任务）
- 认领规则第 5 条新增（候选池闭口对应）

承接 spec da1b666 + 86cdedf。
EOF
)"
```

- [ ] **Step 13: 复核 commit 落地 + 镜像一致**

```bash
git log --oneline -1
git status --short
diff -q .agents/skills/atomic-task/SKILL.md .claude/skills/atomic-task/SKILL.md
```

期望：
- 最新 commit 是本次 T2 commit
- `git status --short` 输出为空
- 两份 SKILL.md `diff -q` 无输出（一致）

T2 完成。STOP。下次启动 T3 前重新进 atomic-task skill 第 1 步。

---

## Task T3: lark-gateway 6 文件标 forward-looking（type=docs）

**Files:**
- Modify: `docs/agents/workflow/DESIGN.md`（无现有 frontmatter，**新加**）
- Modify: `docs/agents/workflow/queue.md`（已有 frontmatter，**merge**）
- Modify: `docs/agents/workflow/state.md`（已有 frontmatter，**merge**）
- Modify: `docs/superpowers/plans/2026-05-16-lark-gateway.md`（无现有 frontmatter，**新加**）
- Create: `docs/agents/workflow/README.md`
- Create: `docs/superpowers/plans/README.md`

**预计净行数变化**：约 40 行 + 2 新文件（~30 行）。不触发 1000 行自检。

- [ ] **Step 1: 在 DESIGN.md 文件顶端新加 frontmatter**

读 `docs/agents/workflow/DESIGN.md` 前 6 行确认目前是直接 `# ProbeFlash Agent 工作流协议 v1.0` 开头（无 frontmatter）。

在文件最顶端（`# ProbeFlash ...` 之前）插入：

```yaml
---
status: forward-looking
written_at: 2026-05-16
activated_by: docs/planning/workflow-evolution.md §9 4 条 checklist 全部完成
note: 本文件未构成当前工作流约束；激活前 AI 不应据此立任务、不应据此修改 backlog/now.md/decisions.md
---

```

注意：frontmatter 块结尾的 `---` 后必须有一个空行，然后才是 `# ProbeFlash ...`。

- [ ] **Step 2: 在 queue.md 现有 frontmatter 中 merge 新字段**

读 `docs/agents/workflow/queue.md` 前 6 行确认目前 frontmatter：

```yaml
---
version: "1.0"
updated: "2026-05-16T14:35:00+08:00"
project: lark-gateway
---
```

替换为（在 `---` 之间追加 4 个新字段）：

```yaml
---
version: "1.0"
updated: "2026-05-16T14:35:00+08:00"
project: lark-gateway
status: forward-looking
written_at: 2026-05-16
activated_by: docs/planning/workflow-evolution.md §9 4 条 checklist 全部完成
note: 本文件未构成当前工作流约束；激活前 AI 不应据此立任务、不应据此修改 backlog/now.md/decisions.md
---
```

- [ ] **Step 3: 在 state.md 现有 frontmatter 中 merge 新字段**

读 `docs/agents/workflow/state.md` 前 6 行确认目前 frontmatter：

```yaml
---
session: "2026-05-16-001"
agent: "Claude"
updated: "2026-05-16T14:35:00+08:00"
---
```

替换为：

```yaml
---
session: "2026-05-16-001"
agent: "Claude"
updated: "2026-05-16T14:35:00+08:00"
status: forward-looking
written_at: 2026-05-16
activated_by: docs/planning/workflow-evolution.md §9 4 条 checklist 全部完成
note: 本文件未构成当前工作流约束；激活前 AI 不应据此立任务、不应据此修改 backlog/now.md/decisions.md
---
```

- [ ] **Step 4: 在 lark-gateway.md 文件顶端新加 frontmatter**

读 `docs/superpowers/plans/2026-05-16-lark-gateway.md` 前 6 行确认目前是直接 `# Lark Gateway Implementation Plan` 开头（无 frontmatter）。

在文件最顶端插入：

```yaml
---
status: forward-looking
written_at: 2026-05-16
activated_by: docs/planning/workflow-evolution.md §9 4 条 checklist 全部完成
note: 本 plan 未构成当前工作流约束；激活前 AI 不应据此立任务、不应据此修改 backlog/now.md/decisions.md
---

```

注意：`---` 后必须有空行。

- [ ] **Step 5: 新建 docs/agents/workflow/README.md**

完整内容：

```markdown
# Agent Workflow（forward-looking）

> **状态：forward-looking（未生效）**

本目录所有文件状态为 `forward-looking`，**未构成当前 AI 工作流约束**。
激活条件见 `docs/planning/workflow-evolution.md` §9（4 条 checklist 全部完成）。

激活前：

- AI 读到本目录文件时**不应据此立任务**
- AI **不应据此修改** `docs/planning/backlog.md` / `docs/planning/now.md` / `docs/planning/decisions.md`
- 用户参考可以；AI 当真实状况理解不可以

当前生效工作流权威源：

- `AGENTS.md` §6 Atomic Task Discipline
- `.agents/skills/atomic-task/SKILL.md`
```

- [ ] **Step 6: 新建 docs/superpowers/plans/README.md**

完整内容：

```markdown
# Superpowers Plans

本目录存放 `superpowers:writing-plans` skill 产出的实施 plan。

**注意**：

- 当前生效的 plan = 文件 frontmatter `status` 字段为 `active`、`in_progress`、或缺省的
- `status: forward-looking` 的 plan **未构成当前工作流约束**；激活前 AI 不应据此立任务
- 已完成 plan 移到 `docs/archive/` 子目录或自标 `status: archived`

当前文件状态速览：

- `2026-05-16-lark-gateway.md`：`status: forward-looking`（激活条件见 `docs/planning/workflow-evolution.md` §9）
- `2026-05-17-ai-scaffolding.md`：当前生效（本 plan 自身）
```

- [ ] **Step 7: 跑 git diff 复核所有改动**

```bash
git diff docs/agents/workflow/ docs/superpowers/plans/
git status --short
```

期望：
- 4 个 modified 文件 + 2 个 untracked 文件
- 改动总量约 40 行 + 2 新文件（每个约 15 行）

- [ ] **Step 8: 跑 yaml 解析验证所有 4 个 modified 文件**

```bash
python3 -c "
import yaml
for f in [
    'docs/agents/workflow/DESIGN.md',
    'docs/agents/workflow/queue.md',
    'docs/agents/workflow/state.md',
    'docs/superpowers/plans/2026-05-16-lark-gateway.md',
]:
    content = open(f).read()
    fm = content.split('---')[1]
    parsed = yaml.safe_load(fm)
    assert parsed.get('status') == 'forward-looking', f'{f} missing forward-looking'
    print(f'{f}: OK')
"
```

期望：4 行 OK 输出，exit 0。

- [ ] **Step 9: 跑 grep 验证 status 标记覆盖**

```bash
grep -rl "status: forward-looking" docs/agents/workflow docs/superpowers/plans | wc -l
```

期望：**≥ 6**（4 文件 frontmatter + 2 个 README 内引用）。

如果 < 6，检查 README 是否在文本中提到 `status: forward-looking` 字符串（README 文本中应该至少出现一次该字符串作为说明，覆盖 grep）。

如果仍不达 6，需要 README 模板补一条引用：

```markdown
当前目录所有文件 frontmatter: `status: forward-looking`
```

- [ ] **Step 10: 跑 git diff --check**

```bash
git diff --check
```

期望：exit 0。

- [ ] **Step 11: 把改动加入暂存区 + 检查净行数**

```bash
git add docs/agents/workflow/DESIGN.md docs/agents/workflow/queue.md docs/agents/workflow/state.md docs/superpowers/plans/2026-05-16-lark-gateway.md docs/agents/workflow/README.md docs/superpowers/plans/README.md
git diff --cached --stat
```

期望：6 文件，净行数 < 100，不触发 M3 自检。

- [ ] **Step 12: Commit**

```bash
git commit -m "$(cat <<'EOF'
docs: lark-gateway 设计稿与 agent workflow 协议标 forward-looking

- DESIGN.md（无 frontmatter）→ 新加 status: forward-looking
- queue.md（已有 frontmatter）→ merge 加 status / written_at / activated_by / note
- state.md（已有 frontmatter）→ 同上 merge
- 2026-05-16-lark-gateway.md（无 frontmatter）→ 新加 status: forward-looking
- 新增 docs/agents/workflow/README.md 声明目录性质
- 新增 docs/superpowers/plans/README.md 声明 plan 目录性质

激活条件指向 workflow-evolution.md §9。
承接 spec da1b666 + 86cdedf；落地 C1。
EOF
)"
```

- [ ] **Step 13: 复核 commit 落地**

```bash
git log --oneline -3
git status --short
```

期望：
- 最近 3 个 commit 分别是 T3 / T2 / T1
- `git status --short` 输出为空

T3 完成。STOP。

---

## 整个 Plan 完成后的实战指标验证

按 spec §9，下一轮 AI 进 atomic-task skill 时应满足以下 5 项：

| # | 指标 | 验证方式 |
|---|---|---|
| 1 | AI 不读 `roadmap.md` 找候选 | 观察下一轮 atomic-task 跑时是否触发 roadmap.md Read |
| 2 | AI 读 `backlog.md` 时使用 type 列匹配 DoD 形式 | 观察是否引用对照表 |
| 3 | AI 遇到不可机器验证的 DoD 拒认领 | 故意往 backlog 加一条"沉淀 N 条价值"任务，AI 应拒 |
| 4 | AI commit 前对净行数 > 1000 主动触发自检 | 观察大 commit 行为 |
| 5 | AI 读到 `status: forward-looking` 文件时跳过 | 观察 lark-gateway / workflow-evolution 是否被立任务 |

任一失败 → 立 repair task；连续 2 项失败 → 视为脚手架补强未达成，需重新设计。

---

## Self-Review 反向检查 vs Spec

**Spec coverage 检查**：

| Spec 章节 | 对应 Task | 验证 |
|---|---|---|
| §3.1 M1 候选池闭口 | T2 Step 4（backlog 认领规则 +1 条）+ T2 Step 6（SKILL.md rules +1 条） | ✅ |
| §3.2.1 backlog 加 type 列 | T2 Step 2 / 3 | ✅ |
| §3.2.2 type 对照表 | T2 Step 7（SKILL.md 新增段） | ✅ |
| §3.2.3 DoD 工程谓词规则 | T2 Step 6（SKILL.md rules +1 条） | ✅ |
| §3.3 M3 commit 误提交自检 | T2 Step 6（SKILL.md rules +1 条） | ✅ |
| §3.4.1 4 文件 frontmatter | T3 Step 1 / 2 / 3 / 4 | ✅ |
| §3.4.2 2 README | T3 Step 5 / 6 | ✅ |
| §6.T1 校正 now.md | Task T1 全程 | ✅ |

**Placeholder scan**：无 TBD / TODO / "implement later"；OQ1 / OQ2 已在 Prerequisites 段写明默认与替代方案；每 step 都有完整文本 / 命令 / 期望输出。

**Type consistency**：M1 / M2 / M3 三处规则在 T2 Step 6 用相同措辞；对照表中 7 种 type 与 T2 Step 2 / 3 中 backlog 行的 type 字段一致（skill / docs / design 三种实际出现）。

无 placeholder，无未补 spec 项，类型一致。**Self-review 通过**。
