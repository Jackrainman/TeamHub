import { describe, expect, test } from 'vitest';

import {
  ArchiveDocumentSchema,
  ErrorEntrySchema,
  IssueCardSchema,
  KB_ARRAY_MAX,
  KB_TITLE_MAX,
  kbScenarioFixture,
} from '../src/index.js';

// U1（KB-CORE）：kb.ts schema 链 + kbScenarioFixture 的工程谓词——
// 锚点场景全部 safeParse 通过，证明移植后的 Zod 链与 fixture 自洽。

describe('KB-CORE kb.ts schema 链 + 锚点 fixture', () => {
  test('kbScenarioFixture 的 issueCards 全部过 IssueCardSchema（含跨赛季历史 bug）', () => {
    expect(kbScenarioFixture.issueCards.length).toBeGreaterThan(0);
    for (const issue of kbScenarioFixture.issueCards) {
      expect(() => IssueCardSchema.parse(issue)).not.toThrow();
    }
    // 知识库价值锚点：历史卡是 resolved/archived（可被相似检索召回）
    for (const issue of kbScenarioFixture.issueCards) {
      expect(['resolved', 'archived']).toContain(issue.status);
    }
  });

  test('errorEntries 过 ErrorEntrySchema（errorCode 匹配 DBG-YYYYMMDD-NNN）', () => {
    for (const entry of kbScenarioFixture.errorEntries) {
      expect(() => ErrorEntrySchema.parse(entry)).not.toThrow();
      expect(entry.errorCode).toMatch(/^DBG-\d{8}-\d{3}$/);
    }
  });

  test('archiveDocuments 过 ArchiveDocumentSchema（fileName 匹配 + generatedBy 非人名）', () => {
    for (const doc of kbScenarioFixture.archiveDocuments) {
      expect(() => ArchiveDocumentSchema.parse(doc)).not.toThrow();
      // I0：归档来源是 ai/manual/hybrid，不记「谁结的案」
      expect(['ai', 'manual', 'hybrid']).toContain(doc.generatedBy);
    }
  });

  test('IssueCard 保留 normalizedSummary/relatedFiles/relatedCommits（buildCloseoutFromIssue 依赖）', () => {
    const sample = kbScenarioFixture.issueCards[0];
    expect(sample).toHaveProperty('normalizedSummary');
    expect(sample).toHaveProperty('relatedFiles');
    expect(sample).toHaveProperty('relatedCommits');
    // 移植时去掉 repoSnapshot（Probe_Flash desktop 专用 git 快照）
    expect(sample).not.toHaveProperty('repoSnapshot');
  });
});

// M17：字符串/数组字段上限——防一次结案请求整文件重写 / 数组无限增长。
describe('IssueCardSchema 字段上限（M17）', () => {
  const base = kbScenarioFixture.issueCards.find((i) => i.status !== 'archived')
    ?? kbScenarioFixture.issueCards[0];

  test('title 超 KB_TITLE_MAX → 拒绝', () => {
    const tooLong = { ...base, title: 'x'.repeat(KB_TITLE_MAX + 1) };
    expect(IssueCardSchema.safeParse(tooLong).success).toBe(false);
    const atLimit = { ...base, title: 'x'.repeat(KB_TITLE_MAX) };
    expect(IssueCardSchema.safeParse(atLimit).success).toBe(true);
  });

  test('tags 数组超 KB_ARRAY_MAX → 拒绝', () => {
    const tooMany = { ...base, tags: Array.from({ length: KB_ARRAY_MAX + 1 }, (_, i) => `t${i}`) };
    expect(IssueCardSchema.safeParse(tooMany).success).toBe(false);
  });

  test('suspectedDirections 数组超上限 → 拒绝', () => {
    const tooMany = {
      ...base,
      suspectedDirections: Array.from({ length: KB_ARRAY_MAX + 1 }, (_, i) => `d${i}`),
    };
    expect(IssueCardSchema.safeParse(tooMany).success).toBe(false);
  });

  test('正常体量卡仍通过（上限不误伤真实排障文本）', () => {
    expect(IssueCardSchema.safeParse(base).success).toBe(true);
  });
});
