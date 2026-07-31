export interface ToastItem {
  id: number;
  message: string;
}

type Listener = (toasts: ToastItem[]) => void;

let toasts: ToastItem[] = [];
const listeners = new Set<Listener>();
let seq = 0;

function emit(): void {
  for (const listener of listeners) listener(toasts);
}

export function subscribeToast(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getToasts(): ToastItem[] {
  return toasts;
}

export function dismissToast(id: number): void {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

/** 全局错误兜底出口（配 main.tsx MutationCache.onError）：几秒后自动消失，点击立即关闭。 */
export function showToast(message: string, durationMs = 5000): void {
  const id = ++seq;
  toasts = [...toasts, { id, message }];
  emit();
  setTimeout(() => dismissToast(id), durationMs);
}
