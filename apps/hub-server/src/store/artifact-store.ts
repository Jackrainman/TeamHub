import type { ArtifactRef } from '@teamhub/hub-contracts';

/**
 * artifact 域写入口（STORE-SPLIT-SQLITE，product-redefine-2026-07 §4.4 / §9-③）：图纸/归档物
 * 提交日志——从原 god-interface `GovStore` 按语义拆出的第二个域接口，经交叉类型复合回 `GovStore`
 * （见 gov-store.ts）。**append-only**：只追加/就地换文件指针，无 update-field/delete/list 全家桶。
 */

/**
 * appendArtifact 入参：图纸/归档物提交日志的一条新记录（HUB-ARTIFACT-ARCHIVE-V2，append-only）。
 * 调用方给的字段分两类：
 *   - **人填**：mechanism（机构分组键）/ name / uri + v2 新增分组维度 ownerGroup（机械/电路）/
 *     season（赛季）/ robotCode（车代号 R1/R2）/ 电路 subType（drawing/driver）+ 可选 relatedRepo/relatedCommit。
 *   - **路由派生后并入 draft（C5：server 钉，客户端不给）**：kind（ownerGroup+subType 派生）/ versionNo
 *     （四键 ownerGroup+season+robotCode+mechanism 在全量 artifacts 上自增）/ revision（`v${versionNo}`）。
 * Store 仍补 id + createdAt、**钉 submittedVia=`console`**，故从 draft 剔除 id / createdAt / submittedVia
 * （ArtifactDraft 类型本身不随 v2 变——新字段都只是 ArtifactRef 上的字段，draft 自然携带；store body 零逻辑改动）。
 * **I0**：本 draft 无任何 person 字段（ArtifactRef 永无 person 维度），绝不收提交人——
 * 日志主键 = 组 + 赛季 + 车 + 机构 + 版本 + 归档物，永无 memberId。
 */
export type ArtifactDraft = Omit<
  ArtifactRef,
  'id' | 'createdAt' | 'submittedVia'
>;

/**
 * 图纸/归档物提交日志读写出入口（artifact 域）。仍复用同一 `GovernanceSnapshot`
 * （`artifacts` 是其字段，见 PmCoreStore.getSnapshot），本域只管写方法签名。
 */
export interface ArtifactStore {
  /**
   * 图纸/归档物提交日志追加（POST /api/artifacts，V1-FOLLOWUPS ④）。**append-only**：Store 补 id + createdAt、
   * **钉 submittedVia=`console`**（C5：来源 seam server 钉，请求不收）。**I0**：主键=机构+版本+归档物，永无 memberId。
   */
  appendArtifact(draft: ArtifactDraft): Promise<ArtifactRef>;

  /**
   * 给既有归档物挂上「已上传文件」指针（POST /api/artifacts/:id/upload，HUB-ARTIFACT-STORE-MECH 本地卷版）。
   * **就地 idx 改**（非 append，不新增行、不动 versionNo）——只把 storedFile 换成新文件指针，故重传=覆盖语义。
   * id 不存在回 `null`（路由 → 404）。**I0**：storedFile 无人员维度；字节由路由层先落本地卷，本方法只写索引/校验和。
   */
  setArtifactFile(
    id: string,
    file: NonNullable<ArtifactRef['storedFile']>,
  ): Promise<ArtifactRef | null>;
}
