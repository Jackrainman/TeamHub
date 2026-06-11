---
title: 飞书 Connector 架构设计（三包架构）
status: stable
date: 2026-05-21
version: v2
decisions: [D-020, D-021, D-022]
related_tasks: [LARK-01-CONNECTOR-ARCH, LARK-03-MIN-INTEGRATION, LARK-ONBOARD-GUIDE, LARK-CLI-01..06]
supersedes: lark-connector.md v1（2026-05-19 draft）
---

# 飞书 Connector 架构设计（三包架构）

> 备赛期 MVP 设计：把"飞书 @机器人收到调试症状 → ProbeFlash 处理 → 飞书群内回复检查单"这条链路落到代码层面。本文按 D-021 拍板的路径 A（用 `@larksuiteoapi/node-sdk` Long Connection 模式）+ D-022 拍板的三包拆分（lark-gateway 入站进程 + lark-toolkit 出站门面 + pf-skills 业务调度，混合走 SDK / lark-cli）展开接口 / 数据流 / 错误模型 / 部署边界。LARK-03-MIN-INTEGRATION 已落地代码骨架（Mock 模式）；LARK-CLI-01..06 落地三包拆分；真实 LLM provider smoke + 飞书连通走查留用户线下完成。

## 0. 范围与非范围

### 0.1 在范围内（MVP + 三包架构）
- 三个独立子包（file: 依赖装配）：
  - apps/lark-gateway/：纯入站 WSS 进程，仅 WSClient + EventDispatcher + message-handler
  - apps/lark-toolkit/：出站统一门面库，boundary.route 内部分流 SDK / lark-cli
  - apps/pf-skills/：业务 skill 调度库（debug-checklist mock 模式起步）
- 监听 im.message.receive_v1 → @机器人 → skills.dispatch → toolkit.reply 链路
- mock 模式下不调真实 LLM；真实 provider 接入留后续

**重要术语预警**：lark-cli 自带 `skills/` 目录（24 个 AI Agent Skills，飞书 OpenAPI 操作指南）与 ProbeFlash `.agents/skills/`（领域调度 skill 如 debug-checklist）**字面同名但完全不同**。讨论时分开称呼。

### 0.2 在范围外（备赛期不做）
- 真实 LLM provider 接入（Claude / DeepSeek API 调用 + key 注入）→ 留用户线下
- 飞书企业内部应用注册（开发者后台动作）→ 留用户线下
- 多维表格 / 卡片流式 SSE / OAuth 用户授权 / 通讯录读取
- 集群部署、负载均衡、生产监控
- 容器化 / systemd / 反向代理
- TLS 终止（Long Connection 走 SDK 自带 wss）

## 1. 模块拆分（三包架构）

D-022 拍板把原 `apps/lark-gateway/` 单体子包拆为 3 个独立子包，gateway 是**进程**，toolkit / pf-skills 是**库**，由 gateway `main.ts` 注入式装配。库本身不读 `process.env`，cfg 在 gateway 入口加载后注入，便于测试 + 多入口复用（未来 pf-cli 直接 import）。

### 1.1 lark-gateway（入站进程）

```
apps/lark-gateway/
├── package.json                # file: ../lark-toolkit + file: ../pf-skills
├── tsconfig.json
├── .env.example                # 4 字段 + 模式开关
├── README.md
├── src/
│   ├── main.ts                 # 入口；loadConfig → createToolkit → createSkillDispatcher → buildEventDispatcher → wsClient.start
│   ├── ws-client.ts            # 仅 WSClient 构造（原 lark-client.ts 的入站部分）
│   ├── event-router.ts         # EventDispatcher.register，注入 { toolkit, skills }
│   ├── message-handler.ts      # @机器人检测 + 提取症状 + 调 skills.dispatch + 调 toolkit.reply
│   ├── config.ts               # 入站 env zod 校验（APP_ID / APP_SECRET / BOT_OPEN_ID / DOMAIN + SKILL_MODE）
│   └── logger.ts
└── test/
    └── message-handler.test.ts # 不打飞书网络；toolkit + skills 用 mock 注入
```

**职责**：长连接订阅 + 事件分发 + 业务编排。不直接调 SDK 出站 API，不直接拼 mock 文案——全部委派到 toolkit / pf-skills。

### 1.2 lark-toolkit（出站门面库）

```
apps/lark-toolkit/
├── package.json                # @probeflash/lark-toolkit
├── tsconfig.json
├── src/
│   ├── index.ts                # createToolkit(cfg) → Toolkit { reply, (future) sendCard, writeBitable, ... }
│   ├── sdk-client.ts           # in-process SDK 调用包装（3 秒 ack 路径）
│   ├── cli-bridge.ts           # execa shell out 到 `lark api <method>`；启动时懒检查 `lark --version` ≥ 1.x；错误归一化
│   ├── boundary.ts             # route(method) → 'sdk' | 'cli'；白名单：im.v1.message.create → sdk，其他默认 cli
│   └── types.ts
└── test/                       # boundary 白名单 + sdk-client + cli-bridge 单测（不打飞书网络、不打真 lark-cli）
```

**boundary.route 工作原理**：每个 toolkit 方法内部把"飞书 OpenAPI method 字符串"喂给 `boundary.route(method)`，命中 `'sdk'` → 走 `sdkReply(client, args)`（in-process，~ms 级延迟，3 秒 ack 安全）；命中 `'cli'` → 走 `cliApi(method, payload)`（fork lark-cli，~50ms+，仅用于异步出站 / 卡片 / 多维表 / OAuth 等非 ack 路径）。判定问句：能否在 3 秒 ack 窗内完成 → SDK；否 → CLI。业务层不感知差异。

### 1.3 pf-skills（业务 skill 库）

```
apps/pf-skills/
├── package.json                # @probeflash/pf-skills；零运行时依赖
├── tsconfig.json
├── src/
│   ├── index.ts                # createSkillDispatcher(cfg) → SkillDispatcher { dispatch(symptom) }
│   ├── types.ts                # SkillReply / SkillMode
│   └── debug-checklist/
│       ├── index.ts            # mode 分支（mock | claude | deepseek）
│       ├── mock.ts             # mockChecklist 文案行为契约（从原 lark-gateway/skill-dispatcher.ts 迁移）
│       ├── claude.ts           # stub，throw not implemented
│       └── deepseek.ts         # stub
└── test/
```

**模式调度**：`createSkillDispatcher({ mode })` 在构造时 closure 捕获 mode；后续 `dispatch(symptom)` 单参调用即可。mock 模式纯本地字符串拼接（远在 3 秒 ack 内）；claude / deepseek 抛 not implemented，备赛期默认 mock。

### 1.4 包间装配（file: 依赖）

`apps/lark-gateway/package.json` 通过 `"@probeflash/lark-toolkit": "file:../lark-toolkit"` + `"@probeflash/pf-skills": "file:../pf-skills"` 装配。`main.ts` 启动顺序：

```typescript
const cfg = loadConfig();
const toolkit = createToolkit({ /* sdk creds + cli opts */ });
const skills  = createSkillDispatcher({ mode: cfg.PROBEFLASH_SKILL_MODE });
const wsClient = createWsClient(cfg);
const dispatcher = buildEventDispatcher(cfg, toolkit, skills);
wsClient.start({ eventDispatcher: dispatcher });
```

**关键约束**：库本身**不**读 `process.env` — 由 gateway 入口读 .env 后构造 cfg 注入。未来 `pf-cli/` 直接 `import { createToolkit, createSkillDispatcher }`，不感知 WSS。三包分别有自己的 `npm run verify:all`；三包独立 commit 落地（M1 → M2 → M3）。

## 2. 接口契约

### 2.1 配置层（`config.ts`）

```typescript
import { z } from 'zod';

const ConfigSchema = z.object({
  LARK_APP_ID: z.string().min(1, 'LARK_APP_ID required'),
  LARK_APP_SECRET: z.string().min(1, 'LARK_APP_SECRET required'),
  LARK_BOT_OPEN_ID: z.string().min(1, 'LARK_BOT_OPEN_ID required (for @bot detection)'),
  LARK_DOMAIN: z.enum(['feishu', 'lark']).default('feishu'),
  PROBEFLASH_SKILL_MODE: z.enum(['mock', 'claude', 'deepseek']).default('mock'),
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(): Config {
  const parsed = ConfigSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error('[config] invalid env:', parsed.error.issues);
    process.exit(1);
  }
  return parsed.data;
}
```

**字段说明**：
- `LARK_APP_ID` / `LARK_APP_SECRET`：飞书后台创建应用后给的两个值；Long Connection 模式不需要 encrypt_key / verification_token（D-020 §4 + SDK 文档已说明）。
- `LARK_BOT_OPEN_ID`：机器人自己的 open_id，用于在 `mentions[]` 里识别 "@机器人" 触发；飞书后台创建应用时可拿到。
- `LARK_DOMAIN`：`feishu`（国内）或 `lark`（海外），默认 `feishu`。
- `PROBEFLASH_SKILL_MODE`：备赛期默认 `mock`；用户配置 `ANTHROPIC_API_KEY` 后改 `claude`，配置 `DEEPSEEK_API_KEY` 后改 `deepseek`。

**安全边界**：
- `loadConfig()` 不打印任何 secret 字段（错误信息只说"required"，不回显值）
- AI / Skill 不读 `.env`；用户线下用 `cp .env.example .env` 后手动填值

### 2.2 出站门面（`lark-toolkit`）

```typescript
// apps/lark-toolkit/src/index.ts
import type { ToolkitConfig, Toolkit, SendReplyArgs } from './types';

export function createToolkit(cfg: ToolkitConfig): Toolkit;

export interface Toolkit {
  reply(args: SendReplyArgs): Promise<void>;
  // 未来扩展接口位（首版未实现）：
  // sendCard(args): Promise<void>;
  // writeBitable(args): Promise<void>;
  // createGroup(args): Promise<void>;
}
```

**构造时 cfg 捕获**：`createToolkit(cfg)` 在 closure 内捕获 SDK 凭证 + lark-cli 配置；返回的 `Toolkit` 对外接口**只接业务参数**（如 `reply({ chatId, replyToMessageId, text })`），调用方不再每次传 cfg。

**boundary 分流**：`reply` 内部调 `boundary.route('im.v1.message.create')` → 命中 `'sdk'` 走 `sdkReply(client, args)`（3 秒 ack 路径）。其他未来方法（sendCard / writeBitable / ...）走 `'cli'`，进 `cliApi(method, payload)`。白名单见 `apps/lark-toolkit/src/boundary.ts`。

### 2.3 业务 skill 调度（`pf-skills`）

```typescript
// apps/pf-skills/src/index.ts
import type { SkillDispatcherConfig, SkillDispatcher, SkillReply } from './types';

export function createSkillDispatcher(cfg: SkillDispatcherConfig): SkillDispatcher;

export interface SkillDispatcher {
  dispatch(symptom: string): Promise<SkillReply>;
}

export interface SkillReply {
  kind: 'checklist' | 'mock' | 'error' | 'help';
  text: string;
}
```

**构造时 mode 捕获**：`createSkillDispatcher({ mode: 'mock' | 'claude' | 'deepseek' })` 在 closure 内捕获 mode；`dispatch(symptom)` 单参调用。mock 模式纯本地字符串拼接（行为契约从原 lark-gateway/skill-dispatcher.ts byte-for-byte 迁移），claude / deepseek 抛 not implemented。

### 2.4 事件路由 + 消息处理（`lark-gateway`）

```typescript
// apps/lark-gateway/src/event-router.ts
import * as lark from '@larksuiteoapi/node-sdk';
import type { Toolkit } from '@probeflash/lark-toolkit';
import type { SkillDispatcher } from '@probeflash/pf-skills';
import type { Config } from './config';
import { handleMessage } from './message-handler';

export function buildEventDispatcher(
  cfg: Config,
  toolkit: Toolkit,
  skills: SkillDispatcher,
): lark.EventDispatcher {
  return new lark.EventDispatcher({}).register({
    'im.message.receive_v1': async (data) => {
      try {
        await handleMessage(data, cfg, { toolkit, skills });
      } catch (err) {
        console.error('[event] handler error', err);
        // 静默吞掉异常以保证 3 秒内 ack；详细错误已记日志
      }
    },
  });
}
```

```typescript
// apps/lark-gateway/src/message-handler.ts
import type { Config } from './config';
import type { Toolkit } from '@probeflash/lark-toolkit';
import type { SkillDispatcher } from '@probeflash/pf-skills';

interface LarkMessageEvent { /* 同前：chat_id / message_id / message_type / content / mentions / sender */ }

export async function handleMessage(
  data: LarkMessageEvent,
  cfg: Config,
  deps: { toolkit: Toolkit; skills: SkillDispatcher },
): Promise<void> {
  // 1. 非 text → drop
  // 2. 非 @bot → drop
  // 3. strip @ 标签得 symptom
  // 4. symptom 为空 → deps.toolkit.reply({ kind:'help', ... })
  // 5. deps.skills.dispatch(symptom) → SkillReply
  // 6. deps.toolkit.reply({ chatId, replyToMessageId, text: reply.text })
}
```

**契约要点**：
- handler 不再 import 任何 SDK Client、不再直接拼 mock 文案；全部委派到 `deps.toolkit` / `deps.skills`
- handler 必须 **3 秒内返回**（SDK 内置 ack）；mock 模式实测远在 50ms 内
- 异常必须捕获并降级；不允许冒泡到 SDK 引起连接断

### 2.5 入口（`main.ts`）

```typescript
// apps/lark-gateway/src/main.ts
import 'dotenv/config';
import { loadConfig } from './config';
import { createWsClient } from './ws-client';
import { buildEventDispatcher } from './event-router';
import { createToolkit } from '@probeflash/lark-toolkit';
import { createSkillDispatcher } from '@probeflash/pf-skills';

async function main() {
  const cfg = loadConfig();
  const toolkit = createToolkit({
    appId: cfg.LARK_APP_ID,
    appSecret: cfg.LARK_APP_SECRET,
    domain: cfg.LARK_DOMAIN,
  });
  const skills = createSkillDispatcher({ mode: cfg.PROBEFLASH_SKILL_MODE });
  const wsClient = createWsClient(cfg);
  const dispatcher = buildEventDispatcher(cfg, toolkit, skills);

  console.log(`[main] starting lark-gateway in ${cfg.PROBEFLASH_SKILL_MODE} mode...`);
  wsClient.start({ eventDispatcher: dispatcher });
}

main().catch((err) => {
  console.error('[main] fatal:', err);
  process.exit(1);
});
```

**装配链**：`loadConfig → createToolkit → createSkillDispatcher → createWsClient → buildEventDispatcher → wsClient.start`。库（toolkit / skills）的 cfg 在构造时一次性注入；handler 注入依赖；gateway 自身只持有 WSS 长连接与 EventDispatcher。

## 3. 数据流

三包架构下的调用链（D-022 后）：

```
[WSS event] → event-router → handleMessage(data, cfg, { toolkit, skills })
                                     │
                                     ├─ skills.dispatch(symptom) → SkillReply
                                     │
                                     └─ toolkit.reply({ chatId, replyToMessageId, text })
                                             │
                                             └─ boundary.route('im.v1.message.create')
                                                     │
                                                     ├─ 'sdk' → sdkReply(client, args)
                                                     └─ 'cli' → cliApi('im.v1.message.create', payload)
```

**关键变化（对比 v1）**：
- handler **不再直接 import SDK Client**；调用 `deps.toolkit.reply(...)`，由 toolkit 内部决定走 SDK 还是 lark-cli
- 3 秒 ack 路径默认命中 `boundary.route(...) === 'sdk'`，走 in-process `sdkReply`；卡片 / 多维表 / 建群等异步出站会命中 `'cli'`，走 `cliApi`（fork lark-cli，~50ms+）
- pf-skills 与 lark-toolkit 互不感知；都通过 gateway 入口装配

完整跨进程流（含飞书侧）：

```
 飞书 App 后台          飞书 IM 后端                lark-gateway 进程            lark-toolkit (库)       pf-skills (库)
 (用户线下注册)              │                          (本节代码)                 (in-process)             (in-process)
      │                       │                            │                            │                       │
      │  WSS（鉴权）         │                            │                            │                       │
      └───────────────────►  │  ←─── wsClient.start() ────┤                            │                       │
                              │                            │                            │                       │
   群内 "@机器人 自动        │                            │                            │                       │
   跑点又歪了"               │                            │                            │                       │
              │              │                            │                            │                       │
              ▼              │                            │                            │                       │
       事件 im.message.receive_v1                         │                            │                       │
              │              │                            │                            │                       │
              └──────WSS 长连接推送─────────────────►    │                            │                       │
                                                          │                            │                       │
                                          EventDispatcher                              │                       │
                                                  │                                    │                       │
                                                  ▼                                    │                       │
                                       message-handler ─── skills.dispatch(symptom) ───┼──────────────────────►│
                                       ├─ 非 text? → drop                              │                       │
                                       ├─ 非 @bot? → drop                              │                       │  mock：合成 stub
                                       └─ strip @标签                                  │                       │  (claude/deepseek: throw)
                                                  │                                    │                       │
                                                  │◄─────── SkillReply ────────────────┼───────────────────────┘
                                                  │                                    │
                                                  └────── toolkit.reply(args) ────────►│
                                                                                       │
                                                                                       ▼
                                                                              boundary.route(method)
                                                                                  │
                                                                                  ├─ 'sdk' → sdkReply → SDK Client → im.v1.message.create
                                                                                  └─ 'cli' → cliApi → execa(lark api ...)
                                                                                       │
                                          ◄──────────────────HTTPS───────────────────┤
              ▼              │                            │
     飞书群内显示回复       │                            │
```

## 4. 错误模型

| 错误类别 | 触发场景 | 处理策略 | 用户可见度 |
|----------|----------|----------|------------|
| 网络断 | WSS 连接中断 | SDK 自动重连（指数退避） | 短暂中断后自动恢复，不主动通知 |
| Token 过期 | `tenant_access_token` 2h 后失效 | SDK 自动刷新 | 透明 |
| 消息发送失败 | `im.message.create` 抛错（限流 / 网络） | 单次重试 1 次（间隔 1s），仍失败记日志放弃 | 用户看到的是机器人未回复 |
| Handler 异常 | message-handler 内部 throw | event-router 捕获 + 记日志 + 静默吞 | 机器人未回复，下一条 @ 仍能正常处理 |
| 3 秒 ack 超时 | 同步处理过长 | 把耗时任务移到 `setImmediate` / Promise.resolve().then() 异步链；同步函数立即返回 | 飞书重推 → 重复消息，需后续去重 |
| 配置缺失 | 启动时 .env 字段缺 | `loadConfig` 直接 `process.exit(1)` 并打印 zod issues | 进程不启动，用户看启动日志 |
| @机器人但消息为空 | 用户只 @ 没说话 | 回复"@我 + 一句调试症状"帮助语 | 直接帮助 |
| Skill mode 未实现 | mode=claude/deepseek but unimplemented | skills.dispatch 抛错 → handler 捕获 → 不回复 | 机器人不回复（应在 MVP 阶段保持 mode=mock） |

**3 秒 ack 边界的真实处理**（MVP 不踩雷）：
- mock 模式纯本地字符串拼接，远在 3 秒内（实测应在 50ms 内）
- 后续接入 claude/deepseek 时必须改异步：handler 立即返回 → setImmediate(async () => { ... await llm.call(); await reply; })。否则飞书会重推同一条消息，产生重复回复。

## 5. 凭证管理与安全边界

### 5.1 .env 字段（用户线下注入）

`apps/lark-gateway/.env`（**不入仓库**，`apps/lark-gateway/.gitignore` 覆盖）：

```bash
LARK_APP_ID=cli_xxxxx
LARK_APP_SECRET=xxxxx
LARK_BOT_OPEN_ID=ou_xxxxx
LARK_DOMAIN=feishu
PROBEFLASH_SKILL_MODE=mock
```

`apps/lark-gateway/.env.example`（**入仓库**，字段示意）：

```bash
LARK_APP_ID=
LARK_APP_SECRET=
LARK_BOT_OPEN_ID=
LARK_DOMAIN=feishu
PROBEFLASH_SKILL_MODE=mock
# When ready, add provider keys to enable real checklist generation:
# ANTHROPIC_API_KEY=sk-ant-xxx   # then set PROBEFLASH_SKILL_MODE=claude
# DEEPSEEK_API_KEY=sk-xxx        # then set PROBEFLASH_SKILL_MODE=deepseek
```

### 5.2 .gitignore 规则

在 `apps/lark-gateway/.gitignore` 加：

```
.env
.env.*
!.env.example
```

仓库根级 `.gitignore` 也保留对 `*.env` 的覆盖（已存在）。

### 5.3 AI / Skill 行为约束（AGENTS.md §3 全文生效）

- AI 不读 `apps/lark-gateway/.env`
- AI 不要求用户粘贴 key
- AI 不在 README / planning / 日志 / commit message 中写入 key
- LARK-03 实现时只 import `process.env.LARK_*`，不直接 `fs.readFile('.env')`
- 真实 provider smoke 由用户本地执行

## 6. 部署形态

### 6.1 本地开发 / 备赛期自用
- Node 20+（与 v0.3 desktop / server 同一 Node 版本基线）
- TypeScript 5.x
- 启动：`cd apps/lark-gateway && npm install && npm run dev`
- 不需要公网 IP、不需要端口暴露（Long Connection 主动出站 WSS）
- 可跑在 WSL2 / Mac / Linux / 任何能 npm install 的机器
- 进程退出后机器人离线；重启即恢复

### 6.2 战队服务器（备赛期可选）
- 同上 npm install + npm run dev / npm start
- 若需后台常驻：用 tmux / screen / nohup（不强求 systemd，避免触碰 AGENTS.md §8 禁止项）
- **不**部署到 80/443 端口；不写 `/opt`；不动现有 v0.3 server

### 6.3 集群行为（重要 SDK 约束）
- 飞书 Long Connection **不广播**：同一应用部署多实例时只有 1 个随机收到消息
- MVP 不考虑多实例；战队服务器跑一个就够

## 7. 与现有 ProbeFlash 仓库的耦合

- 新建三个子包 `apps/lark-gateway/` / `apps/lark-toolkit/` / `apps/pf-skills/`，与 `apps/desktop` / `apps/server` 并列
- 三包间通过 `file:` 协议装配（`lark-gateway/package.json` 引用 `file:../lark-toolkit` + `file:../pf-skills`）
- 根级 `package.json` 已有 workspaces 配置（v0.3 设置），三个新子包加进去
- **不动** v0.3 冻结代码（D-018）：`apps/desktop` / `apps/server` 不引用 lark-* 任一包，反之亦然
- 引用 `.agents/skills/debug-checklist/SKILL.md`：仅在 `PROBEFLASH_SKILL_MODE=claude/deepseek` 时读取 prompt 模板（MVP mock 模式不读，后续 provider 实现时再加）
- TypeScript 配置独立：三包各自的 `tsconfig.json`；可继承根级 `tsconfig.base.json` 如存在

## 8. 测试策略（MVP 范围）

### 8.1 单元测试
- `message-handler.test.ts`：
  - 非 text 消息 → 不调用 toolkit.reply
  - 非 @机器人 消息 → 不调用 toolkit.reply
  - @机器人空内容 → 调用 toolkit.reply with kind='help'
  - @机器人有内容 → 调用 skills.dispatch + toolkit.reply
  - `stripMention` 单元用例
- 不打飞书网络，所有外部依赖（`Toolkit`、`SkillDispatcher`）通过 mock 注入

### 8.2 集成测试（备赛期不强制）
- 真实飞书连通性测试 = "真实 provider smoke" 范畴 → 由用户线下完成
- 检查项写在 `docs/research/lark-onboard-guide.md`（LARK-ONBOARD-GUIDE 任务交付）

### 8.3 npm scripts
- `npm run dev`：tsx 运行 `src/main.ts`（开发热重载可选）
- `npm run build`：tsc 输出到 `dist/`
- `npm start`：node `dist/main.js`
- `npm test`：vitest 跑 `test/**/*.test.ts`
- `npm run typecheck`：tsc --noEmit
- `npm run verify:all`：typecheck + test + build

## 9. 未来扩展（备赛后或本期有余力时）

按 D-021 "先接进去看看，有问题或者有时间再去优化" + D-022 "boundary 分流" 原则，**MVP 阶段不做**以下，但保留扩展点。「实现通道」列指明该能力将走 SDK（boundary 命中 `'sdk'`，3 秒 ack 路径）还是 lark-cli（boundary 命中 `'cli'`，异步出站路径，~50ms+ fork）：

| 扩展 | 实现通道 | 触发条件 | 改动范围 |
|------|----------|---------|----------|
| 同步回复 / @bot ack 路径 | **SDK** (boundary → `'sdk'`) | 默认主路径（已实现） | lark-toolkit/sdk-client.ts |
| 真实 LLM 接入（claude / deepseek） | — | 用户配置 provider key | pf-skills/debug-checklist/{claude,deepseek}.ts 实装 + 读 SKILL.md 模板 |
| 卡片消息回复（markdown 富文本） | **lark-cli** (boundary → `'cli'`) | UI 体验需求 | lark-toolkit 加 `sendCard` 方法 → cliApi('im.v1.message.create' card payload) |
| 飞书 thread 模式回复 | SDK | 群内对话上下文 | lark-toolkit reply 加 `reply_in_thread` 参数 |
| 多维表写入 | **lark-cli** | 状态看板 / 阻塞表同步 | lark-toolkit 加 `writeBitable` 方法 → cliApi('bitable.v1.app.table.record.create') |
| 建群 / 拉成员 | **lark-cli** | 项目临时讨论组 | lark-toolkit 加 `createGroup` / `addMember` 方法 → cliApi |
| 用户授权 OAuth | **lark-cli** | 接入个人身份能力 | lark-toolkit 加 oauth 子模块 → 调 `lark auth login` 流程 |
| 切换 Webhook 模式 | SDK | 公网 IP 已就绪、需多实例集群 | gateway main.ts 替换 wsClient 为 lark.adaptExpress + 加 express |
| 写入 `.debug-archive/` | 本地 | dogfood 数据沉淀 | gateway 加 archive-writer.ts，message-handler 调用 |
| 多 skill 路由 | 本地 | 不止 debug-checklist | message-handler 加 intent 解析（关键词触发） |
| 富媒体消息（图片 / 文件） | SDK 或 lark-cli | 调试截图直接发群 | message-handler.message_type 分支 + lark-toolkit 加对应方法 |

**判定原则**：能否在 3 秒 ack 窗口完成 → SDK；否（卡片 / 多维表 / 建群 / OAuth 等异步出站）→ lark-cli。新增能力时只动 `apps/lark-toolkit/`，gateway / pf-skills 无需感知。详见 D-022 §2.2 硬规则。

## 10. 验收标准（对 LARK-03-MIN-INTEGRATION 代码任务）

LARK-03 代码部分完成的标志：
1. `apps/lark-gateway/` 子包结构按 §1 落地
2. `npm install` 成功（含 `@larksuiteoapi/node-sdk` + `zod` + `dotenv` + dev: `vitest` + `tsx` + `typescript`）
3. `npm run typecheck` 通过
4. `npm run build` 通过
5. `npm test` 通过（§8.1 单元测试）
6. `npm run dev` 在缺 .env 时 zod 报错 + 退出（验证 config 边界）
7. `.env.example` + `.gitignore` 入仓库；`.env` **不入** 仓库
8. **不引入**任何 LLM provider 依赖（claude / deepseek SDK 不 install）
9. **不调** 真实飞书 API（开发者后台未注册、.env 未填的状态下，typecheck/build/test 全部能跑过）

真实飞书连通验证：由 LARK-ONBOARD-GUIDE 任务说明用户线下完成。

## 11. 关联文档

- `docs/research/lark-api-capability.md`（D-020）— 飞书 API 能力事实底座
- `docs/research/lark-oss-candidates.md`（D-020 后续）— SDK 选型证据链
- `docs/planning/decisions.md` D-021 — 路径 A 拍板与约束
- `docs/planning/decisions.md` D-022 — lark-cli 接入 + 三包拆分（本文 v2 的 ADR 依据）
- `docs/superpowers/specs/2026-05-21-lark-cli-integration-design.md` — D-022 落地 spec（含包布局 + 硬规则 + §3 对齐细则）
- `docs/archive/pre-pivot-plans/2026-05-21-lark-cli-integration.md` — LARK-CLI-01..06 执行计划
- `docs/archive/pre-pivot-plans/2026-05-16-lark-gateway.md`（forward-looking，**未激活**）— 历史路径 B 计划，本期不参考
- `.agents/skills/debug-checklist/SKILL.md` — 检查清单生成 skill（mock 模式不读，provider 模式读 prompt 模板）

---

设计版本：v2（status: stable，D-022 拍板）。v1（2026-05-19 draft）单体 lark-gateway 已被 v2 三包架构（gateway 入站进程 + lark-toolkit 出站门面 + pf-skills 业务调度）取代。后续接口偏差回头更新本文件。
