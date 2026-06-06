# Backlog（Team Hub）

> 一行一候选；状态字段：`current` / `pending` / `done` / `frozen` / `decision-needed` / `superseded-by-D024`。当前唯一任务见 `now.md`，长期路线见 `roadmap.md`，长期决策见 `decisions.md`。pre-pivot backlog 历史快照 → `docs/archive/v0.3-pivot/backlog.md`。

## 认领规则（Team Hub）

1. 每次只认领一个原子任务，未 commit 不进入下一任务。
2. 当前允许的任务类型：**Team Hub 概念 / 技术栈拍板 / Hub 后端壳子 / 控制台壳子 / adapter mock-first / 飞书接入整合**。真实 Hermes / 小龙虾 / Claude Code / 服务器写入必须用户线下配置或审批。
3. ProbeFlash v0.3 已冻结：不再认领 TECH / AIREADY / REALAI / CODECTX / DEP / DATA / UI / CORE / SEARCH 任务；致命补丁除外。
4. 每个代码任务必须先有接口契约或 schema；控制台 UI 任务必须先有页面状态与 API mock 设计。
5. 候选池只在本文件；`roadmap.md` 不构成候选源。若 `now.md` frontier 项在本文件无对应行，视为脱节，必须先补本文件再认领；不允许"凭空 frontier"。

## P0 — Team Hub 壳子与接口（当前主线）

| 任务 | 状态 | type | 内容 |
|------|------|------|------|
| WORKFLOW-CONTEXT-SLIM-01 | done | docs | 已落地于 2026-06-06；新增 `docs/planning/agent-state.json` 作为机器可读派生索引，缩短 AI 默认读取链为 `AGENTS.md` + `now.md` + `agent-state.json` + git 状态；更新 `AGENTS.md` 与 `atomic-task` skill，明确 `backlog.md` / `decisions.md` / `roadmap.md` / Team Hub 设计文档按条件读取；DoD = `python3 -m json.tool docs/planning/agent-state.json` + `now.md` yaml 可解析 + `grep "agent-state.json" AGENTS.md .agents/skills/atomic-task/SKILL.md` + `git diff --check` + `verify:skills-sync` |
| HUB-CONCEPT-01 | done | design | 已落地于 2026-06-06；`docs/design/team-hub-concept.md`（status: stable，目标/非目标/总体架构/模块边界/业务模型 v0/API 草案/构建步骤/`xju-feiyue` 复用判断/技术栈分歧/工作流判断/后续候选队列）+ `decisions.md` D-024 + `.gitignore` 忽略 `xju-feiyue/` + planning/roadmap/AGENTS 同步；DoD = `test -f docs/design/team-hub-concept.md` + `grep "D-024" docs/planning/decisions.md` + `git diff --check` + `now.md` yaml 可解析 + `verify:skills-sync` |
| HUB-STACK-DECISION | done | design | 已落地于 2026-06-06；`docs/design/team-hub-stack-decision.md`（status: decided，Node/TypeScript 统一栈；新包 `apps/hub-server` / `apps/hub-console`；控制台借鉴 `xju-feiyue` 的 React/Vite/TanStack Query/Zod/shadcn 分层但业务重写；Docker Compose 硬要求；同镜像换 `.env`；生产 Postgres + SQLite fallback；artifact/log/firmware/rosbag 只做索引和 volume/外部存储边界；Forgejo 默认 Git 中枢；Ubuntu 20.04 过渡、22.04/24.04 公网建议；lark 三包接入；Hermes/小龙虾/Claude Code mock-first adapter）+ `decisions.md` D-025 + planning 同步；DoD = `test -f docs/design/team-hub-stack-decision.md` + `grep "D-025" docs/planning/decisions.md` + `git diff --check` + `now.md` yaml 可解析 + `verify:skills-sync` |
| HUB-BACKEND-SCAFFOLD | done | code | 已落地于 2026-06-07；新增 `apps/hub-server/` 独立 npm 包（Fastify + Zod + TypeScript strict），提供 `/health`、`/api/system/status`、`/api/adapters` mock endpoint、响应契约与 route contract tests；不接真实外部服务；DoD = `cd apps/hub-server && npm run verify:all` + `cd apps/desktop && npm run typecheck && npm run build && npm run verify:all` + `cd apps/server && npm run verify:deploy-prep` + `git diff --check` + `now.md` yaml 可解析 + `python3 -m json.tool docs/planning/agent-state.json` + `verify:skills-sync` |
| HUB-CONTRACTS-V0 | done | code | 已落地于 2026-06-07；新增 `apps/hub-contracts/` 共享契约包，导出 `HubEvent` / `AdapterDescriptor` / `BridgeMemberState` / `GitRepoRef` / `ArtifactRef` Zod schema、错误体与列表响应 schema、API contract fixtures；`apps/hub-server` 改用共享 adapter 契约与 fixtures；DoD = `cd apps/hub-contracts && npm run verify:all` + `cd apps/hub-server && npm run verify:all` + `cd apps/desktop && npm run typecheck && npm run build && npm run verify:all` + `cd apps/server && npm run verify:deploy-prep` + `git diff --check` + `now.md` yaml 可解析 + `python3 -m json.tool docs/planning/agent-state.json` + `verify:skills-sync` |
| HUB-CONSOLE-SCAFFOLD | done | code | 已落地于 2026-06-07；新增 `apps/hub-console/` 独立 npm 包（React/Vite/TypeScript、TanStack Query、lucide、共享契约 `file:../hub-contracts`），实现 API client、schema parse、mock/real backend split、总览页 mock 数据和运维控制台壳子；DoD = `cd apps/hub-console && npm run verify:all` + Playwright 桌面/移动截图 smoke + `cd apps/hub-contracts && npm run verify:all` + `cd apps/hub-server && npm run verify:all` + `cd apps/desktop && npm run typecheck && npm run build && npm run verify:all` + `cd apps/server && npm run verify:deploy-prep` + `git diff --check` + `now.md` yaml 可解析 + `python3 -m json.tool docs/planning/agent-state.json` + `verify:skills-sync` |
| HUB-COMPOSE-SCAFFOLD | pending（依赖 HUB-BACKEND-SCAFFOLD） | code | 新增 Dockerfile / Compose core profile，至少 `hub + postgres` 一键启动并通过 health smoke；不接真实公网、不写真实服务器 |
| HUB-LARK-WIRE | pending（依赖 HUB-CONTRACTS-V0） | code | 把现有 `apps/lark-gateway` / `apps/lark-toolkit` / `apps/pf-skills` 接到 Hub event/adapter 接口；mock-first，不要求 AI 执行真实飞书 smoke |
| HUB-ADAPTERS-MOCK | pending（依赖 HUB-CONTRACTS-V0） | code | 定义并实现 Hermes / 小龙虾 / Claude Code mock adapter；只暴露 health/capabilities/invoke stub，不接真实凭证 |
| HUB-GIT-FORGE-DESIGN | pending | design | 战队服务器 Git 中枢方案：Forgejo/Gitea/bare git 取舍、push/pull 工作流、artifact 不入 Git 策略、权限和备份边界；真实服务器操作另开任务审批 |

## P0 — Skill 自用闭环（备赛期窗口）

| 任务 | 状态 | type | 内容 |
|------|------|------|------|
| SKILL-01-DEBUG-CHECKLIST-V0_0_1 | done | skill | 已落地 v0.0.1 于 `f5df2bf`；DoD = SKILL.md 落地 + verify:skills-sync 通过（已闭环） |
| SKILL-02-DOGFOOD-NOTE | done | docs | 目录 + 模板已落地于 `f5df2bf`（`docs/dogfood/README.md`）；DoD = `test -f docs/dogfood/README.md`（已闭环）。"每次写 1-3 行"是行为非任务、"30 天后回看"是产品观察非工程谓词，按 M2 均不入原子任务 DoD |
| SKILL-03-PROMPT-ITERATION | pending（dogfood ≥ 30 天） | skill | 基于 dogfood 数据调 SKILL.md 的 prompt 模板；只动 SKILL.md，不动其他 |
| SKILL-04-PERSONAL-DAILY-SUMMARY | done | skill | 已落地 v0.0.1 于 `93dc7d0`；DoD = SKILL.md 落地 + verify:skills-sync 通过（已闭环） |
| SKILL-05-PRE-MATCH-CHECKLIST | done | skill | 已落地 v0.0.1 于 `9beb907`；DoD = SKILL.md 落地 + verify:skills-sync 通过（已闭环） |

## P0 — Skill 协议层（备赛期收敛）

| 任务 | 状态 | type | 内容 |
|------|------|------|------|
| SKILL-PROTOCOL-V1 | done | design | 已落地于 2026-05-24；`.agents/skills/PROTOCOL-v1.0.md`（协议本体 8 节）+ `docs/planning/skill-protocol-migration-gap.md`（3 个 active 业务 skill + 1 个流程类 skill 的迁移差距清单，3 个 skill 均评 B 级合规）+ `docs/design/D-023-skill-protocol-v1.md`（详细 ADR 草稿，status: draft）+ `decisions.md` D-023 聚合段；7 项验证全过含 `verify:skills-sync` exit 0；**不动**三个现有 SKILL.md（迁移留 SKILL-MIGRATION-V1-* 系列后续任务，待 D-023 升 DECIDED 后认领） |

## P0 — LARK 飞书接入（备赛期 stage_goal 之一）

| 任务 | 状态 | type | 内容 |
|------|------|------|------|
| LARK-02-CAPABILITY-MIRROR | done | research | 已落地于 2026-05-19；`docs/research/lark-api-capability.md` + `decisions.md` D-020；gemini 两份报告事实底座固化到工程仓库 |
| LARK-OSS-SCAN | done | research | 已落地于 2026-05-19；`docs/research/lark-oss-candidates.md` + decisions.md 追 D-020 后续结论；路径 A 最优基座 = `@larksuiteoapi/node-sdk`，路径 B ~250 行核心代码 |
| LARK-PATH-DECISION | done | docs | 用户已拍板（2026-05-19）路径 A（`@larksuiteoapi/node-sdk`），SDK 长期依赖 + Long Connection 模式 + "先接进去看看再优化"；decisions.md D-021 落终态 DECIDED |
| LARK-01-CONNECTOR-ARCH | done | design | 已落地于 2026-05-19；`docs/design/lark-connector.md` (status: draft) + decisions.md D-021 后续；Mock-first 设计，apps/lark-gateway/ 子包 7 模块，3 秒 ack 边界，4 字段 .env |
| LARK-03-MIN-INTEGRATION | done（代码部分） | code | 已落地于 2026-05-19；`apps/lark-gateway/` 子包（9 src + 3 test + 7 配置）；24/24 单测；typecheck/build/verify:all 全通；Mock-first 模式（claude/deepseek 抛错）；不引入 LLM SDK / 不调真实飞书 API。**真实飞书连通 smoke + 接入真实 LLM provider 留用户线下**（见 LARK-ONBOARD-GUIDE） |
| LARK-ONBOARD-GUIDE | done | docs | 已落地于 2026-05-19；`docs/research/lark-onboard-guide.md`（status: stable，11 节）；§0 前置自检 + §1-§3 飞书后台动作 + §4 .env 填写 + §5 本地 smoke 走查 + §6 可选接 LLM + §7 可选部署 + §8 排查 + §10 完成 checklist。**下一步全部在用户侧**（按 guide §0-§5 走通）；§1-§5 文字将在 LARK-CLI-05 改写为 lark-cli 路径（保留手填 fallback） |
| LARK-CLI-01 | done | code | 已落地于 2026-05-21（commit `e3e2069`）；`apps/lark-toolkit/` 子包（5 src + 4 test）；`boundary.route` 白名单（`im.v1.message.create` → sdk，其他 → cli）+ `cli-bridge` 懒检查 `lark --version` ≥ 1.x；13 单测全过；`@probeflash/lark-toolkit` |
| LARK-CLI-02 | done | code | 已落地于 2026-05-21（commit `ea41c74`）；`apps/pf-skills/` 子包（6 src + 3 test）；`createSkillDispatcher(cfg)` closure 捕获 mode + `dispatch(symptom)` 单参；mockChecklist 文案行为契约从 lark-gateway 迁移；9 单测全过；`@probeflash/pf-skills`，零运行时依赖 |
| LARK-CLI-03 | done | code | 已落地于 2026-05-21（commit `7c47f9a`）；`apps/lark-gateway/` 瘦身：新增 `ws-client.ts` + 删 `lark-client.ts` / `reply-sender.ts` / `skill-dispatcher.ts` + `message-handler.ts` 改 `Toolkit` + `SkillDispatcher` 注入 + `event-router.ts` 改 `buildEventDispatcher(cfg, toolkit, skills)` + `main.ts` 装配链 + `package.json` 加 `file:` 依赖；测试重写 10 + config 8 = 18/18 PASS；gateway src 9 → 7（net -175 行）；`verify:all` 三关 PASS |
| LARK-CLI-04 | done | docs | 已落地于 2026-05-21（commit `fef9e77`）；`decisions.md` 追 D-022 (DECIDED) + `docs/design/lark-connector.md` 重写 v2 (status: stable，三包架构 + createToolkit/createSkillDispatcher/buildEventDispatcher 接口契约 + §9 实现通道列) + `roadmap.md` §4 出站扩展通道标注 + `AGENTS.md` §2 lark-cli skills 命名预警 + §3 lark-cli auth boundary；git diff --check 干净 + frontmatter yaml 解析通过 |
| LARK-CLI-05 | done | docs | 已落地于 2026-05-21（commit `8b7bb5b`）；`docs/research/lark-onboard-guide.md` §0/§4/§5/§8/§10 改写加 lark-cli 路径并保留 fallback：§0 加 lark-cli 安装检查 + §4 拆 4.A (lark config init + lark auth login) 与 4.B (手填 fallback) 加二选一警告 + §5 拆 5.A/5.B/5.C + §8.5 加 lark-cli 排查 + §10 checklist 同步；DoD `grep "cp .env.example"` 仍命中 + `grep -c "lark config init\|lark auth login\|lark doctor"` = 8 + `git diff --check` 干净 + frontmatter yaml 解析通过 |
| LARK-CLI-06 | done | docs | 已落地于 2026-05-21（commit `4d5854a`）；`docs/research/lark-cli-dev-usage.md` 新建 (status: stable, 7 节：安装/鉴权/dev 自检/只读 API/写入审批/排查/与仓库关系/范围外) + `AGENTS.md` §7 Verify Matrix 加 lark-cli 接入行；DoD `test -f docs/research/lark-cli-dev-usage.md` + `grep "lark-cli 接入" AGENTS.md` 命中 + `git diff --check` 干净（exit 0） |

## P1 — Legacy Bridge 候选（被 Hub 覆盖，待重评）

| 任务 | 状态 | type | 内容 |
|------|------|------|------|
| BRIDGE-01-ROSTER-SCHEMA | superseded-by-D024 | docs | 旧 markdown-only ROSTER schema 被 Hub `BridgeMemberState` / `bridge` API 覆盖；不直接认领，必要时拆为 HUB-CONTRACTS/HUB-CONSOLE 子任务 |
| BRIDGE-02-PRINTABLE-V0 | superseded-by-D024 | design | 旧纯 markdown 打印模板暂不推进；若需要纸面检查单，后续作为 Hub 输出视图单独设计 |
| BRIDGE-03-READONLY-VIEWER | superseded-by-D024 | design | 旧只读 viewer 被 Hub 控制台覆盖；不再从 v0.3 UI 改造 |
| BRIDGE-04-WORKLOAD-VISIBILITY | superseded-by-D024 | design | 核心边界保留为 Hub BridgeState：只显示任务阻塞和求助，不显示人与人产能排名 |
| BRIDGE-05-RESEARCH-POOL | superseded-by-D024 | design | 待研究池/接棒与 Hub Bridge / Trail / 周报重叠，后续需在 Hub 信息模型内重评 |

## P2 — Legacy Trail 候选（被 Hub 覆盖，待重评）

| 任务 | 状态 | type | 内容 |
|------|------|------|------|
| TRAIL-01-VIEWER-DESIGN | superseded-by-D024 | design | Trail viewer 等 Hub event/archive/artifact 原料足够后重评，不再以 `.debug-archive ≥ 20` 作为唯一启动条件 |
| TRAIL-02-AUTO-WEAVE | superseded-by-D024 | design | 自动织摘要保留为 Hub Trail 能力位，暂不直接认领 |
| TRAIL-03-V03-UI-RETIRE | frozen | design | v0.3 UI 已冻结，不再规划改造为 Trail viewer |
| TRAIL-04-WEEKLY-SUMMARY | superseded-by-D024 | design | 周报能力保留，但输入源扩展为 Hub event/archive/artifact/git/飞书后再设计 |

## 已冻结（pre-pivot，不再认领）

- TECH-01..10 全部完成 → 冻结于 v0.3
- AIREADY-02..10：部分完成；剩余不再推进
- REALAI-05..09：等真实 provider key smoke；不再推进
- CODECTX-01..09：bundle CLI / repo connector；不再推进
- DEP-08：release update / rollback verify；不再推进
- DATA-01..07：服务器路径 backup/restore 复验；不再推进
- UI-GATE-06、UI-* 系列：不再推进
- CORE-07..09、SEARCH-05..06：不再推进
- 历史详情见 `docs/archive/v0.3-pivot/backlog.md`。
- 仅当 v0.3 出致命安全 / 数据破坏问题时再开补丁任务。

## Decision-needed

- 战队服务器 Git 中枢：Forgejo / Gitea / bare git 取舍，真实部署另开审批任务。
- Hermes / 小龙虾 / Claude Code adapter：真实接入方式、权限和运行边界需用户提供。

## 当前不做

- 不为 v0.3 加新功能、不重构、不 polish。
- 不按旧 markdown-only 方式启动 Bridge / Trail；它们已纳入 Team Hub 能力位。
- 不做人与人比较的产能排名 / 绩效统计 / 多租户 / 权限。任务阻塞可见（"这个任务卡了 3 天需要人帮"）≠ 产能排名（"张三比李四干得多"），前者允许。
- 壳子阶段不做 RAG / embedding / 炼丹 / 完整 Trail viewer。
- 不抢占服务器 80 端口；不升级系统 Node。
- 不读 / 搜索 / 提交真实 API key。
- 不依赖学校战队配合作为产品验证。
