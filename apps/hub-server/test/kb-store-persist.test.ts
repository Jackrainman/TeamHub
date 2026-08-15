import { afterEach, describe, expect, test } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { kbScenarioFixture } from '@teamhub/hub-contracts';
import type {
  ArchiveDocument,
  ErrorEntry,
  IssueCard,
} from '@teamhub/hub-contracts';
import { InMemoryKbStore } from './support/inmemory-kb-store.js';

const issue: IssueCard = {
  id: 'iss-test-1',
  projectId: 'prj-robots',
  title: '测试问题',
  rawInput: '测试',
  normalizedSummary: '测试',
  symptomSummary: '测试',
  suspectedDirections: [],
  suggestedActions: [],
  status: 'archived',
  severity: 'low',
  tags: ['测试'],
  relatedFiles: [],
  relatedCommits: [],
  relatedHistoricalIssueIds: [],
  createdAt: '2026-06-14T00:00:00.000Z',
  updatedAt: '2026-06-14T00:00:00.000Z',
};

const errorEntry: ErrorEntry = {
  id: 'err-test-1',
  projectId: 'prj-robots',
  sourceIssueId: 'iss-test-1',
  errorCode: 'DBG-20260614-001',
  title: '测试问题',
  category: '测试',
  symptom: '测试',
  rootCause: '根因',
  resolution: '处理',
  prevention: '预防',
  relatedFiles: [],
  relatedCommits: [],
  archiveFilePath: '.debug_workspace/archive/2026-06-14_test.md',
  createdAt: '2026-06-14T00:00:00.000Z',
  updatedAt: '2026-06-14T00:00:00.000Z',
};

const archiveDocument: ArchiveDocument = {
  issueId: 'iss-test-1',
  projectId: 'prj-robots',
  fileName: '2026-06-14_test.md',
  filePath: '.debug_workspace/archive/2026-06-14_test.md',
  markdownContent: '# 测试',
  generatedBy: 'ai',
  generatedAt: '2026-06-14T00:00:00.000Z',
};

const append = { issueCard: issue, errorEntry, archiveDocument };

describe('InMemoryKbStore.appendCloseout', () => {
  test('追加进语料 + 不污染共享 fixture + 实例间隔离', async () => {
    const fixtureLenBefore = kbScenarioFixture.issueCards.length;
    const store = new InMemoryKbStore();
    await store.appendCloseout(append);

    const snap = await store.getKbSnapshot();
    expect(snap.issueCards.some((card) => card.id === 'iss-test-1')).toBe(true);
    expect(snap.errorEntries.some((entry) => entry.id === 'err-test-1')).toBe(
      true,
    );
    expect(
      snap.archiveDocuments.some((doc) => doc.issueId === 'iss-test-1'),
    ).toBe(true);

    // 共享 fixture 未被污染（构造期克隆）
    expect(kbScenarioFixture.issueCards.length).toBe(fixtureLenBefore);
    // 另一实例看不到本实例的追加（隔离）
    const other = new InMemoryKbStore();
    expect(
      (await other.getKbSnapshot()).issueCards.some(
        (card) => card.id === 'iss-test-1',
      ),
    ).toBe(false);
  });

  test('issueCard 按 id upsert（不重复、取最新）', async () => {
    const store = new InMemoryKbStore();
    await store.appendCloseout(append);
    await store.appendCloseout({
      ...append,
      issueCard: { ...issue, title: '测试问题-改' },
    });
    const cards = (await store.getKbSnapshot()).issueCards.filter(
      (card) => card.id === 'iss-test-1',
    );
    expect(cards).toHaveLength(1);
    expect(cards[0].title).toBe('测试问题-改');
  });

  // 修复 #2：errorEntry 按 id upsert、archiveDocument 按 issueId upsert（原为无条件 push → 重复结案堆重复主键）。
  test('errorEntry 按 id / archiveDocument 按 issueId upsert（重复结案不堆重复、取最新）', async () => {
    const store = new InMemoryKbStore();
    await store.appendCloseout(append);
    await store.appendCloseout({
      ...append,
      errorEntry: { ...errorEntry, rootCause: '根因-改' },
      archiveDocument: { ...archiveDocument, markdownContent: '# 测试-改' },
    });
    const snap = await store.getKbSnapshot();
    const errs = snap.errorEntries.filter((e) => e.id === 'err-test-1');
    expect(errs).toHaveLength(1);
    expect(errs[0].rootCause).toBe('根因-改');
    const docs = snap.archiveDocuments.filter((d) => d.issueId === 'iss-test-1');
    expect(docs).toHaveLength(1);
    expect(docs[0].markdownContent).toBe('# 测试-改');
  });
});
