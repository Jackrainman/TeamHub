import { mkdir, readdir, rename, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

// 归档物（图纸）文件本地卷存储接缝（HUB-ARTIFACT-STORE-MECH 本地卷版，D-025/D-038：二进制不进 git）。
// **唯一触碰 TEAMHUB_ARTIFACT_FILES_DIR 的模块**——日后换 MinIO/对象存储只改这里（getArtifactDir + 读写两函数
// 抽成接口、加一个 MinIO 实现），路由与 store 不动。文件按 `<artifactId><ext>` 命名（与下载端点匹配规则一致）。

/** 本地卷目录（未配置 → null，路由转 400/404）。每次调用读 env，与 server 既有下载端点同口径。 */
export function getArtifactDir(): string | null {
  const dir = process.env.TEAMHUB_ARTIFACT_FILES_DIR;
  return dir && dir.trim() ? dir : null;
}

/** 文件内容 sha256（hex）。受上传上限约束（路由 50MB），同步哈希成本可接受；上限放宽后应改流式。 */
export function sha256Of(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

// 下载端点用 `f === id || f.startsWith(`${id}.`)` 匹配；尾点护栏避免 id 前缀撞车（v1. 不命中 v10.）。
// 清旧兄弟/删孤儿沿用同规则，单一真相。
function isFileOfArtifact(filename: string, id: string): boolean {
  return filename === id || filename.startsWith(`${id}.`);
}

/**
 * 原子写一份归档物文件并回写存储基名 `<id><ext>`。
 * 顺序：先原子写新文件（tmp→rename，失败清 tmp 不丢旧版），**再**清掉同 id 不同后缀的陈旧兄弟
 * （否则下载端点的 startsWith 可能命中旧版）。同后缀重传 = 同名 rename 覆盖、天然幂等。
 */
export async function writeArtifactFile(
  dir: string,
  id: string,
  ext: string,
  buf: Buffer,
): Promise<string> {
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

/** 尽力删某归档物的所有落盘文件（路由层落盘元数据失败时清孤儿，避免「有字节无指针」）。 */
export async function deleteArtifactFile(dir: string, id: string): Promise<void> {
  const entries = await readdir(dir).catch(() => [] as string[]);
  for (const f of entries) {
    if (isFileOfArtifact(f, id)) {
      await unlink(join(dir, f)).catch(() => {});
    }
  }
}
