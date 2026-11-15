import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useI18n } from '../i18n';

/** 右侧模态抽屉；焦点留在最上层，关闭后回到打开它的控件。 */
export function SideDrawer({
  open,
  onClose,
  title,
  children,
  confirmDiscard,
  placement = 'right',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  placement?: 'right' | 'center';
  // 关闭前置确认：脏内容场景下由调用方传入（内部做 window.confirm），返回 true 才放行关闭；
  // 不传则维持原行为（直接关闭）。同时把关 Esc / 背景遮罩 / 右上角 X 三个入口。
  confirmDiscard?: () => boolean;
}) {
  const { t } = useI18n();
  const panel = useRef<HTMLElement | null>(null);
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);

  const requestClose = () => {
    if (confirmDiscard && !confirmDiscard()) return;
    onClose();
  };
  const closeRef = useRef(requestClose);
  closeRef.current = requestClose;

  useEffect(() => {
    if (open) {
      // 重开复用同一实例；清掉 closing 即可取消尚未结束的退场。
      setMounted(true);
      setClosing(false);
      return;
    }
    if (!mounted) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setMounted(false);
      setClosing(false);
      return;
    }
    setClosing(true);
  }, [open, mounted]);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    // 退场中的抽屉已 inert，不能再吞其他抽屉的 Esc / Tab。
    const topmost = () => [...document.querySelectorAll('.drawer:not([data-closing])')].at(-1) === panel.current;
    const controls = () => [...(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href], [tabindex="0"]') ?? [])].filter(el => el.getClientRects().length > 0);
    if (!panel.current?.contains(document.activeElement)) (controls()[0] ?? panel.current)?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (!topmost() || event.defaultPrevented) return;
      if (event.key === 'Escape') { event.preventDefault(); closeRef.current(); }
      if (event.key === 'Tab') {
        const items = controls();
        const first = items[0], last = items.at(-1);
        if (!first) { event.preventDefault(); panel.current?.focus(); }
        else if (event.shiftKey && (document.activeElement === first || !panel.current?.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || !panel.current?.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); if (previous?.isConnected) previous.focus(); };
  }, [open]);

  if (!open && !mounted) return null;

  return createPortal(
    <>
      <div className="drawer-backdrop" data-closing={closing ? '' : undefined} role="presentation" onClick={requestClose} />
      <aside
        ref={node => {
          panel.current = node;
          // React 18 类型尚未声明 inert；DOM 属性必须真实存在，供浏览器阻断焦点与点击。
          if (closing) node?.setAttribute('inert', '');
          else node?.removeAttribute('inert');
        }}
        tabIndex={-1}
        className={`drawer${placement === 'center' ? ' drawer--center' : ''}`}
        data-closing={closing ? '' : undefined}
        role="dialog"
        aria-modal="true"
        aria-hidden={closing || undefined}
        aria-label={title}
        onAnimationEnd={event => {
          if (open || !closing || event.target !== event.currentTarget) return;
          setMounted(false);
          setClosing(false);
        }}
      >
        <header className="drawer__head">
          <h2 className="drawer__title">{title}</h2>
          <button
            type="button"
            className="drawer__close"
            onClick={requestClose}
            aria-label={t('common.close')}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </header>
        <div className="drawer__body">{children}</div>
      </aside>
    </>, document.body
  );
}
