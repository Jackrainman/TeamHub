import { z } from 'zod';
import {
  LarkConfigResponseSchema,
  LarkCreateChatResponseSchema,
  LarkConfigSaveResponseSchema,
  LarkChatsResponseSchema,
  type LarkConfigResponse,
  type LarkConfigSaveRequest,
  type LarkConfigSaveResponse,
  type LarkChatsResponse,
  type LarkCreateChatRequest,
  type LarkCreateChatResponse,
} from '@teamhub/hub-contracts';
import type { HttpContext } from '../../api/http';
import { fetchJson, postJson, sendJson } from '../../api/http';

/**
 * 设置页飞书集成配置 API 分段（ARCH-UNIFY A4；前身 segments/members.ts 的 lark 半）。
 * 端点对照 server modules/integrations/lark.ts。
 */
export interface SettingsSegment {
  getLarkConfig(): Promise<LarkConfigResponse>;
  saveLarkConfig(req: LarkConfigSaveRequest): Promise<LarkConfigSaveResponse>;
  resetLarkConfig(): Promise<{ ok: boolean }>;
  getLarkChats(): Promise<LarkChatsResponse>;
  createLarkChat(req: LarkCreateChatRequest): Promise<LarkCreateChatResponse>;
}

export function createSettingsSegment(ctx: HttpContext): SettingsSegment {
  const { baseUrl, fetcher, writeToken } = ctx;
  return {
    async getLarkConfig() {
      return fetchJson(`${baseUrl}/api/integrations/lark`, LarkConfigResponseSchema, fetcher);
    },
    async saveLarkConfig(req: LarkConfigSaveRequest) {
      return sendJson('PUT', `${baseUrl}/api/integrations/lark`, req, LarkConfigSaveResponseSchema, fetcher, writeToken);
    },
    async resetLarkConfig() {
      return sendJson('DELETE', `${baseUrl}/api/integrations/lark`, undefined, z.object({ ok: z.boolean() }), fetcher, writeToken);
    },
    async getLarkChats() {
      return fetchJson(`${baseUrl}/api/integrations/lark/chats`, LarkChatsResponseSchema, fetcher);
    },
    async createLarkChat(req: LarkCreateChatRequest) {
      return postJson(`${baseUrl}/api/integrations/lark/chats`, req, LarkCreateChatResponseSchema, fetcher, writeToken);
    },
  };
}
