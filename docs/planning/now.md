# Now

> 唯一当前战况源。Team Hub 方向已由 D-024 覆盖旧 markdown-only pivot。pre-pivot 历史快照 → `docs/archive/v0.3-pivot/`。

```yaml
mode: team_hub_shell_design
stage: Team Hub 战队中枢概念冻结 + 技术栈拍板完成；Hub 后端壳子、共享契约、控制台壳子、Compose 代码面与 Lark mock-first 接线已落地
stage_goal: 以 docs/design/team-hub-concept.md + docs/design/team-hub-stack-decision.md + D-024/D-025 为事实源，后续按 Node/TypeScript 统一栈推进 Compose 部署、lark/adapter 接入与 Git/artifact 索引；Skill/Bridge/Trail 作为 Hub 下能力位保留；AI 每轮默认读 AGENTS.md + now.md + agent-state.json + git 状态，backlog/decisions/roadmap/设计文档按条件读取
current_task: null  # HUB-LARK-WIRE 已闭环；下一步需重新走 atomic-task，从 frontier 选择唯一候选
frontier:
  - HUB-ADAPTERS-MOCK
  - HUB-GIT-FORGE-DESIGN
blocked:
  - id: HUB-COMPOSE-SMOKE
    reason: "Compose scaffold 代码和非 Docker 构建验证已完成；scripts/verify-hub-compose.sh 因本机缺少 docker CLI 返回 127（missing required tool docker），待安装 Docker Engine + Compose plugin 后执行自动化 health smoke。"
post_pivot_registry:
  - SKILL-PROTOCOL-V1                    # 已落地草稿；待后续决定是否按 D-024 重新纳入 Hub skill adapter 契约
  - BRIDGE-01-ROSTER-SCHEMA              # 被 Hub BridgeState 契约覆盖，后续不按旧 markdown-only 任务推进
  - TRAIL-01-VIEWER-DESIGN               # 等 Hub 有 archive / artifact / event 原料后再设计
frozen:
  - ProbeFlash-v0.3.0                    # 不再加功能、不重构；致命补丁除外
```

## 当前任务

_无。HUB-LARK-WIRE 已闭环：`lark-gateway` / `lark-toolkit` / `pf-skills` 均新增到 Hub contract 的 mock-first 适配层，覆盖飞书消息归一化为 HubEvent、Lark toolkit adapter descriptor、pf-skills adapter descriptor 与 `skill.completed` 事件映射；不执行真实飞书 smoke。下一步按用户当前目标继续构建后续候选。_

## 架构定位（2026-06-06）

Teamhub = 战队中枢 / Team Hub；飞书 = 入口与通知层；Hermes / 小龙虾 / Claude Code / pf-skills = adapter 候选；战队服务器 = Git / artifact / 控制台运行层。详见 `docs/design/team-hub-concept.md`、`docs/design/team-hub-stack-decision.md`、D-024 与 D-025。旧 Skill/Bridge/Trail 三 facet 保留为能力分类，但实现边界从 markdown-only 升级为 Hub 后端 + 控制台 + 插件接口。

## 阻塞 / 待拍板

- **HUB-COMPOSE-SMOKE 自动化验证待工具**：Compose scaffold 的代码与非 Docker smoke 已通过；本机缺少 `docker` CLI，`scripts/verify-hub-compose.sh` 返回 127（`missing required tool: docker`），安装 Docker Engine + Compose plugin 后再跑自动化 health smoke。
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

- 2026-06-07 HUB-LARK-WIRE — Lark 三包接入 Hub contract：`apps/lark-gateway/src/hub.ts` 输出 `lark-gateway` ingress adapter descriptor，并把飞书 `im.message.receive_v1` 子集归一化为 schema-valid `HubEvent`；`handleMessage` 支持可选 `hubEvents.record()` sink，失败不影响回复链路；`apps/lark-toolkit/src/hub.ts` 输出 `lark-toolkit` tool adapter descriptor；`apps/pf-skills/src/hub.ts` 输出 `pf-skills` tool adapter descriptor 与 `skillReplyToHubEvent()`；三包新增 `@teamhub/hub-contracts` 本地依赖与 schema 测试。验证：`cd apps/pf-skills && npm run verify:all`、`cd apps/lark-toolkit && npm run verify:all`、`cd apps/lark-gateway && npm run verify:all`、`cd apps/hub-contracts && npm run verify:all`、`git diff --check`、`cd apps/desktop && npm run verify:skills-sync` 均通过；真实飞书 smoke 未跑，按边界留用户线下配置后执行。
- 2026-06-07 HUB-COMPOSE-SCAFFOLD — Compose 代码面落地：新增 root `Dockerfile`（Node 24 多阶段构建，合并 Hub API 与已构建控制台）、`.dockerignore`、`compose.yaml` core stack（`hub + postgres`）、`deploy/teamhub.env.example` 与 `scripts/verify-hub-compose.sh`；`apps/hub-server` 增加无新生产依赖的静态控制台托管与 mock-first `/api/events`、`/api/bridge/members`、`/api/git/repos`、`/api/artifacts`；`apps/hub-console` 支持 `VITE_API_BASE=/` 同源 real API。验证：`cd apps/hub-contracts && npm run verify:all`、`cd apps/hub-server && npm run verify:all`、`cd apps/hub-console && npm run verify:all`、`cd apps/desktop && npm run typecheck && npm run build && npm run verify:all`、`cd apps/server && npm run verify:deploy-prep`、`cd apps/lark-toolkit && npm run verify:all`、`cd apps/pf-skills && npm run verify:all`、`cd apps/lark-gateway && npm run verify:all`、构建后 Hub server 同源托管 console 的本地 static/API smoke、`bash -n scripts/verify-hub-compose.sh`、`sh -n scripts/verify-hub-compose.sh`、`compose.yaml` yaml 可解析、`git diff --check`、`now.md` yaml 可解析、`python3 -m json.tool docs/planning/agent-state.json`、`cd apps/desktop && npm run verify:skills-sync` 均通过；hub-server/hub-console 生产依赖审计 0 漏洞。未跑：`scripts/verify-hub-compose.sh` 因本机缺少 `docker` CLI 返回 127，待安装 Docker 后执行自动化 Compose health smoke。
- 2026-06-07 HUB-CONSOLE-SCAFFOLD — Hub 控制台壳子落地：新增 `apps/hub-console/` 独立 npm 包（React/Vite/TypeScript、TanStack Query、lucide、共享契约 `file:../hub-contracts`），实现 mock/real API client 分流、Zod 响应解析、总览页 mock 数据、运维控制台布局与 `test/client.test.ts` API client 契约测试；本地 dev smoke 访问 `http://127.0.0.1:5174/`，Playwright 桌面/移动截图均非空且布局无明显重叠；真实外部服务未接入。验证：`cd apps/hub-console && npm run verify:all`、`cd apps/hub-contracts && npm run verify:all`、`cd apps/hub-server && npm run verify:all`、`cd apps/desktop && npm run typecheck && npm run build && npm run verify:all`、`cd apps/server && npm run verify:deploy-prep`、`git diff --check`、`now.md` yaml 可解析、`python3 -m json.tool docs/planning/agent-state.json`、`cd apps/desktop && npm run verify:skills-sync` 均通过；hub-console 生产依赖审计 0 漏洞。
- 2026-06-07 HUB-CONTRACTS-V0 — Hub 共享契约 v0 落地：新增 `apps/hub-contracts/` 独立 npm 包，导出 `HubEvent` / `AdapterDescriptor` / `BridgeMemberState` / `GitRepoRef` / `ArtifactRef` schema、错误体与列表响应 schema、API contract fixtures；`apps/hub-server` 通过 `file:../hub-contracts` 使用共享 adapter 契约和 fixtures，并在自身 verify 前构建 contracts。验证：`cd apps/hub-contracts && npm run verify:all`、`cd apps/hub-server && npm run verify:all`、`cd apps/desktop && npm run typecheck && npm run build && npm run verify:all`、`cd apps/server && npm run verify:deploy-prep`、`git diff --check`、`now.md` yaml 可解析、`python3 -m json.tool docs/planning/agent-state.json`、`cd apps/desktop && npm run verify:skills-sync` 均通过；hub-contracts/hub-server 生产依赖审计均为 0 漏洞。
- 2026-06-07 HUB-BACKEND-SCAFFOLD — Team Hub 后端壳子落地：新增 `apps/hub-server/` 独立 npm 包（Fastify + Zod + TypeScript strict），提供 `HealthResponse` / `SystemStatusResponse` / `AdapterDescriptor` 契约、mock adapter registry、`/health`、`/api/system/status`、`/api/adapters` 与 404 标准错误体；`test/routes.test.ts` 覆盖 4 条契约路径；`.gitignore` 忽略 hub-server build 输出；`backlog.md` / `agent-state.json` / `now.md` 同步。验证：`cd apps/hub-server && npm run verify:all`、`cd apps/desktop && npm run typecheck && npm run build && npm run verify:all`、`cd apps/server && npm run verify:deploy-prep`、`git diff --check`、`now.md` yaml 可解析、`python3 -m json.tool docs/planning/agent-state.json`、`cd apps/desktop && npm run verify:skills-sync` 均通过；`npm audit --omit=dev --json` 生产依赖 0 漏洞。
