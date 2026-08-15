import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildSetupServer, RESTART_EXIT_CODE } from '../src/build-setup-server.js';
import { openUnifiedDb, type UnifiedDatabase } from '../src/store/sqlite-unified.js';
import { buildTestHubServer } from './support/build-test-hub-server.js';

const FIXED_NOW = new Date('2026-08-15T12:00:00.000Z');

describe('setup 与 app_settings 路由', () => {
  let dir: string;
  let database: UnifiedDatabase;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'teamhub-setup-'));
    database = openUnifiedDb(join(dir, 'teamhub.sqlite'));
  });

  afterEach(async () => {
    database.close();
    await rm(dir, { recursive: true, force: true });
  });

  test('setup health/state：空库明确返回 empty', async () => {
    const app = buildSetupServer({
      settingsService: database,
      now: () => FIXED_NOW,
      exit: () => {},
    });
    try {
      const health = await app.inject({ method: 'GET', url: '/health' });
      expect(health.statusCode).toBe(200);
      expect(health.json()).toMatchObject({ status: 'ok', setupPending: true });
      expect(health.json().buildId).toBeTruthy();

      const state = await app.inject({ method: 'GET', url: '/api/setup/state' });
      expect(state.json()).toEqual({ initialized: false, databaseState: 'empty' });
    } finally {
      await app.close();
    }
  });

  test('初始化合法请求：同库写 settings + real 空种子，并请求 exit 42', async () => {
    const exitCodes: number[] = [];
    const app = buildSetupServer({
      settingsService: database,
      now: () => FIXED_NOW,
      exit: (code) => exitCodes.push(code),
      restartDelayMs: 1,
    });
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/setup/init',
        payload: { dataMode: 'real', identityMode: 'identity' },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ restarting: true });
      expect(database.getSettings()).toMatchObject({
        dataMode: 'real',
        identityMode: 'identity',
        projectId: 'prj-robots',
        verticalId: 'robotics',
      });
      expect((await database.openStores().gov.getSnapshot()).tasks).toEqual([]);
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(exitCodes).toEqual([RESTART_EXIT_CODE]);
    } finally {
      await app.close();
    }
  });

  test('坏请求 400；未认领业务数据返回状态且 init 409，不覆盖原数据', async () => {
    database.db.ensureEntityTables(['tasks']);
    database.db.insertRow('tasks', 'legacy', { id: 'legacy' });
    const app = buildSetupServer({ settingsService: database, exit: () => {} });
    try {
      const state = await app.inject({ method: 'GET', url: '/api/setup/state' });
      expect(state.json()).toEqual({ initialized: false, databaseState: 'unclaimed' });

      const blocked = await app.inject({
        method: 'POST',
        url: '/api/setup/init',
        payload: { dataMode: 'real', identityMode: 'anonymous' },
      });
      expect(blocked.statusCode).toBe(409);
      expect(database.db.getRow('tasks', 'legacy')).toEqual({ id: 'legacy' });

      const invalid = await app.inject({
        method: 'POST',
        url: '/api/setup/init',
        payload: { dataMode: 'invalid' },
      });
      expect(invalid.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });

  test('setup server 不注册 config/graduate 写端点', async () => {
    const app = buildSetupServer({ settingsService: database, exit: () => {} });
    try {
      expect((await app.inject({ method: 'PUT', url: '/api/setup/config', payload: { identityMode: 'identity' } })).statusCode).toBe(404);
      expect((await app.inject({ method: 'POST', url: '/api/setup/graduate' })).statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });

  test('正常模式读取 settings，修改身份模式后重启', async () => {
    database.initialize({ dataMode: 'demo', identityMode: 'anonymous' }, FIXED_NOW);
    const exitCodes: number[] = [];
    const app = buildTestHubServer({
      setupControl: {
        settingsService: database,
        now: () => new Date('2026-08-15T13:00:00.000Z'),
        exit: (code) => exitCodes.push(code),
        restartDelayMs: 1,
      },
    });
    try {
      const state = await app.inject({ method: 'GET', url: '/api/setup/state' });
      expect(state.json()).toMatchObject({
        initialized: true,
        settings: { dataMode: 'demo', identityMode: 'anonymous' },
      });

      const changed = await app.inject({
        method: 'PUT',
        url: '/api/setup/config',
        payload: { identityMode: 'identity' },
      });
      expect(changed.statusCode).toBe(200);
      expect(database.getSettings()).toMatchObject({
        identityMode: 'identity',
        initializedAt: FIXED_NOW.toISOString(),
        updatedAt: '2026-08-15T13:00:00.000Z',
      });
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(exitCodes).toEqual([42]);
    } finally {
      await app.close();
    }
  });

  test('graduate 清统一库业务数据但保留 token/lark 和构件物理文件', async () => {
    database.initialize({ dataMode: 'demo', identityMode: 'anonymous' }, FIXED_NOW);
    database.db.setMeta('write_token', 'keep-token');
    database.db.setMeta('lark_config', '{"status":"unconfigured"}');
    const artifactFile = join(dir, 'artifact.pdf');
    await writeFile(artifactFile, 'keep artifact', 'utf8');

    const app = buildTestHubServer({
      setupControl: {
        settingsService: database,
        now: () => new Date('2026-08-15T14:00:00.000Z'),
        exit: () => {},
        restartDelayMs: 0,
      },
    });
    try {
      const response = await app.inject({ method: 'POST', url: '/api/setup/graduate' });
      expect(response.statusCode).toBe(200);
      expect(database.getSettings()?.dataMode).toBe('real');
      expect(database.db.rowCount('tasks')).toBe(0);
      expect(database.db.getMeta('write_token')).toBe('keep-token');
      expect(database.db.getMeta('lark_config')).toBe('{"status":"unconfigured"}');
      expect(await readFile(artifactFile, 'utf8')).toBe('keep artifact');

      const repeated = await app.inject({ method: 'POST', url: '/api/setup/graduate' });
      expect(repeated.statusCode).toBe(409);
    } finally {
      await app.close();
    }
  });
});
