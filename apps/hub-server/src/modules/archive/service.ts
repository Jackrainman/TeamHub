import { extname } from 'node:path';

import { deriveArtifactKind, nextArtifactVersionNo } from '@teamhub/hub-contracts';
import type { ArtifactRef, CreateArtifactRequest } from '@teamhub/hub-contracts';
import { ApplicationError } from '../../application/application-error.js';
import type { Clock } from '../../clock.js';
import type {
  ArtifactDraft,
  ArtifactFileStorage,
  ArtifactRepository,
} from './repository.js';

/** 上传允许的后缀 → 登记 contentType（业务允许清单，随 service 而不随存储实现）。 */
const ARTIFACT_ALLOWED_EXT = new Map<string, string>([
  ['.step', 'application/step'],
  ['.stp', 'application/step'],
  ['.iges', 'model/iges'],
  ['.igs', 'model/iges'],
  ['.sldprt', 'application/octet-stream'],
  ['.sldasm', 'application/octet-stream'],
  ['.slddrw', 'application/octet-stream'],
  ['.dwg', 'application/acad'],
  ['.f3d', 'application/octet-stream'],
  ['.pdf', 'application/pdf'],
  ['.md', 'text/markdown'],
  ['.txt', 'text/plain'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.zip', 'application/zip'],
  ['.bin', 'application/octet-stream'],
  ['.hex', 'application/octet-stream'],
  ['.mp4', 'video/mp4'],
  ['.mov', 'video/quicktime'],
  ['.webm', 'video/webm'],
]);

/** 下载响应的 contentType：文档类给可读 MIME，其余一律 octet-stream（与原路由行为一致）。 */
function downloadContentType(ext: string): string {
  if (ext === '.md') return 'text/markdown; charset=utf-8';
  if (ext === '.txt') return 'text/plain; charset=utf-8';
  return 'application/octet-stream';
}

export interface ArchiveDownload {
  artifact: ArtifactRef;
  downloadName: string;
  contentType: string;
  content: Buffer;
}

/**
 * 归档物域 application service（ARCH-UNIFY A4；前身 routes/archive.ts 的路由内编排）。
 * 用例：提交日志登记（versionNo/kind/revision 派生在此，C5 服务端钉）、文件上传（字节落卷 +
 * 元数据回写，失败清孤儿）、文件下载（含路径逃逸护栏，经 ArtifactFileStorage port）。
 */
export class ArchiveService {
  constructor(
    private readonly repository: ArtifactRepository,
    private readonly storage: ArtifactFileStorage,
    private readonly clock: Clock,
  ) {}

  listArtifacts(): Promise<ArtifactRef[]> {
    return this.repository.listArtifacts();
  }

  /**
   * POST /api/artifacts：versionNo = 三键（ownerGroup+season+mechanism）自增（robotCode 不进键），
   * kind = ownerGroup+subType 派生，revision = `v${versionNo}`；非电路组剥 subType（schema 已挡，双保险）。
   */
  async createArtifact(data: CreateArtifactRequest): Promise<ArtifactRef> {
    const { ownerGroup, season, mechanism, subType } = data;
    const artifacts = await this.repository.listArtifacts();
    const versionNo = nextArtifactVersionNo(artifacts, { ownerGroup, season, mechanism });
    const kind = deriveArtifactKind(ownerGroup, subType);
    const revision = `v${versionNo}`;
    const draft: ArtifactDraft =
      ownerGroup !== 'electrical'
        ? (() => { const { subType: _drop, ...rest } = data; void _drop; return { ...rest, kind, versionNo, revision }; })()
        : { ...data, kind, versionNo, revision };
    return this.repository.appendArtifact(draft);
  }

  /**
   * POST /api/artifacts/:id/upload：字节先落卷（原子写 + 清异后缀旧兄弟），元数据（含 sha256/大小/
   * contentType/uploadedAt）再回写 repository；回写失败删刚落的文件，避免「有字节无指针」孤儿。
   */
  async uploadFile(id: string, upload: { filename?: string; buf: Buffer }): Promise<ArtifactRef> {
    const dir = this.storage.dir();
    if (!dir) {
      throw new ApplicationError('validation', 'ARTIFACT_STORAGE_UNCONFIGURED', '未配置归档物文件目录');
    }
    const artifacts = await this.repository.listArtifacts();
    if (!artifacts.some((a) => a.id === id)) {
      throw new ApplicationError('not_found', 'ARTIFACT_NOT_FOUND', '归档物不存在');
    }
    const ext = extname(upload.filename ?? '').toLowerCase();
    const contentType = ARTIFACT_ALLOWED_EXT.get(ext);
    if (!contentType) {
      throw new ApplicationError(
        'validation',
        'ARTIFACT_UNSUPPORTED_EXT',
        `不支持的文件类型：${ext || '（无后缀）'}`,
      );
    }
    const sha256 = this.storage.sha256(upload.buf);
    const sizeBytes = upload.buf.length;
    // 落盘失败是基础设施故障（非领域错误）：抛原始错误，route 映射 500。
    const filename = await this.storage.write(dir, id, ext, upload.buf);
    const meta = { filename, ext, sizeBytes, contentType, sha256, uploadedAt: this.clock.now().toISOString() };
    try {
      const updated = await this.repository.setArtifactFile(id, meta);
      if (!updated) {
        await this.storage.remove(dir, id).catch(() => {});
        throw new ApplicationError('not_found', 'ARTIFACT_NOT_FOUND', '归档物不存在');
      }
      return updated;
    } catch (err) {
      if (err instanceof ApplicationError) throw err;
      await this.storage.remove(dir, id).catch(() => {});
      throw err; // repository 故障：route 映射 500
    }
  }

  /** GET /api/artifacts/:id/download：元数据 + 字节一起出（字节经存储 port，含逃逸护栏）。 */
  async download(id: string): Promise<ArchiveDownload> {
    const dir = this.storage.dir();
    if (!dir) {
      throw new ApplicationError('not_found', 'ARTIFACT_STORAGE_UNCONFIGURED', '未配置归档物文件目录');
    }
    const artifacts = await this.repository.listArtifacts();
    const artifact = artifacts.find((a) => a.id === id);
    if (!artifact) {
      throw new ApplicationError('not_found', 'ARTIFACT_NOT_FOUND', '归档物不存在');
    }
    let file: { filename: string; ext: string; content: Buffer } | null;
    try {
      file = await this.storage.read(dir, id);
    } catch {
      throw new ApplicationError('validation', 'ARTIFACT_ILLEGAL_PATH', '非法路径');
    }
    if (!file) {
      throw new ApplicationError('not_found', 'ARTIFACT_FILE_MISSING', '该归档物暂无可下载文件');
    }
    return {
      artifact,
      downloadName: `${artifact.name}${file.ext}`,
      contentType: downloadContentType(file.ext),
      content: file.content,
    };
  }
}
