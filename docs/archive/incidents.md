---
kind: archive-incidents
status: canonical
truth_for: recurring-failures
last_reviewed: 2026-08-15
---

# 可复用事故与失败模式

格式固定为：症状 → 根因 → 当时错误假设 → 修复原则 → 当前防线 → 来源。普通一次性 bug 不进入本文件。

<a id="arc-inc-001"></a>
## ARC-INC-001 H1 依赖环卡死服务

- 症状：构造自环或成环依赖后，请求依赖图会让 Node 事件循环永久卡死。
- 根因：`computeCriticalSet` 回溯没有 visited；创建依赖的写端点也不拒绝环。
- 当时错误假设：上游数据一定是 DAG，派生函数内部已有部分 cycle guard 就足够。
- 修复原则：不可信图数据在写边界拒绝，在纯派生层再次有限遍历；任一层失守都不能造成无限循环。
- 当前防线：创建依赖校验 + 派生 visited 测试；修改依赖模型时必须同时复核两层。
- original_path: `docs/archive/audits/code-audit-2026-06-14.md` H1
- source_sha: e0761d1c25c2f13306ef55e8afdaea9c4d12ec43

<a id="arc-inc-002"></a>
## ARC-INC-002 H2 File Store 写链永久中毒

- 症状：一次磁盘 I/O 失败后，后续写入全部被跳过，内存显示成功而磁盘不再更新。
- 根因：串行 Promise write chain 在 rejection 后没有恢复；内存先改、持久化后失败。
- 当时错误假设：串行化 Promise 天然能隔离单次失败，进程内视图可代表已持久化。
- 修复原则：写队列必须隔离失败、明确报告持久化结果；内存状态和 durable state 不得假装原子。
- 当前防线：历史 File Store 有失败恢复测试；D-090 将其从生产删除，并把跨域原子性收进 SQLite transaction。
- original_path: `docs/archive/audits/code-audit-2026-06-14.md` H2
- source_sha: e0761d1c25c2f13306ef55e8afdaea9c4d12ec43

<a id="arc-inc-003"></a>
## ARC-INC-003 H3 写端点无鉴权

- 症状：服务绑定非 loopback 时，任意客户端可写任务、依赖和 KB，亦可放大 H1 与资源耗尽问题。
- 根因：把本地开发的网络边界误当业务鉴权，写路由没有统一 pre-handler。
- 当时错误假设：默认监听 localhost 足以保护未来 LAN/容器部署。
- 修复原则：网络位置不是身份；所有写入口必须经过统一写门和 actor/authz，部署配置不得静默扩大攻击面。
- 当前防线：非 loopback `TEAMHUB_WRITE_TOKEN`、`requireActor`/`requireSuperAdmin` 与请求体上限；新增写路由必须复用 helper。
- original_path: `docs/archive/audits/code-audit-2026-06-14.md` H3
- source_sha: e0761d1c25c2f13306ef55e8afdaea9c4d12ec43

<a id="arc-inc-004"></a>
## ARC-INC-004 H4 服务端字段可由请求注入

- 症状：客户端创建任务时可直接写 `done`、`derived` 等服务端拥有的状态，绕过 C5。
- 根因：请求 schema 先 omit 服务端字段，随后又用完整枚举 extend 回去；Store 使用 `??` 而非无条件钉值。
- 当时错误假设：类型名叫 CreateRequest、注释写“服务端派生”就能形成安全边界。
- 修复原则：写侧 DTO 用 pick/omit 明确剥离服务端独占字段，repository/application 层再无条件派生；响应投影同样剥人键。
- 当前防线：contracts 的 `*-requests.ts` 是写侧唯一真相，纯策略共享，服务端字段不得从 body 透传。
- original_path: `docs/archive/audits/code-audit-2026-06-14.md` H4
- source_sha: e0761d1c25c2f13306ef55e8afdaea9c4d12ec43

<a id="arc-inc-005"></a>
## ARC-INC-005 H5 compose 幻影 Postgres

- 症状：启动等待未被应用使用的 Postgres，增加失败点，并让运维误以为数据已经进入数据库。
- 根因：部署清单、运行时代码与设计文档分别演进，没有活体事实约束依赖声明。
- 当时错误假设：提前放入未来依赖无害，compose 能代表目标架构而非当前行为。
- 修复原则：运行清单只声明代码真实消费的服务；未来架构不得伪装成已落地依赖。
- 当前防线：compose 检查与运行栈文档；D-090 生产存储只允许统一 SQLite。
- original_path: `docs/archive/audits/code-audit-2026-06-14.md` H5
- source_sha: e0761d1c25c2f13306ef55e8afdaea9c4d12ec43

<a id="arc-inc-006"></a>
## ARC-INC-006 版本号、workspace 与 lock 漂移

- 症状：根版本、Hub 三包、旧飞书三包和多份 lock 报告不同状态，改版脚本只能覆盖部分源码包。
- 根因：仓库实际有六个包，但 root workspace 和发布脚本只承认三个；子包各自持锁。
- 当时错误假设：用根 VERSION 同步三个主包就等于整个仓库版本单源，外围包可永久独立。
- 修复原则：仓库包清单、依赖图、lock、版本和构建编排必须来自同一 workspace 真相。
- 当前防线：A0 已删除游离包、删除子 lock、让根 workspace/lock/version/bump/Docker 使用同一包清单；架构门同时检查漂移。
- original_path: `docs/archive/known-bugs-fixed.md`, `docs/archive/audits/rot-audit-2026-07-12.md`
- source_sha: e0761d1c25c2f13306ef55e8afdaea9c4d12ec43

<a id="arc-inc-007"></a>
## ARC-INC-007 文档三次减负后再次膨胀

- 症状：D-030、D-070、D-073 均显著降低当时的活文档体积，但随后又积累大量设计稿、状态快照、完成日志和 archive 原文。
- 根因：此前主要执行“搬到 archive”和压缩账本，没有限制文档类别、canonical 数量、归档文件数与写入触发条件。
- 当时错误假设：只要活目录变小、历史不丢，长期上下文成本就自然受控。
- 修复原则：保留知识结论而非过程原稿；活文档与 archive 都必须有固定分类、单一索引和自动增长门。
- 当前防线：活文档登记、每域一份、五份 archive 白名单、稳定 ID + SHA 恢复、截图不入库；普通完成只留 Git commit。
- original_path: `docs/archive/pre-slim/**`, `docs/archive/decisions-full-2026-07-26.md` D-030/D-070/D-073
- source_sha: e0761d1c25c2f13306ef55e8afdaea9c4d12ec43

<a id="arc-inc-008"></a>
## ARC-INC-008 首登 PIN 闸拦截启动探测 → 公网首登死锁

- 症状：公网 HTTPS 反代部署后，新成员登录成功（无 PIN 会话），App 启动闸 `GET /api/setup/state` 被首登闸拦成 403 PIN_SETUP_REQUIRED → 整屏「暂时无法读取设置」，ForcePinGate 永不渲染 → 永远设不了密码，死锁。
- 根因：`auth-gate.ts` 的 `isPinSetupAllowed` 放行清单只含 PUT 本人 pin / session / super-admin bootstrap，漏了 `/api/setup/state`（它只在预登录白名单里，未登录反而 200）；而 App.tsx 启动闸只信该端点且 fail closed。
- 当时错误假设：首登闸只需拦「业务请求」，启动探测端点在预登录白名单里就万事大吉——没把「已登录但无 PIN」这个中间态下前端启动链的实际依赖纳入放行面。
- 修复原则：闸类中间件的放行清单必须逐一对照前端启动链（启动闸 / 登录闸 / 强制设密码门）实际请求的端点；fail-closed 前端启动闸与服务端闸叠加时，按「未登录 / 已登录无 PIN / 已登录有 PIN」矩阵逐格过一遍。
- 当前防线：`isPinSetupAllowed` 放行 GET /api/setup/state；auth-gate.test.ts 回归用例（mustSetPin 会话 setup/state 200、业务端点仍 403）。
- original_path: `docs/operations/https-deployment-investigation-20260903.md`（一次性排查稿，未入库，持久内容已并入 `docs/operations/deploy.md` §9）；含 bug 的 auth-gate.ts 可用 `git show <source_sha>:apps/hub-server/src/middleware/auth-gate.ts` 回查
- source_sha: 175924927016df3296e8cf707b1619511ca85ab5
