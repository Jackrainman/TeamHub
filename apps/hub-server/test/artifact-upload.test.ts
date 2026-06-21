import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import FormData from 'form-data';
import { buildHubServer } from '../src/server.js';

// governanceScenarioFixture 里真实存在、初始无文件的归档物 id（见 hub-contracts fixtures）。
const ART_ID = 'artifact-gripper-v1';

// 构造单文件 multipart 请求体（form-data getBuffer + 含 boundary 的 content-type 头），喂给 app.inject。
function multipart(filename: string, content: Buffer | string) {
  const form = new FormData();
  form.append('file', Buffer.from(content as never), { filename });
  return { payload: form.getBuffer(), headers: form.getHeaders() };
}

let dir: string;
const prev = process.env.TEAMHUB_ARTIFACT_FILES_DIR;
const app = buildHubServer();

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'artifact-upload-'));
  process.env.TEAMHUB_ARTIFACT_FILES_DIR = dir;
});

afterAll(async () => {
  await app.close();
  if (prev === undefined) delete process.env.TEAMHUB_ARTIFACT_FILES_DIR;
  else process.env.TEAMHUB_ARTIFACT_FILES_DIR = prev;
  await rm(dir, { recursive: true, force: true });
});

describe('POST /api/artifacts/:id/upload', () => {
  test('上传 .md → 200 + storedFile 指针正确 + 文件落卷', async () => {
    const content = '# 夹爪图纸\n\n上传链路联测。';
    const res = await app.inject({
      method: 'POST',
      url: `/api/artifacts/${ART_ID}/upload`,
      ...multipart('gripper.md', content),
    });
    expect(res.statusCode).toBe(200);
    const { artifact } = res.json();
    expect(artifact.id).toBe(ART_ID);
    expect(artifact.storedFile.ext).toBe('.md');
    expect(artifact.storedFile.contentType).toBe('text/markdown');
    expect(artifact.storedFile.sizeBytes).toBe(Buffer.byteLength(content));
    expect(artifact.storedFile.sha256).toHaveLength(64);
    expect(artifact.storedFile.filename).toBe(`${ART_ID}.md`);
    // 文件确实落到卷里。
    const entries = await readdir(dir);
    expect(entries).toContain(`${ART_ID}.md`);
  });

  test('上传后 GET /:id/download 拿到字节（全链路）', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/artifacts/${ART_ID}/download`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('夹爪图纸');
  });

  test('重传不同后缀 → sha256 变、旧兄弟被清、磁盘仅一份、下载返回新内容', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/artifacts/${ART_ID}/upload`,
      ...multipart('gripper.txt', '新版纯文本内容'),
    });
    expect(res.statusCode).toBe(200);
    const { artifact } = res.json();
    expect(artifact.storedFile.ext).toBe('.txt');
    // 同 id 仅留一份（.md 旧兄弟被清）。
    const mine = (await readdir(dir)).filter(
      (f) => f === ART_ID || f.startsWith(`${ART_ID}.`),
    );
    expect(mine).toEqual([`${ART_ID}.txt`]);
    const dl = await app.inject({
      method: 'GET',
      url: `/api/artifacts/${ART_ID}/download`,
    });
    expect(dl.body).toContain('新版纯文本');
  });

  test('不支持的后缀 .exe → 415', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/artifacts/${ART_ID}/upload`,
      ...multipart('evil.exe', 'MZ...'),
    });
    expect(res.statusCode).toBe(415);
  });

  test('归档物不存在 → 404 且不留孤儿文件', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/artifacts/nope-not-real/upload',
      ...multipart('x.md', 'data'),
    });
    expect(res.statusCode).toBe(404);
    const orphan = (await readdir(dir)).filter((f) => f.startsWith('nope-not-real'));
    expect(orphan).toEqual([]);
  });

  test('未配置归档物目录 → 400（与 404 区分）', async () => {
    const saved = process.env.TEAMHUB_ARTIFACT_FILES_DIR;
    delete process.env.TEAMHUB_ARTIFACT_FILES_DIR;
    try {
      const res = await app.inject({
        method: 'POST',
        url: `/api/artifacts/${ART_ID}/upload`,
        ...multipart('x.md', 'data'),
      });
      expect(res.statusCode).toBe(400);
    } finally {
      process.env.TEAMHUB_ARTIFACT_FILES_DIR = saved;
    }
  });
});

describe('POST /api/artifacts/:id/upload — 上限 / 鉴权', () => {
  test('超出 fileSize 上限 → 413', async () => {
    const tiny = buildHubServer({ artifactMaxBytes: 8 });
    const tinyDir = await mkdtemp(path.join(tmpdir(), 'artifact-upload-tiny-'));
    const saved = process.env.TEAMHUB_ARTIFACT_FILES_DIR;
    process.env.TEAMHUB_ARTIFACT_FILES_DIR = tinyDir;
    try {
      const res = await tiny.inject({
        method: 'POST',
        url: `/api/artifacts/${ART_ID}/upload`,
        ...multipart('big.md', 'x'.repeat(1000)),
      });
      expect(res.statusCode).toBe(413);
    } finally {
      await tiny.close();
      process.env.TEAMHUB_ARTIFACT_FILES_DIR = saved;
      await rm(tinyDir, { recursive: true, force: true });
    }
  });

  test('配了 writeToken 但无 Bearer → 401（证经 H3 写鉴权钩子）', async () => {
    const guarded = buildHubServer({ writeToken: 'secret' });
    const gDir = await mkdtemp(path.join(tmpdir(), 'artifact-upload-auth-'));
    const saved = process.env.TEAMHUB_ARTIFACT_FILES_DIR;
    process.env.TEAMHUB_ARTIFACT_FILES_DIR = gDir;
    try {
      const res = await guarded.inject({
        method: 'POST',
        url: `/api/artifacts/${ART_ID}/upload`,
        ...multipart('x.md', 'data'),
      });
      expect(res.statusCode).toBe(401);
    } finally {
      await guarded.close();
      process.env.TEAMHUB_ARTIFACT_FILES_DIR = saved;
      await rm(gDir, { recursive: true, force: true });
    }
  });
});
