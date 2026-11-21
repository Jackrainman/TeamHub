import { useEffect, useRef, useState, type PointerEvent, type WheelEvent } from 'react';
import { createPortal } from 'react-dom';
import { RotateCcw, X, ZoomIn, ZoomOut } from 'lucide-react';
import type { ReimburseImportFile } from '@teamhub/hub-contracts';
import { isTopModal, popModal, pushModal } from '../../../shared/lib/modal-stack';
import { ReimbursePdfCanvas } from './ReimbursePdfCanvas';

const MIN_SCALE = 0.25;
const MAX_SCALE = 5;
const clampScale = (value: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));

export function ReimburseImportViewer({
  file,
  url,
  roleLabel,
  onClose,
  returnFocus,
}: {
  file: ReimburseImportFile;
  url: string;
  roleLabel: string;
  onClose: () => void;
  returnFocus?: () => HTMLElement | null;
}) {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ pointerId: number; startX: number; startY: number; x: number; y: number } | null>(null);
  const closeButton = useRef<HTMLButtonElement | null>(null);
  const dialog = useRef<HTMLDivElement | null>(null);
  const modalId = useRef(Symbol('reimburse-import-viewer'));
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const title = `查看${roleLabel}：${file.displayName}`;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    pushModal(modalId.current);
    closeButton.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (!isTopModal(modalId.current) || event.defaultPrevented) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        closeRef.current();
      }
      if (event.key === 'Tab') {
        const controls = [...(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled)') ?? [])];
        const first = controls[0];
        const last = controls.at(-1);
        if (!first || !last) return;
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      popModal(modalId.current);
      const target = returnFocus?.() ?? previous;
      if (target?.isConnected) target.focus();
    };
  }, []);

  const reset = () => { setScale(1); setPosition({ x: 0, y: 0 }); };
  const wheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    setScale(current => clampScale(current * Math.exp(-event.deltaY * 0.001)));
  };
  const pointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, ...position };
    setDragging(true);
  };
  const pointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const start = drag.current;
    if (!start || start.pointerId !== event.pointerId) return;
    setPosition({ x: start.x + event.clientX - start.startX, y: start.y + event.clientY - start.startY });
  };
  const pointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return createPortal(
    <div className="reimb-viewer" role="dialog" aria-modal="true" aria-label={title} ref={dialog}>
      <header className="reimb-viewer__toolbar">
        <div className="reimb-viewer__name"><strong>{roleLabel}</strong><span>{file.displayName}</span></div>
        <div className="reimb-viewer__controls">
          <button type="button" className="btn btn--secondary btn--sm" aria-label="缩小" onClick={() => setScale(value => clampScale(value - 0.25))}><ZoomOut size={16} /></button>
          <output aria-label="缩放比例">{Math.round(scale * 100)}%</output>
          <button type="button" className="btn btn--secondary btn--sm" aria-label="放大" onClick={() => setScale(value => clampScale(value + 0.25))}><ZoomIn size={16} /></button>
          <button type="button" className="btn btn--secondary btn--sm" aria-label="重置为 100%" onClick={reset}><RotateCcw size={16} />1:1</button>
          <button ref={closeButton} type="button" className="drawer__close" aria-label="关闭原件查看器" onClick={onClose}><X size={18} /></button>
        </div>
      </header>
      <div
        className="reimb-viewer__stage"
        data-dragging={dragging || undefined}
        onWheel={wheel}
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerUp}
        onPointerCancel={pointerUp}
      >
        <div
          className="reimb-viewer__transform"
          data-scale={scale}
          style={{ transform: `translate(${position.x}px, ${position.y}px) scale(${scale})` }}
        >
          {file.ext.toLowerCase() === '.pdf'
            ? <ReimbursePdfCanvas url={url} label={`${roleLabel}首页`} quality={2} />
            : <img src={url} alt={`${roleLabel}原件：${file.displayName}`} draggable={false} />}
        </div>
      </div>
      <p className="reimb-viewer__hint">滚轮缩放 · 拖拽平移 · Esc 返回表单</p>
    </div>, document.body,
  );
}
