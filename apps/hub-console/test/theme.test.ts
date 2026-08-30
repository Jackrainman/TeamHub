import { describe, expect, test } from 'vitest';
import { normalizeTheme } from '../src/theme';

// 主题切换器（D-068）：normalizeTheme 是 Provider 唯一的存储值收敛逻辑，
// 纯函数单测（不测 DOM/RTL，符合本仓「测逻辑不测 DOM」风格）。真实换肤走 4177 活体验收。
describe('主题：normalizeTheme（localStorage 存储值收敛）', () => {
  test("合法值原样返回：'warm' / 'classic' / 'dark' / 'tech' / 'notion'", () => {
    expect(normalizeTheme('warm')).toBe('warm');
    expect(normalizeTheme('classic')).toBe('classic');
    expect(normalizeTheme('dark')).toBe('dark'); // 2026-06-23 批次H：暗色成为合法第三主题
    expect(normalizeTheme('tech')).toBe('tech'); // D1：科技「遥测台」成为合法第四主题
    expect(normalizeTheme('notion')).toBe('notion'); // IA-RESTRUCTURE demo：Notion 风第五主题
    expect(normalizeTheme('linear')).toBe('linear'); // 风格画廊候选：Linear 风第六主题
  });

  test('null / 空 / 未知值 → 默认 notion（IA-RESTRUCTURE demo 默认；已存偏好者读 localStorage 不被覆盖）', () => {
    expect(normalizeTheme(null)).toBe('notion');
    expect(normalizeTheme('')).toBe('notion');
    expect(normalizeTheme('TECH')).toBe('notion'); // 大小写敏感，非精确匹配即 fallback 到默认
    expect(normalizeTheme('WARM')).toBe('notion');
  });
});
