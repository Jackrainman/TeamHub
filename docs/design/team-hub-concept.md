---
status: stable
date: 2026-06-06
owner: Teamhub
scope: concept-design
decision: D-024
---

# Teamhub Team Hub Concept

> 目标：把 Teamhub 从单一调试记录工具升级为“战队中枢”：飞书是入口与通知层，战队服务器是运行与托管层，Teamhub Hub 负责事件路由、工具/AI 适配、状态聚合、控制台观测与后续功能扩展。

## 1. 结论

当前阶段应该做“大后端 + 前端可视化后端控制台”的壳子，而不是继续押注某一个 skill、一次性做 Trail、或直接开始炼丹。

合理的执行顺序是：

1. 先写概念设计与接口边界。
2. 后续每次只认领一个原子任务。
3. 每个任务先做详细设计，再写代码与验证。
4. 能借鉴 `xju-feiyue/` 的架构和局部代码，但不能把它整体并入 Teamhub。

更好的约束是：**先搭中枢控制面，再接真实能力；先留 adapter 接口，再绑定 Hermes / 小龙虾 / Claude Code；先做可观测和配置，再做复杂业务。**

## 2. 背景

已发生的变化：

- 飞书已经接入，Hermes / 小龙虾这类入口已经能让同学方便使用。
- 已有同学用 Hermes 把一台车的整车代码蒸馏成 skill，说明“代码理解 / skill 生成”可能由外部 AI 工具承担。
- 后续可能接 Claude Code 或插件体系，Teamhub 不应把自身锁死在某一个 skill 格式或模型 provider 上。
- 服务器侧有新的可能：把战队服务器作为内部 Git / artifact / 控制台服务器，让队员本地写代码、服务器集中托管与观测。

因此，Teamhub 的主任务从“自己生产所有能力”转为“组织和调度所有能力”。

## 3. 目标

Team Hub 目标：

- 给飞书、Hermes、小龙虾、Claude Code、未来机器人/脚本统一入口。
- 给战队服务器上的 Git 仓库、构建产物、日志、调试记录统一索引。
- 给 Bridge 状态、任务阻塞、人员求助、插件健康统一控制台。
- 给 Skill / Trail / 赛前系统保留接口，但不要求当前阶段立刻实现。
- 让后续能力以 adapter / plugin 方式接入，而不是在主系统里写死。

一句话：

```text
Teamhub = 战队的信息路由器 + 后端控制台 + 工具/AI 插件底座。
```

## 4. 非目标

当前阶段不做：

- 不炼丹，不 fine-tune，不承诺自研模型。
- 不做整车代码理解系统。
- 不做完整 Trail viewer / 赛季年鉴。
- 不做大型项目管理系统。
- 不做成员产能排名、效率分、贡献榜。
- 不替代 Forgejo / Gitea / GitHub 这类 Git forge。
- 不把 `xju-feiyue/` 社区业务整体迁入 Teamhub。
- 不依赖已有大量真实数据才能启动。

## 5. 总体架构

```text
飞书群 / 私聊 / Hermes / 小龙虾 / Claude Code / CLI
        |
        v
Ingress Layer
飞书 gateway / webhook / CLI command / plugin callback
        |
        v
Team Hub Backend
事件路由 / adapter registry / plugin registry / Bridge state /
Git index / artifact index / audit log / config / health
        |
        +--> AI & Tool Adapters
        |    Hermes / 小龙虾 / Claude Code / pf-skills / future LLM
        |
        +--> Team Server Integrations
        |    Forgejo or Gitea / bare git / CI / artifact storage
        |
        +--> Durable State
        |    SQLite or Postgres / markdown archive / filesystem artifacts
        |
        v
Console Frontend
接入状态 / 插件状态 / Bridge 状态 / Git 与产物索引 /
事件日志 / 配置 / 手动触发 / 运维健康
```

## 6. 模块边界

### 6.1 Ingress

职责：

- 接收飞书事件、CLI 请求、插件回调、未来 webhook。
- 归一化成 `HubEvent`。
- 做基础鉴权、去重、限流、ack。

不做：

- 不直接包含业务判断。
- 不直接调用模型。
- 不直接修改 Bridge / Git / artifact 状态。

### 6.2 Event Router

职责：

- 按事件类型、来源、命令、上下文选择 handler。
- 产出 `HubAction`。
- 记录事件审计。

不做：

- 不绑定具体 provider。
- 不把 Hermes / Claude Code / 小龙虾写死。

### 6.3 Adapter Registry

职责：

- 管理 AI / 工具 / 外部服务 adapter。
- 统一健康检查、能力声明、调用入口。
- 支持禁用、启用、配置检查。

典型 adapter：

- `lark`
- `hermes`
- `xiaolongxia`
- `claude-code`
- `pf-skills`
- `git-forge`
- `artifact-store`

### 6.4 Bridge State

职责：

- 表达“谁在做什么、卡在哪里、需要谁帮”。
- 支持从飞书消息、控制台手动修改、Git/release 事件中更新状态。
- 输出阻塞视图和匹配建议。

硬边界：

- 允许显示任务阻塞和等待时长。
- 禁止团队视图显示个人完成量排名、效率分、贡献榜。

### 6.5 Git & Artifact Index

职责：

- 记录仓库、分支、提交、release、构建产物、固件包、日志包、rosbag 等索引。
- 作为控制台和飞书通知的数据源。

不做：

- 不自己实现 Git forge。
- 不把大文件直接塞进 Git。
- 不直接取代 Forgejo / Gitea。

### 6.6 Console

职责：

- 后端控制台，不是社区内容站。
- 查看系统接入状态、adapter 状态、最近事件、Bridge 状态、仓库/产物索引。
- 允许有限手动操作：重跑健康检查、禁用 adapter、触发同步、修正 Bridge 状态。

风格：

- 密集、清晰、可扫描。
- 类运维/调度后台。
- 可以参考 `xju-feiyue` 的 UI 分层和管理后台，但业务模型全部重写。

## 7. 业务模型 v0

以下是壳子阶段建议的最小模型，后续代码任务可以逐个固化。

```ts
type HubEventSource =
  | 'lark'
  | 'hermes'
  | 'xiaolongxia'
  | 'claude-code'
  | 'console'
  | 'git'
  | 'system'

type HubEventType =
  | 'message.received'
  | 'command.received'
  | 'skill.requested'
  | 'skill.completed'
  | 'bridge.status.updated'
  | 'git.push'
  | 'release.created'
  | 'artifact.uploaded'
  | 'adapter.health.changed'
  | 'system.health.checked'

interface HubEvent {
  id: string
  source: HubEventSource
  type: HubEventType
  actor?: ActorRef
  createdAt: string
  correlationId?: string
  payload: unknown
}

interface ActorRef {
  id: string
  displayName: string
  source: 'lark' | 'git' | 'console' | 'unknown'
}

interface AdapterDescriptor {
  id: string
  kind: 'ai' | 'tool' | 'ingress' | 'git' | 'artifact'
  displayName: string
  status: 'enabled' | 'disabled' | 'degraded' | 'unconfigured'
  capabilities: string[]
  healthCheckedAt?: string
}

interface BridgeMemberState {
  memberId: string
  displayName: string
  currentTask?: string
  status: 'idle' | 'working' | 'blocked' | 'offline'
  blockedOn?: string
  neededSkills: string[]
  updatedAt: string
}

interface GitRepoRef {
  id: string
  name: string
  remoteUrl: string
  defaultBranch: string
  forge?: 'forgejo' | 'gitea' | 'bare-git' | 'github'
}

interface ArtifactRef {
  id: string
  kind: 'firmware' | 'log' | 'rosbag' | 'image' | 'video' | 'report' | 'other'
  name: string
  uri: string
  relatedRepo?: string
  relatedCommit?: string
  createdAt: string
}
```

## 8. API 契约草案

壳子阶段只需要控制台和 adapter 能跑通，不需要完整业务。

```text
GET  /health
GET  /api/system/status

GET  /api/events?cursor=&limit=
POST /api/events

GET  /api/adapters
GET  /api/adapters/:id
POST /api/adapters/:id/health-check
PATCH /api/adapters/:id

GET  /api/bridge/members
PATCH /api/bridge/members/:id/status
GET  /api/bridge/blockers

GET  /api/git/repos
POST /api/git/repos/sync
GET  /api/git/repos/:id/refs
GET  /api/git/repos/:id/releases

GET  /api/artifacts
POST /api/artifacts
GET  /api/artifacts/:id

GET  /api/audit/logs?cursor=&limit=
```

约定：

- JSON 字段统一 `camelCase`。
- 错误体统一 `{ "detail": "..." }`。
- 控制台请求/响应边界必须有 schema 校验。
- 写入类操作都要进入 audit log。
- 真实 key 只能来自后端环境变量或用户线下配置，不能进入前端、文档、日志。

## 9. 构建步骤

### 阶段 0：概念冻结

产出：

- `docs/design/team-hub-concept.md`
- `decisions.md` D-024
- `now.md` / `backlog.md` 同步

验收：

- 文档存在。
- ADR 存在。
- `now.md` yaml 可解析。

### 阶段 1：后端壳子

建议任务：

- `HUB-BACKEND-01`：新建 Hub 后端包。
- `HUB-BACKEND-02`：落 `HubEvent` / `AdapterDescriptor` / `BridgeMemberState` schema。
- `HUB-BACKEND-03`：落 `/health`、`/api/system/status`、`/api/adapters` mock 数据。
- `HUB-BACKEND-04`：落 audit log 内存或 SQLite 最小实现。

验收：

- typecheck / unit test 通过。
- API contract 测试覆盖核心 endpoint。

### 阶段 2：控制台壳子

建议任务：

- `HUB-CONSOLE-01`：新建控制台前端包或从现有 desktop 分离。
- `HUB-CONSOLE-02`：落 API client + schema parse + mock/real backend split。
- `HUB-CONSOLE-03`：落总览页：系统健康、adapter 状态、最近事件。
- `HUB-CONSOLE-04`：落 Bridge 状态页 mock。

验收：

- typecheck/build 通过。
- 关键页面 Playwright 截图无空白、无明显重叠。

### 阶段 3：接入飞书和现有三包

建议任务：

- `HUB-LARK-01`：把 `apps/lark-gateway` 事件转为 `HubEvent`。
- `HUB-LARK-02`：把 `apps/lark-toolkit` 注册为 `lark` adapter。
- `HUB-SKILL-01`：把 `apps/pf-skills` 注册为 `pf-skills` adapter。

验收：

- mock 飞书事件进 Hub，控制台能看到事件和 adapter 状态。
- 不要求真实飞书 smoke 由 AI 执行。

### 阶段 4：Git 与 artifact

建议任务：

- `HUB-GIT-01`：设计 Git forge / bare git 接口。
- `HUB-GIT-02`：接 Forgejo/Gitea 或 bare git 的只读仓库索引。
- `HUB-ARTIFACT-01`：设计固件、日志、rosbag、报告索引。

验收：

- 本地 fixture 模拟仓库/产物可查询。
- 不直接操作真实服务器写入，除非用户明确白天审批。

### 阶段 5：外部 AI / 插件

建议任务：

- `HUB-ADAPTER-01`：定义 AI adapter 接口。
- `HUB-HERMES-01`：Hermes adapter mock-first。
- `HUB-CLAUDECODE-01`：Claude Code/plugin adapter mock-first。
- `HUB-EVAL-01`：定义 eval 数据格式，暂不训练。

验收：

- 同一输入可以路由到不同 adapter。
- 控制台能显示 adapter health 与最近调用。

## 10. `xju-feiyue/` 复用判断

`xju-feiyue/` 当前作为本地参考项目，已加入 `.gitignore`，不提交到 Teamhub。

### 10.1 可以直接复用或近似搬运的代码模式

这些代码与业务耦合较低，可在后续任务中按 Teamhub 命名重写或局部搬运：

- `frontend/src/api/client.ts` 的唯一 fetch 点、mock/real split、Zod 边界校验模式。
- `frontend/src/App.tsx` 的 `QueryClientProvider` + `RouterProvider` 基础壳。
- `frontend/src/api/schemas/*.ts` 的 schema 组织方式。
- `backend/app/schemas/_base.py` 的 camelCase 输出基类思路。
- `backend/app/settings.py` 的 `pydantic-settings` 配置模式，但字段必须重写。
- `backend/app/main.py` 的 FastAPI app / CORS / router registration / lifespan 结构。
- `frontend/src/components/ui/*` 的 shadcn/Radix 基础组件，如果 license 和依赖版本确认无问题。
- `frontend/src/components/common/ErrorState.tsx`、`LoadingSkeleton.tsx` 这类通用状态组件的模式。

注意：即使“可复用”，也必须在后续代码任务中逐文件审查、改名、删业务字段、加 Teamhub 测试，不能整目录复制。

### 10.2 可以借鉴但不建议直接复用的代码

- `features/admin/*`：布局、Tabs、权限隐藏后台的思路可借鉴；用户、资料、统计字段要重写。
- `features/materials/*`：文件树、上传、预览、确认弹窗可以借鉴；当前 Hub 只需要 artifact 索引，完整资料库不应提前搬。
- `features/editor/ai/*`：AI diff 与 streaming 体验可借鉴；Team Hub 初期不是文本编辑器。
- `backend/app/routes/admin.py`、`routes/materials.py`：路由分层可借鉴，业务逻辑不搬。
- `backend/app/services/uploads_common.py`：上传安全策略可借鉴，Hub artifact 存储策略需单独设计。

### 10.3 不能复用的部分

- 社区笔记、学校、会议、学分、用户内容相关模型。
- `content/notes/`、`scripts/notion_raw/` 等真实内容和同步数据。
- 任何 `.env`、token store、账号、私有数据。
- 与新疆大学飞跃手册品牌、社区权限、学号登录强绑定的字段。
- `xju-feiyue` 自身 Git 历史和整项目目录。

## 11. 技术选型建议

后端有两条可选路线：

### 方案 A：Node/TypeScript 统一栈

优点：

- 复用现有 `apps/lark-gateway` / `apps/lark-toolkit` / `apps/pf-skills`。
- 飞书 SDK 已在 TS 栈。
- 前后端 schema 可共享或近似共享。

缺点：

- 需要重新搭成熟后端分层。
- 文件上传、后台任务、数据库迁移需要额外选型。

### 方案 B：FastAPI + React 控制台

优点：

- `xju-feiyue` 可借鉴更多后端代码。
- FastAPI / Pydantic / Alembic 对“控制台 + API + 后台任务”很成熟。
- 后续 artifact、后台巡检、任务调度实现顺手。

缺点：

- 现有飞书三包是 TS，需要跨进程或 HTTP 接入。
- 多语言栈增加部署复杂度。

推荐：

- 如果首要任务是复用现有飞书三包和快速接 Hub，先选 **Node/TypeScript 统一栈**。
- 如果首要任务是管理后台、artifact、用户权限、后台巡检，且接受多语言，选 **FastAPI + React**。
- 当前文档不拍板技术栈，后续 `HUB-STACK-DECISION` 单独做一次原子任务。

## 12. 工作流判断

用户提出的工作流是合理的：

```text
概念设计与边界确认
  -> 每次只领一个原子任务
  -> 任务内先详细设计
  -> 再代码编程
  -> 验证
  -> planning sync
  -> commit
  -> 停止，等待下一次认领
```

建议增强两条：

1. 每个代码任务必须先写接口契约或 schema，再写 UI / route。
2. 每个 adapter 都 mock-first，真实 Hermes / 小龙虾 / Claude Code 接入由用户提供环境与权限后再开。

## 13. 后续候选队列

建议后续按以下顺序进入 backlog：

1. `HUB-STACK-DECISION`：Node/TS 统一栈 vs FastAPI + React。
2. `HUB-BACKEND-SCAFFOLD`：后端壳子。
3. `HUB-CONTRACTS-V0`：事件、adapter、Bridge、Git/artifact schema。
4. `HUB-CONSOLE-SCAFFOLD`：控制台壳子。
5. `HUB-LARK-WIRE`：飞书 gateway 事件进入 Hub。
6. `HUB-ADAPTERS-MOCK`：Hermes / 小龙虾 / Claude Code mock adapter。
7. `HUB-GIT-FORGE-DESIGN`：战队服务器 Git forge 方案。

每个任务都必须有机器可验证 DoD，不允许“理解了 / 对齐了 / 沉淀了”作为完成条件。
