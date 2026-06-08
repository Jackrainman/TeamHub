# Now

> 唯一当前战况源。Team Hub 方向已由 D-024 覆盖旧 markdown-only pivot。pre-pivot 历史快照 → `docs/archive/v0.3-pivot/`。

```yaml
mode: team_hub_shell_design
stage: Team Hub 战队中枢概念冻结 + 技术栈拍板完成；Hub 后端壳子、共享契约、控制台壳子、Compose 代码面与 Docker health smoke、Lark mock-first 接线与 AI mock adapter 已落地
stage_goal: 以 docs/design/team-hub-concept.md + docs/design/team-hub-stack-decision.md + D-024/D-025 为事实源，后续按 Node/TypeScript 统一栈推进 Compose 部署、lark/adapter 接入与 Git/artifact 索引；Skill/Bridge/Trail 作为 Hub 下能力位保留；AI 每轮默认读 AGENTS.md + now.md + agent-state.json + git 状态，backlog/decisions/roadmap/设计文档按条件读取
current_task: null  # HUB-COMPOSE-SMOKE 已闭环；下一步需重新走 atomic-task，从 frontier 选择唯一候选
frontier:
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

_无。HUB-COMPOSE-SMOKE 已闭环：Docker CLI/Compose 可用后，修复 Hub 镜像 runtime 依赖打包问题并跑通 `scripts/verify-hub-compose.sh`，已完成 Hub + Postgres build/up、health/API/static console smoke 与自动清理。下一步需重新走 atomic-task，从 frontier 选择唯一候选。_

## 架构定位（2026-06-06）

Teamhub = 战队中枢 / Team Hub；飞书 = 入口与通知层；Hermes / 小龙虾 / Claude Code / pf-skills = adapter 候选；战队服务器 = Git / artifact / 控制台运行层。详见 `docs/design/team-hub-concept.md`、`docs/design/team-hub-stack-decision.md`、D-024 与 D-025。旧 Skill/Bridge/Trail 三 facet 保留为能力分类，但实现边界从 markdown-only 升级为 Hub 后端 + 控制台 + 插件接口。

**产品定义锐化（2026-06-08, D-026 draft）**：定位从“运维 / 观测控制台”锐化为“**制度化进度治理系统**”——系统是大脑 / 飞书是脸、不双写、无硬截止只轻推、暴露需求不暴露人、中央视图 = 动态依赖图（务实版）、给新人安全网。事实源 `docs/design/team-hub-product-definition.md`（涉及产品形态 / 领域模型 / 中央视图 / 飞书·Git 边界时优先读）。§7 待定项待逐条拍板。

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

- 2026-06-08 HUB-PRODUCT-DEFINITION-V0 — 与用户讨论后沉淀产品定义：新增 `docs/design/team-hub-product-definition.md`（status: draft，产品意义 / 五原则 / 核心数据模型 / 中央依赖图务实版 / 反监视四原则 / 四层架构 / 已定 vs 待定）+ `decisions.md` D-026（draft，演进 D-024，正式承认加角色权限 + 轻量项目管理 + Bridge 扩展）。定位锐化为“制度化进度治理系统”：系统是大脑 / 飞书是脸、不双写、无硬截止只轻推、暴露需求不暴露人、给新人安全网。§7 待定项（角色权限 / 提醒规则 / AI 边界 / 提醒可见范围）待用户逐条拍板后升 stable。验证：`git diff --check`、`now.md` yaml 可解析、`cd apps/desktop && npm run verify:skills-sync`。
- 2026-06-07 HUB-CONSOLE-PREVIEW-SCRIPT — 新增 root `scripts/preview-hub-console.sh` 与 `apps/hub-console` `preview:local` 入口；脚本支持默认 mock preview，也可通过 `TEAMHUB_API_BASE` 切到 real API preview；验证：`bash -n scripts/preview-hub-console.sh`、`cd apps/hub-console && npm run verify:all`、`cd apps/desktop && npm run verify:skills-sync`、`git diff --check`。
- 2026-06-07 HUB-COMPOSE-SMOKE — Docker 最终验证闭环：修复 root `Dockerfile` runtime 阶段只安装 `apps/hub-server` 生产依赖、未安装 `apps/hub-contracts` 生产依赖导致的 `ERR_MODULE_NOT_FOUND: zod`；移除未使用的 Dockerfile frontend syntax directive，避免额外拉取 `docker/dockerfile:1.7`；`scripts/verify-hub-compose.sh` 已在 Docker 29.5.2 / Compose v5.1.4 下通过，完成 Hub + Postgres build/up、`/health`、`/api/system/status` 与静态控制台 smoke，并自动清理临时容器和卷。环境注记：本机访问 Docker Hub 出现 TLS EOF，验证前通过 `public.ecr.aws/docker/library` 预拉 `node:24-bookworm-slim` / `postgres:16-alpine` 并打本地同名 tag；项目代码不依赖该 registry。验证：`scripts/verify-hub-compose.sh`、`cd apps/hub-contracts && npm run verify:all`、`cd apps/hub-server && npm run verify:all`、`cd apps/hub-console && npm run verify:all`、`cd apps/desktop && npm run typecheck && npm run build && npm run verify:all`、`cd apps/server && npm run verify:deploy-prep`、`git diff --check` 均通过。
- 2026-06-07 HUB-ADAPTERS-MOCK — AI mock adapter endpoint 落地：`apps/hub-contracts` 新增 `AdapterHealthResponse` / `AdapterCapabilitiesResponse` / `AdapterInvokeRequest` / `AdapterInvokeResponse` schema、fixtures 与 schema 测试；`apps/hub-server/src/mock-ai-adapters.ts` 定义 Hermes / 小龙虾 / Claude Code mock adapter helper；Hub server 暴露 `GET /api/adapters/:id/health`、`GET /api/adapters/:id/capabilities`、`POST /api/adapters/:id/invoke`，仅支持三类 mock AI adapter，其他 adapter 返回标准 404；不接真实凭证、不调用真实外部服务。验证：`cd apps/hub-contracts && npm run verify:all`、`cd apps/hub-server && npm run verify:all`、`cd apps/hub-console && npm run verify:all`、`git diff --check`、`now.md` yaml 可解析、`python3 -m json.tool docs/planning/agent-state.json`、`cd apps/desktop && npm run verify:skills-sync` 均通过。
- 2026-06-07 HUB-LARK-WIRE — Lark 三包接入 Hub contract：`apps/lark-gateway/src/hub.ts` 输出 `lark-gateway` ingress adapter descriptor，并把飞书 `im.message.receive_v1` 子集归一化为 schema-valid `HubEvent`；`handleMessage` 支持可选 `hubEvents.record()` sink，失败不影响回复链路；`apps/lark-toolkit/src/hub.ts` 输出 `lark-toolkit` tool adapter descriptor；`apps/pf-skills/src/hub.ts` 输出 `pf-skills` tool adapter descriptor 与 `skillReplyToHubEvent()`；三包新增 `@teamhub/hub-contracts` 本地依赖与 schema 测试。验证：`cd apps/pf-skills && npm run verify:all`、`cd apps/lark-toolkit && npm run verify:all`、`cd apps/lark-gateway && npm run verify:all`、`cd apps/hub-contracts && npm run verify:all`、`git diff --check`、`cd apps/desktop && npm run verify:skills-sync` 均通过；真实飞书 smoke 未跑，按边界留用户线下配置后执行。
- 2026-06-07 HUB-COMPOSE-SCAFFOLD — Compose 代码面落地：新增 root `Dockerfile`（Node 24 多阶段构建，合并 Hub API 与已构建控制台）、`.dockerignore`、`compose.yaml` core stack（`hub + postgres`）、`deploy/teamhub.env.example` 与 `scripts/verify-hub-compose.sh`；`apps/hub-server` 增加无新生产依赖的静态控制台托管与 mock-first `/api/events`、`/api/bridge/members`、`/api/git/repos`、`/api/artifacts`；`apps/hub-console` 支持 `VITE_API_BASE=/` 同源 real API。验证：Hub 三包 verify、desktop/server/lark 三包既有 verify、非 Docker 本地 static/API smoke、compose yaml parse、脚本语法、生产依赖 audit 0 漏洞均通过；当时 `scripts/verify-hub-compose.sh` 因本机缺少 `docker` CLI 返回 127，已由后续 HUB-COMPOSE-SMOKE 闭环补跑。
