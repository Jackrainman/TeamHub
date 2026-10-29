import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSidebarIdle } from '../src/shared/lib/sidebar-idle';

afterEach(() => { vi.useRealTimers(); });
describe('侧栏空闲计时', () => {
  it('每次操作重新计时，最后一次操作满四秒才收起', () => {
    vi.useFakeTimers();
    const collapse = vi.fn();
    const idle = createSidebarIdle(collapse);
    idle.arm();
    vi.advanceTimersByTime(1500); idle.arm();
    vi.advanceTimersByTime(3000); expect(collapse).not.toHaveBeenCalled(); idle.arm();
    vi.advanceTimersByTime(2500); expect(collapse).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1500); expect(collapse).toHaveBeenCalledTimes(1);
  });
  it('手动固定、关闭自动收起或卸载时取消计时', () => {
    vi.useFakeTimers();
    const collapse = vi.fn();
    const idle = createSidebarIdle(collapse);
    idle.arm(); idle.cancel(); vi.advanceTimersByTime(5000);
    expect(collapse).not.toHaveBeenCalled();
    idle.arm(); vi.advanceTimersByTime(4000); expect(collapse).toHaveBeenCalledTimes(1);
  });
});
