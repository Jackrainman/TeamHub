import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import FormData from 'form-data';
import {
  KbImportDocsReportSchema,
  governanceScenarioFixture,
  type ArchiveDocument,
  type GovernanceSnapshot,
  type Group,
  type KbSnapshot,
  type Member,
} from '@teamhub/hub-contracts';
import { buildTestHubServer } from './support/build-test-hub-server.js';
import { InMemoryGovStore } from './support/inmemory-gov-store.js';
import { InMemoryKbStore } from './support/inmemory-kb-store.js';

/**
 * KB 批量 md 导入端到端（KB-BULK-MD-IMPORT 打磨轮刀⑫）：POST /api/kb/import-docs——
 * 多文件 multipart 导入落库（generatedBy='manual' 钉住 / 只进 archiveDocuments 不碰 issueCards·errorEntries）/
 * 同 title 重导 skipped（幂等不翻倍）/ 非 md skipped / 鉴权（身份非持旗 403、无会话 401、匿名 Bearer 双轨）/
 * 持久化契约由 sqlite-unified.test.ts 统一覆盖。
 */

// 构造多文件 multipart 请求体（同名字段 'files'，与 console postMultiFormData 对齐；
// server request.files() 收全部文件 part）。
function multipartMulti(files: readonly { name: string; content: string }[]) {
  const form = new FormData();
  for (const f of files) {
    form.append('files', Buffer.from(f.content, 'utf8'), { filename: f.name });
  }
  return { payload: form.getBuffer(), headers: form.getHeaders() };
}

/** 干净 KB 种子：保留 projectId，三数组清空（避开 fixture 语料干扰计数）。 */
function emptyKb(): KbSnapshot {
  return { projectId: 'prj-robots', issueCards: [], errorEntries: [], archiveDocuments: [] };
}

const GRP_MECH = {
  id: 'grp-mech',
  seasonId: 'season-robocon-2026',
  parentGroupId: null,
  name: '机械',
  kind: 'mechanical',
} as const;

function member(over: Partial<Member> & Pick<Member, 'id' | 'displayName'>): Member {
  return {
    role: 'member',
    grade: 'sophomore',
    groupId: 'grp-mech',
    status: 'idle',
    currentTaskId: null,
    updatedBy: 'console',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

function seedGov(members: Member[], groups: readonly Group[] = [GRP_MECH]): GovernanceSnapshot {
  return {
    ...governanceScenarioFixture,
    groups: [...groups],
    members,
    tasks: [],
    dependencies: [],
    needs: [],
    knowledgeNodes: [],
    taskKnowledgeTags: [],
    artifacts: [],
  };
}

/** 身份模式登录，回带 session cookie（member 无 pinHash 免 PIN）。 */
async function login(app: ReturnType<typeof buildTestHubServer>, memberId: string): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/api/session', payload: { memberId } });
  const cookie = res.cookies.find((c) => c.name === 'teamhub_session');
  expect(cookie?.value).toBeTruthy();
  return `teamhub_session=${cookie!.value}`;
}

describe('POST /api/kb/import-docs — 匿名模式', () => {
  test('多文件导入落库：generatedBy=manual 钉住、title=文件名去后缀、只进 archiveDocuments', async () => {
    const kbStore = new InMemoryKbStore(emptyKb());
    const app = buildTestHubServer({ kbStore });
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/kb/import-docs',
        ...multipartMulti([
          { name: '2024赛季总结.md', content: '# 2024 赛季总结\n我们是冠军。' },
          { name: 'can-debug.markdown', content: '# CAN 掉线\n终端电阻没焊。' },
        ]),
      });
      expect(res.statusCode).toBe(200);
      const report = KbImportDocsReportSchema.parse(res.json());
      expect(report.imported).toHaveLength(2);
      expect(report.skipped).toEqual([]);
      expect(report.failed).toEqual([]);
      expect(report.imported.map((d) => d.title).sort()).toEqual([
        '2024赛季总结',
        'can-debug',
      ]);
      for (const d of report.imported) expect(d.id).toMatch(/^iss-md-/);

      const snap = await kbStore.getKbSnapshot();
      expect(snap.archiveDocuments).toHaveLength(2);
      // 只进 archiveDocuments：issueCards / errorEntries 零变化（无结案语义）。
      expect(snap.issueCards).toEqual([]);
      expect(snap.errorEntries).toEqual([]);
      const season = snap.archiveDocuments.find((d) => d.markdownContent.includes('冠军'))!;
      expect(season.generatedBy).toBe('manual'); // I0：非人名
      expect(season.fileName).toMatch(/^\d{4}-\d{2}-\d{2}_[a-z0-9-]+\.md$/);
      expect(season.filePath).toBe(`.debug_workspace/archive/${season.fileName}`);
      expect(season.projectId).toBe('prj-robots');
    } finally {
      await app.close();
    }
  });

  test('幂等：同 title 重导 → skipped 不翻倍；同批同名文件也只取首条', async () => {
    const kbStore = new InMemoryKbStore(emptyKb());
    const app = buildTestHubServer({ kbStore });
    try {
      const files = [{ name: 'notes.md', content: '# 笔记 v1' }];
      const first = await app.inject({
        method: 'POST',
        url: '/api/kb/import-docs',
        ...multipartMulti(files),
      });
      expect(KbImportDocsReportSchema.parse(first.json()).imported).toHaveLength(1);
      // 重导同 title（.markdown 后缀同 title 也判重）→ skipped。
      const second = await app.inject({
        method: 'POST',
        url: '/api/kb/import-docs',
        ...multipartMulti([{ name: 'notes.markdown', content: '# 笔记 v2 改动' }]),
      });
      const report2 = KbImportDocsReportSchema.parse(second.json());
      expect(report2.imported).toEqual([]);
      expect(report2.skipped).toHaveLength(1);
      expect(report2.skipped[0].title).toBe('notes');
      expect(report2.skipped[0].reason).toContain('幂等');
      const snap = await kbStore.getKbSnapshot();
      expect(snap.archiveDocuments).toHaveLength(1);
      expect(snap.archiveDocuments[0].markdownContent).toContain('v1'); // 不覆盖旧档

      // 同批内两个同名文件（不同目录带来）→ 只取首条，第二条 skipped。
      const third = await app.inject({
        method: 'POST',
        url: '/api/kb/import-docs',
        ...multipartMulti([
          { name: 'fresh.md', content: '# 首条' },
          { name: 'fresh.markdown', content: '# 重复' },
        ]),
      });
      const report3 = KbImportDocsReportSchema.parse(third.json());
      expect(report3.imported).toHaveLength(1);
      expect(report3.skipped).toHaveLength(1);
      expect((await kbStore.getKbSnapshot()).archiveDocuments).toHaveLength(2);
    } finally {
      await app.close();
    }
  });

  test('非 md 后缀 → skipped 记原因，不落库；md 文件同批照常导入', async () => {
    const kbStore = new InMemoryKbStore(emptyKb());
    const app = buildTestHubServer({ kbStore });
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/kb/import-docs',
        ...multipartMulti([
          { name: 'readme.txt', content: 'hello' },
          { name: 'real.md', content: '# 真文档' },
        ]),
      });
      expect(res.statusCode).toBe(200);
      const report = KbImportDocsReportSchema.parse(res.json());
      expect(report.imported).toHaveLength(1);
      expect(report.imported[0].title).toBe('real');
      expect(report.skipped).toHaveLength(1);
      expect(report.skipped[0].reason).toContain('.md');
      expect((await kbStore.getKbSnapshot()).archiveDocuments).toHaveLength(1);
    } finally {
      await app.close();
    }
  });

  test('非 multipart 请求体 → 400，不落库', async () => {
    const kbStore = new InMemoryKbStore(emptyKb());
    const app = buildTestHubServer({ kbStore });
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/kb/import-docs',
        payload: { nope: true },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().detail).toContain('multipart');
      expect((await kbStore.getKbSnapshot()).archiveDocuments).toHaveLength(0);
    } finally {
      await app.close();
    }
  });
});

describe('POST /api/kb/import-docs — 身份模式鉴权（无空板豁免，向导走到这步操作者已持旗）', () => {
  const files = [{ name: 'doc.md', content: '# 文档' }];

  test('已登录但非持旗成员 → 403', async () => {
    const app = buildTestHubServer({
      store: new InMemoryGovStore(seedGov([member({ id: 'm-plain', displayName: '普通成员' })])),
      kbStore: new InMemoryKbStore(emptyKb()),
      identityMode: 'identity',
    });
    try {
      const cookie = await login(app, 'm-plain');
      const payload = multipartMulti(files);
      const res = await app.inject({
        method: 'POST',
        url: '/api/kb/import-docs',
        payload: payload.payload,
        headers: { ...payload.headers, cookie },
      });
      expect(res.statusCode).toBe(403);
    } finally {
      await app.close();
    }
  });

  test('持旗管理员登录 → 200 导入', async () => {
    const kbStore = new InMemoryKbStore(emptyKb());
    const app = buildTestHubServer({
      store: new InMemoryGovStore(
        seedGov([member({ id: 'm-boss', displayName: '队长', projectManager: true })]),
      ),
      kbStore,
      identityMode: 'identity',
    });
    try {
      const cookie = await login(app, 'm-boss');
      const payload = multipartMulti(files);
      const res = await app.inject({
        method: 'POST',
        url: '/api/kb/import-docs',
        payload: payload.payload,
        headers: { ...payload.headers, cookie },
      });
      expect(res.statusCode).toBe(200);
      expect(KbImportDocsReportSchema.parse(res.json()).imported).toHaveLength(1);
      expect((await kbStore.getKbSnapshot()).archiveDocuments).toHaveLength(1);
    } finally {
      await app.close();
    }
  });

  test('无会话 → 401（写门「须有会话」段先挡，无空板豁免）', async () => {
    const app = buildTestHubServer({
      store: new InMemoryGovStore(seedGov([member({ id: 'm-plain', displayName: '普通成员' })])),
      kbStore: new InMemoryKbStore(emptyKb()),
      identityMode: 'identity',
    });
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/kb/import-docs',
        ...multipartMulti(files),
      });
      expect(res.statusCode).toBe(401);
    } finally {
      await app.close();
    }
  });
});

describe('写门 × writeToken（匿名模式走 Bearer，照名册/库存双轨范式）', () => {
  test('匿名 + 配 writeToken：无 Bearer 401；带 Bearer 200', async () => {
    const app = buildTestHubServer({
      kbStore: new InMemoryKbStore(emptyKb()),
      writeToken: 'sekret',
    });
    try {
      const noAuth = await app.inject({
        method: 'POST',
        url: '/api/kb/import-docs',
        ...multipartMulti([{ name: 'doc.md', content: '# 文档' }]),
      });
      expect(noAuth.statusCode).toBe(401);
      const payload = multipartMulti([{ name: 'doc.md', content: '# 文档' }]);
      const withAuth = await app.inject({
        method: 'POST',
        url: '/api/kb/import-docs',
        payload: payload.payload,
        headers: { ...payload.headers, authorization: 'Bearer sekret' },
      });
      expect(withAuth.statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });
});
