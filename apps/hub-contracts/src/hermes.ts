import { z } from 'zod';

/**
 * Hermes 入站命令契约（HUB-HERMES-ADAPTER 最小链路）。
 * 纯类型 + 纯解析，无 I/O。服务端 POST /api/hermes/inbound 消费本模块。
 */

// ─── 命令枚举 ───────────────────────────────────────────────────────────────

export const HermesCommandSchema = z.enum(['inv-query', 'inv-record']);
export type HermesCommand = z.infer<typeof HermesCommandSchema>;

// ─── inv-query 参数 ─────────────────────────────────────────────────────────

export const HermesInvQueryArgsSchema = z
  .object({
    name: z.string().min(1).optional(),
    category: z.string().min(1).optional(),
    robot: z.string().min(1).optional(),
  })
  .refine((a) => a.name || a.category || a.robot, {
    message: '至少提供 name / category / robot 之一',
  });
export type HermesInvQueryArgs = z.infer<typeof HermesInvQueryArgsSchema>;

// ─── inv-record 参数 ────────────────────────────────────────────────────────

export const HermesInvRecordActionSchema = z.enum(['add', 'subtract', 'transfer']);
export type HermesInvRecordAction = z.infer<typeof HermesInvRecordActionSchema>;

export const HermesInvRecordArgsSchema = z
  .object({
    name: z.string().min(1),
    action: HermesInvRecordActionSchema,
    quantity: z.number().int().positive(),
    from: z.string().min(1).optional(),
    to: z.string().min(1).optional(),
    note: z.string().optional(),
  })
  .refine((a) => a.action !== 'transfer' || (a.from && a.to), {
    message: 'transfer 需要 from 和 to',
  });
export type HermesInvRecordArgs = z.infer<typeof HermesInvRecordArgsSchema>;

// ─── 入站请求（结构化 或 原始文本）─────────────────────────────────────────────

export const HermesStructuredRequestSchema = z.object({
  command: HermesCommandSchema,
  args: z.record(z.unknown()),
});

export const HermesTextRequestSchema = z.object({
  text: z.string().min(1).max(500),
});

export const HermesInboundRequestSchema = z.union([
  HermesStructuredRequestSchema,
  HermesTextRequestSchema,
]);
export type HermesInboundRequest = z.infer<typeof HermesInboundRequestSchema>;

// ─── 出站响应 ───────────────────────────────────────────────────────────────

export const HermesInboundResponseSchema = z.object({
  ok: z.boolean(),
  text: z.string(),
});
export type HermesInboundResponse = z.infer<typeof HermesInboundResponseSchema>;

// ─── 原始文本 → 结构化命令（纯解析，正则/关键词匹配）─────────────────────────

export interface HermesParseResult {
  command: HermesCommand;
  args: Record<string, unknown>;
}

/**
 * 简单规则匹配：覆盖高频自然语言模式，匹配不上返回 null（消费侧可升级给 AI）。
 * 优先级：后缀锚定（^...$）→ 前缀锚定 → 无锚定兜底。首中即返。
 */
export function parseHermesText(raw: string): HermesParseResult | null {
  const text = raw.trim();

  // ── inv-record: 入库/到货（后缀模式，锚定优先）──
  // "3508 到了5个" / "电容 入库 10"
  const restockSuffix = text.match(/^(.+?)\s*(?:到了?|入库)\s*(\d+)\s*[个只块片台套根条]?$/);
  if (restockSuffix) {
    return {
      command: 'inv-record',
      args: { name: restockSuffix[1].trim(), action: 'add', quantity: Number(restockSuffix[2]) },
    };
  }
  // "新到了5个3508" / "入库了10个电容" / "到了 3 个 3508电机"
  const restockPrefix = text.match(
    /(?:新?到了?|入库|新买|采购)\s*(?:了)?\s*(\d+)\s*[个只块片台套根条]?\s*(.{2,})/,
  );
  if (restockPrefix) {
    return {
      command: 'inv-record',
      args: { name: restockPrefix[2].trim(), action: 'add', quantity: Number(restockPrefix[1]) },
    };
  }

  // ── inv-record: 损耗/报废（后缀模式，锚定优先）──
  // "3508电机 坏了 3 个"
  const damageSuffix = text.match(/^(.+?)\s*(?:烧了|坏了|炸了|丢了|报废|损坏)\s*(\d+)\s*[个只块片台套根条]?$/);
  if (damageSuffix) {
    return {
      command: 'inv-record',
      args: {
        name: damageSuffix[1].trim(),
        action: 'subtract',
        quantity: Number(damageSuffix[2]),
      },
    };
  }
  // "3508烧了" (no explicit quantity → 1)
  const damageNoQty = text.match(/^(.+?)\s*(?:烧了|坏了|炸了|丢了|报废了?|损坏了?)$/);
  if (damageNoQty) {
    return {
      command: 'inv-record',
      args: { name: damageNoQty[1].trim(), action: 'subtract', quantity: 1 },
    };
  }
  // "报废2个电容" / "烧了3个3508"
  const damagePrefix = text.match(
    /(?:报废|损坏|烧了|坏了|炸了|丢了|少了)\s*(\d+)\s*[个只块片台套根条]?\s*(.{2,})/,
  );
  if (damagePrefix) {
    return {
      command: 'inv-record',
      args: {
        name: damagePrefix[2].trim(),
        action: 'subtract',
        quantity: Number(damagePrefix[1]),
      },
    };
  }

  // ── inv-record: 调拨 ──
  // "3508从R1拆到R2" / "把电容从R2移到共用"
  const transferMatch = text.match(
    /(?:把)?(.+?)(?:从)\s*(\S+)\s*(?:拆到|移到|换到|调到|装到)\s*(\S+)/,
  );
  if (transferMatch) {
    return {
      command: 'inv-record',
      args: {
        name: transferMatch[1].trim(),
        action: 'transfer',
        quantity: 1,
        from: transferMatch[2].trim(),
        to: transferMatch[3].trim(),
      },
    };
  }

  // ── inv-query: 按机器人查装配 ──
  // "R1上装了什么" / "R2 有什么件"
  const robotMatch = text.match(/(R\d|共用|shared)\s*(?:上|里)?(?:装了|有什么|有哪些|的件|的装配)/i);
  if (robotMatch) {
    return {
      command: 'inv-query',
      args: { robot: robotMatch[1].toUpperCase().replace('SHARED', '共用') },
    };
  }

  // ── inv-query: 按类别 ──
  // "电控组有什么件" / "视觉类的库存"
  const categoryMatch = text.match(/(.+?)(?:组|类|类别)(?:有什么|有哪些|的库存|的件)/);
  if (categoryMatch) {
    return { command: 'inv-query', args: { category: categoryMatch[1].trim() } };
  }

  // ── inv-query: 按名称查数量 ──
  // "3508还有几个" / "3508电机还有多少" / "电容 库存" / "查 3508"
  const queryMatch = text.match(/^(?:查|查一下|看看)?\s*(.+?)\s*(?:还有几个|还有多少|有多少|库存|还有吗|有几个|数量)/);
  if (queryMatch) {
    return { command: 'inv-query', args: { name: queryMatch[1].trim() } };
  }
  const queryMatch2 = text.match(/^(?:查|查一下|看看)\s+(.+)$/);
  if (queryMatch2) {
    return { command: 'inv-query', args: { name: queryMatch2[1].trim() } };
  }

  return null;
}
