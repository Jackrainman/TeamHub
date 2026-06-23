import { describe, expect, test } from 'vitest';
import { parseList, errorDetail, segClass } from '../src/utils';

// hub-console 跨特性共享 helper（多 feature 复用、零覆盖）：parseList 承重表单 tags/collaborators/skills
// 切分；errorDetail 统一错误条取文案；segClass 段控件类名。纯函数，镜像 theme.test.ts 风格。
describe('共享 helper utils（纯函数）', () => {
  test('parseList：逗号切分 + trim + 去空（空 / 单值 / 尾逗号不留空尾 / 逗号间空白裁剪）', () => {
    expect(parseList('')).toEqual([]);
    expect(parseList('x')).toEqual(['x']);
    expect(parseList('a,b')).toEqual(['a', 'b']);
    expect(parseList('a,b,')).toEqual(['a', 'b']);
    expect(parseList(' a , b ')).toEqual(['a', 'b']);
    expect(parseList(',,')).toEqual([]);
  });

  test('errorDetail：Error 取 message，非 Error 值转字符串', () => {
    expect(errorDetail(new Error('boom'))).toBe('boom');
    expect(errorDetail('oops')).toBe('oops');
    expect(errorDetail(42)).toBe('42');
  });

  test('segClass：active 追加 --active 修饰类，否则只基类', () => {
    expect(segClass(true)).toBe('seg__btn seg__btn--active');
    expect(segClass(false)).toBe('seg__btn');
    expect(segClass(true)).toContain('--active');
    expect(segClass(false)).not.toContain('--active');
  });
});
