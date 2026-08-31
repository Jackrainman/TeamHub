import { mkdir, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative } from 'node:path';
import { createHash } from 'node:crypto';

import type { ArtifactFileStorage } from './repository.js';

// 归档物（图纸）文件本地卷存储（HUB-ARTIFACT-STORE-MECH 本地卷版，D-025/D-038：二进制不进 git；
// ARCH-UNIFY A4 自 src/artifact-storage.ts 迁入本模块，实现 ArtifactFileStorage port）。
// **唯一触碰 TEAMHUB_ARTIFACT_FILES_DIR 的实现**——日后换 MinIO/对象存储只新增一个 ArtifactFileStorage
// 实现，service/route 不动。文件按 `<artifactId><ext>` 命名。

// read 用 `f === id || f.startsWith(`${id}.`)` 匹配；尾点护栏避免 id 前缀撞车（v1 不命中 v10）。
// 清旧兄弟/删孤儿沿用同规则，单一真相。
function isFileOfArtifact(filename: string, id: string): boolean {
  return filename === id || filename.startsWith(`${id}.`);
}

export class LocalArtifactFileStorage implements ArtifactFileStorage {
  /** 本地卷目录（未配置 → null）。每次调用读 env，与既有行为同口径。 */
  dir(): string | null {
    const dir = process.env.TEAMHUB_ARTIFACT_FILES_DIR;
    return dir && dir.trim() ? dir : null;
  }

  sha256(buf: Buffer): string {
    return createHash('sha256').update(buf).digest('hex');
  }

  /**
   * 原子写一份归档物文件并回写存储基名 `<id><ext>`。
   * 顺序：先原子写新文件（tmp→rename，失败清 tmp 不丢旧版），**再**清掉同 id 不同后缀的陈旧兄弟
   * （否则 read 的 startsWith 可能命中旧版）。同后缀重传 = 同名 rename 覆盖、天然幂等。
   */
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
    // 新文件已就位，再清异后缀旧兄弟（保留刚写的 filename）。
    const entries = await readdir(dir).catch(() => [] as string[]);
    for (const f of entries) {
      if (f !== filename && isFileOfArtifact(f, id)) {
        await unlink(join(dir, f)).catch(() => {});
      }
    }
    return filename;
  }

  async remove(dir: string, id: string): Promise<void> {
    const entries = await readdir(dir).catch(() => [] as string[]);
    for (const f of entries) {
      if (isFileOfArtifact(f, id)) {
        await unlink(join(dir, f)).catch(() => {});
      }
    }
  }

  async read(
    dir: string,
    id: string,
  ): Promise<{ filename: string; ext: string; content: Buffer } | null> {
    const entries = await readdir(dir).catch(() => [] as string[]);
    const match = entries.find((f) => isFileOfArtifact(f, id));
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
