# lark-cli Integration Implementation Plan

```yaml
status: active
date: 2026-05-21
spec: docs/superpowers/specs/2026-05-21-lark-cli-integration-design.md
decisions: [D-021, D-022]
related_tasks: [LARK-CLI-01, LARK-CLI-02, LARK-CLI-03, LARK-CLI-04, LARK-CLI-05, LARK-CLI-06]
```

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 接入飞书官方 CLI `@larksuite/cli` 作为出站 + 配置 + 诊断能力补充入口，同时把 `apps/lark-gateway/` 按"入站进程 / 出站门面库 / 业务 skill 库"拆为 3 个独立子包，落地 ADR D-022 + 文档同步。

**Architecture:** 新建 `apps/lark-toolkit/`（出站门面：内部按 `boundary.route(method)` 分流 SDK in-process 或 shell out 到 lark-cli）+ `apps/pf-skills/`（业务 skill 调度：debug-checklist mock 模式 + claude/deepseek stub）；`apps/lark-gateway/` 瘦身为纯入站进程，通过 `file:` 依赖装配两个新包。docs 侧落 D-022 ADR + lark-connector.md v2 + onboard guide 改写 + dev usage 新建 + AGENTS.md §2/§3/§7 同步。

**Tech Stack:** TypeScript 5.x ESM、Node 20+、`@larksuiteoapi/node-sdk`（入站 + SDK 出站）、`@larksuite/cli`（外部全局安装，shell out 用）、`execa` ^9.x（子进程包装）、`zod`（配置校验）、`vitest`（单测）、`tsx`（dev）。

**Spec:** `docs/superpowers/specs/2026-05-21-lark-cli-integration-design.md`

**任务并行度：** T1 ∥ T2 ∥ T4 ∥ T6 → T3 → T5（6 个原子任务时段）

---

## 文件结构总览

```
apps/
├── lark-toolkit/                          [NEW PACKAGE]
│   ├── package.json
│   ├── tsconfig.json
│   ├── tsconfig.test.json
│   ├── README.md
│   ├── .gitignore                         (node_modules / dist)
│   ├── src/
│   │   ├── types.ts                       (Toolkit / ToolkitConfig / SendReplyArgs / CliBridgeError)
│   │   ├── boundary.ts                    (route(method) → 'sdk' | 'cli')
│   │   ├── sdk-client.ts                  (createSdkClient + sdkReply)
│   │   ├── cli-bridge.ts                  (cliApi + ensureLarkCli 懒检查)
│   │   └── index.ts                       (createToolkit)
│   └── test/
│       ├── boundary.test.ts
│       ├── sdk-client.test.ts
│       ├── cli-bridge.test.ts
│       └── index.test.ts
│
├── pf-skills/                             [NEW PACKAGE]
│   ├── package.json
│   ├── tsconfig.json
│   ├── tsconfig.test.json
│   ├── README.md
│   ├── .gitignore
│   ├── src/
│   │   ├── types.ts                       (SkillReply / SkillMode / SkillDispatcher)
│   │   ├── debug-checklist/
│   │   │   ├── mock.ts                    (mockChecklist)
│   │   │   ├── claude.ts                  (stub throws)
│   │   │   ├── deepseek.ts                (stub throws)
│   │   │   └── index.ts                   (dispatchDebugChecklist by mode)
│   │   └── index.ts                       (createSkillDispatcher)
│   └── test/
│       ├── mock.test.ts
│       ├── stubs.test.ts
│       └── index.test.ts
│
└── lark-gateway/                          [MODIFY - SLIM]
    ├── package.json                       (+ file: deps to lark-toolkit + pf-skills)
    ├── src/
    │   ├── main.ts                        (rewire to use toolkit + skills)
    │   ├── ws-client.ts                   [NEW] (extracted WSClient from lark-client.ts)
    │   ├── lark-client.ts                 [DELETE]
    │   ├── reply-sender.ts                [DELETE - moved to toolkit]
    │   ├── skill-dispatcher.ts            [DELETE - moved to pf-skills]
    │   ├── event-router.ts                [MODIFY - inject toolkit + skills]
    │   ├── message-handler.ts             [MODIFY - use toolkit.reply + skills.dispatch]
    │   ├── config.ts                      [KEEP]
    │   ├── types.ts                       [KEEP - shrink: only LarkMessageEvent stays here]
    │   └── logger.ts                      [KEEP]
    └── test/
        ├── message-handler.test.ts        [MODIFY - mock toolkit + skills]
        ├── skill-dispatcher.test.ts       [DELETE - migrated to pf-skills]
        └── config.test.ts                 [KEEP]

docs/
├── planning/
│   ├── decisions.md                       [MODIFY - append D-022]
│   ├── roadmap.md                         [MODIFY - §9 annotation]
│   └── now.md                             [MODIFY - planning sync each task]
├── design/
│   └── lark-connector.md                  [MODIFY - integral rewrite v2]
├── research/
│   ├── lark-onboard-guide.md              [MODIFY - §1-§5 rewrite + keep fallback]
│   └── lark-cli-dev-usage.md              [NEW]
└── superpowers/plans/
    └── 2026-05-21-lark-cli-integration.md [THIS PLAN]

AGENTS.md                                  [MODIFY - §2 / §3 / §7]
```

---

## Task 1: LARK-CLI-01 — 新建 `apps/lark-toolkit/`

**Files:**
- Create: `apps/lark-toolkit/package.json`
- Create: `apps/lark-toolkit/tsconfig.json`
- Create: `apps/lark-toolkit/tsconfig.test.json`
- Create: `apps/lark-toolkit/.gitignore`
- Create: `apps/lark-toolkit/README.md`
- Create: `apps/lark-toolkit/src/types.ts`
- Create: `apps/lark-toolkit/src/boundary.ts`
- Create: `apps/lark-toolkit/src/sdk-client.ts`
- Create: `apps/lark-toolkit/src/cli-bridge.ts`
- Create: `apps/lark-toolkit/src/index.ts`
- Test: `apps/lark-toolkit/test/boundary.test.ts`
- Test: `apps/lark-toolkit/test/sdk-client.test.ts`
- Test: `apps/lark-toolkit/test/cli-bridge.test.ts`
- Test: `apps/lark-toolkit/test/index.test.ts`

### Step 1.1: 立包骨架（package.json + tsconfig × 2 + .gitignore）

- [ ] **写 `apps/lark-toolkit/package.json`：**

```json
{
  "name": "@probeflash/lark-toolkit",
  "private": true,
  "version": "0.0.1",
  "description": "ProbeFlash 出站统一门面：按 boundary.route 分流 SDK in-process 或 shell out 到 lark-cli",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc --noEmit -p tsconfig.json && tsc --noEmit -p tsconfig.test.json",
    "test": "vitest run",
    "test:watch": "vitest",
    "verify:all": "npm run typecheck && npm run test && npm run build"
  },
  "dependencies": {
    "@larksuiteoapi/node-sdk": "^1.42.0",
    "execa": "^9.5.0"
  },
  "devDependencies": {
    "@types/node": "^20.11.0",
    "typescript": "^5.3.0",
    "vitest": "^1.2.0"
  }
}
```

- [ ] **写 `apps/lark-toolkit/tsconfig.json`：**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "Bundler",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "resolveJsonModule": true,
    "verbatimModuleSyntax": true
  },
  "include": ["src/**/*"]
}
```

- [ ] **写 `apps/lark-toolkit/tsconfig.test.json`：**

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": true,
    "rootDir": "."
  },
  "include": ["src/**/*", "test/**/*"]
}
```

- [ ] **写 `apps/lark-toolkit/.gitignore`：**

```
node_modules
dist
*.tsbuildinfo
```

- [ ] **写 `apps/lark-toolkit/README.md`：**

```markdown
# @probeflash/lark-toolkit

ProbeFlash 出站统一门面。按 `boundary.route(method)` 内部分流：

- `'sdk'` → in-process `@larksuiteoapi/node-sdk` 调用（3 秒 ack 路径，如回 @机器人）
- `'cli'` → `execa` shell out 到 `@larksuite/cli`（非 3 秒 ack / 写入 / 配置 / 诊断）

## 公共 API

```typescript
import { createToolkit } from '@probeflash/lark-toolkit';

const toolkit = createToolkit({
  larkAppId: process.env.LARK_APP_ID!,
  larkAppSecret: process.env.LARK_APP_SECRET!,
  larkDomain: 'feishu',
});

await toolkit.reply({
  chatId: 'oc_xxx',
  replyToMessageId: 'om_xxx',
  text: '收到',
});
```

## 外部依赖

- `@larksuiteoapi/node-sdk` ^1.42.0（npm 安装，随 package.json）
- `@larksuite/cli` >= 1.0.0（**用户全局安装**：`npm install -g @larksuite/cli`）。只在 `boundary.route` 命中 `'cli'` 时才需要；首次调用时 `cli-bridge.ts` 会跑 `lark --version` 校验。

## 安装

```bash
cd apps/lark-toolkit
npm install
npm run verify:all
```

详见仓库根 `docs/superpowers/specs/2026-05-21-lark-cli-integration-design.md` §3。
```

- [ ] **验证骨架可识别：**

Run: `cd apps/lark-toolkit && ls -la`
Expected: 看到 `package.json` / `tsconfig.json` / `tsconfig.test.json` / `.gitignore` / `README.md`

### Step 1.2: 写 `src/types.ts`

- [ ] **写 `apps/lark-toolkit/src/types.ts`：**

```typescript
export interface ToolkitConfig {
  larkAppId: string;
  larkAppSecret: string;
  larkDomain: 'feishu' | 'lark';
}

export interface SendReplyArgs {
  chatId: string;
  replyToMessageId: string;
  text: string;
}

export interface Toolkit {
  reply(args: SendReplyArgs): Promise<void>;
}

export class CliBridgeError extends Error {
  constructor(
    message: string,
    public exitCode: number | undefined,
    public stderr: string,
  ) {
    super(message);
    this.name = 'CliBridgeError';
  }
}
```

### Step 1.3: 写 `src/boundary.ts` + 测试（TDD）

- [ ] **先写测试 `apps/lark-toolkit/test/boundary.test.ts`：**

```typescript
import { describe, test, expect } from 'vitest';
import { route } from '../src/boundary';

describe('route', () => {
  test('im.v1.message.create → sdk (reply 同步 3 秒 ack 路径)', () => {
    expect(route('im.v1.message.create')).toBe('sdk');
  });

  test('bitable.v1.tables.create → cli (非 sdk 白名单走 CLI)', () => {
    expect(route('bitable.v1.tables.create')).toBe('cli');
  });

  test('im.v1.chat.create → cli (建群非 3 秒 ack 路径)', () => {
    expect(route('im.v1.chat.create')).toBe('cli');
  });

  test('未知 method → cli (默认走 CLI 兜底)', () => {
    expect(route('foo.bar.baz')).toBe('cli');
  });
});
```

- [ ] **跑测试看到 FAIL：**

Run: `cd apps/lark-toolkit && npx vitest run test/boundary.test.ts`
Expected: FAIL（`route` 未定义 / 文件不存在）

- [ ] **写实现 `apps/lark-toolkit/src/boundary.ts`：**

```typescript
export type Channel = 'sdk' | 'cli';

const SDK_METHODS = new Set<string>([
  'im.v1.message.create',
]);

export function route(method: string): Channel {
  return SDK_METHODS.has(method) ? 'sdk' : 'cli';
}
```

- [ ] **跑测试看到 PASS：**

Run: `cd apps/lark-toolkit && npx vitest run test/boundary.test.ts`
Expected: PASS（4/4）

### Step 1.4: 写 `src/sdk-client.ts` + 测试

- [ ] **先写测试 `apps/lark-toolkit/test/sdk-client.test.ts`：**

```typescript
import { describe, test, expect, vi } from 'vitest';
import { sdkReply } from '../src/sdk-client';
import type { Client } from '@larksuiteoapi/node-sdk';

describe('sdkReply', () => {
  test('calls client.im.v1.message.create with text payload', async () => {
    const create = vi.fn().mockResolvedValue({ data: {} });
    const client = {
      im: { v1: { message: { create } } },
    } as unknown as Client;

    await sdkReply(client, {
      chatId: 'oc_chat',
      replyToMessageId: 'om_msg',
      text: '收到',
    });

    expect(create).toHaveBeenCalledOnce();
    const arg = create.mock.calls[0][0];
    expect(arg.params).toEqual({ receive_id_type: 'chat_id' });
    expect(arg.data.receive_id).toBe('oc_chat');
    expect(arg.data.msg_type).toBe('text');
    expect(JSON.parse(arg.data.content)).toEqual({ text: '收到' });
  });

  test('propagates errors (caller handles retry)', async () => {
    const create = vi.fn().mockRejectedValue(new Error('boom'));
    const client = { im: { v1: { message: { create } } } } as unknown as Client;
    await expect(
      sdkReply(client, { chatId: 'a', replyToMessageId: 'b', text: 'c' }),
    ).rejects.toThrow('boom');
  });
});
```

- [ ] **跑测试看到 FAIL：**

Run: `cd apps/lark-toolkit && npx vitest run test/sdk-client.test.ts`
Expected: FAIL

- [ ] **写实现 `apps/lark-toolkit/src/sdk-client.ts`：**

```typescript
import * as lark from '@larksuiteoapi/node-sdk';
import type { Client } from '@larksuiteoapi/node-sdk';
import type { ToolkitConfig, SendReplyArgs } from './types.js';

export function createSdkClient(cfg: ToolkitConfig): Client {
  return new lark.Client({
    appId: cfg.larkAppId,
    appSecret: cfg.larkAppSecret,
    domain: cfg.larkDomain === 'lark' ? lark.Domain.Lark : lark.Domain.Feishu,
    appType: lark.AppType.SelfBuild,
  });
}

export async function sdkReply(
  client: Client,
  args: SendReplyArgs,
): Promise<void> {
  void args.replyToMessageId;
  await client.im.v1.message.create({
    params: { receive_id_type: 'chat_id' as const },
    data: {
      receive_id: args.chatId,
      msg_type: 'text',
      content: JSON.stringify({ text: args.text }),
    },
  });
}
```

- [ ] **跑测试看到 PASS：**

Run: `cd apps/lark-toolkit && npx vitest run test/sdk-client.test.ts`
Expected: PASS（2/2）

### Step 1.5: 写 `src/cli-bridge.ts` + 测试

- [ ] **先写测试 `apps/lark-toolkit/test/cli-bridge.test.ts`：**

```typescript
import { describe, test, expect, vi, beforeEach } from 'vitest';

vi.mock('execa', () => ({
  execa: vi.fn(),
}));

import { execa } from 'execa';
import {
  cliApi,
  ensureLarkCli,
  resetCliVersionCheck,
} from '../src/cli-bridge';
import { CliBridgeError } from '../src/types';

const execaMock = execa as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  execaMock.mockReset();
  resetCliVersionCheck();
});

describe('ensureLarkCli', () => {
  test('passes when lark --version reports >= MIN major', async () => {
    execaMock.mockResolvedValueOnce({ stdout: 'lark version 1.4.2' });
    await expect(ensureLarkCli()).resolves.toBeUndefined();
    expect(execaMock).toHaveBeenCalledWith('lark', ['--version']);
  });

  test('throws CliBridgeError when lark not on PATH', async () => {
    execaMock.mockRejectedValueOnce(
      Object.assign(new Error('command not found: lark'), { code: 'ENOENT' }),
    );
    await expect(ensureLarkCli()).rejects.toBeInstanceOf(CliBridgeError);
  });

  test('throws CliBridgeError when version below MIN', async () => {
    execaMock.mockResolvedValueOnce({ stdout: 'lark version 0.9.1' });
    await expect(ensureLarkCli()).rejects.toThrow(/required/);
  });

  test('only runs lark --version once across calls (cached)', async () => {
    execaMock.mockResolvedValueOnce({ stdout: 'lark version 1.4.2' });
    await ensureLarkCli();
    await ensureLarkCli();
    expect(execaMock).toHaveBeenCalledOnce();
  });
});

describe('cliApi', () => {
  test('shell-outs lark api <method> with --data JSON payload', async () => {
    execaMock.mockResolvedValueOnce({ stdout: 'lark version 1.4.2' });
    execaMock.mockResolvedValueOnce({ stdout: '{"ok":true,"id":"123"}' });
    const result = await cliApi<{ ok: boolean; id: string }>(
      'im.v1.chat.create',
      { name: 'debug' },
    );
    expect(result).toEqual({ ok: true, id: '123' });
    expect(execaMock).toHaveBeenLastCalledWith('lark', [
      'api',
      'im.v1.chat.create',
      '--data',
      '{"name":"debug"}',
    ]);
  });

  test('wraps execa failure into CliBridgeError with exitCode + stderr', async () => {
    execaMock.mockResolvedValueOnce({ stdout: 'lark version 1.4.2' });
    execaMock.mockRejectedValueOnce(
      Object.assign(new Error('cli boom'), {
        exitCode: 2,
        stderr: 'permission denied',
      }),
    );
    try {
      await cliApi('im.v1.chat.create', {});
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(CliBridgeError);
      expect((err as CliBridgeError).exitCode).toBe(2);
      expect((err as CliBridgeError).stderr).toBe('permission denied');
    }
  });
});
```

- [ ] **跑测试看到 FAIL：**

Run: `cd apps/lark-toolkit && npx vitest run test/cli-bridge.test.ts`
Expected: FAIL（`cli-bridge.ts` 不存在）

- [ ] **写实现 `apps/lark-toolkit/src/cli-bridge.ts`：**

```typescript
import { execa } from 'execa';
import { CliBridgeError } from './types.js';

const MIN_LARK_CLI_MAJOR = 1;

let versionPromise: Promise<void> | null = null;

export function resetCliVersionCheck(): void {
  versionPromise = null;
}

export async function ensureLarkCli(): Promise<void> {
  if (versionPromise) return versionPromise;
  versionPromise = (async () => {
    let stdout: string;
    try {
      const result = await execa('lark', ['--version']);
      stdout = result.stdout;
    } catch (err) {
      versionPromise = null;
      throw new CliBridgeError(
        'lark-cli not found on PATH. Install: npm install -g @larksuite/cli',
        undefined,
        (err as Error).message,
      );
    }
    const match = stdout.match(/(\d+)\.(\d+)\.(\d+)/);
    if (!match || Number(match[1]) < MIN_LARK_CLI_MAJOR) {
      versionPromise = null;
      throw new CliBridgeError(
        `lark-cli >= ${MIN_LARK_CLI_MAJOR}.x required, got "${stdout.trim()}"`,
        undefined,
        '',
      );
    }
  })();
  return versionPromise;
}

export async function cliApi<T = unknown>(
  method: string,
  payload: unknown,
): Promise<T> {
  await ensureLarkCli();
  const args = ['api', method, '--data', JSON.stringify(payload)];
  try {
    const { stdout } = await execa('lark', args);
    return JSON.parse(stdout) as T;
  } catch (err) {
    const e = err as { exitCode?: number; stderr?: string; message: string };
    throw new CliBridgeError(
      `lark api ${method} failed`,
      e.exitCode,
      e.stderr ?? e.message,
    );
  }
}
```

- [ ] **跑测试看到 PASS：**

Run: `cd apps/lark-toolkit && npx vitest run test/cli-bridge.test.ts`
Expected: PASS（6/6）

### Step 1.6: 写 `src/index.ts` + 集成测试

- [ ] **先写测试 `apps/lark-toolkit/test/index.test.ts`：**

```typescript
import { describe, test, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/sdk-client', () => ({
  createSdkClient: vi.fn(() => ({ tag: 'fake-client' })),
  sdkReply: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../src/cli-bridge', () => ({
  cliApi: vi.fn().mockResolvedValue({}),
  ensureLarkCli: vi.fn().mockResolvedValue(undefined),
  resetCliVersionCheck: vi.fn(),
}));

import { createToolkit } from '../src/index';
import { sdkReply } from '../src/sdk-client';
import { cliApi } from '../src/cli-bridge';

const cfg = {
  larkAppId: 'app',
  larkAppSecret: 'secret',
  larkDomain: 'feishu' as const,
};

beforeEach(() => {
  (sdkReply as ReturnType<typeof vi.fn>).mockClear();
  (cliApi as ReturnType<typeof vi.fn>).mockClear();
});

describe('createToolkit().reply', () => {
  test('routes reply (im.v1.message.create) to sdkReply', async () => {
    const toolkit = createToolkit(cfg);
    await toolkit.reply({
      chatId: 'oc_a',
      replyToMessageId: 'om_b',
      text: 'hi',
    });
    expect(sdkReply).toHaveBeenCalledOnce();
    expect(cliApi).not.toHaveBeenCalled();
  });
});
```

- [ ] **跑测试看到 FAIL：**

Run: `cd apps/lark-toolkit && npx vitest run test/index.test.ts`
Expected: FAIL

- [ ] **写实现 `apps/lark-toolkit/src/index.ts`：**

```typescript
import type { Toolkit, ToolkitConfig, SendReplyArgs } from './types.js';
import { route } from './boundary.js';
import { createSdkClient, sdkReply } from './sdk-client.js';
import { cliApi } from './cli-bridge.js';

export function createToolkit(cfg: ToolkitConfig): Toolkit {
  const sdkClient = createSdkClient(cfg);
  return {
    async reply(args: SendReplyArgs): Promise<void> {
      const channel = route('im.v1.message.create');
      if (channel === 'sdk') {
        await sdkReply(sdkClient, args);
      } else {
        await cliApi('im.v1.message.create', {
          receive_id_type: 'chat_id',
          receive_id: args.chatId,
          msg_type: 'text',
          content: JSON.stringify({ text: args.text }),
        });
      }
    },
  };
}

export type { Toolkit, ToolkitConfig, SendReplyArgs } from './types.js';
export { CliBridgeError } from './types.js';
```

- [ ] **跑测试看到 PASS：**

Run: `cd apps/lark-toolkit && npx vitest run test/index.test.ts`
Expected: PASS

### Step 1.7: install + verify + commit

- [ ] **安装依赖：**

Run: `cd apps/lark-toolkit && npm install`
Expected: 安装成功，无 peer dep 警告 about lark-sdk / execa / vitest

- [ ] **跑全套 verify：**

Run: `cd apps/lark-toolkit && npm run verify:all`
Expected: typecheck PASS；test PASS（≥ 12 个）；build PASS（dist/ 生成）

- [ ] **`git diff --check`：**

Run: `git diff --check apps/lark-toolkit/`
Expected: 无空白错误

- [ ] **commit：**

```bash
git add apps/lark-toolkit
git commit -m "$(cat <<'EOF'
feat(lark-toolkit): LARK-CLI-01 — 立出站统一门面子包

新增 apps/lark-toolkit/ 独立子包（@probeflash/lark-toolkit）。
- src: types / boundary / sdk-client / cli-bridge / index 5 文件
- boundary.route(method) 白名单：im.v1.message.create → sdk，其余 → cli
- sdk-client: in-process @larksuiteoapi/node-sdk reply 实现（3 秒 ack 路径）
- cli-bridge: execa shell out 到 lark api <method>；首次调用懒检查 lark --version >= 1.x
- index.createToolkit(cfg) 返回 { reply } 接口；卡片/多维表等后续扩展沿 cli 通道追加
- 单测 12+（boundary 4 + sdk-client 2 + cli-bridge 6 + index 1）；不打飞书网络，不打真 lark-cli
- README 写明用户全局装 @larksuite/cli 的约定

依据：docs/superpowers/specs/2026-05-21-lark-cli-integration-design.md §3 + §4.1 M1。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **更新 `now.md` planning sync（atomic-task 闭环）：**
  - `now.md.最近完成` 加 1 行：`2026-MM-DD LARK-CLI-01 lark-toolkit 子包落地：...`
  - 单独 commit：`docs(planning): now.md 同步 LARK-CLI-01 完成`

---

## Task 2: LARK-CLI-02 — 新建 `apps/pf-skills/`

**Files:**
- Create: `apps/pf-skills/package.json`
- Create: `apps/pf-skills/tsconfig.json`
- Create: `apps/pf-skills/tsconfig.test.json`
- Create: `apps/pf-skills/.gitignore`
- Create: `apps/pf-skills/README.md`
- Create: `apps/pf-skills/src/types.ts`
- Create: `apps/pf-skills/src/debug-checklist/mock.ts`
- Create: `apps/pf-skills/src/debug-checklist/claude.ts`
- Create: `apps/pf-skills/src/debug-checklist/deepseek.ts`
- Create: `apps/pf-skills/src/debug-checklist/index.ts`
- Create: `apps/pf-skills/src/index.ts`
- Test: `apps/pf-skills/test/mock.test.ts`
- Test: `apps/pf-skills/test/stubs.test.ts`
- Test: `apps/pf-skills/test/index.test.ts`

### Step 2.1: 立包骨架

- [ ] **写 `apps/pf-skills/package.json`：**

```json
{
  "name": "@probeflash/pf-skills",
  "private": true,
  "version": "0.0.1",
  "description": "ProbeFlash 业务 skill 调度（debug-checklist 起步；后续多 skill 路由）",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc --noEmit -p tsconfig.json && tsc --noEmit -p tsconfig.test.json",
    "test": "vitest run",
    "test:watch": "vitest",
    "verify:all": "npm run typecheck && npm run test && npm run build"
  },
  "dependencies": {},
  "devDependencies": {
    "@types/node": "^20.11.0",
    "typescript": "^5.3.0",
    "vitest": "^1.2.0"
  }
}
```

- [ ] **写 `apps/pf-skills/tsconfig.json`：** 同 lark-toolkit Step 1.1 模板，原样照搬。

- [ ] **写 `apps/pf-skills/tsconfig.test.json`：** 同 lark-toolkit Step 1.1 模板，原样照搬。

- [ ] **写 `apps/pf-skills/.gitignore`：** 同 lark-toolkit Step 1.1（`node_modules` / `dist` / `*.tsbuildinfo`）。

- [ ] **写 `apps/pf-skills/README.md`：**

```markdown
# @probeflash/pf-skills

ProbeFlash 业务 skill 调度库。首版只 ship `debug-checklist`（症状 → 检查清单）。

## 公共 API

```typescript
import { createSkillDispatcher } from '@probeflash/pf-skills';

const skills = createSkillDispatcher({ mode: 'mock' });
const reply = await skills.dispatch('自动跑点又歪了');
// → { kind: 'mock', text: '[mock 模式] ...' }
```

## Skill 模式

- `mock`（默认）：本地拼接文案，不调真实 LLM
- `claude`：当前 stub（throw not implemented）；接入真实 Claude provider 后实现
- `deepseek`：当前 stub；接入真实 DeepSeek provider 后实现

详见仓库根 `docs/superpowers/specs/2026-05-21-lark-cli-integration-design.md` §3。
```

### Step 2.2: 写 `src/types.ts`

- [ ] **写 `apps/pf-skills/src/types.ts`：**

```typescript
export type SkillMode = 'mock' | 'claude' | 'deepseek';

export interface SkillReply {
  kind: 'mock' | 'claude' | 'deepseek' | 'help' | 'error';
  text: string;
}

export interface SkillDispatcher {
  dispatch(symptom: string): Promise<SkillReply>;
}

export interface SkillDispatcherConfig {
  mode: SkillMode;
}
```

### Step 2.3: 写 `debug-checklist/mock.ts` + 测试（**文案 byte-for-byte 等价于现 lark-gateway 输出**）

- [ ] **先写测试 `apps/pf-skills/test/mock.test.ts`：**

```typescript
import { describe, test, expect } from 'vitest';
import { mockChecklist } from '../src/debug-checklist/mock';

describe('mockChecklist', () => {
  test('返回 kind=mock 且文案含症状原文', () => {
    const reply = mockChecklist('自动跑点又歪了');
    expect(reply.kind).toBe('mock');
    expect(reply.text).toContain('[mock 模式] 已收到症状：自动跑点又歪了');
  });

  test('文案含 PROBEFLASH_SKILL_MODE / provider key 指引', () => {
    const reply = mockChecklist('x');
    expect(reply.text).toContain('mode=mock');
    expect(reply.text).toContain('ANTHROPIC_API_KEY');
    expect(reply.text).toContain('DEEPSEEK_API_KEY');
    expect(reply.text).toContain('docs/research/lark-onboard-guide.md');
  });

  test('多行用 \\n 拼接（与原 lark-gateway/skill-dispatcher.ts 一致）', () => {
    const reply = mockChecklist('x');
    expect(reply.text.split('\n').length).toBeGreaterThanOrEqual(5);
  });
});
```

- [ ] **跑测试看到 FAIL：**

Run: `cd apps/pf-skills && npx vitest run test/mock.test.ts`
Expected: FAIL

- [ ] **写实现 `apps/pf-skills/src/debug-checklist/mock.ts`：**

```typescript
import type { SkillReply } from '../types.js';

export function mockChecklist(symptom: string): SkillReply {
  return {
    kind: 'mock',
    text: [
      `[mock 模式] 已收到症状：${symptom}`,
      '',
      'pf-skills 当前 mode=mock，不调用真实 LLM。',
      '配置 ANTHROPIC_API_KEY 或 DEEPSEEK_API_KEY 后，把',
      'mode 改成对应 provider 即可生成 5-8 条检查清单。',
      '详见 docs/research/lark-onboard-guide.md。',
    ].join('\n'),
  };
}
```

- [ ] **跑测试看到 PASS：**

Run: `cd apps/pf-skills && npx vitest run test/mock.test.ts`
Expected: PASS（3/3）

### Step 2.4: 写 claude / deepseek stubs + 测试

- [ ] **先写测试 `apps/pf-skills/test/stubs.test.ts`：**

```typescript
import { describe, test, expect } from 'vitest';
import { claudeChecklist } from '../src/debug-checklist/claude';
import { deepseekChecklist } from '../src/debug-checklist/deepseek';

describe('claudeChecklist stub', () => {
  test('throws not-implemented with ANTHROPIC_API_KEY hint', () => {
    expect(() => claudeChecklist('x')).toThrow(/ANTHROPIC_API_KEY/);
  });
});

describe('deepseekChecklist stub', () => {
  test('throws not-implemented with DEEPSEEK_API_KEY hint', () => {
    expect(() => deepseekChecklist('x')).toThrow(/DEEPSEEK_API_KEY/);
  });
});
```

- [ ] **跑测试看到 FAIL。**

- [ ] **写 `apps/pf-skills/src/debug-checklist/claude.ts`：**

```typescript
import type { SkillReply } from '../types.js';

export function claudeChecklist(_symptom: string): SkillReply {
  throw new Error(
    'claude mode is not implemented in MVP; configure ANTHROPIC_API_KEY and add a provider call in a follow-up task',
  );
}
```

- [ ] **写 `apps/pf-skills/src/debug-checklist/deepseek.ts`：**

```typescript
import type { SkillReply } from '../types.js';

export function deepseekChecklist(_symptom: string): SkillReply {
  throw new Error(
    'deepseek mode is not implemented in MVP; configure DEEPSEEK_API_KEY and add a provider call in a follow-up task',
  );
}
```

- [ ] **跑测试看到 PASS（2/2）。**

### Step 2.5: 写 `debug-checklist/index.ts` 调度 + 测试

- [ ] **写 `apps/pf-skills/src/debug-checklist/index.ts`：**

```typescript
import type { SkillMode, SkillReply } from '../types.js';
import { mockChecklist } from './mock.js';
import { claudeChecklist } from './claude.js';
import { deepseekChecklist } from './deepseek.js';

export function dispatchDebugChecklist(
  symptom: string,
  mode: SkillMode,
): SkillReply {
  switch (mode) {
    case 'mock':
      return mockChecklist(symptom);
    case 'claude':
      return claudeChecklist(symptom);
    case 'deepseek':
      return deepseekChecklist(symptom);
  }
}
```

（mode 调度逻辑被 Step 2.6 的 createSkillDispatcher 集成测试覆盖，本步无需独立测试。）

### Step 2.6: 写 `src/index.ts` (createSkillDispatcher) + 测试

- [ ] **先写测试 `apps/pf-skills/test/index.test.ts`：**

```typescript
import { describe, test, expect } from 'vitest';
import { createSkillDispatcher } from '../src/index';

describe('createSkillDispatcher', () => {
  test('mode=mock → dispatch 返回 mockChecklist 输出', async () => {
    const dispatcher = createSkillDispatcher({ mode: 'mock' });
    const reply = await dispatcher.dispatch('自动跑点又歪了');
    expect(reply.kind).toBe('mock');
    expect(reply.text).toContain('自动跑点又歪了');
  });

  test('mode=claude → dispatch throws not-implemented', async () => {
    const dispatcher = createSkillDispatcher({ mode: 'claude' });
    await expect(dispatcher.dispatch('x')).rejects.toThrow(/ANTHROPIC/);
  });

  test('mode=deepseek → dispatch throws not-implemented', async () => {
    const dispatcher = createSkillDispatcher({ mode: 'deepseek' });
    await expect(dispatcher.dispatch('x')).rejects.toThrow(/DEEPSEEK/);
  });

  test('cfg.mode 在 dispatcher 构造时捕获，dispatch 只接 symptom', async () => {
    const dispatcher = createSkillDispatcher({ mode: 'mock' });
    // 验证签名：dispatch 只有 symptom 一个参数（与旧 dispatchSkill(symptom, cfg) 不同）
    const reply = await dispatcher.dispatch('x');
    expect(reply.kind).toBe('mock');
  });
});
```

- [ ] **跑测试看到 FAIL。**

- [ ] **写实现 `apps/pf-skills/src/index.ts`：**

```typescript
import type { SkillDispatcher, SkillDispatcherConfig } from './types.js';
import { dispatchDebugChecklist } from './debug-checklist/index.js';

export function createSkillDispatcher(
  cfg: SkillDispatcherConfig,
): SkillDispatcher {
  return {
    async dispatch(symptom: string) {
      return dispatchDebugChecklist(symptom, cfg.mode);
    },
  };
}

export type {
  SkillReply,
  SkillMode,
  SkillDispatcher,
  SkillDispatcherConfig,
} from './types.js';
```

- [ ] **跑测试看到 PASS（4/4）。**

### Step 2.7: install + verify + commit

- [ ] **安装：** `cd apps/pf-skills && npm install`
- [ ] **跑 verify：** `cd apps/pf-skills && npm run verify:all`
  Expected: typecheck PASS；test PASS（≥ 9 个）；build PASS

- [ ] **`git diff --check`：** Expected 无空白错误

- [ ] **commit：**

```bash
git add apps/pf-skills
git commit -m "$(cat <<'EOF'
feat(pf-skills): LARK-CLI-02 — 立业务 skill 调度子包

新增 apps/pf-skills/ 独立子包（@probeflash/pf-skills）。
- src: types + debug-checklist/{mock,claude,deepseek,index} + index 共 6 文件
- mockChecklist 文案从原 lark-gateway/src/skill-dispatcher.ts 完整迁移（多句行为等价）
- claude / deepseek 留 stub throw not-implemented，含 provider key 安装指引
- createSkillDispatcher(cfg) closure 捕获 mode；dispatch(symptom) 单参数（接口变化与旧 lark-gateway 不兼容，T3 改 message-handler）
- 单测 9（mock 3 + stubs 2 + index 4）；零运行时依赖

依据：docs/superpowers/specs/2026-05-21-lark-cli-integration-design.md §3 + §4.1 M2。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **`now.md` planning sync：** 加 1 行到最近完成；单独 commit。

---

## Task 3: LARK-CLI-03 — `apps/lark-gateway/` 瘦身

**前置：** Task 1 + Task 2 已完成且 commit。

**Files:**
- Modify: `apps/lark-gateway/package.json`（加 file: deps）
- Create: `apps/lark-gateway/src/ws-client.ts`
- Modify: `apps/lark-gateway/src/main.ts`
- Modify: `apps/lark-gateway/src/event-router.ts`
- Modify: `apps/lark-gateway/src/message-handler.ts`
- Modify: `apps/lark-gateway/src/types.ts`（删 `SkillReply`，移到 pf-skills）
- Modify: `apps/lark-gateway/test/message-handler.test.ts`
- Delete: `apps/lark-gateway/src/lark-client.ts`
- Delete: `apps/lark-gateway/src/reply-sender.ts`
- Delete: `apps/lark-gateway/src/skill-dispatcher.ts`
- Delete: `apps/lark-gateway/test/skill-dispatcher.test.ts`（若存在）

### Step 3.1: 加 file: 依赖

- [ ] **修改 `apps/lark-gateway/package.json` 的 dependencies：**

```json
{
  "dependencies": {
    "@larksuiteoapi/node-sdk": "^1.42.0",
    "@probeflash/lark-toolkit": "file:../lark-toolkit",
    "@probeflash/pf-skills": "file:../pf-skills",
    "dotenv": "^16.4.5",
    "zod": "^3.23.8"
  }
}
```

- [ ] **重装 deps：** `cd apps/lark-gateway && npm install`
  Expected: 看到 `@probeflash/lark-toolkit` / `@probeflash/pf-skills` 被 symlink 进 node_modules

- [ ] **验证 import 可解析：** `cd apps/lark-gateway && node -e "import('@probeflash/lark-toolkit').then(m => console.log(Object.keys(m)))"`
  Expected: 输出 `[ 'createToolkit', 'CliBridgeError' ]`

### Step 3.2: 抽 `ws-client.ts`（从 `lark-client.ts` 入站部分剥离）

- [ ] **写 `apps/lark-gateway/src/ws-client.ts`：**

```typescript
import * as lark from '@larksuiteoapi/node-sdk';
import type { Config } from './config.js';

/**
 * Build only the inbound WSClient. Outbound SDK Client now lives in
 * `@probeflash/lark-toolkit` and is created independently with its own
 * (subset) config.
 */
export function createWsClient(cfg: Config): lark.WSClient {
  return new lark.WSClient({
    appId: cfg.LARK_APP_ID,
    appSecret: cfg.LARK_APP_SECRET,
    domain: cfg.LARK_DOMAIN === 'lark' ? lark.Domain.Lark : lark.Domain.Feishu,
    loggerLevel: lark.LoggerLevel.info,
  });
}
```

### Step 3.3: 改 `types.ts`（删 `SkillReply`；保留 `LarkMessageEvent`）

- [ ] **`apps/lark-gateway/src/types.ts` 现状：** 应该含 `LarkMessageEvent` + `SkillReply`。`SkillReply` 已搬到 `@probeflash/pf-skills`。
- [ ] **删除 `SkillReply` interface（不要保留 re-export，让 message-handler 直接从 pf-skills import）。**

### Step 3.4: 改 `message-handler.ts`（用 toolkit + skills 替换 HandlerDeps）

- [ ] **先改测试 `apps/lark-gateway/test/message-handler.test.ts`（红→绿）：**

```typescript
import { describe, test, expect, vi } from 'vitest';
import { handleMessage, stripMention } from '../src/message-handler';
import type { Config } from '../src/config';
import type { LarkMessageEvent } from '../src/types';

const cfg: Config = {
  LARK_APP_ID: 'app',
  LARK_APP_SECRET: 'secret',
  LARK_BOT_OPEN_ID: 'ou_bot',
  LARK_DOMAIN: 'feishu',
  PROBEFLASH_SKILL_MODE: 'mock',
};

interface MakeEventOpts {
  text?: string;
  type?: string;
  mentions?: Array<{ key: string; id: { open_id: string } }>;
}

function makeEvent(opts: MakeEventOpts): LarkMessageEvent {
  const type = opts.type ?? 'text';
  return {
    message: {
      chat_id: 'oc_chat',
      message_id: 'om_msg',
      message_type: type,
      content: type === 'text' ? JSON.stringify({ text: opts.text ?? '' }) : '{}',
      mentions: opts.mentions,
    },
    sender: { sender_id: { open_id: 'ou_user' } },
  };
}

function makeDeps() {
  return {
    toolkit: { reply: vi.fn().mockResolvedValue(undefined) },
    skills: {
      dispatch: vi
        .fn()
        .mockResolvedValue({ kind: 'mock' as const, text: '[mock] stub reply' }),
    },
  };
}

describe('handleMessage', () => {
  test('非 text 消息 → 不调度 skill 不回复', async () => {
    const deps = makeDeps();
    await handleMessage(makeEvent({ type: 'post' }), cfg, deps);
    expect(deps.toolkit.reply).not.toHaveBeenCalled();
    expect(deps.skills.dispatch).not.toHaveBeenCalled();
  });

  test('text 但非 @bot → 不调度 skill 不回复', async () => {
    const deps = makeDeps();
    await handleMessage(
      makeEvent({ text: '大家好', mentions: [] }),
      cfg,
      deps,
    );
    expect(deps.toolkit.reply).not.toHaveBeenCalled();
    expect(deps.skills.dispatch).not.toHaveBeenCalled();
  });

  test('text @ 别人但非 @bot → 不调度不回复', async () => {
    const deps = makeDeps();
    await handleMessage(
      makeEvent({
        text: '@_user_2 你看下',
        mentions: [{ key: '@_user_2', id: { open_id: 'ou_other' } }],
      }),
      cfg,
      deps,
    );
    expect(deps.toolkit.reply).not.toHaveBeenCalled();
    expect(deps.skills.dispatch).not.toHaveBeenCalled();
  });

  test('@bot 但 strip 后空 → 发 help reply，不调 skill', async () => {
    const deps = makeDeps();
    await handleMessage(
      makeEvent({
        text: '@_user_1 ',
        mentions: [{ key: '@_user_1', id: { open_id: 'ou_bot' } }],
      }),
      cfg,
      deps,
    );
    expect(deps.skills.dispatch).not.toHaveBeenCalled();
    expect(deps.toolkit.reply).toHaveBeenCalledOnce();
    const arg = deps.toolkit.reply.mock.calls[0][0];
    expect(arg.text).toContain('@我');
  });

  test('@bot 带症状 → 调 skills.dispatch(symptom) 然后 toolkit.reply', async () => {
    const deps = makeDeps();
    await handleMessage(
      makeEvent({
        text: '@_user_1 自动跑点又歪了',
        mentions: [{ key: '@_user_1', id: { open_id: 'ou_bot' } }],
      }),
      cfg,
      deps,
    );
    expect(deps.skills.dispatch).toHaveBeenCalledOnce();
    expect(deps.skills.dispatch).toHaveBeenCalledWith('自动跑点又歪了');
    expect(deps.toolkit.reply).toHaveBeenCalledOnce();
    const arg = deps.toolkit.reply.mock.calls[0][0];
    expect(arg).toMatchObject({
      chatId: 'oc_chat',
      replyToMessageId: 'om_msg',
      text: '[mock] stub reply',
    });
  });
});

describe('stripMention', () => {
  test('removes single @ token', () => {
    expect(stripMention('@_user_1 hello')).toBe('hello');
  });
  test('removes multiple @ tokens', () => {
    expect(stripMention('@_user_1 fix this @_user_2 thanks')).toBe(
      'fix this thanks',
    );
  });
  test('collapses extra whitespace', () => {
    expect(stripMention('@_user_1   spaced @_user_2   text')).toBe(
      'spaced text',
    );
  });
  test('empty when only @ tokens', () => {
    expect(stripMention('@_user_1 @_user_2')).toBe('');
  });
  test('preserves text without @ tokens', () => {
    expect(stripMention('自动跑点又歪了')).toBe('自动跑点又歪了');
  });
});
```

- [ ] **跑测试看到 FAIL（旧 handleMessage 签名不匹配）：**

Run: `cd apps/lark-gateway && npx vitest run test/message-handler.test.ts`
Expected: FAIL（type error / handler signature mismatch）

- [ ] **改 `apps/lark-gateway/src/message-handler.ts`：**

```typescript
import type { Config } from './config.js';
import type { LarkMessageEvent } from './types.js';
import type { Toolkit } from '@probeflash/lark-toolkit';
import type { SkillDispatcher } from '@probeflash/pf-skills';

export interface HandlerDeps {
  toolkit: Toolkit;
  skills: SkillDispatcher;
}

/**
 * Strip "@username" tokens (e.g. `@_user_1`) and collapse whitespace.
 */
export function stripMention(text: string): string {
  return text.replace(/@\S+/g, '').replace(/\s+/g, ' ').trim();
}

export async function handleMessage(
  data: LarkMessageEvent,
  cfg: Config,
  deps: HandlerDeps,
): Promise<void> {
  if (data.message.message_type !== 'text') return;

  const mentions = data.message.mentions ?? [];
  const isBotMentioned = mentions.some(
    (m) => m.id.open_id === cfg.LARK_BOT_OPEN_ID,
  );
  if (!isBotMentioned) return;

  let rawText = '';
  try {
    const parsed = JSON.parse(data.message.content) as { text?: string };
    rawText = parsed.text ?? '';
  } catch {
    rawText = '';
  }
  const symptom = stripMention(rawText);

  if (symptom.length === 0) {
    await deps.toolkit.reply({
      chatId: data.message.chat_id,
      replyToMessageId: data.message.message_id,
      text: '@我 + 一句调试症状（如"自动跑点又歪了"），我会生成检查清单。',
    });
    return;
  }

  const reply = await deps.skills.dispatch(symptom);
  await deps.toolkit.reply({
    chatId: data.message.chat_id,
    replyToMessageId: data.message.message_id,
    text: reply.text,
  });
}
```

- [ ] **跑测试看到 PASS（11/11）。**

### Step 3.5: 改 `event-router.ts`（注入 toolkit + skills）

- [ ] **改 `apps/lark-gateway/src/event-router.ts`：**

```typescript
import * as lark from '@larksuiteoapi/node-sdk';
import type { Toolkit } from '@probeflash/lark-toolkit';
import type { SkillDispatcher } from '@probeflash/pf-skills';
import type { Config } from './config.js';
import type { LarkMessageEvent } from './types.js';
import { handleMessage } from './message-handler.js';
import { logger } from './logger.js';

/**
 * Wire `im.message.receive_v1` events to `handleMessage` with the
 * caller-provided toolkit + skill dispatcher. Exceptions are swallowed
 * (logged) so they cannot bubble up and close the WS connection.
 */
export function buildEventDispatcher(
  cfg: Config,
  toolkit: Toolkit,
  skills: SkillDispatcher,
): lark.EventDispatcher {
  return new lark.EventDispatcher({}).register({
    'im.message.receive_v1': async (data: LarkMessageEvent) => {
      try {
        await handleMessage(data, cfg, { toolkit, skills });
      } catch (err) {
        logger.error('handler error', {
          chat_id: data?.message?.chat_id,
          message_id: data?.message?.message_id,
          error: (err as Error).message,
        });
      }
      return { ok: true };
    },
  });
}
```

### Step 3.6: 改 `main.ts`（新装配链）

- [ ] **改 `apps/lark-gateway/src/main.ts`：**

```typescript
import 'dotenv/config';
import { createToolkit } from '@probeflash/lark-toolkit';
import { createSkillDispatcher } from '@probeflash/pf-skills';
import { loadConfig } from './config.js';
import { createWsClient } from './ws-client.js';
import { buildEventDispatcher } from './event-router.js';
import { logger } from './logger.js';

async function main(): Promise<void> {
  const cfg = loadConfig();
  const wsClient = createWsClient(cfg);
  const toolkit = createToolkit({
    larkAppId: cfg.LARK_APP_ID,
    larkAppSecret: cfg.LARK_APP_SECRET,
    larkDomain: cfg.LARK_DOMAIN,
  });
  const skills = createSkillDispatcher({ mode: cfg.PROBEFLASH_SKILL_MODE });
  const eventDispatcher = buildEventDispatcher(cfg, toolkit, skills);

  logger.info('starting lark-gateway', {
    domain: cfg.LARK_DOMAIN,
    mode: cfg.PROBEFLASH_SKILL_MODE,
    bot_open_id: cfg.LARK_BOT_OPEN_ID,
  });

  wsClient.start({ eventDispatcher });
}

main().catch((err) => {
  logger.error('fatal', { error: (err as Error).message });
  process.exit(1);
});
```

### Step 3.7: 删旧文件

- [ ] **删除文件：**

```bash
rm apps/lark-gateway/src/lark-client.ts
rm apps/lark-gateway/src/reply-sender.ts
rm apps/lark-gateway/src/skill-dispatcher.ts
rm apps/lark-gateway/test/skill-dispatcher.test.ts  # 若存在
```

- [ ] **`grep -r "skill-dispatcher\|reply-sender\|lark-client" apps/lark-gateway/src apps/lark-gateway/test`**：
  Expected: 无结果（src 与 test 全清干净）

### Step 3.8: verify + commit

- [ ] **跑全套 verify：** `cd apps/lark-gateway && npm run verify:all`
  Expected: typecheck PASS；test PASS（≥ 11）；build PASS

- [ ] **核对 gateway src 文件数：** `ls apps/lark-gateway/src/ | wc -l`
  Expected: ≤ 6（main / ws-client / event-router / message-handler / config / types / logger 中至少删了 3 个）

- [ ] **`git diff --check`：** Expected 无空白错误

- [ ] **commit：**

```bash
git add apps/lark-gateway
git commit -m "$(cat <<'EOF'
refactor(lark-gateway): LARK-CLI-03 — 瘦身为入站进程，复用 lark-toolkit + pf-skills

apps/lark-gateway 从 9 src 缩到 6 src，仅保留入站 WSS + 事件分发 + 消息提取
+ 委托调用。出站 / skill 调度迁出到独立子包。

- 新增 ws-client.ts（从 lark-client.ts 入站部分剥离）
- 删除 lark-client.ts / reply-sender.ts / skill-dispatcher.ts
- message-handler 改用 Toolkit + SkillDispatcher 注入；dispatch(symptom) 单参数
- event-router 改 buildEventDispatcher(cfg, toolkit, skills) 注入签名
- main.ts 装配链：loadConfig → createWsClient → createToolkit → createSkillDispatcher → buildEventDispatcher → wsClient.start
- package.json 加 file: 依赖到 @probeflash/lark-toolkit + @probeflash/pf-skills
- message-handler.test.ts 重写：mock { toolkit, skills }；11 测试全过
- 入站 / 出站行为契约不变（同等输入 → 同等输出）

依据：docs/superpowers/specs/2026-05-21-lark-cli-integration-design.md §3 + §4.1 M3。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **`now.md` planning sync + 单独 commit。**

---

## Task 4: LARK-CLI-04 — ADR D-022 + lark-connector.md v2 + AGENTS.md 同步

**Files:**
- Modify: `docs/planning/decisions.md`（追 D-022）
- Modify: `docs/design/lark-connector.md`（整段重写 v2）
- Modify: `docs/planning/roadmap.md`（§9 forward-looking annotation）
- Modify: `AGENTS.md`（§2 语义解歧段 + §3 末尾 lark-cli auth boundary 句）
- Modify: `docs/planning/now.md`（planning sync）

### Step 4.1: 读现状

- [ ] **读 `docs/planning/decisions.md`** 末尾，找到 D-021 条目以便参照格式追 D-022。
- [ ] **读 `docs/design/lark-connector.md` §0–§11** 全文，准备重写为 v2（status: draft → 拍板后 stable）。
- [ ] **读 `docs/planning/roadmap.md` §9** 看现有 forward-looking 标注样式。
- [ ] **读 `AGENTS.md` §2 末尾 + §3 末尾 + §7** 找好插入点。

### Step 4.2: 追 D-022 到 `decisions.md`

- [ ] **在 `docs/planning/decisions.md` 末尾追加：**

```markdown
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
- 落地任务：LARK-CLI-01..06（见 docs/superpowers/plans/2026-05-21-lark-cli-integration.md）
- 回滚：包级 git revert 到基线 e821c8f；决策级标 SUPERSEDED + 加 D-023
- 关联 spec：docs/superpowers/specs/2026-05-21-lark-cli-integration-design.md
```

### Step 4.3: 重写 `lark-connector.md` v2

- [ ] **修改 frontmatter（保留 D-020/D-021，加 D-022）：**

```yaml
---
title: 飞书 Connector 架构设计（三包架构）
status: stable
date: 2026-05-21
version: v2
decisions: [D-020, D-021, D-022]
related_tasks: [LARK-01-CONNECTOR-ARCH, LARK-03-MIN-INTEGRATION, LARK-ONBOARD-GUIDE, LARK-CLI-01..06]
supersedes: lark-connector.md v1（2026-05-19 draft）
---
```

- [ ] **§0.1 在范围内** 替换为：

```markdown
### 0.1 在范围内（MVP + 三包架构）
- 三个独立子包（file: 依赖装配）：
  - apps/lark-gateway/：纯入站 WSS 进程，仅 WSClient + EventDispatcher + message-handler
  - apps/lark-toolkit/：出站统一门面库，boundary.route 内部分流 SDK / lark-cli
  - apps/pf-skills/：业务 skill 调度库（debug-checklist mock 模式起步）
- 监听 im.message.receive_v1 → @机器人 → skills.dispatch → toolkit.reply 链路
- mock 模式下不调真实 LLM；真实 provider 接入留后续

**重要术语预警**：lark-cli 自带 `skills/` 目录（24 个 AI Agent Skills，飞书 OpenAPI 操作指南）与 ProbeFlash `.agents/skills/`（领域调度 skill 如 debug-checklist）**字面同名但完全不同**。讨论时分开称呼。
```

- [ ] **§1 模块拆分** 整段重写为三包结构（照搬本 plan 文件结构总览）。
- [ ] **§2 接口契约** 用 `createToolkit` / `createSkillDispatcher` / `buildEventDispatcher` 三个新签名替换原 `dispatchSkill` / `sendReply` / `createLarkClients`。
- [ ] **§3 数据流图** 更新：handler → skills.dispatch / toolkit.reply（不再直接调 SDK Client）。
- [ ] **§9 未来扩展** 表格更新：每行加一列「实现通道」标注 SDK / lark-cli。

### Step 4.4: 加 §9 annotation 到 `roadmap.md`

- [ ] **在 `docs/planning/roadmap.md` 飞书 / 出站扩展段落（若不存在则在 LARK 系列段后追加）补：**

```markdown
> 出站扩展实现通道（D-022 拍板）：3 秒 ack 同步路径 → SDK；卡片 / 多维表 / 建群 / OAuth / 拉成员等非同步路径 → lark-cli（经 apps/lark-toolkit/cli-bridge.ts）。
```

### Step 4.5: AGENTS.md §2 加语义解歧段

- [ ] **在 `AGENTS.md §2 Workspace Rules` 末尾追加：**

```markdown
- **lark-cli skills vs ProbeFlash skills 命名预警**：飞书官方 CLI `@larksuite/cli` 自带 `skills/` 目录（24 个 AI Agent Skills，是"教 Agent 操作飞书 OpenAPI"的指南）。本仓库的 `.agents/skills/`（debug-checklist 等）是"调度领域 skill"。字面同名但完全不同体系，**不会**互通也**不应**互相 import。讨论时全名引用区分（"lark-cli 的 skills/" vs "ProbeFlash `.agents/skills/`"）。
```

### Step 4.6: AGENTS.md §3 末尾追 lark-cli auth boundary

- [ ] **在 `AGENTS.md §3 Secrets Handling` 末尾追加：**

```markdown
- `@larksuite/cli` 的 `lark config init` / `lark auth login` / token store（`~/.config/...` 或 keychain）全部由用户线下执行；AI 不读其凭证存储，只跑诊断与只读 API（`lark schema` / `lark doctor` / `lark api *.list/get/search`）。写入类 `lark api`（`*.create/update/delete/patch`）需用户一次一批审批后 AI 才可代跑。
```

### Step 4.7: verify + commit + planning sync

- [ ] **`now.md` planning sync：** 最近完成加 1 行。

- [ ] **`git diff --check`：** Expected 无空白错误

- [ ] **yaml 解析检查：**

Run: `node -e "const fs = require('fs'); const yaml = require('js-yaml'); const md = fs.readFileSync('docs/design/lark-connector.md', 'utf8'); const fm = md.match(/^---\n([\s\S]+?)\n---/); console.log(yaml.load(fm[1]))" 2>/dev/null || python3 -c "import re,yaml; md=open('docs/design/lark-connector.md').read(); fm=re.search(r'^---\n([\s\S]+?)\n---', md).group(1); print(yaml.safe_load(fm))"`
Expected: 输出有效字典，无解析错误

（若两个 runtime 都没有，跳过此步，依赖 reader 工具校验。）

- [ ] **`grep -r "skill-dispatcher" docs/` 仅命中 archive：**

Run: `grep -rn "skill-dispatcher" docs/`
Expected: 仅 `docs/archive/**` 或本 plan 自身命中（active 文档全清）

- [ ] **commit：**

```bash
git add docs/planning/decisions.md docs/design/lark-connector.md docs/planning/roadmap.md docs/planning/now.md AGENTS.md
git commit -m "$(cat <<'EOF'
docs(planning): LARK-CLI-04 — ADR D-022 + lark-connector v2 + AGENTS §2/§3 同步

- decisions.md 追 D-022（DECIDED）：lark-cli 接入 + 三包拆分硬规则 + §3 对齐细则
- lark-connector.md 重写 v2 (status: stable)：三包架构 + createToolkit/createSkillDispatcher/buildEventDispatcher 接口契约 + §9 实现通道列
- roadmap.md：出站扩展实现通道标注
- AGENTS.md §2：lark-cli skills vs ProbeFlash skills 同名异物预警
- AGENTS.md §3：lark-cli auth / token store / write API 边界细则
- now.md：最近完成 sync

依据：docs/superpowers/specs/2026-05-21-lark-cli-integration-design.md §2 + §4.1 D。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: LARK-CLI-05 — `lark-onboard-guide.md` 重写

**前置：** Task 3 已完成（toolkit + skills 实际可跑），Task 4 已完成（D-022 + AGENTS 边界生效）。

**Files:**
- Modify: `docs/research/lark-onboard-guide.md`（§0 加 lark-cli 安装；§1-§3 不变；§4 / §5 改 lark-cli 路径 + 保留旧 fallback；§8 加 lark-cli 排查；§10 同步 checklist）
- Modify: `docs/planning/now.md`

### Step 5.1: 改 §0 前置自检

- [ ] **在 `§0 前置自检（5 分钟）` 列表加 1 项：**

```markdown
- [ ] 已全局安装 lark-cli：`npm install -g @larksuite/cli`（版本 ≥ 1.0.0）。验证：`lark --version` 输出版本号。**未装也能继续走 §4 / §5 的 fallback 路径**，但 lark-cli 路径会更顺（一行命令完成多步手工）。
```

### Step 5.2: 改 §4「在本地填 `.env`」

- [ ] **整段替换为：**

```markdown
## 4. 在本地填 .env（两条路径，二选一）

### 4.A. lark-cli 路径（推荐，3 分钟）

```bash
cd apps/lark-gateway
lark config init             # 交互式问 App ID / Secret / domain；写到 ~/.config/lark-cli/
lark auth login --recommend  # 浏览器跳转 OAuth，授权最小权限（im:message:send_as_bot + im:message.group_at_msg:readonly）
lark auth status             # 验证已登录 + 显示当前 app 与 scope
```

`lark config init` 写入的位置：默认 `~/.config/lark-cli/config.json`（macOS / Linux）或 `%APPDATA%\lark-cli\` (Windows)。**AI / Skill 不读此文件**（AGENTS.md §3 末尾约定）。

然后 `.env` 只填**入站 gateway 需要**的 4 个字段（出站走 lark-cli 不重复填）：

```bash
cp .env.example .env
# 编辑 .env，填入 §1-§2 拿到的值：
#   LARK_APP_ID=cli_xxx
#   LARK_APP_SECRET=xxx
#   LARK_BOT_OPEN_ID=ou_xxx
#   LARK_DOMAIN=feishu
#   PROBEFLASH_SKILL_MODE=mock
```

### 4.B. fallback 手填路径（未装 lark-cli 时用）

完整在 `.env` 填入所有字段（同 4.A 末尾 5 行），跳过 `lark config init` / `lark auth login`。

⚠️ **二选一**：不要既跑 `lark auth login` 又在 `.env` 填全。两套 token store 同时存在会导致 gateway 与未来出站扩展行为不一致（gateway 用 .env / lark-cli 出站用自己的 store）。
```

### Step 5.3: 改 §5「本地 smoke」

- [ ] **整段替换为：**

```markdown
## 5. 本地 smoke（两条路径）

### 5.A. lark-cli smoke（推荐）

```bash
lark doctor                                 # 跑全部前置自检（PATH / token / network / scope）
lark schema im.v1.message                   # 查发消息 API 字段定义（read-only，不发任何消息）
lark api im.v1.message.create --data '{
  "receive_id_type": "open_id",
  "receive_id": "<你自己的 open_id，看 §1 应用详情页>",
  "msg_type": "text",
  "content": "{\"text\":\"smoke from lark-cli\"}"
}'
```

预期：飞书客户端收到一条文本"smoke from lark-cli"。失败看 `lark doctor` 输出 + `lark api --debug` 重跑。

### 5.B. gateway smoke（验证入站 + 回复链）

```bash
cd apps/lark-gateway
npm install
npm run dev
# 看到 "starting lark-gateway domain=feishu mode=mock bot_open_id=ou_xxx"
```

打开飞书测试群（§3.3 加好机器人），发 `@ProbeFlash-bot 自动跑点又歪了`，预期 5 秒内群里收到 mock 检查清单回复（开头 `[mock 模式] 已收到症状：自动跑点又歪了`）。

### 5.C. fallback 路径

未装 lark-cli 时跳过 5.A，直接走 5.B；§5.B 走通即视为入站 + 回复链通。
```

### Step 5.4: 改 §8 排查段

- [ ] **在 §8 追加：**

```markdown
### 8.X. lark-cli 相关

- `lark --version` 找不到命令：`npm install -g @larksuite/cli`；若 npm 全局路径不在 PATH，跑 `npm config get prefix` 看安装位置，把 `<prefix>/bin` 加入 PATH。
- `lark auth login` 浏览器打不开：手动复制 URL 到浏览器；或加 `--no-browser` 参数走纯命令行 device flow。
- `lark api ... permission denied`：scope 没批；回 §3.1 重申请权限 + 让管理员审批。
- gateway 启动报错"lark-cli not found on PATH" 但只想跑 mock：这是 cli-bridge **懒检查**触发的，只在 toolkit 实际命中 `boundary.route → 'cli'` 时才校验；MVP 只 ship reply（走 sdk），不应触发。若触发说明 boundary.ts 配置出错，回去检查 SDK_METHODS 白名单。
```

### Step 5.5: 改 §10 完成 checklist

- [ ] **§10 的 checklist 加：**

```markdown
- [ ] 选定 lark-cli 路径或 fallback 路径（不混用）
- [ ] 若走 lark-cli：`lark auth status` 显示已登录，scope 含 `im:message:send_as_bot` + `im:message.group_at_msg:readonly`
- [ ] §5.B gateway smoke 在群里收到 mock 回复
```

### Step 5.6: grep + commit

- [ ] **`grep "cp .env.example" docs/research/lark-onboard-guide.md`：** Expected 命中（fallback 路径文字保留）

- [ ] **`grep "lark config init\|lark auth login\|lark doctor" docs/research/lark-onboard-guide.md`：** Expected ≥ 4 处命中

- [ ] **`git diff --check`：** Expected 无空白错误

- [ ] **commit：**

```bash
git add docs/research/lark-onboard-guide.md docs/planning/now.md
git commit -m "$(cat <<'EOF'
docs(research): LARK-CLI-05 — onboard guide 改写 §0/§4/§5/§8/§10，加 lark-cli 路径并保留 fallback

- §0 前置自检加 lark-cli 全局安装检查
- §4 拆 4.A (lark config init + lark auth login) 与 4.B (手填 .env fallback)，明示"二选一"
- §5 拆 5.A (lark api smoke) / 5.B (gateway smoke) / 5.C (fallback)
- §8 新增 lark-cli 相关排查 (PATH / OAuth / scope / boundary)
- §10 checklist 同步：选定路径 + auth status + gateway smoke
- 旧手填路径完整保留（grep "cp .env.example" 仍命中）

依据：docs/superpowers/specs/2026-05-21-lark-cli-integration-design.md §4.1 B + 风险登记中"双 token store 错位"缓解项。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: LARK-CLI-06 — `lark-cli-dev-usage.md` 新建 + AGENTS.md §7 同步

**Files:**
- Create: `docs/research/lark-cli-dev-usage.md`
- Modify: `AGENTS.md`（§7 Verify Matrix 加 1 行）
- Modify: `docs/planning/now.md`

### Step 6.1: 新建 `lark-cli-dev-usage.md`

- [ ] **写 `docs/research/lark-cli-dev-usage.md`：**

```markdown
---
title: lark-cli dev 工作流常用命令
status: stable
date: 2026-05-21
audience: dev 自检 / AI Agent / 故障排查时使用
related:
  - docs/research/lark-onboard-guide.md
  - docs/design/lark-connector.md
  - docs/planning/decisions.md D-022
constraints:
  - AGENTS.md §3 末尾：AI 只调 read-only 子命令
---

# lark-cli dev 工作流常用命令

> D-022 拍板后 `apps/lark-toolkit/cli-bridge.ts` 在程序运行时 shell out 到 lark-cli。dev / 排查时同一批命令也用得到，本文按场景列出。

## 1. 首次安装 + 鉴权

- `npm install -g @larksuite/cli` —— 全局安装（用户线下）
- `lark --version` —— 验证安装；预期 `lark version 1.x.y`
- `lark config init` —— 交互式填 App ID / Secret / domain（用户线下；AI 禁调）
- `lark auth login --recommend` —— OAuth 最小权限（用户线下；AI 禁调）
- `lark auth status` —— 验证登录态 + 当前 scope（AI 可调，read-only）
- `lark auth logout` —— 注销（用户线下）

## 2. dev 自检（AI 可调，read-only）

- `lark doctor` —— 跑全部前置自检（PATH / token / network / scope / app config）
- `lark schema <service>` —— 查 API 字段定义。例：
  - `lark schema im.v1.message` —— 发消息 API
  - `lark schema bitable.v1.tables` —— 多维表
  - `lark schema im.v1.chat` —— 群操作

## 3. 只读 API（AI 可调）

- `lark api im.v1.message.list --params '{"chat_id":"oc_xxx"}'` —— 列消息（read-only）
- `lark api im.v1.chat.get --params '{"chat_id":"oc_xxx"}'` —— 查群信息
- `lark api contact.v3.user.get --params '{"user_id":"ou_xxx"}'` —— 查用户（需 scope）

## 4. 写入 API（AI 禁默调；需用户一次一批审批）

- `lark api im.v1.message.create --data '{...}'` —— 发消息
- `lark api im.v1.chat.create --data '{...}'` —— 建群
- `lark api bitable.v1.tables.create --data '{...}'` —— 建多维表
- `lark api im.v1.message.delete --params '{"message_id":"om_xxx"}'` —— 删消息

AI 想代用户跑写入类时，先口头确认该次调用的参数 + 后果，用户批准后 AI 可执行。

## 5. 调试 + 故障排查

- `lark api ... --debug` —— 打印 HTTP request / response
- `lark api ... --output json` —— 结构化输出便于 grep / jq
- `lark api ... --as bot` / `--as user` —— 切机器人 / 用户身份执行
- `lark doctor --verbose` —— 详细诊断输出

## 6. 与 ProbeFlash 仓库的关系

- 仓库代码（`apps/lark-toolkit/cli-bridge.ts`）程序运行时通过 `execa('lark', ['api', method, '--data', json])` 调用，与本文命令是同一 lark-cli 二进制。
- 仓库 dev 命令（`npm run verify:all` 等）**不调用** lark-cli，所以 CI / 本地 verify 不需要装 lark-cli。
- 真实出站功能（卡片 / 多维表等）触发时才需要 lark-cli 在 PATH 上 + 已 `lark auth login`。

## 7. 不在本文范围

- 飞书后台应用注册 / 权限申请 / 事件订阅 → 见 `docs/research/lark-onboard-guide.md` §1-§3
- 配置 `.env` 与 gateway smoke → 见 onboard guide §4-§5
- lark-cli 自带的 24 个 AI Agent Skills 体系 → 上游文档 https://github.com/larksuite/cli/tree/main/skills（**与 ProbeFlash 的 .agents/skills/ 是同名异物**）
```

### Step 6.2: AGENTS.md §7 加 1 行

- [ ] **在 `AGENTS.md §7 Verify Matrix` 表格末尾追加（"任何任务（共性）"行之前）：**

```markdown
| lark-cli 接入 / lark-toolkit / pf-skills | `cd apps/lark-toolkit && npm run verify:all`；`cd apps/pf-skills && npm run verify:all`；`cd apps/lark-gateway && npm run verify:all`；`git diff --check` |
```

### Step 6.3: verify + commit

- [ ] **`grep "lark doctor" docs/research/lark-cli-dev-usage.md`：** Expected ≥ 2 处命中

- [ ] **`grep "lark-cli 接入" AGENTS.md`：** Expected 命中（§7 新行）

- [ ] **`git diff --check`：** Expected 无空白错误

- [ ] **`now.md` planning sync：** 最近完成加 1 行；标注 LARK-CLI-* 系列全部完成。

- [ ] **commit：**

```bash
git add docs/research/lark-cli-dev-usage.md AGENTS.md docs/planning/now.md
git commit -m "$(cat <<'EOF'
docs(research): LARK-CLI-06 — dev usage 指南新建 + AGENTS §7 矩阵同步

- docs/research/lark-cli-dev-usage.md 新建（status: stable, 7 节）：
  - §1 首次安装 + 鉴权（用户线下 / AI 边界标注）
  - §2 dev 自检 read-only（lark doctor / schema）
  - §3 只读 API 示例
  - §4 写入 API（AI 禁默调；一次一批审批）
  - §5 调试 + 排查（--debug / --as bot / --output json）
  - §6 与仓库 cli-bridge.ts 的运行时关系
  - §7 不在本文范围 + 上游 24 skills 与 .agents/skills/ 同名异物声明
- AGENTS.md §7 Verify Matrix 加 lark-cli 接入行
- now.md：LARK-CLI 系列 6 任务全部完成

依据：docs/superpowers/specs/2026-05-21-lark-cli-integration-design.md §4.1 A + §0.1。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## 跨任务自验（全 6 任务完成后）

- [ ] **三包各自 verify:**

```bash
cd apps/lark-toolkit && npm run verify:all && cd ../..
cd apps/pf-skills && npm run verify:all && cd ../..
cd apps/lark-gateway && npm run verify:all && cd ../..
```

Expected: 三个全 PASS

- [ ] **跨包集成 smoke（非真实飞书）：**

```bash
cd apps/lark-gateway
LARK_APP_ID=app LARK_APP_SECRET=secret LARK_BOT_OPEN_ID=ou_bot LARK_DOMAIN=feishu PROBEFLASH_SKILL_MODE=mock node -e "
import('./dist/main.js').catch(e => console.log('expected exit reason:', e.message));
" 2>&1 | head -5
```

Expected: 进程能加载 toolkit + skills 并尝试启动 wsClient（实际 WSS 连接会因假凭证失败，但 装配链 不抛 type 错）

- [ ] **`grep -r "skill-dispatcher" docs/ AGENTS.md`：** Expected 仅命中 archive / 本 plan / 本次设计 spec

- [ ] **用户线下走 onboard guide 新 §1-§5 → §10 checklist 全打钩**（不在 AI 验收范围；由用户反馈）

---

## Self-Review（执行人不看，仅 plan 作者写完核对）

**1. Spec coverage：**
- spec §0.1 全部 deliverables（lark-toolkit / pf-skills / gateway 瘦身 / D-022 / onboard 重写 / dev usage / AGENTS §2 解歧）→ T1 / T2 / T3 / T4 / T5 / T6 全覆盖 ✓
- spec §3 包布局 → T1+T2+T3 落地 ✓
- spec §4 切入面 M1-M3 / D / B / A → T1-T6 全对应 ✓
- spec §6 风险缓解（lark-cli 版本校验 / 双 store / 命名混淆 / M3 测试漏迁 / workspace 配置 / 全局装失败）→ 在 T1 Step 1.5 (版本校验) / T5 Step 5.2 (二选一) / T4 Step 4.5 (命名预警) / T3 Step 3.4 (测试重写) / T3 Step 3.1 (file: deps 单独 install 验证) / T5 Step 5.1 (前置自检) 全覆盖 ✓
- spec §7 验收矩阵 → 每个 task 末尾 verify 步骤 + 跨任务自验段 ✓

**2. Placeholder scan：** plan 全文无 TBD / TODO / 模糊措辞；所有 code block 完整可粘贴 ✓

**3. Type consistency：**
- `Toolkit / SendReplyArgs / ToolkitConfig` 在 T1 types.ts 定义 → T3 message-handler 用 ✓
- `SkillDispatcher / SkillReply / SkillMode / SkillDispatcherConfig` 在 T2 types.ts 定义 → T3 message-handler 用 ✓
- `createToolkit(cfg)` 签名 T1 → T3 main.ts 调用 ✓
- `createSkillDispatcher(cfg)` 签名 T2 → T3 main.ts 调用 ✓
- `dispatch(symptom)` 单参 T2 → T3 message-handler 调用 ✓
- `buildEventDispatcher(cfg, toolkit, skills)` 签名 T3 event-router → T3 main.ts 调用 ✓

无类型 / 签名漂移。

---

**Plan ready.**
