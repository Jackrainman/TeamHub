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
## D-018：v0.3.0 退役；新方向以 Skill / Bridge / Trail 三 facet 替代单体 issue tracker【已落地·全文归档】

- 状态：**已落地**（账单段压 stub，D-073 活账本纪律）。
- 落点：2026-05-07 拍板；v0.3.0 冻结、代码 2026-06-09 删除（git 历史保留），三 facet 后续被 D-024 Team Hub 架构覆盖；真相 = `docs/archive/completed-log.md` + git log。
- 全文（上下文/选项/推演/验证）已移 `docs/archive/decisions-archive.md` D-018 段。

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
- 关联 spec：docs/archive/pre-pivot-plans/2026-05-21-lark-cli-integration-design.md

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
- 详细 ADR 草稿：`docs/archive/D-023-skill-protocol-v1.md`（含 §3 放弃方案展开 / §4 影响 / §5 落地任务）
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
- 事实源：`docs/archive/team-hub-stack-decision.md`

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
- 暂缓（用户认同，记此以免遗忘）：`lark-api-capability.md` + `lark-oss-candidates.md` 暂留 `docs/research`——前者仍是 pending `GOV-LARK-DERIVE`（触点层）的事实底座，二者均被 append-only 的 D-020/D-021 引用，现在动会 churn 决策日志且收益仅 364 行；**待 GOV-LARK-DERIVE 落地后归档**。scope 3（`superpowers/specs` / `visuals.md` / `D-023` / `workflow-evolution` / `agents/workflow`）未在本轮范围，留待后续；`docs/superpowers/specs/*` 内对已移走 plan 的交叉引用暂为 stale path，随 scope 3 一并清理。**（2026-07-24 追记：scope 3 的 `superpowers/specs` 部分已由 DOCS-SLIM ④执行——目录整体退役进 `docs/archive/`。）**
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

- 状态：**DECIDED**（用户 2026-06-13 "1+2+3 可行" 采纳；本 ADR = 落地路径权威源；详细分析见 `docs/archive/three-pillar-reqdesign.md`）
- 日期：2026-06-13
- 上下文：D-039 定三支柱但留口"先做哪根暂不指定"。跑 14-agent dynamic workflow（5 haiku 资产盘点 → 4 sonnet 逐根需求/接口设计 → 4 对抗核实[base=opus] → 1 opus 综合）做需求设计分析；对抗核实层用 grep 实证抓出初稿设计错误，综合据此收敛。
- 决策：
  1. **破冰顺序 = `base → kb → pm → inv`**：底座 grep 实证唯一无争议起点（`server.ts` 零治理路由，`client.ts:87` real 模式打的 `GET /api/dep-graph` 未注册=404）；kb 痛点最高频最锐但有移植债；pm 最省力但录入自我引用+依赖底座；inv 自保鲜上游未落地（P1 不变）。
  2. **共享底座首任务收敛为最小一刀**：注册 `GET /api/dep-graph`（`DepGraphSchema.parse(toDepGraphView(snapshot, clock.now()...))` + `MockStore(seed governanceScenarioFixture)` + `Clock` 注入）。**推翻初稿**的 8 条 `/api/governance/*` GET（实证前端只缺 `/api/dep-graph` 这一条，初稿反铺一堆无消费方端点+写入簇+双 drizzle stub，违 C3）。POST/PUT 写入簇、presence、drizzle stub 全部后置。DoD/边界/接口契约见设计文档 §2。
  3. **7 条跨根风险**（见设计文档 §4）落地前必处理；其中 **lark bin 双语义债**（`cli-bridge.ts:17/47` execa 用 `'lark'` 但报错写 `'lark-cli'`，KB/INV 修复方向相反）单拆 **`LARK-BIN-PROBE`** 微任务，WSL2 实测 `which` 定论后统一修，先于任何飞书 CLI 功能（KB R5 / INV bitable）。
  4. **freeIdle/C2 测量错误**属已挂起治理派生债（D-031/D-039 边界），PM 本轮只 UI 降级标注「状态待确认」、不修底层。
- supersedes / 细化：D-039 的"先后由真实痛点+破冰快慢定（暂不指定首发）" → 本 ADR 定 `base→kb→pm→inv` + 首任务。`HUB-SERVER-GOV-SCAFFOLD` 初稿的"8 GET 一把梭"被收敛。
- 影响：本 ADR + `docs/archive/three-pillar-reqdesign.md`（新建分析记录）+ `backlog.md`（base 行首任务收敛 + 新增 `LARK-BIN-PROBE` + 三支柱破冰序指针）+ `now.md`/`agent-state.json`（最近完成 + stage_goal）。**纯 docs/planning**（首任务实现是后续单独 atomic-task）。
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
- 上下文：在 D-041 定调"这次之后开始构建"后，跑 20-agent 闸门式 workflow 做**需求分析（闸门）+ 需求可行性分析**（5 分析器需求闸门[宪法=opus] → opus 裁定 → 5 haiku 实证盘点 → 4 sonnet 逐根评估 → 4 opus 对抗核实 → 1 opus 综合）。需求分析判 **proceed/0 阻断**（14 条全 major/minor），可行性分析出四根裁决；甲方就两处分歧拍板，并新增 Hermes 排序。分析记录 `docs/archive/three-pillar-feasibility.md`。
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
- 影响：本 ADR + `docs/archive/three-pillar-feasibility.md`（新建分析记录）+ `backlog.md`（KB 拆 CORE/LARK、PM 行去 Member.status/dueDate 加结构键、INV 行新定位、base 收口刀、新增 HUB-HERMES-ADAPTER 行最后做、GOV-SCHED-VIZ 标挂起）+ `now.md`/`agent-state.json`（stage/frontier/最近完成）。**纯 docs/planning，不碰代码 / 服务器 / 真实数据**；`verify:all` 应零回归。
- 事实源：本 ADR；workflow 输出（run `wf_0ef0d4cc-4c8`，20 agent / 1.26M token，gate=proceed/0 blocker）；`docs/archive/three-pillar-feasibility.md`；grep 实证（`gov-store.ts:9`/`server.ts`/`governance.ts` 无 dueDate·有 criticalChainTaskIds·blockedByLabel/`boundary.ts` 白名单/`cli-bridge.ts:17/47`/无 kb.ts·inv.ts）；2026-06-13 设计对话（甲方拍板冲突取最新版 / Hermes 最后接 / 库存对话记账）；`D-039`/`D-040`/`D-041`（被细化）；`D-037`/`D-036`。

## D-043 — 构建纪律双轨化（连续构建 vs 串行 atomic-task·共享底座 §6.0）【SUPERSEDED-BY D-066·已归档】

- 状态：**SUPERSEDED-BY D-066**（2026-06-15 harness 全改）。**全文 → `docs/archive/decisions-archive.md`**。
- 摘要：§6 双轨三段（§6.0 共享底座 / §6.A 串行轨 STOP / §6.B 连续编排轨）+ 物理隔离 atomic-task↔continuous-build；D-066 后串行轨整体下沉 `archive/legacy-harness/`。

## D-044 — KB-CORE 落地：移植 Probe_Flash 调试闭环 + 相似检索 + 结案派生知识节点（frontier#1 done）【已落地·全文归档】

- 状态：**已落地**（账单段压 stub，D-073 活账本纪律）。
- 落点：2026-06-14 落地，连续构建 7 原子单元 `45bbeaf`→`226e838`（4-opus 对抗核实 ship/mustFix=0）；真相 = `docs/archive/completed-log.md` + git log。
- 全文（上下文/选项/推演/验证）已移 `docs/archive/decisions-archive.md` D-044 段。

## D-045 — PM 项目计划表后端落地：录入簇 + 读视图 + confirmedBy 内部凭证（I0 读写边界拍板）【已落地·全文归档】

- 状态：**已落地**（账单段压 stub，D-073 活账本纪律）。
- 落点：2026-06-14 落地，commit `7218a67`+`6cb38c8`+`3bbf919`（2-opus 对抗核实 ship/mustFix=0；console UI 后由 D-046/D-048 补）；真相 = `docs/archive/completed-log.md` + git log。
- 全文（上下文/选项/推演/验证）已移 `docs/archive/decisions-archive.md` D-045 段。

## D-046 — hub-console 两支柱页落地 + 整体汉化（frontier#1 console UI done）【已落地·全文归档】

- 状态：**已落地**（账单段压 stub，D-073 活账本纪律）。
- 落点：2026-06-14 落地（3-lens 对抗审计 ship；本地 Playwright 真机视觉验收）；真相 = `docs/archive/completed-log.md` + git log。
- 全文（上下文/选项/推演/验证）已移 `docs/archive/decisions-archive.md` D-046 段。

## D-048 — PM/KB 写侧 web 表单：console 录入口落地（frontier#1 PM-KB-WRITE-FORMS done）【已落地·全文归档】

- 状态：**已落地**（账单段压 stub，D-073 活账本纪律）。
- 落点：2026-06-14 落地（本地真机端到端四表单全过+闭环召回实证；2-lens 对抗核实 ship/mustFix=0）；真相 = `docs/archive/completed-log.md` + git log。
- 全文（上下文/选项/推演/验证）已移 `docs/archive/decisions-archive.md` D-048 段。

## D-047 — AI + 知识库闭环 MVP：closeout 回灌 + JSON 落盘 + kb-debug skill（服务器为单一真相）【已落地·全文归档】

- 状态：**已落地**（账单段压 stub，D-073 活账本纪律）。
- 落点：2026-06-14 落地（hub-server 42 测绿；本地真机端到端闭环+持久化实测）；真相 = `docs/archive/completed-log.md` + git log。
- 全文（上下文/选项/推演/验证）已移 `docs/archive/decisions-archive.md` D-047 段。

## D-052 — 提案审查裁决 + Q1–Q4 拍板 + 低风险收尾批落地 + 依赖图新功能立项【已落地·全文归档】

- 状态：**已落地**（账单段压 stub，D-073 活账本纪律）。
- 落点：2026-06-14 拍板+低风险批落地，commit `8ab93cf`/`44b7fcc`/`8ea6579`；立项项后续见 D-056/D-057 等；真相 = `docs/archive/completed-log.md` + git log。
- 全文（上下文/选项/推演/验证）已移 `docs/archive/decisions-archive.md` D-052 段。

## D-051 — KB-IMPORT 独立二次对抗审计 + 正确性硬化（KB-IMPORT-FOLLOWUP 部分收口）【已落地·全文归档】

- 状态：**已落地**（账单段压 stub，D-073 活账本纪律）。
- 落点：2026-06-14 落地（hub-server 74 测绿；6 真实归档重跑 5 导入+召回/I0 实证）；真相 = `docs/archive/completed-log.md` + git log。
- 全文（上下文/选项/推演/验证）已移 `docs/archive/decisions-archive.md` D-051 段。

## D-050 — KB-IMPORT-PROBEFLASH：ProbeFlash .debug-archive 一次性导入（frontier#1 done）【已落地·全文归档】

- 状态：**已落地**（账单段压 stub，D-073 活账本纪律）。
- 落点：2026-06-14 落地（hub-server 65 测绿；6 真实归档实跑 5 导入+召回实证；3-lens 对抗核实 ship）；真相 = `docs/archive/completed-log.md` + git log。
- 全文（上下文/选项/推演/验证）已移 `docs/archive/decisions-archive.md` D-050 段。

## D-049 — Console 设置页落地 + 代码审计落档（CONSOLE-SETTINGS-PAGE done / AUDIT 记录）【已落地·全文归档】

- 状态：**已落地**（账单段压 stub，D-073 活账本纪律）。
- 落点：2026-06-14 落地（hub-console verify:all 绿+本地真机视觉验收；审计落档）；真相 = `docs/archive/completed-log.md` + git log。
- 全文（上下文/选项/推演/验证）已移 `docs/archive/decisions-archive.md` D-049 段。

## D-053 — 自迭代外环（§6.C）+ 完成度模型 + M1 逃生阀【SUPERSEDED-BY D-066·已归档】

- 状态：**SUPERSEDED-BY D-066**（2026-06-15 harness 全改：自迭代外环退役进 `archive/legacy-harness/`）。**全文 → `docs/archive/decisions-archive.md`**。
- 摘要：§6.C 自迭代外环 + `completion-model.yaml` + materialize-before-action 逃生阀；D-039 AI 退治理后外环不再驱动方向、整套冻结。

## D-055 — 4 弱完成度谓词收口为 verify:all + 人审置 `audited:true`（自驱动启用）【已落地·全文归档】

- 状态：**已落地**（账单段压 stub，D-073 活账本纪律）。
- 落点：2026-06-14 落地；后随 D-066 harness 全改，自迭代外环/completion-model 退役冻结进 archive/legacy-harness/；真相 = `docs/archive/completed-log.md` + git log。
- 全文（上下文/选项/推演/验证）已移 `docs/archive/decisions-archive.md` D-055 段。

## D-056 — DEPGRAPH-ENTRY-OVERLAY：依赖图录入浮层 + 看板↔依赖图互通 + I0 负责人降级（frontier done）【已落地·全文归档】

- 状态：**已落地**（账单段压 stub，D-073 活账本纪律）。
- 落点：2026-06-15 落地；真相 = `docs/archive/completed-log.md` + git log。
- 全文（上下文/选项/推演/验证）已移 `docs/archive/decisions-archive.md` D-056 段。

## D-057 — INTEGRATIONS-TO-SETTINGS：适配器→集成 + 设置页只读集成子节 + 总览精简（frontier done）【已落地·全文归档】

- 状态：**已落地**（账单段压 stub，D-073 活账本纪律）。
- 落点：2026-06-15 落地；真相 = `docs/archive/completed-log.md` + git log。
- 全文（上下文/选项/推演/验证）已移 `docs/archive/decisions-archive.md` D-057 段。

## D-058 — CONSOLE-COPY-HUMANIZE：用户可见文案去 AI 味 / 治理黑话（护栏语义保留，frontier done）【已落地·全文归档】

- 状态：**已落地**（账单段压 stub，D-073 活账本纪律）。
- 落点：2026-06-15 落地；真相 = `docs/archive/completed-log.md` + git log。
- 全文（上下文/选项/推演/验证）已移 `docs/archive/decisions-archive.md` D-058 段。

## D-059 — AUDIT-FIXES：7 条联网部署前必修一次落地（frontier done）【已落地·全文归档】

- 状态：**已落地**（账单段压 stub，D-073 活账本纪律）。
- 落点：2026-06-15 落地（7 条部署前必修一次落地；3-lens 对抗核实全 ship/mustFix=0）；真相 = `docs/archive/completed-log.md` + git log。
- 全文（上下文/选项/推演/验证）已移 `docs/archive/decisions-archive.md` D-059 段。

## D-060 — console 换 Aurash 风格 UI 评估：PILOT-FIRST，当前低优先级延后（业务逻辑先行）【SUPERSEDED-BY D-084·全文归档】

- 状态：**SUPERSEDED-BY D-084**（2026-07-12）。结论：用户拍板改走**科技风**方向而非 Aurash 暖纸风，落地为第 4 套主题 `tech` 并设默认；Aurash 换肤提案就此关闭，不再是候选方向。
- 全文（调研 workflow / PILOT-FIRST 结论 / 护栏）→ `docs/archive/decisions-archive.md` D-060 段。后继 D-084。

## D-061 — v1 能跑产品：治理快照落盘 + 图纸提交日志 + 删 mock 单后端（workflow 连续构建）【已落地·全文归档】

- 状态：**已落地**（账单段压 stub，D-073 活账本纪律）。
- 落点：2026-06-15 落地，6 原子 commit `5a2c96d`→`01d06f4`（7-agent workflow；3-lens 核实全 ship）；真相 = `docs/archive/completed-log.md` + git log。
- 全文（上下文/选项/推演/验证）已移 `docs/archive/decisions-archive.md` D-061 段。

## D-062 — 集成模型地基重建：扁平 AdapterDescriptor → BotChannel / AgentBackend / DataSource 三分【已落地·全文归档】

- 状态：**已落地**（账单段压 stub，D-073 活账本纪律）。
- 落点：2026-06-15 落地（三包 verify:all 绿+活体 curl 三组新端点过）；真相 = `docs/archive/completed-log.md` + git log。
- 全文（上下文/选项/推演/验证）已移 `docs/archive/decisions-archive.md` D-062 段。

## D-063 — 依赖图运维操作：任务状态流转 + 连线作废（软删除）【已落地·全文归档】

- 状态：**已落地**（账单段压 stub，D-073 活账本纪律）。
- 落点：2026-06-15 落地；真相 = `docs/archive/completed-log.md` + git log。
- 全文（上下文/选项/推演/验证）已移 `docs/archive/decisions-archive.md` D-063 段。

## D-064 — commit+push 默认化：扩展到交互式会话

- 状态：**DECIDED**（2026-06-15）
- 日期：2026-06-15
- 上下文：`AGENTS §6.0`（用户 2026-06-11）早已授权「completion gate 通过即直接 commit+push、无需 review」，但措辞落在 §6.A/§6.B/§6.C 自迭代 / 双轨构建语境。交互式（用户当面逐轮指挥）会话里 agent 仍按全局「问了才提交」默认，反复问「要不要 commit+push」，用户嫌烦、明确要求改默认。
- 决策：把该授权**扩展为对一切改动的默认**——含交互式会话。做完一个可验证改动（最小验证通过 + planning sync）即**默认 commit+push**，不再每次问；仅当用户对某次明确叫停才暂缓。push 前 `git fetch` 查分叉、有叉先 rebase/合并。**§3/§8 安全边界（真实服务器 / SSH / 部署 / 80·443 / 密钥）不在授权内，仍需审批**。
- 事实源：本 ADR；`AGENTS.md §6.0`；memory `teamhub-autonomy-loop` / 新增 commit-default feedback；`D-043`（双轨构建纪律）。

## D-065 — 审计后 server 硬化 + 写侧正确性批（写侧小批 + 预写部署代码合并 pass）【已落地·全文归档】

- 状态：**已落地**（账单段压 stub，D-073 活账本纪律）。
- 落点：2026-06-15 落地（三包 verify:all 绿+真机 smoke DEMO_SEED=false 空板/默认双态过）；真相 = `docs/archive/completed-log.md` + git log。
- 全文（上下文/选项/推演/验证）已移 `docs/archive/decisions-archive.md` D-065 段。

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

## D-067 — 图纸档案可写：POST /api/artifacts + console 登记表单（V1-FOLLOWUPS 收尾）【已落地·全文归档】

- 状态：**已落地**（账单段压 stub，D-073 活账本纪律）。
- 落点：2026-06-16 落地，commit `b7eaf4b`（4-phase workflow；2-lens 对抗核实 ship/mustFix=0）；真相 = `docs/archive/completed-log.md` + git log。
- 全文（上下文/选项/推演/验证）已移 `docs/archive/decisions-archive.md` D-067 段。

## D-068 — 设置页风格切换器：运行时主题（经典绿 / 暖纸 Aurash），纯 CSS-variable 换肤【已落地·全文归档】

- 状态：**已落地**（账单段压 stub，D-073 活账本纪律）。
- 落点：2026-06-16 落地（hub-console verify:all 绿；WSL2 真机实测 SWITCH_WORKS=true）；真相 = `docs/archive/completed-log.md` + git log。
- 全文（上下文/选项/推演/验证）已移 `docs/archive/decisions-archive.md` D-068 段。

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

## D-075 — IA 重构阶段 1：机器人队页（机器人管理+在场排班合一）+ 排班 UX 定稿

- 状态：**DECIDED / IMPLEMENTED（分支 `ia-phase1-fleet`，未 merge master）**（2026-06-20；前端为主 + 零契约/端点改动；本机三包 `verify:all` 全绿 + HTTP 集成 smoke 过；**WSL 真机 Playwright 视觉验收全 PASS**=buildId ce8d99a，截图 `docs/screenshots/wsl-fleet-*`）。
- 上下文：用户「查看 teamhub 设计文档，好像有一个 IA 重构建议」。建议在 `docs/design/sched-date-relay-robot-redesign.md` §B（frontier `IA-REFACTOR`，10 平铺页按数据域重组的渐进 4 阶段）。用户拍板：**只做阶段 1（机器人队页）** + **顺带把排班 UX 一起定稿**（消解 frontier `SCHEDULE-DESIGN-LOCK`：用户「现在什么都没有、也没办法加」）。本轮单开 branch、不在 master 直改。
- 设计/实现：3 Plan agent（合并页架构 / 排班 UX 定稿 / 对抗式风险审查）。对抗审查揪出 4 个真机会爆点（见下「缓解」）。
- 决策：
  1. **合并 = 组合不重写**：新建 `apps/hub-console/src/features/fleet/FleetPage.tsx` 渲染既有 `<ResourcesPage>`（上半区）+ `<SchedulePage>`（下半区），零改两个大文件、不碰 `RelayCanvas` 的 `node.measured` 首屏修复。导航 10→9：`ConsolePage` 删 `resources`/`schedule` 加 `fleet`、`navItems` 三项并一项（Bot 图标）、`App.tsx` 三元 + `TITLE_KEY` 收口、i18n 加 `nav.fleet`/`toolbar.title.fleet`/`fleet.section.*` + 删 4 个孤儿键（双侧成对）。
  2. **「改状态画布即时反映」**：`ResourcesPage.refresh()` 从单键失效改 **prefix 失效** `['resources']`+`['relay']`（覆盖表 `['resources',source]` + 画布 `['resources','relay']` + 各 windowLabel 的 `['relay',*]`）。
  3. **排班 UX 定稿（`docs/design/schedule-ux-lock.md`）**——根因「没法加」= `SchedulePage` 把整块 `<RelayCanvas>`（含加棒入口）gate 在 `recommendations.length===0` 之后 → 新一天 0 建议时整块画布被换成一张没有按钮的死卡。修：① 画布**永远渲染**、详情网格单独 gate；② 空态 = 带 CTA 引导卡（`加第一棒`→直接开加棒表单 + `沿用上一天计划`）；③ **任务必填**（派生三态靠 `holderTaskId`）、`noOptions` 拆「缺机器人就地建 / 缺任务跳项目看板」两条可执行引导；④ **默认数据 = 每天空板 + 手动「沿用上一天计划」**（纯前端复用 `GET/POST /api/resource-sessions`，零端点/契约改动）。
  4. **不放假 seed**（守派生优先/别建幽灵数据）：不给 demo 钉「今天」假 session（FixedClock 与真实 `new Date()` 必错配 + 牵动测试断言）。空板**不是 bug、是正确态**，只要可操作（CTA 引导卡）即可；demo 走「现加一棒 → 切天 → 沿用」真实操作产数据。
  5. **冻结 fixture**：`PRESENCE-RECONCILE-LOCK`（§7.1 `grp-program` 去领任务 / 总联调=全组各一人）显式**不在本轮**。
- 守恒/红线（I0）：结转一律经纯函数 `buildCarryOverDraft`——**只取** resourceId/项目/组/任务/接力序，`invitedMemberIds` 恒 `[]`（绝不跨日带成员维度，即便 `GET /api/resource-sessions` 读视图 I0 许可其存在）、`eta`/`note` 恒 null、不结转 handoffs。`CreateResourceSessionResponseSchema` **不动**（`invitedMemberIds` 留存是契约既定「本窗操作名单·I0 许可」，移除会破既有测试）。Fleet/排班渲染路径零成员维度（grep 实证）。
- 缓解（对抗审查 4 点）：① I0 泄漏 → 纯函数 guard + `test/carry-over.test.ts`（换日保序 / invitedMemberIds 恒[] / eta·note 恒 null）+ 不渲染成员字段；② 画布高度 `calc(100vh-360px)` 魔法偏移失真 → 改 `clamp(420px,58vh,720px)` 内容无关定高；③ cache 碎片 + 15s staleTime → prefix 失效；④ §7.1 fixture 调和耦合 → 冻结、不动 fixture/seed。
- 验证：本机 console `verify:all`（typecheck + 40 测含新 carry-over + 生产 build）全绿；contracts 151 / server 186 测不变；起服 4177 serve 生产 dist → index+asset 200；**HTTP 端到端 carry-over smoke**：源带 `m-progA` 的上一天棒 → 结转到次日 `invitedMemberIds:[]`、`/api/relay` 渲染该棒且 grep memberId 为空。**WSL 真机 Playwright 全 PASS**（buildId ce8d99a，截图 `docs/screenshots/wsl-fleet-*`，结果 `wsl-fleet-results.json`）：侧栏 9 项含机器人队·无旧机器人管理/在场排班；双区首屏（机器人清单 + 接力画布）渲染；空板引导卡两 CTA；**加棒后接力卡 reactflow 节点 visibility:visible（无 visibility:hidden 回归）**；沿用上一天 明天 0→1 卡；退役机器人后加棒可选项 1→0（即时反映）；DOM 无 memberId。
- 事实源：本 ADR；定稿 `docs/design/schedule-ux-lock.md`；上游建议 `docs/design/sched-date-relay-robot-redesign.md` §B；plan `~/.claude/plans/teamhub-ia-atomic-cocke.md`；前序 D-072（排班定稿）/D-029（排班派生）/D-069（组级容量）。阶段 2/3/4（项目页/知识页/导航分组）由 D-076 收尾。

## D-076 — IA 重构阶段 2/3/4：项目页 + 知识页 + 导航分组【SUPERSEDED-BY D-077·全文归档】

- 状态：**SUPERSEDED-BY D-077**（2026-06-21）。结论：阶段 2-4 首版已并入 master 又被用户验收推翻两处——**Phase 2 项目页（看板+依赖图）设计有效、D-077 沿用**；**知识页合并图纸档案 ✗**（两数据域八竿子打不着）+ **导航折叠分组 ✗**（洞察不该可收）被推翻。
- 全文（覆盖项 gaps=C / 表单一致 / 实现期偏离 / 验证）→ `docs/archive/decisions-archive.md` D-076 段。后继 D-077。

## D-077 — IA 重构修正：图纸档案拆回独立页 + 导航全摊平 + 缺人方向置末【已落地·全文归档】

- 状态：**已落地**（账单段压 stub，D-073 活账本纪律）。
- 落点：2026-06-21 落地并验收，master `9c4cc5d`（revert D-076 代码后从干净 D-075 重做；WSL2 Playwright 7/7 PASS）；真相 = `docs/archive/completed-log.md` + git log。
- 全文（上下文/选项/推演/验证）已移 `docs/archive/decisions-archive.md` D-077 段。

## D-078 — 图纸文件链路收口（HUB-ARTIFACT-STORE-MECH 本地卷版）+ 表单控件修缮 + 部署/版本号修复【已落地·全文归档】

- 状态：**已落地**（账单段压 stub，D-073 活账本纪律）。
- 落点：2026-06-21 落地，origin/master `0259c18`（worktree 隔离→rebase→FF 合并→push；三包 164/194/44 绿+真机冒烟全过）；真相 = `docs/archive/completed-log.md` + git log。
- 全文（上下文/选项/推演/验证）已移 `docs/archive/decisions-archive.md` D-078 段。

## D-079 — 差异化在场排班 fixture/派生调和定稿（PRESENCE-RECONCILE-LOCK，路线 C 锁定 + 7 决议）

- 状态：**DECIDED / DESIGN-LOCKED（文档就绪，实现待落；阶段② 实现提示词已交付用户去跑）**（2026-06-21）。
- 上下文：在场排班 fixture 遗留——`grp-program` 仍持两个 `t-r*-integration` 总联调任务、`m-progA/B` 挂程序组，与「总联调=全组各一人」收敛语义、差异化三态 demo 不符。前序 D-072（表现形式 + 资源领域模型定稿）已立 `convergenceScope` + `grp-convergence` 哨兵机制方向。本轮把字段/派生/fixture/测试级调和**定稿**，并就 7 个设计抉择逐一拍板。
- **路线选定（用户拍板）**：**路线 C = 总联调收敛语义忠实落地，但 demo 拆两场景**——今晚/首屏 = 平日差异化（三态：电控 present / 电路 onCall / 视觉 blockedFree），「总联调日」= 全组各一人。A 的核心机制（`convergenceScope='allLeafGroups'` flag + `grp-convergence` sentinel + 全叶子组 upgrade present）全保留；C 多做一步 demo 拆分，保住三态可见 + `schedule-route.test.ts` 三态断言零改 + blockedFree 测试保持绿。被否的 A（今晚=总联调，三态压成全 present）存档于定稿 §10。
- **7 项 open question 决议**（2026-06-21）：① 今晚 session id **改名** `sess-tonight-prog→sess-tonight-ec`（同步 ~5 处测试引用）；② 今晚 `invitedMemberIds` **留空 `[]`**；③ 总联调日 `windowLabel='总联调日'`；④ 总联调日 **加 R2**（新增第二条 sess→`t-r2-integration`，两车都演示收敛）；⑤ `convergenceScope` **进 console**（DepNode `+isConvergenceTask` + DAG「全组」徽章）；⑥ `m-progA` `role=member`，且成员展示不突出组长（console 现状已满足，不改）；⑦ `need-rtos` 归口 **grp-ec**（程序组已无直属成员，挂之则空挂）。④⑤ 为较初稿的 2 处加项。
- 落地（**阶段② 待实现，非本轮**）：contracts `governance.ts`(convergenceScope + DepNode.isConvergenceTask + toDepGraphView) / `fixtures.ts`(grp-convergence 哨兵·m-progA→grp-ec 持 t-r1-system-tune·两 integration→grp-convergence+convergenceScope+ownerId=null 保 isCritical·dep-006/007·need-rtos→grp-ec·sess 改名+留空+新增 R1/R2 总联调) / `schedule.ts`(deriveLeafGroups + 持有组按 convergenceScope 分流全叶子组 present + render 跳哨兵) / `attribution.ts`(哨兵不漏)；console 仅 DAG「全组」徽章；~10 测试 + AGENTS.md §1。
- 守恒/红线（I0）：永不渲染 memberId/invitedMemberId；`invitedMemberIds` 永不进派生输出；今晚三态保留；`t-r1/r2-integration` 保持 `isCritical=true`。
- 协调：本轮 = **AI 只写文档**（定稿收口 + 本 ADR + now.md），实现交付简短提示词由用户掌控落点（代码改动触发 D-074 自动 bump 钩子；PRESENCE=feature → `VERSION_BUMP_LEVEL=minor`；勿碰 AGENTS §7 / `scripts/`）。
- 事实源：定稿 `docs/design/presence-reconcile-lock.md`（§11 决议表 + §12 实现清单 = 实现真相）；前序 D-072（PRESENCE-VIZ-RESOURCE-MODEL）/ D-029（差异化在场排班立项）；提示词在 plan `~/.claude/plans/binary-munching-valley.md`。

## D-080 — 录入收尾：新建任务抽屉化 + 连依赖/暴露需求 tab 下线定调 + requires 全砍

- 状态：**DECIDED / IMPLEMENTED（前半 origin/master `3e12e50` v0.7.11；本条 requires 清理 + DepGraph 懒加载本轮落地待 push）**（2026-06-23）。
- 上下文：「新建任务」原是看板顶部常驻录入面板（含「布置任务/连依赖/暴露需求」三 tab）。用户要改成右侧抽屉、依赖图与看板共用同一「新建任务」入口（`3e12e50` 已落：新增 `SideDrawer` + 抽屉状态提升至 `ProjectPage`），并删掉连依赖/暴露需求两 tab。随后讨论这两个被删功能以何形式回来。
- **调研定调（用户三轮拍板）**：
  1. **连依赖 = 拖拽连线 blocks-only**。常见情况（blocks + 人工确认）依赖图 `onConnect` 已完整覆盖（建边 + 自环/重复/成环守卫 + 选中边 waive 删）。表单多出的 `sharesResource` 图上看不见（edge kind 只看 status/criticality 不看 type）、仅改一句归因文案；aiSuggested/具名确认人仅 AI 参与治理才用（D-039 已退）。**不重建依赖表单**；`sharesResource`/AI 建议录入按需后置。
  2. **`requires` 全砍**——全代码零下游消费的废枚举。`DependencyTypeSchema` 移除之（→ `['blocks','sharesResource']`）+ fixture `dep-001` 改 `blocks`（方向/语义不变）+ 删 4 条死 i18n（`pm.depType.requires` / `pm.depType.hint.requires`，zh+en）。**迁移红线**：`FileGovStore.create()` 加载 `gov.json` 严格 `GovernanceSnapshotSchema.parse()` fail-closed，旧种子含 `type:'requires'` → redeploy **必先重置/迁移** `~/teamhub-data/gov.json`（rm 重种子，或 `sed 's/"requires"/"blocks"/g'`），否则服务起不来；`resources.json` / `kb.json` 不受影响。
  3. **暴露需求(Need) 暂时搁置**。Need 是 任务→组 缺口（非任务→任务，画不成连线）；唯一活体消费 = 缺人方向/Gaps 只读页 + 归因 `unmetNeed`；认领/升级是死代码；所属治理派生簇 D-032~D-035 已被 **D-039** 整簇挂起。**不重建录入 UI、不删 schema / `direction-gaps` / Gaps 页 / 2 条种子需求**（休眠保留可演示）。复活条件 = 「缺人方向」真成产品目标（按 D-039 惯例从挂起区取回）。
  4. **构建 chunk>500kB 警告**：`@xyflow/react` + `@dagrejs/dagre`（仅 DepGraphPage 用）压成 694kB 单 chunk → `ProjectPage` 用 `React.lazy` + `Suspense` 把 DepGraphPage 拆成按需 chunk（总览/知识库/库存首屏不再背）。
- 守恒/红线（I0）：抽屉/任务表单/拖拽建边全链路无人员维度；依赖 `confirmedBy` 仍 server 钉、I0 永不回显；Need schema 休眠、不动其 I0 守卫。
- 事实源：本 ADR；plan `~/.claude/plans/cached-dazzling-dream.md`；前半 commit `3e12e50`；上位 D-039（AI 退治理→治理派生簇挂起）/ D-075·D-077（项目页组合 · 看板⇄依赖图）。

## D-081 — 模块化阶段一收口：机器人单体拆成 CASE base + 机器人层【已落地·全文归档】

- 状态：**已落地**（账单段压 stub，D-073 活账本纪律）。
- 落点：2026-07-03 落地，分支 feat/plugin-core `6fc32fb`→`c84f4a9` FF 合并 master，VERSION 0.9.7；真相 = `docs/archive/completed-log.md` + git log。
- 全文（上下文/选项/推演/验证）已移 `docs/archive/decisions-archive.md` D-081 段。

## D-082 — daily-plan-presets 实现拍板【已落地·全文归档】

- 状态：**已落地**（账单段压 stub，D-073 活账本纪律）。
- 落点：2026-07-03 落地（实现五件套终态 `a64e7bc`，VERSION 0.10.3；口径锁=D1/D2/D3 全选 A，见 docs/design/daily-plan-presets.md §6）；真相 = `docs/archive/completed-log.md` + git log。
- 全文（上下文/选项/推演/验证）已移 `docs/archive/decisions-archive.md` D-082 段。

## D-083 — 产品重定义 2026-07：开源 · 防爆肝双主轴 · 四把刀 · 宪法修正

- 状态：**DECIDED（2026-07-11，用户多轮架构/产品讨论拍板；设计真相 = `docs/design/product-redefine-2026-07.md`）**。
- 上下文：用户（Robocon 战队电控，明年大三接管战队、队内无项目管理岗）以真实痛点重定义产品：今年备馆才开始调参→太晚、电控近燃尽；期末 6 周真空期；寒暑假依赖链卡死（机械不在校只能画图）；赛场翻车=测试不完全赛前隐形。开源动机=先救明年的自己，其次帮小团队攒口碑。
- 决策（要点，全文见设计稿）：
  1. **产品一句话**：给没有项目经理的小团队一个代打项目经理的工具——把赛前爆肝摊平到整个赛季。双主轴=防爆肝（倒排基准线）+ 防"大号 AI MCP"（学习方向+AI 边界）。
  2. **宪法修正**：G4 修正（里程碑有日期、Task 永不带个人 dueDate、快慢从里程碑派生、落后单位=模块非人名）；I0 口径降级（收回"结构上无法统计"绝对主义→"分析对准事不对准人、不做排行榜"；新增"登录后本人视图"合法例外）；AI 排人三红线（事实拼盘不排序、拍板留名归人、拼盘只在决策现场）。
  3. **四把刀**：①倒排基准线（赛季→学期→阶段类型[研发/迭代/调参/真空]+里程碑链+验证门+投资类任务防砍示警+阶段×工种负载；独立 baselineStore 不塞 GovernanceSnapshot；前置=Season 接线）②轻身份登录**双模式**（匿名模式整体保留供选择；身份模式=匿名可读一切+登录才写/个人视图，选人+可选PIN；服务端注入身份替代客户端自报；ownerId 自由文本→选人）③我的视图（我负责∩未被卡）④store 拆分→SQLite（前置=拆 21 方法 god-interface）。
  4. **收窄/砍/推迟**：课表排班砍（伪需求）；在场排班收窄到关键窗口；缺人方向→学习方向（跨工种地图×队缺口，只对本人只建议）；兴趣声明暂不建；游戏包+对外文档后置；MODULARIZATION-PHASE2 垂直包 worktree 随游戏包后置。
  5. **责任立场**："备馆才调参"是一年积累、找不出责任人——**不追责，追债**：基准线让债在变小时可见，复盘对事（结构原因），经验回写模板（sim2real 假期双链即实例）。
- 解耦审计（`wf_66e13d79-814`）：四刀阻力+坐实错位字段（GroupKind 闭集/convergenceScope 字面量判断/pm-requests 硬绑 robotics/main.ts 未接 tenantConfig），账单见设计稿 §9。
- 归档：`docs/design/core-plugin-architecture.md`（PROPOSAL 完整注册中心愿景）搁置移 `docs/archive/`——路线 v4 未采纳，其安全建议（defineRoute/写守卫 fail-closed）登录改造时回读。
- 事实源：本 ADR + `docs/design/product-redefine-2026-07.md`；前序 D-081（模块化阶段一）/D-039（AI 退治理，其"AI 不下判断"精神由本 ADR AI 三红线继承）。

## D-084 — console 换肤定局：新增第 4 主题「tech」并设默认，Aurash 暖纸风提案关闭【SUPERSEDES D-060】

- 状态：**DECIDED / IMPLEMENTED**（2026-07-12）。console 新增第 4 套主题 `[data-theme='tech']`（深色科技旗舰：蓝图网格底纹+发光基准线轨道+等宽数字），设为**默认主题**（`localStorage` 已存偏好的老用户不被覆盖）；classic/warm/dark 三套渲染结果零污染（全部结构性改动圈在 `[data-theme='tech']` 选择器下）。零外部资产（系统字体栈 + CJK 回退，无 CDN/webfont）。落地 commit `332c354`(feat, v0.16.0) + `c6eaa4d`(fix QA, v0.16.1) + `04654b3`(docs 截图)。三包 `verify:all` 全绿 + `health-check` 9 页 0 错复核（2026-07-12 收口轮）。截图 `docs/screenshots/tech-restyle/`。
- 上下文：`UI-RESTYLE-AURASH`（D-060，2026-06-15 DEFERRED，低优先级延后）长期挂在 `now.md.open_for_decision` 未推进。用户 2026-07-12 直接拍板选**科技风**方向（非 Aurash 暖纸风），落地为运行时可切换的第 4 套主题（沿用 2026-06-16 已建的 `data-theme` 多主题切换器机制，见 warm 主题先例），而非 D-060 评估过的 Tailwind+Radix+shadcn 换框架路线。
- 决策：
  1. **D-060 的 Aurash 暖纸风提案就此关闭**（不再是候选方向）——`SUPERSEDED-BY D-084`，全文移 `docs/archive/decisions-archive.md` D-060 段，`now.md.open_for_decision` 移除 `UI-RESTYLE-AURASH` 条目。
  2. **D-060 护栏在 tech 主题实现中延续遵守**：不引 Tailwind/Radix（纯 CSS-variable，零新依赖）；不碰 I0 反排名 3 承重串；zh/en 编译期对称零改动；未搬 xju-feiyue/Aurash 任何 tokens（tech 配色独立设计，蓝图网格+发光态是原创方向，非 Aurash 暖纸风任何变体）。
  3. **纯视觉轮，业务逻辑零改动**（依 D-060「先理业务逻辑」老实定位——本轮不动路由/契约/API，只动 `styles.css` + `theme/index.tsx` 默认值 + 1 处 @xyflow 第三方控件 tech 分支 CSS）。
- 事实源：本 ADR；`docs/planning/now.md`「最近完成 2026-07-12」；D-060（被 supersede 段，全文见 archive）；2026-06-16 主题切换器机制先例（`data-theme='warm'` 首套运行时主题）。

## D-085 — 名字三层原则：I0 第三版口径（事实层带名 / 聚合层永不做 / 结构层对事）

- 状态：**DECIDED（2026-07-15，赛后产品讨论收敛落档；07-14 口头共识转正）**。
- 修宪链（保留演进记录，修宪≠违背）：**v1** I0 绝对匿名（D-026/D-037，"结构上无法统计"）→ **v2** D-083 降级（分析对准事不对准人、不做排行榜、登录后本人视图合法）→ **v3 本条**：三层口径。
- 三层：
  1. **事实层永远带名**：认领留名、验收留名、拍板留名、豁免留名——单条事实卡片上名字可见且应当可见（责任可溯是制度的地基）。"主页无名、点进详情大家都知道是谁"即此层的 UI 直译，不是原则被破坏。
  2. **聚合层永不做**：任何按人统计、排行、频次对比、产能画像，结构上不建。系统不供排名素材；需要回看某人的事实记录（如换届筛选点），由人翻事实卡，不由系统算。
  3. **结构层对事**：落后单位=里程碑/模块/组，永不点人名（承 D-083 G4 修正）。
- **UI 收口规则（一句话可执行）**：名字只出现在事实卡片上，永不进首页/聚合/统计；不提供"按人筛选"，唯一例外=登录本人的「我的视图」（D-083 已合法化）。
- 实现含读侧调整（如 baseline 过门 `passedBy` 现读侧剥离，按本条未来可在事实卡显示验收人）——随后续刀落地，本条只锁口径，不排期。
- 事实源：本 ADR；AGENTS §5 I0（已加注记指向本条）；`product-redefine-2026-07.md` §3.2（v2 口径）。

## D-086 — 库存改造方向：缺料双报警 × 赛场打标 × 记账粒度分级；对话记账判死【修正 D-042 决策 4】

- 状态：**DECIDED-DIRECTION（2026-07-15）；实现不排期、不跑实现 workflow**（用户明示"先写文档"）。设计真相 = `docs/design/inv-alert-redesign.md`（DESIGN-DRAFT v1，inv-bom-core.md 的 delta）。
- 要点：
  1. **对话记账判死**（作为主力防死路径；D-042 决策 4 的"对话记账主力，靠 Hermes"定位就此作废）：真实队员不会主动对 AI 报账。防死改向=记账必须是**必要动作的副产品**（盘点/装箱门/两箱法物理触发）；`source='hermes'` 枚举与动作日志保留。
  2. **记账粒度分级**：耗材不进系统（两箱法：开第二盒=采购触发）；数量件用现有 PartType；贵重件个体行加自由备注 + "机器只算 ok 数"语义收口，不建 OOP 子类型。
  3. **缺料双报警=两条派生查询**：备件水位（曾有过的物料，水位可为 0）+ 采购缺口（BOM 中从未有过的新物料）；非常驻进程。
  4. **赛场打标**：一本账+site 打标过滤，绝不复制第二本账；装箱=转移单核对门，agent 只当预填清单生成器不当录入界面。
- 事实源：本 ADR + `docs/design/inv-alert-redesign.md`；被修正=D-042 决策 4（其余基调不动）；红线沿 `inv-bom-core.md`（I0/G2/C3 全守）。

## D-087 — 门检查单与欠条（GATE-CHECKLIST-IOU）：门升级为检查项容器，欠条=动态检查项

- 状态：**DESIGN-LOCKED（2026-07-15 用户拍板全部细节）；功能已拍"要加"，实现待排期**（建议先行于 Hermes 接入，纯本地零外部依赖）。设计真相 = `docs/design/gate-checklist-iou.md`。
- 一句话：凑合不禁止，但凑合必须贴条；条子有到期点；到期要么还、要么签字认账。门判定收敛为一条规则=挂该门的检查项全部非 pending。
- 用户拍板三细节：①欠条挂接二选一=已有门 或 自选到期日（默认下一道整车级门）；②**豁免权=大三（不只是组长）**，落地为「验收人名单」设置页维护、每年换届更新；③**豁免强制写理由**+留名（暴雷后翻出来是判断失误的记录，不是甩锅把柄）。
- 三层网哲学（回应本届 24V 转压模块"不自知的凑合"）：欠条抓自知的凑合 / 检查单模板抓不自知的（触发器式写法："无溯源电源件上车=自动欠条"，不禁用、门前收网、不依赖自觉）/ 复盘回填模板抓漏网的（2026 检查单初稿为第一批）。目标=同一个雷不炸第二次；"整车设计冻结"不采纳。
- 红线：欠条不是 Task（D-083 G4"Task 永不加个人 dueDate"不受影响，欠条 dueAt 属里程碑家族）；清偿/豁免留名=事实卡（D-085）；"谁欠条最多"排行永不做。
- 事实源：本 ADR + `docs/design/gate-checklist-iou.md`；上游 D-083/D-085/`baseline-design.md`。

## D-088 — 挂单认领制（TASK-POST-CLAIM）：过夜登记处 · 结构尺 · 两档验收

- 状态：**DESIGN-LOCKED（2026-07-15 深夜多轮拍板）；实现待排期**；用户明示"先试试、边做边改"——判定阈值全为可调常量。设计真相 = `docs/design/task-post-claim.md`。
- 核心拍板：①挂单=无主 Task，认领一键即生效免组长确认；指派合法但强制理由（分配=显式培养投资）；②**全队可见**+鼓励跨组认领简单任务；③**"大任务"结构判定**（有下游边或挂门=大，机器可判、不新增大小字段），跨组认领大任务=该组组长一键确认；④**本组搭档规则**（外组认领后本组须有人补位，黄标暴露不硬阻塞——跨组是学习通道不是甩锅通道）；⑤**完成两档**=简单活本人标完成+学长抽查打回 / 大活必须学长验收留名（防学长瓶颈+防盲签贬值签名）；⑥空闲提醒只私推本人（"没把握就去问问学长"），永不向学长报"谁闲着"；⑦Need 不合并（挂单=组内任务板，Need=跨组门铃、归因链原料；结构性接口走设计流程=图纸验收检查项）。
- 判定尺：三问（过夜/有人等/要被记住）有一是才进；**单次灰活不记、成类灰活立户**（周粒度+无 Task 死线=噪声底论证；"老车维护"升格先例）；组长=本组唯一挂单员；漏录不追责、绝不考核录入率。
- 防屎山立场：**"奠基简单活"不另建模**——画依赖边即自动升格为大任务；拒绝"基础性/重要度"字段（制度=数据、判定=纯函数、最小 schema）。
- 事实源：本 ADR + `docs/design/task-post-claim.md`；上游 D-083/D-085/D-087。

## D-089 — 权限地基（K1）：superAdmin 写口 + 敏感门收口 + 初始化管理员

- 状态：**已落地（2026-07-16，K1 一刀，v0.24.0）**。背景=`MemberRole` 三档（superAdmin/groupAdmin/member）久已存在，但全库无任何路由能改 role——挂单指派 `isGroupLeadOf` 恒 403、敏感设置无权限门；用户明示"重要设置必须有密码"。
- 核心拍板：①**双模式非对称**——所有新权限门**只在身份模式生效**（`TEAMHUB_IDENTITY_MODE=identity`）；匿名模式=演示态零门槛（写门即可，与 PUT gate-reviewer v1 先例对称）。②**superAdmin 诞生**=`POST /api/setup/super-admin`（身份模式 only，匿名 404）：前置=名册无任何 superAdmin（否则 409）、须已登录，效果=把登录本人 role→superAdmin **且同笔设 pinHash**（先设 pin 再升 role，防"无 PIN 管理员被免密登录冒用"——这就是"敏感设置须密码"的落点）。③**改角色**=`PUT /api/members/:id/role`（匿名=写门即可 / 身份=须 `isSuperAdmin` 403）+ **降级保护**（两模式统一：摘掉最后一个 superAdmin → 409，防锁死）。④**敏感门收口**=身份模式下 gate-reviewer/role/seasons 三条须 superAdmin（403）；匿名不变。⑤**鉴权读实时名册**：服务端敏感门另读 store 快照鉴权，不吃 SessionIdentity 的 role 快照（快照只喂前端角色态；改角色/名单后前端须重登才刷新）。
- 落点：`authz.ts` 加 `isSuperAdmin`（照 `isGateReviewer` 形状，与两刀共用一处鉴权基元）；store 加 `setMemberRole`（三实现照 `setMemberGateReviewer` 逐字形状）；`SessionIdentity` 增 `gateReviewer` 快照；console 设置页「验收人名单」扩为「成员与权限」（角色三档下拉+验收人复选框+初始化管理员引导卡+接 identity 写门）。
- 红线：`MemberRole` 枚举零改动（只是补上改它的写口）；无任何按人聚合/排行/按人筛选端点；无新增 dueDate；I0 守住。
- 事实源：本 ADR；上游 D-083（轻身份双模式）/D-087（gateReviewer 名单）/D-088（isGroupLeadOf 依赖 role 可改）。
