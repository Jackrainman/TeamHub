import { createRequire } from 'node:module';
import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { Unzip, UnzipInflate } from 'fflate';
import {
  classifyPackageText,
  evidenceExtOf,
  extractPaymentAmountFen,
  normalizeInvoiceOcrText,
  parseInvoicePdfText,
  parseInvoiceXbrlText,
  parseInvoiceXmlText,
  type ParsedInvoice,
  type ReimburseImportFile,
  type ReimburseProfile,
} from '@teamhub/hub-contracts';

export interface ImportFileParseResult {
  role: ReimburseImportFile['role'];
  amountFen: number | null;
  confidence: number | null;
  parsed: ParsedInvoice | null;
}
export interface ImportArchiveMember { name: string; content: Buffer }

const require = createRequire(import.meta.url);
const decoder = new TextDecoder('utf-8');
const ZIP_LIMIT = { entries: 50, bytes: 200 * 1024 * 1024, memberBytes: 20 * 1024 * 1024 };

/** 流式解包并在数据回调中执行数量/字节门；路径与嵌套 zip 由调用方记 unsupported。 */
export async function unzipReimburseImport(data: Uint8Array): Promise<ImportArchiveMember[]> {
  return new Promise((resolve, reject) => {
    const members: ImportArchiveMember[] = [];
    const names = new Set<string>();
    let total = 0;
    let settled = false;
    const fail = (message: string) => {
      if (!settled) { settled = true; reject(new Error(message)); }
    };
    const unzip = new Unzip();
    unzip.register(UnzipInflate);
    unzip.onfile = entry => {
      if (settled || entry.name.endsWith('/')) return;
      const name = entry.name.replace(/\\/g, '/');
      if (name.startsWith('/') || name.split('/').some(part => part === '.' || part === '..') || names.has(name.toLowerCase())) {
        fail('unsafe archive member'); return;
      }
      names.add(name.toLowerCase());
      if (names.size > ZIP_LIMIT.entries) { fail('too many archive members'); return; }
      const chunks: Uint8Array[] = [];
      let size = 0;
      entry.ondata = (error, chunk, final) => {
        if (settled) return;
        if (error) { fail('corrupt archive'); return; }
        size += chunk.length;
        total += chunk.length;
        if (size > ZIP_LIMIT.memberBytes || total > ZIP_LIMIT.bytes) { fail('archive byte limit'); return; }
        chunks.push(chunk);
        if (final) members.push({ name, content: Buffer.concat(chunks.map(chunk => Buffer.from(chunk))) });
      };
      entry.start();
    };
    try { unzip.push(data, true); } catch { fail('corrupt archive'); return; }
    if (!settled) { settled = true; resolve(members); }
  });
}

async function ofdXbrl(data: Uint8Array): Promise<string | null> {
  const members = await unzipReimburseImport(data);
  const preferred = members.filter(member => /(^|\/)attachs?\/[^/]*\.xml$/i.test(member.name));
  for (const member of [...preferred, ...members.filter(item => !preferred.includes(item))]) {
    if (evidenceExtOf(member.name) !== '.xml') continue;
    const text = decoder.decode(member.content);
    if (/<(?:[A-Za-z_][\w.-]*:)?xbrl[\s>]/i.test(text)) return text;
  }
  return null;
}

async function localLanguagePath(): Promise<string> {
  const dir = join(dirname(require.resolve('@tesseract.js-data/chi_sim/package.json')), '4.0.0_best_int');
  const eng = join(dirname(require.resolve('@tesseract.js-data/eng/package.json')), '4.0.0_best_int', 'eng.traineddata.gz');
  // tesseract 只接受一个 langPath；把两个仓库内本地包聚合到 imports 旁的私有运行目录。
  const evidenceDir = process.env.TEAMHUB_EVIDENCE_FILES_DIR;
  if (!evidenceDir && !process.env.TEAMHUB_IMPORT_LANG_DIR) throw new Error('OCR language directory unconfigured');
  const target = process.env.TEAMHUB_IMPORT_LANG_DIR ?? join(dirname(evidenceDir!), 'ocr-lang');
  await mkdir(target, { recursive: true });
  await copyFile(join(dir, 'chi_sim.traineddata.gz'), join(target, 'chi_sim.traineddata.gz')).catch(() => {});
  await copyFile(eng, join(target, 'eng.traineddata.gz')).catch(() => {});
  return target;
}

async function ocr(inputs: Buffer[]): Promise<{ text: string; confidence: number }> {
  const { createWorker } = await import('tesseract.js');
  let worker: Awaited<ReturnType<typeof createWorker>> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let rejectDeadline: (error: Error) => void = () => {};
  const deadline = new Promise<never>((_, reject) => { rejectDeadline = reject; });
  const run = async () => {
    worker = await createWorker(['chi_sim', 'eng'], 1, {
      langPath: await localLanguagePath(), cacheMethod: 'none', errorHandler: () => {},
    });
    const lines: string[] = [];
    let confidence = 100;
    for (const input of inputs) {
      const result = await worker.recognize(input);
      lines.push(result.data.text);
      confidence = Math.min(confidence, result.data.confidence);
    }
    return { text: lines.join('\n'), confidence };
  };
  try {
    timer = setTimeout(() => rejectDeadline(new Error('OCR timeout')), 60_000);
    return await Promise.race([run(), deadline]);
  } finally {
    if (timer) clearTimeout(timer);
    if (worker) await worker.terminate();
  }
}

async function pdfTextAndOcrImages(data: Uint8Array): Promise<{ lines: string[]; ocrImages: Buffer[] }> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const document = await pdfjs.getDocument({ data: new Uint8Array(data), useSystemFonts: true }).promise;
  const lines: string[] = [];
  const ocrImages: Buffer[] = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    let lastY: number | null = null;
    let line = '';
    for (const item of content.items) {
      if (!('str' in item)) continue;
      const y = item.transform[5];
      if (lastY !== null && Math.abs(y - lastY) > 2) { lines.push(line); line = ''; }
      line += `${line && lastY === y ? ' ' : ''}${item.str}`;
      lastY = y;
    }
    if (line) lines.push(line);
    if (!content.items.some(item => 'str' in item && item.str.trim())) {
      const { createCanvas } = await import('@napi-rs/canvas');
      const viewport = page.getViewport({ scale: 2 });
      const scale = Math.min(1, 3000 / Math.max(viewport.width, viewport.height));
      const canvas = createCanvas(Math.round(viewport.width * scale), Math.round(viewport.height * scale));
      const context = canvas.getContext('2d');
      await page.render({ canvasContext: context as never, viewport }).promise;
      ocrImages.push(canvas.toBuffer('image/png'));
    }
  }
  await document.destroy();
  return { lines, ocrImages };
}

/** 单文件失败由 service 转成 unreadable；这里只返回确定字段，不写数据库。 */
export async function parseReimburseImportFile(
  ext: string,
  content: Buffer,
  profile?: ReimburseProfile,
): Promise<ImportFileParseResult> {
  let text = '';
  let confidence: number | null = null;
  let parsed: ParsedInvoice | null = null;
  if (ext === '.xml') {
    text = decoder.decode(content);
    parsed = parseInvoiceXmlText(text);
  } else if (ext === '.ofd') {
    const xbrl = await ofdXbrl(content);
    text = xbrl ?? '';
    parsed = xbrl ? parseInvoiceXbrlText(xbrl) : null;
  } else if (ext === '.pdf') {
    const result = await pdfTextAndOcrImages(content);
    text = result.lines.join('\n');
    parsed = parseInvoicePdfText(result.lines, 'pdf', profile);
    if (!text.trim() && result.ocrImages.length) {
      const recognized = await ocr(result.ocrImages);
      text = normalizeInvoiceOcrText(recognized.text);
      confidence = recognized.confidence;
      parsed = parseInvoicePdfText(text.split(/\r?\n/), 'ocr', profile);
    }
  } else if (ext === '.png' || ext === '.jpg' || ext === '.jpeg') {
    const recognized = await ocr([content]);
    text = normalizeInvoiceOcrText(recognized.text);
    confidence = recognized.confidence;
    if (classifyPackageText(text) === 'invoice') parsed = parseInvoicePdfText(text.split(/\r?\n/), 'ocr', profile);
  }
  const classified = classifyPackageText(text);
  const role = parsed ? 'invoice' : classified === 'inspection' ? 'inspection' : classified === 'paymentShot' ? 'paymentShot' : 'unknown';
  return {
    role,
    amountFen: role === 'invoice' ? parsed?.totalAmountFen ?? null : role === 'paymentShot' ? extractPaymentAmountFen(text) : null,
    confidence: confidence ?? (text ? 100 : null),
    parsed,
  };
}
