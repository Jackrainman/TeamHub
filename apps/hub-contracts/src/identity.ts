import { z } from 'zod';
import { MemberGradeSchema, MemberPublicSchema, MemberRoleSchema } from './pm-core.js';

/**
 * 轻身份登录契约（IDENTITY-LITE，D-083 §4.2 + 路线 v4 第 2 步）。
 *
 * **双模式一等公民**（模式来源 = `config.json` 的 `identityMode`，SETUP-WIZARD 刀①；模式类 env 已退役）：
 *  - 匿名模式（`identityMode: 'anonymous'`）= 今天的形态，整个身份模块不启用、
 *    共享写口令（TEAMHUB_WRITE_TOKEN 门不变），session 端点禁用（POST/DELETE → 404）。
 *  - 身份模式（`identityMode: 'identity'`）= 匿名可读一切 + 登录才能写。登录 = 选人 + 可选 PIN
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
 * 仅名册投影字段（memberId/displayName/groupId/role/gateReviewer/projectManager），**无 pinHash / 无 PIN**——够前端做
 * 「我的视图」按 memberId 过滤（D-083 I0 例外：本人看本人）+ 角色态判断即可。
 *
 * **快照语义（K1 权限地基）**：`role`/`gateReviewer`/`projectManager` 是**登录当刻的快照**。改角色
 * （PUT /api/members/:id/role）、改验收人名单（PUT gate-reviewer）或授/收项目管理旗标
 * （PUT project-manager）后，**已存在的会话仍持旧值**——须重新登录才刷新前端所见。服务端的敏感
 * 写门（isSuperAdmin/isGateReviewer）另读**实时名册**鉴权、不吃这份快照，故权限判定本身永远最新、不受陈旧快照
 * 影响；快照只喂前端角色态展示。
 */
export const SessionIdentitySchema = z.object({
  memberId: z.string().min(1),
  displayName: z.string().min(1),
  groupId: z.string().min(1),
  role: MemberRoleSchema,
  // optional：旧会话 / 非验收人省略（视同 false）。登录时从名册 Member.gateReviewer 快照。
  gateReviewer: z.boolean().optional(),
  // optional：旧会话 / 非项目管理省略（视同 false）。登录时从名册 Member.projectManager 快照
  // （MEMBER-PM-FLAG，公测补强刀②b——原 superAdmin 角色的正交旗标，前端权限态判它而非 role）。
  projectManager: z.boolean().optional(),
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

/**
 * DELETE /api/members/:id/pin（重置 PIN，公测余项⑦ PIN-RESET）响应：回带该成员**公开视图**（剥 pinHash，
 * 密钥纪律）。**请求无体**。授权语义（路由层）：身份模式 only（匿名 → 404，照 PUT pin 先例）+ 须
 * superAdmin（403）——解决「忘 PIN 后连管理员也无产品通道、只能手工清落盘 pinHash」的缺口。效果 = 清除
 * 目标成员 pinHash：该成员回到「无 pinHash 免 PIN」态，下次登录后经既有 PUT pin 首设流程（firstSetup）
 * 自行重设——重置口本身**绝不代收新 PIN 明文**（管理员不经手他人口令，密钥纪律延续）。
 */
export const ClearPinResponseSchema = z.object({
  member: MemberPublicSchema,
});
export type ClearPinResponse = z.infer<typeof ClearPinResponseSchema>;

/**
 * POST /api/setup/super-admin（初始化首个管理员，K1 权限地基 + MEMBER-PM-FLAG 旗标化 + SETUP-WIZARD-ROSTER
 * 刀② bootstrap 扩展）请求：pin 明文必填（min4 max64，家庭影院级最低强度，服务端 scrypt 散列后落库、
 * 不回存明文）。**身份模式 only**（匿名 → 404，照 PUT pin 先例）。
 *
 * 授权/前置（路由层）：名册尚无任何持「项目管理」旗标成员——否则 409（一次性初始化门；已有管理员后
 * 授/收旗走 PUT /api/members/:id/project-manager）。**两路径**：
 *  - **老路径（无 displayName）**：须已登录，给**登录本人**授旗 + 同笔设 pinHash（先 pin 后旗，防"无 PIN
 *    管理员被免密登录冒用"）。
 *  - **bootstrap 路径（刀② v2「先问你是谁」，给 displayName）**：名册无持旗成员时**豁免登录**（写门钩子
 *    放过本路由，路由内自判）——按姓名认领既有成员行，或顺带新建（groupName 必填、按名 upsert 组；
 *    asGroupLead → role:groupAdmin 组长申报；grade 缺省 freshman、后续名册 CSV 按姓名 upsert 修正），
 *    一笔落库 = 建人 + 授旗（projectManager 缺省 true）+ 设 PIN + **签发会话 cookie（登录态）**。
 *    操作者由此必在名册（原"操作者不在 CSV"问题消解；残余 edge = CSV 同名错拼会 upsert 出重名人，
 *    导入报告回显 created 列表可肉眼发现）。
 * 响应回带该成员公开视图（MemberPublicSchema 剥 pinHash，密钥纪律）。
 */
export const SetupSuperAdminRequestSchema = z.object({
  pin: z.string().min(4).max(64),
  // 见上 bootstrap 路径：四字段皆 optional，只在「先问你是谁」初始化门给。
  displayName: z.string().min(1).optional(),
  groupName: z.string().min(1).optional(),
  asGroupLead: z.boolean().optional(),
  projectManager: z.boolean().optional(),
  grade: MemberGradeSchema.optional(),
});
export type SetupSuperAdminRequest = z.infer<typeof SetupSuperAdminRequestSchema>;

export const SetupSuperAdminResponseSchema = z.object({
  member: MemberPublicSchema,
});
export type SetupSuperAdminResponse = z.infer<typeof SetupSuperAdminResponseSchema>;
