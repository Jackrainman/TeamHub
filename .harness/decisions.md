# 设计约束（Active Decisions）

> 仍约束当前代码/产品方向的决策。争议时 grep 本文件；被取代方案与完整旧稿入口见 `docs/archive/README.md`，细节按其中 Git SHA 恢复。

## D-025 — 技术栈

- Node/TypeScript 统一栈；React+Vite 控制台；Docker Compose 部署硬要求。
- 生产默认 SQLite（D-083 后统一）；artifact 字节进 volume/MinIO，不入 git/DB。
- Git 中枢推荐 Forgejo；TeamHub 只索引联动，不自研 forge。
- adapter 一律 mock-first，真实凭证后置审批。

## D-037 — 核心不变式（I0）

- **人键输出只回本人、当作帮助；第三方只见结构键（task/group/resource），永不见人。**
- 产品定位：CASE 工具 + 团队交流中心 + 战队数据库（给学长减负/给学弟指引/项目同步）。
- silence 只回本人+AI 指引；砍一切管理者面/问责上移。
- AI 指引不计算"被提醒几次"、不沉淀按人历史。

## D-039 — AI 退出治理 + 三支柱

- AI 只留仓管/转译安全车道（整理/检索/拉资料/读图/算量/起草），**不参与治理判断**。
- 治理判断主体 = 人（大三/学长）；系统只如实显示状态。
- 产品 = 三支柱：① 战队知识库 ② 项管看板 ③ 库存-BOM。
- 治理派生整簇（D-032~D-035）挂起；复活触发 = 用户另立拍板"要 AI 参与治理判断"。
- 设计北极星：比死表省事 / 用着就更新（派生优先）/ AI 只当仓管 / 人在环 / 小作坊轻量。

## D-041 — 任务为核心

- 中心实体 = Task，系统围任务转不围人转。
- 项目计划表全员可见（任务+依赖+状态+缺口+分工），不含按人天数/快慢。
- 甘特暂缓（无工期数据、违 G4）；代以依赖图+"搁很久的任务"清单。
- 卡住必带原因；禁止"光秃秃天数+人名"。
- "和人关系"三堆：① 和人无关（安全）② 找谁对接（安全）③ 人治（封存）。

## D-064 — commit+push 默认

- 做完可验证改动即默认 commit+push（trunk-based），不每次问。
- push 前 git fetch 查分叉、有则 rebase。
- 安全边界（SSH/部署/密钥）不在授权内。

## D-072 — 组织结构

- 分配任务只四个组：电控/视觉/机械/电路（设置页可增减）。
- 「程序组」不领任务（= 电控+视觉，仅汇报/过载合并视角）。
- 总联调 = 所有组各到至少一人（不挂单一组，convergenceScope='allLeafGroups'）。
- 车 = 带编号独立对象（单层），displayCode 派生 = 赛季+位置(+版本)。

## D-074 — 版本号纪律

- 产品单一版本 = 根 `VERSION`（SemVer）；`scripts/bump-version.sh` 是唯一改版入口。
- 改 `apps/hub-*/src` 行为的 commit 必须 bump；docs/planning 不 bump。
- 手改 package.json 禁止（防漂移）；pre-commit hook 自动检查。

## D-083 — 产品重定义（防爆肝双主轴）

- 给没有 PM 的小团队一个代打 PM 的工具——把赛前爆肝摊平到整个赛季。
- 双主轴：防爆肝（倒排基准线+验证门+投资任务防砍）+ 防"大号 AI MCP"（学习方向+AI 边界）。
- 第一垂直包 = Robocon 战队包。
- 宪法修正：G4 里程碑有日期（Task 永不加个人 dueDate）；I0 分析对准事不对准人、不做排行榜；AI 排人三红线（事实拼盘不排序/拍板留名归人/只在决策现场）。
- 名字三层（D-085）：事实层带名（认领/验收/拍板）/ 聚合层永不做 / 结构层对事。UI = 名字只在事实卡片、永不进首页/聚合/统计。

## D-090 — 软件架构统一：单运行栈、单持久层、统一模块模板

- 状态：**DECIDED**（2026-08-15，用户拍板先停功能增长、先做仓库级软件架构收口）。
- 目标架构：保留 `hub-contracts ← hub-server/hub-console` 三包；生产只用统一 Node SQLite；产品配置进
  SQLite，env 只留启动/秘密；业务域统一 domain/application/infrastructure/presentation 四层模板。
- 删除双轨：不考虑旧数据兼容；移除分域 JSON、gov-only SQLite、生产 InMemory fallback、游离 workspace、
  子包 lock、多域 client segment 与旧 god Store/Schema。执行真实数据删除前仍须备份并单独确认。
- 跨域写只允许 application service + 显式事务；route 不直接编排多个 repository；测试 fake 不进入生产装配。
- 自动守门：新增架构验证脚本检查包覆盖、依赖方向、版本/lock、裸 query、禁用存储路径和 registry 漂移。
- 实施优先级：`ARCH-UNIFY` 高于当前功能 TODO；以 reimburse 为新模板首个真实纵切，再迁其余域。
- 单一真相：`docs/design/software-architecture.md`。D-025 技术选择中 Node/TS/React/Vite/Compose 继续有效；
  D-081 的阶段一模块化形态被本文目标架构取代。

## D-091 — 文档治理：活文档按领域单源，archive 是精简历史诊断库

- 状态：**DECIDED**（2026-08-15）。文档治理先于 D-090 源码迁移，避免新架构继续受旧设计和状态快照误导。
- 活文档只保留产品/架构/设计系统总纲、每领域一份 canonical、指南/运维和限时研究；任务只进 todo，仍生效决策只进本文件，完成过程只进 commit。
- archive 收成 README/milestones/decisions/incidents/deferred 五份；旧全文通过 Git SHA 恢复，不保留功能级历史稿。
- archive 不是默认上下文，也不是死库：设计冲突、恢复旧路、严重执行异常、同路线连续失败或大改关键边界时，必须按 `AGENTS.md` 定向回查并引用稳定 ID。
- 归档只在 ADR 被取代、阶段结束、出现可复用严重事故、或方案有明确复活条件时补充；普通功能、bug、计划、AI 日志和截图不归档。
- 单一入口：`docs/README.md`；详细增长和回查规则以根 `AGENTS.md` 为准。

## 已归档决策索引

- D-005~D-030（旧技术、飞书、产品转向与文档策略）→ `docs/archive/decisions.md` / `milestones.md`
- D-032~D-035（治理派生整簇）→ `docs/archive/deferred.md`
- D-043/D-053/D-060/D-066/D-081（被取代的流程、UI、模块化方案）→ `docs/archive/decisions.md`
- D-044~D-082 的普通实现账单不再常驻归档；从 `docs/archive/README.md` 的 legacy snapshot 按 Git SHA 恢复。

## D-092 — 公网暴露认证加固（AUTH-GATE，2026-09-04 用户拍板）

- **威胁模型升级**：实例暴露公网（原「内网家庭影院级」假设作废）。自建认证保留（scrypt 散列 + httpOnly cookie + 内存会话），不引外部框架。
- **读闸**：身份模式未登录一律 401，白名单仅 session / GET members / setup/state / setup/super-admin / roster 导入预览模板 + loopback PIN 恢复口（middleware/auth-gate.ts）。**后台无「加后缀就进」的口**——setup 敏感写未登录 401 + 路由层 superAdmin 双闸。
- **首登强制设密码**：无 pinHash 成员登录得 mustSetPin 会话，业务请求 403 PIN_SETUP_REQUIRED，只放行设本人密码；console 整屏 ForcePinGate。
- **PIN 升级密码**：新设/重设 min 8 位（SetPin/SetupSuperAdmin schema）；旧 4 位散列兼容可登录，建议重设。
- **撤销刀⑧②明文副本例外**：绝不回存明文口令；pinPlaintext 字段从契约删除、「显示PIN」端点与 UI 删除、旧库启动清扫（SqlitePmRepository 构造期剥键重写）。忘密码 = 管理员/loopback DELETE 重置 → 首登重设。
- **防在线暴破**：登录失败按 ip|memberId 计，连错 5 次锁 5 分钟（429）；cookie Secure 标记由 env TEAMHUB_COOKIE_SECURE 控制（HTTPS 部署须开）。
- **遗留建议**：公网裸 HTTP（0.0.0.0:4177）下密码可被嗅探——建议改绑 tailnet/loopback 或加 HTTPS 反代（部署侧动作，非代码）。
