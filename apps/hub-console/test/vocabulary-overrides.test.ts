import { afterEach, describe, expect, test } from 'vitest';
import { translate } from '../src/i18n/translations';
import { resetVocabularyOverrides, setVocabularyOverrides } from '../src/i18n/vocabulary-overrides';
import { ROBOTICS_VOCAB_OVERRIDES } from '../src/verticals/robotics';

/**
 * 租户词汇覆盖层接线（PHASE2-CONSOLE-ASSEMBLY，D-081 已知延后项②收口）：`translate()` 的读取点
 * （`resolveVocabularyOverride`）此前早已存在，只是 `setVocabularyOverrides` 零消费方——本测试证明
 * 写侧真起效，且覆盖表清空后精确回退巨表原值（不残留污染，见 App.tsx 装配点调用）。
 */
describe('i18n: 词汇覆盖层（setVocabularyOverrides → translate 消费）', () => {
  afterEach(() => {
    resetVocabularyOverrides();
  });

  test('未设置覆盖：translate 走巨表原值', () => {
    expect(translate('zh', 'nav.overview')).toBe('总览');
    expect(translate('en', 'nav.overview')).toBe('Overview');
  });

  test('设置覆盖后：命中语言换新文案，未填的语言仍回退巨表', () => {
    setVocabularyOverrides({ 'nav.overview': { zh: '任务总览' } });
    expect(translate('zh', 'nav.overview')).toBe('任务总览');
    expect(translate('en', 'nav.overview')).toBe('Overview');
  });

  test('resetVocabularyOverrides 清空后精确回退巨表原值（不残留污染，供测试间隔离）', () => {
    setVocabularyOverrides({ 'nav.overview': { zh: '任务总览' } });
    resetVocabularyOverrides();
    expect(translate('zh', 'nav.overview')).toBe('总览');
  });

  test('覆盖表只影响命中的 key，其余 key 不受影响', () => {
    setVocabularyOverrides({ 'nav.overview': { zh: '任务总览' } });
    expect(translate('zh', 'nav.project')).toBe('项目');
  });

  test('robotics 垂直包覆盖表恒为空：接线后 robotics 租户渲染文案零变化（巨表本就是机器人战队词汇）', () => {
    expect(ROBOTICS_VOCAB_OVERRIDES).toEqual({});
  });
});

/**
 * 新增 key（AUDIT-DEBT-2026-07 §9-④ 审计债⑥）：此前覆盖表 key 类型钉死 `TranslationKey`（巨表已有
 * 的闭集），垂直包无法挂一个巨表里完全不存在的全新词汇槽。放宽为 `VocabularyKey`
 * （`TranslationKey | (string & {})`）后，任意新字符串 key 都能设置覆盖并被 translate() 消费。
 */
describe('i18n: 词汇覆盖层支持新增 key（非巨表已有闭集）', () => {
  afterEach(() => {
    resetVocabularyOverrides();
  });

  test('全新 key（巨表里不存在）设置覆盖后可被 translate 正确解析', () => {
    setVocabularyOverrides({ 'gamestudio.field.buildTag': { zh: '构建标签', en: 'Build Tag' } });
    expect(translate('zh', 'gamestudio.field.buildTag')).toBe('构建标签');
    expect(translate('en', 'gamestudio.field.buildTag')).toBe('Build Tag');
  });

  test('全新 key 未设覆盖时：translate 无巨表值可回退，原样返回 key 本身（既有兜底路径，非新回归）', () => {
    expect(translate('zh', 'gamestudio.field.neverOverridden')).toBe(
      'gamestudio.field.neverOverridden',
    );
  });

  test('新 key 覆盖与已知 key 覆盖互不干扰、可同表共存', () => {
    setVocabularyOverrides({
      'nav.overview': { zh: '任务总览' },
      'gamestudio.field.buildTag': { zh: '构建标签' },
    });
    expect(translate('zh', 'nav.overview')).toBe('任务总览');
    expect(translate('zh', 'gamestudio.field.buildTag')).toBe('构建标签');
  });
});
