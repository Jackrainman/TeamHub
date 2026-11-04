import { renderPdfForOcr } from './pdf-extract';

/** OCR 的程序、语言包与图片均留在同源浏览器；超时终止 worker，交回人工填写。 */
export async function extractLocalOcr(file: File, options: { signal?: AbortSignal } = {}): Promise<{ lines: string[]; confidence: number }> {
  if (options.signal?.aborted) throw new Error('OCR cancelled');
  const { createWorker } = await import('tesseract.js');
  let worker: Awaited<ReturnType<typeof createWorker>> | undefined;
  let expired = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let activeBitmap: ImageBitmap | undefined;
  let activeCanvas: HTMLCanvasElement | undefined;
  let cancel: (() => void) | undefined;
  let rejectDeadline: (error: Error) => void = () => {};
  const resetDeadline = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { expired = true; rejectDeadline(new Error('OCR timeout')); }, 30_000);
  };
  const run = async () => {
    const base = new URL(`${import.meta.env.BASE_URL}ocr/`, window.location.href).href;
    worker = await createWorker(['chi_sim', 'eng'], 1, {
      workerPath: `${base}worker/worker.min.js`, corePath: `${base}core`, langPath: `${base}lang`,
      cacheMethod: 'none', workerBlobURL: false,
      errorHandler: () => {}, // 调用方显示失败提示，避免原文进入控制台。
    });
    if (expired) { await worker.terminate(); throw new Error('OCR timeout'); }
    const images = /\.pdf$/i.test(file.name) ? await renderPdfForOcr(file, options.signal) : [file];
    const lines: string[] = [];
    let confidence = 100;
    for (const input of images) {
      if (expired || options.signal?.aborted) throw new Error('OCR cancelled');
      resetDeadline();
      const bitmap = await createImageBitmap(input);
      activeBitmap = bitmap;
      try {
        if (bitmap.width * bitmap.height > 16_000_000) throw new Error('OCR image limit');
        const scale = Math.min(1, 3000 / Math.max(bitmap.width, bitmap.height));
        const canvas = document.createElement('canvas');
        activeCanvas = canvas;
        canvas.width = Math.max(1, Math.round(bitmap.width * scale));
        canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        const context = canvas.getContext('2d');
        if (!context) throw new Error('OCR canvas unavailable');
        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        const { data } = await worker.recognize(canvas);
        lines.push(...data.text.split(/\r?\n/));
        confidence = Math.min(confidence, data.confidence);
        canvas.width = canvas.height = 0;
      } finally { bitmap.close(); activeBitmap = undefined; activeCanvas = undefined; }
    }
    return { lines, confidence };
  };
  try {
    const deadline = new Promise<never>((_, reject) => {
      rejectDeadline = reject;
      cancel = () => { expired = true; reject(new Error('OCR cancelled')); };
      options.signal?.addEventListener('abort', cancel, { once: true });
      if (options.signal?.aborted) cancel();
      resetDeadline();
    });
    return await Promise.race([run(), deadline]);
  } finally {
    if (cancel) options.signal?.removeEventListener('abort', cancel);
    if (timer) clearTimeout(timer);
    activeBitmap?.close();
    if (activeCanvas) activeCanvas.width = activeCanvas.height = 0;
    if (worker) await worker.terminate();
  }
}
