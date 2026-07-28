import { describe, expect, test } from 'vitest';
import { MemberGradeSchema } from '@teamhub/hub-contracts';
import {
  WHO_GRADE_OPTIONS,
  WIZARD_STEP_META,
  WIZARD_STEP_ORDER,
  WIZARD_STEP_TOTAL,
} from '../src/features/setup/BootstrapGate';
import { GRADE_KEY } from '../src/shared/roster';
import { translations } from '../src/i18n/translations';

/**
 * 初始化门「你是谁」年级下拉（GRADE-7-TIERS 刀⑥）纯数据单测——不测 DOM/RTL（本仓无 jsdom/RTL
 * 依赖，「测逻辑不测 DOM」风格同 identity.test.ts / console-pages.test.ts）：选项 = 七档有序、
 * 默认/legacy 语义正确、每项都有 GRADE_KEY 文案键且 zh/en 双语齐全。
 */
describe('bootstrap-gate: WHO_GRADE_OPTIONS 年级下拉选项', () => {
  test('七档有序：大一~大四 + 研一~研三', () => {
    expect(WHO_GRADE_OPTIONS).toEqual([
      'freshman',
      'sophomore',
      'junior',
      'senior',
      'grad1',
      'grad2',
      'grad3',
    ]);
  });

  test('不含 legacy 档 graduate（旧数据仅 parse 兼容，新建选项不产）；每档均可过 MemberGradeSchema', () => {
    expect(WHO_GRADE_OPTIONS).not.toContain('graduate');
    for (const g of WHO_GRADE_OPTIONS) {
      expect(MemberGradeSchema.safeParse(g).success).toBe(true);
    }
  });

  test('每档在 GRADE_KEY 有文案键，且 zh/en 双语齐全（WhoStep 复用 settings.reviewers.grade.* 键）', () => {
    for (const g of WHO_GRADE_OPTIONS) {
      const key = GRADE_KEY[g];
      expect(translations.zh[key]).toBeTruthy();
      expect(translations.en[key]).toBeTruthy();
    }
    // 研档 zh 文案即 研一/研二/研三
    expect(translations.zh[GRADE_KEY.grad1]).toBe('研一');
    expect(translations.zh[GRADE_KEY.grad2]).toBe('研二');
    expect(translations.zh[GRADE_KEY.grad3]).toBe('研三');
  });
});

/**
 * 「上一步」回退（WIZARD-BACK 修复刀，known-bugs 2026-07-28 #1）纯数据锚点——步序数组与
 * WIZARD_STEP_META 的 n 序号一致（回退 = 下标 -1，错位则回错步）；gate.back 文案 zh/en 齐全。
 */
describe('bootstrap-gate: WIZARD_STEP_ORDER 回退步序', () => {
  test('八步有序：who → roster → leads → season → fleet → inventory → kb → done', () => {
    expect(WIZARD_STEP_ORDER).toEqual([
      'who',
      'roster',
      'leads',
      'season',
      'fleet',
      'inventory',
      'kb',
      'done',
    ]);
    expect(WIZARD_STEP_ORDER).toHaveLength(WIZARD_STEP_TOTAL);
  });

  test('步序数组与 WIZARD_STEP_META.n 一一对应（回退按数组下标走）', () => {
    WIZARD_STEP_ORDER.forEach((step, idx) => {
      expect(WIZARD_STEP_META[step].n).toBe(idx + 1);
    });
  });

  test('gate.back 文案 zh/en 齐全且非空', () => {
    expect(translations.zh['gate.back']).toBeTruthy();
    expect(translations.en['gate.back']).toBeTruthy();
  });
});
