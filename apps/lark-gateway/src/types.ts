// Shared TypeScript types for lark-gateway.
// Kept separate from runtime modules so test files and production code
// share the same shape definitions without circular imports.

/**
 * Subset of the Feishu `im.message.receive_v1` event payload that we
 * actually read. The full SDK type is larger; we only declare what
 * the gateway touches so tests can fabricate events without pulling
 * in the SDK type tree.
 */
export interface LarkMessageEvent {
  message: {
    chat_id: string;
    message_id: string;
    message_type: string;
    content: string;
    mentions?: Array<{
      key: string;
      id: { open_id?: string; user_id?: string; union_id?: string };
    }>;
  };
  sender?: {
    sender_id?: { open_id?: string; user_id?: string; union_id?: string };
    // L6：Feishu 把租户标识放在 sender.tenant_key（不是 message 顶层）。
    tenant_key?: string;
  };
}
