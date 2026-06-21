import { z } from 'zod';

import { ActorRefSchema, isoDateTimeSchema } from './common.js';

export const HubEventSourceSchema = z.enum([
  'lark',
  'hermes',
  'xiaolongxia',
  'claude-code',
  'console',
  'git',
  'system',
]);

export const HubEventTypeSchema = z.enum([
  'message.received',
  'command.received',
  'skill.requested',
  'skill.completed',
  'bridge.status.updated',
  'git.push',
  'release.created',
  'artifact.uploaded',
  'adapter.health.changed',
  'system.health.checked',
]);

export const HubEventSchema = z.object({
  id: z.string().min(1),
  source: HubEventSourceSchema,
  type: HubEventTypeSchema,
  actor: ActorRefSchema.optional(),
  createdAt: isoDateTimeSchema,
  correlationId: z.string().min(1).optional(),
  payload: z.unknown(),
});

// @deprecated 仅供 bot 自描述（lark-gateway / lark-toolkit / pf-skills 的 hub.ts），
// 非 hub 集成列表。集成列表已三分为 BotChannel / AgentBackend / DataSource（见下）。
// 同理下方 AdapterHealth/Capabilities/Invoke*ResponseSchema 与 AdaptersResponseSchema 一并弃用保留。
export const AdapterDescriptorSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['ai', 'tool', 'ingress', 'git', 'artifact']),
  displayName: z.string().min(1),
  status: z.enum(['enabled', 'disabled', 'degraded', 'unconfigured']),
  capabilities: z.array(z.string().min(1)),
  healthCheckedAt: isoDateTimeSchema.optional(),
});

export const AdapterHealthResponseSchema = z.object({
  adapterId: z.string().min(1),
  status: z.enum(['enabled', 'disabled', 'degraded', 'unconfigured']),
  checkedAt: isoDateTimeSchema,
  detail: z.string().min(1).optional(),
});

export const AdapterCapabilitiesResponseSchema = z.object({
  adapterId: z.string().min(1),
  // (N1) z.literal('mock') → z.enum：mock 实现恒回 'mock'，但真 adapter 可回 'real'，避免前端 Zod parse 崩 UI。
  mode: z.enum(['mock', 'real']),
  capabilities: z.array(z.string().min(1)),
});

export const AdapterInvokeRequestSchema = z.object({
  input: z.unknown().optional(),
  correlationId: z.string().min(1).optional(),
});

export const AdapterInvokeResponseSchema = z.object({
  adapterId: z.string().min(1),
  // (N1) z.literal → z.enum：放宽真 adapter 的 mode:'real'/status:'queued'|'rejected'，mock 恒回 'mock'/'accepted'。
  mode: z.enum(['mock', 'real']),
  status: z.enum(['accepted', 'queued', 'rejected']),
  createdAt: isoDateTimeSchema,
  correlationId: z.string().min(1).optional(),
  output: z.object({
    message: z.string().min(1),
    inputEcho: z.unknown().optional(),
  }),
});

// ---------------------------------------------------------------------------
// 集成模型三分（地基重建）：BotChannel（IM 通信渠道）/ AgentBackend（技能执行器）/
// DataSource（只读数据源）。三者本质不同，各自建模，不再共用扁平 AdapterDescriptor。
// ---------------------------------------------------------------------------

// 公共 BOT 接口：飞书 / 微信 / QQ。双向（inbound 收命令 + outbound 推通知/回复）。
// status 用连接型枚举（诚实反映连没连，而非占位 enabled）。
export const BotChannelSchema = z.object({
  id: z.string().min(1),
  platform: z.enum(['feishu', 'wechat', 'qq']),
  displayName: z.string().min(1),
  status: z.enum(['connected', 'disconnected', 'unconfigured']),
  credentialsConfigured: z.boolean(),
  inbound: z.boolean(),
  outbound: z.boolean(),
  healthCheckedAt: isoDateTimeSchema.optional(),
});

// Agent 接口：hermes / openclaw / claude-code。出站调用执行技能。
// 唯一拥有 invoke/health/capabilities 契约的物种（见 AgentBackend*ResponseSchema）。
export const AgentBackendSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1),
  mode: z.enum(['mock', 'real']),
  status: z.enum(['enabled', 'disabled', 'degraded', 'unconfigured']),
  capabilities: z.array(z.string().min(1)),
  healthCheckedAt: isoDateTimeSchema.optional(),
});

// 数据源（出处锚）：git-forge / artifact-store。只读，无 invoke/health。
// artifact-store 的 sourceRef 预留 Filebrowser 落点（filebrowser://…）。
export const DataSourceSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1),
  kind: z.enum(['git', 'artifact']),
  status: z.enum(['enabled', 'disabled', 'degraded', 'unconfigured']),
  sourceRef: z.string().min(1),
});

// AgentBackend invoke/health/capabilities 契约（由旧 Adapter* 迁移，字段 adapterId→backendId）。
export const AgentBackendHealthResponseSchema = z.object({
  backendId: z.string().min(1),
  status: z.enum(['enabled', 'disabled', 'degraded', 'unconfigured']),
  checkedAt: isoDateTimeSchema,
  detail: z.string().min(1).optional(),
});

export const AgentBackendCapabilitiesResponseSchema = z.object({
  backendId: z.string().min(1),
  // (N1) z.literal('mock') → z.enum：mock 实现恒回 'mock'，但真 backend 可回 'real'，避免前端 Zod parse 崩 UI。
  mode: z.enum(['mock', 'real']),
  capabilities: z.array(z.string().min(1)),
});

export const AgentBackendInvokeRequestSchema = z.object({
  input: z.unknown().optional(),
  correlationId: z.string().min(1).optional(),
});

export const AgentBackendInvokeResponseSchema = z.object({
  backendId: z.string().min(1),
  // (N1) z.literal → z.enum：放宽真 backend 的 mode:'real'/status:'queued'|'rejected'，mock 恒回 'mock'/'accepted'。
  mode: z.enum(['mock', 'real']),
  status: z.enum(['accepted', 'queued', 'rejected']),
  createdAt: isoDateTimeSchema,
  correlationId: z.string().min(1).optional(),
  output: z.object({
    message: z.string().min(1),
    inputEcho: z.unknown().optional(),
  }),
});

export const BridgeMemberStateSchema = z.object({
  memberId: z.string().min(1),
  displayName: z.string().min(1),
  currentTask: z.string().min(1).optional(),
  status: z.enum(['idle', 'working', 'blocked', 'offline']),
  blockedOn: z.string().min(1).optional(),
  neededSkills: z.array(z.string().min(1)),
  updatedAt: isoDateTimeSchema,
});

export const GitRepoRefSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  remoteUrl: z.string().min(1),
  defaultBranch: z.string().min(1),
  forge: z.enum(['forgejo', 'gitea', 'bare-git', 'github']).optional(),
});

export const ArtifactRefSchema = z.object({
  id: z.string().min(1),
  kind: z.enum([
    'firmware',
    'log',
    'rosbag',
    'image',
    'video',
    'report',
    'other',
  ]),
  name: z.string().min(1),
  // 地址（URI）可选：登记时允许只记机构/版本、文件链接事后补（用户要求"地址改为可填项"）。
  uri: z.string().min(1).optional(),
  relatedRepo: z.string().min(1).optional(),
  relatedCommit: z.string().min(1).optional(),
  // 图纸提交日志/时间线维度（v1 新增，全可选、向后兼容）：
  // mechanism = 机构/部件（底盘 / 抬升机构 / 夹爪），是日志的分组键——同一机构多条迭代记录。
  // revision = 第几版（"v3" / "R2-v1.2"）。submittedVia = 来源 seam（console / git 录入为主）。
  mechanism: z.string().min(1).optional(),
  revision: z.string().min(1).optional(),
  submittedVia: z.enum(['git', 'lark', 'console']).optional(),
  // 图纸档案 v2 维度（HUB-ARTIFACT-ARCHIVE-V2，全可选、向后兼容）：8 条 seed + 旧持久化 JSON
  // 经同一 schema 解析，缺这些字段不能炸——故一律 .optional()，旧裸数据落「未分组/历史」桶、不参与自增。
  // ownerGroup = 组别（派生分组根）：机械/电路/电控/视觉。season = 赛季年份 "26"。
  // robotCode = 适配机器人 "R1"/"R2"/"universal"（通用·不上固定机器人）；是版本的属性、非分组父级，
  //   故一条机构的版本线可跨机器人（v2 适配 R2、v3 适配 R1），版本号仍按机构连续。
  // versionNo = 自增版本号（server 派生，键=组别+赛季+机构，不含机器人）。
  // subType = 子类型 图纸/驱动（仅电路带）。I0：均无人员维度。
  ownerGroup: z.enum(['mechanical', 'electrical', 'ec', 'vision']).optional(),
  season: z.string().min(1).optional(),
  robotCode: z.string().min(1).optional(),
  versionNo: z.number().int().positive().optional(),
  subType: z.enum(['drawing', 'driver']).optional(),
  createdAt: isoDateTimeSchema,
  // 已上传真实文件的指针（HUB-ARTIFACT-STORE-MECH 本地卷版，全可选、向后兼容）：
  // 字节落本地卷 TEAMHUB_ARTIFACT_FILES_DIR（D-025/D-038：二进制不进 git），此处只存索引/校验和——
  // 旧 8 seed + 旧持久化 JSON 无此字段仍解析。filename=存储基名 `<id><ext>`、ext 含前导点（对齐 extname()）。
  // 服务器独占：仅上传路由经 store.setArtifactFile 写，登记写契约 omit 之、禁客户端注入。I0：无人员维度。
  storedFile: z
    .object({
      filename: z.string().min(1),
      ext: z.string().min(1),
      sizeBytes: z.number().int().nonnegative(),
      contentType: z.string().min(1),
      sha256: z.string().length(64),
      uploadedAt: isoDateTimeSchema,
    })
    .optional(),
});

export const ErrorResponseSchema = z.object({
  detail: z.string().min(1),
});

export const HubEventsResponseSchema = z.object({
  events: z.array(HubEventSchema),
  nextCursor: z.string().min(1).nullable(),
});

export const AdaptersResponseSchema = z.object({
  adapters: z.array(AdapterDescriptorSchema),
});

export const BotChannelsResponseSchema = z.object({
  botChannels: z.array(BotChannelSchema),
});

export const AgentBackendsResponseSchema = z.object({
  agentBackends: z.array(AgentBackendSchema),
});

export const DataSourcesResponseSchema = z.object({
  dataSources: z.array(DataSourceSchema),
});

export const BridgeMembersResponseSchema = z.object({
  members: z.array(BridgeMemberStateSchema),
});

export const GitReposResponseSchema = z.object({
  repos: z.array(GitRepoRefSchema),
});

export const ArtifactsResponseSchema = z.object({
  artifacts: z.array(ArtifactRefSchema),
});

export type HubEventSource = z.infer<typeof HubEventSourceSchema>;
export type HubEventType = z.infer<typeof HubEventTypeSchema>;
export type HubEvent = z.infer<typeof HubEventSchema>;
export type AdapterDescriptor = z.infer<typeof AdapterDescriptorSchema>;
export type AdapterHealthResponse = z.infer<
  typeof AdapterHealthResponseSchema
>;
export type AdapterCapabilitiesResponse = z.infer<
  typeof AdapterCapabilitiesResponseSchema
>;
export type AdapterInvokeRequest = z.infer<typeof AdapterInvokeRequestSchema>;
export type AdapterInvokeResponse = z.infer<typeof AdapterInvokeResponseSchema>;
export type BotChannel = z.infer<typeof BotChannelSchema>;
export type AgentBackend = z.infer<typeof AgentBackendSchema>;
export type DataSource = z.infer<typeof DataSourceSchema>;
export type AgentBackendHealthResponse = z.infer<
  typeof AgentBackendHealthResponseSchema
>;
export type AgentBackendCapabilitiesResponse = z.infer<
  typeof AgentBackendCapabilitiesResponseSchema
>;
export type AgentBackendInvokeRequest = z.infer<
  typeof AgentBackendInvokeRequestSchema
>;
export type AgentBackendInvokeResponse = z.infer<
  typeof AgentBackendInvokeResponseSchema
>;
export type BridgeMemberState = z.infer<typeof BridgeMemberStateSchema>;
export type GitRepoRef = z.infer<typeof GitRepoRefSchema>;
export type ArtifactRef = z.infer<typeof ArtifactRefSchema>;
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
export type HubEventsResponse = z.infer<typeof HubEventsResponseSchema>;
export type AdaptersResponse = z.infer<typeof AdaptersResponseSchema>;
export type BotChannelsResponse = z.infer<typeof BotChannelsResponseSchema>;
export type AgentBackendsResponse = z.infer<typeof AgentBackendsResponseSchema>;
export type DataSourcesResponse = z.infer<typeof DataSourcesResponseSchema>;
export type BridgeMembersResponse = z.infer<
  typeof BridgeMembersResponseSchema
>;
export type GitReposResponse = z.infer<typeof GitReposResponseSchema>;
export type ArtifactsResponse = z.infer<typeof ArtifactsResponseSchema>;
