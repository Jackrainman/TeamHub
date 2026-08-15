# TeamHub 软件架构总纲

> 状态：**TARGET / 最高优先级设计真相**（2026-08-15，D-090）。
>
> 本文约束 TeamHub 后续所有代码与功能设计。产品边界仍以 `.harness/decisions.md` 为准；软件结构、
> 技术选型、依赖方向、模块模板和迁移顺序以本文为准。若领域设计与本文冲突，先修改本文并记录
> 决策，禁止在功能分支里偷偷创造第二条架构路径。
>
> 用户已明确：当前**不考虑旧数据兼容**。本轮允许一次性重建数据结构、删除旧持久化路径和废弃
> API，不建设迁移兼容层；真正执行数据删除/重建前仍须按安全边界单独确认并备份。

## 0. 为什么现在必须收口

TeamHub 已从单一机器人协作工具长成知识库、项目管理、库存、基准线、检查单、报账、飞书集成等
多域系统。当前主要风险不是功能缺失，而是同一职责存在多条“都能工作”的路径：

- 生产持久化同时存在内存、分域 JSON、旧 gov-only SQLite、统一 SQLite；
- A2 前配置曾同时来自环境变量、`config.json`、代码常量和模块开关；现已收成 SQLite `app_settings`；
- 后端既有 god `GovStore`，又有独立 Store；跨域动作有时直接在路由调用多个 Store；
- contracts 既有按域文件，也有历史 god 文件和跨域 re-export；
- console 既有 feature hook，也有页面直接 `useQuery/useMutation`；API segment 粒度不一致；
- 导入、CSV、文件资源、错误映射等基础能力在局部实现，容易被下一个功能再造一套；
- A0 前 `apps/` 下曾有未纳入根 workspace 的旧飞书三包；现已删除并收成三个 Hub workspace。

继续局部优化会把“能改”变成“只有记住全部历史的人或 AI 才敢改”。本总纲的目标是削减合法
路径数量：**每类问题只有一个标准落点，新增功能只能沿同一个模块模板生长。**

## 1. 架构目标与非目标

### 1.1 目标

1. 一个仓库、一个产品版本、一个依赖锁、一个核心产品进程、一个生产数据库；协议要求独立长连接时，
   外部 bridge 必须作为受根 workspace/verify 管理的显式 integration，而不是游离子项目。
2. 三个核心 workspace 保持清晰依赖方向，业务模块在三包内纵向对齐。
3. 生产环境每个基础能力只有一种实现；测试替身不进入生产装配路径。
4. 业务规则为纯函数，应用编排有唯一服务层，HTTP 与数据库不承载业务判断。
5. 跨域写入显式、可事务化、可测试，不允许路由临时拼接多个 Store。
6. 目录结构本身能告诉人和 AI“该改哪里”，并由脚本验证而非靠记忆。
7. 新模块按模板一次生成完整骨架，禁止先塞进大文件、以后再拆。

### 1.2 非目标

- 不拆成微服务，不引消息队列、Kubernetes、事件溯源或分布式事务。
- 不为假想的多租户市场拆成大量独立 npm 包。
- 不引 ORM、状态管理大框架、CSS-in-JS 或第二套 API 框架。
- 不为旧数据、旧 JSON 文件、旧 URL 或未公开 API 保留长期兼容层。
- 不把“统一”理解为所有领域共用一个 god schema、god repository 或 god page。

## 2. 唯一技术栈

| 层 | 唯一选择 | 约束 |
|---|---|---|
| 运行时 | Node.js 24+ / TypeScript 5.9+ / ESM | 全仓一致，不混 CommonJS 业务源码 |
| 工作区 | npm workspaces | 根目录单一 `package-lock.json`；删除子包 lock |
| 契约 | Zod | schema、请求/响应、纯派生唯一真相 |
| HTTP | Fastify 5 | 只在 hub-server；路由薄层 |
| 数据库 | Node 内置 `node:sqlite` | 生产唯一数据库，不引 ORM/第二数据库驱动 |
| 前端 | React 18 + Vite 5 | SPA，按页面/重功能 lazy load |
| 服务端状态 | SQLite repository | 不存在生产内存/JSON fallback |
| 前端远端状态 | TanStack Query 5 | query key 工厂 + feature hooks |
| UI 图标 | lucide-react | 禁第二套图标库 |
| 样式 | 原生 CSS + 全局 token + feature CSS | 禁 CSS-in-JS 与组件内大段 style |
| 测试 | Vitest + Fastify `app.inject` + Playwright E2E | 不增第二测试框架 |
| 文件解析 | 浏览器本地 adapter + contracts 纯解析器 | 发票原件不上传；容器统一 `fflate` |
| 导出 | 服务端共享 CSV 基础设施 | XLSX 只有真实模板需求时再立 ADR |

新增运行时依赖必须同时满足：现有栈无法合理完成、作用域明确、按需加载可行、测试策略存在，并在
设计文档记录引入与退出条件。仅为少写几十行代码不得引依赖。

## 3. 仓库拓扑

目标根目录：

```text
TeamHub/
├─ apps/
│  ├─ hub-contracts/     # 领域模型、请求响应、纯规则、导入导出纯函数
│  ├─ hub-server/        # Fastify 宿主、应用服务、SQLite repositories
│  └─ hub-console/       # React 宿主、feature UI、feature hooks
├─ integrations/         # 可选外部进程；纳入根 workspace 与根 verify
│  └─ lark/              # 若保留飞书长连接，收成一个边界清楚的进程
├─ scripts/              # 构建、验证、备份、一次性重建工具
├─ docs/                 # README 路由到总纲、每领域一份活文档和使用/运维文档
│  └─ archive/           # 五份精简历史诊断文档；按稳定 ID + Git SHA 定向回查
├─ package.json
├─ package-lock.json
└─ VERSION
```

硬规则：

- 根 `package.json` 的 workspaces 必须覆盖所有可执行/可发布源码。
- 未被根 `npm run verify` 覆盖的 `apps/*` 不允许长期存在。
- ProbeFlash 时期的 `apps/lark-gateway`、`apps/lark-toolkit`、`apps/pf-skills` 已因无真实运行链删除；
  未来需要独立长连接时，只能新建 `integrations/lark` 一个 workspace，禁止恢复三个源码岛。
- 当前根目录只保留一个 `package-lock.json`；三个 hub 子包 lock 已删除。
- 根 `package.json`、三个 hub 包与 `VERSION` 已同步同一版本，bump 从 workspace 清单动态发现目标。

## 4. 三包依赖与层次

唯一允许的包级依赖：

```text
hub-console ───────────────→ hub-contracts ←────────────── hub-server
     │                                                        │
     └─ 不得 import server                         不得 import console ─┘
```

包内统一采用四层：

```text
domain          领域事实与纯规则，无 IO
application     用例编排、权限后的业务流程、跨域事务
infrastructure  HTTP、SQLite、文件、外部系统 adapter
presentation    React 页面/组件，或 Fastify response 映射
```

依赖只能向内：

```text
presentation → application → domain
infrastructure → application ports / domain
domain → nothing outside domain/shared-kernel
```

禁止：domain import Fastify/React/SQLite；route 直接拼业务规则；React component 直接 fetch；repository
调用另一个领域 repository 完成跨域流程。

## 5. 业务模块标准形状

每个业务域必须在三包中使用同一个 domain id 和近似同构目录。以 `reimburse` 为例：

```text
apps/hub-contracts/src/domains/reimburse/
├─ model.ts          # 实体和值对象 schema
├─ requests.ts       # 写侧请求/响应 schema
├─ policies.ts       # derive/validate 纯函数
├─ import.ts         # XML/PDF/OFD 文本纯解析
├─ export.ts         # 建议文件名/CSV 行等纯投影
└─ index.ts          # 本域显式公共 API

apps/hub-server/src/modules/reimburse/
├─ routes.ts         # parse/auth/call service/map HTTP
├─ service.ts        # 用例与事务边界
├─ repository.ts     # port 接口
├─ sqlite-repository.ts
└─ index.ts          # 模块注册描述符

apps/hub-console/src/features/reimburse/
├─ api.ts            # 本域 client segment
├─ hooks.ts          # useQuery/useMutation 的唯一消费点
├─ ReimbursePage.tsx
├─ components/
├─ lib/              # UI 纯函数；通用文件能力不得放这里
└─ index.ts          # 页面注册描述符
```

模块必须一次提供：contracts、server module、console feature、i18n、测试与注册描述符。不存在“先把路由
塞 `server.ts`”“先把 query 写页面里”“先在 index.ts export *”的临时阶段。

### 5.1 shared kernel 的准入门

只有被三个及以上领域稳定复用、且没有业务词汇的内容才能进入 shared：

- ISO 时间、ActorRef、分页、通用 CSV tokenize 等属于 shared kernel；
- “零件匹配”“报账核对原因”“里程碑漂移”属于各自领域；
- 两个调用方不构成共享抽象的充分理由；先重复两处，第三处出现且语义相同再上提。

## 6. 模块注册与组合根

模块清单必须只有一个单一真相 `ModuleDescriptor[]`。同一描述符提供：

```ts
interface ModuleDescriptor {
  id: ModuleId
  registerServer(ctx): void
  page?: LazyConsolePage
  i18n: ModuleI18nBundle
}
```

实际代码可因包边界分别实现 server/console registry，但 module id 清单与启用配置来自 contracts 单一
schema，且有测试证明两侧集合完全一致。

- `server.ts` 只创建平台能力、加载配置、遍历模块注册；目标不超过 300 行。
- `App.tsx` 只创建前端平台能力、加载会话/配置、遍历页面注册；不写领域查询。
- 新模块只改本域文件与 registry 一处；需要改四个以上无关组合文件即说明注册层失效。

## 7. 数据与配置统一

### 7.1 生产只用统一 SQLite

目标生产路径只有：

```text
TEAMHUB_DB_FILE → openUnifiedDb() → module repositories
```

- 删除 `File*Store`、分域 `TEAMHUB_*_DATA_FILE` 和 gov-only SQLite 路径。
- 删除生产 `InMemory*Store` fallback；缺数据库路径或数据库打不开时启动失败，禁止静默重启即丢数据。
- 内存实现只允许放在 `test/support/` 作为测试 fake，不实现生产启动分支。
- 所有模块共用一个 `SqliteDatabase` 与事务设施；表名按模块前缀隔离。
- 不使用“整行任意 JSON 逃避 schema 设计”作为长期模型。简单文档实体可保留 JSON payload，但索引、唯一性、
  状态门与跨域引用必须落成数据库可约束字段。

### 7.2 配置只有两类

**启动配置（env）**：数据库路径、监听地址/端口、写 token、反代信任、外部服务凭证。它们决定进程
能否启动或包含秘密，不由 UI 写。

**产品配置（SQLite `app_settings`）**：启用模块、身份模式、垂直包、报账抬头、词汇覆盖等。它们由
受权 UI 修改、可备份、可审计。

删除第三类：不再同时维护 `config.json`、env 模块列表和代码常量默认值。首次启动向导负责创建
`app_settings`；初始化前 server 只开放 setup 子集。

### 7.3 文件

- 结构化数据进 SQLite。
- 允许持久化的二进制制品进单一 artifact 根目录，SQLite 只存元数据和内容引用。
- 明确禁止上传的发票/付款截图等原件只在浏览器内存处理，不进入 artifact 例外通道。
- 临时文件统一由平台文件服务创建、限额和清理，领域不得自己拼临时路径。

## 8. 后端统一规则

### 8.1 Route

Route 只做六件事：

1. `parseBody/parseQuery/readCsvUpload`；
2. 认证并得到 Actor；
3. 调用一个 application service 方法；
4. 将已知领域错误映射成 HTTP 状态；
5. 用响应 schema 校验；
6. 返回。

Route 不允许：读写两个 repository、计算状态、构造领域实体、手写 CSV、直接访问环境变量。

### 8.2 Application service

- 一个方法对应一个用户用例，如 `submitReimburseBatch()`、`stockInReimburseEntry()`。
- 跨域动作只能在这里发生，并由一个显式事务包裹。
- 跨域依赖通过窄 port 注入，例如报账只依赖 `InventoryStockInPort`，不依赖完整 InventoryRepository。
- 业务失败返回判别联合/领域错误，不在深层抛随意字符串供 route 猜。

### 8.3 Repository

- 一个领域一个 repository port；接口按用例设计，不暴露万能 `getSnapshot/updateSnapshot`。
- 生产只有 SQLite adapter。
- 创建实体、更新时间、ID 生成等通用策略放 domain factory/application service，不在多个 adapter 复制。
- 数据库事务句柄由 application 层控制，repository 不私自开启无法组合的事务。

## 9. Contracts 统一规则

- 每个领域拥有自己的 model/requests/policies/import/export；根 `index.ts` 只显式列公共 API。
- 禁止新的 `schemas.ts`、`fixtures.ts`、`pm-core.ts` 式多领域 god 文件继续增长；迁移时按领域拆除。
- 写请求使用明确 schema，禁止从实体 schema 大面积 `partial()` 生成宽 PATCH。
- 所有状态、校验、汇总和命名规则先写成 contracts 纯函数，再由 server/console 复用。
- fixtures 按领域独立；组合 demo seed 只在统一 demo builder 中做，不允许领域 fixture import 另一个领域 fixture。
- 领域间引用只传稳定 ID/值对象，禁止 import 对方整个实体 schema 形成循环。

## 10. Console 统一规则

- 页面只消费 `useXxx()` hooks；裸 `useQuery/useMutation` 只允许在 `features/<domain>/hooks.ts` 或平台
  bootstrap hook 中出现。
- 一个 module 一个 API segment；`HubApiClient` 只负责组合，不再有 `domain.ts/system-pm.ts` 这类多域段。
- query key 必须由 `queryKeys.<domain>.*` 工厂生成；失效集合由本域 hook 定义。
- Mutation 错误统一走全局 toast；表单需要逐字段错误时由本域 hook 返回结构化错误。
- 跨 feature 业务 import 禁止；跨域导航通过 typed navigation intent，跨域数据通过 API/use case。
- `shared/` 只放真正通用 UI 和无业务纯函数；领域组件不得从 Page 文件导出。
- 每页一个明确主角；设计语言、token、按钮、卡片、空态继续沿现有规范。

## 11. 文件导入与导出基础设施

### 11.1 浏览器本地导入流水线

统一为：

```text
File intake → container expand → format adapter → domain parser → review draft → submit facts
```

- intake/大小限制/拖拽粘贴为平台组件；
- ZIP/OFD 解包统一 `fflate` adapter；
- PDF text/OCR 是格式 adapter；
- 发票字段识别是 reimburse domain parser；
- 组件不得同时负责解包、解析、校验和提交。

### 11.2 服务端导出

CSV 编码、转义、下载 header、合法文件名放 `hub-server/src/platform/export/`。领域只提供 headers、rows
或 typed projection。禁止每条导出路由再写 `csvEscape/toCsv`。

## 12. 错误、时间、身份与日志

- HTTP 错误统一 `{ code, detail, fields? }`；`detail` 给人看，`code` 给 console 分支判断。
- 领域错误码按模块前缀，例如 `REIMBURSE_PURCHASER_MISMATCH`。
- 时间统一注入 `Clock`，领域纯函数显式接收 `now`；禁止业务代码散落 `new Date()`。
- 写操作 Actor 由 server session 注入，客户端不得自报可伪造身份。
- 日志只记录结构事实、request id、错误码和耗时；不生成按人行为统计，不记录凭证和发票原文。

## 13. 测试结构

每个模块的最低测试集合：

```text
contracts: model + 每个 policy/derive/parser 专属测试
server:    service 测试 + sqlite repository 测试 + route app.inject 测试
console:   UI 纯函数/hook 行为测试 + 关键交互组件测试
e2e:       至少一条真实 SQLite + 真进程 + 重启存活主路径
```

- 不再要求同一套 Store 契约跑三种生产实现；改为 SQLite 契约测试 + application service 的 test fake。
- 任何跨域事务必须测试中途失败全部回滚。
- 架构验证脚本属于 verify 门，检查非法 import、游离 workspace、裸 query/mutation、版本漂移和禁用文件模式。

## 14. 自动化架构门

`scripts/verify-architecture.mjs` 已进入根 `npm run verify` 与 pre-commit。A0 当前验证：

1. `apps/*`/`integrations/*` 的 package 必在根 workspaces；
2. 只有根 `package-lock.json`；
3. VERSION 与根/三包 package version 一致；
4. console 不 import server，server 不 import console；
5. contracts 不 import Fastify/React/node:sqlite；
6. route 文件不 import SQLite 具体实现；
7. React 页面无裸 `useQuery/useMutation`；
8. 禁止新增 `File*Store`、`TEAMHUB_*_DATA_FILE`、多域 client segment；
9. 存量旧模式必须匹配“规则 + 精确文件 + 精确数量”基线；债务减少时同步收紧，新增即失败。

模块 registry 三端 ID 一致和各层文件阈值在模块模板落地时启用，不能在目标目录尚不存在时伪造通过。

建议阈值：组合根 300 行、route/service/repository 350 行、React 组件 400 行、contracts 单文件 400 行。
纯数据表/翻译可例外，但须在架构白名单写理由，不能用行数注释绕过。

## 15. AI 与人的协作协议

任何功能实现前，设计/计划必须回答：

1. 它属于哪个 module？
2. domain/application/infrastructure/presentation 各改什么？
3. 是否新造了已有基础能力？
4. 是否产生第二个配置、存储、导入、导出或错误通道？
5. 跨域写的事务边界在哪里？
6. 同批删除哪个旧路径？
7. 哪条自动检查能阻止未来回退？

AI 不得以“兼容旧代码”为默认理由保留双轨。用户已明确无旧数据包袱：迁移批次完成时旧实现、alias、fallback、旧 env 和旧文档必须一起删除。暂时无法删除时任务不能标完成，必须列为同一架构 epic 的阻塞项。

## 16. 收敛迁移计划

功能开发暂缓，先完成 `ARCH-UNIFY`。每刀保持 verify 绿，但允许 API/schema 破坏性变化并 bump minor。

| 阶段 | 原子目标 | 完成标志 |
|---|---|---|
| A0 文档与护栏 | D-090/D-091 生效；旧稿蒸馏删除；单版本/lock；架构门先禁新增违规 | `docs/README.md` 为唯一入口，仓库依赖图单一 |
| A1 仓库与运行时（完成） | 旧飞书三包、JSON/gov-only/生产 InMemory/旧 env 已删除；生产强制统一 SQLite | main 只有一个 DB 装配路径，不写旧数据双读迁移 |
| A2 平台设施（配置已完成） | `app_settings` 与同步 SQLite 事务已落地；继续统一错误、导出、文件 intake、Clock/Actor 和 application UoW | 配置单源，跨域写具有显式事务 |
| A3 模板试点 | reimburse 三包纵切并实现购买方质量门和“报账→库存”事务 | 模板承载真实业务后冻结，不再产生第二套模板 |
| A4 全域迁移 | checklist → baseline → inventory → knowledge → artifacts → schedule → PM/system | 独立域先迁，最后拆 GovernanceSnapshot/GovStore |
| A5 归零 | 删除 god files、旧 Store/client/hook/config/文档，架构白名单归零 | 根验证、SQLite 重启、compose 行为均满足目标 |

## 17. 完成定义

只有同时满足以下条件才算“技术栈统一完成”：

- 生产只有一个 SQLite backend、一个配置源、一个 lockfile、一个版本号；
- 所有可执行源码都在根 workspace/verify 内；
- 每个业务域符合统一模块模板；
- 所有跨域写经过 application service 和事务；
- contracts 没有继续增长的跨域 god 文件；
- console 页面无裸远端状态 hook，API segment 一域一个；
- server route 无业务编排、无直接 SQLite、无手写通用导出；
- 架构验证白名单为零；
- 旧路径已删除，不存在“先留着以后再说”的兼容层。

## 18. 直接后果

- 短期会暂停功能增长，并产生一轮破坏性重构；这是主动支付复杂度本金。
- 测试需要从“三 Store 对称”改为“SQLite 真实性 + service fake 隔离”，数量可能先减少但有效性提高。
- 某些历史设计文档和注释会失效，迁移每刀必须同步归档，避免 AI 读到两套真相。
- 报账购买方校验不再为旧条目设计 `legacy/default` 兼容字段；新 schema 直接成为唯一事实。
- 完成后新增功能的自由度变小，但定位、测试、删除和 AI 修改的确定性显著提高。

## 19. 现存结构处置表

| 现存结构 | 目标处置 | 结束判据 |
|---|---|---|
| `file-*-store.ts` / `PersistedFile` | 删除 | 生产与测试均无 import |
| `mock-*store.ts` / 默认 InMemory 装配 | 生产删除；必要 fake 移 `test/support` | `src/` 无生产内存 repository |
| `sqlite-unified.ts` | 保留思想，改成唯一生产 composition | main 只有这一条 DB 路径 |
| `sqlite-gov-repository.ts` / `GovStore` | 按域拆 repository，最后删除 god interface | 无跨域万能 snapshot API |
| `routes/*.ts` | 逐域迁到 `modules/<domain>/routes.ts` 并变薄；reimburse/checklist 已完成并冻结旧路径 | route 不含业务编排，跨域只走窄 port/UoW |
| `config.json` / tenant env /代码默认 | 已删除并合入 SQLite `app_settings` | 产品配置只有一个读写源 |
| `api/segments/domain.ts`、`system-pm.ts` | 拆成一域一个 segment | segment 名与 module id 对齐 |
| 页面/组件裸 Query hooks | 迁到 feature hooks | 架构脚本零白名单 |
| 根外三个 hub `package-lock.json` | 删除 | 全仓只有根 lock |
| 根/三包版本漂移 | bump 脚本统一同步 | verify 自动判等 |
| 旧 `apps/lark-*` / `apps/pf-skills` | 已删除；历史见 ARC-DEC-001 | 全仓无 `@probeflash` 与旧包目录 |
| 被 D-090 取代的活跃设计 | 标 superseded 后归档 | `docs/design` 不再给出冲突指令 |
