// L6（docs/planning/code-audit-2026-06-14.md）入站限流：一个不引入新依赖的最小内存实现。
// 按 key（本网关用发送者 open_id）分桶的固定窗口计数器——足够覆盖单进程网关的滥用场景；
// 不跨进程协调、不持久化（重启即清零），MVP 阶段够用。

export interface RateLimiter {
  /** 记一次 key 的调用；本窗口内已达配额则返回 false（调用方应丢弃该次事件）。 */
  allow(key: string): boolean;
}

/** 未配置 LARK_RATE_LIMIT_PER_MINUTE 时的每发送者每分钟默认条数上限。 */
export const DEFAULT_RATE_LIMIT_PER_MINUTE = 20;

interface Window {
  start: number;
  count: number;
}

export function createRateLimiter(
  limitPerWindow: number = DEFAULT_RATE_LIMIT_PER_MINUTE,
  windowMs = 60_000,
): RateLimiter {
  const windows = new Map<string, Window>();
  return {
    allow(key: string): boolean {
      const now = Date.now();
      const win = windows.get(key);
      if (!win || now - win.start >= windowMs) {
        windows.set(key, { start: now, count: 1 });
        return true;
      }
      if (win.count >= limitPerWindow) return false;
      win.count += 1;
      return true;
    },
  };
}
