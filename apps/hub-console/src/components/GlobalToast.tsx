import { useEffect, useState } from 'react';
import {
  dismissToast,
  getToasts,
  subscribeToast,
  type ToastItem,
} from '../utils/toast';

/** 全局错误 toast 栈：未自行处理错误的 mutation 失败时由此透出（杜绝静默吞）。 */
export function GlobalToast() {
  const [toasts, setToasts] = useState<ToastItem[]>(() => getToasts());
  useEffect(() => subscribeToast(setToasts), []);
  if (toasts.length === 0) return null;
  return (
    <div className="global-toast-stack" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <button
          key={toast.id}
          type="button"
          className="global-toast"
          onClick={() => dismissToast(toast.id)}
        >
          {toast.message}
        </button>
      ))}
    </div>
  );
}
