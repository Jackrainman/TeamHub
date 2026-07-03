import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { useI18n } from '../i18n';

/**
 * 通用右锚定抽屉：半透明 backdrop + 视口右侧固定面板（slide-in 入场）。
 * 全站首个 overlay 组件——故采用 position:fixed（layout 容器无 transform，已核实可相对视口生效），
 * 入场动画走 CSS @keyframes（见 styles.css .drawer），open=false 直接卸载（清状态、避免离屏内容被 tab 命中）。
 * 关闭：backdrop 点击 + Esc。焦点陷阱本轮不做。
 */
export function SideDrawer({
  open,
  onClose,
  title,
  children,
  confirmDiscard,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  // 关闭前置确认：脏内容场景下由调用方传入（内部做 window.confirm），返回 true 才放行关闭；
  // 不传则维持原行为（直接关闭）。同时把关 Esc / 背景遮罩 / 右上角 X 三个入口。
  confirmDiscard?: () => boolean;
}) {
  const { t } = useI18n();

  const requestClose = () => {
    if (confirmDiscard && !confirmDiscard()) return;
    onClose();
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') requestClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, onClose, confirmDiscard]);

  if (!open) return null;

  return (
    <>
      <div className="drawer-backdrop" role="presentation" onClick={requestClose} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={title}>
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
    </>
  );
}
