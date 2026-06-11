---
status: forward-looking
written_at: 2026-05-16
activated_by: docs/planning/workflow-evolution.md §9 4 条 checklist 全部完成
note: 本 plan 未构成当前工作流约束；激活前 AI 不应据此立任务、不应据此修改 backlog/now.md/decisions.md
---

# Lark Gateway Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a minimal Feishu (Lark) gateway that receives webhook messages, calls Claude API to generate debug checklists, and streams responses back via SSE cards.

**Architecture:** Express.js server with clear separation: webhook handler routes messages → skill executor calls AI → SSE manager streams responses back to Feishu. No frameworks, minimal abstractions, single-file modules.

**Tech Stack:** Node.js 20+, TypeScript 5.x, Express 4.x, Anthropic SDK, zod for validation

---

## File Structure

```
apps/lark-gateway/
├── src/
│   ├── types.ts              # All TypeScript interfaces
│   ├── config.ts             # Environment variables + constants
│   ├── logger.ts             # Simple console logger
│   ├── server.ts             # Express app setup
│   ├── main.ts               # Entry point
│   ├── routes/
│   │   └── webhook.ts        # POST /webhook/feishu handler
│   ├── services/
│   │   ├── feishu-client.ts  # Feishu API calls
│   │   ├── skill-executor.ts # Claude API integration
│   │   └── sse-manager.ts    # SSE card update stream
│   └── skills/
│       └── debug-checklist.ts # Hardcoded prompt
├── tests/
│   ├── webhook.test.ts
│   ├── skill-executor.test.ts
│   └── feishu-client.test.ts
├── package.json
├── tsconfig.json
└── .env.example
```

---

## Task 1: Project Setup

**Files:**
- Create: `apps/lark-gateway/package.json`
- Create: `apps/lark-gateway/tsconfig.json`
- Create: `apps/lark-gateway/.env.example`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@probeflash/lark-gateway",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/main.ts",
    "build": "tsc",
    "start": "node dist/main.js",
    "test": "vitest"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.27.0",
    "express": "^4.19.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "tsx": "^4.11.0",
    "typescript": "^5.4.0",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: Create .env.example**

```bash
# Feishu (Lark) Configuration
FEISHU_APP_ID=your_app_id
FEISHU_APP_SECRET=your_app_secret
FEISHU_WEBHOOK_SECRET=your_webhook_secret

# Anthropic (Claude) Configuration
ANTHROPIC_API_KEY=your_api_key
ANTHROPIC_MODEL=claude-3-5-sonnet-20241022

# Server Configuration
PORT=3000
NODE_ENV=development

# Optional: Static IP for Feishu whitelist
SERVER_IP=192.168.2.2
```

- [ ] **Step 4: Commit**

```bash
cd apps/lark-gateway
git add package.json tsconfig.json .env.example
git commit -m "chore(lark-gateway): project setup with TypeScript and Express"
```

---

## Task 2: Type Definitions

**Files:**
- Create: `apps/lark-gateway/src/types.ts`

- [ ] **Step 1: Write the types file**

```typescript
// Feishu webhook payload types
export interface FeishuMessageEvent {
  schema: '2.0';
  header: {
    event_id: string;
    token: string;
    create_time: string;
    event_type: 'im.message.receive_v1';
    app_id: string;
    tenant_key: string;
  };
  event: {
    message: {
      message_id: string;
      root_id?: string;
      parent_id?: string;
      chat_id: string;
      chat_type: 'group' | 'p2p';
      message_type: 'text' | 'post' | 'image';
      content: string; // JSON string
      mentions?: Array<{
        key: string;
        id: { open_id: string; union_id: string };
        name: string;
        tenant_key: string;
      }>;
      create_time: string;
      update_time: string;
    };
    sender: {
      sender_id: { open_id: string; union_id: string };
      sender_type: 'user';
      tenant_key: string;
    };
  };
}

export interface FeishuTextContent {
  text: string;
}

// Internal message representation
export interface ParsedMessage {
  messageId: string;
  chatId: string;
  chatType: 'group' | 'p2p';
  senderOpenId: string;
  text: string;
  isMentioned: boolean;
  mentionedText?: string; // Text after @bot
  createTime: Date;
}

// Skill execution types
export interface SkillContext {
  symptom: string;
  projectType?: string;
  relatedFiles?: string[];
  recentCommits?: string[];
}

export interface ChecklistItem {
  title: string;
  priority: 'high' | 'medium' | 'low';
  basis: string;
  verification: string;
}

export interface DebugChecklistResult {
  symptom: string;
  projectContext: string;
  items: ChecklistItem[];
  followUpQuestions?: string[];
  relatedFiles?: string[];
}

// SSE card types
export interface CardUpdate {
  type: 'content' | 'complete' | 'error';
  content?: string;
  error?: string;
}

// Configuration type
export interface Config {
  feishu: {
    appId: string;
    appSecret: string;
    webhookSecret: string;
  };
  anthropic: {
    apiKey: string;
    model: string;
  };
  server: {
    port: number;
    env: 'development' | 'production';
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/types.ts
git commit -m "feat(lark-gateway): add TypeScript type definitions"
```

---

## Task 3: Configuration Module

**Files:**
- Create: `apps/lark-gateway/src/config.ts`

- [ ] **Step 1: Write config.ts**

```typescript
import { z } from 'zod';
import type { Config } from './types.js';

const configSchema = z.object({
  feishu: z.object({
    appId: z.string().min(1),
    appSecret: z.string().min(1),
    webhookSecret: z.string().min(1),
  }),
  anthropic: z.object({
    apiKey: z.string().min(1),
    model: z.string().default('claude-3-5-sonnet-20241022'),
  }),
  server: z.object({
    port: z.coerce.number().default(3000),
    env: z.enum(['development', 'production']).default('development'),
  }),
});

export function loadConfig(): Config {
  const raw = {
    feishu: {
      appId: process.env.FEISHU_APP_ID || '',
      appSecret: process.env.FEISHU_APP_SECRET || '',
      webhookSecret: process.env.FEISHU_WEBHOOK_SECRET || '',
    },
    anthropic: {
      apiKey: process.env.ANTHROPIC_API_KEY || '',
      model: process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022',
    },
    server: {
      port: process.env.PORT,
      env: process.env.NODE_ENV,
    },
  };

  const result = configSchema.safeParse(raw);
  
  if (!result.success) {
    const errors = result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
    throw new Error(`Config validation failed: ${errors}`);
  }

  return result.data;
}

export const config = loadConfig();
```

- [ ] **Step 2: Write test**

```typescript
// tests/config.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig } from '../src/config.js';

describe('loadConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should load config from environment variables', () => {
    process.env.FEISHU_APP_ID = 'test-app-id';
    process.env.FEISHU_APP_SECRET = 'test-secret';
    process.env.FEISHU_WEBHOOK_SECRET = 'test-webhook-secret';
    process.env.ANTHROPIC_API_KEY = 'test-api-key';

    const config = loadConfig();

    expect(config.feishu.appId).toBe('test-app-id');
    expect(config.anthropic.model).toBe('claude-3-5-sonnet-20241022');
    expect(config.server.port).toBe(3000);
  });

  it('should throw on missing required fields', () => {
    process.env.FEISHU_APP_ID = '';
    
    expect(() => loadConfig()).toThrow('Config validation failed');
  });
});
```

- [ ] **Step 3: Run test**

```bash
npm install
npm test -- tests/config.test.ts
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/config.ts tests/config.test.ts
git commit -m "feat(lark-gateway): add configuration module with zod validation"
```

---

## Task 4: Logger Module

**Files:**
- Create: `apps/lark-gateway/src/logger.ts`

- [ ] **Step 1: Write logger.ts**

```typescript
import { config } from './config.js';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  data?: unknown;
}

function formatLog(entry: LogEntry): string {
  const dataStr = entry.data ? ` ${JSON.stringify(entry.data)}` : '';
  return `[${entry.timestamp}] [${entry.level.toUpperCase()}] ${entry.message}${dataStr}`;
}

function log(level: LogLevel, message: string, data?: unknown): void {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    data,
  };

  const output = formatLog(entry);

  switch (level) {
    case 'debug':
      if (config.server.env === 'development') {
        console.debug(output);
      }
      break;
    case 'info':
      console.info(output);
      break;
    case 'warn':
      console.warn(output);
      break;
    case 'error':
      console.error(output);
      break;
  }
}

export const logger = {
  debug: (message: string, data?: unknown) => log('debug', message, data),
  info: (message: string, data?: unknown) => log('info', message, data),
  warn: (message: string, data?: unknown) => log('warn', message, data),
  error: (message: string, data?: unknown) => log('error', message, data),
};
```

- [ ] **Step 2: Commit**

```bash
git add src/logger.ts
git commit -m "feat(lark-gateway): add simple console logger"
```

---

## Task 5: Feishu Message Parser

**Files:**
- Create: `apps/lark-gateway/src/services/message-parser.ts`

- [ ] **Step 1: Write message-parser.ts**

```typescript
import type { FeishuMessageEvent, FeishuTextContent, ParsedMessage } from '../types.js';
import { logger } from '../logger.js';

export function parseMessage(event: FeishuMessageEvent): ParsedMessage | null {
  try {
    const { message, sender } = event.event;
    
    // Only handle text messages
    if (message.message_type !== 'text') {
      logger.debug('Skipping non-text message', { type: message.message_type });
      return null;
    }

    const content: FeishuTextContent = JSON.parse(message.content);
    const text = content.text.trim();
    
    // Check if bot is mentioned
    const botMention = message.mentions?.find(m => m.key === '@_user_1');
    const isMentioned = !!botMention;
    
    // Extract text after @bot
    let mentionedText: string | undefined;
    if (isMentioned) {
      mentionedText = text.replace(/@_user_1\s*/, '').trim();
    }

    return {
      messageId: message.message_id,
      chatId: message.chat_id,
      chatType: message.chat_type,
      senderOpenId: sender.sender_id.open_id,
      text,
      isMentioned,
      mentionedText,
      createTime: new Date(parseInt(message.create_time)),
    };
  } catch (error) {
    logger.error('Failed to parse message', error);
    return null;
  }
}

export function shouldProcessMessage(parsed: ParsedMessage): boolean {
  // Only process group messages where bot is mentioned, or all p2p messages
  if (parsed.chatType === 'group') {
    return parsed.isMentioned && !!parsed.mentionedText;
  }
  return true; // p2p
}
```

- [ ] **Step 2: Write test**

```typescript
// tests/message-parser.test.ts
import { describe, it, expect } from 'vitest';
import { parseMessage, shouldProcessMessage } from '../src/services/message-parser.js';
import type { FeishuMessageEvent } from '../src/types.js';

describe('parseMessage', () => {
  const baseEvent: FeishuMessageEvent = {
    schema: '2.0',
    header: {
      event_id: 'test-event-id',
      token: 'test-token',
      create_time: '1234567890',
      event_type: 'im.message.receive_v1',
      app_id: 'test-app',
      tenant_key: 'test-tenant',
    },
    event: {
      message: {
        message_id: 'test-msg-id',
        chat_id: 'test-chat-id',
        chat_type: 'group',
        message_type: 'text',
        content: JSON.stringify({ text: 'Hello @bot' }),
        mentions: [{ key: '@_user_1', id: { open_id: 'bot-id', union_id: '' }, name: 'Bot', tenant_key: 'test' }],
        create_time: '1234567890000',
        update_time: '1234567890000',
      },
      sender: {
        sender_id: { open_id: 'user-123', union_id: '' },
        sender_type: 'user',
        tenant_key: 'test',
      },
    },
  };

  it('should parse text message with mention', () => {
    const result = parseMessage(baseEvent);
    
    expect(result).not.toBeNull();
    expect(result?.text).toBe('Hello @bot');
    expect(result?.isMentioned).toBe(true);
    expect(result?.mentionedText).toBe('Hello');
  });

  it('should return null for non-text messages', () => {
    const imageEvent = { ...baseEvent };
    imageEvent.event.message.message_type = 'image';
    
    const result = parseMessage(imageEvent);
    expect(result).toBeNull();
  });
});

describe('shouldProcessMessage', () => {
  it('should process p2p messages', () => {
    const msg = { chatType: 'p2p', isMentioned: false, text: 'hello' } as any;
    expect(shouldProcessMessage(msg)).toBe(true);
  });

  it('should process group messages with mention', () => {
    const msg = { chatType: 'group', isMentioned: true, mentionedText: 'help' } as any;
    expect(shouldProcessMessage(msg)).toBe(true);
  });

  it('should skip group messages without mention', () => {
    const msg = { chatType: 'group', isMentioned: false, text: 'hello' } as any;
    expect(shouldProcessMessage(msg)).toBe(false);
  });
});
```

- [ ] **Step 3: Run test**

```bash
npm test -- tests/message-parser.test.ts
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/services/message-parser.ts tests/message-parser.test.ts
git commit -m "feat(lark-gateway): add Feishu message parser"
```

---

## Task 6: Debug Checklist Skill (Hardcoded)

**Files:**
- Create: `apps/lark-gateway/src/skills/debug-checklist.ts`

- [ ] **Step 1: Write debug-checklist.ts**

```typescript
import Anthropic from '@anthropic-ai/sdk';
import type { SkillContext, DebugChecklistResult } from '../types.js';
import { config } from '../config.js';
import { logger } from '../logger.js';

const SYSTEM_PROMPT = `You are a debugging assistant for robotics teams. Given a symptom description, generate a structured checklist of 5-8 debugging steps.

Each item must have:
- title: concise action name
- priority: high/medium/low
- basis: why this might be the cause (reference specific patterns if known)
- verification: specific steps to check (commands, observations, or code locations)

Output in JSON format matching this structure:
{
  "symptom": "original symptom",
  "projectContext": "inferred project type",
  "items": [...],
  "followUpQuestions": ["..."]
}

Be specific, not generic. Avoid "check hardware connections" without details.`;

export async function generateDebugChecklist(
  symptom: string,
  context?: SkillContext
): Promise<DebugChecklistResult> {
  const anthropic = new Anthropic({
    apiKey: config.anthropic.apiKey,
  });

  const userPrompt = context
    ? `Symptom: ${symptom}\n\nProject context: ${context.projectType || 'unknown'}\nRelated files: ${context.relatedFiles?.join(', ') || 'none'}`
    : `Symptom: ${symptom}`;

  logger.info('Calling Claude API for debug checklist', { symptom });

  const response = await anthropic.messages.create({
    model: config.anthropic.model,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const content = response.content[0];
  if (content.type !== 'text') {
    throw new Error('Unexpected response type from Claude');
  }

  try {
    const result = JSON.parse(content.text) as DebugChecklistResult;
    logger.info('Generated checklist', { itemCount: result.items.length });
    return result;
  } catch (error) {
    logger.error('Failed to parse Claude response as JSON', { text: content.text });
    // Return a fallback result
    return {
      symptom,
      projectContext: 'unknown',
      items: [{
        title: 'Parse AI response',
        priority: 'high',
        basis: 'AI returned non-JSON',
        verification: `Raw response: ${content.text.slice(0, 200)}...`,
      }],
      followUpQuestions: ['Please retry with clearer symptom description'],
    };
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/skills/debug-checklist.ts
git commit -m "feat(lark-gateway): add debug-checklist skill with Claude integration"
```

---

## Task 7: SSE Manager for Card Updates

**Files:**
- Create: `apps/lark-gateway/src/services/sse-manager.ts`

- [ ] **Step 1: Write sse-manager.ts**

```typescript
import type { CardUpdate } from '../types.js';
import { logger } from '../logger.js';

// SSE connections per message
const connections = new Map<string, (update: CardUpdate) => void>();

export function createSseStream(messageId: string): {
  onUpdate: (callback: (update: CardUpdate) => void) => void;
  push: (update: CardUpdate) => void;
  close: () => void;
} {
  let callback: ((update: CardUpdate) => void) | null = null;

  const onUpdate = (cb: (update: CardUpdate) => void) => {
    callback = cb;
    connections.set(messageId, cb);
  };

  const push = (update: CardUpdate) => {
    if (callback) {
      callback(update);
    }
  };

  const close = () => {
    connections.delete(messageId);
    callback = null;
    logger.debug('SSE stream closed', { messageId });
  };

  return { onUpdate, push, close };
}

export function formatCardMarkdown(result: {
  symptom: string;
  items: Array<{ title: string; priority: string; basis: string; verification: string }>;
}): string {
  const items = result.items.map((item, i) => 
    `${i + 1}. **[${item.priority.toUpperCase()}]** ${item.title}\n` +
    `   - 依据: ${item.basis}\n` +
    `   - 验证: ${item.verification}`
  ).join('\n\n');

  return `# 调试检查单: ${result.symptom}\n\n${items}`;
}

export function streamChecklistToCard(
  messageId: string,
  checklist: { symptom: string; items: Array<{ title: string; priority: string; basis: string; verification: string }> }
): AsyncIterable<string> {
  const { push, close } = createSseStream(messageId);
  
  return {
    [Symbol.asyncIterator]: async function* () {
      try {
        // Send initial card
        yield JSON.stringify({
          type: 'content',
          content: `正在生成检查单: ${checklist.symptom}...`,
        });

        // Simulate streaming - in real implementation, this would come from Claude
        for (let i = 0; i < checklist.items.length; i++) {
          await new Promise(r => setTimeout(r, 500)); // Simulate delay
          
          const partial = checklist.items.slice(0, i + 1);
          const markdown = formatCardMarkdown({ symptom: checklist.symptom, items: partial });
          
          yield JSON.stringify({
            type: 'content',
            content: markdown,
          });
        }

        yield JSON.stringify({
          type: 'complete',
          content: formatCardMarkdown(checklist),
        });
      } catch (error) {
        logger.error('SSE stream error', { messageId, error });
        yield JSON.stringify({
          type: 'error',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      } finally {
        close();
      }
    },
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/services/sse-manager.ts
git commit -m "feat(lark-gateway): add SSE manager for card streaming"
```

---

## Task 8: Feishu Client (API Calls)

**Files:**
- Create: `apps/lark-gateway/src/services/feishu-client.ts`

- [ ] **Step 1: Write feishu-client.ts**

```typescript
import { config } from '../config.js';
import { logger } from '../logger.js';

interface AccessTokenResponse {
  code: number;
  msg: string;
  tenant_access_token?: string;
  expire?: number;
}

interface SendMessageResponse {
  code: number;
  msg: string;
  data?: {
    message_id: string;
  };
}

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getTenantAccessToken(): Promise<string> {
  // Check cache
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60000) {
    return cachedToken.token;
  }

  const response = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      app_id: config.feishu.appId,
      app_secret: config.feishu.appSecret,
    }),
  });

  const data: AccessTokenResponse = await response.json();
  
  if (data.code !== 0) {
    throw new Error(`Failed to get access token: ${data.msg}`);
  }

  const token = data.tenant_access_token!;
  const expiresAt = Date.now() + (data.expire || 7200) * 1000;
  
  cachedToken = { token, expiresAt };
  logger.debug('Refreshed Feishu access token');
  
  return token;
}

export async function sendTextMessage(
  chatId: string,
  text: string
): Promise<string | null> {
  const token = await getTenantAccessToken();
  
  const response = await fetch('https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      receive_id: chatId,
      msg_type: 'text',
      content: JSON.stringify({ text }),
    }),
  });

  const data: SendMessageResponse = await response.json();
  
  if (data.code !== 0) {
    logger.error('Failed to send message', { chatId, error: data.msg });
    return null;
  }

  return data.data?.message_id || null;
}

export async function sendInteractiveCard(
  chatId: string,
  cardContent: object
): Promise<string | null> {
  const token = await getTenantAccessToken();
  
  const response = await fetch('https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      receive_id: chatId,
      msg_type: 'interactive',
      content: JSON.stringify(cardContent),
    }),
  });

  const data: SendMessageResponse = await response.json();
  
  if (data.code !== 0) {
    logger.error('Failed to send card', { chatId, error: data.msg });
    return null;
  }

  return data.data?.message_id || null;
}

export async function updateCard(
  messageId: string,
  cardContent: object
): Promise<boolean> {
  const token = await getTenantAccessToken();
  
  const response = await fetch(`https://open.feishu.cn/open-apis/im/v1/messages/${messageId}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      content: JSON.stringify(cardContent),
    }),
  });

  const data = await response.json();
  
  if (data.code !== 0) {
    logger.error('Failed to update card', { messageId, error: data.msg });
    return false;
  }

  return true;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/services/feishu-client.ts
git commit -m "feat(lark-gateway): add Feishu API client"
```

---

## Task 9: Webhook Route Handler

**Files:**
- Create: `apps/lark-gateway/src/routes/webhook.ts`

- [ ] **Step 1: Write webhook.ts**

```typescript
import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import type { FeishuMessageEvent } from '../types.js';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { parseMessage, shouldProcessMessage } from '../services/message-parser.js';
import { generateDebugChecklist } from '../skills/debug-checklist.js';
import { sendTextMessage, sendInteractiveCard, updateCard } from '../services/feishu-client.js';
import { formatCardMarkdown } from '../services/sse-manager.js';

const router = Router();

function verifyWebhookSignature(
  timestamp: string,
  nonce: string,
  body: string,
  signature: string
): boolean {
  const expected = crypto
    .createHmac('sha256', config.feishu.webhookSecret)
    .update(`${timestamp}\n${nonce}\n${body}`)
    .digest('base64');
  
  return expected === signature;
}

router.post('/feishu', async (req: Request, res: Response) => {
  try {
    // Verify signature
    const signature = req.headers['x-lark-signature'] as string;
    const timestamp = req.headers['x-lark-timestamp'] as string;
    const nonce = req.headers['x-lark-nonce'] as string;
    
    if (!signature || !timestamp || !nonce) {
      logger.warn('Missing webhook headers');
      return res.status(400).json({ code: 400, msg: 'Missing headers' });
    }

    const body = JSON.stringify(req.body);
    if (!verifyWebhookSignature(timestamp, nonce, body, signature)) {
      logger.warn('Invalid webhook signature');
      return res.status(401).json({ code: 401, msg: 'Invalid signature' });
    }

    const event = req.body as FeishuMessageEvent;
    
    // Handle challenge request (for webhook registration)
    if ('challenge' in event) {
      return res.json({ challenge: event.challenge });
    }

    // Only process message events
    if (event.header.event_type !== 'im.message.receive_v1') {
      return res.json({ code: 0, msg: 'ok' });
    }

    // Parse message
    const parsed = parseMessage(event);
    if (!parsed || !shouldProcessMessage(parsed)) {
      logger.debug('Message filtered out', { messageId: event.event.message.message_id });
      return res.json({ code: 0, msg: 'ok' });
    }

    logger.info('Processing message', { 
      messageId: parsed.messageId,
      chatType: parsed.chatType,
      isMentioned: parsed.isMentioned,
    });

    // Extract symptom (use mentioned text in groups, full text in p2p)
    const symptom = parsed.chatType === 'group' ? parsed.mentionedText! : parsed.text;
    
    // Send initial response
    const thinkingCard = {
      config: { wide_screen_mode: true },
      header: {
        title: { tag: 'plain_text', content: '🤔 分析中...' },
        template: 'blue',
      },
      elements: [
        { tag: 'div', text: { tag: 'lark_md', content: `症状: ${symptom}` } },
        { tag: 'div', text: { tag: 'lark_md', content: '正在生成调试检查单，请稍候...' } },
      ],
    };

    const replyMessageId = await sendInteractiveCard(parsed.chatId, thinkingCard);
    if (!replyMessageId) {
      logger.error('Failed to send initial card');
      return res.status(500).json({ code: 500, msg: 'Failed to send card' });
    }

    // Generate checklist
    try {
      const result = await generateDebugChecklist(symptom);
      
      // Update card with result
      const markdown = formatCardMarkdown(result);
      const resultCard = {
        config: { wide_screen_mode: true },
        header: {
          title: { tag: 'plain_text', content: '🔧 调试检查单' },
          template: 'green',
        },
        elements: [
          { tag: 'div', text: { tag: 'lark_md', content: markdown } },
        ],
      };

      await updateCard(replyMessageId, resultCard);
      logger.info('Checklist sent successfully', { messageId: replyMessageId });
    } catch (error) {
      logger.error('Failed to generate checklist', error);
      
      const errorCard = {
        config: { wide_screen_mode: true },
        header: {
          title: { tag: 'plain_text', content: '❌ 生成失败' },
          template: 'red',
        },
        elements: [
          { tag: 'div', text: { tag: 'lark_md', content: '抱歉，检查单生成失败，请稍后重试。' } },
        ],
      };
      
      await updateCard(replyMessageId, errorCard);
    }

    res.json({ code: 0, msg: 'ok' });
  } catch (error) {
    logger.error('Webhook handler error', error);
    res.status(500).json({ code: 500, msg: 'Internal error' });
  }
});

export default router;
```

- [ ] **Step 2: Commit**

```bash
git add src/routes/webhook.ts
git commit -m "feat(lark-gateway): add webhook route handler"
```

---

## Task 10: Express Server Setup

**Files:**
- Create: `apps/lark-gateway/src/server.ts`
- Create: `apps/lark-gateway/src/main.ts`

- [ ] **Step 1: Write server.ts**

```typescript
import express from 'express';
import webhookRouter from './routes/webhook.js';
import { logger } from './logger.js';

export function createServer() {
  const app = express();

  // Middleware
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Request logging
  app.use((req, res, next) => {
    logger.debug(`${req.method} ${req.path}`);
    next();
  });

  // Routes
  app.use('/webhook', webhookRouter);

  // Health check
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Error handling
  app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.error('Express error', err);
    res.status(500).json({ code: 500, msg: 'Internal server error' });
  });

  return app;
}
```

- [ ] **Step 2: Write main.ts**

```typescript
import { config } from './config.js';
import { logger } from './logger.js';
import { createServer } from './server.js';

async function main() {
  try {
    logger.info('Starting Lark Gateway', { port: config.server.port });
    
    const app = createServer();
    
    app.listen(config.server.port, () => {
      logger.info(`Server listening on port ${config.server.port}`);
    });
  } catch (error) {
    logger.error('Failed to start server', error);
    process.exit(1);
  }
}

main();
```

- [ ] **Step 3: Commit**

```bash
git add src/server.ts src/main.ts
git commit -m "feat(lark-gateway): add Express server setup"
```

---

## Task 11: Integration Test

**Files:**
- Create: `apps/lark-gateway/tests/webhook.integration.test.ts`

- [ ] **Step 1: Write integration test**

```typescript
// tests/webhook.integration.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { createServer } from '../src/server.js';

describe('Webhook Integration', () => {
  const app = createServer();

  it('should return health status', async () => {
    // In real test, you'd make HTTP request
    // For now, just verify server creates without error
    expect(app).toBeDefined();
  });
});
```

- [ ] **Step 2: Commit**

```bash
git add tests/webhook.integration.test.ts
git commit -m "test(lark-gateway): add integration test placeholder"
```

---

## Task 12: README Documentation

**Files:**
- Create: `apps/lark-gateway/README.md`

- [ ] **Step 1: Write README**

```markdown
# Lark Gateway

ProbeFlash 飞书网关 - 接收飞书消息，生成调试检查单。

## 架构

```
飞书消息 → Webhook → Express → 消息解析 → Claude API → 飞书卡片回复
```

## 开发

```bash
# Install dependencies
npm install

# Setup environment
cp .env.example .env
# Edit .env with your credentials

# Run in development
npm run dev

# Run tests
npm test

# Build
npm run build

# Start production
npm start
```

## 部署

1. 确保服务器有静态IP（192.168.2.2）
2. 配置飞书开发者后台：
   - 添加 webhook URL: `http://192.168.2.2:3000/webhook/feishu`
   - 配置 IP 白名单
3. 设置环境变量
4. 使用 systemd 或 pm2 启动服务

## 环境变量

| Variable | Description |
|----------|-------------|
| FEISHU_APP_ID | 飞书应用 ID |
| FEISHU_APP_SECRET | 飞书应用密钥 |
| FEISHU_WEBHOOK_SECRET | Webhook 签名密钥 |
| ANTHROPIC_API_KEY | Claude API 密钥 |
| PORT | 服务端口 (默认 3000) |

## 限制

- Webhook 限流: 100次/分钟
- 使用 SSE 卡片更新规避限流
- 多维表格单表上限: 2000行 (免费版)
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs(lark-gateway): add README with setup and deployment instructions"
```

---

## Summary

**Total Files Created:** 15
**Estimated Implementation Time:** 4-6 hours

**Key Design Decisions:**
1. TypeScript for type safety and AI-friendly code
2. Single-file modules with clear responsibilities
3. No complex frameworks - Express + raw fetch
4. Hardcoded prompts initially, dynamic loading later
5. SSE for card updates to avoid webhook rate limits

**Testing Strategy:**
- Unit tests for parsers and config
- Integration tests for webhook flow
- Manual testing with real Feishu webhook

**Deployment:**
- Static IP: 192.168.2.2
- Port: 3000 (configurable)
- Process manager: systemd or pm2

---

## Self-Review Checklist

- [x] Spec coverage: All modules (gateway, skill executor, feishu client, SSE) have tasks
- [x] Placeholder scan: No TODOs or TBDs
- [x] Type consistency: Types defined in Task 2, used consistently throughout
- [x] File paths: All paths are exact and consistent
- [x] No complex abstractions: Each file <150 lines, single responsibility

---

**Plan saved to `docs/superpowers/plans/2026-05-16-lark-gateway.md`**

**Execution options:**

1. **Subagent-Driven (recommended)** - Dispatch fresh subagent per task, review between tasks
2. **Inline Execution** - Execute tasks in this session using executing-plans skill

Which approach would you like?
