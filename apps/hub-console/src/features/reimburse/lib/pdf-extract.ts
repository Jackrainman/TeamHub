/**
 * pdf.js 文本抽取壳（REIMBURSE-PROC 阶段 4）——发票 PDF File → 忠实版式的文本行数组，
 * 交给 contracts 的 `parseInvoicePdfText` 识别。**全程浏览器本地解析，文件本体绝不上传**。
 *
 * 分层：`buildTextLines` 是纯函数（pdf.js TextItem 最小形状 → 行数组，单测 mock 覆盖）；
 * `extractPdfTextLines` 只负责 pdf.js 加载/worker 接线/逐页取 item，不测库本身。
 * pdf.js 本体走动态 import——~1MB 的库只在用户真的导入 PDF 时才进按需 chunk。
 */
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

/** pdf.js TextItem 的最小形状（x/y 为 PDF 用户坐标，y 轴向上即越大越靠页面上方）。 */
export interface PdfTextItemLike {
  str: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
}

/** 同视觉行的 y 容差（pt）：数电票同列字号不一，基线可差 ~2pt。 */
const LINE_Y_TOLERANCE = 3;

/**
 * pdf.js getTextContent 的 item 流 → 忠实版式的文本行。
 * 数电票文本流常按列拆分（先左列全部、再右列全部，行间交错），直接按流顺序拼接会把
 * 「购 名称：X」和「销 名称：Y」拆到不同行甚至错行。这里按视觉位置重排：
 * 行 = y 坐标容差内的一组 item，行间按 y 降序（自上而下），行内按 x 升序；
 * 行内 item 间空隙明显（>1pt，pdf.js 拆 run 的相邻片段空隙≈0）才补空格，
 * 保证按列拆分产生的列间留白在文本行里可见（下游 parser 靠它分列）。
 */
export function buildTextLines(items: PdfTextItemLike[]): string[] {
  const placed = items
    .filter((it) => it.str.trim().length > 0)
    .sort((a, b) => b.y - a.y || a.x - b.x);

  const lines: { y: number; items: PdfTextItemLike[] }[] = [];
  for (const item of placed) {
    const current = lines[lines.length - 1];
    if (current && Math.abs(item.y - current.y) <= LINE_Y_TOLERANCE) {
      current.items.push(item);
    } else {
      lines.push({ y: item.y, items: [item] });
    }
  }

  return lines.map((line) => {
    // 行内只按 x 排（组是按 y 容差归的，组内 y 降序会让同 run 的高低字错位）。
    const ordered = [...line.items].sort((a, b) => a.x - b.x);
    let text = '';
    let prev: PdfTextItemLike | null = null;
    for (const item of ordered) {
      if (prev) {
        const gap = item.x - (prev.x + (prev.width ?? 0));
        if (gap > 1) {
          text += ' ';
        }
      }
      text += item.str;
      prev = item;
    }
    return text;
  });
}

type PdfjsModule = typeof import('pdfjs-dist');

let pdfjsPromise: Promise<PdfjsModule> | null = null;

/** 懒加载 pdf.js 并接 worker（Vite `?url` 产物路径，构建期拷贝成独立 asset）。 */
function loadPdfjs(): Promise<PdfjsModule> {
  pdfjsPromise ??= import('pdfjs-dist').then((pdfjs) => {
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
    return pdfjs;
  });
  return pdfjsPromise;
}

/**
 * 发票 PDF 文件 → 全部页的文本行（页序）。读文件/pdf.js 失败都会 reject——
 * 调用方（reimburse-import）统一兜成「读取失败」提示，不静默。
 */
export async function extractPdfTextLines(file: File): Promise<string[]> {
  const pdfjs = await loadPdfjs();
  const data = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({
    data,
    // 中文 CID 字体（12306 铁路电子客票等）缺 CMap/标准字体数据会整段丢字——
    // 标签全灭只剩数字，下游 parser 只能靠 20 位长度盲猜发票号。资源由 vite
    // pdfjs-assets 插件伺服在 /pdfjs/（dev 中间件直发、build 拷进 dist）。
    cMapUrl: `${import.meta.env.BASE_URL}pdfjs/cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${import.meta.env.BASE_URL}pdfjs/standard_fonts/`,
  }).promise;
  try {
    const lines: string[] = [];
    for (let pageNo = 1; pageNo <= doc.numPages; pageNo += 1) {
      const page = await doc.getPage(pageNo);
      const content = await page.getTextContent();
      const items: PdfTextItemLike[] = [];
      for (const item of content.items) {
        if (!('str' in item)) {
          continue; // TextMarkedContent（无文本），跳过
        }
        items.push({
          str: item.str,
          x: item.transform[4],
          y: item.transform[5],
          width: item.width,
          height: item.height,
        });
      }
      lines.push(...buildTextLines(items));
    }
    return lines;
  } finally {
    void doc.destroy();
  }
}
