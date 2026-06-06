# AGENTS Rules

## 1. Project Overview
- Teamhub — 嵌入式 / 机器人调试现场的 **战队中枢 / Team Hub**，非单体 issue tracker。
- 当前形态（D-024）：飞书 / Hermes / 小龙虾 / Claude Code 等入口 → Teamhub Hub 大后端 → 前端可视化后端控制台；Hub 负责事件路由、adapter registry、Bridge 状态、Git/artifact 索引、audit/config/health。
- Skill / Bridge / Trail 仍是能力 facet：Skill = 当下问题处理；Bridge = 当前协作状态；Trail = 过去经验沉淀。但它们现在挂在 Team Hub 架构下，不再要求 markdown-only / no-server 作为硬边界。
- v0.3.0（原 SPA + SQLite 版本）已冻结，仅致命补丁；当前模式 `team_hub_shell_design`。

## 2. Workspace Rules
- `docs/planning/`：唯一当前战况源 = `now.md`；机器可读派生索引 = `agent-state.json`；候选池 = `backlog.md`；长期 ADR = `decisions.md`；长期愿景 = `roadmap.md`。
- **AI 默认读取链**：`AGENTS.md` + `docs/planning/now.md` + `docs/planning/agent-state.json` + `git status --short` + `git log --oneline -5`。`agent-state.json` 只是索引/缓存，不是权威事实源；若与 `now.md` / `backlog.md` / `decisions.md` 冲突，以权威源为准并先修索引。
- 条件读取：选任务 / 校验 frontier 时读 `backlog.md`；阶段切换 / 长期争议时读 `decisions.md`；长期愿景争议时读 `roadmap.md`；命中 Team Hub 后端 / 控制台 / adapter / Git 中枢时读 `docs/design/team-hub-concept.md` 与 `docs/design/team-hub-stack-decision.md` 的相关段落。
- `docs/planning/visuals.md`：可视化参考（中央枢纽 / 数据流 / 能力速览等图表）。**不在默认读取链**；仅在需要查图时按需读取；**仅在用户明确要求"更新可视化文档"时修改**。
- `docs/archive/`：历史归档（含 `pre-slim/`、`v0.2-closeout/`、`v0.3-pivot/`；v0.3 产品介绍与领域模型图均已归档至 `v0.3-pivot/product/`），默认不读，仅在历史追溯命中时读取。当前 Team Hub 产品定义在 `roadmap.md §0` + `decisions.md D-024` + `docs/design/team-hub-concept.md`。
- `.agents/skills/`：可执行流程规则；权威源；一个 skill 只做一件事。**只放当前 active 触发面的 skill。**
- `.agents/skill-library/`：v0.3 退役但保留追溯价值的 skill 冷藏架；**不**被 `.agents/hooks/sync-skills.sh` 同步、**不**进 Claude Code 触发面。复活路径见 `.agents/skill-library/README.md`。
- `.debug-archive/`：Skill 产出的 debug 归档 markdown(本地活跃,`.gitignore` 覆盖,不入库);Trail 未来的数据源。
- `docs/design/team-hub-concept.md`：Team Hub 当前概念设计与边界事实源；涉及大后端 / 控制台 / adapter / Git 中枢方向时优先读取。
- `README.md`：对外门面，不是内部事实源。
- 禁止把临时思考散落到仓库根目录或无关路径。
- `xju-feiyue/`：本地复制的参考项目，已进 `.gitignore`；只可作为架构 / UI / 局部代码模式参考，禁止整体提交或把其社区业务模型搬入 Teamhub。
- **lark-cli skills vs Teamhub skills 命名预警**：飞书官方 CLI `@larksuite/cli` 自带 `skills/` 目录（24 个 AI Agent Skills，是"教 Agent 操作飞书 OpenAPI"的指南）。本仓库的 `.agents/skills/`（debug-checklist 等）是"调度领域 skill"。字面同名但完全不同体系，**不会**互通也**不应**互相 import。讨论时全名引用区分（"lark-cli 的 skills/" vs "Teamhub `.agents/skills/`"）。

## 3. Secrets Handling
- AI / Agent 禁止读取、搜索、打印、总结、复制或提交任何真实密钥文件，包括 `/home/rainman/.config/probeflash/*.env`、仓库内 `.env` / `.env.*` / `.secrets/**` / `*.key` / `*secret*` / `*api-key*`。
- 不得要求用户粘贴 API key；真实 provider key 只能由用户手动写入仓库外文件或 shell env。
- 代码只能通过 server 进程环境变量读取 provider key（如 `process.env.DEEPSEEK_API_KEY`）；禁止把 key 放入浏览器 / localStorage / planning / README / 日志 / commit message。
- 真实 provider smoke 必须由用户本地执行；AI 不读密钥文件来"验证配置"。
- `@larksuite/cli` 的 `lark config init` / `lark auth login` / token store（`~/.config/...` 或 keychain）全部由用户线下执行；AI 不读其凭证存储，只跑诊断与只读 API（`lark schema` / `lark doctor` / `lark api *.list/get/search`）。写入类 `lark api`（`*.create/update/delete/patch`）需用户一次一批审批后 AI 才可代跑。

## 4. Modes
- `team_hub_shell_design`（当前生效）：构建“战队中枢”概念设计、接口边界、大后端壳子、前端控制台壳子、adapter 插件位。允许写新 Hub 后端 / 控制台代码，但每次必须先有接口契约或 schema；真实 Hermes / 小龙虾 / Claude Code / 服务器写入需用户线下配置或审批。
- `post_pivot_self_dogfood`（已被 D-024 覆盖）：备赛期自用 dogfood，只认领 Skill 反复迭代 + 飞书架构验证。不动 v0.3 现有代码。禁止夜跑。冷静期 48–72h。仅作为历史模式保留。
- `server_storage_migration`（已冻结）：v0.3 阶段存储迁移与服务器化。仅作为历史 ADR 保留，不再驱动新工作。
- `delivery_priority`（已冻结）：交差优先。仅作为历史 ADR 保留。
- 模式切换必须先更新 `now.md.mode`，再选任务。

## 5. Design Constitution（设计宪法）
> 来源：D-018 / D-019，D-024 继续继承。任何 Team Hub / Skill / Bridge / Trail 设计必须先通过这 5 条检查。
1. **填写成本必须由当下回报抵消**。只允许"当下填、当下受益"的输入，禁止让人记录"过去发生了什么"。
2. **让协作摩擦可见，让产能不可比**。允许展示"任务卡了 3 天需要支援"；禁止展示人与人之间的完成量排名。
3. **小作坊优先**。目标用户是 5–15 人团队，不是跨部门大组织。
4. **AI 是隐式经验的翻译，不是硬件验证的替代**。Skill 输出是检查单/提示，不是命令。
5. **只为上游数据流自然存在的场景构建**。"没有河流的水处理厂"——再精致的下游处理也没用，如果上游没有数据自然产生。

## 6. Atomic Task Discipline
- 同一时刻只允许一个原子任务处于执行中。
- Completion gate 三件套：最小验证通过 + `now.md` planning sync + 单任务 commit。三者全齐才允许选下一任务。
- planning sync = 覆盖式更新 `now.md`（current_task / frontier / blocked / 最近完成裁剪到 5 条）并同步 `agent-state.json` 索引；候选池增删改名重排时同步 `backlog.md`；长期决策变化时追加 `decisions.md`。
- 禁止凭旧计划机械顺推；禁止 commit 后自动续推下一任务，必须重新走 `atomic-task` skill 第 1 步。
- 完整循环规则见 `.agents/skills/atomic-task/SKILL.md`。

## 7. Verify Matrix
| 任务类型 | 必跑 |
|---|---|
| docs / planning / skills-only | `git diff --check`；`now.md` yaml 可解析；`grep` 旧路径引用一致 |
| deploy docs / deploy verify | `git diff --check`；`cd apps/server && npm run verify:deploy-prep` |
| server script / package | `cd apps/server` 任务对应 verify + `verify:deploy-prep`；`cd apps/desktop && npm run typecheck && npm run build && npm run verify:all` |
| desktop UI / core workflow / search | `cd apps/desktop && npm run typecheck && npm run build && npm run verify:all`；任务对应 `verify:*`；`git diff --check` |
| data repair / integrity | `cd apps/server && npm run verify:data-integrity-check`；`cd apps/desktop && npm run verify:data-repair-task-generation`；同上 desktop 必跑 |
| lark-cli 接入 / lark-toolkit / pf-skills | `cd apps/lark-toolkit && npm run verify:all`；`cd apps/pf-skills && npm run verify:all`；`cd apps/lark-gateway && npm run verify:all`；`git diff --check` |
| 任何任务（共性） | `git diff --check`；`cd apps/desktop && npm run verify:skills-sync` |
- exit code != 0 一律失败；未跑的必跑项必须在 commit message 或 `now.md` 中如实标注原因，不得静默跳过。
- 架构类任务（storage / repository / closeout / adapter / backend scaffold）必须有任务相关代码级 + 契约级验证；只有分析结论一律视为未完成。

## 8. Night Run / Unattended Mode
- 允许：docs / planning 整理、`now.md` 对齐、本地代码功能、本地 verify / smoke 脚本、backup/export 本地功能、AI-ready UI / prompt schema、code context bundle CLI、小型局部重构。
- 禁止：SSH 写入服务器、`sudo`、`systemd`、写 `/opt`、操作 80/443、真实服务器部署、release/tag 删除、destructive migration、删除用户数据、真实生产数据修改、大规模 UI 重构、引入大型框架、需要用户拍板的产品方向、任何无法本地自动验证的任务。
- 停止条件：`git status --short` 不干净且无法归类；typecheck/build/verify 失败且无法在当前边界内修复；命中 SSH/sudo/systemd/外部账号/API key/服务器/数据迁移；planning 与代码冲突且无法判断谁 stale；任务边界不清；连续两次修复仍失败；命令出现权限/网络/端口冲突且原因不明。
- 当 `now.md.current_task` 命中真实服务器写入（DATA-01 等），夜跑必须 blocked，等用户白天确认。
- 输出：夜跑结束必须输出已完成任务、commit、验证结果、未完成任务、阻塞点、下一步最小动作、是否需用户白天介入。

## 9. Skills Mirror Rule
- 唯一权威源：`.agents/skills/<name>/SKILL.md`，由 Codex / OpenCode / Claude Code 三方共用。
- `.claude/skills/` 是 Claude Code 读取镜像，由 `.agents/hooks/sync-skills.sh`（PostToolUse hook）在 Edit/Write 命中 `.agents/skills/**` 时自动复制；**禁止手动编辑 `.claude/skills/`**。
- 新增 skill：在 `.agents/skills/<new-name>/SKILL.md` 创建即可（用 Edit/Write 工具触发 hook；用 vim/shell 重定向后需手动 `cp -rp .agents/skills/. .claude/skills/`）。
- 删除 skill：删 `.agents/skills/<name>/` 后**必须**手动 `rm -rf .claude/skills/<name>`；hook 只复制不删。`.claude/skills/` 在 Claude Code sandbox 的 denyWithinAllow 列表里，需用 `dangerouslyDisableSandbox: true` bypass 一次。
- **退役而非删除**：把 v0.3 时代或不再 active 但有保留价值的 skill 从 `.agents/skills/` `git mv` 到 `.agents/skill-library/`；library 不被 hook 同步、不被 `verify:skills-sync` 检查、不进 Claude 触发面。详细操作见 `.agents/skill-library/README.md`。
- 漂移哨兵：`cd apps/desktop && npm run verify:skills-sync`（也含在 `verify:all`）；不一致 exit 非零并提示修复命令。哨兵只比对 `.agents/skills/` ↔ `.claude/skills/`，**不**扫 `.agents/skill-library/`。
- sandbox 设计史与详细原理（为什么不能 symlink、bwrap EISDIR、hardlink VS Code rename 漂移、PostToolUse 在沙箱外执行）见 `docs/archive/pre-slim/status.md` §9-§18；本节只是操作纪要。

## 10. Truthfulness
- 已冻结实体（IssueCard / InvestigationRecord / ErrorEntry / ArchiveDocument）仍按 v0.3 schema 校验，仅致命补丁时生效。
- Skill 产出（检查单、追记、归档 entry）必须符合对应 SKILL.md 中的输出 schema；失败要记录错误、保留原始输入、只重生无效结构段。
- `.debug-archive/*.md` 归档后必须读回验证；验证失败时创建 repair task，不得标记"已归档完成"。
- 工具调用必须检查 exit code；失败不可静默吞掉。
- 禁止把"规划中"写成"已完成"；禁止把占位壳说成真实功能；禁止把 `localStorage` 静默 fallback 当作"服务器化成功"。
- 禁止把 Skill 的"检查单/建议"说成"硬件验证结论"或"命令"。AI 输出是提示，不是代替实物测试的判断。
