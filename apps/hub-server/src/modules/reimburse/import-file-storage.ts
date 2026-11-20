import { mkdir, readFile, rename, rm, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

/** 导入原件与 evidence 同级分目录存放；公开契约只暴露 UUID，不暴露磁盘路径。 */
export class LocalReimburseImportStorage {
  constructor(private readonly evidenceDir: () => string | null) {}

  root(): string {
    const evidence = this.evidenceDir();
    if (!evidence) throw new Error('REIMBURSE_IMPORT_STORAGE_UNCONFIGURED');
    return join(dirname(evidence), 'imports');
  }

  path(jobId: string, fileId: string, ext: string): string {
    if (!/^reimp-[a-z0-9-]+$/i.test(jobId) || !/^reif-[a-z0-9-]+$/i.test(fileId) || !/^\.[a-z0-9]*$/i.test(ext)) {
      throw new Error('REIMBURSE_IMPORT_ILLEGAL_PATH');
    }
    return join(this.root(), jobId, `${fileId}${ext}`);
  }

  async write(jobId: string, fileId: string, ext: string, content: Buffer): Promise<void> {
    const path = this.path(jobId, fileId, ext);
    await mkdir(dirname(path), { recursive: true });
    const tmp = `${path}.tmp`;
    try {
      await writeFile(tmp, content);
      await rename(tmp, path);
    } catch (error) {
      await unlink(tmp).catch(() => {});
      throw error;
    }
  }

  async read(jobId: string, fileId: string, ext: string): Promise<Buffer> {
    return readFile(this.path(jobId, fileId, ext));
  }

  async removeFile(jobId: string, fileId: string, ext: string): Promise<void> {
    await unlink(this.path(jobId, fileId, ext)).catch(() => {});
  }

  async removeJob(jobId: string): Promise<void> {
    if (!/^reimp-[a-z0-9-]+$/i.test(jobId)) return;
    await rm(join(this.root(), jobId), { recursive: true, force: true });
  }
}
