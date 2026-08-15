import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildTestHubServer } from './support/build-test-hub-server.js';

// governanceScenarioFixture 里真实存在的归档物 id（见 hub-contracts fixtures）。
const FILE_ID = 'artifact-lift-v1'; // 抬升机构图纸 v1
const NO_FILE_ID = 'artifact-gripper-v1'; // 真实 artifact，但目录里不放文件
const CONTENT = '# 抬升机构图纸\n\n测试下载内容（md）。';

let dir: string;
const prev = process.env.TEAMHUB_ARTIFACT_FILES_DIR;
const app = buildTestHubServer();

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'artifact-files-'));
  await writeFile(path.join(dir, `${FILE_ID}.md`), CONTENT, 'utf8');
  process.env.TEAMHUB_ARTIFACT_FILES_DIR = dir;
});

afterAll(async () => {
  await app.close();
  if (prev === undefined) delete process.env.TEAMHUB_ARTIFACT_FILES_DIR;
  else process.env.TEAMHUB_ARTIFACT_FILES_DIR = prev;
  await rm(dir, { recursive: true, force: true });
});

describe('GET /api/artifacts/:id/download', () => {
  test('有文件 → 200 + attachment 头 + 文件内容', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/artifacts/${FILE_ID}/download`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-disposition']).toContain('attachment');
    // 文件名用归档物 name（UTF-8 编码），不含人员维度。
    expect(res.headers['content-disposition']).toContain(
      encodeURIComponent('抬升机构图纸.md'),
    );
    expect(res.body).toBe(CONTENT);
  });

  test('真实 artifact 但目录无对应文件 → 404', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/artifacts/${NO_FILE_ID}/download`,
    });
    expect(res.statusCode).toBe(404);
  });

  test('不存在的 artifact id → 404（不触碰文件系统）', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/artifacts/nope-not-real/download',
    });
    expect(res.statusCode).toBe(404);
  });
});
