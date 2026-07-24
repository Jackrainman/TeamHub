---
status: decided
date: 2026-06-06
owner: Teamhub
scope: team-hub-stack
decision: D-025
---

# Team Hub Stack Decision

> 本文只拍板 Team Hub 技术栈和部署边界，不实现后端或前端代码。事实源：D-024、`docs/design/team-hub-concept.md`、现有 `apps/lark-*` / `apps/pf-skills` 三包、允许读取的 `xju-feiyue/` 非密钥文件。

> **D-026 继承说明（2026-06-09）**：治理 reframe 后，本文技术栈 / 部署 / 数据边界结论（Node/TS、Fastify、Zod、Drizzle、生产 Postgres + SQLite fallback、Forgejo 默认、Compose、同镜像换 env）**全部继续有效**。新增两点：①治理数据真相层实体（项目/赛季 · 成员+角色+资历 · 可配置组织树 · 任务+依赖 DAG · 前置需求 Need）进同一关系库（生产 Postgres）；②**路线 A**——系统库是唯一真相，飞书只做汇报 / 通知 / check-in，不双写。当前模式 `governance_design`。

## 1. 结论

1. **后端选 Node/TypeScript 统一栈**。新 Hub 后端放在 `apps/hub-server/`，不复用已冻结的 `apps/server/`。推荐 Node.js 24 LTS 容器运行时、TypeScript、Fastify、Zod、Drizzle ORM；真实版本在 scaffold 任务锁定。
2. **前端控制台选 React/Vite/TypeScript**。新控制台放在 `apps/hub-console/`，不复用已冻结的 `apps/desktop/`。借鉴 `xju-feiyue` 的 `React + Vite + TanStack Query + Zod + shadcn/Radix + lucide` 分层，但业务模型全部重写。
3. **Docker Compose 是硬要求**。后续可部署 milestone 必须能用 Compose 一键起核心栈；服务器不要求安装系统 Node，也不要求 `git pull` 作为正式部署方式。
4. **同一代码、同一镜像，只换 `.env`**。本地战队服务器、云服务器、未来其他战队 self-host 都使用同一个 `teamhub-hub` 镜像；差异只来自 env、volume、Compose profile 和反向代理。
5. **数据库生产默认 Postgres，SQLite 只做 dev / 单机 fallback**。一开始按 storage port + 可迁移 schema 预留 SQLite/Postgres 双兼容，但业务决策以 Postgres 为准；如果双兼容与可靠性冲突，Postgres 优先。
6. **Artifact / 日志 / 固件包 / rosbag 不进 Git**。Hub DB 只存索引、校验和、关联 repo/commit、保留策略；字节内容进入 volume、NAS、S3/MinIO 或 Forgejo release assets。Git forge 的仓库数据由 forge 自己管理。
7. **Git 中枢推荐 Forgejo，Gitea 可替代，bare git 只做低配 fallback**。Teamhub 不自研 GitHub，只做索引、联动、通知、健康检查和 artifact 关联。
8. **Ubuntu 20.04 可以短期先跑，不作为公网 self-host 基线**。已有 20.04 老服务器若 Docker/Compose 已可用，可作为过渡；公网部署优先 Ubuntu 24.04 LTS，22.04 LTS 可接受。20.04 已过标准维护，应启用 Ubuntu Pro/ESM 或尽快升级。
9. **现有 lark 三包接入 Hub，而不是被废弃**。`apps/lark-gateway` 作为 ingress，`apps/lark-toolkit` 作为 lark outbound adapter，`apps/pf-skills` 作为 skill adapter。
10. **Hermes / 小龙虾 / Claude Code adapter mock-first**。先落统一 adapter contract、health、capabilities、invoke stub 和 fixture；真实凭证、真实命令、真实外部 API 均后置审批。

## 2. 约束

- 当前模式 `governance_design`（D-026；壳子阶段 `team_hub_shell_design` 已落地为触点/集成 + 展示底座）：推进治理四层（数据真相 → 规则治理 → 展示汇报 → 触点集成）；不炼丹，不做大型社区站 / 完整 Trail viewer。
- v0.3 已冻结：`apps/server/` 和 `apps/desktop/` 已于 2026-06-09（D-026）删除，完整代码留 git 历史、精华见 `docs/archive/v0.3-closeout/PROBEFLASH-V03-ESSENCE.md`；不承载 Team Hub 新功能。
- 目标团队是 5-15 人机器人战队：后台要轻、可扫、可部署；不做多租户 SaaS、绩效统计、成员产能排名。
- 外部入口可能长期并存：飞书、Hermes、小龙虾、Claude Code、CLI、Git forge、未来脚本。Hub 不能把其中任何一个写死为唯一能力。
- 真实密钥只来自 server 进程环境变量或用户线下注入的外部 secret 文件；不进入前端、planning 文档、README、日志、commit message。
- `xju-feiyue/` 只能参考架构和局部通用模式；不提交其目录，不搬社区业务模型、真实内容、账号或私有数据。
- 老服务器可能是 Ubuntu 20.04；但公网 self-host 需要有安全维护和官方 Docker 支持边界。

## 3. 方案对比

### 3.1 后端：Node/TypeScript vs FastAPI + React

| 维度 | Node/TypeScript 统一栈 | FastAPI + React |
|---|---|---|
| 与现有代码关系 | 直接复用 `apps/lark-gateway` / `apps/lark-toolkit` / `apps/pf-skills`，飞书 SDK 已在 TS 栈 | 需要让 TS 三包变成 sidecar 或 HTTP adapter，跨语言边界更多 |
| Schema 边界 | 前后端都可用 Zod，后续 `apps/hub-contracts` 可共享 contract | 后端 Pydantic、前端 Zod，需 OpenAPI 生成或双写 |
| 控制台 API | Fastify + Zod 足够覆盖 health、adapter、event、artifact、bridge | FastAPI 很成熟，`xju-feiyue` 可借鉴更多后端结构 |
| 部署复杂度 | 一个 Node 镜像可同时服务 API、静态 console、adapter stub | Python 后端 + Node 前端 build，多语言镜像和 CI 更复杂 |
| 团队维护 | TypeScript 一条线，对当前 Teamhub 包更顺 | Python 后端也顺手，但会把现有 adapter 变成第二生态 |
| 风险 | 需要认真设计后端分层、迁移和后台任务 | 跨进程 adapter、双 schema、部署复杂度抬高 |

**拍板**：选 Node/TypeScript。FastAPI 的工程成熟度不否认，但 Teamhub 当前最贵的边界是 adapter 和飞书三包接入，不是从零写 Web API。

### 3.2 控制台组织方式

`xju-feiyue` 前端值得借鉴的是工程分层，不是业务内容：

- `src/api/client.ts` 作为唯一 fetch 点。
- `src/api/endpoints/*` 负责 endpoint 函数。
- `src/api/schemas/*` 负责 Zod 边界校验。
- `src/api/mock/*` 负责 dev/mock fixture。
- `TanStack Query` 承载服务端数据缓存。
- `pages/` 做薄壳，`features/*` 做功能切片。
- `components/ui` / `components/common` / `components/layout` 分层。
- shadcn/Radix/lucide 提供后台常用控件。

Teamhub 控制台应改成 Team Hub 信息架构：

```text
apps/hub-console/src/
  api/
    client.ts
    endpoints/
    schemas/
    mock/
  features/
    overview/
    adapters/
    events/
    bridge/
    git/
    artifacts/
    audit/
    settings/
  components/
    ui/
    common/
    layout/
  pages/
```

不借鉴的部分：社区笔记、学校、会议、学分、资料库完整业务、用户内容站风格、社区权限模型。

### 3.3 数据库：SQLite vs Postgres

| 维度 | SQLite | Postgres |
|---|---|---|
| 部署 | 单文件，最轻 | Compose 多一个服务 |
| 并发写入 | 单机小负载可用，但多入口写入更容易遇到锁等待 | 更适合飞书 ingress、控制台、adapter、Git webhook 同时写 |
| 备份 | 文件级备份简单，但热备和迁移要更谨慎 | `pg_dump` / volume 备份 / 迁移链路成熟 |
| self-host | 对极简本地服务器友好 | 对其他战队公网部署更标准 |
| 查询能力 | 够 MVP，但 JSON/索引/审计扩展受限 | 事件、audit、artifact、adapter 状态更稳 |

**拍板**：

- 生产默认 `DATABASE_URL=postgres://...`。
- dev / 单机 fallback 允许 `DATABASE_URL=sqlite:///var/lib/teamhub/teamhub.db`。
- 初期 schema 只用两边都能承载的子集：文本、时间戳、枚举字符串、JSON 字符串或受控 JSON 字段、普通索引。
- 不为了双兼容牺牲生产可靠性；一旦需要 Postgres 特性，先写 ADR 或任务说明。

### 3.4 Git 中枢：Forgejo vs Gitea vs bare git

| 选项 | 结论 | 理由 |
|---|---|---|
| Forgejo | 推荐默认 | 社区导向，Docker/Compose 文档完善，功能足够覆盖小战队 Git forge；与 Gitea API/生态接近 |
| Gitea | 可替代 | 成熟、文档完善、Docker Compose 路径清楚；若用户更熟 Gitea 可直接用 |
| bare git | fallback | 最少依赖，但没有 Web UI、issue/PR/release/API 体验；只适合临时内网仓库 |
| Teamhub 自研 Git forge | 不做 | 维护成本不合理，偏离 Team Hub 控制面定位 |

Teamhub 只做：

- repo/ref/commit/release 索引。
- artifact 与 commit/release 关联。
- webhook/event 联动。
- 控制台健康与同步状态。
- 飞书通知与任务上下文提示。

Teamhub 不做：

- Git 权限系统。
- Web code review。
- Git 对象存储。
- forge 用户体系替代。

## 4. 推荐技术栈

### 4.1 包位置

- `apps/hub-server/`：Team Hub 后端。提供 API、adapter registry、event router、storage port、audit、health；服务静态控制台构建产物。
- `apps/hub-console/`：Team Hub 控制台。React/Vite SPA；只通过 Hub API 读写状态。
- `apps/hub-contracts/`：后续 `HUB-CONTRACTS-V0` 可新增的共享契约包。放 `HubEvent`、`AdapterDescriptor`、`BridgeMemberState`、`GitRepoRef`、`ArtifactRef` 等 Zod schema、fixtures、错误模型。
- `apps/lark-gateway/`：后续变为 lark ingress adapter 或被 `hub-server` 导入装配；当前保持独立直到 `HUB-LARK-WIRE`。
- `apps/lark-toolkit/`：后续作为 `lark` outbound adapter 能力源。
- `apps/pf-skills/`：后续作为 `pf-skills` adapter 能力源。

### 4.2 后端

- Runtime：Node.js 24 LTS Docker image；本地开发可临时用 Node 22 LTS，但 scaffold 应锁定一个 LTS 主版本。
- Language：TypeScript strict。
- HTTP：Fastify。
- Runtime schema：Zod；统一 `safeParse`，错误体保持 `{ detail: string }` 起步。
- DB：Drizzle ORM + migrations；Postgres driver 为生产默认，SQLite driver 为 dev/fallback。
- Config：Zod 解析 `process.env`，启动时失败即退出；不从前端读取 secret。
- Logs：应用运行日志走 stdout/stderr 给 Docker logging；业务 audit 进 DB。
- Tests：contract tests + route tests + storage adapter smoke；涉及 DB 的任务至少覆盖 Postgres profile，SQLite fallback 另做 smoke。

不选：

- NestJS：当前壳子阶段框架重量过高。
- Express-only：能跑，但 route schema、plugin 边界和类型约束不如 Fastify 顺手。
- FastAPI：本轮放弃，原因见 §3.1。

### 4.3 前端控制台

- React + Vite + TypeScript。
- TanStack Query 管服务端数据和 mutation 状态。
- Zod 校验所有 API 响应和写入 payload。
- shadcn/Radix + lucide 提供后台控件、tabs、dialog、dropdown、tooltip、table、badge、switch。
- Tailwind/tokens 走克制后台风格；不做 landing page，不做社区站 hero，不做大卡片堆叠。
- Mock/real split：开发默认 mock fixture；设置 `VITE_API_BASE` 或同源 API 后切真后端。

关键原则：

```text
组件 -> Query hooks -> endpoints -> client.ts -> Hub API
                  \-> schemas parse
```

组件不得直接 import mock 数据，控制台不得绕过 API client。

## 5. Docker Compose 部署模型

Docker Compose 是 Team Hub 的部署硬门槛：后续每个可部署 milestone 都必须能在 Compose 里启动、健康检查、关闭、保留 volume。

推荐模型：

```text
core profile:
  hub:
    image: teamhub-hub:<version>
    serves: API + built console static files
    env: DATABASE_URL, ARTIFACT_ROOT, PUBLIC_BASE_URL, adapter modes
    volumes: hub_artifacts

  postgres:
    image: postgres:<pinned>
    volumes: pg_data

optional forge profile:
  forgejo:
    image: codeberg.org/forgejo/forgejo:<pinned>
    volumes: forgejo_data
    ports: internal HTTP + SSH mapping

optional ingress profiles:
  lark-ingress:
    image: teamhub-hub:<same version>
    command: lark-ingress or adapter worker
    env: same env file, lark-specific keys server-side only
```

原则：

- 正式部署使用镜像 tag，不在服务器长期 `git pull` 跑源码。
- `hub` 镜像包含后端和已构建控制台；浏览器只拿静态文件，不拿 provider key。
- `postgres` 和 `forgejo` 是 volume 持久化；删除容器不删除数据。
- 反向代理（Caddy/Nginx/Traefik）作为可选外层，不进入第一版 Hub 代码。
- 初期不抢占 80/443；公网绑定和 TLS 另开部署任务审批。
- Compose 文件可支持 profiles，但 core profile 必须一条命令起 Hub + DB。

官方事实边界：

- Node.js 官方建议生产应用使用 Active LTS 或 Maintenance LTS；截至 2026-06-06，v24 和 v22 都是 LTS，v24 是最新 LTS。
- Docker 官方 Ubuntu 安装页当前列出的 Engine 支持版本包含 24.04/22.04 等，不列 20.04。
- Ubuntu 20.04 LTS 标准维护已到 2025-05，Ubuntu Pro 覆盖到 2030-04。
- Forgejo 与 Gitea 都有 Docker Compose 安装文档；两者都适合作为外部 Git forge。

参考：

- <https://nodejs.org/en/about/previous-releases>
- <https://docs.docker.com/engine/install/ubuntu/>
- <https://ubuntu.com/about/release-cycle>
- <https://forgejo.org/docs/latest/admin/installation/docker/>
- <https://docs.gitea.com/installation/install-with-docker>

## 6. 本地 / 云端 / self-host 兼容策略

同一镜像适配三类场景：

| 场景 | 运行方式 | 差异来源 |
|---|---|---|
| 本地战队服务器 | 内网 IP + Compose core profile；可选 Forgejo profile | `.env.local`、本地 volume、内网 base URL |
| 云服务器 | 公网域名 + 反向代理 + Compose core/forge profile | `.env.cloud`、TLS/反代、公开 base URL、防火墙 |
| 其他战队 self-host | 发布镜像 + 示例 compose + `.env.example` | 用户自己的 env、volume、域名、forge 选择 |

必须坚持：

- 不按部署环境改源码。
- 不按部署环境 rebuild 镜像，除非升级版本。
- 不把密钥写进镜像、前端 bundle、Git 仓库或 planning 文档。
- 所有环境变量都有 schema 和启动期校验。
- 关键路径用 `TEAMHUB_PUBLIC_BASE_URL` 生成回调/下载链接。
- 适配器用 mode 开关：`disabled` / `mock` / `http` / `stdio` / `cli`，默认 `mock` 或 `disabled`。

建议 env 边界：

```text
TEAMHUB_PUBLIC_BASE_URL
TEAMHUB_BIND_HOST
TEAMHUB_PORT
DATABASE_URL
ARTIFACT_STORE
ARTIFACT_ROOT
FORGE_KIND
FORGE_BASE_URL
FORGE_API_TOKEN
ADAPTER_LARK_MODE
ADAPTER_HERMES_MODE
ADAPTER_XIAOLONGXIA_MODE
ADAPTER_CLAUDE_CODE_MODE
```

上面只列变量名，不列真实值。真实值由用户线下写入仓库外文件或服务器环境。

## 7. 数据与密钥边界

### 7.1 DB 中存什么

- `HubEvent`：事件来源、类型、时间、correlation id、摘要 payload。
- `AdapterDescriptor`：adapter id、kind、状态、capabilities、最近 health。
- `BridgeMemberState`：成员当前状态、阻塞、所需技能、更新时间。
- `GitRepoRef`：forge kind、repo id/name、remote URL、默认分支、最近同步点。
- `ArtifactRef`：artifact kind、name、uri/path、checksum、size、related repo/commit、createdAt、retention。
- `AuditLog`：写入类操作、操作者、来源、时间、结果。
- `ConfigMetadata`：非密钥配置状态，例如某 adapter 是否已配置、最后校验时间。
- **（D-026 治理域，schema 待 `GOV-DATA-MODEL-DESIGN`）**：`Season`/`Project`、`Member`（id / 显示名 / role / 资历 / group）、`Group`（可配置组织树）、`Task`（一等公民 + 状态）、`Dependency`（Task→Task 有向边）、`Need`/前置需求（描述 / 提供方 / 状态）。`BridgeMemberState` 并入 `Member` + Task 状态派生。

### 7.2 Volume / 外部存储中放什么

- `pg_data`：Postgres 数据。
- `hub_artifacts`：固件包、日志包、rosbag、小型诊断 bundle、上传附件。
- `forgejo_data`：Forgejo/Gitea 自己的 repo、release、配置、附件。
- 可选 NAS/S3/MinIO：大型 rosbag、视频、长期日志归档。

### 7.3 只索引不托管什么

- Git 仓库内容：由 Forgejo/Gitea/bare git 管理；Hub 只索引 refs、commits、release。
- 大型 rosbag / 视频 / 长期日志：如果超过本机 volume 的容量边界，Hub 只记录 URI、checksum、大小、保留策略。
- 真实外部系统账号与 token：只在 server env 或外部 secret store；Hub DB 不存明文。

### 7.4 禁止

- 禁止把 artifact 字节塞进 Git。
- 禁止把 API key 放进前端、localStorage、README、planning、日志、commit message。
- 禁止 AI 读取或打印 `.env` / `*key*` / `*secret*`。
- 禁止把 Skill 输出说成硬件验证结论。

## 8. 现有 lark 三包接入策略

后续 `HUB-LARK-WIRE` 不重写已有三包，而是按 Hub adapter 接口包一层：

```text
apps/lark-gateway
  Feishu Long Connection / webhook event
  -> normalize to HubEvent
  -> POST /api/events or in-process dispatch

apps/lark-toolkit
  -> adapter id: lark
  -> capabilities: message.reply, message.send, api.readonly, cli.diagnostic

apps/pf-skills
  -> adapter id: pf-skills
  -> capabilities: debug.checklist, daily.summary, pre.match.checklist
```

边界：

- 3 秒 ack 内的飞书响应仍优先 SDK / in-process。
- lark-cli 写入类操作仍需用户审批；只读诊断可作为 adapter capability 暴露。
- 真实飞书凭证由用户线下注入；Hub 只显示“configured / unconfigured / degraded”，不显示密钥值。

## 9. Hermes / 小龙虾 / Claude Code adapter 预留

统一 adapter contract 起步：

```text
GET  /api/adapters
GET  /api/adapters/:id
POST /api/adapters/:id/health-check
POST /api/adapters/:id/invoke
```

每个 adapter 至少声明：

```text
id
kind
displayName
mode
status
capabilities
healthCheckedAt
invoke(input) -> output | error
```

初期 mock：

| Adapter | 默认 mode | 初始 capabilities | 真实接入后置条件 |
|---|---|---|---|
| `hermes` | `mock` | `code.skill.generate`, `code.context.summarize` | 用户提供 Hermes 调用方式、权限、输入输出样例 |
| `xiaolongxia` | `mock` | `chat.assist`, `skill.invoke` | 用户确认小龙虾接口或本地命令边界 |
| `claude-code` | `mock` | `repo.inspect`, `task.plan`, `patch.suggest` | 用户确认插件/CLI/回调方式，且不暴露 token store |
| `pf-skills` | `real-local` | `debug.checklist`, `daily.summary`, `pre.match.checklist` | 现有包接入 Hub contract |

mock-first 验收：

- 控制台能看到 adapter 状态。
- `/api/adapters/:id/health-check` 可返回 mock health。
- `/api/adapters/:id/invoke` 可基于 fixture 返回结构化结果。
- 不执行真实外部命令，不读取真实凭证。

## 10. 后续原子任务

建议按以下顺序认领，均需重新走 `atomic-task`，不能本任务自动顺推：

1. `HUB-BACKEND-SCAFFOLD`：新建 `apps/hub-server/`，Fastify + `/health` + `/api/system/status` + `/api/adapters` mock endpoint + contract test。
2. `HUB-CONSOLE-SCAFFOLD`：新建 `apps/hub-console/`，React/Vite + API client + Zod parse + mock/real split + 总览页 mock。
3. `HUB-CONTRACTS-V0`：新建或落地 `apps/hub-contracts/`，固化 `HubEvent` / `AdapterDescriptor` / `BridgeMemberState` / `GitRepoRef` / `ArtifactRef` schema 与 fixtures。
4. `HUB-COMPOSE-SCAFFOLD`：新增 Dockerfile / compose core profile，要求 `hub + postgres` 一键启动并通过 health smoke；不接真实公网。
5. `HUB-LARK-WIRE`：把 `apps/lark-gateway` / `apps/lark-toolkit` / `apps/pf-skills` 接入 Hub event/adapter contract；mock-first，不跑真实飞书 smoke。
6. `HUB-ADAPTERS-MOCK`：Hermes / 小龙虾 / Claude Code mock adapter。
7. `HUB-GIT-FORGE-DESIGN`：Forgejo/Gitea/bare git 细化设计，包含权限、备份、artifact 不入 Git、webhook/index 边界。
