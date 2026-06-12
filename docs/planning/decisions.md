# 关键决策（Decisions）

> 仅当前生效的长期 ADR；过期或被覆盖的（D-001~D-004、D-007、D-008、D-010~D-013、D-017）已归档到 `docs/archive/pre-slim/decisions.md.preslim`，git 历史与归档文件均可追溯。

## D-005：schema 校验采用 zod，不走手写 type guard 路线
- 日期：2026-04-21
- 决策：`apps/desktop` 的运行时 schema 校验统一使用 [`zod`](https://zod.dev)（v3.x）。类型与校验都以 zod schema 为单一事实源，通过 `z.infer` 派生 TS 类型；读盘、AI 输出入库均使用 `safeParse` 以拿到结构化错误。
- 原因：单一事实源避免双份漂移；`safeParse` 返回结构化 `error.issues[]`，满足"仅重生无效字段"的反馈闭环；4 个实体多嵌套场景下手写 guard 代码量过大；zod 是纯本地 devDep，不引入远端调用；tree-shakable，社区成熟。
- 放弃方案：手写 `is*` type guard（样板量大、易漂移）；`ajv` + JSON Schema（双源易脱节）；`valibot`（生态较薄）。
- 适用范围：`apps/desktop` 与后续 Node 侧统一用 zod；`.agents/skills/*/SKILL.md` 里的 JSON 示例仍是规则说明。

## D-006：S1-A3 本地存储采用浏览器 localStorage
- 日期：2026-04-21
- 决策：S1-A3 阶段 IssueCard 的本地持久化使用 `window.localStorage`，键名固定为 `repo-debug:issue-card:<id>`。读取后必须经 `IssueCardSchema.safeParse`：通过返回 `{ok:true, card}`；未命中 / JSON 损坏 / schema 不符返回结构化错误（`not_found` / `parse_error` / `validation_error`），不得静默降级。
- 原因：最短路径跑通 MVP 闭环，与 S1-A4 进度解耦；纯浏览器本地持久化，不引远端调用、不依赖额外 MCP；Node 侧用 Map polyfill 即可 round-trip 黑盒测试；覆盖"重开"语义。
- 放弃方案：`.debug_workspace/active/<issueId>.json`（需 fs/IPC 桥接）；IndexedDB（key-value 单实体场景过重）；内存单例（不跨刷新）。
- 适用范围：仅 S1-A3 IssueCard 持久化；后续 InvestigationRecord / ErrorEntry / ArchiveDocument 落盘归 S2 归档链路。当前主链路已迁到 HTTP + SQLite，localStorage 仅作 fallback / verify 路径。

## D-009：S3 切换为存储迁移与服务器化
- 日期：2026-04-22
- 决策：S3 阶段切换为"存储迁移与服务器化"。当前优先目标是把前端从 localStorage 演示版升级为同一 WiFi 下可访问、服务器端长期存储的版本。
- 本阶段不做：AI、RAG、权限系统、Electron、fs/IPC、大 UI 重构、复杂统计、云同步或公网多租户。
- 原因：局域网共享与服务器长期存储是从静态演示走向战队可用的最短路径；继续推 AI/Electron 不解决多设备共享与数据长期保存。
- 放弃方案：localStorage 强行演示团队共享；立刻写后端跳过环境盘点；转向 AI/RAG。
- 影响：`current_mode = server_storage_migration` 至今仍生效；本地 WSL 最小闭环已通，正在做服务器路径下数据安全验证（DATA-01/03）。

## D-014：服务器部署采用 release tarball first
- 日期：2026-04-26
- 决策：服务器部署以 GitHub Release tarball 为主路径：下载固定版本资产，校验 `SHA256SUMS.txt`，解压到 `/home/hurricane/probeflash/releases/vX.Y.Z`，独立 Node runtime 启动，`current` symlink 指向当前版本，SQLite/日志/env 保存在 `/home/hurricane/probeflash/shared/`；服务器不作为开发 checkout，`git pull` 只是开发/调试方式，非正式部署方式。
- 原因：release 部署可重复、可校验、可回滚；避免源码树漂移、误用系统 Node v10、误删持久数据或把开发态当生产；`current` symlink + `releases/` + `shared/` 让版本切换与数据持久化解耦。
- 放弃方案：服务器长期 `git pull`；把 `shared/data` 放进 release 目录；未校验 SHA256 直接运行；写 `/opt`；直接 systemd；抢占 80；升级全局 Node。
- 影响：DEP-01~06 已按此路径完成（含 systemd reboot 验证）；后续升级 / 回滚遵循同一约定。

## D-015：长期路线图重建为 8 条产品主线
- 日期：2026-04-26
- 决策：以 `docs/planning/roadmap.md` 为长期产品路线图事实源，把后续演进拆为 8 条主线：Deployment / Operability、Data Safety、Core Debug Workflow、Search / Knowledge Base、AI-ready Workflow、Real AI Assistance、Code Context Analysis、Technical Debt / Architecture。
- 原因：8 主线同时保留长期愿景与当前执行边界；近期仍先做部署可用、数据安全、可观测，避免在真实服务器未验证、API key 未确认时抢跑真实 AI 或 repo connector。
- 放弃方案：继续维护只围绕 S3/S4/AI 的短队列；把 AI/RAG/权限/代码扫描提前塞进当前入口；多文档重复维护当前战况长篇。
- 影响：`now.md` 只保留当前 P0 执行窗口与 ≤3 前沿候选；`backlog.md` 一行一候选；`roadmap.md` 保留 8 主线骨架不维护任务态字段。

## D-016：UI 大问题先进入受控 UI 修复链路，TECH-07 只作为中间支撑
- 日期：2026-04-30
- 决策：B 组 repo-local 功能完成后，优先进入受控 UI 修复链路而非先做 broad refactor；具体顺序：`UI-01` → `UI-GATE-01` → `TECH-07` → `UI-GATE-02` → `UI-MOD-01` → `UI-GATE-03` → `UI-RELAYOUT-01` → `UI-GATE-04` → `UI-POLISH-02` → `UI-GATE-05` → `UI-POLISH-03` → `UI-GATE-06`。每个 gate 必须等用户人工 review 通过才能继续。
- 原因：UI 是当前验收观感最大问题；UI 改动必须先有信息架构与人工方向确认；`TECH-07` 价值是降低 `App.tsx` 冲突面，不应独立变成技术洁癖式重构。
- 放弃方案：B 组后直接做 `TECH-08` / `TECH-09` / `TECH-10`；全量重写 `App.tsx`；绕过人工确认大改 UI；引入组件库或 broad CSS reset。
- 影响：UI gate 链已执行至 UI-GATE-06；当前必须停在用户人工 review 桌面/移动端观感，未通过前不得自动进入下一轮 polish。**已被 D-018 覆盖：v0.3 整体冻结，UI-GATE-06 不再推进。**

## D-018：v0.3.0 退役；新方向以 Skill / Bridge / Trail 三 facet 替代单体 issue tracker
- 日期：2026-05-07
- 决策：ProbeFlash v0.3.0 作为完整作品冻结，不再加功能 / 重构 / polish / 写新 verify。后续方向不再做单体 issue tracker，按时间维度拆成三个独立 facet：
  - **当下**：Skill `debug-checklist`——一句症状描述 → 5-8 条带依据和验证动作的检查清单 → 可选写入 `.debug-archive/*.md`。
  - **现在 / 即将**：Bridge（联调板）—— `ROSTER.md` 极简看板，记"我做什么 / 等谁 / 谁等我"，无 server。
  - **过去**：Trail（足迹档案）——静态 viewer，读 `.debug-archive/`，三种视图（个人足迹 / 模块史 / 赛季年鉴）。

  所有数据为 markdown + git native，无 SQLite，无新 server。备赛期只允许 Skill 自用 dogfood；Bridge / Trail 备赛后启动。
- 原因：v0.3 形态本质是"跨组需求单"——为大组织异步协作 + 责任划分 + audit 设计。但目标用户（机器人战队）是 5-15 人小作坊：群里吼一声 / 私聊就解决，结构性不需要 ticketing。"做出来没人用"不是工程缺陷而是形态错配。同时确认两条产品宪法：(1) 填写的成本必须由当下回报抵消——v0.3 让人填"过去发生了什么"，填者当下不受益所以失败，新形态只允许"当下填、当下受益"的输入；(2) 让协作摩擦可见，让产能不可比——量化贡献会异化协作文化（GitHub PR review queue 是好的反例，contribution graph 是坏的反例）。
- 放弃方案：继续推 AIREADY / REALAI / CODECTX / DEP / DATA / UI / CORE / SEARCH 等围绕 v0.3 的演进；为小作坊加权限 / 多租户 / 协作隔离；做 RAG / embedding / Electron。
- 适用范围：v0.3 全部冻结（仅致命补丁）；新工作只在 `.agents/skills/debug-checklist/`、`.debug-archive/`、（备赛后）`docs/bridge/`、`docs/trail/`。pre-pivot 计划全部归档到 `docs/archive/v0.3-pivot/`。
- 影响：`now.md.mode = post_pivot_self_dogfood`；备赛期只允许 skill 自用与 dogfood 记录；D-005 / D-006 / D-009 / D-014 / D-015 / D-016 仍作为 v0.3 的历史 ADR 保留，但不再驱动新工作；本 ADR 之后所有新决策都以 Skill / Bridge / Trail 为框架。

## D-019：明确"阻塞可见但不比产能"——宪法 #2 的边界线
- 日期：2026-05-10
- 决策：设计宪法 #2"让协作摩擦可见，让产能不可比"的精确边界为：**仪表盘只显示任务状态和阻塞原因，不显示人与人之间的完成量排名。** 允许展示"导航模块任务卡了 3 天，需要懂 RTOS 的人支援"；不允许展示"张三这周完成 5 个任务，李四完成 2 个"。核心判断标准：信息能否直接导向"谁需要帮"而不是"谁干得少"。
- 原因：真实痛点（有人卡住没人知道）和产品宪法（不异化协作文化）之间的折中。阻塞可见帮助队员配对、减少等待，而人与人比产能才会触发刷分/隐藏问题等负向行为。用户认为"即使有一定刷分风险，能看到谁被难住而派人帮"的收益大于风险。
- 放弃方案：完全不做任何统计（解决不了"有人卡住没人知道"）；做全量产能排名（直接违反宪法 #2）。
- 适用范围：生效于 Bridge（阻塞看板）和 Trail（个人成长摘要）的设计；Bridge 仪表盘字段只能包含任务名、阻塞原因、所需技能/知识、等待时长；禁止包含个人完成计数、个人效率分、排名。个人 Trail 页面可以显示"自己"的时间线和完成记录（用于自我回顾和汇报），但团队视图不能做人与人比较。
- 影响：Bridge-04 和 Trail-04 按此边界设计；此前 backlog.md 中关于"贡献量化"的禁止条款更新为更精确的表述。
- **D-026 重编号注**：本 ADR 中的"宪法 #2"在 D-026 三层重构后 = **C2**，其边界被 C2 + 反监视四原则 A 继承并强化（红线扩展到任何角色含老师）。本条历史文字保留原编号作记录。

## D-020：飞书开放平台 API 能力边界与限制（事实底座）
- 日期：2026-05-19
- 决策：把用户已委托 gemini 完成的两份飞书开放平台调研报告中与 ProbeFlash 接入相关的事实，固化到 `docs/research/lark-api-capability.md`，作为后续 LARK 系列任务（OSS-SCAN / PATH-DECISION / CONNECTOR-ARCH / MIN-INTEGRATION）的唯一事实引用源。原 gemini 报告保留在 `docs/` 根目录但不直接被工程文档引用。
- 核心结论：
  1. 备赛期最小集成只需走「IM 事件订阅 + 机器人回复」一条路径；多维表格、文档嵌入、AnyBridge、SSE 卡片流式均在 MVP 范围外。
  2. 硬性约束：**IP 白名单**（Serverless 不可行，必须固定公网 IP）、**自定义机器人 Webhook 100 次/分钟**、**Encrypt Key AES-256-GCM 解密 + Verification Token 签名校验 + Challenge-Response**。
  3. 凭证 4 件套：`app_id` / `app_secret` / `encrypt_key` / `verification_token`，由用户线下注入 server 进程 .env，AI 不读不写不打印（AGENTS.md §3 全文生效）。
  4. 2026-03 起企业内部应用 API 免费额度 100 万次/月（每月 1 号重置），备赛期成本视为 0。
  5. 群聊消息读取与通讯录读取属高敏感权限，需企业管理员审批；测试企业沙箱免审，备赛期开发应全程在沙箱内跑通。
  6. 原生自动化流免费版 200 次/月，对外部高频任务等同不可用；ProbeFlash 架构上不依赖原生自动化流。
- 放弃方案：直接引用 gemini 原报告（语气宣传化、含未来不确定推断、不可工程引用）；把 capability 信息散落到多份 LARK 任务文档（多源漂移）。
- 适用范围：本 ADR 是事实陈述层，不含路径选择；路径 A（用开源 SDK） vs 路径 B（自写最小 gateway）的拍板见后续 D-021（LARK-PATH-DECISION）。
- 影响：解锁 LARK-OSS-SCAN（开源候选调研）；为 LARK-PATH-DECISION 提供约束输入；为 LARK-01-CONNECTOR-ARCH 提供接口设计的事实底座。

### D-020 后续：Node-TS 栈开源候选盘点结论（2026-05-19, LARK-OSS-SCAN）
- 路径 A 最优 SDK 基座 = `@larksuiteoapi/node-sdk`（npm 官方包；License MIT；TypeScript 原生；2026-05-14 推送；267 stars；MVP 8/8 需求被直接覆盖）。
- 旧的 `larksuite/oapi-sdk-nodejs` 已 **DEPRECATED**（2023-05-20 后停滞，GitHub archived）；**禁止使用**。
- OpenClaw 协议桥接器（`larksuite/openclaw-lark`、`m1heng/clawdbot-feishu`、`AlexAnys/feishu-openclaw` 等）协议方向与 ProbeFlash 不匹配——ProbeFlash 不是 LLM agent 而是 skill 调度器——仅作为参考实现阅读，不作为基座。
- 路径 B 自写最小 gateway 工程量估算：~250 行核心代码（Webhook 入口 / 加解密 / 签名 / Token 缓存 / 消息发送 / 错误处理）+ 加解密链路单测。
- 详情见 `docs/research/lark-oss-candidates.md`。
- 本条是事实陈述，**不构成路径拍板**；拍板见 D-021（LARK-PATH-DECISION 任务交付）。

## D-021：飞书 gateway 路径选型——用开源 SDK 还是自写最小 gateway
- 日期：2026-05-19（草稿）→ 2026-05-19（用户拍板）
- 状态：**DECIDED**。2026-05-19 用户拍板路径 A，附加两项接受："SDK 作长期依赖"、"启用 SDK 的 Long Connection 模式"。用户原话："A，全部接受，先接进去看看，有问题或者有时间再去优化"。
- 输入来源：D-020 + D-020 后续（`docs/research/lark-api-capability.md` + `docs/research/lark-oss-candidates.md`）
- 决策范围：备赛期 ProbeFlash 实现"飞书 @机器人 收到调试症状 → 调 debug-checklist skill → 飞书群内回复检查单"最小闭环的代码层选型

### 最终决策（2026-05-19 用户拍板）
**路径 A：用 `@larksuiteoapi/node-sdk` 作为飞书侧基座。**

附加决定（用户已接受）：
1. **`@larksuiteoapi/node-sdk` 作为长期依赖**：接受上游政策变更带来的迁移成本；备赛期不预留"脱依赖"的工程预算。
2. **启用 Long Connection 模式作为备赛期短期方案**：用 SDK 内置的长连接订阅模式绕开"固定公网 IP 白名单"约束；备赛期不要求用户先准备固定公网 IP 服务器。备赛后若有时间或出现具体性能问题，再切换到 Webhook + 固定 IP 模式。
3. **执行节奏**："先接进去看看，有问题或者有时间再去优化"——LARK-01 / LARK-03 / LARK-ONBOARD 推进时按 MVP 范围执行，不在 MVP 阶段做性能优化 / 容错加固 / SDK 替换准备。

### 决策依据（拍板前的 AI 推荐 + 用户接受）
理由（按权重排序）：
1. **能力契合 8/8 直接覆盖**——`lark-api-capability.md` §8.1 列的 MVP 8 项需求被 SDK 全部内置，无认知缺口。
2. **加解密链路自实现是大风险**——AES-256-GCM 解密 + HMAC 签名校验自己写时错一行就漏数据/拒收事件，备赛期没时间打磨这条链路。SDK 已经在生产规模下打磨过，复用边际收益显著高于自写。
3. **备赛期时间窗短**——~50 行 vs ~250 行 + 单测 的差距，在备赛期约 1 周的窗口内是"半天 vs 三天"的差距，且后者还要承担加解密 bug 的潜伏成本。
4. **路径 A 不阻断后续脱开**——如果未来要去依赖，gateway 部分可以局部替换；SDK 引入的代码集中在 1-2 个文件，迁移成本可控。
5. **OpenClaw 系桥接器（如 `clawdbot-feishu`）协议方向错位**——ProbeFlash 不是 LLM agent，不应套用 agent channel 协议。

### 选项 A（已采纳）：用开源 SDK `@larksuiteoapi/node-sdk`
- 仓库：`larksuite/node-sdk`（MIT，TypeScript 原生，2026-05-14 推送，267 stars）
- ProbeFlash 集成代码量：~50 行（构造 Client + EventDispatcher.register + Long Connection 启动 + im.message.create）
- 已内置：Token 自动刷新 / AES-256-GCM 解密 / Challenge-Response / 签名校验 / Express+Koa 适配器 / 长连接模式（备赛期主用此模式）
- 引入依赖：`@larksuiteoapi/node-sdk` 一个 npm 包

### 选项 B（未采纳）：自写最小 gateway（零飞书 SDK 依赖）
- 工程量估算：~250 行核心代码 + 加解密链路单测（详见 `lark-oss-candidates.md` §5.1）
- 模块：Webhook 入口 / Challenge-Response / AES-256-GCM 解密 / HMAC-SHA256 签名校验 / Token 缓存与刷新 / 消息发送 / 错误处理与指数退避
- 已存在的脚手架：`docs/archive/pre-pivot-plans/2026-05-16-lark-gateway.md`（保持 `status: forward-looking`；本 ADR 选路径 A，不激活此 plan）
- 引入依赖：仅 Express + Node `crypto`（标准库）；可选 `zod` 做 payload 校验

### 主要权衡

| 维度 | 路径 A 优势 | 路径 B 优势 |
|------|------------|------------|
| 时间窗 | 集成快 | — |
| 依赖控制 | — | 零飞书依赖，无版本锁 |
| 加解密 / 签名链路 | 内置已验证 | 完全可控、可审计 |
| 后续扩展（卡片 / 多维表格 / OAuth） | 低成本 | 高成本（逐 API 自实现） |
| Bundle 大小 | 较大但可 tree-shake | 最小 |
| 备赛后回看 | 上游政策变更需迁移 | 自己持续跟官方文档 |

### 备赛期可行性
两条路径均备赛期可行：
- 路径 A 备赛期可行性：**强**——约半天到一天可跑通 webhook 入站 + 回复消息闭环（前提：用户线下完成飞书后台注册 + 4 个凭证写入 `.env`）。
- 路径 B 备赛期可行性：**中**——~3 天工作量（含加解密单测）；需用户对加密代码有时间审计；若加密链路 bug 排查容易吃掉一天以上。

两条路径都**不依赖** AnyBridge / 多维表格 / 卡片流式更新（都在 MVP 外）。
两条路径都**必须**先解决：
- 4 个凭证：`app_id` / `app_secret` / `encrypt_key` / `verification_token`（用户线下注入 .env）

固定公网 IP 在本 ADR 决策下**不再是路径 A 的硬约束**（启用 Long Connection 模式绕开）；备赛期保留固定 IP 准备工作给"将来切换到 Webhook 模式"，不阻塞备赛期 MVP。

### 拍板已落实的动作（2026-05-19）
1. ✅ 本 ADR 头部从 `（草稿 / DECISION-NEEDED）` 改为 `DECIDED`；"AI 推荐"段已重写为"最终决策"。
2. → LARK-01-CONNECTOR-ARCH 从 `now.md.blocked` 提升到 `frontier`（本 commit 同步）。
3. → `docs/archive/pre-pivot-plans/2026-05-16-lark-gateway.md` 保持 `status: forward-looking`（路径 A 不激活此 plan）。
4. → LARK-03-MIN-INTEGRATION 推进时直接基于 `@larksuiteoapi/node-sdk` Long Connection 模式实现。

### 放弃方案（不考虑）
- `larksuite/oapi-sdk-nodejs`：DEPRECATED，3 年未更新（D-020 后续段已列）
- `lark-openapi-mcp`：MCP 协议方向相反，给"LLM 调飞书 API"用，不是"飞书消息进 ProbeFlash"
- `openclaw-lark` / `clawdbot-feishu` / `AlexAnys/feishu-openclaw`：OpenClaw 协议错位，ProbeFlash 不是 LLM agent
- 飞书 AnyBridge 商业集成平台：备赛期不采购商业版
- 飞书原生自动化流：免费版 200 次/月 死锁（D-020 § 自动化流）
- 自写最小 gateway（选项 B）：路径 A 已采纳，本期不并行做 B；备赛后若出现 SDK 锁定 / 性能问题再重评

### D-021 后续：lark-connector 设计草案落地（2026-05-19, LARK-01-CONNECTOR-ARCH）
- `docs/design/lark-connector.md`（status: draft）已落地：11 节覆盖范围 / 模块拆分 / 接口契约 / 数据流 / 错误模型 / 凭证边界 / 部署形态 / 测试策略 / 扩展路线 / LARK-03 验收标准。
- 关键架构决定（在 D-021 框架内）：
  1. 新建独立子包 `apps/lark-gateway/`（不动 v0.3 冻结代码）
  2. 采用 SDK `WSClient` + `EventDispatcher` 底层 API（非高级 `createLarkChannel`），保留显式控制
  3. **Mock-first 调度模式**：`skill-dispatcher.ts` 提供 mock / claude / deepseek 三分支，MVP 阶段强制 mock；claude/deepseek 留 stub 抛错。理由：MVP 不踩"真实 provider key"边界，飞书链路先打通
  4. Long Connection 模式下不需 encrypt_key / verification_token（连接时鉴权，事件明文推送）→ .env 仅 4 字段：`LARK_APP_ID` / `LARK_APP_SECRET` / `LARK_BOT_OPEN_ID` / `LARK_DOMAIN` + 模式开关 `PROBEFLASH_SKILL_MODE`
  5. 3 秒 ack 边界：mock 模式纯本地字符串拼接远在 50ms 内；后续接 LLM 时改异步链路
  6. SDK 集群行为：Long Connection 不广播，多实例只 1 个随接 → 战队服务器跑 1 实例足够
- 本条不构成新决策，是 D-021 的实现细节展开；LARK-03 代码落地后如有偏差回头更新 design doc 并把 status 升 `stable`。

## D-022 — lark-cli 接入 + lark-gateway 三包拆分

- 状态：DECIDED
- 日期：2026-05-21
- 上下文：D-021 拍板路径 A（@larksuiteoapi/node-sdk + Long Connection）后，lark-gateway 单体子包正在向"入站 + 出站 + 业务 skill"三层混合演进。同时飞书官方维护 @larksuite/cli（200+ 命令，17 域），出站能力远大于 gateway 当前 1/N 实现。
- 决策：
  1. 接入 @larksuite/cli 作为出站 / 配置 / 诊断的补充入口（用户全局安装，不入 package.json deps）
  2. lark-gateway 拆为 3 个独立子包（file: 依赖装配）：
     - apps/lark-gateway/ — 仅入站 WSS 进程
     - apps/lark-toolkit/ — 出站统一门面（boundary.route 内部分流 SDK / lark-cli）
     - apps/pf-skills/ — 业务 skill 调度（debug-checklist 起步）
  3. 硬规则：3 秒 ack 窗内同步路径走 SDK；其余走 lark-cli
  4. §3 对齐：AI 仅可调 read-only 子命令（lark schema / doctor / api *.list/get）；写入类需用户一次一批审批；token store 硬禁读
- 替代项：
  - 全切 shell out（路径 ②）：fork ~50ms+ 冲击 3 秒 ack；lark-cli 无 WSS 入站
  - 死守 SDK（路径 ①）：每加一个能力线性增加 wrapper 代码
- 落地任务：LARK-CLI-01..06（见 docs/archive/pre-pivot-plans/2026-05-21-lark-cli-integration.md）
- 回滚：包级 git revert 到基线 e821c8f；决策级标 SUPERSEDED + 加 D-023
- 关联 spec：docs/superpowers/specs/2026-05-21-lark-cli-integration-design.md

## D-023 — SKILL.md 协议 v1.0

- 状态：**draft**（待用户拍板升 DECIDED）
- 日期：2026-05-24
- 上下文：3 个 v0.0.1 active 业务 skill（`debug-checklist` / `personal-daily-summary` / `pre-match-checklist`）各自落地后，在 frontmatter 字段集、输入字段细分、输出 schema、section 命名上没有统一约定；第 4 个 active skill `atomic-task` 是流程类，结构差异显著。LARK-CLI 系列闭环 + 飞书 / BRIDGE / TRAIL 后续会出更多 skill，新 skill 大规模上来前需要先收敛协议层，否则下游 verify 哨兵 / 飞书触发面 / 用户线下 onboard / 未来 schema 强校验都要按 N 种格式适配。
- 决策：定义 SKILL.md 协议 v1.0。Frontmatter 必填 `name` / `description`，推荐 `trigger` / `protocol_version`，可选 `version` / `status` / `extensions`；body 8 必填 H2 section + 4–5 可选 H2 section；`extensions: {}` 作为未来字段（`input_source` / `hook_chain` / `member_context` / `archive_target`）的硬扩展钩子；版本号机制：协议版本与 skill 自身版本独立 SemVer；v1.0 阶段不强制运行时哨兵，仅提供人工抽检谓词。**不覆盖**流程类 skill（如 `atomic-task`）、退役 skill（`.agents/skill-library/`）、多文件 skill。
- 替代项：
  - 路径 ① 不统一协议（不可持续——N 个 skill 后下游边际成本线性上升）
  - 路径 ② 直接立 zod schema 强校验（备赛期工程预算紧；3 skill 字段差异还在演化会过早锁定）
  - 路径 ③ 照搬 Anthropic 官方 Skills 协议（官方是 LLM 工具调用契约，ProbeFlash 是调度领域 skill，形态错位；与 AGENTS.md §2 末尾 lark-cli skills 命名预警同源）
  - 路径 ④ 把流程类 skill 一并纳入 v1.0（强行统一会让协议太抽象失去解释力；留 v1.0 跑两三个迭代后单独评估）
- 适用范围：v1.0 协议升 DECIDED 后对**新 skill** 立即生效（含飞书 / BRIDGE / TRAIL 系列）；对**老 skill**（3 个 active）通过后续迁移任务逐个达到合规。本期**不动**任何现有 SKILL.md。
- 落地任务：SKILL-PROTOCOL-V1（本任务，design）+ 后续 `SKILL-MIGRATION-V1-*` 系列三个独立原子任务（升 DECIDED 后认领，单 skill ~20 min）
- 详细 ADR 草稿：`docs/design/D-023-skill-protocol-v1.md`（含 §3 放弃方案展开 / §4 影响 / §5 落地任务）
- 关联：`.agents/skills/PROTOCOL-v1.0.md`（协议正文）、`docs/planning/skill-protocol-migration-gap.md`（3 个 skill + 1 个流程类 skill 的迁移差距清单）
- 关联 ADR：D-018（pivot 后 Skill / Bridge / Trail 三 facet——本协议是 Skill facet 的契约底座）、D-022（lark-cli 接入 + 三包拆分——后续飞书 skill 输出按 v1.0 协议）

## D-024 — Teamhub 升级为 Team Hub 战队中枢

- 状态：**DECIDED**
- 日期：2026-06-06
- 上下文：飞书已接入，Hermes / 小龙虾已成为同学顺手使用的入口；已有同学用 Hermes 将整车代码蒸馏为 skill，说明“代码理解 / skill 生成”不必由 Teamhub 独占实现。后续还可能接 Claude Code 或插件体系。与此同时，战队服务器可以承担内部 Git / artifact / 控制台运行层，队员本地写代码、服务器集中托管与观测。
- 决策：Teamhub 从 D-018 的 markdown-only Skill / Bridge / Trail 三 facet，升级为 **Team Hub 战队中枢**：
  1. 大后端负责事件路由、adapter registry、Bridge 状态、Git/artifact 索引、audit/config/health。
  2. 前端是可视化后端控制台，服务于配置、观测、调度、状态修正，不做社区内容站。
  3. 飞书 / Hermes / 小龙虾 / Claude Code / pf-skills 都作为 adapter 或 ingress，不写死为唯一能力。
  4. Skill / Bridge / Trail 保留为 Hub 下的能力 facet：Skill 处理当下问题，Bridge 表达当前协作状态，Trail 沉淀过去经验；不再坚持“无新 server / markdown-only”作为硬边界。
  5. 当前阶段先做壳子与接口，不做炼丹、不做 Trail viewer、不做大型数据沉淀系统。
- `xju-feiyue/` 处理：作为本地参考项目加入 `.gitignore`，只允许借鉴架构、UI 分层、管理后台模式和局部通用代码；禁止整体提交，禁止搬入其社区业务模型、真实内容、账号或私有数据。
- 工作流：后续每次只认领一个原子任务；代码任务必须先有接口契约或 schema，再写 route/UI；adapter 一律 mock-first，真实 Hermes / 小龙虾 / Claude Code / 服务器写入需用户线下配置或审批。
- 替代项：
  - 继续 markdown-only 三 facet：实现轻，但无法承载服务器 Git 中枢、外部 adapter、后端控制台和多入口路由。
  - 直接做炼丹：数据量、标注质量和 eval 都不足，容易在没有稳定业务接口前消耗工程预算。
  - 直接搬 `xju-feiyue` 全栈：开发速度快，但业务模型错误、历史和内容污染风险高，且会把社区站形态误带入战队中枢。
  - 自研 GitHub：不合理；Git forge 应优先使用 Forgejo/Gitea/bare git，Teamhub 只索引和联动。
- 后续任务：`HUB-STACK-DECISION` → `HUB-BACKEND-SCAFFOLD` / `HUB-CONSOLE-SCAFFOLD` → `HUB-CONTRACTS-V0` → `HUB-LARK-WIRE` / `HUB-ADAPTERS-MOCK` / `HUB-GIT-FORGE-DESIGN`。
- 事实源：`docs/design/team-hub-concept.md`

## D-025 — Team Hub 技术栈、部署与数据边界拍板

- 状态：**DECIDED**
- 日期：2026-06-06
- 上下文：D-024 已确认 Teamhub 从 markdown-only 三 facet 升级为 Team Hub 战队中枢。后续要新建大后端、控制台、adapter 插件位和 Git/artifact 索引，必须先拍板后端语言栈、控制台组织、部署形态、DB、artifact 边界和现有 lark 三包接入方式。
- 决策：
  1. 后端采用 **Node/TypeScript 统一栈**，新包位置为 `apps/hub-server/`；不复用已冻结的 `apps/server/`。
  2. 控制台采用 **React + Vite + TypeScript**，新包位置为 `apps/hub-console/`；借鉴 `xju-feiyue` 的 API client / endpoints / schemas / mock / TanStack Query / shadcn 分层，但业务模型全部重写。
  3. Docker Compose 是部署硬要求；后续可部署 milestone 必须能以 Compose 起核心栈，正式部署使用镜像 tag，不要求服务器安装系统 Node 或长期 `git pull`。
  4. 本地战队服务器、云服务器、其他战队 self-host 使用同一代码同一镜像，差异只来自 `.env`、volume、Compose profile 和反向代理。
  5. 生产默认 Postgres；SQLite 只做 dev / 单机 fallback。代码层按 storage port 和可迁移 schema 预留双兼容，但生产可靠性优先于双兼容。
  6. 固件包、日志包、rosbag、诊断 bundle 等 artifact 字节进入 volume / NAS / S3 / MinIO / forge release assets；Hub DB 只存索引、校验和、关联 repo/commit 与保留策略；大文件不进 Git。
  7. Git 中枢默认推荐 Forgejo，Gitea 可替代，bare git 只做低配 fallback；Teamhub 只做索引、联动、通知、健康检查和 artifact 关联，不自研 Git forge。
  8. Ubuntu 20.04 老服务器可短期过渡运行，但不作为公网 self-host 基线；公网部署优先 Ubuntu 24.04 LTS，22.04 LTS 可接受；20.04 需 Ubuntu Pro/ESM 或尽快升级。
  9. `apps/lark-gateway` 作为 lark ingress，`apps/lark-toolkit` 作为 lark outbound adapter，`apps/pf-skills` 作为 skill adapter 接入 Hub。
  10. Hermes / 小龙虾 / Claude Code adapter 一律 mock-first：先做 health / capabilities / invoke stub 和 fixtures，真实凭证、真实命令、真实外部 API 后置审批。
- 替代项：
  - FastAPI + React：后端成熟、`xju-feiyue` 可借鉴更多，但会让现有 TS 飞书三包跨语言接入，增加部署和 schema 双写成本。
  - SQLite-only：单机轻，但不适合多入口并发写、artifact/audit 长期索引和未来 self-host。
  - bare git-only：依赖少，但缺少 Web UI、release/API/webhook 能力，不适合作为战队 Git 中枢默认形态。
  - Teamhub 自研 Git forge 或 artifact 仓库：偏离 Team Hub 控制面定位，维护成本过高。
- 适用范围：Team Hub 后续新代码包、控制台、adapter contract、Compose 部署与数据边界。v0.3 冻结包仅保留历史与致命补丁。
- 后续任务：`HUB-BACKEND-SCAFFOLD`、`HUB-CONSOLE-SCAFFOLD`、`HUB-CONTRACTS-V0`、`HUB-COMPOSE-SCAFFOLD`、`HUB-LARK-WIRE`、`HUB-ADAPTERS-MOCK`、`HUB-GIT-FORGE-DESIGN`。
- 事实源：`docs/design/team-hub-stack-decision.md`

## D-026 — Teamhub 升级为制度化进度治理系统 + 设计宪法三层重构

- 状态：**DECIDED**
- 日期：2026-06-09
- 上下文：2026-06-08 讨论中用户把 Teamhub 的"魂"讲清楚了，方向比 D-024/D-025 更进一步。D-024 把 Teamhub 定位为"信息路由器 + 后端运维控制台 + adapter 底座"（监控 broker），并在 `team-hub-concept.md §4` 把"大型项目管理系统 / 权限系统 / 多租户"列为非目标。但真实需求是：跨组协调 + 管进度 + 不让某些人干太多；当进度卡住、当事人羞于开口时，靠制度让系统替他把卡点说出来，并提前暴露"没人去满足的隐含依赖"，让所有人动起来。这恰恰要求被 D-024 列为非目标的能力（轻量项目管理 + 角色 + 组织树）。监控 broker 定位与该魂结构错配，需自觉演进。
- 决策：
  1. **产品定位**：Teamhub 从"监控 / adapter broker"升级为**制度化进度治理系统**（机器人战队、5-15 人小作坊、无硬截止、轻量）。
  2. **四层架构**（每层只依赖下层）：①数据真相层（项目/赛季 · 成员+角色+资历 · 可配置组织树 · 任务+依赖 DAG · 前置需求 Need）→ ②规则/治理层（卡点 / 过载 / 沉默 / 升级判定——产品的魂）→ ③展示/汇报层（动态最短任务周期图 · 给老师的自动汇报）→ ④触点/集成层（飞书是脸 · Hermes / 小龙虾 / Claude Code / Git adapter）。
  3. **路线 A（系统是大脑、飞书是脸）**：真相在系统关系库；飞书只做汇报 / 通知 / 一键 check-in / 自动生成老师汇报；**不双写**。飞书多维表格因关系弱 / QPS 低 / 写冲突 / 上手难，**不作数据层**。
  4. **三层角色 + 资历维度**：super admin（系统维护者 + 队长）/ group admin（组长）/ member（队员）；member 带年级 / 资历维度，系统对低资历更主动兜底。组织树可配置（机械 / 电路 / 程序{电控, 视觉}，可能合并），不写死。
  5. **按赛季分项目**：RoboCon 每年新车 = 新项目；人员 / 经验跨赛季沉淀。
  6. **前置需求 Need = 一等公民**：任务→需求{描述, 提供方, 状态}；人工填 / AI 建议 / 本人确认。
  7. **进度自动派生 + 无硬截止**：状态尽量从 Git 提交 + 轻 check-in + 沉默超期检测派生，不要求队员日常打卡；不设 deadline，只发可一键回的轻提醒（在忙 / 不太会 / 缺个东西 / 正常推进中），系统不猜原因。
  8. **可视化 = 动态最短任务周期图**：任务依赖 DAG，高亮关键链 / 收敛点（总联调）/ 阻塞链；缺口 = "待点亮的红点"。先做"结构 + 状态"高亮版，CPM 精确工期为远期。
  9. **设计宪法三层重构（方案 2）**：把原 5 条扁平宪法重构为【核心原则 C1-C5】+【治理专属原则 G1-G5】+【反监视四原则 A1-A4】；源在 `AGENTS.md §5`，README / roadmap 派生。旧 `#1-#5` 映射 `#1→C1 … #5→C5`。
  10. **已建 Hub 壳子复用**：hub-server / hub-contracts / hub-console / Compose 作为四层架构里的"触点/集成 + 展示底座"保留；治理域是新增核心。
- **supersede 的旧非目标（本 ADR 有意识推翻）**：
  - `team-hub-concept.md §4` / D-024："不做大型项目管理系统" → 改为"做**轻量**进度治理（5-15 人、无硬截止、结构+状态）"。
  - `team-hub-concept.md §4` / D-024 / `backlog.md`："不做权限系统、多租户" → 改为"做**轻量**三层角色 + 可配置组织树，不做完整 RBAC / 多租户 / 大型 PM"。
  - `docs/superpowers/specs/2026-05-18-bridge-roster-design.md`：飞书多维表格做数据 backbone（人填→系统只读）→ 被路线 A **反转**（系统库做真相，飞书是脸）。模型可复用，载体反转。
  - 旧六段式 Hub 架构（Ingress→Router→Adapter→Bridge→Index→Console）→ 升级为四层，新增"规则/治理层"为魂。
- **被继承 / 部分覆盖的 ADR**：
  - D-018 / D-019：设计宪法来源，被本 ADR 三层重构**继承 + 强化**（D-019"产能不可比"升级为反监视四原则 A，红线扩展到任何角色含老师）。
  - D-024 / D-025：技术栈结论（Node/TS、Postgres、Forgejo、Compose）仍有效；产品定位（监控 broker）被本 ADR 覆盖为治理系统。
  - D-020 / D-021 / D-022：飞书路径 A（SDK + Long Connection）仍有效，作为触点 / 集成层实现。
- 替代项：
  - 守在 D-024 监控 broker 定位：实现轻，但承载不了"制度化暴露卡点 / 缺口"的魂，与真实需求结构错配。
  - 保持 5 条扁平宪法只加子句（方案 1）：下游编号不破，但新魂藏在追加条里主次不突出（用户拍板方案 2 重构分层）。
  - 飞书多维表格做数据层：关系弱 / QPS 低 / 写冲突 / 上手难（上次推广失败主因），否决。
- **开放（待后续拍板，不阻塞本 ADR）**：
  - 架构走法：治理为主轴（hub-contracts 设治理为核心域）vs 治理作 Hub 之上平行模块。
  - ~~提醒可见范围 / 送达机制~~ → **已于 2026-06-10 拍定，见下「D-026 后续：提醒模型 / AI 边界拍板」**。
- 适用范围：mode `governance_design`；后续治理数据模型、规则层、展示 / 汇报层、触点集成的所有新工作。v0.3 冻结包仅历史 + 致命补丁。
- 后续任务：治理数据模型 epic（Project/Season、Member+role+资历、Group 组织树、Task+Dependency、Need）→ 规则 / 治理层 epic（卡点 / 过载 / 沉默 / 升级）→ 展示层（动态最短任务周期图、老师汇报）→ 触点层（飞书 check-in / 通知派生）。
- 事实源：`docs/design/team-hub-concept.md`（重写中，骨架先行）+ `AGENTS.md §1 / §4 / §5`。

### D-026 后续：提醒模型 / AI 边界拍板（2026-06-10，REMIND-MODEL）
- 触发：用户由"把先进技术包装成更精细、更隐蔽的监视器 = 换不来效率反而是控制"的反思，重新界定 AI 在治理里该做 / 不该做什么。判别标准：**被观察者是否是信号的第一受益人、能否无代价地忽略提醒**——若系统价值只在"上面能看到下面"时才成立，则措辞再温柔也是刷了漆的监视器。
- 拍定（解决 D-026「提醒可见范围 / 送达机制」开放项）：
  1. **提醒 = 队长轮询劳动的自动化替身**，不是新增一个"系统盯人"的功能。第一受益人是被催的队员（一条可一键回、可忽略的消息）与队长（不必逐个开口催）；它替换掉的是已经存在、更难受的"人盯人"。
  2. **送达 = 私聊本人**：「该你动了」类提醒先私下给本人，帮忙口吻、可一键回（在忙 / 不太会 / 缺个东西 / 正常推进中）。
  3. **可见范围 = 升级的是事不是人**：对轻提醒的沉默**不**升级为对人的负面信号；只有"某个 Need 持续无人认领"这一**事实**（不挂人名）才升级为缺口任务级、对相关方可见。老师只看项目级，组长看本组缺口级（任务缺 X，不是人慢）。
  4. **AI 边界三分界（C4 / A 的执行细则）**：**起草不发送**（AI 把"找电路组要测试板"的话起草好，发送键本人按——"替你说"收缩为"帮你开口"，agency 留在本人，开口的成长也归本人）；**建议不判定**（"疑似卡住"是系统内部状态，对人输出永远是疑问句不是结论，判定权留本人 / 组长）；**检索不评价**（知识 / 历史 / 找对人放开手脚做，因检索过去不评价现在的人）。
- 落点：`AGENTS.md §5` A3 / A4 同步锐化（"替你开口"→"帮你开口（起草不发送）"；A4 增"沉默不升级为对人信号、AI 建议不判定 / 检索不评价"）；`now.md.open_for_decision` 移除 REMIND-MODEL（ARCH-PATH 仍开放）。
- 关联：本拍板确立"系统给得比拿得多"是观察资格来源；其正面纲领（给的那一侧做厚）由 D-027（成长轴 / 知识图谱）承载。

## D-027 — 成长轴 / 机器人知识图谱（与治理主干并列）

- 状态：**DECIDED**
- 日期：2026-06-10
- 上下文：用户提出"每个人的兴趣点、实际在做的、团队需要的三者可能脱节"。治理主干（D-026）只表达"团队需要"——一个对视觉感兴趣的大一被安排去拧螺丝，在依赖图里只是一个正常节点，脱节不可见。同时反监视拍板（D-026 后续）确立"系统给得比拿得多"是观察资格的来源，但"给"的那一侧此前只停留在原则层。本 ADR 把"给"的一侧做厚，作为反监视的**正面纲领**。参考本地曾复制的 xju-feiyue（新疆大学飞跃手册：学长姐知识沉淀站，笔记×分类×标签 + 订阅 + AI 润色 + 浏览器扩展一键导入）。
- 决策：
  1. **新增"成长轴"，与治理主干并列**（不并入 D-026，因数据与动机自成一体）。三级：**本周在做的**（团队需要 = 治理 Task）→ **相关知识树**（连接层）→ **兴趣方向**（人的未来）。弥合"兴趣 / 实际做的 / 团队需要"三者脱节。
  2. **双图对称**：中央依赖图 = 项目的未来（车离联调差哪条链）；知识树 = 人的未来（我离独立做视觉差哪几个节点）；二者共享治理 Task 节点作交叉点。
  3. **数据**：新增 `KnowledgeNode`（知识点）与 `Member×Knowledge`（掌握 / 兴趣关系）实体；任务可标注涉及的知识点并挂历史资料 / 做过的人。
  4. **MVP = 任务知识标注，树从标注里长出来**：第一步只做"布置任务时 AI 建议涉及哪几个知识点 + 挂相关资料 / 去年做过谁"，几个赛季的标注积累后树的骨架自然浮现，顺带消灭跨赛季知识重复重造。**不预设完整知识本体**（5-15 人养不起课程平台，守 C3）。
  5. **飞书订阅**：触点层 digest 推送（相关知识 / 缺口 / 新资料定时推送给本人），实现参考 feiyue 的"CCF 会议 72h 自动爬 + 推"模式（`_conf_crawl_loop`）。
- 三条护栏（与反监视一致）：
  - **兴趣 / 脱节数据归本人**：脱节信号先私下给本人（"你做的和想学的离得有点远，要不要找组长聊聊换方向？"），是否上交本人决定——否则"三者脱节可见"就成了新的兴趣画像监视面。
  - **知识树无可比进度、不排名、不统计完成率**：树是每个人自己的地图，不是公共记分板；"可选"必须真的可选（守 C2 / A1）。
  - **MVP 不做课程平台**：只做标注，不做内容工程（守 C3）。
- feiyue 边界：架构 / UX / 局部代码模式可参考（笔记×分类、扩展一键导入、AI 润色 diff 采纳、mock-first 前端）；**栈不搬**（Python/FastAPI vs D-025 Node/TS）；社区业务模型禁入（沿用 D-024 / `AGENTS.md §2` 对 xju-feiyue 的约束）。
- 替代项：
  - 塞进 D-026：治理主干已厚，知识 / 成长数据与"暴露缺口"动机不同，混在一起主次不清。
  - 先建完整知识本体：内容工程量大，小作坊养不起，违背 C3 与低录入（C1）。
  - 不做成长轴、只靠措辞规范反监视：治标；正面给予（知识 / 成长）才是化解监视感的根本。
- 适用范围：成长轴数据模型（KnowledgeNode / Member×Knowledge）、知识树展示、任务知识标注、飞书订阅 digest；与治理主干共享 Member / Task / Season。
- 开放：成长轴落在 hub-contracts 的核心域还是平行模块，与 D-026 `ARCH-PATH` 开放项一并拍板。~~（已于 2026-06-11 由 D-028 拍定：落同包独立文件域 `growth.ts`。）~~
- 事实源：本 ADR + 后续 `docs/design/` 成长轴设计文档（待建）。

## D-028 — ARCH-PATH 拍板：治理为主轴（治理实体进 hub-contracts 核心域）

- 状态：**DECIDED**
- 日期：2026-06-11
- 上下文：D-026 四层架构把治理域定为新增核心，但"治理实体进 hub-contracts 核心域（主轴）vs 作 Hub 之上平行模块"一直作为开放项（D-026 / D-027 / `concept §10 待定1`）。GOV-DATA-MODEL-DESIGN + GOV-VIZ-DAG-DESIGN 落地要求先关掉它。
- 决策（用户 2026-06-11 拍板主轴）：
  1. **治理为主轴**：治理实体进 `apps/hub-contracts` 核心域。抽 `common.ts`（ActorRef / isoDateTime 基元），新增 `governance.ts`（Season/Project/Group/Member/Task/有向 Dependency/Need/TaskProgressSignal/BlockAttribution/OverloadSignal/DepGraph 视图）、`attribution.ts`（`deriveBlockAttributions` / `toDepGraphView` 纯函数）。单一 Zod 源、前后端共享、不另造命名。
  2. **成长轴（D-027）落同包独立文件域** `growth.ts`（KnowledgeNode/MemberKnowledge/TaskKnowledgeTag）：共享 common 基元，但与治理主干主次分明（D-027 决策 1"数据与动机自成一体"）。
  3. **现有 hub-\* 壳子降为触点/集成 + 展示底座**：`BridgeMemberState` 保留为派生投影，治理核心用 `MemberSchema`；`Member` 故意不放 `blockedOn`（被谁卡是结构事实，非人的属性）；不双写（G2）。
  4. **渐进迁移、增量不破坏**：现有 broker 契约/导出零行为变化（基元改从 `common.ts` re-export）；server 路由/Postgres 后置，归因先以纯函数进 contracts，可单测、无 IO。
- 反排名结构保证（落在 schema 形状上）：`BlockAttribution` / `OverloadSignal` / `DepGraph` 视图的主键全是 task/group/dependency/need，**无 memberId 维度、无对人计数/时长聚合**，结构上无法 groupBy 出"谁慢了"（C2/A1）。"被卡 vs 摸鱼"的区分依据是"有无 active 确认依赖边指向未完成上游"的布尔事实——无此边则系统沉默、不产生归因（A4）。
- 替代项（治理作平行模块）未采纳：少动现有契约，但两套 ActorRef/响应风格长期撕裂、Member/Task 跨包重复，违"单一 Zod 源"。
- 落地（2026-06-11 同日）：`apps/hub-contracts`（common/governance/growth/attribution + 真实场景 fixtures + 11 项归因单测，`verify:all` 全过）；`apps/hub-console` 新增"依赖链·阻塞归因"视图（`@xyflow/react`，**blocked-idle 红斜纹+锁 / free-idle 琥珀虚线+空心圆** 一眼可分，"被卡去学"中性入口"这段时间可以看的资料"），mock 数据由 `toDepGraphView` 从场景 fixtures 派生（不是硬设状态），`verify:all` + preview 走查通过（视觉C → blockedIdle "被「R1 底盘调试」卡住"，机械D → freeIdle）。
- 关闭：D-026 `ARCH-PATH` 开放项、D-027 成长轴落点开放项。
- 事实源：`docs/design/gov-data-model.md` + `docs/design/gov-viz-dag.md` + 代码契约 `apps/hub-contracts/src/{governance,growth,attribution,common}.ts`。

## D-029 — 差异化在场排班：共享物理资源门控 → 派生在场 / 随叫 / 去学

- 状态：**DECIDED**
- 日期：2026-06-11
- 上下文：06-11 真实痛点澄清把"按依赖位置差异化排班"点名为**可能的杀手锏（通用 PM 没有）**——锚点事件：实车是单一共享物理资源，其状态门控所有下游；车被某拨人占用 / 撞坏 → 下游来了也只能空耗、火大、伤团结，程序组永远最后一关要燃尽。但该候选一直只在讨论里，未进 repo backlog/now（思考领先仓库）。本 ADR 把它正式立项并落数据模型 + 派生 + 一屏交互设计。
- 决策（用户 2026-06-11 拍板）：
  1. **共享资源升一等实体**：新增 `SharedResource`（`status: available/inUse/down/upgrading` + `statusReason` 中性事实 + `robotTarget` 对齐 Task）。"车撞坏 = 一个状态翻转整片下游变 free"，不必手摆 N 条 pairwise `sharesResource` 边。
  2. **占用窗口粗粒度 + 接力**：`ResourceSession` 带 `windowLabel`（粗标签不锁 enum）+ `orderInWindow`（窗口内"先程序后机械"接力），**不锁定钟点**（`startsAt/endsAt` 留 open）。队长一拍即录（低录入 C1）、`confirmedBy` 确认才参与派生（C4）。
  3. **一次可选多组多人 + 备注**：`ResourceSession.invitedMemberIds` + `note`，但仅本窗操作名单、**绝不跨窗按人累计**。
  4. **派生输出按组键**：`derivePresenceSchedule` 纯函数 → `PresenceRecommendation`（`present/onCall/free`），差异化由依赖位置 + 资源状态自动落出（持有组在场 / live 上游组随叫 / 被卡组去学 / 资源 down 整片去学 / 无关组沉默），不手排、不评人；free 挂"可看的资料"（A3）。
  5. **布置任务 / 排班按小组、汇报按大组**（用户 2026-06-11 校正）：大组 = 程序 / 电路 / 机械；程序大组下有电控 / 视觉两个小组（`Group.parentGroupId` 自引用，电路 / 机械本就顶层）。排班单元是**小组**（`groupId`，电控被卡 ≠ 视觉被卡），跨小组的收敛任务（总联调）可挂大组；`PresenceRecommendation` 加 `reportingGroupId`（顶层大组祖先，`topLevelGroupId` 上溯），汇报 / 过载按大组滚动、排班细节停在小组。视图先按 `reportingGroupId` 分组、组内列小组。
- 反排名结构保证（落在 schema 形状上）：`PresenceRecommendation` 主键全是 group/resource/task，**无 memberId 维度、无出勤计数 / 时长聚合**，结构上无法 groupBy 出"谁在场最久"（C2/A1）。`invitedMemberIds` 仅输入侧单窗名单 + 不做按人聚合视图 → 累计不出出勤排名。`mode` 是*需求陈述*（这段工作需要谁在）不是*产能分*。与 06-11"该看的是谁被什么卡 + 谁要燃尽，皆任务 / 依赖键"一致——红线不动。
- 替代项（不建资源实体、继续用 task↔task `sharesResource` 边 + 全局"车可用"布尔）未采纳：表达不了多车 + 撞坏原因，"车 down 全卡"要手摆 N 条边。
- 落地（2026-06-11 同日，design + 数据模型，活页面下一任务）：`apps/hub-contracts`（`governance.ts` 新增 SharedResource/ResourceSession/PresenceRecommendation + `schedule.ts` 的 `derivePresenceSchedule` 纯函数 + 锚点场景 + down 变体 fixtures + 12 项排班单测；`verify:all` 全过 26 测）；设计 + 一屏交互见 `docs/design/gov-oncall-schedule.md`。控制台"谁该在场"活页面 = `GOV-SCHED-VIZ-DESIGN`（下一原子任务）。
- Open（标进 now.md）：窗口精确钟点语义；invitedMemberIds 展示边界；overloadRelief 触发（归 GOV-RULES-LAYER）；ResourceSession 真实占用来源（归 GOV-LARK-DERIVE）。
- 事实源：`docs/design/gov-oncall-schedule.md` + 代码契约 `apps/hub-contracts/src/{governance,schedule}.ts`。

## D-030 — 文档保留规则 + 退役死肉/双写（dogfood 单一真相源）

- 状态：**DECIDED**
- 日期：2026-06-11
- 上下文：讨论"文档是否还有必要留这么多"。体检：活文档（非 archive）8838 行，其中 `docs/superpowers/plans/*` 占 4038 行（46%）——全是 pivot 前已落地 / 已弃功能的实施计划；且 `team-hub-concept.md` 与 `team-hub-product-definition.md` 是同一篇定位的两个版本（双写），叠加 `decisions.md` D-026 ADR = 同一套定位记三遍。**TeamHub 的魂就是单一真相源 + 低录入 + 派生而非双写——其文档仓库正违反自己的戒律。** 把 §9 对 skill 已用的"退役而非删除"纪律搬到 docs。
- 决策（用户 2026-06-11 选定范围 1+2）：
  1. **文档保留规则**：一篇文档留在 `docs/design`/`docs/research`，当且仅当它是 (a) 某个已 ship 或 frontier 功能的当前 spec，或 (b) 一个人会照着做的 guide。凡"导向某决策的调研"或"某项已完成工作的计划"，`git mv` 进 `docs/archive/`，结论留在本文件。archive≠delete（git 历史 + `docs/archive/` 保留）。
  2. **本轮退役**：`docs/superpowers/plans/` → `docs/archive/pre-pivot-plans/`（3 个 pivot 前大 plan，4038 行）。
  3. **本轮合并（杀双写）**：`team-hub-product-definition.md` 的独有实质（数据模型细节：牵头组=重心组 / Assignment 多对多带角色 / 跨组天然 / Resource 争用；中央视图务实版；反监视机制；假完成判定）并入 canonical `team-hub-concept.md`，原文件退役至 `docs/archive/team-hub-product-definition-v0.md`（status: retired）。**canonical 单一定位源 = concept.md**。
- 暂缓（用户认同，记此以免遗忘）：`lark-api-capability.md` + `lark-oss-candidates.md` 暂留 `docs/research`——前者仍是 pending `GOV-LARK-DERIVE`（触点层）的事实底座，二者均被 append-only 的 D-020/D-021 引用，现在动会 churn 决策日志且收益仅 364 行；**待 GOV-LARK-DERIVE 落地后归档**。scope 3（`superpowers/specs` / `visuals.md` / `D-023` / `workflow-evolution` / `agents/workflow`）未在本轮范围，留待后续；`docs/superpowers/specs/*` 内对已移走 plan 的交叉引用暂为 stale path，随 scope 3 一并清理。
- 影响：活文档 8838 → ~4760 行（−46%）。引用更新：`now.md`（product-definition→concept）、`lark-connector.md` / `decisions.md`（plans 路径→archive）。
- 事实源：`docs/design/team-hub-concept.md`（canonical 产品+架构）；本 ADR（保留规则）。

## D-031 — 概念调研：数据生命线命门比"录入"更深，frontier 重排

- 状态：**DECIDED**
- 日期：2026-06-11
- 上下文：用子 agent（ground → 6 个 pending 概念区设计 → opus 跨切面缺失综合 → opus 对抗 critic，9 agent，结论全部回源核实）调研后续概念设计并找缺失。核心发现：6 份设计草案都**假设三个公共底座已存在**，但代码里全是空的；且整条"被卡 vs 摸鱼"判定压在一个**没有派生来源、还在撒谎标 `updatedBy:'derived'`** 的字段上。当前 frontier 第一位 `GOV-DEP-INTAKE` 其实**不是最深命门**——它前面压着 server 治理骨架与 idle 派生两层，缺它们则录入了也只是把数据写进一个没人读、没有真实 now/快照注入的洞。
- 已核实的命门级缺失（带 file:line）：
  1. **三层地基全空**：`hub-server` 无任何治理路由（`server.ts` 只有 broker fixtures 路由，real 模式 `GET /api/dep-graph` 直接 404）；`lark-toolkit` 只有 `reply(text)`（`index.ts:9`，无 sendCard/卡片回调）；无 ViewerContext/认证/身份映射。每区都假设它在、没人负责先建。
  2. **真信号→idle 派生链断在最后一截**：`ownerIsIdle`（`attribution.ts:65`）只读 `Member.status==='idle'`，但该字段在 `fixtures.ts:253` 是手填硬常量却标 `updatedBy:'derived'`（无 `deriveMemberStatus` 函数）；且它与 `currentTaskId` 指向的 `Task.status` 构成事实双写（违 G2，m-visionC idle 却持 inProgress 任务）。**最尖锐：`freeIdle` 会把"队长还没录入下一个任务/依赖"的人误判成"真摸鱼"**——系统自己制造了"摸鱼=测量错误"，且"未录入"没有 `blockedIdle` 那样的洗白态，直接打脸锚点场景"一眼可分"。
  3. **看起来已 ship 实则空壳**：`OverloadSignal` 只有 schema+type、零 derive 函数/fixtures/测（三痛点里"负载错配"在 schema 层就停了却被记功）；`Need.escalated` 枚举值/字段在但无任何函数做 open→escalated（`escalatedAt` 全 null），A4"系统唯一授权的施压机制"是死代码路径。
  4. **两处一行级 C4 破口**（已修，见 commit 17316cc）：`relatedKnowledgeFor` 不过滤 `confirmedBy`、`computeCriticalSet` 喂全量 deps 而非 liveDeps——均暂被 fixtures 掩盖，`GOV-DEP-INTAKE` 接真实 AI 即爆。
- 决策（用户 2026-06-11 选定范围 2+1）：
  1. **范围 2（已落地，commit 17316cc）**：先拆两处一行 C4 雷 + 2 锚定测试；hub-contracts 29 测 + hub-console 4 测全过。
  2. **范围 1：frontier 重排**——把 server 治理骨架与 idle 派生提到录入之前。新 top-3：`HUB-SERVER-GOV-SCAFFOLD`（可变内存 GovernanceStore + 治理路由骨架 + now=server clock 注入）→ `GOV-MEMBER-STATUS-DERIVE`（idle/working/blocked 纯函数派生 + 解决与 Task.status 双写 + **第三态"未录入"**，schema 待本轮讨论拍）→ `GOV-DEP-INTAKE`（前两者落地后才有真实写入/读取出入口）。`GOV-RULES-LAYER` / `GOV-CONCEPT-REWRITE` 退出 top-3（仍在 backlog）。
- 待拍（用户线下 / 下一轮讨论）：`GOV-MEMBER-STATUS-DERIVE` 的"未录入"第三态如何建模才不让 `freeIdle` 冤枉人（讨论项 4）；`OverloadSignal` 派生 / `Need` escalated 转换 / `LARK-CARD-CHANNEL` + `LarkMemberBinding` 立为 backlog 行。
- 影响：`now.md` / `agent-state.json` frontier 重排；新增上述 pending 区入 backlog。本 ADR 不改代码（范围 2 的代码改动在 17316cc）。
- 事实源：本 ADR；ultracode 调研产物（本 session task `wu26owofd` 输出，含 6 区设计草案 + 13 条缺失清单 + 对抗 critic 5 条补漏）；`docs/design/team-hub-concept.md`（canonical）。

## D-032 — 治理提示层 GovernanceCue 统一 + Member.status 全派生 + 静默信号

- 状态：**DECIDED**（spec 落 `docs/design/gov-cue-layer.md`；实现属 frontier `GOV-MEMBER-STATUS-DERIVE` + `GOV-RULES-LAYER`）
- 日期：2026-06-11
- 上下文：D-031 暴露的"freeIdle 会把'队长还没录入下一个任务'的人误判成摸鱼"——系统自造测量错误。讨论中用户把 idle 检测从"贴人标签"reframe 为"建设性提示触发器"（对本人"去看别的知识?"、对队长"xx 做完了去聊聊"、颜色中性变化），并选定对"有就绪任务却 N 天零进展"这一种（真·摸鱼候选）用**私下静默信号**（事级、对事不对人、看得见但不排名）。进一步发现：idle 三态 + 静默 + Need 升级（A.3 死代码）+ OverloadSignal（#4 空壳）是**同一个形状**，应收成一层。
- 决策：
  1. **`Member.status` 完全派生**：Task 是真相、人是投影，禁手写——杀掉与 `Task.status` 的双写（守 G2）。`updatedBy:'derived'` 不再是谎。
  2. **三个非推进态 + 静默**（`deriveMemberStatus`）：`uncovered` 待安排（无 active 任务→队长去派活，= 录入入口）/ `blocked` 被卡（复用 BlockAttribution）/ `capacityFreed` 腾出手（做完→本人去学 + 队长去聊·匀给过载组）；外加 `silence` 静默（有就绪任务却 N 天零进展→私下问本人 + 给队长事级提示）。`silence` 与 `capacityFreed` 之别 = 手里有没有就绪任务；两者都不贴"摸鱼"。真摸鱼靠队长"去聊"的对话发现，不进看板计数。
  3. **统一 `GovernanceCue` 层**（多态）：所有派生的"事/缺口/机会"= 一个 schema `{kind, subjectRef(task/group/need/resource), audience, tone(give/ask/surface), factStatement, suggestedAction, relatedKnowledge}`。**反排名红线只守在这一个 schema**（无 memberId 聚合维度、无 count/score/rank）。`GOV-RULES-LAYER` 由此重定义 = "Cue 生产者们（deriveBlockAttributions 已有 + deriveMemberStatus + deriveNeedEscalations + deriveOverloadSignals）+ `RulesConfig` 阈值"。
  4. **受众到人不落人名**：`audience='taskOwnerPrivate'` 不存 memberId，送达层即时解析 owner→larkOpenId 私发，不沉淀可聚合人维度 → 反排名保住。
  5. **阈值进 `RulesConfig`**（per-project，全默认值：silenceDays=3 / needEscalationDays=2 / overloadCriticalLimit=3），不强制录入（C1/C3）。
  6. **idle↔overload 闭环**：`capacityFreed` 与 `overload` 同层，队长一眼配对"谁空了 ↔ 哪组压了 N 项"。
- OPEN（留字段、本轮不定）：**`CUE-AUDIENCE-ROUTING`——队长 vs 组长身份难界定**：role enum 仅 `superAdmin/groupAdmin/member` + 组织树 `parentGroupId`，"队长(全队)"与"组长(子组)"如何落、一个 Cue 上给队长还是停在组长，决定 `audience` 枚举最终形态。单立 open_for_decision，配独立讨论提示词，归 ROLE-VISIBILITY。其余 OPEN：静默是否被读成变相监视（措辞+频率冷却）、阈值是否需 per-赛季 profile。
- 影响：新增 `docs/design/gov-cue-layer.md`（spec）；`GOV-MEMBER-STATUS-DERIVE`（frontier#2）从此有落地图纸；`GOV-RULES-LAYER` 范围明确为 Cue 生产者层；`now.md`/`agent-state.json` 加 `CUE-AUDIENCE-ROUTING` 入 open_for_decision。本 ADR 不改代码。
- 事实源：`docs/design/gov-cue-layer.md`；本 ADR；`docs/design/team-hub-concept.md`（canonical）。

## D-033 — ROLE-VISIBILITY / CUE-AUDIENCE-ROUTING：角色模型 + 受众路由 + 问责上移

- 状态：**DECIDED**（spec 落 `docs/design/gov-role-visibility.md`；实现属 frontier `GOV-MEMBER-STATUS-DERIVE` / `GOV-RULES-LAYER` / `HUB-SERVER-GOV-SCAFFOLD`）
- 日期：2026-06-12
- 上下文：关闭 D-032 §3 OPEN（`CUE-AUDIENCE-ROUTING`）。`GovernanceCue.audience` 只有 `taskOwnerPrivate/captain/groupAdmin` 三占位、无路由表——因为"队长(全队)"与"组长(子组)"在 role enum `{superAdmin,groupAdmin,member}` + `Group.parentGroupId` 多层自引用树上界定不清（程序大组下电控/视觉子组，电路/机械顶层；汇报按 `reportingGroupId`，D-029）。经两轮对抗式审计核实（8-agent 宪法审计 + 3-agent 产品目标核实），原"schema 反排名足够保证多帽安全"被纠为**对 A1 的范畴错误**——schema 守 C2 聚合排名，但不防 A1 单条点名与 C2 广度×时间重建，必须靠去名 + k-anon + dedupe 在投影/送达层补。
- 决策（用户 2026-06-12 拍板）：
  1. **role enum 不动** `{superAdmin, groupAdmin, member}`，零迁移。`superAdmin` 收窄为系统维护者/配置，**非 Cue 受众**；`groupAdmin` = 可 pull 本组事/缺口的可见性能力，子组/大组组长都是 groupAdmin、由 groupId 区分。
  2. **三处指派拆开 D-026 dec4 的"superAdmin = 维护者 + 队长"合并**（搭建权 ≠ 全队治理权 ≠ 只读观察）：新增 `Group.leadMemberId`（组长权威源，消"一组两 groupAdmin 谁带组"歧义）· `Project.captainMemberId`（队长 → `teamCoordinator`）· `Project.observerMemberIds[]`（老师 → 仅项目级 rollup）。队长/老师不进 enum 因其赛季级 + 与组长正交 + observer 多对多（1:1 enum 装不下、塞进去要 junction = 违 C3）。
  3. **audience 最终三值（改名取消歧义）**：`taskOwnerPrivate`（本人私发，不存 memberId）/ `subjectGroupLead`（按 subject 取 groupId：task→groupId·group→id·need→providerGroupId·resource→直升队长，经 `leadMemberId` 解析、有界上溯 子组→大组→队长兜底）/ `teamCoordinator`（队长）。配一张「Cue kind × 受众 × 升级链」路由表（见 spec §4）。
  4. **silence 受众 = 纯 pull（用户选 A）+ 问责上移**：silence 只私发本人「还在做 X 吗?」、**不 push 任何第三方**；停滞以事键快照「任务X·就绪·无进展」在本组 console pull 显示（快照非按人历史、本组组长可见 owner、更宽视图去名）。「如果还没看到就是组长的问题」——问责朝上（管理者注意力可问责）不朝下（监视队员），摸鱼从"抓坏队员"重述为"管理有没有在看"，并分散资历弱者压力（G5）。
  5. **可见性双轴（广度 × 深度）**：member/组长/队长/老师/superAdmin 分层；**任何层级（含队长、老师）都不见人均完成量排名（C2）**，越高 = 事/缺口广度越宽、绝非人粒度越细，老师深度最浅（仅大组 rollup）。push 升级门控；pull 每个 groupAdmin 只看直属组、大组只见去名 rollup（防大组 lead 旁观子组 silence 绕过门控）。
  6. **审计必修硬化（红线落投影/送达/测试）**：去名宽视图（ownerLabel 仅私链）· factStatement 文本红线测试（扫 `/静默\d|\d+天/` + 非私发 Cue 无 displayName）· 老师 `toObserverRollup` k-anonymity（子树成员 <k 合并/抑制，挡单人组点名，如 grp-circuit 单人且是 Need.providerGroup）· noticer 良基化（老师终极兜底「顶层未路由」）· owner==lead 上抬不留盲区（修 G5 反转）· owner==lead/captain dedupe 抑制协调面 · null captain → pull-only + superAdmin 配置提示不静默丢。
- 替代项（增长 role enum 加 captain/observer）未采纳：steelman 结论 keep-enum-unchanged——observer 多对多是致命点，进不了 1:1 enum；项目级字段是赛季级正交指派的正确关系表达；零迁移、天然支持一人多帽（并集可见性，安全靠去名/k-anon/dedupe 而非 enum 互斥）。
- 影响：新增 `docs/design/gov-role-visibility.md`（spec）；`gov-cue-layer.md` §2 audience 改名、§3 关 OPEN、§4 silence 行改纯 pull、§8 OPEN#1 移除；`now.md`/`agent-state.json` 移除 `CUE-AUDIENCE-ROUTING` 出 open_for_decision；supersede D-026 dec4 的 superAdmin 合并。为 frontier 列出 schema/纯函数/测试落地清单（spec §9）。本 ADR 不改代码。
- 事实源：`docs/design/gov-role-visibility.md`；本 ADR；`docs/design/gov-cue-layer.md`；`docs/design/gov-oncall-schedule.md`（reportingGroupId，D-029）；`AGENTS.md §5`。

## D-034 — 数据生命线分组化：silence 信号按组分河（C5）+ 保守过渡铁律

- 状态：**DECIDED**（spec 落 `docs/design/gov-cue-layer.md` §6；实现属 frontier `GOV-MEMBER-STATUS-DERIVE` / `GOV-RULES-LAYER`）
- 日期：2026-06-12
- 上下文：对抗式产品核实（3-agent，REJECT「摸鱼可见」）抓到 silence 触发的**信号源偏差是 schema 级宪法破口、非可调阈值**：「零进展」只从 `{gitCommit, larkCheckIn, manualNote}` 判定、**无任何 GroupKind 维度**（governance.ts:50-55 有 enum 但零逻辑 key off）。后果按工作物理性质不对称——程序连续 commit、硬件做物理活（锉件/焊板/台架）几乎零 commit，同样努力对程序"干净"、对机械/电路"静默"。这是 **C2（产能不可比，gitCommit 密度=因角色而异的产能代理）+ A1（"机械组老静默"成可读模式）+ G5（冤枉恰是 fixtures 里 freshman 机械新生 m-mechC/m-mechD）by proxy**。用户校正：硬件/机械"没那么容易卡"，重灾区在程序。reframe：信号偏差不是调阈值，而是**每组一条数据河（C5：治理状态必须有自然上游）**。
- 决策（用户 2026-06-12：图纸喂信号 + 程序薄封装 git）：
  1. **silence 按 GroupKind 分河**：机械/电路河 = **图纸版本上传**（新 `ProgressSignalKind='artifactUpload'`，喂硬件进度信号——这才是 §信号偏差的真正修法，对齐用户"机械图纸从微信迁上服务器按天/版本分类"的诉求）；程序河 = **git**（经薄封装 adapter 降门槛，HUB-GIT-ADAPTER-DESIGN，D-036）；通用兜底 = **larkCheckIn**，但须是回 Cue/digest 的**自然副产品**，**不得变日报打卡**（守 C5 禁凭空打卡）。
  2. **保守过渡铁律**：在各组的"河"真实接入前，**非 program 组的"git 缺失"一律不触发 silence**——宁可漏报不冤枉（硬件本就难卡）。这是过渡期护栏，避免 GOV-MEMBER-STATUS-DERIVE 一上线就用 commit-absence 冤枉硬件组。
  3. **presence 佐证**：owner 当窗在某 `ResourceSession` present/onCall（物理在场干活的证据）→ 抑制 silence；复用已落地 `derivePresenceSchedule`（schedule.ts），零新录入。
  4. **`RulesConfig` 阈值改 group-kind-keyed**：`silenceDays` 按 GroupKind 配（硬件更长 + 更强触发）；新增 `silenceCueCooldownDays`（同任务每窗至多一条协调 Cue，杀"反复 silence 累积成对人信号"，A4）。
  5. **parity 单测要求**：仅差 `group.kind`、相同 larkCheckIn/manualNote 历史的两任务 → 必须出相同 silence 判定（gitCommit 计数对非软件组 silence **可证明不承重**），落进 `governance.test.ts` 反排名 guard 同款体例。
- 替代项（继续单 project 标量 `silenceDays` + 三信号源不分组）未采纳：审计证其为 C2/A1/G5 三破口、且系统性偏向资历弱的硬件新生，不可调走。
- 影响：`gov-cue-layer.md` §4（silence 触发条件细化为分河 + 保守铁律）/ §5（deriveMemberStatus 须读 group.kind）/ §6（RulesConfig kind-keyed + cooldown + 分河 + presence 佐证 + parity 测试）同步。新 `ProgressSignalKind='artifactUpload'` 与 kind-keyed RulesConfig schema 由 GOV-MEMBER-STATUS-DERIVE 落代码（本 ADR 不改代码）。图纸上传端点/存储 = 审批门后 server 任务（D-036 登记）。
- 事实源：本 ADR；`docs/design/gov-cue-layer.md` §6；`docs/design/gov-data-model.md`（TaskProgressSignal/GroupKind）；`AGENTS.md §5`（C2/A1/G5/C5）。

## D-035 — 化解层 give-floor + 修正测量第 4 段意图（A3 暴露必带给予）

- 状态：**DECIDED**（spec 落 `docs/design/gov-cue-layer.md` §4/§5/§7；实现属 frontier `GOV-MEMBER-STATUS-DERIVE` / `GOV-RULES-LAYER`）
- 日期：2026-06-12
- 上下文：3-agent 产品核实对"把'让没事的人自己去找事做'后置给知识树（D-027）"判 holds=false——代码证明（attribution.ts:242-267 `relatedKnowledgeFor` 从 `[task.id, rootBlockerTaskId]` 取知识，`capacityFreed` 的人 `currentTaskId→null` 故**无任务键可取**，唯二 relatedKnowledge 生产者都 gated on 被卡）。后果：`capacityFreed` 的 3a（匀过载组）在无过载组时为空，3b（去学）后置给未建知识树 → `deriveMemberStatus` 一上线就把人**暴露成 idle 却零给予** = 破 **A3（系统给得比拿得多 = 观察资格来源，D-031 确立）**，freeIdle 污名换标签复活。另：原 `暴露→问责→化解` 三段漏了 D-031 的核心前提——多数 idle/silence 是**测量错误**（未录入/信号没接）。
- 决策（用户 2026-06-12："先不去干预[自我成长]"对一半——树后置对，给予地板不可后置）：
  1. **四段意图**：`修正测量(兜底) → 暴露 → 问责 → 化解`。化解叉 **3a 人力调度**（治理，匀过载组，captain，idle↔overload 闭环）/ **3b 自我成长**（知识树 D-027，**整棵后置**）。
  2. **第 4 段「修正测量」前置于化解**：`uncovered` 先走"去派活 = 录入入口"、`silence` 先查信号源新鲜度（D-034 分河），别在"未录入/信号没接"的假象上开火。
  3. **give-floor（不可后置的那块 3b）**：`capacityFreed` 的 3a 为空时，`relatedKnowledge` 从**本人私有** `MemberKnowledge`(relation∈{interested,learning} 的 `KnowledgeNode.resourceLinks`，growth.ts，fixtures.ts:292-295 已 seed) 平铺取，**仅 `taskOwnerPrivate`**（绝不给队长）——即"让他自己挑自己存的兴趣"，agency 留本人（A3），零树结构、不等 D-027 整棵树。`capacityFreed` 队长面 gate on (有过载组 OR cooldown)。
  4. **暴露必带给予不变式（可测）**：任何发第三方的 `capacityFreed`/`silence`(surface) **必须**配一条同主体 `taskOwnerPrivate`(give, `relatedKnowledge.length>0`)，像反排名一样守在单测里，结构上禁止"暴露 idle 却零给予"。
- 替代项（3b 整体后置给知识树）未采纳：审计证其在"做完又无过载组可去"分支破 A3、复活 freeIdle 污名；give-floor 是 tree-free、复用已 seed 的私有兴趣链，无须等 D-027。
- 影响：`gov-cue-layer.md` §4（capacityFreed give-floor + 空-3a 行为 + 修正测量段）/ §5（四段意图）/ §7（暴露必带给予不变式）同步。代码留 GOV-MEMBER-STATUS-DERIVE / GOV-RULES-LAYER 落（本 ADR 不改代码）。
- 事实源：本 ADR；`docs/design/gov-cue-layer.md` §4/§5/§7；`apps/hub-contracts/src/growth.ts`（MemberKnowledge）；`D-027`（成长轴/知识树后置）；`D-031`（A3 = 观察资格来源 + 测量错误命门）；`AGENTS.md §5`（A3/A4）。

## D-036 — 数据河 build 轨：方向已定 + 未决项登记（避免重复探索）

- 状态：**DIRECTION-SET / 实现审批门后**（设计任务入 backlog；实现是 server/基础设施任务，§8 审批门后）
- 日期：2026-06-12
- 上下文：D-034 把 silence 信号偏差 reframe 为"每组一条数据河（C5）"后，治理信号的**上游河流**（图纸上传 / git / 远程接入）从旁支升为命门。用户给出新语境（机械图纸靠微信传、希望上服务器按天/版本分类；程序需统一版本管理但 git 学习成本高；openclaw/hermes 是在外远连服务器的现有手段）。本 ADR 把这些方向**定向 + 登记未决项**，避免之后重复探索；实现不在本轮（纯 docs/planning）。
- 已定方向（用户 2026-06-12 四问拍板）：
  1. **图纸上服务器 = 喂硬件进度信号**：扩展既有 `ArtifactRef`(schemas.ts:95-111) 加 'drawing'/'cad' kind + 版本链 + 按天/robotTarget 分类；图纸上传派生 `artifactUpload` 进度信号（喂机械/电路河，D-034）。立 `HUB-ARTIFACT-VERSION-DESIGN`。
  2. **程序版本管理 = 薄封装 git**：一键"保存版本"=底层 commit+push，**git 仍唯一真相（G2）、不另造 VCS（C3）**；git push 派生 `gitCommit` 信号（喂程序河）；双重职责=降门槛 + 让程序 silence 信号可信。立 `HUB-GIT-ADAPTER-DESIGN`（可并入 `HUB-GIT-FORGE-DESIGN`）。
  3. **openclaw = Hermes 类 AI/命令 adapter**（用户澄清）：归 mock-first adapter 轨（复用既有 `/api/adapters/:id/{health,capabilities,invoke}` 契约，HUB-ADAPTERS-MOCK done），真实接入审批后置。**≠ D-020/D-021 否决的 `openclaw-lark` 飞书协议桥**（协议错位）——同名不同物，勿混。
  4. **远程访问 = 实验室 LAN + 隧道**（用户）：治理服务器在内网，备赛在外要隧道/反代才能直连；与 adapter 轨**区分**（adapter=能力、隧道=访问路径）。真痛点=在外 Cue 送得到（飞书走 Lark 云本可达）+ 信号收得进。立 `GOV-REMOTE-ACCESS-DESIGN`（独立基础设施轨，§8 审批门后）。
- 未决项登记（= 本轮 pitfalls，避免重复探索）：
  - **图纸-as-信号循环依赖**（P1）：硬件 silence 正确性依赖"图纸上传=信号"先落地 → D-034 保守铁律（非 program 组 git 缺失不触发 silence）是过渡护栏。
  - **图纸版本语义**（P5，`ARTIFACT-VERSION-SEMANTICS`）：谁 bump / 自动 vs 手动 / 当前权威版指针 / 撞坏回退 / 按车分支——别做完整 PLM（C3）。
  - **上传 UX 必须比微信省事**（P4）：否则迁不动（飞书多维表格当年败于"上手难"D-026）。
  - **真实存储 = 真服务器写**（P6，§3/§8）：字节进 volume/MinIO（D-025），不进 git/治理库。
  - **程序避 git 则 gitCommit 信号也不可靠**（P8）：薄封装 adapter 是信号可信的前提。
  - **远程访问 = 基础设施 + 安全面**（P9，`REMOTE-ACCESS-DEPLOY`）：§8 禁夜跑/需审批；Hermes/openclaw 是已有独立工具，接入=适配器接线+鉴权非造工具（P10）。
  - **一切真实数据流卡 `HUB-SERVER-GOV-SCAFFOLD`**（P12，frontier#1，真路由现 404）。
- 影响：`backlog.md` 新增 `HUB-ARTIFACT-VERSION-DESIGN` / `HUB-GIT-ADAPTER-DESIGN` / `GOV-REMOTE-ACCESS-DESIGN`（数据河 build 轨）+ Decision-needed 补 openclaw 澄清；`now.md`/`agent-state.json` 加 `ARTIFACT-VERSION-SEMANTICS` / `REMOTE-ACCESS-DEPLOY` 入 open_for_decision。本 ADR 不改代码、不碰服务器。
- 事实源：本 ADR；`D-034`（数据河）；`D-025`（栈/存储边界、Hermes mock-first）；`D-020`/`D-021`（openclaw-lark 否决）；`AGENTS.md §1`（四层架构触点层）/ `§8`（夜跑禁服务器写）。

## D-037 — 产品定位回中（CASE+交流中心+数据库）+ 人键自指化（彻底去监视味）

- 状态：**DECIDED**（本 ADR = 产品定位 + 核心不变式的权威源；supersede 多条前序决策的相关部分；spec 落各设计文档）
- 日期：2026-06-12
- 上下文：D-026 把产品魂定为"制度化进度治理系统"，此后 D-032～D-036 在 silence 检测 / 受众路由 / 反监视上越钻越深（audience 三值路由表、问责上移、k-anon、良基兜底、暴露必带给予不变式）。用户触底反思：**为了让"silence/提醒"这一个功能"不像监视"，要堆四个大决策 + 8-agent 宪法审计 + 一整套去名机器——这本身就是诊断：那个功能根上是监视形状的，反监视机器只是在给它拔牙。** 越做越像"把先进技术包装成更隐蔽的监视器"，违背初心（"本来是为了更公平"）。子 agent 审计另证：D-032～D-036 几乎全 spec-only、代码未实现 → 本次纠偏绝大部分是文档重写、代码近零。
- 核心洞察（`gov-data-model.md` §0 自陈的命门被范围蔓延掩盖）：公平的真解是**给被卡的人正名**（纯结构——依赖图自动显示"被上游卡"，被冤枉的空闲当场洗白），不是**抓摸鱼的人**（必须盯个人 = 监视）。silence 越过"正名"去抓真摸鱼，正是它滑进监视的越界线。"替你说"也是结构做得更好：靠卡点在图上自动可见替他说，而非盯着他+戳他。
- 决策（用户 2026-06-12 拍板"彻底改掉"）：
  1. **产品定位回中**：从"制度化进度治理系统"→ **融合的 CASE 工具 + 团队交流中心 + 战队数据库**：给学长**减负**、给学弟**指引**、**项目同步进度表**。目标 = 规范团队 + 增强凝聚力，**非高压监视**。
  2. **核心不变式（新宪法脊柱）**：**人键的输出只回给本人、当作帮助（self-directed give）；对第三方只暴露结构（task/group/resource 键），永不暴露人。** 系统对你说你自己的事是为帮你；它永不替你向别人通报你的事。第三方面向的一切都是结构键。
  3. **silence 自指化**：保留检测；受众 = 仅 `taskOwnerPrivate` + AI 指引；**砍 D-033 §6 问责上移 / 本组 console 事键快照 / 一切管理者面**。理由：真想帮学弟，早就线下去问了；管理者面只多监视味、零增益。
  4. **开放问题"没派活 + 被卡 + 没主动接 → 标记管理者?" = 机会导向协调视图**：拆三 case——① 没派活 = 队长的缺口（"这些活还没派人"派活 TODO，结构键、前瞻，非成员判断）；② 被卡 = 结构已正名；③ 没自己主动 = 唯一关于人的部分，**不建"谁没主动"探测器**，本人收 AI"可接的活/可学的"、空槽在共享进度表被动显形（顺手可见），系统从不主动说"X 没在主动"。管理者侧只看**工作分配视角**：待派的活 + 过载组 + 某组前瞻余力（组键、"可支援"措辞）。
  5. **坦白边界（取代 k-anon 幻觉）**：5–15 人小团队组键可反推到人，**纯匿名做不到**；真护栏是**机会措辞（"可支援"≠"没干活"）+ 组长定夺谁去（系统不点名）+ 人在环**，不是匿名算法。
  6. **A3 重述**：面向个人 = 纯给予，**无需"补偿暴露"**（不再发生人-暴露，补偿条款失去前提）。give-floor 保留，动机从"抵消暴露"简化为"就是帮你"。
  7. **两条 AI / 反排名 guard（新增）**：① AI 指引读任务 / 知识上下文来帮你，**绝不计算"你被提醒过几次"**（否则自指帮助反成隐性监视）；② 自指 Cue **不沉淀按人历史**（不能事后 `groupBy` 出"谁被提醒最多"）。
- supersedes（逐条，写明失 / 保）：
  - **D-026 定位词**"制度化进度治理系统" → 失；**保**四层架构（结构层为主，本就与新不变式一致）。
  - **D-032** silence 多受众（本人 + 队长）+ idle↔overload 双向闭环 → silence 收为纯自指；闭环改单向（`overload` 结构键照常给协调者，`capacityFreed` 队长面改机会导向协调视图）。**保** GovernanceCue 统一 schema + 反排名守一处。
  - **D-033 §6 问责上移 + audience 三值** → 问责上移删；audience 收窄（silence 不再用 `subjectGroupLead`/`teamCoordinator`）。**保**角色字段（`leadMemberId`/`captainMemberId`/`observerMemberIds`，仍用于路由协调视图 + 老师项目级汇报）。
  - **D-034 保守铁律 / k-anon / per-kind 重机器** → 降级为"尽力而为的低风险自助提示"（不再对第三方指控，重机器失去存在理由）。**保**"每组一条数据河"（C5，仍需知道有进展发生才能给本人提示）。
  - **D-035 A3 动机** → 重述为"纯给予"（见决策 6）。**保** give-floor 机制 + "修正测量先于化解"（四段意图：未录入/信号没接的假象上不开火）。
  - **D-036 图纸轨** → 方向不变，但语义重心从"喂 silence 信号"移到"**战队数据库 / 图纸档案**"（archive-first、事件驱动上传、命名规范、版本检索）；`artifactUpload` 信号降为副产品。
- 记录债（不在本轮修，归 frontier `GOV-MEMBER-STATUS-DERIVE`）：`freeIdle` 节点语义混了 `uncovered`（测量错误：队长没派活）与真闲（D-031 已指）。其前瞻重构（"可接任务 / 有余力"框架 + `uncovered` 第三态拆分 + 复核 `DepGraphSummary.freeIdleCount` 与 console「空闲·自由」标签是否偏回溯判断）coupled 到该 frontier，与 `Member.status` 双写债（`fixtures.ts` 手填却标 `updatedBy:'derived'`）一并修。注：console 已把 `freeIdle` 节点标为「可接任务」，前瞻框架部分到位；`freeIdleCount` 是节点计数（非按人）、符合 repo 现有反排名鲁布里克（summary 结构计数允许），故本轮不强改。
- 影响：重写 `AGENTS.md §5`（核心不变式顶置）+ §1/§4 定位与 mode；重写 `docs/design/team-hub-concept.md` 身份 + `gov-cue-layer.md` §2-§8 + `gov-role-visibility.md`（大幅收窄）；`gov-data-model.md` 增图纸档案库；`README.md` 定位词；`now.md`/`agent-state.json`/`roadmap.md`/`backlog.md` 改 mode + frontier 描述去监视假设（frontier 顺序在新 thesis 下后续独立重评）。**纯 docs/planning，一处 freeIdle 代码债记而不修**。不碰服务器、不碰真实数据。
- 事实源：本 ADR（定位 + 核心不变式权威源）；`docs/design/{team-hub-concept,gov-cue-layer,gov-role-visibility,gov-data-model}.md`；`AGENTS.md §5`；`D-026`（被覆盖定位）/ `D-031`（freeIdle 命门 + A3 = 观察资格）/ `D-032`–`D-036`（被收窄 / 降级的设计）。

## D-038 — 目标结构最终确认：真相分域 + 飞书纯被动脸 + 图纸按组分治 + 只自建四样

- 状态：**DECIDED**（本 ADR = TeamHub 目标结构 + 飞书/本地边界的权威源；refine D-034/D-036/D-025 路线 A 的落点；落地顺序见 frontier）
- 日期：2026-06-12
- 上下文：D-037 回中后 frontier 顺序待新 thesis 重评；同时用户明年计划"飞书为主交流平台 + 本地服务器做后端/数据库"，但"飞书和本地怎么分配"一直是悬而未决的大问题。本轮拆开"飞书命门"（WSL2 `lark-cli` 已配自建 app + 个人 device-flow 登录 + 146 user scope，能力远超需要、已 ready）并跑两个 dynamic workflow：① 结构对抗核实（10 agent：3 读现状 / 3 设计候选 / 3 opus 对抗 / 1 opus 综合）② 公开前例调研（7 agent：飞书开发成本 / 聊天前端+本地后端 / DAG 工具 / 自托管轻量协作 / git 派生进度 / 机器人战队工具）。
- 核心洞察：① 真相分域边界线 = **凡"关系 / 派生计算 / 按组横比"→本地；凡"给人看的通知和文档"→飞书；图纸二进制→各组按其原生工具分治**。② "push 到飞书"≠"依赖飞书"——只要 DAG 真相在本地、飞书只拿渲染视图/人话通知，飞书就只是一块可替换的显示屏，学一天 webhook+卡片够用，不构成结构性依赖。③ 前例佐证：聊天平台当脸+本地后端存真相是成熟模式（Plane+Slack / op-mattermost / DjinnBot），全自建是负价值（Huly 26k★ 仍要 4GB RAM）；图纸自托管机器人战队前例都走 git+本地（PurdueRM/CMU）。
- 决策（用户 2026-06-12 拍板）：
  1. **否决"飞书 base 当业务真相"**（对抗核实三透镜一致，宪法/采纳/成本得分 3/4/4）：破 G2（base 与本地双写同批实体）+ 破 I0/C2（base 表天然可按 ownerId 横比人效，护栏在系统控制外）+ bitable 表达不了有向边 DAG + QPS 5/s。
  2. **真相分域，每个真相一个写者**：本地 `GovernanceStore`=关系业务真相（Season/Project/Group/Member/Task/Dependency/Need/SharedResource/信号）；飞书=非结构化真相（wiki 规范）+ 纯触点脸；git / 各组云端 PDM=代码与图纸真相。
  3. **飞书纯被动、薄集成**：被动 bot（@才答、不主动 push、无需长连接事件订阅）；IM 通知/check-in（egress）+ wiki 活规范；**不碰 Base/Task API**（深绑陷阱）；真相不入飞书、飞书 down 真相不丢。学习裁定：~1 天 webhook+卡片够用一年。**Hermes 主/被动=已定被动**。
  4. **图纸按组分治（refine D-036）**：**机械组 SolidWorks 无云端、现仅本地/微信传 → 战队服务器做存储/版本管理真相**（第 4 样自建，正好兑现 D-034 用户原话"机械图纸从微信迁服务器按天/版本分类"）；**电路组 EDA 已在云端 PDM → 只引用**（`externalUrl` + 版本指针，不存二进制）；**程序/固件 → git**（**当前用 GitHub，迁本地 Forgejo on 战队服务器 = 考虑中**）。三者各 = D-034 一条数据河（各组工作产物在其原生工具 version-control，TeamHub 收"新版本"事件派生 `artifactUpload` 信号）。**两项云端 vs 本地均标记考虑中**：① 程序 GitHub→本地 Forgejo 迁移（`GITHUB-TO-LOCAL`，用户 2026-06-12）② 定期 pull 云端代码/EDA 到本地备份（`PULL-CLOUD-CODE`）。无论迁不迁，TeamHub 只消费 git 的"新版本"信号、不改 git 唯一真相（G2）。
  5. **只自建四样**（其余全外包 飞书+git+云 PDM）：① 依赖 DAG 引擎（关系真相+拓扑+关键链）② 阻塞归因/负载错配计算 ③ 节点图 web UI（给所有人）+ 个人任务详情页 ④ 机械组 SolidWorks 图纸本地存储/版本管理。
  6. **DAG 节点图给所有人看 + 个人详情弥补**（用户 2026-06-12）：全局图给方向感（"我在链的哪、谁和我并行"），个人任务详情页给"我具体干嘛"补偿全局图可能的"懵"；先做给全员、懵了再收窄队长（低风险可逆）。
  7. **飞书接入通道**：egress 发消息走 SDK（已实通、token 自刷）；只读（base 镜像/calendar 佐证）走 lark-cli（须先修 `cli-bridge.ts` bin bug `'lark'→'lark-cli'` 且 `boundary.ts` 白名单后置）；**不引入 MCP 面**（绕过 boundary 守门、给 G2 开不可控写路径）。
- refine（写明改 / 保）：
  - **D-036 图纸轨** → 机械从"上服务器喂信号"升为"**本地存储真相**"（无云端故服务器是唯一备份）；电路从"上服务器"改为"**云端引用**"（已有 PDM，不重复存）。**保** archive-first + 事件驱动 + 命名规范 + `artifactUpload` 副产品信号。
  - **D-034 每组一条数据河** → 落到具体工具：程序河=git / 机械河=SolidWorks 本地版本事件 / 电路河=EDA 云端发布事件。**保** C5 每组一河。
  - **D-025 路线 A** → 落点确认：本地关系库=业务真相不变；新增"飞书 wiki 持非结构化真相""图纸按组分治"两条 G2 不双写细化。
- 落地顺序（frontier 在新 thesis 下重评，第一刀不变）：`HUB-SERVER-GOV-SCAFFOLD`（第一纵切破设计-only 循环）→ schema 补齐（`artifactUpload`/角色字段/`ArtifactRef` cad·eda）→ `GOV-MEMBER-STATUS-DERIVE`（修 freeIdle C2/A1 破口）→ `boundary.ts` 白名单+修 bin bug → 个人详情页+SchedulePage → 飞书被动 bot+`LarkMemberBinding` → `GOV-DEP-INTAKE`（DAG 数据命门）→ Forgejo（若迁本地）+`HUB-ARTIFACT-STORE-MECH`+图纸引用接口。
- 影响：本 ADR + `now.md`/`agent-state.json`（stage/frontier/最近完成）+ `gov-data-model.md` §1.1（图纸按组分治）+ `backlog.md`（新增 `HUB-ARTIFACT-STORE-MECH` + `PULL-CLOUD-CODE` 考虑中）。计划全文 = `~/.claude/plans/dynamic-workflows-tender-crayon.md`（含逐域分配表 + 参考 repo + 否决记录）。**纯 docs/planning**，不碰服务器、不碰真实数据。
- 事实源：本 ADR；plan file（结构确认全文）；两个 workflow 输出（结构对抗核实 + 公开前例调研）；`D-034`（数据河）/ `D-036`（图纸轨）/ `D-025`（路线 A/栈）/ `D-037`（定位回中）；飞书能力实测（lark-cli 146 scope，记于 memory `teamhub-feishu-capability`）。
