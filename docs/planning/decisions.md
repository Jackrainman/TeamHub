# 关键决策（Decisions）

> **决策账本约定（feiyue 式·D-070）**：本文件是**活账本**，只留**仍在约束当前代码/产品方向**的 ADR。被 supersede / 挂起的不在原位留全文，而压成 3 行 stub（状态 + 摘要 + 归档指针）、全文移进归档，保持活文件可扫不膨胀。某 ADR 被 supersede 时，**同一刀**压 stub + 移全文进归档。归档落点：
> - 早期过期（D-001~D-004、D-007、D-008、D-010~D-013、D-017）→ `docs/archive/pre-slim/decisions.md.preslim`
> - v0.3 时代簇（D-005/D-006/D-009/D-014/D-016）+ 被 supersede 或**已定型**的长期 ADR（D-021、D-026、D-043、D-053…）→ `docs/archive/decisions-archive.md`
> - 治理派生挂起簇（D-032~D-035）→ `docs/archive/governance-suspended-decisions.md`
>
> git 历史与归档文件均可追溯。

## D-005 / D-006 / D-009 / D-014 / D-016 — v0.3 时代 ADR 簇【已冻结·归档】

- 状态：**已冻结**（D-018 整体冻结 v0.3、代码 2026-06-09 删除、不再驱动新工作；D-016 更早即「已被 D-018 覆盖」）。**全文已归档 → `docs/archive/decisions-archive.md`**。
- 摘要：**D-005** schema 校验用 zod（单一事实源 + `safeParse`）；**D-006** S1-A3 IssueCard 本地持久化用 localStorage；**D-009** S3 转「存储迁移与服务器化」；**D-014** 服务器部署 release tarball first（`current` symlink + `releases/` + `shared/`）；**D-016** UI 大问题先走受控 UI 修复链路（UI-GATE 链）。
- 仍存活的事实：**zod** 仍是 hub-contracts 运行时校验底座（D-005 沿用至今）；**localStorage** 仅作 verify / fallback 路径（主链路已 HTTP + 落盘 JSON）。其余（S3 存储迁移 / release tarball / UI-GATE）随 v0.3 退役——现行部署形态见 D-025 + `docs/deploy/RUNBOOK.md`。

## D-015：长期路线图重建为 8 条产品主线
- 日期：2026-04-26
- 决策：以 `docs/planning/roadmap.md` 为长期产品路线图事实源，把后续演进拆为 8 条主线：Deployment / Operability、Data Safety、Core Debug Workflow、Search / Knowledge Base、AI-ready Workflow、Real AI Assistance、Code Context Analysis、Technical Debt / Architecture。
- 原因：8 主线同时保留长期愿景与当前执行边界；近期仍先做部署可用、数据安全、可观测，避免在真实服务器未验证、API key 未确认时抢跑真实 AI 或 repo connector。
- 放弃方案：继续维护只围绕 S3/S4/AI 的短队列；把 AI/RAG/权限/代码扫描提前塞进当前入口；多文档重复维护当前战况长篇。
- 影响：`now.md` 只保留当前 P0 执行窗口与 ≤3 前沿候选；`backlog.md` 一行一候选；`roadmap.md` 保留 8 主线骨架不维护任务态字段。
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

## D-021 — 飞书 gateway 路径选型：路径 A（SDK + Long Connection）【已定型·推演归档】

- 状态：**DECIDED / IMPLEMENTED**（2026-05-19 用户拍板「A，全部接受，先接进去看看」并已上线）。**完整推演（选项 A/B 全描述、权衡表、备赛期可行性、拍板动作、D-020/D-021 后续两子节）已归档 → `docs/archive/decisions-archive.md`**。
- 决策：飞书侧基座用 `@larksuiteoapi/node-sdk`（路径 A），不自写最小 gateway（路径 B）。
- 仍生效的约束：① SDK 作**长期依赖**（不预留脱依赖预算）；② 备赛期启用 **Long Connection 模式**绕开固定公网 IP 白名单；③ 出站统一走 `apps/lark-toolkit`、3 秒 ack 内同步路径走 SDK（见 D-022 三包拆分）；④ Mock-first 调度，真实 provider key 后置。
- 事实源：`docs/design/lark-connector.md`（架构）；`docs/research/lark-oss-candidates.md`（选型依据）；归档全文。

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

## D-026 — Teamhub 立魂：四层架构 + 路线 A + 设计宪法三层重构【thesis 已回中·推演归档】

- 状态：**部分 SUPERSEDED**。「制度化进度治理系统」产品定位已被 **D-037**（定位回中：CASE 工具 + 团队交流中心 + 战队数据库）+ **D-039**（AI 退出治理、三支柱）实质反转；四层架构骨架与宪法仍生效。**主体 + 「D-026 后续：提醒模型 / AI 边界」全文已归档 → `docs/archive/decisions-archive.md`**。
- 仍承重的骨架（现行正文见指针，勿在此重复）：
  - **四层架构**：数据真相层 → 规则/协调层 → 展示/汇报层 → 触点/集成层（现行 `AGENTS.md §1`）。
  - **路线 A**：系统是真相、飞书是脸、**不双写**、飞书多维表格不作数据层（现行 `AGENTS.md §1`）。
  - **设计宪法三层**：核心原则 C1-C5 + 治理专属 G1-G5 + 反监视 A1-A4（+ 后续 I0 核心不变式）；现行权威正文 `AGENTS.md §2 / §5` + `docs/design/team-hub-concept.md`（canonical）。
  - **赛季分项目 / Need 一等公民 / 进度自动派生**：仍是数据模型与 C 原则的一部分（见 hub-contracts + D-028/D-029）。
  - **提醒模型 / AI 边界**（起草不发送 / 建议不判定 / 检索不评价）：执行细则现行版在 `AGENTS.md §2.2` A 原则 + **D-037**（问责上移废除、人键提醒只回本人）。
- 事实源：`docs/design/team-hub-concept.md`（canonical）+ `AGENTS.md §1/§2/§5` + 归档全文。

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
  5. **布置任务 / 排班按小组、汇报按大组**（用户 2026-06-11 校正）：大组 = 程序 / 电路 / 机械；程序大组下有电控 / 视觉两个小组（`Group.parentGroupId` 自引用，电路 / 机械本就顶层）。排班单元是**小组**（`groupId`，电控被卡 ≠ 视觉被卡），跨小组的收敛任务（总联调）可挂大组**（⚠️ 此点已被 D-072 决策6 反转为「总联调 = 所有组各到至少一人·不挂单一组」+ 删程序组领任务身份；本子条款"总联调挂大组"superseded，汇报按大组滚动仍生效）**；`PresenceRecommendation` 加 `reportingGroupId`（顶层大组祖先，`topLevelGroupId` 上溯），汇报 / 过载按大组滚动、排班细节停在小组。视图先按 `reportingGroupId` 分组、组内列小组。
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

## D-032 ~ D-035 — 治理派生整簇（GovernanceCue / 受众路由 / silence 分组 / give-floor）【挂起·已归档】

- 状态：**挂起**（D-039 AI 退出治理后整簇挂起，spec 留待复活；复活触发=未来要 AI 参与治理判断）。**全文已归档 → `docs/archive/governance-suspended-decisions.md`**。
- 摘要：**D-032** GovernanceCue 统一 + Member.status 全派生 + 静默信号；**D-033** 角色模型 + 受众路由 + 问责上移；**D-034** 数据生命线按组分河（C5）+ 保守过渡铁律；**D-035** 化解层 give-floor + 修正测量第 4 段。
- 不复活铁律：自驱动/合成目标永不触此簇（见 now.md 挂起段）。

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

## D-039 — 方向重新瞄准：演进留地基 + AI 退出治理（治理降为人读说明）+ 三支柱轻重缓急

- 状态：**DECIDED**（本 ADR = 第一轮落地方向 + 轻重缓急的权威源；把 D-032～D-035 治理派生整簇**挂起**而非删除；refine D-037 定位；纯 docs/planning，代码零改）
- 日期：2026-06-13
- 上下文：在"未确认/待补全"盘点中（plan file `noble-soaring-gem.md`），用户给出真正的方向判断：**第一轮把 AI 的"治理判断"暂缓**——不是不用 AI，而是 AI 只留**仓管/转译安全车道**（整理 / 检索 / 拉资料 / 读图核对 / 算量 / 起草核对），**完全不参与治理**（不判定谁卡了 / 不自动派活 / 不算 silence·排名）。先做一个**实用的战队内部协作工具**（项管 + 知识库 + 库存/BOM），并融入旧项目 **Probe_Flash** 的思路；演进不重写；轻重缓急要写清楚；**先写文档、二次确认真实痛点，不立即写代码**。两路 Explore 核实：① **Probe_Flash 与 TeamHub 同源**——Probe_Flash v0.3 是**已交付**的"调试知识中枢"（`IssueCard→InvestigationRecord→ErrorEntry→ArchiveDocument`，低摩擦捕获 + archive-as-side-effect + symptom→AI 检查单），且已 pivot 到 "Team Hub"，两者共享 skills / lark-toolkit / 宪法 / "飞书是脸·git 是真相"；**不必从零重写**。② TeamHub 地基**领域中性、可直接复用**（`Task/Dependency/Need/Group/Member` + `KnowledgeNode/MemberKnowledge/TaskKnowledgeTag`、`hub-console` 壳、`hub-server` Fastify 壳）；过度旋转的只是**治理派生层**（attribution/Presence/Overload/silence/Cue）。
- 核心洞察：
  1. **AI 退出治理 → 反监视机器整套失去存在理由。** D-037 为"让 silence 不像监视"堆了 I0 机器实现 / k-anon / give-floor / audience 三值路由 / Cue 派生——那套复杂度全部源于"**让 AI 去判断人的状态**"。一旦治理判断的主体**回归人**（系统只如实显示"A 做完了 / B 快忙疯了"，由**大三/学长**人工判断协调；AI 不下判断），去名机器就不再需要：人看人本来就知道是谁，护栏从"匿名算法"变成"判断在人、AI 不碰、人在环"。这比 D-037 的"拔牙"更彻底——直接不长那颗牙。
  2. **知识根合并。** 痛点二次确认显示：规范 + 资料 + 知识 + 调试归档其实是**同一件事「找得到的战队知识」**，"统一规范"（最高频）是它的入口。合成一根**战队知识库**，建在 `growth.ts KnowledgeNode` + 移植 Probe_Flash `IssueCard→Archive` 闭环。
  3. **死表格教训 = 头号设计约束（登记 P13）。** 用户实证："曾经的统计实验室资源表格从来没用上过" + 飞书多维表格当年推广失败 = **同一死法**（C1：录入成本必须被当下回报抵消）。**每根都必须比那张死掉的表更省事、最好"用着用着就更新"（派生 / 副产品）**，否则白做。
- 痛点二次确认（用户实证，频率/强度梯度，作为轻重缓急依据）：
  - **统一规范 / 资料 findability = 最高频**（"仓库乱但勉强能找，有统一规范能好很多"）——即用户最初"SPEC 工具"直觉，真北。
  - **项管看板 = 高强度**（"平衡队内关系 + 进度不懵逼 + 对接找谁"），且**最省力**（Task 模型已 ~80% 齐）。
  - **知识库 + 调试归档 = 中**，**用户已在做**（Probe_Flash，"调试经验口口相传"）。
  - **库存/BOM = 低频但找一次要命**；**决定性负面信号 = 旧资源表没人用**（→ 见 P13）。
- 决策（用户 2026-06-13 拍板）：
  1. **演进不重写**：保留中性地基（schema + `hub-console` 壳 + `hub-server` 壳 + lark-toolkit + 全套 skills）；治理派生层挂起、不删。
  2. **治理降为"人读说明视图" + AI 不参与治理**：系统只如实显示原始状态，**大三/学长人工**判断协调；AI 不判定 / 不自动派活 / 不算 silence·排名。已落地的 DAG 依赖·阻塞归因视图（D-028）、排班视图（D-029）**作为"人读说明"保留可用**，其 AI 派生判断语义随治理挂起。
  3. **产品 = 战队内部协作工具三支柱**：① 战队知识库（规范 + 资料 + 调试归档）② 项管看板 ③ 库存/BOM；**全部 P0 候选**，先后由"真实痛点 + 破冰快慢"定（用户暂不指定唯一首发）。
  4. **知识根合并**（见核心洞察 2）。
  5. **死表格头号约束**（登记 **P13**，见核心洞察 3）：库存/BOM 纯手录版大概率重蹈覆辙 → **应等 AI 能帮它自保鲜**（读出车图核电机数 / 算用量余量 / 核发票）再做，排 **P1**，不先建一张没人填的静态表。
  6. **AI 安全车道**：AI 限于仓管 / 转译（整理 / 检索 / 拉资料 / 读图核对 / 算量 / 起草核对），**人始终在环**。"龙虾"=`openclaw`（D-036 Hermes 类 adapter）。
  7. **轻重缓急（定稿）**：**共享底座**（持久层 + `hub-server` real 路由，现全 mock / 404，做一次三根受益）→ **P0 知识库 / P0 项管看板** → **P1 库存/BOM（自保鲜）+ 飞书 Bitable/wiki/sheets 读写 + 修 lark-cli bin bug** → **P2 资料/代码批量整理（AI 安全车道）+ 项目级/给老师汇报** → **挂起：治理 AI 派生**。
  8. **设计北极星（每根都守）**：比死掉的表格更省事 ｜ 用着就更新（派生优先）｜ AI 只当仓管·转译、不下判断 ｜ 人始终在环 ｜ 小作坊轻量（不做完整 PLM / RBAC / 大型 PM）。
- supersedes / park（逐条，写明改 / 保 / 挂）：
  - **D-037 定位词** "CASE + 交流中心 + 数据库" → 细化为"战队内部协作工具三支柱"（知识库 / 项管 / 库存）。**保** I0 的精神（第三方不暴露人），但**实现路径改变**：从"AI 判断 + 去名机器"改为"治理判断主体是人、AI 根本不碰治理"——I0 由结构自然满足，不再需要 k-anon/audience 路由那套机器。
  - **D-032～D-035 治理派生整簇**（`GovernanceCue` 多态 schema / `deriveMemberStatus` 五态 / silence 分河 / give-floor / `RulesConfig` 阈值 / k-anon / audience 三值路由 / 暴露必带给予不变式）→ **全部挂起（spec 保留、代码本就近零、不删）**。**复活触发条件**：若未来确认要让 AI 参与治理判断（自动分辨 blocked-idle vs lazy-idle、自动派活），再从挂起区取回这套图纸。
  - **D-028 归因视图 / D-029 排班派生** → 视图层**保留为人读说明**；AI 自动判断部分随治理挂起。
  - **D-036 / D-038 数据河·图纸轨** → **不变**：库存/BOM 与机械图纸档案库是同一"战队数据库"家族，归 P1/P2，沿用 archive-first + 自保鲜约束。
- 记录债：`freeIdle` 语义债 / `Member.status` 双写债（D-031/D-037 已记）随治理派生一并挂起，本轮不修。
- 影响：本 ADR + `now.md`/`agent-state.json`（stage/frontier/最近完成）+ `backlog.md`（三支柱新行 + 治理派生标挂起 + 新增"挂起·治理 AI 派生"段）+ `team-hub-concept.md`（§10 已拍定 5 + 定位行）。**纯 docs/planning，不碰代码 / 服务器 / 真实数据**；`pnpm verify:all` 应仍全过（零回归）。
- 事实源：本 ADR；plan file `~/.claude/plans/noble-soaring-gem.md`（方向 + 轻重缓急 + 复用/挂起/新建三分）；两路 Explore 核实（Probe_Flash 同源 + 地基可复用 + 库存 greenfield + lark-toolkit 仅发消息）；用户痛点二次确认（频率/强度梯度）；`D-037`（被细化的定位）/ `D-032`～`D-035`（被挂起的治理派生）/ `D-027` `growth.ts`（知识库底座）/ `Probe_Flash` `IssueCard` 数据链。

## D-040 — 三支柱需求设计分析：采纳破冰顺序 + 共享底座首任务收敛

- 状态：**DECIDED**（用户 2026-06-13 "1+2+3 可行" 采纳；本 ADR = 落地路径权威源；详细分析见 `docs/design/three-pillar-reqdesign.md`）
- 日期：2026-06-13
- 上下文：D-039 定三支柱但留口"先做哪根暂不指定"。跑 14-agent dynamic workflow（5 haiku 资产盘点 → 4 sonnet 逐根需求/接口设计 → 4 对抗核实[base=opus] → 1 opus 综合）做需求设计分析；对抗核实层用 grep 实证抓出初稿设计错误，综合据此收敛。
- 决策：
  1. **破冰顺序 = `base → kb → pm → inv`**：底座 grep 实证唯一无争议起点（`server.ts` 零治理路由，`client.ts:87` real 模式打的 `GET /api/dep-graph` 未注册=404）；kb 痛点最高频最锐但有移植债；pm 最省力但录入自我引用+依赖底座；inv 自保鲜上游未落地（P1 不变）。
  2. **共享底座首任务收敛为最小一刀**：注册 `GET /api/dep-graph`（`DepGraphSchema.parse(toDepGraphView(snapshot, clock.now()...))` + `MockStore(seed governanceScenarioFixture)` + `Clock` 注入）。**推翻初稿**的 8 条 `/api/governance/*` GET（实证前端只缺 `/api/dep-graph` 这一条，初稿反铺一堆无消费方端点+写入簇+双 drizzle stub，违 C3）。POST/PUT 写入簇、presence、drizzle stub 全部后置。DoD/边界/接口契约见设计文档 §2。
  3. **7 条跨根风险**（见设计文档 §4）落地前必处理；其中 **lark bin 双语义债**（`cli-bridge.ts:17/47` execa 用 `'lark'` 但报错写 `'lark-cli'`，KB/INV 修复方向相反）单拆 **`LARK-BIN-PROBE`** 微任务，WSL2 实测 `which` 定论后统一修，先于任何飞书 CLI 功能（KB R5 / INV bitable）。
  4. **freeIdle/C2 测量错误**属已挂起治理派生债（D-031/D-039 边界），PM 本轮只 UI 降级标注「状态待确认」、不修底层。
- supersedes / 细化：D-039 的"先后由真实痛点+破冰快慢定（暂不指定首发）" → 本 ADR 定 `base→kb→pm→inv` + 首任务。`HUB-SERVER-GOV-SCAFFOLD` 初稿的"8 GET 一把梭"被收敛。
- 影响：本 ADR + `docs/design/three-pillar-reqdesign.md`（新建分析记录）+ `backlog.md`（base 行首任务收敛 + 新增 `LARK-BIN-PROBE` + 三支柱破冰序指针）+ `now.md`/`agent-state.json`（最近完成 + stage_goal）。**纯 docs/planning**（首任务实现是后续单独 atomic-task）。
- 事实源：本 ADR；workflow 输出（run `wf_67b54169-c3f`，14 agent / 853K token）；grep 实证（`server.ts`/`client.ts:87`/`attribution.ts:270`/`governance.ts:306`/`fixtures.ts:237`）；`D-039`（被细化）。

## D-041 — 任务为核心 + 项目计划表全员可见 + 甘特暂缓 + 视图解耦 + “和人关系”判定尺

- 状态：**DECIDED**（甲方 2026-06-13 设计对话拍板“没问题，这次之后开始构建”；本 ADR = 三支柱构建前的设计定调权威源；细化 D-039/D-040、推翻 D-037 一处可见性草案；纯 docs/planning，代码零改）
- 日期：2026-06-13
- 上下文：甲方在“项管看板该怎么做 / 谁看到什么”上连环纠结——主键挑不出来、要不要甘特、先做后端还是先填人、个人成长与项目进度是否互相干扰、“算几个项目”。逐条拆解后收敛出本轮构建定调；可见性上一轮先草拟“只管理者看人名/天数”，本轮甲方主动改为“项目计划表全员可见、按人进度不做”。
- 决策：
  1. **中心实体 = 任务（Task），系统围着任务转、不围着人转。** 澄清“主键焦虑”：每个实体各有简单 `id`（`governance.ts` 实证 Task/Project/Group/Member/Dependency/Need 均 `id: z.string`，依赖边亦自带 id），无“联合主键痛”；真问题是“系统围着什么转”，答案=任务（甲方原话“只要把任务干完了就行”）。此选择天然支撑反盯人：盯“任务动没动”，非“人动没动”。
  2. **项目计划表 = 全员可见**（推翻上一轮“只管理者看人名/天数”草案）：全员看 任务 + 依赖 + 状态 + 缺口 + 分工（谁负责）；**不含任何“按人算的天数 / 快慢 / 在不在干活”**。
  3. **甘特图暂缓**：甘特预设 确定工期 + 固定先后顺序 + 硬截止，三者皆无（硬截止亦违 G4）；代之以 依赖图 + “搁很久的任务”清单。
  4. **视图解耦**：项目进度视图 与 个人成长视图（成长轴 D-027）只共享“任务”底座，互不依赖，可分开做 / 砍 / 上线；成长轴往后放（不挂起、不阻塞项目进度）。
  5. **“项目” = 标签**：不纠结“算几个项目”；项目是给任务分组的标签（每赛季 / 每车一个），人跨项目、任务属某标签；需要时贴标签即可，不阻塞动工。
  6. **构建顺序 = 先地基**（任务 + 谁负责 + 谁依赖谁）；甘特 / 按人天数 / 成长轴 / 可见性细分 都是地基上的视图，可后置且改动便宜 → 不阻塞。与 D-040 破冰序 `base→kb→pm` 一致（base 首刀 `GET /api/dep-graph` 已落地）。
  7. **“和人关系”三堆分类 + 判定尺（可复用，量新功能用）**——尺：「该功能回答 **事/物到哪了**（安全）｜ **找谁对接**（安全，止于找谁）｜ **谁快谁慢·在不在干活**（人治，封存）」。
     - **① 和人完全无关（做了安全）**：任务本身 / 任务依赖 / 联调汇合点 / 缺口 Need（挂组不挂人）/ 共享资源状态 / 知识库（规范·资料·调试归档）/ 库存 BOM / 项目计划表骨架（依赖图 + 任务状态 + 缺口）。
     - **② 碰人但只“找谁对接”（安全，守红线）**：分工（谁负责哪任务，只显示“谁负责”不显示“快慢”）/ 组织树 / 资历（给新人多兜底，不排名）。
     - **③ 人治（封存）**：按人算任务天数 / 甘特按人画时间线 / 空闲检测 / 排班·谁该在场 / 沉默检测·自动提醒某人 / AI 判断“谁卡了”·自动派活 / 任何完成量·快慢人际比较。
  8. **全员可见计划表红线**：任务可标“卡住”，但**必带原因**（在等谁 / 等什么）；**禁止“光秃秃天数 + 人名”**——否则从“替被卡者正名”滑回“看谁慢”。
- supersedes / 细化：
  - **细化 D-039 三支柱**：②“项管看板” → “**项目计划表**（任务为核心·全员可见·依赖图+卡住带原因·无甘特·不按人）”。D-039 “AI 退治理 / 人治派生挂起”在此把“**人治视图**”逐条点名封存（决策 7③）。
  - **推翻 D-037 一处可见性草案**：上一轮设计对话曾草拟“只管理者看人名/天数”，本 ADR 改为“项目计划表全员可见、按人进度封存”。`gov-role-visibility` 五层受众路由随治理仍挂起、spec 留。
  - **不改 D-040** 破冰序（`base→kb→pm`）与首刀；本 ADR 是 pm（项目计划表）的设计定调，pm 实现仍走独立 atomic-task。
  - **D-027 成长轴**：确认与项目进度解耦、往后放（不挂起、不阻塞）。
- 影响：本 ADR + `now.md`（stage / stage_goal / frontier PM 行 / 最近完成）+ `agent-state.json` + `team-hub-concept.md` §10（已拍定 6）+ `backlog.md`（PM-BOARD 行定调）。**纯 docs/planning，不碰代码 / 服务器 / 真实数据**；`verify:all` 应零回归。
- 事实源：本 ADR；2026-06-13 设计对话（甲方拍板）；`D-039`/`D-040`（被细化）；`D-037`（被推翻的可见性草案）；`D-027`（成长轴解耦后置）；代码实证（`governance.ts` 各实体均 `id: z.string`、无联合主键；`attribution.ts:270 toDepGraphView` 现带 `ownerLabel`=分工，属 ② 堆）。

## D-042 — 需求分析闸门通过 + 可行性裁定 + 三支柱构建定基调（冲突取最新版 / Hermes 最后接 / 库存对话记账防死）

- 状态：**DECIDED**（甲方 2026-06-13 设计对话拍板"冲突直接用最新版、Hermes 最后接、库存留着排最后、修改 commit push 然后开始构建"；本 ADR = 三支柱**开始构建前的最终定基调**权威源；细化 D-039/D-040/D-041、推翻 D-040 一处 PM 指令；纯 docs/planning，代码零改）
- 日期：2026-06-13
- 上下文：在 D-041 定调"这次之后开始构建"后，跑 20-agent 闸门式 workflow 做**需求分析（闸门）+ 需求可行性分析**（5 分析器需求闸门[宪法=opus] → opus 裁定 → 5 haiku 实证盘点 → 4 sonnet 逐根评估 → 4 opus 对抗核实 → 1 opus 综合）。需求分析判 **proceed/0 阻断**（14 条全 major/minor），可行性分析出四根裁决；甲方就两处分歧拍板，并新增 Hermes 排序。分析记录 `docs/design/three-pillar-feasibility.md`。
- 决策：
  1. **需求合理、可以构建**：需求分析闸门通过（0 阻断）；14 条遗留为构建前收口项（见可行性文档 §7），非需求错。
  2. **冲突直接取最新版**（裁定唯一真矛盾）：D-040"PM 读 `Member.status` + UI 降级标注「状态待确认」"与 D-041"项目计划表不含在不在干活" 矛盾 → **取最新版 D-041**。落地 = **PM 需求层彻底删去 `Member.status`/freeIdle 任何展示通道，而非"读了再降级"**；`DepGraphPage` 现 `freeIdleCount` 在 PM 页复用须显式去掉。
  3. **Hermes/openclaw = 统一触点能力、最后做、先搭壳子**：① 能力是真的（Hermes 已接通、能调飞书 CLI，纠正可行性初稿"空架子"判断）；② 缺口在项目侧 → **新需求 = TeamHub 需具备"调用 hermes/openclaw"的能力**；③ 排序 = **先把底座/知识库/进度表/(库存表结构) 壳子搭起来，最后统一接 Hermes/openclaw**（四层架构最上层触点/集成层本就最后接）；④ 一次接、多根受益（库存对话记账 / 知识库随手沉淀 / 进度表随口更新走同一条路），作为统一能力做一次。
  4. **库存（INV）= 不冻结、留着、排最后、重要**（推翻可行性初稿 not-yet/"这轮不动"）：防死机制 = **对话记账（主力，靠 Hermes：说"坏了一个 3508"助手记一笔）+ 一次性盘点建底（起步，老师也要）+ 看图算量（增强，后续；本地大内存可兜底）**；新增功能 = **缺口主动向用户汇报**；老实定位 = **"大概有什么/还有没有"非精确实时账**（静默拿走的漏认了，"知道本来该有"即值）；锁松一档 = 不禁止做，但**做时必须带"对话记账"低门槛入口、不许做成纯手敲死表**，且真"用着就更新"依赖决策 3 的 Hermes 能力故落最后。
  5. **构建顺序（破冰序 base→kb→pm→inv 不变，补两处）**：① **base 先补"收口刀"**=`GovStore` 加写方法白名单签名 + `BuildHubServerOptions` 加 `kbStore?/invStore?` 扩展点（接口先行≈30 行，1 atomic-task），化解"四次重建底座"违 C3；补强：`GovernanceSnapshot` 已含 `knowledgeNodes/taskKnowledgeTags`，KB 大体复用同快照、**不必扩 interface**，真正要扩的只有 INV `PartStock`。② **KB 拆 KB-CORE（先，零飞书，最快交付）/ KB-LARK（后，hardblock LARK-BIN-PROBE）**。③ **PM**：`TaskSchema` 必填字段须 server 默认或表单补齐（"title+groupId" 过不了 Zod）；"卡住=在等谁"收敛为**结构键**（在等哪个上游任务/组/Need，点开才见组、对接才见人）；`confirmedBy`=timestamp 非 memberId（守 I0）；blockedBy 走 Dependency 边由 `toDepGraphView` 派生、**不在 Task 上另存**（守 G2）；**`dueDate` 本轮不引入**（D-041 甘特暂缓 + 违 G4），priority 改 `criticalChain` 派生。
  6. **文档卫生**：`GOV-SCHED-VIZ-DESIGN` 标挂起（D-041 7③ 排班=人治封存）；游离 GOV-*/AXIS 逐行标后置/挂起防误认领；**"P13" 降表述为"C1 死表实证（非独立宪法编号）"**（`AGENTS.md §5` 仅 I0/C1-C5/G1-G5/A1-A4，无 P 系列）。
- supersedes / 细化：
  - **推翻 D-040 一处 PM 指令**（"读 Member.status + 降级标注"）→ 取 D-041。**不改 D-040 破冰序与首刀**。
  - **细化 D-039 库存 P1**：从"等 AI 自保鲜再做、否则不做"细化为"留着排最后 + 对话记账防死 + 大概账定位"（决策 4）；**openclaw=Hermes 类 adapter** 由"数据河方向"升为"统一触点能力、最后做"（决策 3）。
  - **细化 D-041**：决策 7③ 人治封存逐条落到 PM 需求层删 `Member.status`（决策 2）。
  - **D-036 数据河 / openclaw adapter 轨**：归入决策 3 的统一 Hermes 能力，方向不变。
- 影响：本 ADR + `docs/design/three-pillar-feasibility.md`（新建分析记录）+ `backlog.md`（KB 拆 CORE/LARK、PM 行去 Member.status/dueDate 加结构键、INV 行新定位、base 收口刀、新增 HUB-HERMES-ADAPTER 行最后做、GOV-SCHED-VIZ 标挂起）+ `now.md`/`agent-state.json`（stage/frontier/最近完成）。**纯 docs/planning，不碰代码 / 服务器 / 真实数据**；`verify:all` 应零回归。
- 事实源：本 ADR；workflow 输出（run `wf_0ef0d4cc-4c8`，20 agent / 1.26M token，gate=proceed/0 blocker）；`docs/design/three-pillar-feasibility.md`；grep 实证（`gov-store.ts:9`/`server.ts`/`governance.ts` 无 dueDate·有 criticalChainTaskIds·blockedByLabel/`boundary.ts` 白名单/`cli-bridge.ts:17/47`/无 kb.ts·inv.ts）；2026-06-13 设计对话（甲方拍板冲突取最新版 / Hermes 最后接 / 库存对话记账）；`D-039`/`D-040`/`D-041`（被细化）；`D-037`/`D-036`。

## D-043 — 构建纪律双轨化（连续构建 vs 串行 atomic-task·共享底座 §6.0）【SUPERSEDED-BY D-066·已归档】

- 状态：**SUPERSEDED-BY D-066**（2026-06-15 harness 全改）。**全文 → `docs/archive/decisions-archive.md`**。
- 摘要：§6 双轨三段（§6.0 共享底座 / §6.A 串行轨 STOP / §6.B 连续编排轨）+ 物理隔离 atomic-task↔continuous-build；D-066 后串行轨整体下沉 `archive/legacy-harness/`。

## D-044 — KB-CORE 落地：移植 Probe_Flash 调试闭环 + 相似检索 + 结案派生知识节点（frontier#1 done）

- 状态：**DECIDED / IMPLEMENTED**（2026-06-14；§6.B continuous-build 连续构建 U1~U6 各自 verify+单独 commit+push；4-opus 对抗核实裁 ship/mustFix=0）
- 日期：2026-06-14
- 上下文：D-042 定基调「KB 拆 CORE/LARK、KB-CORE 零飞书可立即开工、四根里最快交付」+ base 收口刀 done。KB-CORE = 三支柱第一支柱第一刀，痛点 = 同一 CAN/MicroROS/电机 bug 跨赛季重踩（D-039 用户原声）。资产 = Probe_Flash（同源）`IssueCard→InvestigationRecord→ErrorEntry→ArchiveDocument` 调试闭环 + `rankSimilarIssues`/`buildCloseoutFromIssue` 纯函数可移植 + `growth.ts KnowledgeNode` 复用。
- 决策（落地形态）：
  1. **移植调试闭环 schema 链**到 `hub-contracts/src/kb.ts`：保留 `normalizedSummary/relatedFiles/relatedCommits`（否则 `buildCloseoutFromIssue` TS2339）；**去掉 `repoSnapshot`**（Probe_Flash desktop 专用 git 快照，TeamHub git 关联走治理 gitCommit 信号 + relatedCommits，不内嵌、不双写 G2）；时间统一 `isoDateTimeSchema`；`IssueStatus` 值 camelCase 对齐 TeamHub 约定（诚实标注，无活数据互通）。
  2. **移植 `rankSimilarIssues` 纯函数**（`kb-similar.ts`，逐字等价打分/排序）；Probe_Flash 的 `findSimilarIssuesForIssue`（StorageRepository IO）**不移植**——IO 由 `GET /api/kb/similar` 路由读 `KbStore` 后喂纯函数，本层保持全纯可单测。
  3. **移植 `buildCloseoutFromIssue` 纯函数 + 新增 `deriveKnowledgeNodeFromIssue`**（`kb-closeout.ts`）：结案派生归档+错误表+已归档卡+知识节点 draft（「用着就沉淀」）；`now/errorEntryId/errorCode/generatedBy` 由 opts 注入（不移植 Date.now/Math.random helper，路由用 clock 确定性派生）。
  4. **兑现 base 收口刀对抗核实 deferToNextKnife**：相似检索语料 IssueCard 不在 `GovernanceSnapshot` 内 → `kbStore` 类型由 `GovStore` **收窄为独立 `KbStore`**（`getKbSnapshot`；`InMemoryKbStore` seed `kbScenarioFixture`）；结案派生 `KnowledgeNode` 那半仍走 `GovStore.closeoutKbNode` 复用同快照（对抗核实确认成立）。
  5. **实现 `InMemoryGovStore.closeoutKbNode`**（base 收口刀只钉签名 throw 的写白名单，本刀落 KB 这一项）：补 id+createdAt（clock 注入）、追加节点、构造期克隆 `knowledgeNodes` 不污染共享 fixture；`createTask/createDependency/createNeed` 仍后置（PM 落地补）。
  6. **路由**：`GET /api/kb/similar`（症状→top-N，A4 护栏 `note` 焊进响应）+ `POST /api/kb/closeout`（缺 rootCause→422 不伪造完成、body 非法→400；errorCode 由 clock+issue.id 确定性派生匹配 `DBG-YYYYMMDD-NNN`）。
- 宪法守恒（4-opus 对抗核实逐条核实 clean）：**I0**（KnowledgeNode/归档无人维度，generatedBy=ai/manual/hybrid 非人名，不可 groupBy「谁结案最多」）/ **C2**（召回项+语料无 memberId/ownerId）/ **A4·C4**（相似检索只列候选+客观 reasons、不断言同因、由人选用）/ **G2**（不回写飞书、blockedBy 不另存）/ **C1**（写入兜底、不退化主录入死表）/ **C3**（不过度建设，PM 录入簇仍后置）。
- 老实定位（不过度声称）：真实录入上游（调试动作→时间线录入交互）**未接通**（等 §5 Hermes 统一触点层），**不宣称已解 C1**；当前落地 = 读召回 + 结案派生 + 写出入口 + 锚点语料。持久层 InMemory 重启丢失为预期（SqliteGovStore stub 待部署审批）。
- 对抗核实：`wf_fc3f1282-bbf`（3 lens[移植保真+TS / 宪法 / 路由·Store 集成]=opus → 1 opus 综合，231K token）裁 **ship、mustFix=0**；3 条 nit（IssueStatus camelCase 改名 / derivePrevention 中文+errorEntryId 确定性[均 §10 标注] / 测试未用 import）——后两条已顺手收口（U6b），第一条诚实标注留存。
- 影响 / 落地：`hub-contracts/src/{kb,kb-similar,kb-closeout}.ts` + `fixtures.ts`(kbScenarioFixture) + `index.ts`；`hub-server/src/{server,contracts}.ts` + `store/{gov-store,mock-gov-store,mock-kb-store}.ts` + 4 测试文件。verify：hub-contracts 41 测 / hub-server 28 测 / git diff --check / skills-sync 全过。commit U1~U6b（`45bbeaf`→`226e838`）。
- 后续（backlog/frontier）：**KB-LARK**（飞书拉资料，hardblock `LARK-BIN-PROBE`）/ 录入交互（随 Hermes 统一触点）/ IssueCard↔Task 关联 + `TaskKnowledgeTag` 派生（随 PM）/ 真实持久层（待审批）/ console KB 页（复用 @xyflow）。
- 事实源：本 ADR；`docs/design/kb-core.md`（设计 + 落地说明）；`docs/design/three-pillar-feasibility.md` D-042 §3；对抗核实 `wf_fc3f1282-bbf`；Probe_Flash `apps/desktop/src/{search/similar-issues,domain/closeout,domain/schemas/issue-card}.ts`（移植源，v0.3 冻结）。

## D-045 — PM 项目计划表后端落地：录入簇 + 读视图 + confirmedBy 内部凭证（I0 读写边界拍板）

- 状态：**DECIDED / IMPLEMENTED-PARTIAL**（2026-06-14；§6.B 连续构建 PM-U1 + 录入簇 slice + cleanup 各自 verify+commit；2-opus 对抗核实 ship/mustFix=0；**console 看板 UI 后置**）
- 日期：2026-06-14
- 上下文：KB-CORE done 后顺推 frontier#1 PM（D-041 定调「任务为核心·全员可见·依赖图+卡住带原因·无甘特·不按人」/ D-042 收口）。PM 复用现有 `Task/Dependency/Need` 不新建领域模型，承接 base 收口刀「录入簇 createTask/createDependency/createNeed 实现后置」。连续构建即触一个 **§8 设计闸**：依赖/Need 的 `confirmedBy` 在现 schema 是 `ActorRef{id,displayName,source}`（含可 groupBy 的 memberId），与 D-042「confirmedBy=timestamp 非 memberId 守 I0」字面冲突——planning↔代码冲突 + 涉 I0 反监视核心不变式，**不可静默猜**，故 AskUserQuestion 拍板。
- 用户拍板（2026-06-14）：
  - **Q1 = ActorRef 作内部凭证**：confirmedBy 保持 `ActorRef`，作**内部归因凭证**（`isLiveEdge` 判 `!== null` 决定是否参与归因 C4）；I0 靠**永不经读视图对第三方暴露、永不用于排名**守，而非靠 schema 去掉人 id。与现有 fixture + base 收口刀 4-opus 核实一致。（备选「source-only 凭证」未采。）
  - **Q2 = 本轮后端录入簇 + 读视图 API**；console 写侧 UI（@xyflow 板 + mutation 表单 + 冷启动空板）后置下一轮。
- 决策（落地形态）：
  1. **写实现（mock-gov-store.ts）**：`createTask`（补 id/时间戳 + 默认 status=pending/statusSource=console C5、lastProgressAt=null）/ `createDependency`（**clamp status=active** D-042 初始态）/ `createNeed`（**clamp status=open/openedAt=now/escalatedAt=null/claimedByMemberId=null** —— A2 反派单：新缺口必未认领）；构造期克隆 tasks/deps/needs/knowledgeNodes 不污染共享 fixture。
  2. **Draft 类型（gov-store.ts）**：`DependencyDraft` 去 status、`NeedDraft` 去 status/claimedByMemberId（clamp 初始态归 Store）。
  3. **路由（server.ts）**：`POST /api/tasks`·`/api/dependencies`·`/api/needs`（201/400）+ `GET /api/tasks` 读视图。
  4. **I0 读写边界（命门）**：写入侧 confirmedBy 记 ActorRef 内部凭证；**读出侧任何第三方可见路由永不输出 confirmedBy**——`GET /api/dep-graph`（toDepGraphView 只带 ownerLabel/blockedByLabel 结构键）、`GET /api/tasks`（Task 本无 confirmedBy）；**不提供** `GET /api/dependencies`/`GET /api/needs` 裸对象读路由；创建响应回完整对象=回给建边本人（非第三方），不构成暴露。
- 宪法守恒（2-opus 对抗核实 clean，含**对抗探针实证**）：探针 POST `confirmedBy={id:'m-secret-leaker',displayName:'SECRET_NAME_LEAK'}` 后 `GET /api/dep-graph`+`/api/tasks` 响应体均不含泄露标记 → **I0 守住**。C2（无完成量维度，ownerId 仅「谁负责」D-041 安全堆）/ G2（blockedBy 不在 Task 上另存、纯 Dependency 边派生）/ A1（缺口归组 providerGroupId）/ A2（claimedByMemberId clamp null 反派单）/ G4（不引入 dueDate）。
- 老实定位（不过度声称）：**console 看板 UI 未做**；真实 status 派生上游（git/lark→status）未接通，`statusSource=console` 是兜底录入、**不宣称已解 C1/C5**；持久层 InMemory 重启丢失为预期（SqliteGovStore stub 待部署审批 §8）；`criticalChain→priority`/双视图/AI 预填依赖录入后置。
- 对抗核实：`wf_86ad9d6b-45a`（2 lens[I0 暴露面 / 写实现健全]→1 综合，152K token）裁 **ship、mustFix=0**；nit（死代码+失真注释 / 创建可夹带 claimedByMemberId 派单 / 往返测覆盖）已由 PM-cleanup 收口。
- 影响 / 落地：`hub-server/src/{server,contracts}.ts` + `store/{gov-store,mock-gov-store}.ts` + 3 测试文件。verify：hub-server verify:all 37 测 / git diff --check / skills-sync 全过。commit PM-U1`7218a67` + 录入簇`6cb38c8` + cleanup`3bbf919`。
- 后续（backlog/frontier）：**console PM 看板页**（下一轮 frontier，复用 @xyflow DAG 页模式 + mutation 表单 + 冷启动引导）/ 依赖录入 AI 预填（confirmedBy=null 不归因）/ criticalChain→priority 派生 / 真实 status 派生上游随触点层。
- 事实源：本 ADR；`docs/design/pm-board.md`（设计 + 落地说明）；`docs/design/three-pillar-feasibility.md` D-042 §3 / `decisions.md` D-041（定调）；对抗核实 `wf_86ad9d6b-45a`；用户 2026-06-14 Q1/Q2 拍板。

## D-046 — hub-console 两支柱页落地 + 整体汉化（frontier#1 console UI done）

- 状态：**DECIDED / IMPLEMENTED**（2026-06-14；§6.B 连续构建；3-lens 对抗审计 ship；verify:all 绿；本地 Playwright 真机视觉验收）
- 日期：2026-06-14
- 上下文：D-044(KB-CORE)/D-045(PM 后端) 落地后，frontier#1 仅剩 console 读视图 UI（PM 看板 + KB 检索），且用户要求「整体汉化（中文默认可切英文）」。后端 `GET /api/kb/similar`·`/api/tasks` 已就绪，前端只消费、不新增写路由（写侧 mutation 表单仍后置）。
- 决策（落地形态）：
  1. **KB 相似检索页**（`features/kb/KbSearchPage.tsx`）：症状 + 标签表单 → `client.getKbSimilar` → 候选卡（title/status/匹配度/tags/重合依据 reasons/errorCode/根因·处理摘要/归档）。**A4 护栏可见**：原样呈现后端 `note`（「只列候选、不断言同因、由人选用」）+ reasons 客观重合依据，无「系统判定同因」措辞。Mock 模式复用**同一后端纯函数** `rankSimilarIssues` 跑 `kbScenarioFixture`（离线可演示）。
  2. **PM 任务看板页**（`features/pm/PmBoardPage.tsx`）：`client.getTasks` → 5 列（pending/inProgress/blocked/done/shelved）看板。**C2 反排名**：卡片只显 title/rawSummary（人原话）/robotTarget/intrinsicComplexity，**无 ownerId/负责人/完成量**；列计数与汇总只按 status（任务键），永不 groupBy(memberId)。无写流程故 A2 未触发。
  3. **整体汉化**：i18n 扩 enum 映射（adapter/member/event/artifact/health 状态）+ aria-label landmark（控制台导航/系统摘要/依赖摘要/任务摘要）+ 语言自名（中文/EN）全过 `t()`；总览残留后端枚举裸串收口；zh/en **143:143 键严格对称**。用户数据（displayName/uri/branch/capabilities/rawSummary）保持后端原样不机翻。
  4. **接线**：client 扩 `getKbSimilar/getTasks`（real fetch + mock 双轨，均过 Zod fail-closed）；console-local `schemas/kb.ts` 镜像响应契约（沿用 system.ts 做法）；ConsoleLayout 加两导航项 + App 四路路由 + TITLE_KEY。
- 宪法守恒（3-lens 对抗审计 `wf_64a78d61-109`，1 opus[I0/宪法] + 2 sonnet[i18n 完整/UX 正确]）：**I0/C2/A2/A4 = ship**（KB 全 issue/errorCode 键无人维度、note+reasons 原样；PM 无人维度、列计数按 status）；i18n 初判 mustFix（4 处硬编码 aria/语言自名绕过 t()）已全部收口 + 补 DepGraph aria；UX = ship（5 nit：0 命中计数冗余 / dup-key 兜底 / 路由末支显式 / 死键清理 全修）。
- 老实定位（不过度声称）：**写侧 mutation 表单（建任务/依赖/Need）未做**——两页均为读视图（KB 含 1 次检索交互）；真实 status 派生上游仍未接通（看板 status 来自 mock-first 锚点场景）；持久层 InMemory 重启丢失为预期。
- 影响 / 落地：`hub-console/src/{App,i18n/translations,api/client}.tsx?` + `features/{kb,pm,overview,dep-graph}` + `components/layout/ConsoleLayout` + `api/{schemas/kb,mock/{kb,tasks}}` + `styles.css` + `test/client.test.ts`（+3 测）。verify：hub-console verify:all（typecheck + 7 测 + build）全过。
- 后续（backlog/frontier）：PM/KB **写侧 mutation 表单**（建任务/依赖/Need + 结案录入，调 POST 路由）/ 依赖录入 AI 预填 / 真实 status 派生上游随触点层 / 远程部署正式化（D-036 REMOTE-ACCESS-DEPLOY）。
- 事实源：本 ADR；`docs/design/{pm-board,kb-core}.md`；对抗审计 `wf_64a78d61-109`；用户 2026-06-14「整体汉化 + 继续完成其他功能 + 用 workflow」请求。

## D-048 — PM/KB 写侧 web 表单：console 录入口落地（frontier#1 PM-KB-WRITE-FORMS done）

- 状态：**DECIDED / IMPLEMENTED**（2026-06-14；§6.B 连续构建 → 落地；hub-console verify:all 绿；本地真机端到端（real 后端 + Playwright）四表单全过 + 闭环召回实证 + 2-lens 对抗核实 ship/mustFix=0）
- 日期：2026-06-14
- 上下文：base 两刀 + KB-CORE（D-044）+ PM 后端（D-045）+ console 读视图/汉化（D-046）+ KB 闭环/skill（D-047）已就绪，但**两支柱的「人在浏览器里录入」通道仍缺**：PM 后端 `POST /api/tasks·dependencies·needs` 与 KB `POST /api/kb/closeout` 只有 skill/curl 口，无 web 表单（D-045 §7 用户 Q2 明确 console UI 留下一轮）。用户本轮指令：「还有什么没做完的自己认领去做，然后 ssh 到我电脑上展示」——认领 frontier#1 PM-KB-WRITE-FORMS。
- 决策（落地形态，纯 hub-console 写侧，零后端改动）：
  1. **API client 写侧**（`api/client.ts` + 新 `api/schemas/pm.ts`）：`createTask`/`createDependency`/`createNeed`/`closeoutKb` 四 mutation。请求 schema **与后端同法从 hub-contracts 派生**（`TaskSchema.omit(...)` 等，结构天然同步、不手抄字段）。**mock 模式闭包内可变任务表**（写表单无后端也即时反映在看板，演示/视觉验收用）；mock closeout **复用 canonical `buildCloseoutFromIssue` 纯函数**（不在前端复刻派生逻辑）+ 补 deriveErrorCode/draft→node 两步。
  2. **PM 录入面板**（新 `features/pm/PmCreatePanel.tsx`）：段控切换 布置任务/连依赖/暴露需求 三表单；依赖/需求的 from/to/onTask 走 **live 任务下拉**；成功后 `invalidateQueries(['tasks',source])` 看板即时刷新；自edge 守卫；冷启动空板引导（`PmBoardPage` `pm-coldstart`）。
  3. **KB 结案表单**（新 `features/kb/KbCloseoutForm.tsx` + `KbSearchPage` 加 检索/结案 标签）：最小人本字段合成 IssueCard（status=resolved）+ rootCause/resolution 必填；成功展示 errorCode/归档文件/派生知识点 + `invalidateQueries(['kb-similar',source])`（D-047 回灌后刷新检索）。
  4. **整体汉化**：新增 ~75 文案键 **zh/en 同步**（`Record<TranslationKey,string>` 类型强制 parity，typecheck 即守）；select/datalist/段控/banner CSS。
- **I0 命门（PM 写侧最敏感）**：`confirmedBy`（依赖/需求）= 录入本人凭证、**只在写表单收集 + POST 入参 + 回建边本人的创建响应**，**任何第三方读视图/UI 永不渲染**；UI 不显谁快谁慢/完成量；ownerId 仅「谁负责」(D-041 安全堆)。**对抗探针实证**：POST `confirmedBy={id:m-secret-leaker, displayName:SECRET_NAME_LEAK}` 后 `GET /api/dep-graph`+`/api/tasks` 响应体均无泄露；代码自审 `confirmedBy` 仅出现在注释 + 请求构造，零渲染路径。
- 宪法守恒：I0（confirmedBy 不暴露/不排名）；C2（看板主键 task/status 无 memberId 维度、无完成量）；A1（Need 归组 providerGroupId 不归人）；A2（创建 Need omit claimedByMemberId，后端强制 null=反派单）；G2（卡住原因走 Dependency 边派生不在 Task 另存）；G4（无 dueDate/甘特）；A4（KB 检索 note 候选不断言同因）。
- 验证：hub-console `verify:all`（typecheck/7 测/build）全过；**本地真机端到端**（hub-server:4177 真实后端 + Playwright real 模式）：建任务→看板出现 / 连依赖→成功 / 暴露需求→201 / 结案→errorCode+归档+知识点 → **切检索同症状召回刚归档的卡（closeout→corpus→similar 闭环实证）**；四 POST 路由 curl 往返全过；I0 SECRET 探针读视图干净；**2-lens 对抗核实**（`wf_af4c88df-309`：opus I0 + sonnet 正确性 → opus 综合）裁 **ship、i0Clean=true、mustFix=0**，2 nit（KbCloseoutForm `source` 死 prop + 结案后未失效 kb-similar 缓存）已合并修复（接 source 进 invalidate）。
- 老实定位（不过度声称）：mock task 表是闭包态、切数据源即重置（非真持久）；冷启动空板引导仅 PM（KB 一向有空态文案）；真实 status 派生上游（git/lark→status）仍未接通，`statusSource=console` 是兜底录入，**不宣称已解 C1/C5**；ProbeFlash `.debug-archive` 一次性导入（KB-IMPORT-PROBEFLASH）仍后置。
- 影响 / 落地：`apps/hub-console/src/`：新 `api/schemas/pm.ts` + `features/pm/PmCreatePanel.tsx` + `features/kb/KbCloseoutForm.tsx`；改 `api/client.ts`/`api/schemas/kb.ts`/`features/pm/PmBoardPage.tsx`/`features/kb/KbSearchPage.tsx`/`i18n/translations.ts`/`styles.css`。
- 后续（backlog/frontier）：KB-IMPORT-PROBEFLASH（`.debug-archive` 7 md best-effort 导入）；依赖录入 AI 预填（GOV-DEP-INTAKE 并入）；criticalChain→priority 派生展示；真实 status 派生上游随触点层；KB-LARK / INV / Hermes 后置。
- 事实源：本 ADR；`docs/design/{pm-board,kb-core}.md`；对抗核实 `wf_af4c88df-309`；用户 2026-06-14「认领未完成 + ssh 展示」请求。

## D-047 — AI + 知识库闭环 MVP：closeout 回灌 + JSON 落盘 + kb-debug skill（服务器为单一真相）

- 状态：**DECIDED / IMPLEMENTED**（2026-06-14；plan mode 设计 → 落地；hub-server verify:all 42 测绿；本地真机端到端闭环+持久化实测过）
- 日期：2026-06-14
- 上下文：用户要"一个简单的 AI+知识库"——本地 Claude Code 排 bug 时查团队相似历史、解完上传沉淀。相似检索（ProbeFlash 已做、TeamHub 已移植 `rankSimilarIssues`）和网页给人看（D-046 KB 页）已就绪，但 Explore 实证**闭环是断的**：`KbStore` 只读无写、`POST /api/kb/closeout` 只写 KnowledgeNode 不回灌检索语料（上传完下次 similar 查不到）、InMemory 重启全丢。**ProbeFlash 关键教训**：v0.3"服务器+SQLite"形态因"填的成本没当下回报"无人用；本设计让 skill **排障完自动归档**破此局。
- 用户拍板（2026-06-14，plan mode 两问）：
  - **三件全做**：持久化 + closeout 回灌 + skill。
  - **检索=关键词重合**：沿用 `rankSimilarIssues`，零依赖、ProbeFlash 同路、故意不用向量；留 embedding 扩展点本轮不做。
  - **服务器为单一真相**：skill POST 到服务器，**本地不再产 `.debug_archive`、信息全留服务器**（用户明确）；服务器已能渲染 `markdownContent` 供导出，不双写（G2）。
- 决策（落地形态）：
  1. **闭环（回灌）**：`KbStore` 接口加 `appendCloseout({issueCard,errorEntry,archiveDocument})`（gov-store.ts）；closeout 路由派生成功后回灌检索语料（server.ts，issueCard 按 id upsert 成 archived 版）——上传后下次 similar 即可召回。
  2. **持久化**：新 `FileKbStore`（JSON 落盘、原子写 tmp+rename、fail-closed 加载：文件损坏抛不静默覆盖）；`main.ts` 读 `TEAMHUB_KB_DATA_FILE` 注入（注入点 `options.kbStore` 现成），未设维持 InMemory（mock-first 不变）。**不引 sqlite**（SQLite 留扩展，照 sqlite-gov-store stub）。
  3. **skill `kb-debug`**（`.agents/skills/kb-debug/{SKILL.md,kb-client.sh}` 源 + `.claude/skills/` 镜像）：`debug-checklist` 的**服务器版进化**——recall（症状→`/api/kb/similar`，A4 候选不断言同因）+ archive（解完组装 closeout payload→`/api/kb/closeout`，`generatedBy=ai` 不记人名）；瘦客户端 `kb-client.sh`（ping/similar/closeout，`KB_BASE_URL` 环境配，curl→服务器无 CORS）；**不写任何本地文件**。
- 宪法守恒：C2（语料/回灌主键 issue/errorCode 无人维度）；I0（generatedBy=ai/manual/hybrid 不记结案人）；A4（recall 只列候选，note+reasons 原样，不断言同因）；G2（服务器单一真相，不双写本地 markdown）。
- 老实定位（不过度声称）：**写侧仍是 AI 组装 IssueCard**（无简化 archive 端点）；**时钟仍是 FixedClock**（mock-first）→ closeout 的 errorCode 日期/时间戳钉在场景时刻 2026-06-11，真实时钟是部署 follow-up（errorCode 仍按 issueId 哈希唯一）；ProbeFlash `.debug-archive`（7 md）批量导入后置（Part C，用户"可讨论"）；embedding 语义检索后置；LAN 托管 + 飞书登录独立基础设施轨（REMOTE-ACCESS-DEPLOY）。
- 验证：hub-server `verify:all`（typecheck + 42 测 + build）全过，含**往返测**（closeout→similar 召回）+ **落盘测**（FileKbStore append→新实例加载仍在）；**本地真机端到端**：`TEAMHUB_KB_DATA_FILE` 起服务 → `kb-client.sh` ping/similar(空)/closeout/similar(召回 iss-e2e-1) → 杀进程重启 → similar **仍召回**（持久化实证）；skills-sync + `git diff --check` 干净。
- 影响 / 落地：`apps/hub-server/src/{main,server}.ts` + `store/{gov-store,mock-kb-store,file-kb-store}.ts` + 2 测试文件 + `.agents/skills/kb-debug/`。
- 后续（backlog/frontier）：ProbeFlash `.debug-archive` 一次性导入（markdown→IssueCard best-effort 解析器）；真实时钟注入（持久模式配 RealClock，需调和治理 fixture 冻结）；简化 archive 端点（server 端建 IssueCard 让 skill payload 更瘦）；embedding 重排；LAN 托管 + 飞书登录。
- 事实源：本 ADR；plan file `linear-herding-blanket.md`；Explore 调研（TeamHub KB 后端两洞 + ProbeFlash 设计参考）；用户 2026-06-14「AI+知识库 / skill / 服务器为单一真相」请求。

## D-052 — 提案审查裁决 + Q1–Q4 拍板 + 低风险收尾批落地 + 依赖图新功能立项

- 状态：**DECIDED**（裁决 + 立项）/ **低风险批 IMPLEMENTED**（2026-06-14；hub-contracts 41 测 / hub-server 74 测 / hub-console typecheck+7 测+build 全绿；3 code commit `8ab93cf`/`44b7fcc`/`8ea6579`）
- 日期：2026-06-14
- 上下文：用户一次性提一批诉求（5 个灰导航项语义 / 适配器改名 / 看板≈依赖图能否合并 / 暴露需求是什么 / 全项目石山梳理 / skill 适配 workflow 自迭代 / 版本不更新 / mock 是什么），要求**先用 workflow 探明合理性再讨论**。9-agent 调研 workflow `wf_def55d4d-916`（5 survey[sonnet] + 3 石山审计[opus] → 1 opus 综合，~62 万 token）产逐条裁决 + 22 条石山 finding + 自迭代方案。基于综合结论问 4 题（Q1–Q4），用户拍板如下。
- 关键发现（纠偏）：5 个灰导航项**非空壳**——后端路由 `GET /api/{adapters,events,bridge/members,git/repos,artifacts}` 均已实现、数据已在总览五面板渲染；真正"死"的只是侧栏 5 个 `page===undefined` 的禁用按钮（把已有内容当"即将上线"占位）。
- 决策（用户拍板）：
  1. **命名（Q1）**：「适配器」→ **集成 / Integrations**，且**归入设置页**（非主页）。语义 = 连接到社媒 / 外部应用（飞书 / Hermes / git / 未来 QQ 微信钉钉等触点）。
  2. **看板 × 依赖图（Q2）**：**不合并**（两页交互范式不同：看板=线性状态流"做了多少"、依赖图=空间 DAG"为什么卡"；硬合并触 I0 反排名风险=完成数×负责人姓名同屏可读出"谁干得多"）。但**依赖图升为主舞台**——录入做成**右上角按钮 → 近全屏遮罩浮层**叠在依赖图之上、点空白处退回；并新增 **AI 自动画大致 DAG + 人手动微调**。
  3. **连依赖（Q3）**：用户要的"连线"**不是改按钮名**，是**在画布上拖拽连线建依赖**（从节点 A 拖到节点 B → 自动建边 + 重绘 DAG，xyflow `onConnect`）。
  4. **暴露需求（澄清）**：= "制度化替你开口"——被卡的人登记缺口挂到任务、卡点自动进依赖图全员可见、不催某个人；A2 反派单（缺口归组不归人、接口层物理拒收"指派给谁"）。建议 UI 标签改「登记缺口」（"暴露"有"被揭穿"负面语感）。
  5. **自迭代（Q6 诉求）**：引擎**已落地**（`continuous-build` skill + AGENTS §6.B 连续/编排轨，D-043；D-044~D-052 全走它）。频繁停下是**制度刻意设计的人在环**三类：① §6.0 M1 候选池闭口（frontier 空就停，当前正是）② §8 安全门（SSH/sudo/部署/密钥 blocked）③ 产品方向待拍。后两类不该自动化绕过。**解锁 = 保持 frontier 非空（本 ADR 已补）+ 可选补带 budget 守门的 frontier-loop 编排骨架**。
- 低风险收尾批（Q4 拍板"直接连续跑"，本 ADR 已实现 3 commit）：
  1. **版本跟随 package.json**（诉求7）：hub-server/status.ts `createRequire` 读包根 version、console mock 导入 package.json version；不再写死 0.0.1（`8ab93cf`）。
  2. **删 5 死导航 + Mock 文案白话化**（诉求4 一刀 + 诉求8）：ConsoleLayout 删 适配器/事件/协作桥/git/图纸 5 禁用项 + unused 图标 + 5 个 nav.* i18n 键；"Mock 数据"→"演示数据"、"真实 API"→"真实数据"、错误提示同步（`44b7fcc`）。
  3. **重复真相下沉 hub-contracts**（石山重灾区②）：deriveErrorCode / Health·SystemStatus / Create\*Request 三组跨包逐字复刻下沉单一源、两端 re-export 保路径、零行为变化（`8ea6579`）。
- 新功能立项（→ backlog P1，未实现，下一批 frontier）：`INTEGRATIONS-TO-SETTINGS`（集成面板进设置 + 适配器→集成 标签 + 主页精简到"最近事件+指标"）、`DEPGRAPH-ENTRY-OVERLAY`（依赖图右上角录入遮罩浮层 + 看板→依赖图跳转 + I0 ownerLabel 降级到 DetailPanel）、`DEPGRAPH-DRAG-CONNECT`（xyflow 拖拽连线建依赖 + 自动重绘）、`DEPGRAPH-AI-AUTODRAW`（AI 自动布大致 DAG + 人微调）。
- 石山热力图（调研产，供 AUDIT/重构排期，非本轮全修）：① **挂起域死重量**（D-039 治理派生簇 schedule.ts 272 行 + governance schema + SqliteGovStore 靠测试锁活，零运行时引用、虚胖 3-4×）② **重复真相**（本轮已收口 deriveErrorCode/Create\*/Health）③ **模型口径分叉 + 谎标**（两套 Member；statusSource derived/git/lark 无生产者纯装饰；mode=z.literal 切真即崩）④ **前端结构债**（死导航[本轮已删]/死链接 href=#/source prop drill 4 层/孤儿字段）。
- 老实定位：本 ADR 只落地"低风险批"3 项；命名进设置 / 依赖图浮层 / 拖拽连线 / AI 布图 **均未实现**（立项 backlog）；石山①③④ 多数未修（AUDIT-FIXES / 后续重构）；真实 status 派生上游仍未接通。
- 验证：三包 verify:all 全绿（见状态行）；git diff --check 干净；3 commit 各自过 gate。
- 事实源：本 ADR；调研 workflow `wf_def55d4d-916`；用户 Q1–Q4 拍板；`docs/planning/backlog.md`（新立项 4 项 + 低风险批 done 行）；`code-audit-2026-06-14.md`（石山交叉引用）。

## D-051 — KB-IMPORT 独立二次对抗审计 + 正确性硬化（KB-IMPORT-FOLLOWUP 部分收口）

- 状态：**DECIDED / IMPLEMENTED**（2026-06-14；hub-server verify:all 绿[typecheck + 74 测含 +9 新 + build]；6 真实归档重跑 5 导入 + 召回/I0 实证）
- 日期：2026-06-14
- 上下文：D-050 落地后另起一轮**独立**多维对抗审计（`wf_74dee37d-59b`，4 finder 按档分模型[parser/schema-recall/I0-constitution=opus、cli-io=sonnet] → 每条候选 3 票 majority 核实，61 agent / 1.99M token），对**已提交的** KB-IMPORT 代码做第二意见。该轮抓出 D-050 那轮（`wf_a52195b7-44e`）**漏掉的 3 条真实正确性 / §10 缺陷**——独立二审的价值实证：
  - **fileNameToSlug 撞 slug → 静默丢档**（confirmed 3/3，§10）：旧算法 `ascii.length>=3` 直接返回前缀、`.slice(0,48)` 截断、非 ascii 丢字，使 `CAN问题归档甲.md`/`…乙.md`→同 `can`、`26R2历史Bug归档-CAN甲/乙.md`→同 `26r2-bug-can`、`a_b`/`a-b`→同串；同 `issueId` → 第二份归档被 CLI 当「已导入」`skipped-existing` **静默丢弃**（无 warning、退出码 0、与良性「重跑跳过」同形），语料缺失。
  - **toIsoDateTime 不查日历有效性 → 整档 failed 而非兜底**（confirmed 3/3，§10）：`2026-02-30`/`2026-04-31` 范围内但不存在，旧实现返回非法 ISO → 下游 Zod 拒 → 整张档案 `failed`，而非按 best-effort 落兜底日期导入；违文档自述「解析失败返回 null」。
  - **readFile/readdir EISDIR 崩整批**（confirmed 3/3）：名字以 `.md` 结尾的子目录 / 不可读文件使 `readFile` 抛 EISDIR/EACCES，**未捕获 → 整批导入中断**、后续文件全丢、无 summary。
- 决策（落地形态，纯 hub-server import 层硬化，零 contracts/console 改动）：
  1. **slug 单射**：`fileNameToSlug` 无条件拼**全名确定性哈希后缀**（`<可读前缀>-<6 字符 base36>`），截断/非 ascii/标点折叠都不再撞。代价（诚实标注）：与旧算法 slug 不同 → 仅影响**未来**导入；部署语料已冻结、一次性工具不回灌冲突。
  2. **日历校验**：`toIsoDateTime` 加 `Date.UTC` 反查（`Date.UTC` 确定性、非 `Date.now`/`Math.random`），非法日历日返回 null → `deriveDate` 续试后续日期源最终落兜底。
  3. **IO 健壮**：`readdir(_, {withFileTypes:true})` + `dirent.isFile()` 跳子目录；`readFile` 包 try/catch（失败记 `failed` + continue，不中断整批）。
  4. **顺手收口**：`SKIP_FILES` 改小写比较（覆盖 `Readme.md`/`README.MD` 变体，KB-IMPORT-FOLLOWUP nit ④）；`extractSection` 先剥 marker 再剥前导符号 + 清残留 `**`（nit ③）；删 `toInputIssueCard` 死代码 `if(!parsed)throw`（参数收紧为非 null `ParseResult`）；`isCli` 正则匹配 `.js`/`.ts` 两入口。
- 宪法守恒：纯正确性 / IO 硬化，**不触人维度**——I0 探针（`GET /api/kb/similar` 重跑 grep `memberId/ownerId/confirmedBy/m-*`）CLEAN；C2/A4/G2 不变（generatedBy=hybrid、客观 TAG_VOCAB、只 append 同一语料）。**驳回项**（majority 未过）：markdownContent/fileName 偶含人名外露（条件性、by-design 自由文本回显，非违宪，且依赖未证实的 rawInput 脱敏前提）；IMPORT_FORCE 重导无去重（仅磁盘膨胀、召回零影响，降为 nit）。
- 老实定位：① KB-IMPORT-FOLLOWUP 的 nit ①（IMPORT_FORCE 去重）②（汇总文档 rootCause `；`串接）**仍未做**——前者本轮二审确认仅存储卫生、召回无损，后者全文留 rawInput 故召回无损，均非阻塞保留；② `extractSection` 仍可能留 `(commit xxx):` 片段（commit 哈希是有用召回信号、by-design 外露，不再清）；③ 名字含人名的自由文本若进归档正文会随 rawInput/rootCause 进语料（团队自著调试笔记、当前数据是 commit 哈希；非本轮范围）。
- 验证：hub-server `verify:all`（typecheck + 74 测 + build）全过，新增 9 测（toIsoDateTime 日历边界 / fileNameToSlug 撞区消歧 4 例 / runImport IO：子目录跳过·README 大小写·撞 slug 两卡·重跑幂等）；6 真实归档重跑 5 导入 0 失败、slug 哈希后缀化、debug-checklist 日期由文件名正确解析（不再落兜底）、CAN/UART 查询召回 iss-pf-*、I0 探针 CLEAN。
- 影响 / 落地：改 `apps/hub-server/src/import/{parse,import}-debug-archive.ts` + `test/parse-debug-archive.test.ts`；新 `test/import-debug-archive.test.ts`。
- 后续（backlog）：`KB-IMPORT-FOLLOWUP` 收窄为剩余 nit ①②（非阻塞）；H2（FileKbStore writeChain）仍归 `AUDIT-FIXES`（长驻服务器路径）。
- **收口（2026-06-20，nit ①② 全清）**：① nit① 经核 `appendCloseoutInto`（`mock-kb-store.ts`）早在 commit `732a2c9` 起已按**确定主键 upsert**（issueCard.id / errorEntry.id=`err-<issueId>` / archive.issueId，全确定）→ IMPORT_FORCE 重导本就幂等、数组不膨胀；非「修复」而是**证实 + 补回归测锁定**（`import-debug-archive.test.ts`：force 重导后三数组长度恒定）。② nit② `extractSection` 段内续行改**空格接**、仅段与段间用 `；`（消「因为电压；超过阈值」式伪分句；rawInput 全文不变、kb-similar 关键词召回无损），补回归测（`parse-debug-archive.test.ts`：段内空格 / 段间 `；`）。hub-server verify:all 绿（149 测含 +3 新）。`KB-IMPORT-FOLLOWUP` 全收口。
- 事实源：本 ADR；独立二审 `wf_74dee37d-59b`（vs D-050 的 `wf_a52195b7-44e`）；`docs/planning/backlog.md` KB-IMPORT-FOLLOWUP；D-050。

## D-050 — KB-IMPORT-PROBEFLASH：ProbeFlash .debug-archive 一次性导入（frontier#1 done）

- 状态：**DECIDED / IMPLEMENTED**（2026-06-14；hub-server verify:all 绿[typecheck+65 测含 23 新解析测+build]；6 真实归档实跑 5 导入 + 召回实证；3-lens 对抗核实 wf_a52195b7-44e 裁 ship[block 仅 DoD/流程非正确性，3 mustFix 已闭]）
- 日期：2026-06-14
- 上下文：frontier#1 最后一项。把 `debug-checklist` skill 攒的历史调试归档（`Probe_Flash/.debug-archive`，6 md：异构——部分 YAML frontmatter、部分裸检查清单、单文件常汇总多 bug）一次性灌进 KB 检索语料，让历史经验跨赛季可召回。**一次性非长期同步**（用户已定后续本地不再产 archive、全留服务器）。
- 决策（落地形态，纯 hub-server，零 contracts/console 改动）：
  1. **纯解析器** `src/import/parse-debug-archive.ts`（零 IO 可单测）：frontmatter 拆分 + 文件名→ascii slug + 日期派生（frontmatter date→文件名日期→正文「生成于」→兜底常量）+ 领域词表 TAG_VOCAB 客观打标 + best-effort 抽根因/修复/预防段。**一文件=一张归档卡**（汇总文档无可靠 bug 边界，best-effort 下「整篇可召回」比「假装精确拆分」诚实，rawInput 存全文供关键词扫描）。
  2. **导入 CLI** `src/import/import-debug-archive.ts`：读归档目录→解析→组 IssueCard(status=resolved)→canonical `buildCloseoutFromIssue`（**注入历史时戳**：errorCode/归档名反映 bug 当年日期 `DBG-<历史日期>-NNN` 而非 server 当前钟）→`FileKbStore.appendCloseout`（与 server `TEAMHUB_KB_DATA_FILE` 同一落盘文件）。skip-existing 幂等（重跑跳过已导）。README 跳过。**为何独立 CLI 非走 POST /api/kb/closeout**：那条路由用当前钟戳（丢历史）；CLI 复用同一 canonical 纯函数 + 同一持久层，不复刻派生逻辑（§10/G2）。
  3. **重构** `deriveErrorCode` 从 `server.ts` 抽到 `src/kb/error-code.ts`（CLI 与 server 共用同一确定性派生，DRY）。
  4. **npm 脚本** `kb:import`（`node dist/import/import-debug-archive.js`）+ 操作流程入档（见下「运行」）。
- 宪法守恒：**C2/I0 无人维度**——`generatedBy='hybrid'`（来源枚举非人名）、主键 issue/errorCode、标签是客观 TAG_VOCAB 正则命中、绝不写 memberId/MemberKnowledge；**C4/§10 不杜撰**——抽不到根因/修复段给诚实指向性兜底（「详见归档正文」）+ warning 不静默；**G2 单一真相**——只 append 到 server 读的同一语料、不双写。
- **对抗核实**（`wf_a52195b7-44e`，3-lens[I0/C2 + 解析保真/写安全 + 诚实/DoD]→综合）：两技术 lens 均 ship、仅 nit；裁 **block 仅因 DoD/流程**（未提交/无 ADR/无脚本），三项已闭即 ship。**H2（FileKbStore writeChain 无 .catch）判 stays-deferred**——顺序 one-shot CLI + skip-existing 重跑可恢复，咬不到；留 AUDIT-FIXES 批次（服务器长驻路径才需修）。
- 老实定位（不过度声称）：① 汇总文档的结构化 rootCause 是多 bug 串接（`；` 连）非单一结论，全文留 rawInput 故召回无损但结构字段是 mash-up；② IMPORT_FORCE=1 重导会重复 errorEntry/archiveDocument（默认 skip-existing 幂等不受影响，已记 nit）；③ extractSection 有残留 markdown 加粗/表格行（仅影响展示、不影响关键词召回）；④ SKIP_FILES 大小写鲁棒性 gap（真实档案仅 README.md 不受影响）。以上 4 nit 入 backlog `KB-IMPORT-FOLLOWUP`，非阻塞。
- 运行（一次性，operator 在部署机跑）：`cd apps/hub-server && npm run build && npm run kb:import -- <archiveDir> <permanent-dataFile>`（如 WSL2：`~/projects/TeamHub/.../Probe_Flash/.debug-archive` → `~/teamhub-data/kb.json`），再以 `TEAMHUB_KB_DATA_FILE=<同一文件>` 起 server，`/api/kb/similar` 即召回。**实证**：本地跑 6 档案 5 导入 0 失败，errorCode 历史化（DBG-20260515-714 等），4 条代表查询（FreeRTOS HardFault / 夹爪抬升 / 串口 IDLE DMA / 达妙上电）均召回 iss-pf-* 历史 bug。
- 影响 / 落地：新 `apps/hub-server/src/import/{parse,import}-debug-archive.ts` + `src/kb/error-code.ts` + `test/parse-debug-archive.test.ts`（23 测）；改 `src/server.ts`（deriveErrorCode 抽出）+ `package.json`（kb:import）。
- 后续（backlog）：`KB-IMPORT-FOLLOWUP`（4 nit）；真实时钟注入；embedding 重排；console KB 页加「上传归档」入口（当前只有检索+结案表单，批量导入是 CLI）。
- 事实源：本 ADR；`docs/planning/backlog.md` KB-IMPORT-PROBEFLASH；对抗核实 `wf_a52195b7-44e`；用户 2026-06-14「直接连做直到功能做完，用 workflow」+「连 WSL 展示 + 说明剩余」请求。

## D-049 — Console 设置页落地 + 代码审计落档（CONSOLE-SETTINGS-PAGE done / AUDIT 记录）

- 状态：**DECIDED / IMPLEMENTED**（2026-06-14；hub-console verify:all 绿 + 本地 Playwright 真机视觉验收；审计为落档非修复）
- 日期：2026-06-14
- 上下文：D-048 后用户先要一次代码级审计（15-agent 对抗，产出 confirmed 42），再把已立项的 `CONSOLE-SETTINGS-PAGE`（commit 4c65b61 记录待做）提为优先级 #1 做出来；审计修复按用户定「等彻底构建完统一批次」后置。
- 决策（落地形态）：
  1. **设置页**（新 `features/settings/SettingsPage.tsx`）四节：数据源（real/mock 段控，复用 App `source`/`setSource`）/ 语言（zh/en 段控，`useI18n().setLang`）/ 后端地址（`localStorage['teamhub.apiBase']` 覆盖 `VITE_API_BASE`，Apply/Reset 走 `reload`，mock 模式置灰）/ 关于（`client.getSystemStatus()` 取 service·version·mode + 回显 `client.mode`）。
  2. **接线**：`ConsoleLayout` `ConsolePage` 加 `'settings'` + nav 项 `page:'settings'`（**只解禁这一个灰项**，其余灰项按用户定先留）；侧栏底部「语言/数据源」两快捷切换**移进设置页、侧栏移除**（用户选）；`App.tsx` `readApiBase()` + `TITLE_KEY` + 路由分支下传 client/source/setSource；`api/client.ts` 加 `getSystemStatus()`（接口 + mock + real）；i18n +23 `settings.*`（zh/en 对称）− 8 孤儿 `control.*`；`styles.css` 删 `.console-controls/.control-toggle*` + 加 `.settings-*`。
  3. **审计落档**：`docs/planning/code-audit-2026-06-14.md`（confirmed 42：High 5/Med 16/Low 12/Nit 3 + 部署前必修 7 条）；`backlog.md` 加 `AUDIT-FIXES-2026-06-14` 索引行（修复后置）。
- 宪法守恒：纯前端设置 + 文档，无领域/契约改动；I0/C2 等不触（设置页无人维度、不写治理数据）。审计本身确认读路径 I0 守住（dep-graph 边不带 actor 字段、`toDepGraphView` 只出结构键）。
- 老实定位（不过度声称）：**审计 42 条仅落档、未修**（含 H1 依赖环卡死 / H2 FileKbStore 写链中毒 / H3 写端点零鉴权 等部署前必修，归 AUDIT-FIXES 批次，真开工可起新 ADR）；后端地址覆盖靠 `reload` 重建 client（非热切）；设置页不含赛季/项目切换（无后端、不做）。
- 验证：hub-console `verify:all`（typecheck + 7 测 + build）全过；本地 Playwright 真机：设置页四节齐全、`getSystemStatus` real 路径拉到 teamhub-hub-server/0.0.1/mock-first、侧栏旧切换消失、「设置」可点其余灰项仍禁、唯一 console error 为 favicon 404（无关）；git diff 自审 6 改 2 新无杂散、`grep control.*` 0 残留。
- 影响 / 落地：新 `apps/hub-console/src/features/settings/SettingsPage.tsx` + `docs/planning/code-audit-2026-06-14.md`；改 `apps/hub-console/src/{App,api/client,components/layout/ConsoleLayout,i18n/translations,styles.css}` + `docs/planning/backlog.md`。
- 后续（backlog/frontier）：**AUDIT-FIXES-2026-06-14** 修复批次（部署前必修 7 条优先）；CONSOLE-COPY-HUMANIZE（文案去 AI 味，姊妹 P1 未做）；其余灰占位（适配器/事件/桥/git/图纸）待定优先级/设计。
- 事实源：本 ADR；`docs/planning/code-audit-2026-06-14.md`；`backlog.md` CONSOLE-SETTINGS-PAGE/AUDIT-FIXES；plan `~/.claude/plans/rosy-giggling-dolphin.md`；用户 2026-06-14「记录审计 + 设置页优先 + git diff 审计」请求。

## D-053 — 自迭代外环（§6.C）+ 完成度模型 + M1 逃生阀【SUPERSEDED-BY D-066·已归档】

- 状态：**SUPERSEDED-BY D-066**（2026-06-15 harness 全改：自迭代外环退役进 `archive/legacy-harness/`）。**全文 → `docs/archive/decisions-archive.md`**。
- 摘要：§6.C 自迭代外环 + `completion-model.yaml` + materialize-before-action 逃生阀；D-039 AI 退治理后外环不再驱动方向、整套冻结。

## D-055 — 4 弱完成度谓词收口为 verify:all + 人审置 `audited:true`（自驱动启用）

- 状态：**DECIDED / IMPLEMENTED**（2026-06-14）
- 日期：2026-06-14
- 上下文：D-053 把自驱动收在 `completion-model.yaml.audited` 一个开关后——`false` 时外环找到 gap 也只 propose-and-stop，须人审 completion-model 一次（确认谓词都打在真接缝上）后置 `true` 才 propose-and-drive。审计时发现 4 个标 `done` 的交付物谓词过弱（只验"文件/字符串在不在"，验不到功能真过）：`PILLAR-KB-READWRITE`（grep `api/kb/closeout`）、`KB-IMPORT-PROBEFLASH`（grep `kb:import`）、`PILLAR-PM-READWRITE`（file_exists `PmCreatePanel.tsx`）、`CONSOLE-SETTINGS-PAGE`（file_exists `SettingsPage.tsx`）。这正是 `now.md` 记录的 AUDIT-H1 弱谓词诈胡（谓词含前端路径被误判 PASS）同一失败模式——`audited:true` 下让外环信弱谓词,可能把伪 done 当真、拿假基线合成下一目标。
- 决策：
  1. **4 条谓词换硬（AND 形式，非纯替换）**：`predicate_kind` 统一改 `cmd_exit0`，谓词 = `<原接缝锚点检查> && npm --prefix <包> run verify:all`。保留接缝特异性（否则 PM/SETTINGS 会塌成同一条 console verify:all，违反"谓词打在真接缝"），把判据从"存在"升到"存在且该包 typecheck+test+build 全绿"。
  2. **人审一次完成 → `audited: false→true`、`synthesis_mode: propose-and-stop→propose-and-drive`**。自此外环在双重耗尽找到 gap 时自动 合成→物化→交回 §6.B 驱动；**§5 宪法门 / §8 安全门 / `epic_cap_per_invocation:1` 三道闸门不变**，干完 1 个 epic 仍 STOP 上报。
- 取舍 / 老实定位：① PM/SETTINGS 共用 console verify:all、KB-CORE/KB-IMPORT 共用 server verify:all，完成度检查时各跑 2 次重复 suite——仅"双重耗尽"（罕见）触发，可接受。② verify:all 是包级（typecheck+test+build），非该 feature 的端到端行为测——但已远强于 file_exists/grep，且包内任何回归都会把它翻回 gap（更保守、更诚实）。③ 翻 `true` 不等于"现在立刻自动跑"：frontier 现有 5 条收尾活，外环短期走不到第 5 步；首个会被自动合成的 gap 是 `DEPGRAPH-ENTRY-OVERLAY`（priority 12，将编号 D-054——D-053 已为外环自合成 epic 预留 D-054 起）。
- 验证：4 条新谓词从 repo 根逐条 `bash -c '<predicate>'; echo $?` 全 = 0（hub-console 7 测+build 绿、hub-server 74 测+typecheck+build 绿）；`grep audited\|synthesis_mode completion-model.yaml` 确认 true / propose-and-drive。
- 宪法守恒：纯 planning 改动（completion-model.yaml + 本 ADR），无领域/契约/代码改动；§5/§8/epic_cap 闸门一字未动。
- 事实源：本 ADR；`docs/planning/completion-model.yaml`（行 15-16 开关 + 4 条 cmd_exit0 谓词）；`AGENTS.md §6.C` / `D-053`；`now.md` 第 7 行 AUDIT-H1 弱谓词教训；用户 2026-06-14 选「先换硬 4 谓词再翻 true」。

## D-056 — DEPGRAPH-ENTRY-OVERLAY：依赖图录入浮层 + 看板↔依赖图互通 + I0 负责人降级（frontier done）

- 状态：**DECIDED / IMPLEMENTED**（2026-06-15）
- 日期：2026-06-15
- 上下文：D-052 提案审查后立项的 console 收尾批第 1 项（完成度模型 gaps[0]，priority 12）。用户「按顺序做 frontier 能执行的所有任务、用 workflow 连续执行」。承接 D-052 Q2 拍板：依赖图升主舞台、录入做近全屏遮罩浮层（非新页面）、看板与依赖图不合并但互通。
- 决策（实现定调）：
  1. **录入浮层（非内嵌、非跳页）**：依赖图右上角「录入」按钮 → `position:fixed inset:0` 遮罩 + 居中 drawer 承载现成 `PmCreatePanel`（复用 D-048 写侧表单，零后端改动）。backdrop `role=presentation`+onClick 关、drawer `role=dialog`+`aria-modal`+stopPropagation。点空白/遮罩退回（用户诉求）。
  2. **依赖图补 `getTasks`**：原只调 `getDepGraph`；嵌入 PmCreatePanel 后补 `useQuery(['tasks',source])`（**与 `PmBoardPage` 同 queryKey、缓存共享、不双取**）填依赖/需求下拉。`onCreated` **同时失效 `['tasks',source]`+`['dep-graph',source]` 两查询**才即时重绘（少一个则图或看板滞后）。
  3. **看板↔依赖图互通（结构键路由，守 I0）**：`PmTaskCard` 加「在依赖图查看」按钮 → `onOpenInDepGraph(task.id)` → `App.focusTaskId` 暂存 → 切 dep-graph → `DepGraphPage` useEffect 图加载后按 `graph.nodes[].id===task.id` 选中并消费 focus。**传的是 task.id 结构键、非人 id**；早返回守卫（`!focusTaskId||!graph` return）防 onConsumeFocus 内联箭头换引用导致的重复触发。
  4. **I0 负责人降级（核心护栏）**：节点卡片 `dag-node__owner` **去掉 ownerLabel**、只留结构键（组·车）；`ownerLabel` 降级到 DetailPanel 按需显 + 新增「负责人只表分工·不代表进度快慢」反排名说明；topbar 加「图上只显任务/组/卡点·不排个人」。从「人维度画布常显」降到「按需显+反排名免责」。
- 对抗核实：`wf_9a77daa8`（2-lens：opus I0 暴露面 + opus React/TS 正确性，并行）双裁 **ship / mustFix=0**。I0 lens 实证净改善（移除一项画布常显人维度 + 反排名说明、focusTaskId 走结构键、PmCreatePanel confirmedBy 仅写侧不回显、无新 rank/快慢字段进读视图）；正确性 lens 实证 useEffect 无无限循环（focusTaskId 置 null 早返回幂等）、queryKey 共享无双取、空 tasks 各表单降级（needTwoTasks/needOneTask/optional chaining）不崩、props 可选缺省安全、无未用 import、既有 onConnect/拖拽连线未动。唯一非阻塞 note（onConnect useCallback deps 列了未读的 `source`）属**既有**、非本批引入，不在本 PR 修。
- 老实定位：DEPGRAPH-AI-AUTODRAW（AI 自动布大致 DAG）仍后置（依赖 Hermes 触点产品门，跳过）；真实 status 派生上游未接通；浮层未做 Esc 关闭（非必需）。
- 验证：hub-console `verify:all`（typecheck + 7 测 + vite build）全绿；完成度谓词硬化为 `grep PmCreatePanel … && npm --prefix apps/hub-console run verify:all`（D-055 同法），从 repo 根重跑 exit 0 才翻 done。纯 hub-console 前端，零 contracts/server/契约改动。
- 事实源：本 ADR；`apps/hub-console/src/features/dep-graph/DepGraphPage.tsx`（录入浮层 + getTasks + focus useEffect + ownerLabel 降级）/ `features/pm/PmBoardPage.tsx`（卡片跳转）/ `App.tsx`（focusTaskId）/ `i18n/translations.ts`（+6 键 zh/en）/ `styles.css`（浮层样式）；`D-052`（立项 + Q2 拍板）/ `D-048`（复用 PmCreatePanel）/ `D-055`（谓词硬化同法）；workflow `wf_9a77daa8`。

## D-057 — INTEGRATIONS-TO-SETTINGS：适配器→集成 + 设置页只读集成子节 + 总览精简（frontier done）

- 状态：**DECIDED / IMPLEMENTED**（2026-06-15）
- 日期：2026-06-15
- 上下文：D-052 提案审查 Q1 拍板的 console 收尾批第 2 项（完成度模型 priority 20）。诉求 4：「适配器」是技术黑话，用户语义是「集成 / 连外部应用」（飞书 / Hermes / git / 未来 QQ 微信钉钉）；且总览首屏被一排对接状态占住、喧宾夺主。
- 决策（实现定调）：
  1. **「适配器」→「集成」（仅文案，zh+en）**：所有面向用户的 `适配器`/`Adapters` 标签改 `集成`/`Integrations`（`overview.metric.adapters`、`overview.panel.adapters`、`enum.event.adapter.health.changed`）。**只改 value 不动 key**；状态枚举（已启用/已禁用/降级/未配置）是状态词、保留不动。
  2. **设置页新增「集成」只读子节**：`SettingsPage.IntegrationsSection` 用 `useQuery(['hub-overview',source])`——**与总览同 queryKey、复用同一份 getOverview 缓存、不双取**——只读渲染 `adapters.adapters`（displayName/capabilities/status pill），isLoading/error/empty 三态降级。**不引入真实触点接入**（仍 mock-first，语义是"对接状态只读展示"）。
  3. **总览精简到「指标 + 最近事件」**：删 adapter 详情 `panel-wide` 区，连带删只服务它的 `AdapterRow`/`StatusPill`/`ADAPTER_STATUS_KEY`/`AdapterDescriptor` import（全转移到设置页，避免 `noUnusedLocals` 报错），改成一行「集成对接状态已移到设置页 →」链接（`onNavigate('settings')`，App 传 `setPage`）；summary-strip 的「集成」指标 tile（enabled/total）保留。
- 对抗核实：`wf_f40f5aea`（2-lens：opus I0 暴露面 + opus React/TS 正确性，并行）双裁 **ship / mustFix=0**。I0 lens grep 实证 IntegrationsSection **只渲染 adapters 外部应用描述符**（`AdapterDescriptorSchema` 无 memberId，fixtures displayName 全是应用名 Feishu/Hermes/Git）、对 bridgeMember/memberId/rank 零命中——「集成」是连应用不是人，无人维度泄漏；relabel 未动任何含人字段（面向人的 bridge tile 原样保留）。正确性 lens 实证 queryKey byte 一致共享缓存无双取、删的 4 个 helper 零残留引用（typecheck 绿坐实）、`INTEGRATION_STATUS_KEY` 覆盖 4 枚举（Record 编译期强制）、5 新键 zh/en parity、`status-disabled` CSS 类存在不崩。
- 顺手收口：核实指出删 adapter panel 后 `overview.panel.adapters`/`overview.meta.unconfigured` 成孤儿 key（无消费方）→ grep 确认零引用后从 zh+en 删除（i18n 不留死键）。
- 老实定位：仍 mock-first；真实飞书/Hermes/git 触点接入后置（Hermes 统一触点门，本批不碰）。
- 验证：hub-console `verify:all`（typecheck + 7 测 + vite build）全绿（含孤儿 key 清理后重跑）；完成度谓词硬化为 `grep -qi 'integration' SettingsPage.tsx && npm --prefix apps/hub-console run verify:all`，从 repo 根重跑 exit 0 才翻 done。纯 hub-console 前端，零 contracts/server 改动。
- 事实源：本 ADR；`apps/hub-console/src/features/settings/SettingsPage.tsx`（IntegrationsSection）/ `features/overview/OverviewPage.tsx`（删 panel + 一行链接）/ `App.tsx`（onNavigate）/ `i18n/translations.ts`（relabel + 5 新键 − 2 孤儿）/ `styles.css`；`D-052`（立项 Q1）；workflow `wf_f40f5aea`。

## D-058 — CONSOLE-COPY-HUMANIZE：用户可见文案去 AI 味 / 治理黑话（护栏语义保留，frontier done）

- 状态：**DECIDED / IMPLEMENTED**（2026-06-15）
- 日期：2026-06-15
- 上下文：D-052 提案审查后 console 收尾批第 3 项（完成度模型 priority 25）。三支柱读写跑通后，UI 文案积了一批"治理黑话 / AI 味"——「协作真相」「词重合度」「同因」「派生知识点」「归组不归人」——对外行用户费解。用 humanizer-zh 原则去味，但**死守一条线：去黑话不能丢护栏语义**（A4 相似检索免责 / C2 反排名 / A1 缺口归组不归人 都是反监视铁律的用户可见落点）。
- 决策（实现定调）：
  1. **只改 value 不动 key、zh/en 同步**：6 处 console i18n——`pm.create.title`（删「协作真相」→「全员都看得到」）/`pm.create.subtitle`（「不记谁快谁慢、不排名」→「不比谁快谁慢」）/`pm.field.needDescription`（「归组不归人」→「按组，不点人」）/`kb.empty`（去「词重合度/同因」黑话）/`kb.closeout.intro`（去「派生知识点」）/`kb.closeout.success.knowledge`（「派生知识点」→「存下的知识点」）。
  2. **后端可见串同步**：`hub-server` `KB_SIMILAR_NOTE` 去「词重合」黑话改「匹配程度」、「同因」→「就是同一个原因」，**显式保留「不断言」**（`kb-similar-route.test.ts:22` 断言 `body.note` 含「不断言」）；连带把 console `api/mock/kb.ts` 的演示 note 对齐同句（其注释本就承诺"与后端 A4 措辞一致"）。
  3. **刻意保留不动**：`deriveKnowledgeNodeFromIssue` 的「踩过的坑：」知识节点名前缀——既是 `gov-store-scaffold.test.ts:66` 的测试输入数据，又本就是地道人话（非黑话），改它有害无益；源码注释 / `pm-routes.test.ts` 注释里的「归组不归人」是内部 A1 原则说明、非用户可见 copy，不动。
- 护栏语义保全（本任务红线）：逐条核实去黑话后 A4（只列候选·不断言同因·由人选用）、C2（不比快慢·反排名）、A1（缺口按组不点人）实质全部保留、无削弱无反转，未引入任何「谁快谁慢/排名/盯人」暗示。
- 对抗核实：`wf_8c5051bf`（2-lens：opus 护栏语义保全 + sonnet 保真 / 测试安全）双裁 **ship / mustFix=0**。护栏 lens 逐条确认反监视语义保留；保真 lens 确认零测试断言被撞（`不断言`/`踩过的坑：` 都还在）、`归组不归人` 已从 translations.ts 彻底消失（仅余源码注释）、zh/en parity、无事实增删。
- 验证：`hub-console` + `hub-server` 双 `verify:all` 全绿（hub-server 74 测含 kb-similar-route、hub-console 7 测 + build）；完成度谓词硬化为 `! grep -q '归组不归人' translations.ts && npm --prefix apps/hub-console run verify:all && npm --prefix apps/hub-server run verify:all`，从 repo 根重跑 exit 0 才翻 done。
- 事实源：本 ADR；`apps/hub-console/src/i18n/translations.ts`（6 键 zh/en）/ `api/mock/kb.ts`（mock note）/ `apps/hub-server/src/contracts.ts`（KB_SIMILAR_NOTE）；`D-052`（立项）/ `humanizer-zh` 技能；workflow `wf_8c5051bf`。

## D-059 — AUDIT-FIXES：7 条联网部署前必修一次落地（frontier done）

- 状态：**DECIDED / IMPLEMENTED**（2026-06-15）
- 日期：2026-06-15
- 上下文：`code-audit-2026-06-14.md`（15-agent 对抗审计、confirmed 42）列「部署前必修 7 条」，D-049 落档时定「本轮只落档、修复后置」。三支柱读写 + console 收尾批跑通后，本批一次性补齐这 7 条信任边界 / 可用性 / 持久性缺陷——目标是把「现只内网 demo 安全」抬到可联网部署。
- 决策（逐条修复定调）：
  1. **H1 依赖环 → DoS**：`attribution.ts` `computeCriticalSet` 回溯加 `visited` 守卫（防 parent 链成环死循环卡死整个 server 事件循环——这是**已有环**的读路径兜底）；新增纯函数 `wouldCreateCycle(deps, from, to)`（自环 + 从 to DFS 可达 from，自身有 `seen` 守卫故对已含环的图也 DoS 安全）；`POST /api/dependencies` 落库前调它拒自环/成环（400）——后端原零语义校验、是新边的防线。
  2. **H2 写链中毒**：`FileKbStore.persist` 拆成 `op = writeChain.then(writeOnce)` + `writeChain = op.catch(()=>undefined)`（失败隔离、链 reset 为 resolved，避免一次磁盘抖动后每次 persist 静默跳过、内存与磁盘分叉）+ 返回 `op` 给调用方拿真实错误；`writeOnce` 失败 `unlink` 残留 .tmp（L2）。
  3. **H3 写端点零鉴权**：Fastify 构造 `bodyLimit:256KB`（M17）+ `onRequest` 钩子（仅 `POST /api/*`）——配了 `TEAMHUB_WRITE_TOKEN` 则强制 `Bearer`（401），每 IP 固定窗口限流（429，用真实墙钟 `Date.now` 与派生 clock 解耦、每实例独立）；`main.ts` 非 loopback（≠127.0.0.1/::1/localhost）且未配 token → **拒绝启动**（避免裸暴露未鉴权写端点）。`BuildHubServerOptions` 加 `writeToken?`/`writeRateLimit?`。
  4. **H4 字段注入**：`CreateTaskRequestSchema`（hub-contracts 单一源）status 钳到 `z.enum(['pending','inProgress'])`、statusSource 钳到 `z.enum(['lark','git','console'])`——拒客户端注入 `done`/`shelved`（跳过工作伪造完成）/ `derived`（冒充系统派生信号、违 C5）。**保留** git/lark 派生信号建 `inProgress` 任务的合法用法（取「限制 enum」而非「整删字段」，正是为不破该合法用例 + 既有测试）。
  5. **M6 I0**：`CreateDependency/NeedResponseSchema` `omit({confirmedBy:true})`——创建响应不把 ActorRef 送过边界（读视图永不回人键，也不给未来 GET 路由留照抄模板）。
  6. **H5/M11 compose**：删幻影 Postgres（服务 / `depends_on` / `DATABASE_URL` / `pg_data` 卷——hub-server 无 PG 客户端、从不读，原配置白等 ~60s + 误导运维）；接 KB 持久（`TEAMHUB_KB_DATA_FILE` + `hub_kb` 卷，否则容器重启丢全部 IssueCard/ErrorEntry/Archive）；`deploy/teamhub.env.example` 补 `TEAMHUB_KB_DATA_FILE` + `TEAMHUB_WRITE_TOKEN`（compose bind 0.0.0.0 故必须非空，与 H3 拒启动逻辑闭环）。
  7. **M9 errorCode 碰撞**：`deriveErrorCode(now, issueId, sequence?)` 加可选单调序号（省略回退哈希，供 CLI 历史导入 / console mock 无 store 访问处用）；结案路由用「同日既有 ErrorEntry 数 + 1」传入——消除哈希 mod 1000 在 ~38 次/日生日碰撞 → 静默覆盖污染 `kb-similar` 跨赛季查找。
- 测试：`+11` 测——新 `audit-fixes.test.ts`（10：H1 自环/成环不落库、M6 dep/need 响应无 confirmedBy、H4 done/derived→400 + 合法 inProgress/git→201、H3 401/正确 Bearer→201/GET 放行/限流 429）+ `kb-store-persist.test.ts` H2 失败隔离（1，确定性失败注入=父目录换文件让 mkdir 抛 EEXIST）+ 新 `cycle-guard.test.ts`（6：自环/空图/2 节点回边/传递环 A→B→C+C→A/DAG 不环/已含环 DoS 安全）；**更新** `kb-closeout-route.test.ts` errorCode 测试从 `.toBe`（同码复现=审计指出的碰撞 bug）改 `.not.toBe`（M9 单调不碰撞契约，诚实反映新行为）。
- 对抗核实：`wf_99ea69cb`（3-lens：opus 安全/绕过 + opus 正确性 + opus 回归/完整，并行）**全 ship、mustFix=0**。安全 lens 实证无可绕过（`wouldCreateCycle` DFS 方向对、`computeCriticalSet`/`findRoot` 读路径都有 visited 守卫、唯一依赖写入口走环检测、`onRequest` 钩子覆盖全部 5 个 `POST /api/*`、`isLoopback` 判定把 0.0.0.0 正确视为需 token、bodyLimit 在构造生效、H4 store 无旁路）；正确性 lens 用独立脚本实证 H2 链 reset+串行化保留、M9 两次结案不同码且格式不破、H4 enum 拒注入、M6 Zod 默认 strip 真剥 confirmedBy；回归 lens 实证 7 条全落、现有 POST 测试不被鉴权/限流误伤（都无 token + 默认 120/窗）、compose env_file+0.0.0.0+main.ts 拒启动闭环（容器能起）。
- 老实定位（非部署阻断）：rate-limit key=`request.ip` 在反代后塌成单桶（无 trustProxy/X-Forwarded-For）；Bearer 非定长比较（时序攻击 out-of-scope）；`TEAMHUB_WRITE_TOKEN` 出厂占位值，env 注释明示暴露前改强随机串（`openssl rand -hex 32`）。`wouldCreateCycle` 已补 hub-contracts 直接单测（核实建议的传递环用例）。
- 验证：`hub-contracts` 47 测 / `hub-server` 85 测 / `hub-console` 7 测 + build 三包 `verify:all` 全绿；`git diff --check` 干净；AUDIT-H1-CYCLE-GUARD / AUDIT-H3-WRITE-AUTH 完成度谓词硬化为「接缝锚 grep + hub-server verify:all」，从 repo 根重跑 exit 0 才翻 done。
- 事实源：本 ADR；`code-audit-2026-06-14.md`（7 条必修清单）；`apps/hub-contracts/src/{attribution,error-code,pm-requests}.ts` / `apps/hub-server/src/{server,main,contracts,store/file-kb-store}.ts` / `compose.yaml` / `deploy/teamhub.env.example` / 4 测试文件；`D-049`（落档）/ `D-055`（谓词硬化同法）；workflow `wf_99ea69cb`。

## D-060 — console 换 Aurash 风格 UI 评估：PILOT-FIRST，当前低优先级延后（业务逻辑先行）

- 状态：**DECIDED / DEFERRED**（2026-06-15）——结论已定、暂不动手；优先级靠后，先理业务逻辑。
- 日期：2026-06-15
- 上下文：用户问「换 Aurash 风格 UI 是否可行/合适」。Aurash 前端（`/home/winbeau/wenbiao_zhao/Aurash/frontend`，= AGENTS §2 警告的 `xju-feiyue` 参考项目，业务模型禁搬入）栈 = Tailwind 3.4 + shadcn/ui(new-york/stone) + 19 Radix primitive + tokens.css 单色源 HSL 桥 + next-themes + sonner；console 现状 = 单一手写 `styles.css`(1392 行) + CSS-var 主题、无 Tailwind/Radix/router/暗色/toast、`App.tsx` useState 切页、@xyflow 画依赖图、zh/en 双语、I0 反排名读视图。先出结论给用户拍板、不直接重写。
- 调研：6-agent workflow `wf_0d35c8af-968`（2 sonnet 侦察 + 3 opus 对立视角[拥护/质疑/务实] + 1 opus 综合）；结论关键事实经 orchestrator 对代码核实（OverviewPage 零共享 primitive / @xyflow style import + EDGE_COLORS JS 常量 / 3 条 I0 串行号 / styles.css 1392 行 / 五库全无）。
- 决策（结论）：**PILOT-FIRST**。
  1. **Phase 0（换 ~15 个 `:root` token + 2 字体，<1 天，0 .tsx/0 依赖/0 框架风险）拿 ~80% 暖纸风视觉收益**——只想要"好看"到此为止。
  2. 全套 Tailwind+Radix+shadcn = **7–14 人天**，唯一真工程收益 a11y（录入浮层无焦点陷阱/Esc/焦点恢复）只在浮层/表单 + 设置页 select **两处**有意义 → 对一个在跑/双语/~10–20 人用的 5 页内部工具**默认不做**；先用 **OverviewPage** 试点（~1–1.5 天）+ 决策门（verify:all 绿 + 团队主观签字 + bundle 增量可接受 + 其余四页无回归）验证再决定整站。
  3. 全套 19-Radix Option C（2–4 人周，+60–100KB gzip JS）= 过度工程，不做。
  4. **共存关键开关 `corePlugins:{preflight:false}`**（否则砸烂 @xyflow + styles.css 盒模型）。
- 护栏（重写时不可破）：① I0 反排名 3 条承重串（`depgraph.entry.note`/`depgraph.detail.ownerNote`/`pm.create.subtitle`）+ ownerLabel 不上节点脸 + 看板无人均列 + `claimedByMemberId` 强制 null（AGENTS §5 / D-056）；② zh/en 编译期 parity（`Record<TranslationKey>`）；③ @xyflow 契约（preflight:false + `.dag-node--blocked-idle` 斜纹手写 CSS + EDGE_COLORS/NODE_W/H 手改）；④ **绝不搬 xju-feiyue 业务模型**（`cat-*`/`tag-*`/`ai-*` token、credits/conferences/schools/admin 组件、飞跃品牌文案——AGENTS §2）。
- 老实定位：本条是**"优化"类，排名靠后**；用户明示先把业务逻辑理清（"业务也有点问题"）。UI 评估只落档不驱动，动手前须过决策门。
- 事实源：本 ADR；`docs/research/aurash-restyle-assessment.md`（status: deferred，完整 ①②③④ + 分歧）；workflow `wf_0d35c8af-968`；`AGENTS §2`（xju-feiyue 禁搬入）/ `D-056`（I0 读视图）。

## D-061 — v1 能跑产品：治理快照落盘 + 图纸提交日志 + 删 mock 单后端（workflow 连续构建）

- 状态：**DECIDED / IMPLEMENTED**（2026-06-15）
- 日期：2026-06-15
- 上下文：用户以 PM 视角定 v1 = **「先做出来一个能跑的、接口都能接进来」**，明确「不要急着说这里没接那里没接」（真实上游派生是 by-design 后置、非 bug）。PM 体检发现真正挡「能跑」的硬伤：**PM/治理数据不落盘**——KB 有 `FileKbStore`（重启不丢），但 gov 只有 `InMemoryGovStore`（seed 演示 fixture）+ `SqliteGovStore` throw 桩，真实模式录的任务/依赖/缺口**重启清零、还被演示假数据占着**；且 mock 数据源开关造成「切源即重置」困惑；图纸档案只有扁平 2 条 fixture、无机构/版本/历史。用户拍板用 workflow 连续做掉。
- 决策（实现定调）：
  1. **图纸提交日志模型**：`ArtifactRefSchema`（hub-contracts）加可选 `mechanism`(机构/部件) + `revision`(第几版) + `submittedVia`(git/lark/console 来源 seam)，向后兼容；「提交日志/时间线」= 同机构多条 `ArtifactRef` 按 `createdAt` 排。
  2. **图纸搬进治理快照**：`GovernanceSnapshot`（**手写 TS interface in attribution.ts，非 zod schema**——design-lock 纠正 A2 措辞）加 `artifacts: ArtifactRef[]`；`GET /api/artifacts` 改读 `(await store.getSnapshot()).artifacts`。**保留** `artifactRefFixtures`/`apiContractFixtures.artifacts` 导出（`fixtures.test.ts` 未改仍断言）。
  3. **`FileGovStore`**（NEW hub-server，**1:1 镜像 `FileKbStore`**）：原子 tmp+rename 写 + writeChain 失败隔离（AUDIT H2 同法）+ `create(file, seed)` 读盘或 seed+persist + 载入走 `GovernanceSnapshotSchema` fail-closed；写白名单（createTask/createDependency/createNeed/closeoutKbNode）内嵌 `InMemoryGovStore` 复用 id/时戳/clamp 逻辑零漂移、每次写后 `persist()`。`main.ts` 读 `TEAMHUB_GOV_DATA_FILE`→`FileGovStore.create()` 注入 `buildHubServer({store})`（镜像 KB 块，H3 loopback/token 逻辑不动）。compose + env.example 加 `TEAMHUB_GOV_DATA_FILE` + `hub_gov` 卷（镜像 KB H5）。
  4. **种子**：`governanceScenarioFixture.artifacts` = 8 条真实版本日志（底盘 v1/v2/v3、抬升机构 v1/v2、夹爪 v1、视觉模组固件 v1/v2，各带 mechanism+revision+kind+date+uri[+relatedCommit]）。fresh 数据文件 seed 此快照（**空板起步是后置 1-flag，本轮用户明确要测试种子数据**）。
  5. **删 mock 数据源模式**：删 `apps/hub-console/src/api/mock/*`，去 `source: mock|real` 开关（App/ConsoleLayout/SettingsPage），`createHubApiClient` 恒真实；重写 `client.test.ts` 3 个 mock 测为注入 fetcher 的真实模式测（保覆盖）；删死 i18n 键 + 把 8 条「切到演示数据」误导文案改指「检查后端地址/服务」；zh/en `Record<TranslationKey>` parity + 3 条 I0 串原样。
  6. **console 图纸档案页**：NEW `features/archive/ArchivePage.tsx`——`getArtifacts()`（新增到 HubApiClient）→按机构分组（无机构归「未分组」末位）、组内日期倒序、组按最新活跃排，每条显 名·版本徽章·类型·日期·关联提交·地址；真实导航项 `nav.archive`（FileStack 图标，**非禁用**，在 PM 与灰 INV 之间）+ App 页切换 + i18n 9 键 zh/en。**I0**：artifact 无人维度，页不显人/排名。
- 构建方式：7-agent workflow `wf_eb55b2ca-8fe`（design-lock[opus 验架构+出 per-unit DoD]→后端实现[opus]→删mock[opus]→档案页[opus]→3-lens 对抗核实[opus 并行：I0护栏/正确性·回归/DoD·诚实]→repair[未触发]）。design-lock 抓出 6 处真实接缝（GovernanceSnapshot 是 interface 非 schema、required 字段涟漪 schedule fixtures 经 spread 继承、apiContractFixtures.artifacts 消费方、client.test.ts 路径、DataSource 线程、getArtifacts 不存在需新增）并校正实现，**architectureOk:true**。6 原子 commit `5a2c96d→01d06f4`（先在 feature 分支，我 ff master 后 push）。
- 对抗核实：3-lens **全 ship、mustFix=0**。I0 lens grep 实证 3 条 I0 串 zh+en 原样 + 无人维度新增；正确性 lens 独立跑三包 verify:all 全绿 + 实证 FileGovStore 落盘/round-trip；DoD lens 实证 8 单元全落、commit 原子+本地未推、无 §10 过度声称。2 条非阻塞 nit（`routes.test.ts` artifacts 只断言 length>0 不证 store-sourcing；`gov-store-persist.test.ts` 未断言新字段 round-trip——功能已 smoke 实证）。
- **我（主循环）独立验证**：三包 `verify:all` 重跑 exit 0（hub-contracts 47 测 / hub-server 89 测[+4 gov-store-persist：seed-on-fresh/重启不丢/corrupt fail-closed/H2 写链不中毒] / hub-console 6 测 + build）；`git diff --check` 干净；**真机 smoke**（4199 单端口 console+API+`TEAMHUB_GOV_DATA_FILE`）：`GET /api/artifacts` 返 8 条版本日志（机构/版本/来源/日期/关联commit）、FileGovStore 落盘 15KB 文件含 8 artifacts+8 tasks（重启不丢实证）、Playwright 视觉档案页按机构分组时间线正确、mock 文案/开关消失、4177 旧实例未碰。
- 老实定位（非阻塞）：真实 status / 图纸上游派生仍未接（seam 留 `statusSource`/`submittedVia` 枚举 + `store?: GovStore` 注入口，等 Hermes/飞书/Git 触点）；fresh 文件 seed 测试数据、空板起步是后置 1-flag；2 条测试断言强度 nit 待排（功能已实证）；OverviewPage→档案页链接（低优先级）未加。
- 事实源：本 ADR；`apps/hub-contracts/src/{schemas,attribution,fixtures}.ts` / `apps/hub-server/src/{server,main}.ts` + `store/file-gov-store.ts` + `test/gov-store-persist.test.ts` / `apps/hub-console/src/features/archive/ArchivePage.tsx` + `api/client.ts` + `App.tsx` + `components/layout/ConsoleLayout.tsx` + `i18n/translations.ts` / `compose.yaml` / `deploy/teamhub.env.example`；workflow `wf_eb55b2ca-8fe`；`D-042`（base 收口刀 GovStore 扩展点）/ `D-059`（FileKbStore H2/H5 同法）/ `D-049`（设置页）。

## D-062 — 集成模型地基重建：扁平 AdapterDescriptor → BotChannel / AgentBackend / DataSource 三分

- 状态：**DECIDED / IMPLEMENTED**（2026-06-15）
- 日期：2026-06-15
- 上下文：旧的扁平 `AdapterDescriptor` 把"机器人触点 / AI 后端 / 只读数据源"三类语义混成一张表——`kind` 字段是装饰、无人 switch、invoke 契约错配、status 假值、lark 有三个互不相连化身，难以演进真实接入。同时认证模型拍定 = **A「公共后端、无登录」**（服务端无账号/session/JWT，唯一鉴权是全队共用 `TEAMHUB_WRITE_TOKEN` 仅挡非 loopback 的 POST；飞书/微信/QQ 当通知渠道、非登录方式；"我的视图/按人记账"才需上 B 登录，已推迟）。详见 memory `teamhub-integration-model` + 计划文件 `a-qq-bot-hermes-openclaw-agent-shimmering-cherny.md`。
- 决策（实现定调）：
  1. 拆成三个一等公民：**`BotChannel`**（飞书/微信/QQ，连接型 status，动词 receive/reply/push）/ **`AgentBackend`**（hermes/openclaw/claude-code，唯一有 invoke/health/capabilities，字段 `backendId`）/ **`DataSource`**（git-forge/artifact-store，只读，`sourceRef`；artifact-store=`filebrowser://artifacts` 预留 Filebrowser 落点）。
  2. 路由：`/api/adapters*` → `/api/bot-channels` + `/api/agent-backends`（+ `:backendId/health|capabilities|invoke`）+ `/api/data-sources`。
  3. `AdapterDescriptorSchema` **弃用保留**（lark-gateway/lark-toolkit/pf-skills 三个真 app 的 hub.ts 仍用它自描述，删了得罪 3 个 app）。删 xiaolongxia、pf-skills 移出集成列表。
  4. mock：`mock-adapters.ts` → `mock-integrations.ts`（bot-channel + data-source），`mock-ai-adapters.ts` → `mock-agent-backends.ts`。
  5. console 设置页集成子节按三类分小节渲染；i18n zh+en + styles。
- 老实定位（非阻塞）：`HubEventSourceSchema` 仍混 bot/agent/内部源（事件源枚举清理推迟）；飞书真实连接状态探测推迟（`BotChannel.status` 现为诚实占位）；系统状态 `adapters` 字段语义漂移为 agent-backend 计数（靠 i18n 标签消解）；真实触点接入仍 mock-first。
- 验证：hub-contracts 47 测 / hub-server 91 测 / hub-console 6 测 全绿 + 三包 build + 活体 curl 三组新端点过；3 个 bot app 未装 vitest 跑不了但未改其源、依赖符号保留。
- 事实源：本 ADR；`apps/hub-contracts/src/{schemas,fixtures,index}.ts` / `apps/hub-server/src/{contracts,server,status}.ts` + `mock-integrations.ts` + `mock-agent-backends.ts` / `apps/hub-console/src/{api,features/settings/SettingsPage,i18n/translations,styles}`；memory `teamhub-integration-model`；`D-057`（适配器→集成进设置）/ `D-061`（v1 能跑产品）。

## D-063 — 依赖图运维操作：任务状态流转 + 连线作废（软删除）

- 状态：**DECIDED / IMPLEMENTED**（2026-06-15）
- 日期：2026-06-15
- 上下文：依赖图只能「建任务 / 建依赖」，无法把「进行中」任务标完成、无法删错连的依赖。根因是 `GovStore` 故意的「只建不改」写白名单（C3 小作坊：无 update/delete/list 全家桶），且任务状态本设想由 git/lark 派生信号推出、但该管线尚未接 → 实际部署里状态=创建时手填、永不变化（用户实测「进行中删不掉/标不了完成」）。详见 plan `distributed-rolling-parasol.md`。
- 决策（实现定调）：
  1. **不引入通用 CRUD**，框定为「既有枚举上的受限状态机迁移」：`TaskStatus` 用既有 `done`/`shelved`（标完成是合法迁移，区别于建任务期「禁 done」防伪造）；`DependencyStatus` 用既有 `waived`（人工判定作废=**软删除**，保留 confirmedBy/createdAt 可审计，**不物理删**）。
  2. 新写入全用 **POST 子资源动作**：`POST /api/tasks/:id/status`、`POST /api/dependencies/:id/waive`——因写鉴权钩子（H3）只拦 `POST /api/*`，用 PATCH/DELETE 会**绕过 Bearer 鉴权 + 限流**。
  3. **C5**：`statusSource` 一律 server 钉 `console`（最低优先源；请求 schema 不收 statusSource，结构上杜绝冒充 derived/git/lark）。**I0**：响应剥 confirmedBy。**视图**：`toDepGraphView` 边循环跳过 `waived`（从图隐藏），`satisfied` 仍可见。waive 只删边不可能成环、无需 cycle 守卫。
  4. console：`DetailPanel` 加「标记完成 / 重新打开」按钮 + 全状态下拉（搁置走内联二次确认）；连线**点选 → 画布顶部删除确认条**（`deleteKeyCode=null` 禁删除键防误删）；删除条**优先于残留成功/错误横幅**显示（否则建依赖的成功横幅会挡住删除条 = 用户实测「删不掉」根因）；成功/错误横幅 **4s 自动消失**。
  5. `GovStore` 接口加 `updateTaskStatus`/`waiveDependency`（InMemory/File 实现 + Sqlite stub）；未命中 id 返回 null → 路由 404；File 仅命中才落盘。
- 验证：hub-contracts **48** 测 / hub-server **101** 测 / hub-console **7** 测 全绿 + 三包 build + 本机活体 curl（200/400/404 + waived 隐藏）+ **WSL2 真机部署活体验收**（rainman@DESKTOP-Jackrainman 127.0.0.1:4177，git-bundle/patch 过 SSH，标完成/删连线浏览器实测）。
- 事实源：本 ADR；plan `distributed-rolling-parasol.md`；`apps/hub-contracts/src/{pm-requests,attribution}.ts` / `apps/hub-server/src/{store/{gov-store,mock-gov-store,file-gov-store,sqlite-gov-store},contracts,server}.ts` / `apps/hub-console/src/{api/client,api/schemas/pm,features/dep-graph/DepGraphPage,i18n/translations,styles}`；`D-059`（H3 写鉴权 / H4 status clamp）/ `D-042`（写白名单初始态 clamp）。

## D-064 — commit+push 默认化：扩展到交互式会话

- 状态：**DECIDED**（2026-06-15）
- 日期：2026-06-15
- 上下文：`AGENTS §6.0`（用户 2026-06-11）早已授权「completion gate 通过即直接 commit+push、无需 review」，但措辞落在 §6.A/§6.B/§6.C 自迭代 / 双轨构建语境。交互式（用户当面逐轮指挥）会话里 agent 仍按全局「问了才提交」默认，反复问「要不要 commit+push」，用户嫌烦、明确要求改默认。
- 决策：把该授权**扩展为对一切改动的默认**——含交互式会话。做完一个可验证改动（最小验证通过 + planning sync）即**默认 commit+push**，不再每次问；仅当用户对某次明确叫停才暂缓。push 前 `git fetch` 查分叉、有叉先 rebase/合并。**§3/§8 安全边界（真实服务器 / SSH / 部署 / 80·443 / 密钥）不在授权内，仍需审批**。
- 事实源：本 ADR；`AGENTS.md §6.0`；memory `teamhub-autonomy-loop` / 新增 commit-default feedback；`D-043`（双轨构建纪律）。

## D-065 — 审计后 server 硬化 + 写侧正确性批（写侧小批 + 预写部署代码合并 pass）

- 状态：**DECIDED / IMPLEMENTED**（2026-06-15）
- 日期：2026-06-15
- 上下文：用户问「项目还有哪些可优化 / 构建」→ 跑 14-agent 审计 workflow（`wf_2f92f9cc-bd7`：6 finder[审计项重对账 / 新代码 bug / I0 安全 / 架构工具 / 前端 / 构建路线图]→对抗核实→综合）产 38 优化 + 24 构建。用户拍板：先做两批无外部门、可立即落地的——「写侧正确性小批」+「预写部署代码」，因都改 `server.ts`/契约层，合并成一次 pass。bridge/members 逐人状态板（唯一确认 I0 违反）用户拍**暂时保留**、标真实部署前必处理（fixture-only + 治理层 D-039 已挂起，现不急）。
- 决策（实现定调）：
  1. **写侧正确性（已对抗核实）**：`POST /api/agent-backends/:id/invoke` `.parse`→`safeParse`+400（M8 旧账，D-062 改路由名漏补，全 POST 唯一抛错处）；`POST /api/kb/closeout` 补 `reply.code(201)`（L4）；`InMemoryGovStore` 构造器补全克隆 groups/members/taskKnowledgeTags（M13，8 数组与 `FileGovStore.cloneSnapshot` 对齐）；补 console 写侧测试 createTask/createDependency/createNeed/closeoutKb + 400-detail 透出（M21）+ hub-server invoke-400 回归。
  2. **预写部署代码（上线等 §8 审批、代码先就位）**：`SystemStatusResponseSchema.mode` `z.literal('mock-first')`→`z.enum(['mock-first','real','hybrid'])`（real/hybrid 部署 server 自解析自身响应不再 500）+ `buildSystemStatusResponse` 加 mode 参默认 mock-first；`buildHubServer` 加 `trustProxy?` 透传 Fastify + `TEAMHUB_TRUST_PROXY=true`（4177 反代/隧道后面不开则写限流塌成全队单桶=DoS）；`TEAMHUB_DEMO_SEED=false` 空板起步（V1-FOLLOWUP-2，fresh 落盘文件 seed 空板、不进演示假数据，仅影响新建文件）+ env.example 补 token 强随机提示 / TRUST_PROXY / DEMO_SEED。
  3. **不在本批动**：bridge/members（用户拍暂留）、ownerId/ownerLabel（D-041 安全堆设计张力非泄漏，待 AGENTS §5 措辞对账）、前端 a11y 簇（M14/15/16）、M20 workspace 工具、KB schema 双声明等长尾 → 留后续 console 批 / 部署批。
- 验证：三包 verify:all 全绿（hub-contracts 48 / hub-server **102**[+1 invoke-400] / hub-console **9**[+2 写侧]）+ git diff --check 干净 + 真机 smoke（`TEAMHUB_DEMO_SEED=false` → /api/tasks·/api/artifacts 空、season 元信息留；默认 → 8 任务 + 8 图纸；mode 仍 mock-first 正常解析）。
- 事实源：本 ADR；审计 workflow `wf_2f92f9cc-bd7`；`apps/hub-contracts/src/system-status.ts` / `apps/hub-server/src/{server,status,main,store/mock-gov-store}.ts` + `test/{routes,kb-closeout-route}.test.ts` / `apps/hub-console/test/client.test.ts` / `deploy/teamhub.env.example`；`code-audit-2026-06-14.md`（M8/L4/M13/M17/M20/M21 源）/ `D-059`（H1~M9 部署前必修首批）/ `D-061`（V1-FOLLOWUPS）。

## D-066 — harness 全改：Ops 重做 + 编排纯化精简 + Codex/OpenCode archive fallback

- 状态：**DECIDED / IMPLEMENTED**（2026-06-15）
- 日期：2026-06-15
- 上下文：用户对照 `xju-feiyue-scripts` 的 harness 工程，定调对 TeamHub 做**整体 harness 全改**（非 cherry-pick）。结论：TeamHub 架构（Zod 契约 / Vitest 三包 / I0 不变式）已比 feiyue 成熟，要学的全在**运维纪律**维度；同时把重型 agent 编排（双轨 §6.A/B/C + self-iterate 外环 + completion-model + 3 编排 skill）瘦成 feiyue-style 精简、CC-centric 主手册。导火索 = 实测发现 `start-teamhub.sh` 漏 export `TEAMHUB_GOV_DATA_FILE` → 真实启动路径上治理落盘（D-061）形同虚设（测试机现仅演示数据，未丢真数据）。
- 决策：
  1. **Ops harness 全量重做**（吸收 feiyue 运维纪律，已落地）：start-teamhub.sh 接 gov 落盘（活体证重启存活）；`scripts/backup-teamhub-data.sh`（备份读回校验）；`verify-hub-compose.sh` 抹卷护栏（只许 `*smoke*`）；`/health` 加 buildId 活体戳（feiyue `?v=` 等价）；`scripts/pre-commit.sh`（密钥 grep + 空白）；`apps/hub-server/test/e2e-pillars.test.ts`（驱动真 `dist/main.js`/`tsx src/main.ts` + 真杀进程重启，断言跨 reload 内容往返——`app.inject` 证不了的层）；`docs/deploy/RUNBOOK.md`；`docs/dev-debug-archive/` 把审计 H1-H5 写成 KB 卡（吃自己的狗粮、bug→铁律可追溯）。
  2. **编排纯化精简**：`AGENTS.md` 从 ~156 行双轨重型改写为精简 CC-centric 主手册（§1 是什么 + I0/C 不变式 / §2 铁律 / §3 命令 / §4 验证门 / §5 安全边界 / §6 踩坑→铁律）；M1/M2/M3 + completion gate 精华折成铁律，不再展开 apparatus。退役（移进 `archive/legacy-harness/`）：3 编排 skill（atomic-task/continuous-build/self-iterate）、`completion-model.yaml`、`agent-state.json`。
  3. **archive fallback**：`archive/legacy-harness/AGENTS-serial.md` = 冻结的原 `AGENTS.md` 全文（自含 §6.0+§6.A+验证+安全+宪法+真实性），作**非 Claude Code 串行轨（Codex/OpenCode）的 fallback**——它们无 workflow 编排能力，照 §6.A 跟随、不依赖新 CC 主手册。
  4. **必活不变式**（精简≠失纪律，feiyue 的精简是「少而钉死」）：I0 / C1-C5 / 反监视 A1/A2/A4 / verify:all 绿才 commit / 非 loopback 必配 token / 安全边界（无审批不写真服务器·SSH·systemd·80·443）/ commit+push 默认（D-064）—— 全进新铁律段、不退。
  5. **不动**：hub-contracts/Zod 契约 + Vitest 三包测试架构（已比 feiyue 成熟，照抄单文件/零依赖=倒退）。**不做**：全套 CI（feiyue 自己拒绝、LAN-only，本地 verify:all 即上限）、systemd 上线 runbook（`REMOTE-ACCESS-DEPLOY` 未拍，批了从 git 历史捞 v0.3 模板）、2-hop scp 部署编排（死绑 feiyue 拓扑）。
  6. **保留（执行期安全决定）**：`.agents/skills` ↔ `.claude/skills` 双源镜像机器（`sync-skills.sh` hook / `verify-skills-sync.sh` 哨兵）+ 4 产品 skill（debug-checklist/kb-debug/personal-daily-summary/pre-match-checklist）。镜像 hook 疑似挂全局 PostToolUse（repo 内无 settings.json 注册）、贸然删有破坏面，本轮**不动**；archive 已留副本，「单一 skills 位置」收口列为低优先后续。
- supersede：**D-043**（双轨构建纪律）、**D-053**（自迭代外环 §6.C）——范式被精简 CC 主手册取代；两者全文 + skill + completion-model 冻结在 `archive/legacy-harness/`，复活路径见其 README。
- 验证：三包 verify:all 全绿（hub-contracts 48 / hub-server **105**[+3 e2e] / hub-console 9）；A1 重启存活活体证；backup 三分支（valid→0/corrupt→1/missing→0）；抹卷护栏拒真项目 exit2；buildId 注入 deadbeef/回落 0.0.1；kb:import 5 imported/0 failed + 召回 H1/H3；archive 自含校验（6 § 锚点齐、无悬挂引用）。
- 事实源：本 ADR；plan file `feiyue-script-harness-team-hub-synchronous-eich.md`；`AGENTS.md`（精简）/ `archive/legacy-harness/`（冻结全文 + 退役件）；`start-teamhub.sh` / `scripts/{backup-teamhub-data,pre-commit,verify-hub-compose}.sh` / `apps/hub-server/{src/status.ts,test/e2e-pillars.test.ts}` / `apps/hub-contracts/src/system-status.ts` / `docs/deploy/RUNBOOK.md` / `docs/dev-debug-archive/`。

## D-067 — 图纸档案可写：POST /api/artifacts + console 登记表单（V1-FOLLOWUPS 收尾）

- 状态：**DECIDED / IMPLEMENTED**（2026-06-16，commit `b7eaf4b`）
- 日期：2026-06-16
- 上下文：用户「teamhub 后续还有什么任务，有的话顺推」。盘点 frontier：可执行项仅剩 V1-FOLLOWUPS（低优先级·非阻塞），余皆卡用户排期或外部基建（INV/Hermes/KB-LARK/正式部署/治理派生挂起）。V1-FOLLOWUPS 四子项中 ②（空板起步）早于 D-065 已 done，①③④ 未做。顺推图纸档案从「只读 + 8 条种子」升为可写。
- 决策：
  1. **append-only 提交日志，不解版本进阶语义**：本刀只做「机构能记一条新版本日志」的 append；图纸版本进阶语义（谁 bump / 自动 vs 手动 / 当前权威版指针 / 撞坏回退 / 按车分支）仍是 `ARTIFACT-VERSION-SEMANTICS`（open_for_decision），不在本刀触及。`revision` 是提交者自填自由字符串、无自动版本号语义。
  2. **写白名单第五个 append 写法 `appendArtifact`**：`GovStore.appendArtifact(draft: ArtifactDraft)`，`ArtifactDraft = Omit<ArtifactRef,'id'|'createdAt'|'submittedVia'>`。三 Store：InMemoryGovStore 补 id/createdAt/`submittedVia:'console'` 后 push（照搬 createTask）；FileGovStore 写后 `persist()`（原子 tmp+rename，落盘累积，`GovernanceSnapshotSchema` 已含 `artifacts` 无需改 schema）；SqliteGovStore throw NOT_IMPLEMENTED stub。
  3. **请求契约收紧只在写侧**：`CreateArtifactRequestSchema = ArtifactRefSchema.omit({id,createdAt,submittedVia}).extend({mechanism,revision: z.string().min(1)})`——base `ArtifactRefSchema` 三字段保 `optional`（向后兼容 8 条种子 + git 录入的可选字段、不破 fail-closed 加载），仅写侧强制 mechanism/revision 必填。schema 落 `pm-requests.ts`（单一源，非 schemas.ts）；server 经 `contracts.ts` 间接层 re-export。
  4. **C5 submittedVia 由 server 钉 console**：请求 schema `omit` 掉 submittedVia（客户端注入被 Zod strip），store 在 `...draft` spread 后硬覆盖 `submittedVia:'console'`（防御纵深）。人工录入是最低优先源，git/lark 派生信号未来可覆盖。
  5. **I0 图纸日志永无人维度**：`ArtifactRef` 无任何 person 字段、不引用 ActorRef；日志主键 = 机构 mechanism + 版本 revision + 归档物 name/uri，绝不加「提交人/确认人」。对抗探针实测：夹带 memberId/submittedBy/confirmedBy 经 Zod 默认 strip，既进不了落盘也回显不出。表单不收人名、读视图（ArchivePage/OverviewPage）不渲染提交人。
  6. **H3 鉴权自动继承**：POST /api/artifacts 注册在 onRequest 钩子之后，自动受全 POST /api/\* 的 Bearer + 限流 gate，零旁路、不另写鉴权。
- 落地面：`hub-contracts/pm-requests.ts`（Create*Schema/type）；`hub-server`（contracts.ts re-export / server.ts POST 路由 / store{gov,mock-gov,file-gov,sqlite-gov}.ts）；`hub-console`（api/client.ts + api/schemas/pm.ts barrel / features/archive/ArchivePage.tsx 表单 / features/overview/OverviewPage.tsx 链接 / i18n）。**①** 硬化 2 测（routes 证 store-sourcing / persist 断言 mechanism·revision·submittedVia round-trip）。**写路径测试补全**：pm-routes +2（201·夹带 lark 被 omit·落盘 +1 / 缺字段 400）+ client.test M21 补 createArtifact。
- 构建：4-phase workflow `wf_1097920a-e67`（design-lock[opus 抓 15 接缝]→后端[opus]→前端[sonnet]→2-lens 对抗核实[opus×2：I0/反排名 + 正确性/回归/DoD]双 **ship·mustFix=0·i0Clean**）；首跑第 2 verify lens 中断、`resumeFromRunId` 续跑命中前序 cache。
- 验证：三包 verify:all 全绿（hub-contracts 48 / hub-server **109**[+2 artifact 路由测] / hub-console 9）；git diff --check 干净；真机 4188 smoke（POST 夹带 submittedVia=lark→被压成 console、缺 mechanism/revision→400、GET 8→9、落盘文件含新条 round-trip）。
- 老实定位：图纸版本进阶语义仍 open（ARTIFACT-VERSION-SEMANTICS）；真实图纸上游派生（git/lark 自动登记）未接、靠表单录入兜底；InMemory id `artifact-new-${len+1}` 跨重启非全局唯一（沿用 create* 既有约定、非本刀引入）。**frontier 自此真正见底**——下一步全卡用户排期或外部基建（Hermes/飞书/SSH/§8 审批）。
- 事实源：本 ADR；`now.md`「最近完成 2026-06-16」；commit `b7eaf4b`；workflow `wf_1097920a-e67`。

## D-068 — 设置页风格切换器：运行时主题（经典绿 / 暖纸 Aurash），纯 CSS-variable 换肤

- 状态：**DECIDED / IMPLEMENTED**（2026-06-16）
- 日期：2026-06-16
- 上下文：V1-FOLLOWUPS 收尾后用户问「接下来需要排版的部分」。frontier 上唯一视觉/排版条目 = `UI-RESTYLE-AURASH`（D-060，已决策但搁置，PILOT-FIRST）。澄清后用户给的不是「一次性换肤」，而是 **「做一个切换风格的功能，在设置里」**——即运行时主题切换器。这恰把 D-060 Phase 0（换 token，<0.5 天拿 80% 视觉收益）包装成可回退的 opt-in 功能。
- 决策：
  1. **纯 CSS-variable 主题，不引框架**：明确**不是** D-060 那条 7–14 人天 Tailwind+Radix 迁移，而是其 token 层的「可切换」版。全站组件早已消费 `var(--*)`，故第二套 token 挂在 `:root[data-theme='warm']`（特异度 0,2,0 > `:root`），切换属性即整站换肤、**绝大多数组件零改动**。无 preflight / 无 @xyflow reset 风险 / 零新依赖。
  2. **架构逐行镜像 i18n 语言切换**：新 `theme/index.tsx` 照搬 `i18n/index.tsx`——`ThemeProvider`（localStorage `teamhub.theme` 持久 + `documentElement.dataset.theme` + `useEffect` 同步）/ `useTheme()`（未挂 Provider 即 throw）/ 纯函数 `normalizeTheme(value): Theme`（未知值 fallback，供单测，不测 DOM）。`main.tsx` `<ThemeProvider>` 包 `<LanguageProvider>`。
  3. **默认 classic（现行绿），暖纸 opt-in**：`DEFAULT_THEME='classic'`，无 `data-theme` 属性时与现状像素一致、不惊扰现有用户。暖纸起步调色 = 米色面 `#f7f6f3` + 暖白卡 `#fffdf9` + 近黑字 `#37352f` + 发丝线 + 暖炭侧栏 `#2b2922` + serif 标题（Georgia/Songti/Noto Serif）；accent（绿/红/琥珀/蓝 + `*-soft`）暂留为状态语义色、跨主题通用，起步值可在 4177 实时微调。
  4. **tokenize 少量硬编码色**：原写死的 `:root` 页底色、`.console-sidebar` bg/text 提升为 `--page-bg`/`--sidebar-bg`/`--sidebar-text`；`h1/h2` 加 `font-family: var(--font-title)`（classic 默认 `inherit` 仍 Inter）。设置页加「外观」section，复用既有 `segClass` + `.seg` 控件（零新 CSS），i18n 加 4 键 zh/en（`Record<TranslationKey>` 编译期强制对称）。
- 落地面：`hub-console` 新 `theme/index.tsx`、`main.tsx`（挂载）、`styles.css`（tokenize + 暖纸覆盖块）、`features/settings/SettingsPage.tsx`（外观区块）、`i18n/translations.ts`（4 键 ×2）、新 `test/theme.test.ts`（normalizeTheme 2 测）。后端/契约**零改动**。
- D-060 护栏守住：不引 Tailwind/Radix（无 preflight 风险）；不碰 I0 反排名 3 承重串；zh/en 编译期对称；**未从 xju-feiyue/Aurash 拷 tokens.css**（暖纸值手挑中性结构色）；不引 dueDate、不加排名维度。
- 验证：hub-console verify:all（typecheck 强制 parity + 11 测[+2 theme] + build）全绿；hub-contracts/hub-server verify:all 零回归（48 / 109）。**头无界面浏览器，故走构建产物 + 活体 serve 核实**：产出 CSS 含暖纸 token 块（`f7f6f3`/`2b2922`/`37352f`/`Georgia` 实测在 dist）+ tokenized `var(--page-bg|sidebar-bg|font-title)`；JS bundle 含 `teamhub.theme`/`dataset.theme`/`ThemeProvider` 守卫 + i18n `teamhub.lang` 未损；hub-server 起 4177 托管 console：`GET /`=200、index 引新 bundle、served CSS 可达 `f7f6f3`、`GET /api/artifacts`=200。
- 老实定位（已知边界，不假装全覆盖）：**dep-graph 连线色不随主题变**——`DepGraphPage.tsx` 的 `EDGE_COLORS` 与选中边 `stroke:'#2f6f9f'` 是 JS 常量/写死 hex，CSS-variable 主题碰不到，v1 保持原样（红/蓝/琥珀/灰为状态语义色，跨主题可接受）；`.dag-node--*` 斜纹用 token → 随主题变。**真实视觉切换（整站换色 + 侧栏 + serif + 刷新保持）需用户在 4177 浏览器实眼验收**（headless 不可代替）。暖纸调色为起步值、待主观微调。
- 事实源：本 ADR；`now.md`「最近完成 2026-06-16」；D-060 + `docs/research/aurash-restyle-assessment.md`。

## D-069 — 差异化排班 + 缺人方向 + AI 学习建议：合宪形态立项（A1 组级均衡 + B1 窄义，不复活 D-039）

- 状态：**DECIDED**（2026-06-18，纯立项 / 尚未实现）
- 日期：2026-06-18
- 上下文：用户「查看 TeamHub 还有哪些没做 + 是否完成验收（没验收就在 rainman 的 WSL 验收）+ 考虑这个新功能能不能进代办：『有什么算法可以实现不同上课时间以及平均排班，也能看得出来什么方向缺人，结合智能体分析应该谁去学什么』」。
  - **验收先行（见 now.md「最近完成 2026-06-18」）**：rainman WSL2「常驻部署」实测停在 **D-061**，落后本机 7 commit（D-062/D-065/D-066/D-067/**D-068 都没上过真机**）。已 git bundle 过 SSH 同步到 `230c38e`(D-068) → 三包 verify:all 全绿（contracts 48 / server 109 / console typecheck+测试+build）→ 4177 真机起服（buildId=230c38e，真实语料 kb.json 84KB+gov.json）API smoke 通 → **D-068 主题切换器（唯一挂着的「实眼验收」）Playwright 实测 `data-theme` 切 warm 后 5 token 全切（pageBg/surface/sidebarBg/text/fontTitle），`SWITCH_WORKS=true`**。老实定位：经典/暖纸两套配色都浅色、明度接近（冷白↔暖白 / 深绿↔深棕），serif 只对拉丁字母生效（WSL 无 CJK 衬线），**机制正确但视觉差异微弱**——印证 D-068「暖纸调色为起步值待微调」，用户可在 localhost:4177 实眼终验。
  - **可行性分析（workflow `wf_6f935ab0-027`，4-agent：算法设计[opus]/宪法对抗[opus]/资产复用[sonnet]→综合[opus]）**：新功能高度重合**已有但挂起**的积木——`schedule.ts derivePresenceSchedule`(D-029，**已写完且测试锁活、但全代码库零运行时引用=挂起域死重量**)、`growth.ts`(D-027 KnowledgeNode/MemberKnowledge/TaskKnowledgeTag)、`attribution.ts`(缺口归因)。拆三子诉求逐一裁决：**S2 缺人方向=clean**（90% 地基已在 Need.providerGroupId/neededSkills/status + deriveBlockAttributions，缺组级 roll-up）；**S1 不同上课时间+平均排班=needs-guardrail**（字面要引入 per-person 维度，撞 C2/A1/I0；合宪形态=课表只当本人私有信号、聚合成组级 headcount）；**S3 谁去学=triggers-D039-revival**（命中 decisions.md D-039 明文复活触发「未来确认要 AI 参与治理判断」）。
- 决策：用户对两个 §5 产品方向决策均拍**保守/合宪项**，故新功能**以合宪形态进 backlog、不复活任何挂起治理簇**：
  1. **【问 A — 排班「平均」语义】拍 A1 组级均衡**：每人课表默认 private、自愿录入、明细**永不外露**给他人或队长；系统只读它**聚合成组级 headcount**（「本窗某组有几人没课」），排班输出仍只有组键 `PresenceRecommendation`（无 memberId）；公平重定义 = 「没有哪个组因课表挤兑长期无人覆盖关键链」（组级覆盖 + A1 缺口归组）。**明确拒 A2 按人均摊出勤次数**（=出勤名册，违 C2/A1）。
  2. **【问 B — S3 是否复活 D-039】拍 B1 窄义**：AI 只对【任务/缺口】建议涉及的知识点 + 资料（走现有 `TaskKnowledgeTag` source=aiSuggested→人 confirmedBy），「谁去学」由学长/大三人工决定；至多私下提示**本人**「你 interested 的方向正好有缺口」（A2，只回本人、不上报）。**拒 B2 广义**（AI 把具体人与缺口配对/能力排序）——那才是 D-039 复活开关，须另立 §5 拍板 + 取回 D-032~D-035 补 k-anon/audience，本轮不做。
  3. **【问 C — 立项动作】拍「加进 backlog 立项」**：合宪可立即做的 `GAP-DIRECTION-*`(S2) + `SCHED-WIRE-EXISTING`(接通已有排班派生) 进 backlog 为 ready；`SCHED-MEMBER-AVAILABILITY`(S1 课表→组级容量，A1 已清宪法门、依赖 wire-existing) 与 `STUDY-NARROW-DERIVE`(S3 窄义纯函数，私下推本人渠道阻塞于 Hermes/lark) 进 backlog 为 next/gated；`STUDY-BROAD-D039-REVIVAL` 登记为 HARD-GATED do-not-build（B1 已拍、广义封存）。
  4. **整体不复活 D-032~D-035 治理派生簇**（前提是 S3 守 B1 窄义）；`derivePresenceSchedule` 接通是「第一次真正接出已有组键派生」而非扩展——上线前应确认用户确实要排班功能，否则只是给死代码续命。
- 落地面（本轮仅 planning）：`backlog.md` 新增「P1 — 差异化排班 + 缺人方向 + 学习建议（D-069）」段（7 行，各带机器可验证 DoD）+ `GOV-SCHED-VIZ-DESIGN` 挂起注脚改指 D-069（组键 wiring 部分解封）；`now.md` frontier 加新 ready 项 + 最近完成记验收。**零代码改动**。
- 护栏（实现期必守，code review 抓不全的纪律项）：S1 课表复用 `ResourceSession.invitedMemberIds` 既有「单窗名单不跨窗累计」边界、明细永不进第三方视图；排班输出永远组键、严禁按人出场次数均衡器；S2 缺口渲染停在 group+robotTarget+neededSkills、绝不下钻到人；S3 窄义边界极易模糊（让队长看到匹配结果 / AI 排序候选人就跨进广义=未经拍板事实复活）；课表「系统持有每个人课表」即便 private 仍带监视气味——是用户信任/收益权衡，靠规范+投影层纪律兜底（schema 不强制）。
- 老实定位：本轮**只立项、未写一行功能代码**；S1 的「不同上课时间」要求把粗粒度 `windowLabel` 升级为可选锚定时段 `WindowDef`（加重录入、轻触 C1，建议可选+未锚定静默退化），否则课表无法与窗口求交、功能形同虚设；S3 窄义纯函数能做但「私下推本人」依赖飞书/lark-cli 私聊路径（D-042「Hermes 最后做」未完成），渠道接通前只能本人页面被动展示；S2「方向」粒度（按 Group vs neededSkills 聚类）用户未细化、默认 providerGroupId 保留 skill 键。
- 事实源：本 ADR；workflow `wf_6f935ab0-027`（全量结果在 session tasks 输出）；`backlog.md`「P1 — 差异化排班…(D-069)」；`now.md` frontier + 「最近完成 2026-06-18」；积木 `apps/hub-contracts/src/{schedule,growth,attribution,governance}.ts`；宪法 `AGENTS.md §2/§5` + D-029/D-027/D-039。

## D-070 — Harness 减负：对齐 feiyue 轻量模型（now.md/decisions 瘦身 + skill 单一真源 + 归档死脚手架）

- 状态：**DECIDED / IMPLEMENTED**（2026-06-18；用户「feiyue / feiyue-script 的 harness 很合适、TeamHub harness 过重，查看怎么减负」+ 拍板 T1+T2+T3 全做）。
- 上下文：D-066 已精简 AGENTS.md（64 行），但周边仍重——`now.md` 每轮必读 61KB（71% 是 `最近完成` 历史日志）、`decisions.md` 220KB append-only、三套 skill 目录（`.agents/skills` 权威源 + hook 同步 `.claude/skills` + `.agents/skill-library` 冷藏）+ 已坏的同步机制（hook 从未在任何 settings.json 注册、`.claude/skills/PROTOCOL` 已漂移指向 D-066 删掉的 §9/atomic-task）、superseded 脚手架（workflow-evolution / docs/agents/workflow / 2 份 pre-pivot spec）留在活目录。对照 feiyue：443 行单文件 harness、每条规则绑「血泪教训」、`design-decisions.md` 靠「删 superseded」永远小、零同步机制。
- 决策（三档）：
  1. **T1 瘦身**：`now.md` `最近完成` 历史 → `docs/archive/completed-log.md`（每轮读 61KB→25KB，留最新 3 条 + 指针）；`decisions.md` 挂起簇 D-032~D-035 → `governance-suspended-decisions.md`（留 stub）；`workflow-evolution.md` / `docs/agents/workflow/` / `.agents/skill-library/` → `archive/legacy-harness/`，2 份 pre-pivot spec → `docs/archive/pre-pivot-specs/`。
  2. **T2 拆同步机制**：删 `sync-skills.sh` + `verify-skills-sync.sh` + `skill-protocol-migration-gap.md`；skill 收成单一真源 `.agents/skills/` + feiyue 式 `.agents/skills/install.sh` 软链进 `.claude/skills/`（修掉漂移、`.claude/skills` 现为软链视图）；AGENTS §4 DoD 改引 install.sh。
  3. **T3 账本文化**：`decisions.md` 从 append-only 改「活账本 + 归档」（约定写进顶部 intro）；hard-superseded ADR（D-043 / D-053）压 3 行 stub + 全文 → `decisions-archive.md`。
- 守恒：全部 `git mv` / `git rm`（git 历史可追溯）、零真相丢失、零代码/数据改动（不碰 `apps/`、不碰 `kb.json`/`gov.json`）。承重件不动：AGENTS.md + I0/C/A 词汇、`archive/legacy-harness` 串行轨 fallback、5 个 ops 脚本、`preview:local` 脚本（仍被 package.json 引用）。
- 影响：`now.md` −58%、`decisions.md` 220KB→195KB、活目录清掉 ~1700 行死脚手架，修掉 `.claude/skills` 漂移。事实源：本 ADR；用户 2026-06-18 减负请求 + T1+T2+T3 拍板；harness-weight inventory workflow `wf_782c37b4-193`。

## D-071 — 图纸档案 v2：机械/电路分组版本库（赛季+车+机构+自增版本，server 派生）

- 状态：**DECIDED / IMPLEMENTED**（2026-06-18；用户 PM 视角讨论后拍定。前置探活：同次会话经 SSH 探 rainman WSL2 实证 Hermes 出站飞书已通 + lark-cli bin 定论，见 memory `teamhub-feishu-capability`）。
- 上下文：图纸档案原是「通用 append-only 版本日志」，表单字段（mechanism/revision/name/uri/kind 工程枚举/关联提交/关联仓库）不分组、不知道给哪个组用。用户看着不理解，且 kind 枚举对机械无意义、关联提交/仓库只对代码编译物（电路驱动固件）有意义、地址(uri)是占位串（真实文件上传后置 `HUB-ARTIFACT-STORE-MECH`）。需重塑为「机械/电路分组的图纸版本库」，程序组排除（代码全在 GitHub，TeamHub 只消费 gitCommit）。
- 用户拍定：①模型 = **A 扁平/派生分组**（不建独立「机构」实体表，分组层级渲染时派生）②版本规范 = `赛季年份(season) + 车代号(robotCode, R1/R2 切换) + 机构(mechanism) + 自增版本号(versionNo)`，显示如 `25R1 · 底盘 · v3`③版本进阶语义 = **最小+回退**，不做 PLM。
- 决策（落地）：
  1. **数据模型**（`schemas.ts` ArtifactRefSchema 加 5 个 `.optional()` 字段：ownerGroup(`mechanical`|`electrical`，词汇对齐 GroupKindSchema)/season/robotCode/versionNo/subType(`drawing`|`driver`)；kind、revision 保留）。**向后兼容**：全 optional，8 条 seed + 旧 `~/teamhub-data` JSON 仍 fail-closed 加载。
  2. **写契约**（`pm-requests.ts` CreateArtifactRequestSchema：omit 加 kind/versionNo/revision[server 派生]；extend ownerGroup/season/robotCode required；`.superRefine` 强制 electrical 必须有 subType、mechanical 必须无）。
  3. **server 派生，3 个 store 不动**（`server.ts` POST /api/artifacts：getSnapshot→`nextArtifactVersionNo`[四键 ownerGroup+season+robotCode+mechanism 全等 max+1，旧 seed 无 versionNo 视为 0]→`deriveArtifactKind`[电路驱动→firmware，余→report]→revision=`v${n}`；机械剥 subType；C5：kind/versionNo/revision/submittedVia 全由路由/store 钉，客户端给了被 omit）。两纯函数落 `hub-contracts/src/artifact-version.ts`（可单测、前端版本预览复用同函数零漂移）。
  4. **console 表单重做**（`ArchivePage.tsx`：复用 `.seg` 段控做 组/R1R2/电路子类型切换，赛季 select 默认 guessSeason，机构新增勾选/下拉，版本预览只读；两级分组 ownerGroup→mechanism + 「未分组/历史」桶承接旧 seed；max(versionNo) 行打「当前版」徽章；关联仓库/提交仅电路驱动显）。
- **回退语义**：本次 ship **最新即权威版**（max versionNo 派生，零写面、纯 append-only）。**手动钉旧版 pin 不做**（那是对旧 artifact 的 update，违 C3）；未来要回退则按 **append-only supersede**（追加新版指回旧内容 + 可选 `supersedesVersionNo`），versionNo 继续前进、最新即权威自动生效。`ARTIFACT-VERSION-SEMANTICS`(open_for_decision) 的进阶语义（按车分支等）仍 open。
- 守恒/护栏：**I0**（ArtifactRef 5 个新字段零人员维度；夹带 confirmedBy/memberId 实测被 Zod strip）/**C3**（纯 append-only，未开 update/delete）/**G4**（不引 dueDate）。
- 构建+核实：**workflow `wf_57c7f730-a0d`**（Contracts[opus]→Server[opus]→Frontend[sonnet]→2-lens 对抗核实[opus×2：I0/向后兼容 + 正确性/DoD]）。对抗核实裁 **i0Clean=true** + 抓 1 个真 bug（空档案/新组首条录入：effectiveMechanism 与渲染条件不一致致提交按钮永 disabled）→主循环收口（统一 `usingTextInput`）。**主循环独立核实**：三包 verify:all 绿（contracts 62[+8 artifact-version] / server 115[+routes v2 round-trip] / console 11）+ 本地活体 smoke（POST 机械→v1、同键→v2、电路驱动→firmware、电路缺 subType→400、机械带 subType→400、夹带人字段被 strip、落盘 artifact 无人字段）。事实源：本 ADR + plan `~/.claude/plans/scalable-noodling-brook.md`。
- 后续（非本刀）：真实文件上传/存储（`HUB-ARTIFACT-STORE-MECH`，§8）、电路驱动命名规范（用户内部待定）、可选给 demo seed 补 v2 字段、WSL 真机浏览器走查（headless 不可代替）。

## D-072 — 差异化排班表现形式重定向 + 资源领域模型：定稿

- 状态：**FINALIZED / 定稿·待实现**（设计稿 2026-06-19 立项；**同日经对抗式设计审查 `wf_2f31074c-523`（55 claims·5 视角·对抗核实）+ 用户多轮拍板定稿**。仍零代码，定稿后另起实现轮）。
- 上下文：D-069 已把 `derivePresenceSchedule`（D-029）接出成 `SchedulePage` 卡片网格，看不出接力时序 / 组间因果 / 全局感。两轮网络调研（`wf_85447b90`+`wf_9d625327`）后用户推深：①时间不要钟点（假精度）②「车」实体太简陋，装不下「按赛季换车 + 生命周期 + 拆件血缘」。
- 决策（定稿，详见 `docs/design/presence-resource-redesign.md`）：
  1. **表现形式 = 两视图**：依赖流程图（总图）+ **接力顺序链**（短期·多车并排·只表先后不表钟点）。**甘特图砍掉**（不如依赖图直观·系统无工期数据·D-041「甘特暂缓」继续生效·不引 dueDate）。**语义重定 =「接力顺序里此刻轮到谁、谁可下班/不用加班」非「停谁的活」**（守 A1 正名/帮助）。卡片网格降级。
  2. **车 = 带编号的独立对象（单层）**：取消「车位 RobotSlot / 具体车 RobotInstance」两层（审查指出与现役 `robotTarget` 级联脱节 + RobotSlot 绑单赛季 Project 自相矛盾；用户拍板取消车位层）。`displayCode` 派生 = 赛季+位置(+版本)，如 25R1/26R1-v2；**每(赛季,位置)最终只剩一台活跃车**且固定 → 排班直接挂车对象、化解审查 HIGH「按车位枚举 vs 按具体车」冲突。**v = 第几代整车**（整车全拆重做才升·默认 v1·频率极低·兼撞名区分位）。
  3. **状态 = 宏观「维修」态（不精确到机构）+ 可选自由注释**（如「撞坏底盘」）：可用/使用中/维修中/退役/拆解。退役人手动；退役可整车留展示或拆一部分（拆解态）。**工序先后由排班层（人排 `orderInWindow`）承载、不从车状态推**；车不可上→下游接力释放「可下班」（`resourceDown` 下一轮改读「能否上车」+ 挂车对象不走车位枚举）。
  4. **零件血缘** = 拆装两条 append-only（拆→货架 / 装→某车·绝不删零件保血缘）；多数按数量记·1~2 个的和重要件手动标记单独追踪；初始只录闲置数·车上量后续补；这套是 `INV-BOM-DESIGN` 最小内核。
  5. **库存总表**不写「在造」；**「预留」= 已从仓库拿出·不在货架·禁用·记在该车（从闲置扣减）**·退件归还货架才可再用；`闲置=总数−各车已用(含预留)`；车↔库存对不上 → 智能体发消息查根因（gated Hermes）。
  6. **组织结构（写进 AGENTS §1）**：分配任务**只四个组**（电控/视觉/机械/电路·设置页可增减）；**删「程序组」领任务身份**，「程序=电控+视觉」仅汇报/过载视角·不领任务。**总联调 = 所有组各到至少一人**（不挂单一组）。fixtures 遗留（`grp-program` 持总联调+成员）下一轮调和。
  7. demo 手动加车·先放 26R1+26R2；加车 GUI 最后做。**多车并排 = 要做**（一晚多人调多车是常事）。
- 守恒/红线：全程组键 / 资源键 / 任务键，零 memberId·零个人时长聚合（I0/C2/A1）；AI 不拍板·人在环；派生优先·小作坊轻量（按数量·不引钟点·**状态不精确到机构**·别建死表 P13）。**不复活 D-039/D-032~D-035**。下一轮把接力链数据源 / 血缘 actor 反监视护栏升结构约束。
- **定稿调整（相对 6-19 草稿，审查 `wf_2f31074c-523` + 用户拍板）**：三视图 → **两视图删甘特**；两层车模型 → **单层带编号对象**；程序组抽象大组 → **删领任务身份留汇报视角**；生命周期六态 → **宏观维修态+注释**；总联调归属待定 → **全组各一人**；「与 D-071 同构」overclaim → 改述**共享赛季×车前两维子键·一对多**。
- 仅剩待定（§6）：追踪件清单 / 多车并排密度上限（均实现期定·非阻塞）。
- 下一轮（实现）：调和 fixtures → 落车对象+宏观状态+接力释放级联 → 接力链(多车)视图+语义 → 视情况库存最小内核 → demo seed 26R1/26R2 → 护栏升结构约束。
- 事实源：本 ADR；设计稿 `docs/design/presence-resource-redesign.md`（定稿）；审查 workflow `wf_2f31074c-523`；调研 `wf_85447b90`+`wf_9d625327`；前序 D-029（排班派生）/D-069（组级均衡接出）/D-071（图纸分组版本·共享赛季×车前两维子键·一对多）。

## D-073 — 文档减负·中等档：活账本纪律推到位（已定型也归档）+ 写入纪律入手册

- 状态：**DECIDED / DONE**（2026-06-19；纯 docs/planning/archive，零代码/数据改动）。
- 上下文：用户「查看有哪些文档可以简化，尤其是 decisions.md，感觉叠太多了」。体检：D-070 已立「活账本 + 归档」纪律，但只归档**被 supersede** 的；**已定型却仍背着当初完整推演**（选项对比 / 可行性 / 拍板清单）的活条目未压，加上 `now.md` 巨行 YAML + 挂起 spec 混在 active `docs/design/`，仍臃肿。用户选**中等档** + 顺手清 now.md / 设计文档 / 存根，并要求把「过时 decisions 塞 archive」写成长效约定。
- 决策：
  1. **扩 D-070 范围**：归档落点从「被 supersede」放宽到「被 supersede **或已定型**」——已定型条目 stub 留结论 + 当前约束，决策时推演全文移 `docs/archive/decisions-archive.md`。
  2. **decisions.md 中等档压缩**（1005→865 行）：D-005/006/009/014/016 → v0.3 时代 ADR 簇 1 条 cluster stub；D-021（81 行飞书选型）→ ~7 行 stub；D-026（45 行治理 thesis + 提醒模型）→ ~11 行宪法/架构 stub（四层架构 + 路线 A + C/G/A 宪法 + 提醒模型指针保留，「制度化治理系统」定位推演移档；已被 D-037/D-039 回中）。
  3. **now.md 瘦身**（91→62 行 / 42KB→8.6KB）：最近完成留最新 3 + 指针、frontier 去 ✅done 注释、stage/current_task/repo_sync 巨值压一句 + 指针；历史完成移 `completed-log.md`（含仅存于 now.md 的 2026-06-19 P1 批，零丢失）。
  4. **过期设计文档归位**：`gov-cue-layer.md`(D-032) + `gov-role-visibility.md`(D-033) → `docs/archive/suspended-specs/`（整簇 D-039 挂起）+ banner；`visuals.md`（v0.3-pivot 前全过时）→ `docs/archive/v0.3-pivot/` + banner；`team-hub-product-definition-v0.md` 加退役 banner；活文档指针全部修正。
  5. **写入纪律入手册**：`AGENTS.md §2.3` planning-sync 加「决策被 supersede/过时同刀压 stub + 移 archive」；全局 `~/.claude/CLAUDE.md` 加通用「文档纪律」一句（跨项目复用）。
- 守恒：全程 `git mv`/Edit 整段搬运·**零真相丢失**（每条原始事实在 stub ∪ archive 可寻）·零代码/数据（不碰 `apps/`·`kb.json`/`gov.json`）；承重事实（zod / 四层架构 / I0·C·A 宪法 / 起草不发送）仍在活文件。
- 验证：`git diff --check` 干净；`now.md` yaml 可解析（10 keys）；grep 活文档无悬挂旧路径 / 无被压条目全文；行数抽查（decisions.md 865 / now.md 8.6KB / decisions-archive 57→239）；`pre-commit.sh` 过。4 原子 commit（A 压缩 / B now / C+D 归位 / E 纪律）。
- 事实源：本 ADR；plan `~/.claude/plans/decisions-md-wobbly-toast.md`；前序 D-070（Harness 减负·活账本纪律立）。

## D-074 — 版本号自动更迭失效：根因 + 单一真相 VERSION + bump 哨兵 + 当前版本重定为 v0.4.0

- 状态：**DECIDED / IMPLEMENTED**（2026-06-20；新增 `VERSION` + `scripts/bump-version.sh` + `scripts/check-version-bump.sh`，挂 `pre-commit.sh`，AGENTS §2.3/§7 成文；三包 package.json 0.1.0→0.4.0）
- 日期：2026-06-20
- 上下文：用户指出「版本号明显不对」——368 commit 跨两个月、经 ProbeFlash v0.2/v0.3 + TeamHub 治理立魂 + 三支柱 + 排班/库存，hub-* 三包却一直停在 `0.1.0`、`git tag` 为 0，要求对照 feiyue 找出 harness 版本自动更迭失效的根因并给方案，再据 git tree 推断当前应是几版。
- 根因（对照 feiyue 实证）：
  1. **AGENTS.md 从来没写「要 bump」**：completion gate（§2.3）列了 verify + planning-sync + commit，**独缺版本号**。harness 每轮读 AGENTS，没指令就不会 bump。feiyue 的 `CONVENTIONS.md` 白纸黑字「每次改动脚本都要自增 `@version`」——TeamHub 无对应条目。
  2. **缺天然强制函数**：feiyue 是 Tampermonkey 用户脚本，**`@version` 不自增 Tampermonkey 就不推更新**——忘了 bump 立刻被用户「没更新」暴露，现实替你把关。服务端 app 没有这个下游压力：版本停在 `0.1.0` 也照跑、没有任何东西坏，于是无声漂移。
  3. **唯一一次「修复」（D-052 诉求7 / `8ab93cf`）是半拉子**：它把 `status.ts` 从硬编码 `'0.0.1'` 改成 `createRequire` **读** `package.json.version`，commit message 自己写明「之后**只改 package.json 的 version 字段即跟进**；想自增再加 `npm version patch`」——把这步留成了**没人执行的手动 TODO**。从「读死常量」改成「读一个永不自增的字段」，是同一份陈旧换了顶帽子：端点忠实地报告一个冻住的数字。
  4. **monorepo 多包版本歧义**：6 个包各自带版本（hub-* 三包 `0.1.0` / lark·pf 三包 `0.0.1`），**无根 package.json、无 workspace**，没有一个「产品版本」可指——就算想 bump 也不知道 bump 谁。
  5. **零 git tag**：368 commit 无一 tag，git 自身不背版本里程碑；唯一的版本信号 `buildId`=git SHA（`start-teamhub.sh` 注入）是**构建身份**不是**语义版本**。
- 决策（方案，本轮已落地）：
  1. **产品单一版本 = 根 `VERSION`**（SemVer）。三支柱同端口 4177 同发布 = 一个产品一个版本号。`scripts/bump-version.sh <patch|minor|major|X.Y.Z>` 是**唯一改版入口**，把 VERSION 同步进 hub-* 三包 package.json，`/api/system/status`·`/health` 经 `status.ts`（读包根 version）即刻报告。手改 package.json 被 §7 禁止（防漂移）。
  2. **AGENTS 成文**：§7「版本号纪律」+ §2.3 completion gate 加 (c)「改 hub-* 源码则 `bump-version.sh` 自增」——补上根因①缺的那条规则，harness 每轮即读到。
  3. **哨兵替代天然强制函数**：`scripts/check-version-bump.sh`（挂 `pre-commit.sh`）—— 暂存 hub-* 源码却没动 VERSION 就报警。默认 **warn 不阻断**（避免硬卡 D-064 无人值守 commit 把自迭代环 wedge 住），`VERSION_BUMP_STRICT=1` 升硬门、`SKIP_VERSION_BUMP=1` 单次豁免。诚实标注：warn 比 feiyue 的硬强制弱，是为不卡无人环的**刻意取舍**，留了一行升硬门的开关。
  4. **不引根 package.json / 不打 tag**：保持现有 6 包独立结构（避免 workspace 大改 = §5 边界），VERSION 文件做产品版本真相；tag 仍按 feiyue「不强制」留空（且 §5 tag 操作需审批）。
- **据 git tree 重定当前版本 = v0.4.0**（两条独立推法收敛）：
  - **产品线连续法**：ProbeFlash 发布 v0.2.0 → v0.3.0（E1，facts 实证），pivot 删的是 v0.3 *代码* 不是 *产品*——TeamHub 三支柱是同一产品的下一纪元 = **v0.4**。
  - **TeamHub 自身纪元法**：hub-* 在 E2 脚手架期落地即 `0.1.0`，此后每个时代加一档 MINOR 级能力——E3 治理立魂/pivot→0.2、E4 三支柱破冰→0.3、E5 在场排班+库存+图纸档案→**0.4.0**。
  - 两法都落 **v0.4.0**。未到 1.0：内网 demo、无生产部署、治理派生层挂起、单端口 nohup 单点（facts-pack §4.3 诚实口径）。若按「每子系统一个 MINOR」的机械计数会更高（~0.10+），但**产品纪元版本**取 0.4.0 更有沟通价值，且正是 harness 此后该自动维护的那个数。
- 验证：`bump-version.sh 0.4.0` 跑通（VERSION + 三包 package.json 全 `0.4.0`）；三包 `verify:all` exit 0（改的是 version 字符串，无测试断言版本常量，grep 实证）；`pre-commit.sh` 过（含新哨兵）；真机 `curl /api/system/status` 报 `version: 0.4.0`。
- 老实定位：① 哨兵默认 warn，真要根治漂移得有人偶尔看告警或开 STRICT——但比「AGENTS 压根没规则」已是质变；② lark/pf 三包仍 `0.0.1`（外围适配器、非产品主体，本轮不动）；③ 未补历史 tag（git 历史 + 本 ADR 的纪元表已够追溯）。
- 事实源：本 ADR；对照 `~/ruolin_huang/xju-feiyue-scripts/CONVENTIONS.md`（§元数据/版本与 git）；半拉子修复 `8ab93cf`（D-052 诉求7）；`apps/hub-server/src/status.ts`；facts-pack §1.1 五时代表。
