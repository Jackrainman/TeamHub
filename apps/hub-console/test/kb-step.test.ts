import { describe, expect, test } from 'vitest';
import { KbImportDocsReportSchema } from '../src/api/schemas/kb';
import {
  KB_DOC_ACCEPT,
  kbImportReportCounts,
} from '../src/features/setup/BootstrapGate';
import { translations } from '../src/i18n/translations';

/**
 * 初始化向导「知识库」步（KB-BULK-MD-IMPORT 打磨轮刀⑫）纯数据单测——不测 DOM/RTL
 * （「测逻辑不测 DOM」，同 fleet-step.test.ts 范式）：报告计数 helper + accept 串 + i18n 双语键齐全。
 */
describe('kb-step: 报告计数 helper', () => {
  test('kbImportReportCounts = 三段长度（导入 N / 跳过 M / 失败 K）', () => {
    const report = KbImportDocsReportSchema.parse({
      imported: [
        { id: 'iss-md-a-deadbeef', title: 'A' },
        { id: 'iss-md-b-cafebabe', title: 'B' },
      ],
      skipped: [{ title: 'notes.txt', reason: '仅支持 .md / .markdown 文件' }],
      failed: [],
    });
    expect(kbImportReportCounts(report)).toEqual({ imported: 2, skipped: 1, failed: 0 });
  });

  test('空报告 → 全 0（用户直接「跳过」路径不出现报告）', () => {
    const report = KbImportDocsReportSchema.parse({ imported: [], skipped: [], failed: [] });
    expect(kbImportReportCounts(report)).toEqual({ imported: 0, skipped: 0, failed: 0 });
  });
});

describe('kb-step: accept 串与 i18n 双语键', () => {
  test('KB_DOC_ACCEPT 只收 .md/.markdown（与 server 后缀白名单同律）', () => {
    expect(KB_DOC_ACCEPT).toBe('.md,.markdown');
  });

  test('gate.kb.* / gate.step.kb 键 zh+en 齐全且非空', () => {
    const keys = [
      'gate.step.kb',
      'gate.kb.desc',
      'gate.kb.pick',
      'gate.kb.uploading',
      'gate.kb.report',
      'gate.kb.error',
      'gate.kb.skip',
      'gate.kb.next',
    ] as const;
    for (const key of keys) {
      expect(translations.zh[key].length).toBeGreaterThan(0);
      expect(translations.en[key].length).toBeGreaterThan(0);
    }
    // 报告计数三参数双语都在模板里（计数 helper 的三个键名就是 i18n 参数名）。
    for (const param of ['{imported}', '{skipped}', '{failed}']) {
      expect(translations.zh['gate.kb.report']).toContain(param);
      expect(translations.en['gate.kb.report']).toContain(param);
    }
  });

  test('步序号同步：subtitle 七步、done ⑧（kb 插在 inventory 与 done 之间，season ④ 见 season-step.test.ts）', () => {
    expect(translations.zh['gate.subtitle']).toContain('七步');
    expect(translations.en['gate.subtitle']).toContain('Seven steps');
    expect(translations.zh['gate.done.title']).toBe('⑧ 完成');
    expect(translations.en['gate.done.title']).toBe('(8) Done');
  });
});
