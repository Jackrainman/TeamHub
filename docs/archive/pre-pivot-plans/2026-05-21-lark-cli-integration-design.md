---
status: draft
date: 2026-05-21
topic: lark-cli-integration
scope: lark-gateway 模块化拆分 + 飞书官方 CLI 接入 + 出站能力统一门面
relates_to:
  - LARK-01-CONNECTOR-ARCH        # 现有 lark-gateway 设计
  - LARK-03-MIN-INTEGRATION       # 现有最小闭环代码
  - LARK-ONBOARD-GUIDE            # 现有用户线下接入清单
depends_on:
  - D-021                         # 路径 A + SDK + Long Connection 拍板（仍生效）
proposes:
  - D-022                         # 本 spec 拍板后追加的新 ADR
constraints:
  - AGENTS.md §3 全文（AI 不读密钥、用户线下注入凭证）
  - AGENTS.md §5 设计宪法 C3（小作坊优先）+ C5（只为上游存在的数据流构建）
  - AGENTS.md §6 atomic task discipline
---

# lark-cli 接入 + lark-gateway 模块化拆分（设计稿）

> 本 spec 在 D-021 拍板的"路径 A + `@larksuiteoapi/node-sdk` Long Connection 模式"已落地之上，提出两件耦合在一起的改动：（1）正式接入飞书官方 CLI `@larksuite/cli` 作为出站 + 配置 + 诊断能力的补充入口；（2）把 `apps/lark-gateway/` 按"入站进程 / 出站门面库 / 业务 skill 库"拆为三个 workspace 子包。两件事必须一起做：单接 CLI 不拆模块会把 gateway 推向 16+ 文件的 Frankenstein；只拆模块不接 CLI 等于做了重构没有兑现新能力。

## 0. 范围与非范围

### 0.1 在范围内

- 立 `apps/lark-toolkit/` 子包：出站统一门面，内部分流 SDK / lark-cli
- 立 `apps/pf-skills/` 子包：业务 skill 调度（首批含 debug-checklist mock 模式 + claude/deepseek stub）
- `apps/lark-gateway/` 瘦身：删 skill-dispatcher / reply-sender / lark-client 出站部分；message-handler 改 import 新两包
- ADR D-022：固化"3 秒 ack 判定问句"硬规则 + §3 对齐细则 + 三包架构边界
- `docs/research/lark-onboard-guide.md` §1–§5 改写为 lark-cli 路径，保留旧手填 fallback
- `docs/research/lark-cli-dev-usage.md` 新建：dev 工作流常用 lark-cli 命令清单
- `AGENTS.md §2` 加段：lark-cli 的 `skills/` vs ProbeFlash 的 `.agents/skills/` 同名异物声明

### 0.2 非范围

- 真实 LLM provider 接入（claude / deepseek 实现）—— 留 LARK-CLI 系列之后
- 卡片消息 / 多维表 / 建群 / OAuth —— toolkit 仅留接口位，首版只 ship `reply`
- `pf-cli/` 子包（ProbeFlash 自己的终端入口）—— 留 BRIDGE 阶段评估
- pf-core / pf-adapters 总线架构（"拆法 B"）—— 留 BRIDGE-01 时再评估
- 把 lark-cli 写入 `package.json` deps —— 由用户全局装
- 把 lark-cli 的 24 个 AI Agent Skills 引入 ProbeFlash 触发面

## 1. 问题陈述

### 1.1 lark-gateway 当前的隐忧

`apps/lark-gateway/` 现有 9 个 src 文件，职责已混合三层：

| 层 | 现有文件 | 若按原"全量接入"轨迹继续累加 |
|---|---|---|
| 入站（WSS + 事件分发） | `lark-client.ts` 的 WSClient 部分、`event-router.ts`、`message-handler.ts` | — |
| 出站（飞书 API 调用） | `reply-sender.ts` | `cli-bridge.ts`、未来 `card-builder` / `bitable-writer` / `group-manager` |
| 业务 skill 调度 | `skill-dispatcher.ts`（mock 模式） | `skill-claude.ts` / `skill-deepseek.ts` / `archive-writer.ts` / `intent-router.ts` |

按当前轨迹推到一年后，lark-gateway 会有 16+ 个文件，相互引用，违反 AGENTS.md §5.3「小作坊优先」与"30 秒能定位 bug"的备赛期工程纪律。

### 1.2 lark-cli 的现状（外部事实）

飞书官方维护 `larksuite/cli`（npm: `@larksuite/cli`），覆盖 17 个域 200+ 命令；核心：`lark api` / `lark auth` / `lark config` / `lark schema` / `lark doctor`；MIT。详见 `docs/research/lark-oss-candidates.md` 之后的外部资料链接（README.zh.md / feishu-cli.com）。

与 lark-gateway 能力对照（共同点 vs 各自专属）：

| 能力 | lark-gateway 现状 | lark-cli | 重叠 |
|---|---|---|---|
| 入站事件（WSS 听 `im.message.receive_v1`） | ✓ WSClient | ✗ 不做入站 | ❌ gateway 独占 |
| 回消息（`im.v1.message.create`） | ✓ reply-sender | ✓ `lark api ...` | ✓ 完全重叠 |
| 配置初始化 | ✗ 用户手填 .env | ✓ `lark config init` | ✗ |
| 健康检查 | ✗ 无 | ✓ `lark doctor` / `auth status` | ✗ |
| 卡片 / 多维表 / Sheet / Doc / Calendar | ✗ | ✓ 21 域全有 | ✗ |
| Bot 鉴权 / token 自动刷新 | ✓ SDK 自管（.env） | ✓ OAuth 用户授权 | ⚠ 双 store |

**收敛三句话**：入站只有 gateway 能做；出站几乎全部重叠且 lark-cli 覆盖面远大于 gateway 已实现的 1/N；配置 / 诊断 100% 是 lark-cli 的强项。

## 2. 决策与硬规则（拟入 D-022）

### 2.1 路径选择

候选三条：① 继续走 SDK（in-process API）；② 全切 shell out 到 lark-cli；③ 混合 —— 入站 + 同步出站走 SDK，其余走 lark-cli。

选 **③ 混合**。

不选 ① 的原因：每加一个能力都要写一段 TS wrapper，扩展成本线性增长；lark-cli 现成的 21 域能力不利用是浪费。
不选 ② 的原因：fork 子进程 ~50ms+ 会冲击 3 秒 ack 边界；reply-sender 已稳定、无理由换；lark-cli 没有 WSS 入站能力。

### 2.2 硬规则

> **入站事件 + 同步回 @ 路径**（3 秒 ack 窗内）→ SDK（`lark-toolkit/sdk-client.ts`）
> **配置 / 诊断 / 一次性管理 / `lark-connector.md §9` 列的所有 forward-looking 出站扩展** → lark-cli（`lark-toolkit/cli-bridge.ts`）
> **判定问句**：能否在 3 秒 ack 窗口完成？是 → SDK；否 → CLI。
> **统一调用入口**：业务代码（gateway、pf-skills、未来 pf-cli）**只调** `larkToolkit.reply / sendCard / writeBitable / ...`，由 `boundary.ts` 内部分流到 sdk-client 或 cli-bridge。业务层不感知差异。

### 2.3 §3 对齐细则（AI / Skill 行为边界）

| 子命令 | AI 可调 | 用户线下必做 |
|---|---|---|
| `lark config init` / `lark auth login` / `lark auth logout` | ✗ | ✓ |
| `lark auth status` / `lark doctor` / `lark schema` | ✓ read-only | — |
| `lark api <*.list/get/search>` | ✓ read-only | — |
| `lark api <*.create/update/delete/patch>` | ✗ 默认禁；一次一批由用户审批 | 审批后可代跑 |
| 读 lark-cli 的 token store（`~/.config/...` / keychain） | ✗ 硬禁 | — |

`AGENTS.md §3` 末尾追加 1 句：「`lark-cli` 的 `auth login` / `config init` / token store 全部由用户线下执行；AI 不读其凭证存储，只跑诊断与只读 API」。

## 3. 目标包布局（拟入 D-022）

```
apps/
├── lark-gateway/         # 瘦：仅入站长连接进程
│   src/
│   ├── main.ts           # 入口；loadConfig → createToolkit → createSkillDispatcher → buildEventDispatcher → wsClient.start
│   ├── ws-client.ts      # 仅 WSClient 构造（原 lark-client.ts 的入站部分）
│   ├── event-router.ts
│   ├── message-handler.ts# @机器人检测 + 提取症状 + 调 pfSkills + 调 larkToolkit.reply
│   ├── config.ts         # 入站 env（APP_ID / APP_SECRET / BOT_OPEN_ID / DOMAIN）
│   └── logger.ts
│
├── lark-toolkit/         # 出站统一门面（库；不是进程）
│   src/
│   ├── index.ts          # createToolkit(config) → { reply, sendCard, writeBitable, ... }（首版仅 reply 实现，其余留接口位）
│   ├── sdk-client.ts     # in-process SDK 调用包装（3 秒 ack 路径）
│   ├── cli-bridge.ts     # execa shell out 到 `lark api <method>`；错误归一化
│   ├── boundary.ts       # route(method) → 'sdk' | 'cli'；白名单：reply → sdk，其他默认 cli
│   └── types.ts
│   test/
│
└── pf-skills/            # ProbeFlash 业务 skill（库）
    src/
    ├── index.ts          # createSkillDispatcher(config) → { dispatch(symptom) }
    ├── debug-checklist/
    │   ├── mock.ts       # 迁自现 lark-gateway 的 mock 模式
    │   ├── claude.ts     # stub（throw not implemented）
    │   └── deepseek.ts   # stub
    └── types.ts          # SkillReply / SkillMode
    test/
```

### 3.1 关键约束

- gateway 是**进程**；toolkit、skills 是**库**（被 gateway 在 main.ts 注入式装配）
- gateway 加载 `.env` 后 `createToolkit(envSubset)` / `createSkillDispatcher(envSubset)`，库本身**不读 process.env**（便于测试 + 多入口复用）
- 未来 `pf-cli/` 复用：直接 `import { createToolkit, createSkillDispatcher }`，不感知 WSS

### 3.2 不做（YAGNI）

- 不搞 pf-core / pf-adapters 总线架构（"拆法 B"）—— 留 BRIDGE-01 阶段评估
- 不在首版实现 sendCard / writeBitable / createGroup —— 仅留接口位
- 不保留 lark-gateway 老结构 + 新结构两套并存 —— M3 一次性切完
- 不引入 lark-cli 的 `skills/` 体系
- 不在 package.json 写 lark-cli deps —— 用户全局装

## 4. 切入面与任务清单（拟入 backlog.md）

### 4.1 切入面与任务对应

| ID | 切入面 | 改动单元 | 依赖 |
|---|---|---|---|
| **M1 / LARK-CLI-01** | 新建 `apps/lark-toolkit/` | package.json + tsconfig + 5 src + 测试；`createToolkit(cfg)` 公共 API；`sdk-client.ts` 包 `reply` 实现；`cli-bridge.ts` 用 `execa` shell out + 错误归一化；`boundary.ts` `route(method)` 判定函数（白名单：reply→sdk，其他→cli） | — |
| **M2 / LARK-CLI-02** | 新建 `apps/pf-skills/` | package.json + tsconfig + 迁移 skill-dispatcher.ts；`createSkillDispatcher(cfg)` 公共 API；mock 保留，claude/deepseek 留 stub；单测从 lark-gateway 全套迁 | — |
| **M3 / LARK-CLI-03** | lark-gateway 瘦身 | 删 skill-dispatcher.ts / reply-sender.ts；lark-client.ts 拆出 ws-client.ts；message-handler.ts 改 import；main.ts 装配链重写；单测重写 | M1 + M2 |
| **D / LARK-CLI-04** | ADR + 文档重写 | decisions.md 追 D-022；lark-connector.md 整段重写 v2；roadmap.md §9 forward-looking 标注；AGENTS.md §2 加语义解歧段 | — |
| **B / LARK-CLI-05** | onboard guide 重写 | lark-onboard-guide.md §1–§5 改 lark-cli 路径；保留旧手填 fallback；§8 排查段加 lark-cli 条目；§10 checklist 同步 | M3 + D |
| **A / LARK-CLI-06** | dev usage 指南 | docs/research/lark-cli-dev-usage.md 新建；AGENTS.md §7 Verify Matrix 新增一行 | D |

**并行度**：01 ∥ 02 ∥ 04 ∥ 06 → 03 → 05（约 6 个原子任务时段）

### 4.2 每个任务的 DoD

| ID | DoD |
|---|---|
| LARK-CLI-01 | `cd apps/lark-toolkit && npm run verify:all` 通过；单测 ≥ 8 个（不打飞书网络，不打真 lark-cli）；boundary.ts 白名单测试覆盖 |
| LARK-CLI-02 | `cd apps/pf-skills && npm run verify:all` 通过；单测从 lark-gateway 全套迁（≥ 5 个）；mock 文案 byte-for-byte 等价于现 lark-gateway 输出 |
| LARK-CLI-03 | `cd apps/lark-gateway && npm run verify:all` 通过；测试数量 ≥ M3 之前；gateway src 文件 ≤ 6 个；`grep -r "skill-dispatcher\|reply-sender" apps/lark-gateway/src/` 空 |
| LARK-CLI-04 | `git diff --check`；ADR yaml 可解析；`grep -r "skill-dispatcher" docs/` 仅命中 archive；lark-connector.md status 升 stable |
| LARK-CLI-05 | onboard guide 自洽；旧 fallback 路径完整保留；§10 checklist 同步；`grep "cp .env.example" docs/research/lark-onboard-guide.md` 命中（fallback 仍在） |
| LARK-CLI-06 | dev usage 文档存在；`AGENTS.md §7` 矩阵新增行；`grep "lark doctor" docs/research/lark-cli-dev-usage.md` 命中 |

## 5. 接入优势汇总

按"对 ProbeFlash 当下价值"排序：

1. **缩短调试循环**：`lark doctor` / `auth status` / `schema im.v1.message` 一行可跑；省掉自建 send-test / tail-events 工具（≈ 1 个原子任务的工作量）。
2. **0 代码量获得 21 域 API 能力**：lark-connector.md §9 列的 7 个 forward-looking 扩展，每个 ≈ 1 行 cliBridge 调用 vs 30–80 行 SDK 包装。
3. **结构化 onboard**：onboard guide §0–§5 手工动作减约 40%（剩 60% 是飞书后台必须人去点的）。
4. **AI Agent 友好**：lark-cli 输出经专门设计（结构化 JSON、智能默认值、错误码归一），AI dev 流程跑 `lark schema` 拿可解析输出。
5. **模块化福利**：lark-toolkit + pf-skills 拆出后，未来 pf-cli / BRIDGE / TRAIL 任何想用"飞书出站"或"调度 skill"的模块直接 import 即可；BRIDGE-01 设计阶段"如何不破 gateway"被釜底抽薪。

### 5.1 不在优势中（避免过度宣传）

- 不节省入站代码（WSClient + event-router + message-handler 一字未减）
- 不简化首次飞书后台注册（§1–§3 用户操作 100% 保留）
- 不降低 AGENTS.md §3 任何边界（双 token store 反而要新写明边界细则）

## 6. 风险与回滚

### 6.1 风险登记

| 风险 | 触发场景 | 影响 | 缓解 |
|---|---|---|---|
| lark-cli 上游 breaking change | 未来 major 更新改 `lark api` 参数 / 输出 | cli-bridge 失效，走 CLI 的能力同时坏 | cli-bridge 启动时跑 `lark --version` 校验最低 major（不达标 throw 友好错误）；最低版本写入 `apps/lark-toolkit/README.md` 与 onboard guide §0；单点变更集中在 cli-bridge.ts；smoke 测放 onboard §5 兜底 |
| 双 token store 错位 | 用户既跑 `lark auth login` 又填 .env | gateway / cli-bridge 行为不一致 | onboard §4 显式"二选一"；boundary.ts 启动 log 当前生效路径；`lark auth status` 入 checklist |
| AI Agent Skills 命名混淆 | 新人 / 未来 AI 把 `lark-cli/skills/lark-im` 当成 ProbeFlash 触发面 | 跑错命令 / 写错 skill | M4 语义解歧；lark-connector.md §0.1 显式说明 |
| M3 重构期单测漏迁 | message-handler 改 import 时漏迁 case，测试意外通过 | gateway 行为悄悄退化 | M3 DoD 要求测试数量不减；CI 跑 typecheck + test + build；可选 `--coverage` 比对 |
| workspace protocol 配置错误 | npm workspaces 版本 / package.json 错位 | 三包都跑不起来 | M1 / M2 / M3 分开 commit；每包先单独 install 验证 |
| lark-cli 全局装失败 | 用户网络 / 权限问题 | onboard 卡在 §0 前置 | onboard §0 加 lark-cli 安装验证；旧手填 fallback 不删 |

### 6.2 回滚

- **包级**：lark-toolkit / pf-skills 任一包决定废弃 → git revert 到 M3 之前（基线 `e821c8f`）；最多丢 1 个原子任务工作量
- **D-022 决策**：ADR 标 SUPERSEDED + 加 D-023；硬规则若证伪，把 cli-bridge 能力降级为"仅 dev 自检"，新出站全切回 SDK
- **onboard**：guide 顶部说明"找不到 lark-cli ? 跳到 §A.fallback"，旧路径完整保留

## 7. 验收矩阵（对齐 AGENTS.md §7）

| 任务 | 必跑 |
|---|---|
| LARK-CLI-01 | `cd apps/lark-toolkit && npm run verify:all`；共性 |
| LARK-CLI-02 | `cd apps/pf-skills && npm run verify:all`；共性 |
| LARK-CLI-03 | `cd apps/lark-gateway && npm run verify:all`；测试数量 ≥ M3 之前；共性 |
| LARK-CLI-04 | `git diff --check`；`grep -r "skill-dispatcher" docs/` 仅 archive；ADR yaml 可解析 |
| LARK-CLI-05 | onboard guide 自洽；旧 fallback 文字保留；§10 checklist 同步 |
| LARK-CLI-06 | dev usage 文档 lint；AGENTS.md §7 矩阵新增行 |
| 全任务完成后 | 用户线下走完新 §1–§5 → §10 checklist 全打钩（不在 AI 验收范围） |

共性（每任务必跑）：`git diff --check`；`now.md` yaml 可解析；`cd apps/desktop && npm run verify:skills-sync`。

## 8. 关联文档

- `docs/design/lark-connector.md`（D-021，当前 status: draft）—— 本 spec 落地后随 LARK-CLI-04 重写为 v2，status: stable
- `docs/research/lark-onboard-guide.md`（status: stable）—— 本 spec 落地后随 LARK-CLI-05 重写
- `docs/research/lark-api-capability.md`（D-020）—— 飞书 API 能力底座，不变
- `docs/research/lark-oss-candidates.md`（D-020 后续）—— SDK 选型证据链，不变
- `docs/planning/decisions.md` D-021（生效中）+ D-022（本 spec 拍板后追加）
- `apps/lark-gateway/`（D-021 现状）—— 本 spec 落地后被瘦身

---

设计版本：v1（status: draft）。用户复核通过后转入 writing-plans 写实施计划。落地完成后 status 升 archived，并把对应任务 ID 与落地 commit 写入 `closed_at:` / `landed_in:`。
