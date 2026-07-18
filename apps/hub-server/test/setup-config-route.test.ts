import { afterAll, describe, expect, test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { mkdtemp, rm, writeFile, mkdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DeployConfig } from '@teamhub/hub-contracts';
import { buildHubServer } from '../src/server.js';
import type { SetupControl } from '../src/server.js';
import { buildSetupServer, RESTART_EXIT_CODE } from '../src/build-setup-server.js';
import { InMemoryGovStore } from '../src/store/mock-gov-store.js';

/**
 * SETUP-WIZARD 刀③：部署配置写通道两端点（PUT /api/setup/config 改 identityMode + POST /api/setup/graduate
 * 转正式）。覆盖 setup-wizard.md §6：鉴权矩阵（匿名走写门 / 身份须 superAdmin）+ config 落盘 + exit 42 +
 * graduate 演示归档确在 demo-archive 目录 + 非 demo 409 + setup 模式两端点不注册（404）。
 */

const tmpDirs: string[] = [];
async function makeTmpDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'teamhub-setup-config-'));
  tmpDirs.push(dir);
  return dir;
}
afterAll(async () => {
  for (const d of tmpDirs) await rm(d, { recursive: true, force: true });
});

const FIXED_NOW = new Date('2026-07-18T12:00:00.000Z');
const DEMO_CONFIG: DeployConfig = {
  schemaVersion: 1,
  dataMode: 'demo',
  identityMode: 'anonymous',
  initializedAt: '2026-07-01T00:00:00.000Z',
};

/** 登录并回带 session cookie 头（照 authz-route.test.ts 先例）。免 PIN 成员省 pin。 */
async function login(app: FastifyInstance, memberId: string, pin?: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/session',
    payload: pin === undefined ? { memberId } : { memberId, pin },
  });
  expect(res.statusCode).toBe(200);
  const cookie = res.cookies.find((c) => c.name === 'teamhub_session');
  return `teamhub_session=${cookie!.value}`;
}

/** 装配一个带 setupControl 的正常模式 server；exit 注入、config.json 落 tmp。 */
function buildWithSetupControl(
  overrides: Partial<SetupControl> & { configFile: string },
  serverOptions: Parameters<typeof buildHubServer>[0] = {},
): { app: FastifyInstance; exitCodes: number[] } {
  const exitCodes: number[] = [];
  const app = buildHubServer({
    ...serverOptions,
    setupControl: {
      config: DEMO_CONFIG,
      dataFiles: [],
      now: () => FIXED_NOW,
      exit: (code) => exitCodes.push(code),
      restartDelayMs: 3,
      ...overrides,
    },
  });
  return { app, exitCodes };
}

describe('setup 模式：两端点不注册（404）', () => {
  test('PUT /api/setup/config + POST /api/setup/graduate → 404', async () => {
    const dir = await makeTmpDir();
    const app = buildSetupServer({ configFile: join(dir, 'config.json'), exit: () => {} });
    try {
      const put = await app.inject({
        method: 'PUT',
        url: '/api/setup/config',
        payload: { identityMode: 'identity' },
      });
      expect(put.statusCode).toBe(404);
      const grad = await app.inject({ method: 'POST', url: '/api/setup/graduate' });
      expect(grad.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });
});

describe('正常模式无 setupControl：两端点不注册（404，匿名）', () => {
  test('PUT/POST → 404', async () => {
    const app = buildHubServer();
    try {
      const put = await app.inject({
        method: 'PUT',
        url: '/api/setup/config',
        payload: { identityMode: 'identity' },
      });
      expect(put.statusCode).toBe(404);
      const grad = await app.inject({ method: 'POST', url: '/api/setup/graduate' });
      expect(grad.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });
});

describe('PUT /api/setup/config：改 identityMode', () => {
  test('匿名 + 无 token → 200 + 保留 dataMode/initializedAt 改 identityMode + exit 42', async () => {
    const dir = await makeTmpDir();
    const configFile = join(dir, 'config.json');
    const { app, exitCodes } = buildWithSetupControl({ configFile });
    try {
      const res = await app.inject({
        method: 'PUT',
        url: '/api/setup/config',
        payload: { identityMode: 'identity' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ restarting: true });

      const written = JSON.parse(await readFile(configFile, 'utf8'));
      expect(written).toEqual({
        schemaVersion: 1,
        dataMode: 'demo', // 保留
        identityMode: 'identity', // 改了
        initializedAt: '2026-07-01T00:00:00.000Z', // 保留
      });

      await new Promise((r) => setTimeout(r, 25));
      expect(exitCodes).toEqual([RESTART_EXIT_CODE]);
    } finally {
      await app.close();
    }
  });

  test('坏 body（非法 identityMode）→ 400，不写文件、不退出', async () => {
    const dir = await makeTmpDir();
    const configFile = join(dir, 'config.json');
    const { app, exitCodes } = buildWithSetupControl({ configFile });
    try {
      const res = await app.inject({
        method: 'PUT',
        url: '/api/setup/config',
        payload: { identityMode: 'oauth' },
      });
      expect(res.statusCode).toBe(400);
      await new Promise((r) => setTimeout(r, 15));
      expect(existsSync(configFile)).toBe(false);
      expect(exitCodes).toEqual([]);
    } finally {
      await app.close();
    }
  });

  test('匿名 + 配 writeToken：无 Bearer → 401（写门）；带 Bearer → 200', async () => {
    const dir = await makeTmpDir();
    const configFile = join(dir, 'config.json');
    const { app } = buildWithSetupControl({ configFile }, { writeToken: 'secret' });
    try {
      const noBearer = await app.inject({
        method: 'PUT',
        url: '/api/setup/config',
        payload: { identityMode: 'identity' },
      });
      expect(noBearer.statusCode).toBe(401);

      const withBearer = await app.inject({
        method: 'PUT',
        url: '/api/setup/config',
        headers: { authorization: 'Bearer secret' },
        payload: { identityMode: 'identity' },
      });
      expect(withBearer.statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });

  test('身份模式：无会话 → 401（写门钩子）；非 superAdmin → 403；superAdmin → 200', async () => {
    const dir = await makeTmpDir();
    const configFile = join(dir, 'config.json');
    const store = new InMemoryGovStore();
    const { app } = buildWithSetupControl(
      { configFile },
      { identityMode: 'identity', store },
    );
    try {
      // 无会话 → 401
      const anon = await app.inject({
        method: 'PUT',
        url: '/api/setup/config',
        payload: { identityMode: 'anonymous' },
      });
      expect(anon.statusCode).toBe(401);

      // 登录但非 superAdmin → 403
      const cookie = await login(app, 'm-ecB');
      const forbid = await app.inject({
        method: 'PUT',
        url: '/api/setup/config',
        headers: { cookie },
        payload: { identityMode: 'anonymous' },
      });
      expect(forbid.statusCode).toBe(403);

      // 升 superAdmin 后 → 200
      await app.inject({
        method: 'POST',
        url: '/api/setup/super-admin',
        headers: { cookie },
        payload: { pin: '1234' },
      });
      const ok = await app.inject({
        method: 'PUT',
        url: '/api/setup/config',
        headers: { cookie },
        payload: { identityMode: 'anonymous' },
      });
      expect(ok.statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });
});

describe('POST /api/setup/graduate：转正式', () => {
  test('dataMode=real → 409（无反向门），不归档、不退出', async () => {
    const dir = await makeTmpDir();
    const configFile = join(dir, 'config.json');
    const { app, exitCodes } = buildWithSetupControl({
      configFile,
      config: { ...DEMO_CONFIG, dataMode: 'real' },
    });
    try {
      const res = await app.inject({ method: 'POST', url: '/api/setup/graduate' });
      expect(res.statusCode).toBe(409);
      await new Promise((r) => setTimeout(r, 15));
      expect(exitCodes).toEqual([]);
    } finally {
      await app.close();
    }
  });

  test('dataMode=demo（匿名）→ 五域 JSON + 归档物挪进 demo-archive 目录 + config=real + exit 42', async () => {
    const dir = await makeTmpDir();
    const configFile = join(dir, 'config.json');
    // 造五域中的两个落盘文件 + 一个归档物目录（含一个文件）。
    const govFile = join(dir, 'gov.json');
    const kbFile = join(dir, 'kb.json');
    await writeFile(govFile, '{"gov":1}', 'utf8');
    await writeFile(kbFile, '{"kb":1}', 'utf8');
    const artifactDir = join(dir, 'artifacts');
    await mkdir(artifactDir, { recursive: true });
    await writeFile(join(artifactDir, 'a-1.pdf'), 'PDFBYTES', 'utf8');

    const { app, exitCodes } = buildWithSetupControl({
      configFile,
      dataFiles: [govFile, kbFile, join(dir, 'missing-inv.json')], // 含一个不存在的：应跳过
      artifactDir,
    });
    try {
      const res = await app.inject({ method: 'POST', url: '/api/setup/graduate' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ restarting: true });

      // 归档目录（时间戳来自注入的 FIXED_NOW）：demo-archive-2026-07-18T12-00-00-000Z
      const archiveDir = join(dir, 'demo-archive-2026-07-18T12-00-00-000Z');
      // 五域文件挪走：原位没了、归档里有
      expect(existsSync(govFile)).toBe(false);
      expect(existsSync(kbFile)).toBe(false);
      expect(existsSync(join(archiveDir, 'gov.json'))).toBe(true);
      expect(existsSync(join(archiveDir, 'kb.json'))).toBe(true);
      expect(await readFile(join(archiveDir, 'gov.json'), 'utf8')).toBe('{"gov":1}');
      // 归档物内容挪进 archive/artifacts/
      expect(existsSync(join(artifactDir, 'a-1.pdf'))).toBe(false);
      expect(existsSync(join(archiveDir, 'artifacts', 'a-1.pdf'))).toBe(true);

      // config 写成 real（保留 identityMode/initializedAt）
      const written = JSON.parse(await readFile(configFile, 'utf8'));
      expect(written.dataMode).toBe('real');
      expect(written.identityMode).toBe('anonymous');
      expect(written.initializedAt).toBe('2026-07-01T00:00:00.000Z');

      await new Promise((r) => setTimeout(r, 25));
      expect(exitCodes).toEqual([RESTART_EXIT_CODE]);
    } finally {
      await app.close();
    }
  });

  test('身份模式非 superAdmin → 403（不归档、不退出）', async () => {
    const dir = await makeTmpDir();
    const configFile = join(dir, 'config.json');
    const govFile = join(dir, 'gov.json');
    await writeFile(govFile, '{"gov":1}', 'utf8');
    const store = new InMemoryGovStore();
    const { app, exitCodes } = buildWithSetupControl(
      { configFile, dataFiles: [govFile] },
      { identityMode: 'identity', store },
    );
    try {
      const cookie = await login(app, 'm-ecB');
      const res = await app.inject({
        method: 'POST',
        url: '/api/setup/graduate',
        headers: { cookie },
      });
      expect(res.statusCode).toBe(403);
      await new Promise((r) => setTimeout(r, 15));
      // 归档没发生（gov.json 仍在原位）、没退出
      expect(existsSync(govFile)).toBe(true);
      expect(existsSync(configFile)).toBe(false);
      expect(exitCodes).toEqual([]);
    } finally {
      await app.close();
    }
  });
});
