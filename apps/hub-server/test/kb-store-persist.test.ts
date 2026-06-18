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

  // 修复 #3：persist 失败 → 回滚到写前语料（避免「内存已变更 + 客户端 500 重试」产生重复）。
  test('appendCloseout persist 失败 → 内存回滚（不留幽灵语料）', async () => {
    dir = await mkdtemp(join(tmpdir(), 'kb-rollback-'));
    const sub = join(dir, 'kbdir');
    await mkdir(sub);
    const file = join(sub, 'kb.json');
    const store = await FileKbStore.create(file);
    const before = await store.getKbSnapshot();
    const cardsBefore = before.issueCards.length;
    const errsBefore = before.errorEntries.length;
    const docsBefore = before.archiveDocuments.length;

    await rm(sub, { recursive: true, force: true });
    await writeFile(sub, 'blocker'); // 让下次 persist 失败

    await expect(store.appendCloseout(append)).rejects.toThrow();

    const after = await store.getKbSnapshot();
    expect(after.issueCards.length).toBe(cardsBefore);
    expect(after.errorEntries.length).toBe(errsBefore);
    expect(after.archiveDocuments.length).toBe(docsBefore);
    expect(after.issueCards.some((c) => c.id === 'iss-test-1')).toBe(false);
  });

  // H2（AUDIT-FIXES 部署前必修）：一次写失败不能永久毒化写链。原实现 writeChain 变 rejected 后，
  // 之后每次 persist 的 .then 被静默跳过、内存与磁盘分叉。修复后：失败被隔离（链 reset 为 resolved），
  // 下一次 append 仍能真正落盘。
  test('写失败后写链不中毒：恢复后下一次 append 仍能落盘', async () => {
    dir = await mkdtemp(join(tmpdir(), 'kb-h2-'));
    const sub = join(dir, 'kbdir');
    await mkdir(sub);
    const file = join(sub, 'kb.json');
    const store = await FileKbStore.create(file); // 初次 persist OK

    // 制造一次确定性写失败：把承载目录换成普通文件 → 下次 persist 的 mkdir(sub) 抛 EEXIST（跨平台、root 也抛）。
    await rm(sub, { recursive: true, force: true });
    await writeFile(sub, 'blocker');
    await expect(store.appendCloseout(append)).rejects.toThrow();

    // 修复目录后再写——若写链被毒化，这次会「报成功却不落盘」；修复后必须真正写到磁盘。
    await rm(sub);
    await mkdir(sub);
    await store.appendCloseout({
      ...append,
      issueCard: { ...issue, id: 'iss-after-fail' },
    });

    const onDisk = JSON.parse(await readFile(file, 'utf8'));
    expect(
      onDisk.issueCards.some((c: { id: string }) => c.id === 'iss-after-fail'),
    ).toBe(true);
  });
});
