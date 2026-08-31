import { z } from 'zod';

import { isoDateTimeSchema } from '../../common.js';

/**
 * 归档物实体契约（治理域，V1-FOLLOWUPS ④ / HUB-ARTIFACT-ARCHIVE-V2）。原住 `schemas.ts`（集成杂物间），
 * CONTRACTS-SCHEMAS 刀挪回治理域独立成文——ArtifactRef 是 `GovernanceSnapshot.artifacts` 的实体
 *（见 attribution.ts），非 bot/adapter 集成契约，Placement 上应与 pm-core 同域而非与 HubEvent 同居。
 */
export const ArtifactRefSchema = z.object({
  id: z.string().min(1),
  // HUB-MODULARIZATION 第6步（词汇注入收口）：由闭集 z.enum 放宽为开放 string——归档物种类是
  // 租户词汇，非核心结构。机器人租户已知值（含 firmware/rosbag）见
  // `verticals/robotics.ts:ROBOTICS_ARTIFACT_KIND_VALUES`；闭集校验（如需要）下沉到路由层
  // VocabularyRegistry 校验器（尚未实现，见 docs/domains/system.md），
  // 在该校验器补齐前对非法值不做闭集校验，只能靠测试兜底（放弃编译期枚举安全换运行期可注入）。
  kind: z.string().min(1),
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
  // HUB-MODULARIZATION 第6步：由闭集 z.enum 放宽为开放 string（本就 optional，最易先示范）——
  // 机器人租户已知值见 `verticals/robotics.ts:ROBOTICS_OWNER_GROUP_VALUES`；写侧
  // `pm-requests.ts:CreateArtifactRequestSchema` 仍收紧为该值的 z.enum（过渡态，同上）。
  ownerGroup: z.string().min(1).optional(),
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

export type ArtifactRef = z.infer<typeof ArtifactRefSchema>;
