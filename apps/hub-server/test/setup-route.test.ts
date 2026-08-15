import { afterAll, describe, expect, test } from 'vitest';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DeployConfigSchema } from '@teamhub/hub-contracts';
import { buildTestHubServer } from './support/build-test-hub-server.js';
import {
  buildSetupServer,
  RESTART_EXIT_CODE,
} from '../src/build-setup-server.js';
import { readDeployConfigFile } from '../src/deploy-config-file.js';

/**
 * SETUP-WIZARD 刀①：setup 模式三端点 + 正常模式 setup 路由幂等 + config fail-closed。
 * 覆盖 setup-wizard.md §3/§4：init 写文件 + 退出码 42（注入 exit 断言，不真杀进程）/ 已初始化 409 /
 * 坏 body 400 / config.json 坏文件拒启动。
 */

const tmpDirs: string[] = [];
async function makeTmpDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'teamhub-setup-'));
  tmpDirs.push(dir);
  return dir;
}
afterAll(async () => {
  for (const d of tmpDirs) await rm(d, { recursive: true, force: true });
});

const FIXED_NOW = new Date('2026-07-18T12:00:00.000Z');

describe('setup 模式（buildSetupServer）', () => {
  test('GET /health 带 setupPending:true + buildId + status ok', async () => {
    const dir = await makeTmpDir();
    const app = buildSetupServer({
      configFile: join(dir, 'config.json'),
      exit: () => {},
      now: () => FIXED_NOW,
    });
    try {
      const res = await app.inject({ method: 'GET', url: '/health' });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.status).toBe('ok');
      expect(body.service).toBe('teamhub-hub-server');
      expect(body.setupPending).toBe(true);
      expect(typeof body.buildId).toBe('string');
      expect(body.buildId.length).toBeGreaterThan(0);
    } finally {
      await app.close();
    }
  });

  test('GET /api/setup/state → initialized:false；dataDirHasData 反映五域文件存在', async () => {
    const dir = await makeTmpDir();
    const existingData = join(dir, 'gov.json');
    await writeFile(existingData, '{}', 'utf8');
    const missingData = join(dir, 'kb.json');

    const withData = buildSetupServer({
      configFile: join(dir, 'config.json'),
      dataFileCandidates: [missingData, existingData],
      exit: () => {},
    });
    try {
      const res = await withData.inject({ method: 'GET', url: '/api/setup/state' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ initialized: false, dataDirHasData: true });
    } finally {
      await withData.close();
    }

    const noData = buildSetupServer({
      configFile: join(dir, 'config.json'),
      dataFileCandidates: [missingData],
      exit: () => {},
    });
    try {
      const res = await noData.inject({ method: 'GET', url: '/api/setup/state' });
      expect(res.json()).toEqual({ initialized: false, dataDirHasData: false });
    } finally {
      await noData.close();
    }
  });

  test('POST /api/setup/init 合法 → 写 config.json + restarting:true + exit(42)', async () => {
    const dir = await makeTmpDir();
    const configFile = join(dir, 'nested', 'config.json'); // mkdir -p 深目录
    let exitCode: number | undefined;
    const app = buildSetupServer({
      configFile,
      exit: (code) => (exitCode = code),
      now: () => FIXED_NOW,
      restartDelayMs: 5,
    });
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/setup/init',
        payload: { dataMode: 'real', identityMode: 'identity' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ restarting: true });

      // 文件已落盘且合法（schemaVersion/字段/时间戳齐备）
      expect(existsSync(configFile)).toBe(true);
      const written = DeployConfigSchema.parse(
        JSON.parse(await readFile(configFile, 'utf8')),
      );
      expect(written).toEqual({
        schemaVersion: 1,
        dataMode: 'real',
        identityMode: 'identity',
        initializedAt: FIXED_NOW.toISOString(),
      });

      // 延迟退出：等 restartDelayMs 后 exit(42) 被调用
      await new Promise((r) => setTimeout(r, 30));
      expect(exitCode).toBe(RESTART_EXIT_CODE);
      expect(exitCode).toBe(42);
    } finally {
      await app.close();
    }
  });

  test('POST /api/setup/init 坏 body → 400，不写文件、不退出', async () => {
    const dir = await makeTmpDir();
    const configFile = join(dir, 'config.json');
    let exited = false;
    const app = buildSetupServer({
      configFile,
      exit: () => (exited = true),
      restartDelayMs: 0,
    });
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/setup/init',
        payload: { dataMode: 'nope' },
      });
      expect(res.statusCode).toBe(400);
      await new Promise((r) => setTimeout(r, 20));
      expect(existsSync(configFile)).toBe(false);
      expect(exited).toBe(false);
    } finally {
      await app.close();
    }
  });

  test('POST /api/setup/init 已初始化（config.json 已存在）→ 409 幂等', async () => {
    const dir = await makeTmpDir();
    const configFile = join(dir, 'config.json');
    await writeFile(
      configFile,
      JSON.stringify({
        schemaVersion: 1,
        dataMode: 'demo',
        identityMode: 'anonymous',
        initializedAt: FIXED_NOW.toISOString(),
      }),
      'utf8',
    );
    let exited = false;
    const app = buildSetupServer({
      configFile,
      exit: () => (exited = true),
      restartDelayMs: 0,
    });
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/setup/init',
        payload: { dataMode: 'real', identityMode: 'identity' },
      });
      expect(res.statusCode).toBe(409);
      await new Promise((r) => setTimeout(r, 20));
      expect(exited).toBe(false);
      // 既有 config 未被覆盖
      const kept = JSON.parse(await readFile(configFile, 'utf8'));
      expect(kept.dataMode).toBe('demo');
    } finally {
      await app.close();
    }
  });
});

describe('正常模式 setup 路由（buildTestHubServer）', () => {
  test('GET /api/setup/state → initialized:true', async () => {
    const app = buildTestHubServer();
    try {
      const res = await app.inject({ method: 'GET', url: '/api/setup/state' });
      expect(res.statusCode).toBe(200);
      expect(res.json().initialized).toBe(true);
    } finally {
      await app.close();
    }
  });

  test('POST /api/setup/init → 恒 409（匿名默认）', async () => {
    const app = buildTestHubServer();
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/setup/init',
        payload: { dataMode: 'real', identityMode: 'identity' },
      });
      expect(res.statusCode).toBe(409);
    } finally {
      await app.close();
    }
  });

  test('POST /api/setup/init → 409（身份模式无会话也不退化成 401，走幂等门）', async () => {
    const app = buildTestHubServer({ identityMode: 'identity' });
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/setup/init',
        payload: { dataMode: 'real', identityMode: 'identity' },
      });
      expect(res.statusCode).toBe(409);
    } finally {
      await app.close();
    }
  });

  test('POST /api/setup/init → 409（配 writeToken 无 Bearer 也不退化成 401）', async () => {
    const app = buildTestHubServer({ writeToken: 'secret' });
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/setup/init',
        payload: { dataMode: 'real', identityMode: 'identity' },
      });
      expect(res.statusCode).toBe(409);
    } finally {
      await app.close();
    }
  });
});

describe('config fail-closed（readDeployConfigFile）', () => {
  test('文件不存在 → undefined（进 setup 模式）', async () => {
    const dir = await makeTmpDir();
    const result = await readDeployConfigFile(join(dir, 'missing.json'));
    expect(result).toBeUndefined();
  });

  test('合法 config → 解析返回', async () => {
    const dir = await makeTmpDir();
    const configFile = join(dir, 'config.json');
    await writeFile(
      configFile,
      JSON.stringify({
        schemaVersion: 1,
        dataMode: 'demo',
        identityMode: 'anonymous',
        initializedAt: FIXED_NOW.toISOString(),
      }),
      'utf8',
    );
    const result = await readDeployConfigFile(configFile);
    expect(result?.dataMode).toBe('demo');
    expect(result?.identityMode).toBe('anonymous');
  });

  test('坏 JSON → 抛错，message 含文件路径', async () => {
    const dir = await makeTmpDir();
    const configFile = join(dir, 'config.json');
    await writeFile(configFile, '{ not json', 'utf8');
    await expect(readDeployConfigFile(configFile)).rejects.toThrow(configFile);
  });

  test('schema 不符（陌生 schemaVersion）→ 抛错', async () => {
    const dir = await makeTmpDir();
    const configFile = join(dir, 'config.json');
    await writeFile(
      configFile,
      JSON.stringify({
        schemaVersion: 99,
        dataMode: 'demo',
        identityMode: 'anonymous',
        initializedAt: FIXED_NOW.toISOString(),
      }),
      'utf8',
    );
    await expect(readDeployConfigFile(configFile)).rejects.toThrow();
  });
});
