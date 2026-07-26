// `TextDecoder` 是 Node/浏览器共有的 WHATWG 标准全局，但 contracts 的 tsconfig `lib=ES2022`
// （无 DOM / 无 node types）未声明它。这里补一个**最小、环境中立**的 module 级 ambient 声明——
// 只声明本文件用到的构造 + decode，**不 import 'node:util'**（那会把 node-only import 塞进浏览器打包）。
// module 级 `declare const` 只在本模块可见、不泄漏成全局，故与 hub-console（含 DOM lib）的 TextDecoder 无冲突。
declare const TextDecoder: {
  new (label?: string, options?: { fatal?: boolean; ignoreBOM?: boolean }): {
    decode(input?: Uint8Array): string;
  };
};

/**
 * CSV 导入共用核（ROSTER-IMPORT 刀⑦ 起名册专用，INV-BULK-IMPORT 刀⑪ 抽成两域共用）：
 * 编码探测（`decodeCsvBytes`）+ 手写零依赖记录切分（`tokenizeCsv`）。名册（roster-import）与
 * 库存（inventory-import）的解码/切分规则一字不差，抽这里单一来源；行→域草稿的校验映射仍各域自持。
 */

// UTF-8 BOM（U+FEFF）：Excel 直接双击打开 CSV 时据此识别 UTF-8（否则中文乱码）。
export const UTF8_BOM = '﻿';
// U+FFFD 替换字符：TextDecoder(non-fatal) 遇非法字节序列时吐它，作编码探测信号。
const REPLACEMENT_CHAR = '�';

/**
 * CSV 字节 → 文本（编码自动探测，K8 拍板②）：
 *  - UTF-8 BOM（EF BB BF）→ 按 UTF-8 解（`TextDecoder('utf-8')` 默认剥 BOM）。
 *  - 无 BOM → 先按 UTF-8 解；出现替换字符 U+FFFD（非法 UTF-8 序列）→ 再按 gbk 重解
 *    （node24 内置 full-icu，`TextDecoder('gbk')` 可用；构造失败也兜底）。
 *  - 两者都出现 U+FFFD（或 gbk 不可用）→ `null`（路由转 400「编码无法识别，请另存为 CSV UTF-8」）。
 *
 * 纯函数（`TextDecoder`/`Uint8Array` 为 WHATWG 标准全局，Node/浏览器同在），便于用硬编码字节单测。
 */
export function decodeCsvBytes(bytes: Uint8Array): string | null {
  // BOM 探测：EF BB BF → 明确 UTF-8，短路（TextDecoder 默认 ignoreBOM=false，自动剥 BOM）。
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(bytes);
  }
  const asUtf8 = new TextDecoder('utf-8').decode(bytes);
  if (!asUtf8.includes(REPLACEMENT_CHAR)) return asUtf8;
  // UTF-8 解出替换字符 → 疑似 GBK，重解。
  let asGbk: string;
  try {
    asGbk = new TextDecoder('gbk').decode(bytes);
  } catch {
    return null; // 运行时不支持 gbk（理论不至，node24 full-icu 内置）
  }
  if (!asGbk.includes(REPLACEMENT_CHAR)) return asGbk;
  return null;
}

export interface CsvRecord {
  fields: string[];
  line: number; // 1-based 物理行号（记录起始行）
}

/**
 * 手写零依赖 CSV 记录切分（RFC4180 子集）：支持引号字段（内部逗号 / 换行 / `""` 转义引号），
 * 跟踪每条记录的起始物理行号（供坏行报告）。全空记录（所有字段皆空）跳过（= 空行）。
 */
export function tokenizeCsv(text: string): CsvRecord[] {
  const records: CsvRecord[] = [];
  let field = '';
  let fields: string[] = [];
  let inQuotes = false;
  let line = 1;
  let recordStartLine = 1;
  let atRecordStart = true;

  const pushField = () => {
    fields.push(field);
    field = '';
  };
  const pushRecord = () => {
    pushField();
    // 全空记录 = 空行（含 `,,,,` 全空列、Excel 尾随空行），跳过。
    // # 开头 = 注释行（模板提示有效值），跳过。
    if (!fields.every((f) => f === '') && !fields[0].startsWith('#')) {
      records.push({ fields, line: recordStartLine });
    }
    fields = [];
    atRecordStart = true;
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (atRecordStart) {
      recordStartLine = line;
      atRecordStart = false;
    }
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
        continue;
      }
      if (ch === '\n') line++; // 引号内换行计入行号、但不结束记录
      field += ch;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ',') {
      pushField();
      continue;
    }
    if (ch === '\r') continue; // CRLF：吞 \r，等 \n 结束记录
    if (ch === '\n') {
      pushRecord();
      line++;
      continue;
    }
    field += ch;
  }
  // 末条无换行结尾（field 或已积累的 fields 非空）。
  if (field !== '' || fields.length > 0) pushRecord();
  return records;
}
