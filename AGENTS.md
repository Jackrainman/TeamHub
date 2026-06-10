# AGENTS Rules

## 1. Project Overview
- Teamhub — 机器人战队的 **制度化进度治理系统 / Team Hub**（D-026 reframe），非单体 issue tracker、非纯监控控制台。
- **魂**：跨组协调 + 管进度 + 不让某些人干太多；当进度卡住、当事人羞于开口时，靠制度让系统替他把卡点说出来，并提前暴露"没人去满足的隐含依赖"，让所有人动起来。
- **四层架构**（每层只依赖下层）：①数据真相层（项目/赛季 · 成员+角色+资历 · 可配置组织树 · 任务+依赖 DAG · 前置需求 Need）→ ②规则/治理层（卡点 / 过载 / 沉默 / 升级判定——产品的魂）→ ③展示/汇报层（动态最短任务周期图 · 给老师的自动汇报）→ ④触点/集成层（飞书是脸 · Hermes / 小龙虾 / Claude Code / Git adapter）。
- **路线 A**：系统关系库是真相，飞书只做汇报 / 通知 / check-in 出口，不双写（见 §5 G2）。已建 Hub 壳子（hub-server / hub-contracts / hub-console）作为触点/集成 + 展示底座保留，治理域是新增核心。
- Skill / Bridge / Trail 仍是能力 facet：Skill = 当下问题；Bridge = 当前协作状态；Trail = 过去经验沉淀。
- **成长轴（D-027，与治理主干并列）**：机器人知识图谱 / 知识树让新人看见"我作为某组成员要学什么、能往哪扩展"，是"系统给得比拿得多"（A3）的正面载体；与中央依赖图形成"项目的未来 / 人的未来"双图。MVP = 任务知识标注，树从标注长出；飞书订阅推送相关知识 / 缺口。
- v0.3.0（原 SPA + SQLite 版本）已冻结，仅致命补丁；当前模式 `governance_design`。

## 2. Workspace Rules
- `docs/planning/`：唯一当前战况源 = `now.md`；机器可读派生索引 = `agent-state.json`；候选池 = `backlog.md`；长期 ADR = `decisions.md`；长期愿景 = `roadmap.md`。
- **AI 默认读取链**：`AGENTS.md` + `docs/planning/now.md` + `docs/planning/agent-state.json` + `git status --short` + `git log --oneline -5`。`agent-state.json` 只是最小活状态缓存（`mode/stage/current_task/frontier/blocked/open_for_decision`），不是权威事实源；任务索引 / 决策 / 读取规则一律去权威源（`backlog.md` / `decisions.md` / 本节），不在 json 里重复。若与权威源冲突，以权威源为准并先修缓存。
- 条件读取：选任务 / 校验 frontier 时读 `backlog.md`；阶段切换 / 长期争议时读 `decisions.md`；长期愿景争议时读 `roadmap.md`；命中 Team Hub 后端 / 控制台 / adapter / Git 中枢时读 `docs/design/team-hub-concept.md` 与 `docs/design/team-hub-stack-decision.md` 的相关段落。
- `docs/planning/visuals.md`：可视化参考（中央枢纽 / 数据流 / 能力速览等图表）。**不在默认读取链**；仅在需要查图时按需读取；**仅在用户明确要求"更新可视化文档"时修改**。
- `docs/archive/`：历史归档，默认不读，仅在历史追溯命中时读取；子目录清单见 `docs/archive/README.md`（含 v0.3 精华 `v0.3-closeout/PROBEFLASH-V03-ESSENCE.md`）。当前 Team Hub 产品定义在 `roadmap.md §0` + `decisions.md D-024/D-026` + `docs/design/team-hub-concept.md`。
- `.agents/skills/`：可执行流程规则；权威源；一个 skill 只做一件事。**只放当前 active 触发面的 skill。**
- `.agents/skill-library/`：v0.3 退役但保留追溯价值的 skill 冷藏架；**不**被 `.agents/hooks/sync-skills.sh` 同步、**不**进 Claude Code 触发面。复活路径见 `.agents/skill-library/README.md`。
- `.debug-archive/`：Skill 产出的 debug 归档 markdown(本地活跃,`.gitignore` 覆盖,不入库);Trail 未来的数据源。
- `docs/design/team-hub-concept.md`：Team Hub 当前概念设计与边界事实源；涉及大后端 / 控制台 / adapter / Git 中枢方向时优先读取。
- `README.md`：对外门面，不是内部事实源。
- 禁止把临时思考散落到仓库根目录或无关路径。
- `xju-feiyue/`（参考项目，已不在磁盘；前端分层经验已入 `team-hub-stack-decision.md §3.2`）：若再次本地复制仅作架构/UI 参考，禁止搬入其社区业务模型（`.gitignore` 已忽略）。
- **lark-cli skills vs Teamhub skills 命名预警**：飞书官方 CLI `@larksuite/cli` 自带 `skills/` 目录（24 个 AI Agent Skills，是"教 Agent 操作飞书 OpenAPI"的指南）。本仓库的 `.agents/skills/`（debug-checklist 等）是"调度领域 skill"。字面同名但完全不同体系，**不会**互通也**不应**互相 import。讨论时全名引用区分（"lark-cli 的 skills/" vs "Teamhub `.agents/skills/`"）。

## 3. Secrets Handling
- AI / Agent 禁止读取、搜索、打印、总结、复制或提交任何真实密钥文件，包括 `/home/rainman/.config/probeflash/*.env`、仓库内 `.env` / `.env.*` / `.secrets/**` / `*.key` / `*secret*` / `*api-key*`。
- 不得要求用户粘贴 API key；真实 provider key 只能由用户手动写入仓库外文件或 shell env。
- 代码只能通过 server 进程环境变量读取 provider key（如 `process.env.DEEPSEEK_API_KEY`）；禁止把 key 放入浏览器 / localStorage / planning / README / 日志 / commit message。
- 真实 provider smoke 必须由用户本地执行；AI 不读密钥文件来"验证配置"。
- `@larksuite/cli` 的 `lark config init` / `lark auth login` / token store（`~/.config/...` 或 keychain）全部由用户线下执行；AI 不读其凭证存储，只跑诊断与只读 API（`lark schema` / `lark doctor` / `lark api *.list/get/search`）。写入类 `lark api`（`*.create/update/delete/patch`）需用户一次一批审批后 AI 才可代跑。

## 4. Modes
- `governance_design`（**当前生效**，D-026）：把 Teamhub 落为制度化进度治理系统——按四层架构推进数据真相层实体（项目/赛季 · 成员角色资历 · 组织树 · 任务依赖 · Need）、规则/治理层、展示/汇报层。每个代码任务先有接口契约或 schema；adapter / 真实飞书 / 服务器写入 mock-first，真实凭证与写入需用户线下配置或审批。**待拍板开放项**：架构走法（治理为主轴 vs 平行模块）——深设计文档先搭骨架留待定，不阻塞宪法/定位/planning 推进。（提醒可见范围/送达模型已于 2026-06-10 拍定，见 `decisions.md` D-026 后续；成长轴/机器人知识图谱见 D-027。）
- 历史模式（`team_hub_shell_design` / `post_pivot_self_dogfood` / `server_storage_migration` / `delivery_priority`）均已被 D-024/D-026 覆盖或冻结，详见 `decisions.md`，不再驱动新工作（Hub 壳子作为底座保留）。
- 模式切换必须先更新 `now.md.mode`，再选任务。

## 5. Design Constitution（设计宪法）
> 来源：D-018 / D-019 确立，**D-026 重构为三层并继承/演进**。任何治理 / Skill / Bridge / Trail / 新 facet 设计必须先通过本节检查。
> 三层：**核心原则 C** 跨形态不变；**治理专属原则 G** 是当前"制度化进度治理系统"的魂；**反监视四原则 A** 是 C2/G2 的执行细则。下游按 `C/G/A` 编号引用（旧 `#1–#5` 映射 `#1→C1 … #5→C5`）。

### 核心原则（C1–C5，产品根基）
- **C1 填写成本必须由当下回报抵消**。录入是兜底；状态优先从"人本就在飞书/Git 做的动作"派生，禁止让人记录"过去发生了什么"。
- **C2 让协作摩擦可见，让产能不可比**。允许"任务卡了 3 天需要支援"；**任何角色（队员 / 组长 / super admin / 老师）都不得见人与人完成量排名**。
- **C3 小作坊优先**。5–15 人团队；做**轻量**角色 + 可配置组织树 + 轻量进度治理，**不做**完整 RBAC / 多租户 / 大型项目管理系统。
- **C4 AI 是转译者与协作促成者，不替代实物验证与人的决定**。AI 输出是检查单 / 提示 / 暴露的需求，不是命令、不是替人拍板。
- **C5 只为上游数据流自然存在的场景构建**。"没有河流的水处理厂"——治理状态必须有自然上游（飞书动作 / Git 提交 / check-in），禁止要求队员凭空打卡。

### 治理专属原则（G1–G5，产品的魂）
- **G1 制度化替代凭感觉**。进度真相靠制度判定（超期 / 静默 / 依赖未满足），系统替羞于开口的人说出卡点。
- **G2 系统是大脑、飞书是脸**。真相在系统关系库；飞书只做汇报 / 通知 / check-in 出口；**禁止同一件活既在飞书干又在系统填（双写）**。
- **G3 暴露需求/缺口而非督促进度**。提前暴露隐含依赖、让所有人动起来、避免"我以为"；前置需求 Need 是一等公民。
- **G4 无硬截止，只轻提醒**。不设 deadline；沉默→一条可一键回的轻提醒；系统不猜原因。
- **G5 对资历弱者更主动兜底**。低资历 / 大一更主动提示"这步通常找 X 组要 Y"、更鼓励口吻、"替你说"权重更高。

### 反监视四原则（A1–A4，C2/G2 的执行细则）
- **A1** 暴露"需求/缺口"，不暴露"人慢了"。
- **A2** 提醒先私下给本人、帮忙口吻；老师 / 汇报只看项目级。
- **A3** 系统给得比拿得多（AI 知识 + 找对人 + **帮你开口：AI 起草、发送键本人按**）；正面给予是"观察你"的资格来源，**成长轴 / 知识树（D-027）是其主要载体**。
- **A4** 无 deadline，只轻推；**对轻提醒的沉默不升级为对人的负面信号**，只有"Need 持续无人认领"作为**事**（不挂人名）升级为缺口可见。配套两条 AI 边界：**建议不判定**（"疑似卡住"对人只出疑问句、不出结论）、**检索不评价**（知识 / 历史 / 找对人放开做，因检索过去不评价现在的人）。详见 `decisions.md` D-026 后续（2026-06-10）。

## 6. Atomic Task Discipline
- 同一时刻只允许一个原子任务处于执行中。
- Completion gate 三件套：最小验证通过 + `now.md` planning sync + 单任务 commit。三者全齐才允许选下一任务。
- planning sync = 覆盖式更新 `now.md`（current_task / frontier / blocked / 最近完成裁剪到 5 条）并同步 `agent-state.json` 活状态字段；候选池增删改名重排时同步 `backlog.md`；长期决策变化时追加 `decisions.md`。
- 禁止凭旧计划机械顺推；禁止 commit 后自动续推下一任务，必须重新走 `atomic-task` skill 第 1 步。
- 完整循环规则见 `.agents/skills/atomic-task/SKILL.md`。

## 7. Verify Matrix
| 任务类型 | 必跑 |
|---|---|
| docs / planning / skills-only | `git diff --check`；`now.md` yaml 可解析；`grep` 旧路径引用一致 |
| hub 后端 / 契约 / 控制台 | `cd apps/hub-contracts && npm run verify:all`；`cd apps/hub-server && npm run verify:all`；`cd apps/hub-console && npm run verify:all`；`git diff --check` |
| lark 接入 / lark-toolkit / pf-skills | `cd apps/lark-toolkit && npm run verify:all`；`cd apps/pf-skills && npm run verify:all`；`cd apps/lark-gateway && npm run verify:all`；`git diff --check` |
| compose / 部署冒烟 | `scripts/verify-hub-compose.sh`（需 Docker/Compose 可用） |
| 任何任务（共性） | `git diff --check`；`bash .agents/scripts/verify-skills-sync.sh` |
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
- 漂移哨兵：`bash .agents/scripts/verify-skills-sync.sh`；不一致 exit 非零并提示修复命令。哨兵只比对 `.agents/skills/` ↔ `.claude/skills/`，**不**扫 `.agents/skill-library/`。
- sandbox 设计史与详细原理见 `docs/archive/pre-slim/status.md` §9-§18（按需追溯，不在每轮链）。

## 10. Truthfulness
- Skill 产出（检查单、追记、归档 entry）必须符合对应 SKILL.md 中的输出 schema；失败要记录错误、保留原始输入、只重生无效结构段。
- `.debug-archive/*.md` 归档后必须读回验证；验证失败时创建 repair task，不得标记"已归档完成"。
- 工具调用必须检查 exit code；失败不可静默吞掉。
- 禁止把"规划中"写成"已完成"；禁止把占位壳说成真实功能；禁止把 `localStorage` 静默 fallback 当作"服务器化成功"。
- 禁止把 Skill 的"检查单/建议"说成"硬件验证结论"或"命令"。AI 输出是提示，不是代替实物测试的判断。
