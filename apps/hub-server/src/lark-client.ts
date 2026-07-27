export interface LarkSendResult {
  ok: boolean;
  error?: string;
}

export async function getTenantAccessToken(
  appId: string,
  appSecret: string,
): Promise<{ token?: string; error?: string }> {
  try {
    const res = await fetch(
      'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal',
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
      'https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id',
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
