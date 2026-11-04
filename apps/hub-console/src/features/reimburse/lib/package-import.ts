import {
  classifyInvoiceType, classifyPackageText, derivePackageReview, DEFAULT_REIMBURSE_PROFILE,
  INVOICE_ARCHIVE_LIMITS, parseInvoicePdfText, parseInvoiceXmlText, parseInvoiceXbrlText,
  type PackageCandidate, type PackageReview, type ReimburseProfile,
} from '@teamhub/hub-contracts';
import { extractZipEntries, extractOfdXbrlText } from './archive-extract';
import { extractPdfTextLines } from './pdf-extract';

export interface PackageAttachment extends PackageCandidate { file: File; included: boolean }
export type PackageNoticeReason = 'unsupported' | 'nested' | 'read' | 'too-large' | 'ocr-unavailable' | 'ocr-failed' | 'low-confidence';
export interface PackageNotice { fileName: string; reason: PackageNoticeReason }
export interface PackageDraft {
  kind: 'draft'; fileName: string; attachments: PackageAttachment[];
  review: PackageReview; notices: PackageNotice[];
}
export type PackageOutcome = PackageDraft | { kind: 'failed'; fileName: string; reason: 'read' | 'gate' | 'type' };
export interface PackageDeps {
  extractOcrText?: (file: File) => Promise<{ lines: string[]; confidence: number }>;
  extractPdfLines?: (file: File) => Promise<string[]>;
}
const supported = /\.(pdf|xml|ofd|jpe?g|png)$/i;

/** 顶层文件只产生一个草稿；包内材料保留原始字节，确认后才留档。 */
export async function analyzeReimbursePackage(
  file: File, deps: PackageDeps = {}, profile: ReimburseProfile = DEFAULT_REIMBURSE_PROFILE,
): Promise<PackageOutcome> {
  const fileName = file.name;
  if (!supported.test(fileName) && !/\.zip$/i.test(fileName)) return { kind: 'failed', fileName, reason: 'type' };
  if (file.size > INVOICE_ARCHIVE_LIMITS.maxInputBytes) return { kind: 'failed', fileName, reason: 'gate' };
  const notices: PackageNotice[] = [];
  const attachments: PackageAttachment[] = [];
  try {
    const members = /\.zip$/i.test(fileName)
      ? [...(await extractZipEntries(new Uint8Array(await file.arrayBuffer()))).entries]
          .map(([name, bytes]) => new File([new Uint8Array(bytes)], name))
      : [file];
    for (const member of members) {
      if (!supported.test(member.name)) {
        notices.push({ fileName: member.name, reason: /\.zip$/i.test(member.name) ? 'nested' : 'unsupported' });
        continue;
      }
      if (member.size > 20 * 1024 * 1024) {
        notices.push({ fileName: member.name, reason: 'too-large' });
        continue;
      }
      try {
        let text = '';
        let lines: string[] = [];
        let invoice: PackageCandidate['invoice'] = null;
        let ocr = false;
        if (/\.xml$/i.test(member.name)) {
          text = await member.text();
          if (!text.trimStart().startsWith('<')) throw new Error('invalid xml');
          invoice = parseInvoiceXmlText(text) ?? parseInvoiceXbrlText(text);
        } else if (/\.ofd$/i.test(member.name)) {
          text = await extractOfdXbrlText(new Uint8Array(await member.arrayBuffer())) ?? '';
          invoice = parseInvoiceXbrlText(text);
        } else if (/\.pdf$/i.test(member.name)) {
          lines = await (deps.extractPdfLines ?? extractPdfTextLines)(member);
          text = lines.join('\n');
        } else {
          const header = new Uint8Array(await member.slice(0, 8).arrayBuffer());
          const valid = /\.png$/i.test(member.name)
            ? [137,80,78,71,13,10,26,10].every((value, i) => header[i] === value)
            : header[0] === 255 && header[1] === 216 && header[2] === 255;
          if (!valid) throw new Error('invalid image');
        }
        if (!text.trim() && /\.(pdf|jpe?g|png)$/i.test(member.name)) {
          if (!deps.extractOcrText) notices.push({ fileName: member.name, reason: 'ocr-unavailable' });
          else {
            try {
              const result = await deps.extractOcrText(member);
              lines = result.lines;
              text = lines.join('\n');
              ocr = true;
              if (result.confidence < 80) notices.push({ fileName: member.name, reason: 'low-confidence' });
            } catch { notices.push({ fileName: member.name, reason: 'ocr-failed' }); }
          }
        }
        const role = invoice ? 'invoice' : classifyPackageText(text);
        if (!invoice && role === 'invoice') invoice = parseInvoicePdfText(lines);
        if (invoice && ocr) invoice = { ...invoice, recognitionSource: 'ocr' };
        attachments.push({ path: member.name, file: member, included: true, role, invoice, invoiceType: classifyInvoiceType(text) });
      } catch { notices.push({ fileName: member.name, reason: 'read' }); }
    }
    if (!attachments.length) return { kind: 'failed', fileName, reason: 'read' };
    return { kind: 'draft', fileName, attachments, notices, review: derivePackageReview(attachments, profile) };
  } catch { return { kind: 'failed', fileName, reason: 'read' }; }
}
