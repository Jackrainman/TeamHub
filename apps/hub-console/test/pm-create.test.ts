import { describe, expect, test } from 'vitest';
import { actorFromName } from '../src/features/pm/actor';

// actorFromName 产出依赖/需求创建的 confirmedBy（I0 敏感）：空/纯空白→null（不产空 confirmer），
// 非空→console ActorRef（id 连字符化、displayName 原文 trim）。
describe('actorFromName（confirmedBy 来源派生）', () => {
  test('空串 → null（钉死空 confirmer→null confirmedBy 的 I0 不变量）', () => {
    expect(actorFromName('')).toBeNull();
  });

  test('纯空白 → null', () => {
    expect(actorFromName('   ')).toBeNull();
  });

  test('中文名带空格 → id 连字符化、displayName 保原文 trim、source=console', () => {
    expect(actorFromName('张 三')).toEqual({
      id: '张-三',
      displayName: '张 三',
      source: 'console',
    });
  });

  test('英文名前后空白 → 小写连字符 id、displayName trim', () => {
    expect(actorFromName('  Zhang San  ')).toEqual({
      id: 'zhang-san',
      displayName: 'Zhang San',
      source: 'console',
    });
  });
});
