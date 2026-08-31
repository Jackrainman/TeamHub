export interface LarkSendResult {
  ok: boolean;
  error?: string;
}

const LARK_API_BASE = 'https://open.feishu.cn/open-apis';

export async function getTenantAccessToken(
  appId: string,
  appSecret: string,
): Promise<{ token?: string; error?: string }> {
  try {
    const res = await fetch(
      `${LARK_API_BASE}/auth/v3/tenant_access_token/internal`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
        signal: AbortSignal.timeout(10_000),
      },
    );
    const json = (await res.json()) as {
      code?: number;
      msg?: string;
      tenant_access_token?: string;
    };
    if (json.code !== 0 || !json.tenant_access_token) {
      return { error: json.msg ?? 'token fetch failed' };
    }
    return { token: json.tenant_access_token };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'network error' };
  }
}

export async function sendLarkMessage(
  appId: string,
  appSecret: string,
  chatId: string,
  text: string,
): Promise<LarkSendResult> {
  const { token, error } = await getTenantAccessToken(appId, appSecret);
  if (!token) return { ok: false, error };

  try {
    const res = await fetch(
      `${LARK_API_BASE}/im/v1/messages?receive_id_type=chat_id`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          receive_id: chatId,
          msg_type: 'text',
          content: JSON.stringify({ text }),
        }),
        signal: AbortSignal.timeout(10_000),
      },
    );
    const json = (await res.json()) as { code?: number; msg?: string };
    if (json.code !== 0) {
      return { ok: false, error: json.msg ?? 'send failed' };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'network error' };
  }
}

export interface LarkChatInfo {
  chatId: string;
  name: string;
}

/** 列机器人所在群（im/v1/chats，只回机器人已加入的群；分页取首页 100 条，战队场景够用）。 */
export async function listLarkChats(
  appId: string,
  appSecret: string,
): Promise<{ chats?: LarkChatInfo[]; error?: string }> {
  const { token, error } = await getTenantAccessToken(appId, appSecret);
  if (!token) return { error };
  try {
    const res = await fetch(`${LARK_API_BASE}/im/v1/chats?page_size=100`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10_000),
    });
    const json = (await res.json()) as {
      code?: number;
      msg?: string;
      data?: { items?: { chat_id?: string; name?: string }[] };
    };
    if (json.code !== 0) {
      return { error: json.msg ?? 'list chats failed' };
    }
    const chats = (json.data?.items ?? [])
      .filter((item): item is { chat_id: string; name: string } => Boolean(item.chat_id))
      .map((item) => ({ chatId: item.chat_id, name: item.name ?? item.chat_id }));
    return { chats };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'network error' };
  }
}

/** 建群（im/v1/chats POST）：创建者=机器人自身，自动在群内，无需另拉。 */
export async function createLarkChat(
  appId: string,
  appSecret: string,
  name: string,
): Promise<{ chat?: LarkChatInfo; error?: string }> {
  const { token, error } = await getTenantAccessToken(appId, appSecret);
  if (!token) return { error };
  try {
    const res = await fetch(`${LARK_API_BASE}/im/v1/chats`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ name }),
      signal: AbortSignal.timeout(10_000),
    });
    const json = (await res.json()) as {
      code?: number;
      msg?: string;
      data?: { chat_id?: string; name?: string };
    };
    if (json.code !== 0 || !json.data?.chat_id) {
      return { error: json.msg ?? 'create chat failed' };
    }
    return { chat: { chatId: json.data.chat_id, name: json.data.name ?? name } };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'network error' };
  }
}
