import { afterEach, describe, expect, test } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { kbScenarioFixture } from '@teamhub/hub-contracts';
import type {
  ArchiveDocument,
  ErrorEntry,
  IssueCard,
} from '@teamhub/hub-contracts';
import { InMemoryKbStore } from '../src/store/mock-kb-store.js';
import { FileKbStore } from '../src/store/file-kb-store.js';

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
});

describe('FileKbStore 落盘', () => {
  let dir = '';
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  test('append 后落盘 + 新实例从同文件加载（重启不丢）', async () => {
    dir = await mkdtemp(join(tmpdir(), 'kb-'));
    const file = join(dir, 'kb.json');

    const store = await FileKbStore.create(file);
    await store.appendCloseout(append);

    const onDisk = JSON.parse(await readFile(file, 'utf8'));
    expect(
      onDisk.issueCards.some((card: { id: string }) => card.id === 'iss-test-1'),
    ).toBe(true);

    // 模拟重启：新实例从同一文件加载，追加数据仍在
    const reloaded = await FileKbStore.create(file);
    expect(
      (await reloaded.getKbSnapshot()).issueCards.some(
        (card) => card.id === 'iss-test-1',
      ),
    ).toBe(true);
  });

  test('文件不存在 → seed 起头并落一次盘', async () => {
    dir = await mkdtemp(join(tmpdir(), 'kb-'));
    const file = join(dir, 'seed.json');

    const store = await FileKbStore.create(file);
    const snap = await store.getKbSnapshot();
    expect(snap.issueCards.length).toBe(kbScenarioFixture.issueCards.length);

    const onDisk = JSON.parse(await readFile(file, 'utf8'));
    expect(onDisk.projectId).toBe(kbScenarioFixture.projectId);
  });
});
