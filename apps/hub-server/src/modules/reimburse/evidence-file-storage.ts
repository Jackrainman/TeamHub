import { mkdir, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative } from 'node:path';
import { createHash } from 'node:crypto';

import type { ReimburseEvidenceStorage } from './repository.js';

// 报销凭证字节本地卷存储（D-094 受控留档；实现 ReimburseEvidenceStorage port，
// 原子写/清兄弟/逃逸护栏照 archive local-file-storage.ts 先例）。
// **唯一触碰 TEAMHUB_EVIDENCE_FILES_DIR 的实现**。文件按 `<evidenceId><ext>` 命名；
// 该目录无任何无鉴权静态路径，字节只能经鉴权下载端点流出。

function isFileOfEvidence(filename: string, id: string): boolean {
  return filename === id || filename.startsWith(`${id}.`);
}

export class LocalEvidenceFileStorage implements ReimburseEvidenceStorage {
  dir(): string | null {
    const dir = process.env.TEAMHUB_EVIDENCE_FILES_DIR;
    return dir && dir.trim() ? dir : null;
  }

  sha256(buf: Buffer): string {
    return createHash('sha256').update(buf).digest('hex');
  }

  /** 原子写（tmp→rename）后清同 id 异后缀陈旧兄弟；同后缀重传天然幂等。 */
  async write(dir: string, id: string, ext: string, buf: Buffer): Promise<string> {
    await mkdir(dir, { recursive: true });
    const filename = `${id}${ext}`;
    const full = join(dir, filename);
    const tmp = `${full}.tmp`;
    try {
      await writeFile(tmp, buf);
      await rename(tmp, full);
    } catch (err) {
      await unlink(tmp).catch(() => {});
      throw err;
    }
    const entries = await readdir(dir).catch(() => [] as string[]);
    for (const f of entries) {
      if (f !== filename && isFileOfEvidence(f, id)) {
        await unlink(join(dir, f)).catch(() => {});
      }
    }
    return filename;
  }

  async remove(dir: string, id: string): Promise<void> {
    const entries = await readdir(dir).catch(() => [] as string[]);
    for (const f of entries) {
      if (isFileOfEvidence(f, id)) {
        await unlink(join(dir, f)).catch(() => {});
      }
    }
  }

  async read(
    dir: string,
    id: string,
  ): Promise<{ filename: string; ext: string; content: Buffer } | null> {
    const entries = await readdir(dir).catch(() => [] as string[]);
    const match = entries.find((f) => isFileOfEvidence(f, id));
    if (!match) return null;
    const full = join(dir, match);
    // 路径逃逸护栏：解析结果必须仍在 dir 内。
    const rel = relative(dir, full);
    if (rel.startsWith('..') || isAbsolute(rel)) {
      throw new Error(`非法路径: ${match}`);
    }
    const content = await readFile(full);
    const ext = match.includes('.') ? match.slice(match.lastIndexOf('.')) : '';
    return { filename: match, ext, content };
  }
}
