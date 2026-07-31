import { z } from 'zod';
import { ArtifactRefSchema } from './schemas.js';

// 图纸归档物「写侧请求契约」域文件（自 pm-requests.ts 拆出，照 RelayBoardResponseSchema 迁 relay.ts 先例）。
// I0 图纸日志永无人维度：ArtifactRef 无 person 字段，写请求绝不收提交人/确认人。

/**
 * POST /api/artifacts：图纸档案 v2「学科组分组的图纸版本库」写侧请求契约（HUB-ARTIFACT-ARCHIVE-V2，append-only）。
 * 人填字段：ownerGroup（学科组）+ season（赛季 "25"）+ robotCode（机器人代号 R1/R2）+ mechanism（机构，分组键）
 * + name/uri + 可选 subType（子类型，如电路的图纸/驱动）+ 可选 relatedRepo/relatedCommit。
 *
 * **C5 来源 seam 由 server/路由钉，客户端不给**——故 omit submittedVia（store 钉 `console`）+ kind/versionNo/revision
 *（路由经纯函数派生：versionNo=nextArtifactVersionNo 四键自增、kind=deriveArtifactKind、revision=`v${versionNo}`）。
 *
 * **I0 图纸日志永无人维度**：ArtifactRef 无任何 person 字段，本请求也绝不收提交人/确认人——日志主键是
 * 学科组 + 赛季 + 机器人 + 机构 + 版本 + 归档物，不是「谁提交」（与 PmCreatePanel 的 confirmer 不同；ArtifactRef
 * 无 confirmedBy，也不得新增）。**C3 append-only**：只追加、不开 update/delete；版本回退按 supersede（追加新版）。
 * **G4**：不引入 dueDate。
 *
 * base ArtifactRefSchema 把这些字段标 optional（向后兼容既有 8 条种子 + 旧 JSON），故这里用 `.extend` 把
 * ownerGroup/season/robotCode/mechanism 收紧为写侧必填（不动 ArtifactRefSchema 本身——否则旧种子的可选字段
 * 会破坏 fail-closed 加载与读契约）。
 *
 * **AUDIT-DEBT-2026-07 §9-④ 解绑**：本工厂函数理应租户中立，此前却硬 `import { ROBOTICS_OWNER_GROUP_VALUES }
 * from './verticals/robotics.js'` 把机器人战队的 ownerGroup 闭集词汇焊进核心契约（含"电路组必须带 subType"这条
 * robotics 专属业务规则）。改为工厂函数——ownerGroup 闭集值 + "谁必须带 subType"规则经**参数注入**，核心本身不再
 * 持有任何 robotics 字面量；robotics 具体值只在 `verticals/robotics.ts`（本仓库当前唯一已注册的垂直包/装配点）里
 * 灌入，见该文件的 `CreateArtifactRequestSchema` 具体化导出（供 server.ts/console 既有静态 import 零改动消费，
 * 走包入口 `@teamhub/hub-contracts` 的 `export *`，非本文件）。
 */
export function buildCreateArtifactRequestSchema(
  ownerGroupValues: readonly [string, ...string[]],
  subTypeRule?: { requiredForGroup: string; groupLabel: string },
) {
  return ArtifactRefSchema.omit({
    id: true,
    createdAt: true,
    submittedVia: true,
    kind: true,
    versionNo: true,
    revision: true,
    // storedFile 服务器独占（仅上传路由写），登记时禁客户端注入文件元数据。
    storedFile: true,
  })
    .extend({
      ownerGroup: z.enum(ownerGroupValues),
      season: z.string().min(1),
      // 适配机器人：自由串手填（真实战队机器人编号会变，如 26R1 / 26R3-试制 / 通用）。
      // 是版本属性、不进版本键（server 版本号按 组别+赛季+机构 三键自增），故放宽为任意非空串安全。
      robotCode: z.string().min(1),
      mechanism: z.string().min(1),
      subType: z.enum(['drawing', 'driver']).optional(),
    })
    .superRefine((data, ctx) => {
      // subType（图纸/驱动）只属于 subTypeRule 指定的那一个组（如机器人租户的"电路"）；
      // 未传 subTypeRule（租户无此细分需求）时不做任何 subType 强制/禁止。
      if (!subTypeRule) return;
      const { requiredForGroup, groupLabel } = subTypeRule;
      if (data.ownerGroup === requiredForGroup && data.subType === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${groupLabel}组归档物必须指定 subType（drawing / driver）`,
          path: ['subType'],
        });
      }
      if (data.ownerGroup !== requiredForGroup && data.subType !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `只有${groupLabel}组归档物可带 subType`,
          path: ['subType'],
        });
      }
    });
}
export const CreateArtifactResponseSchema = z.object({
  artifact: ArtifactRefSchema,
});
// POST /api/artifacts/:id/upload 响应：回带写入 storedFile 后的整条归档物（含文件指针）。
export const UploadArtifactResponseSchema = z.object({
  artifact: ArtifactRefSchema,
});

// CreateArtifactRequestSchema/CreateArtifactRequest 不在本文件——ownerGroup 闭集值经参数注入
// （见 buildCreateArtifactRequestSchema 头部注释），具体化 + 对应类型导出移至 verticals/robotics.ts。
export type CreateArtifactResponse = z.infer<
  typeof CreateArtifactResponseSchema
>;
export type UploadArtifactResponse = z.infer<
  typeof UploadArtifactResponseSchema
>;
