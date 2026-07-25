import { describe, expect, test } from 'vitest';
import { MemberGradeSchema } from '@teamhub/hub-contracts';
import { WHO_GRADE_OPTIONS } from '../src/features/setup/BootstrapGate';
import { GRADE_KEY } from '../src/features/settings/SettingsPage';
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
