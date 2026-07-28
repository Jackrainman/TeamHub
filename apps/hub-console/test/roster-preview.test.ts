import { describe, expect, test } from 'vitest';
import { MemberGradeSchema, type RosterImportRow } from '@teamhub/hub-contracts';
import {
  ROSTER_PREVIEW_GRADE_OPTIONS,
  removePreviewRow,
  setPreviewRowGrade,
  setPreviewRowGroup,
} from '../src/features/settings/RosterPreviewTable';
import { GRADE_KEY } from '../src/shared/roster';
import { translations, type TranslationKey } from '../src/i18n/translations';

/**
 * 名册导入预览表（ROSTER-IMPORT-PREVIEW 刀⑦）纯数据单测——不测 DOM/RTL（「测逻辑不测 DOM」风格同
 * bootstrap-gate.test.ts）：年级选项七档、行编辑 helper（改年级重派生验收人 / 改组名 / 删行）、
 * 坏行绝不进提交的结构约束、新增 i18n 键 zh/en 双语齐全。
 */

function row(over: Partial<RosterImportRow> & Pick<RosterImportRow, 'displayName'>): RosterImportRow {
  return {
    grade: 'freshman',
    groupName: '电控',
    gateReviewer: false,
    gateReviewerAuto: false,
    line: 2,
    ...over,
  };
}

describe('roster-preview（刀⑦）：年级下拉选项', () => {
  test('七档有序（大一~大四 + 研一~研三），不含 legacy graduate，全过 MemberGradeSchema', () => {
    expect(ROSTER_PREVIEW_GRADE_OPTIONS).toEqual([
      'freshman',
      'sophomore',
      'junior',
      'senior',
      'grad1',
      'grad2',
      'grad3',
    ]);
    expect(ROSTER_PREVIEW_GRADE_OPTIONS).not.toContain('graduate');
    for (const g of ROSTER_PREVIEW_GRADE_OPTIONS) {
      expect(MemberGradeSchema.safeParse(g).success).toBe(true);
    }
  });

  test('每档在 GRADE_KEY 有文案键且 zh/en 双语齐全（复用刀⑥ settings.reviewers.grade.* 键）', () => {
    for (const g of ROSTER_PREVIEW_GRADE_OPTIONS) {
      const key = GRADE_KEY[g];
      expect(translations.zh[key]).toBeTruthy();
      expect(translations.en[key]).toBeTruthy();
    }
  });
});

describe('roster-preview（刀⑦）：行编辑 helper', () => {
  test('setPreviewRowGrade：改年级并按年级规则重派生验收人标记（与 server 同源），其他行不动', () => {
    const rows = [row({ displayName: '甲' }), row({ displayName: '乙', line: 3 })];
    // 大一 → 大三：gateReviewer / gateReviewerAuto 同步翻 true
    const promoted = setPreviewRowGrade(rows, 0, 'junior');
    expect(promoted[0]).toMatchObject({
      displayName: '甲',
      grade: 'junior',
      gateReviewer: true,
      gateReviewerAuto: true,
      line: 2, // 行号保留——store 拒行仍能指回原 CSV 行
    });
    expect(promoted[1]).toEqual(rows[1]);
    // 大三 → 大一：翻回 false
    const demoted = setPreviewRowGrade(promoted, 0, 'freshman');
    expect(demoted[0].gateReviewer).toBe(false);
    expect(demoted[0].gateReviewerAuto).toBe(false);
    // 研一（≥大三档）同样派生 true
    expect(setPreviewRowGrade(rows, 0, 'grad1')[0].gateReviewer).toBe(true);
  });

  test('setPreviewRowGroup：改组名（datalist 预填叶子组；手打新组名 = 导入时自动建组），其他行不动', () => {
    const rows = [row({ displayName: '甲' }), row({ displayName: '乙', line: 3 })];
    const next = setPreviewRowGroup(rows, 1, '新组');
    expect(next[1].groupName).toBe('新组');
    expect(next[0]).toEqual(rows[0]);
  });

  test('removePreviewRow：只删目标行（操作者主动剔除 = 不参与导入）', () => {
    const rows = [
      row({ displayName: '甲' }),
      row({ displayName: '乙', line: 3 }),
      row({ displayName: '丙', line: 4 }),
    ];
    expect(removePreviewRow(rows, 1).map((r) => r.displayName)).toEqual(['甲', '丙']);
    expect(removePreviewRow(rows, 0)).toHaveLength(2);
  });

  test('坏行绝不进提交：preview.failed 与 rows 结构上分离，编辑 helper 无任何入口触及 failed', () => {
    // 结构约束（非 DOM 断言）：提交载荷 = 编辑后的 rows 数组本身；failed 只作红标展示，
    // 三个 helper 的输入输出类型都是 rows（RosterImportRow[]），failed 段（{line,reason}）类型上进不来。
    const preview = {
      rows: [row({ displayName: '甲' })],
      failed: [{ line: 3, reason: '年级无法识别' }],
    };
    const submitted = removePreviewRow(
      setPreviewRowGroup(setPreviewRowGrade(preview.rows, 0, 'senior'), 0, '机械'),
      0,
    );
    expect(submitted).toEqual([]); // 编辑链只作用于 rows；failed 恒不在其中
    expect(preview.failed).toHaveLength(1); // failed 未被任何编辑触碰
  });
});

describe('roster-preview（刀⑦）：i18n 键 zh/en 双语齐全', () => {
  test('settings.roster.preview.* 全部新键 zh/en 均有文案', () => {
    const keys: TranslationKey[] = [
      'settings.roster.preview.hint',
      'settings.roster.preview.failed',
      'settings.roster.preview.colName',
      'settings.roster.preview.colGrade',
      'settings.roster.preview.colGroup',
      'settings.roster.preview.colActions',
      'settings.roster.preview.removeRow',
      'settings.roster.preview.confirm',
      'settings.roster.preview.cancel',
      'settings.roster.preview.empty',
    ];
    for (const key of keys) {
      expect(translations.zh[key]).toBeTruthy();
      expect(translations.en[key]).toBeTruthy();
    }
  });
});
