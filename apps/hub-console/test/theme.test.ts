import { describe, expect, test } from 'vitest';
import { normalizeTheme } from '../src/theme';

// 主题切换器（D-068）：normalizeTheme 是 Provider 唯一的存储值收敛逻辑，
// 纯函数单测（不测 DOM/RTL，符合本仓「测逻辑不测 DOM」风格）。真实换肤走 4177 活体验收。
describe('主题：normalizeTheme（localStorage 存储值收敛）', () => {
  test("合法值原样返回：'warm' / 'classic'", () => {
    expect(normalizeTheme('warm')).toBe('warm');
    expect(normalizeTheme('classic')).toBe('classic');
  });

  test('null / 空 / 未知值 → 默认 classic（暖纸 opt-in，不惊扰现有用户）', () => {
    expect(normalizeTheme(null)).toBe('classic');
    expect(normalizeTheme('')).toBe('classic');
    expect(normalizeTheme('dark')).toBe('classic');
    expect(normalizeTheme('WARM')).toBe('classic'); // 大小写敏感，非精确匹配即 fallback
  });
});
