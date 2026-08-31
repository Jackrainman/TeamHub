import type { ArtifactRef } from '@teamhub/hub-contracts';

/**
 * 归档物域 repository port（ARCH-UNIFY A4；前身 store/artifact-store.ts 的 ArtifactStore +
 * GovStore.getSnapshot().artifacts 读路径）。
 *
 * **append-only**：只追加/就地换文件指针，无 update-field/delete/list 全家桶（C3）。
 * **I0**：ArtifactRef 永无 person 字段——日志主键 = 组 + 赛季 + 车 + 机构 + 版本 + 归档物，永无 memberId。
 */

/**
 * appendArtifact 入参：图纸/归档物提交日志的一条新记录（HUB-ARTIFACT-ARCHIVE-V2，append-only）。
 * 调用方给的字段分两类：
 *   - **人填**：mechanism（机构分组键）/ name / uri + v2 新增分组维度 ownerGroup（机械/电路）/
 *     season（赛季）/ robotCode（车代号 R1/R2）/ 电路 subType（drawing/driver）+ 可选 relatedRepo/relatedCommit。
 *   - **service 派生后并入 draft（C5：server 钉，客户端不给）**：kind（ownerGroup+subType 派生）/ versionNo
 *     （三键 ownerGroup+season+mechanism 在全量 artifacts 上自增）/ revision（`v${versionNo}`）。
 * Repository 仍补 id + createdAt、**钉 submittedVia=`console`**，故从 draft 剔除 id / createdAt / submittedVia。
 */
export type ArtifactDraft = Omit<
  ArtifactRef,
  'id' | 'createdAt' | 'submittedVia'
>;

export interface ArtifactRepository {
  /** 提交日志全量读（GET /api/artifacts + 版本号自增派生）。 */
  listArtifacts(): Promise<ArtifactRef[]>;
  /**
   * 图纸/归档物提交日志追加（POST /api/artifacts，V1-FOLLOWUPS ④）。**append-only**：Repository 补 id + createdAt、
   * **钉 submittedVia=`console`**（C5：来源 seam server 钉，请求不收）。
   */
  appendArtifact(draft: ArtifactDraft): Promise<ArtifactRef>;
  /**
   * 给既有归档物挂上「已上传文件」指针（POST /api/artifacts/:id/upload，HUB-ARTIFACT-STORE-MECH 本地卷版）。
   * **就地改**（非 append，不新增行、不动 versionNo）——只把 storedFile 换成新文件指针，故重传=覆盖语义。
   * id 不存在回 `null`（service → not_found）。
   */
  setArtifactFile(
    id: string,
    file: NonNullable<ArtifactRef['storedFile']>,
  ): Promise<ArtifactRef | null>;
}

/** 跨域只读窄口（§8.2）：baseline 证据引用校验等只需要查 id 存在性，不拿完整 repository。 */
export type ArtifactReadPort = Pick<ArtifactRepository, 'listArtifacts'>;

/** C5：来源 seam server 钉——提交日志只从 console 录入（git/lark 录入尚未开口）。 */
export const ARTIFACT_SUBMITTED_VIA: NonNullable<ArtifactRef['submittedVia']> = 'console';

/**
 * 实体创建工厂（§8.3：ID/时间戳/来源钉定的唯一落点，不在多个 adapter 复制）。
 * `id` 由 repository 的序列给、`now` 由 Clock 给。
 */
export function buildCreatedArtifact(draft: ArtifactDraft, id: string, now: string): ArtifactRef {
  return { ...draft, id, submittedVia: ARTIFACT_SUBMITTED_VIA, createdAt: now };
}

/**
 * 归档物文件字节存储窄口（infrastructure；本模块 local-file-storage.ts 给本地卷实现，
 * 前身 src/artifact-storage.ts——唯一触碰 TEAMHUB_ARTIFACT_FILES_DIR 的地方，换对象存储只换该实现）。
 * 文件按 `<artifactId><ext>` 命名；`read` 内含路径逃逸护栏（relative 不越出 dir）。
 */
export interface ArtifactFileStorage {
  /** 本地卷目录（未配置 → null，service 转「未配置归档物文件目录」）。每次调用读 env。 */
  dir(): string | null;
  /** 文件内容 sha256（hex）。 */
  sha256(buf: Buffer): string;
  /** 原子写一份文件并回写存储基名 `<id><ext>`；顺带清掉同 id 异后缀的陈旧兄弟。 */
  write(dir: string, id: string, ext: string, buf: Buffer): Promise<string>;
  /** 尽力删某归档物的所有落盘文件（元数据写失败时清孤儿，避免「有字节无指针」）。 */
  remove(dir: string, id: string): Promise<void>;
  /** 读某归档物的落盘文件（含 ext 与内容，内含路径逃逸护栏）；无文件 → null。 */
  read(dir: string, id: string): Promise<{ filename: string; ext: string; content: Buffer } | null>;
}
