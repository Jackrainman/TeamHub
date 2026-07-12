import { z } from 'zod';
import { MemberPublicSchema, MemberRoleSchema } from './pm-core.js';

/**
 * 轻身份登录契约（IDENTITY-LITE，D-083 §4.2 + 路线 v4 第 2 步）。
 *
 * **双模式一等公民**：
 *  - 匿名模式（`TEAMHUB_IDENTITY_MODE` 未设 / `anonymous`）= 今天的形态，整个身份模块不启用、
 *    共享写口令（TEAMHUB_WRITE_TOKEN 门不变），session 端点禁用（POST/DELETE → 404）。
 *  - 身份模式（`TEAMHUB_IDENTITY_MODE=identity`）= 匿名可读一切 + 登录才能写。登录 = 选人 + 可选 PIN
 *    （家庭影院级重量，无邮箱注册）。有 pinHash 的成员须验 PIN，无 pinHash 免 PIN。
 *
 * **密钥纪律**：本文件契约**绝不**含 pinHash——登录只收 memberId + 明文 pin（一次性校验、不回存），
 * 身份/名册响应一律走 `MemberPublicSchema`（剥 pinHash）。
 */

/** 部署身份模式（供 GET /api/session 回报，前端据此决定是否显示登录 UI）。 */
export const IdentityModeSchema = z.enum(['anonymous', 'identity']);
export type IdentityMode = z.infer<typeof IdentityModeSchema>;

/**
 * 当前会话身份（服务端从 session 表解析、经 GET /api/session 与登录成功响应回带）。
 * 仅名册投影字段（memberId/displayName/groupId/role），**无 pinHash / 无 PIN**——够前端做
 * 「我的视图」按 memberId 过滤（D-083 I0 例外：本人看本人）+ 角色态判断即可。
 */
export const SessionIdentitySchema = z.object({
  memberId: z.string().min(1),
  displayName: z.string().min(1),
  groupId: z.string().min(1),
  role: MemberRoleSchema,
});
export type SessionIdentity = z.infer<typeof SessionIdentitySchema>;

/**
 * POST /api/session（登录）请求：选人 + 可选 PIN。
 * 有 pinHash 的成员必须给 pin 且校验通过；无 pinHash 的成员免 PIN（pin 可省，给了也忽略）。
 * **防枚举**：任何失败（人不存在 / PIN 错 / 该给 PIN 没给）统一 401、不区分原因（路由层保证）。
 */
export const SessionRequestSchema = z.object({
  memberId: z.string().min(1),
  pin: z.string().min(1).optional(),
});
export type SessionRequest = z.infer<typeof SessionRequestSchema>;

/**
 * GET /api/session / 登录成功 / 登出 的统一响应：报当前部署模式 + 当前身份（未登录 = null）。
 * 匿名模式恒 `{ mode: 'anonymous', session: null }`（明确禁用态）。
 */
export const SessionResponseSchema = z.object({
  mode: IdentityModeSchema,
  session: SessionIdentitySchema.nullable(),
});
export type SessionResponse = z.infer<typeof SessionResponseSchema>;

/**
 * PUT /api/members/:id/pin（设/改 PIN）请求：只收明文 pin（服务端 scrypt 散列后落库，不回存明文）。
 * 授权语义（路由层）：身份模式下须**本人会话**，或该 member **尚无 pinHash**（首次认领设置）。
 * 匿名模式此端点禁用（→ 404）。min 4 位（家庭影院级最低强度），上限防滥用。
 */
export const SetPinRequestSchema = z.object({
  pin: z.string().min(4).max(64),
});
export type SetPinRequest = z.infer<typeof SetPinRequestSchema>;

/** PUT /api/members/:id/pin 响应：回带该成员的**公开视图**（剥 pinHash，密钥纪律）。 */
export const SetPinResponseSchema = z.object({
  member: MemberPublicSchema,
});
export type SetPinResponse = z.infer<typeof SetPinResponseSchema>;
