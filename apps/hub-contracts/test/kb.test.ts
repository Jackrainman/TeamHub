import { describe, expect, test } from 'vitest';

import {
  ArchiveDocumentSchema,
  ErrorEntrySchema,
  IssueCardSchema,
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
