import { useEffect, useRef, useState } from 'react';
import { loadPdfjs } from '../lib/pdf-extract';

/** 只渲染 PDF 首页；缩略图与全屏查看器共用同一份 pdf.js 懒加载和字体资源接线。 */
export function ReimbursePdfCanvas({ url, label, quality = 1.5 }: { url: string; label: string; quality?: number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    let cancelled = false;
    let cancelCurrent = () => {};
    const controller = new AbortController();
    setState('loading');
    const render = async () => {
      try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error(`PDF ${response.status}`);
        const data = await response.arrayBuffer();
        const pdfjs = await loadPdfjs();
        const documentProxy = await pdfjs.getDocument({
          data,
          cMapUrl: `${import.meta.env.BASE_URL}pdfjs/cmaps/`,
          cMapPacked: true,
          standardFontDataUrl: `${import.meta.env.BASE_URL}pdfjs/standard_fonts/`,
        }).promise;
        cancelCurrent = () => { void documentProxy.destroy(); };
        if (cancelled) { cancelCurrent(); return; }
        const page = await documentProxy.getPage(1);
        const viewport = page.getViewport({ scale: quality });
        const canvas = canvasRef.current;
        const context = canvas?.getContext('2d');
        if (!canvas || !context) throw new Error('PDF canvas unavailable');
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const task = page.render({ canvasContext: context, viewport });
        cancelCurrent = () => { task.cancel(); void documentProxy.destroy(); };
        await task.promise;
        if (!cancelled) setState('ready');
      } catch {
        if (!cancelled) setState('error');
      }
    };
    void render();
    return () => {
      cancelled = true;
      controller.abort();
      cancelCurrent();
    };
  }, [url, quality]);

  return <div className="reimb-pdf-canvas" data-state={state}>
    <canvas ref={canvasRef} role="img" aria-label={label} />
    {state === 'loading' && <span role="status">正在渲染 PDF…</span>}
    {state === 'error' && <span role="status">PDF 预览加载失败</span>}
  </div>;
}
