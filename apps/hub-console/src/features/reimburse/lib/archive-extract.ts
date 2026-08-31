/**
 * 归档解包底座（REIMBURSE-OFD-PARSE）：fflate 流式解 ZIP/OFD（OFD 本体即 zip 容器）。
 * **全程浏览器本地，文件本体绝不上传**；解压出的字节只进内存 Map，不落盘。
 *
 * 安全门（防 zip 炸弹/递归容器/海量条目，崩也只崩本地标签页，门就是保这个标签页）：
 * 条目数 / 解压总量 / 单条目字节超限 → 立即中止并抛 ArchiveGateError；
 * 超限判决在流式 ondata 里做，**不会先把炸弹整个解压进内存再检查**。
 */
import { Unzip, UnzipInflate } from 'fflate';
import { INVOICE_ARCHIVE_LIMITS, type InvoiceArchiveLimits } from '@teamhub/hub-contracts';

export type ArchiveGateCode = 'quotaEntries' | 'quotaBytes' | 'corrupt';

export class ArchiveGateError extends Error {
  constructor(public readonly code: ArchiveGateCode) {
    super(`archive gate tripped: ${code}`);
    this.name = 'ArchiveGateError';
  }
}

export interface ArchiveExtractResult {
  /** entry 名 → 未压缩字节（目录占位条目不收）。 */
  entries: Map<string, Uint8Array>;
}

/**
 * zip 条目名编码回退（REIMBURSE-DEFECTS #3）：zip 未置 UTF-8 flag（bit 11）时 fflate 按 latin1
 * 解码，原始字节可经 charCodeAt 完整收回；再按 UTF-8(fatal) → GB18030 顺序试解，覆盖 Windows
 * 资源管理器/国产压缩软件的 GBK 文件名（如「打车报销.zip」）。已正常解码（含 >0xFF 字符）的名字原样返回。
 */
export function decodeZipEntryName(name: string): string {
  const bytes = new Uint8Array(name.length);
  for (let i = 0; i < name.length; i += 1) {
    const code = name.charCodeAt(i);
    if (code > 0xff) return name; // 已按 UTF-8 正常解码
    bytes[i] = code;
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    // 不是合法 UTF-8 → 按 GB18030（GBK 超集）试解；再失败就保留原样（不挡解析主流程）。
    try {
      return new TextDecoder('gb18030').decode(bytes);
    } catch {
      return name;
    }
  }
}

function concatChunks(chunks: Uint8Array[], total: number): Uint8Array {
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

/**
 * ZIP 字节 → 全部条目（同步流式：fflate Unzip 注册 UnzipInflate 后在 push 内同步回调）。
 * 任何一道门触发都 reject ArchiveGateError；损坏文件 reject 'corrupt'。
 */
export function extractZipEntries(
  data: Uint8Array,
  limits: InvoiceArchiveLimits = INVOICE_ARCHIVE_LIMITS,
): Promise<ArchiveExtractResult> {
  return new Promise((resolve, reject) => {
    // 快速签名检查：PK 头 + EOCD 尾记录（PK\x05\x06），明显非 zip 直接拒，不交给流式逐字节撞。
    const isZip =
      data.length >= 22 &&
      data[0] === 0x50 &&
      data[1] === 0x4b &&
      (() => {
        const tailStart = Math.max(0, data.length - 65557);
        for (let i = data.length - 22; i >= tailStart; i -= 1) {
          if (data[i] === 0x50 && data[i + 1] === 0x4b && data[i + 2] === 0x05 && data[i + 3] === 0x06) {
            return true;
          }
        }
        return false;
      })();
    if (!isZip) {
      reject(new ArchiveGateError('corrupt'));
      return;
    }
    const entries = new Map<string, Uint8Array>();
    let entryCount = 0;
    let totalBytes = 0;
    let settled = false;
    const fail = (code: ArchiveGateCode) => {
      if (!settled) {
        settled = true;
        reject(new ArchiveGateError(code));
      }
    };

    const unzipper = new Unzip();
    unzipper.register(UnzipInflate);
    unzipper.onfile = (file) => {
      if (settled) return;
      entryCount += 1;
      if (entryCount > limits.maxEntries) {
        fail('quotaEntries');
        return;
      }
      if (file.name.endsWith('/')) return; // 目录占位
      const chunks: Uint8Array[] = [];
      let entryBytes = 0;
      file.ondata = (err, chunk, final) => {
        if (settled) return;
        if (err) {
          fail('corrupt');
          return;
        }
        entryBytes += chunk.length;
        totalBytes += chunk.length;
        if (entryBytes > limits.maxSingleUncompressedBytes || totalBytes > limits.maxTotalUncompressedBytes) {
          fail('quotaBytes');
          return;
        }
        chunks.push(chunk);
        if (final) {
          entries.set(decodeZipEntryName(file.name), concatChunks(chunks, entryBytes));
        }
      };
      file.start();
    };

    try {
      unzipper.push(data, true);
    } catch {
      fail('corrupt');
      return;
    }
    if (!settled) {
      settled = true;
      resolve({ entries });
    }
  });
}

/** OFD 容器字节 → 内嵌 XBRL 实例文本（找不到返回 null）。 */
export async function extractOfdXbrlText(
  data: Uint8Array,
  limits: InvoiceArchiveLimits = INVOICE_ARCHIVE_LIMITS,
): Promise<string | null> {
  const { entries } = await extractZipEntries(data, limits);
  const decoder = new TextDecoder('utf-8');
  // 优先 Doc_*/Attachs/*.xml（数电票 OFD 的 XBRL 附件位），回退任意含 <xbrl 根的 xml。
  const attachCandidates = [...entries.keys()].filter((n) =>
    /(^|\/)attachs?\/[^/]*\.xml$/i.test(n),
  );
  const fallbackCandidates = [...entries.keys()].filter(
    (n) => n.toLowerCase().endsWith('.xml') && !attachCandidates.includes(n),
  );
  for (const name of [...attachCandidates, ...fallbackCandidates]) {
    const text = decoder.decode(entries.get(name));
    if (/<(?:[A-Za-z_][\w.-]*:)?xbrl[\s>]/i.test(text)) {
      return text;
    }
  }
  return null;
}
