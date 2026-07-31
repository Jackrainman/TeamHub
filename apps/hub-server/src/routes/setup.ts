import type { FastifyInstance } from 'fastify';
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import {
  SetupStateResponseSchema,
  DeployConfigSchema,
  SetupConfigRequestSchema,
} from '@teamhub/hub-contracts';
import type { IdentityMode } from '@teamhub/hub-contracts';
import type { GovStore } from '../store/gov-store.js';
import { isSuperAdmin } from '../authz.js';
import { parseBody } from './helpers.js';
import { archiveDemoData } from '../demo-archive.js';
import { RESTART_EXIT_CODE } from '../build-setup-server.js';
import type { SetupControl } from '../server.js';

export interface SetupRouteDeps {
  store: GovStore;
  identityMode: IdentityMode;
  setupControl?: SetupControl;
}

export function registerSetupRoutes(app: FastifyInstance, deps: SetupRouteDeps): void {
  const { store, identityMode, setupControl } = deps;

  app.get('/api/setup/state', async () => {
    return SetupStateResponseSchema.parse({ initialized: true, dataDirHasData: true });
  });

  app.post('/api/setup/init', async (_request, reply) => {
    void reply.code(409).send({ detail: '已初始化（config.json 已存在）' });
    return reply;
  });

  if (!setupControl) return;

  const setupExit = setupControl.exit ?? ((code: number) => process.exit(code));
  const setupNow = setupControl.now ?? (() => new Date());
  const setupRestartDelayMs = setupControl.restartDelayMs ?? 500;

  app.put('/api/setup/config', async (request, reply) => {
    if (identityMode === 'identity') {
      const snapshot = await store.getSnapshot();
      if (!isSuperAdmin(snapshot.members, request.identity?.memberId ?? '')) {
        void reply.code(403).send({ detail: '该操作需管理员（superAdmin）' });
        return reply;
      }
    }
    const parsed = parseBody(SetupConfigRequestSchema, request, reply);
    if (!parsed) return reply;
    const next = DeployConfigSchema.parse({
      ...setupControl.config,
      identityMode: parsed.identityMode,
    });
    await mkdir(dirname(setupControl.configFile), { recursive: true });
    await writeFile(
      setupControl.configFile,
      `${JSON.stringify(next, null, 2)}\n`,
      'utf8',
    );
    setTimeout(() => setupExit(RESTART_EXIT_CODE), setupRestartDelayMs);
    void reply.code(200).send({ restarting: true });
    return reply;
  });

  app.post('/api/setup/graduate', async (request, reply) => {
    if (identityMode === 'identity') {
      const snapshot = await store.getSnapshot();
      if (!isSuperAdmin(snapshot.members, request.identity?.memberId ?? '')) {
        void reply.code(403).send({ detail: '该操作需管理员（superAdmin）' });
        return reply;
      }
    }
    if (setupControl.config.dataMode !== 'demo') {
      void reply
        .code(409)
        .send({ detail: '当前已是正式（real）部署，转正式门只在演示（demo）态可用' });
      return reply;
    }
    const stamp = setupNow().toISOString().replace(/[:.]/g, '-');
    const archiveDir = join(
      dirname(setupControl.configFile),
      `demo-archive-${stamp}`,
    );
    try {
      await archiveDemoData({
        archiveDir,
        dataFiles: setupControl.dataFiles,
        artifactDir: setupControl.artifactDir,
      });
    } catch (err) {
      void reply.code(500).send({
        detail: `演示数据归档失败，已中止转正式（未改配置、未重启，数据完好）：${(err as Error).message}`,
      });
      return reply;
    }
    const next = DeployConfigSchema.parse({
      ...setupControl.config,
      dataMode: 'real',
    });
    await mkdir(dirname(setupControl.configFile), { recursive: true });
    await writeFile(
      setupControl.configFile,
      `${JSON.stringify(next, null, 2)}\n`,
      'utf8',
    );
    setTimeout(() => setupExit(RESTART_EXIT_CODE), setupRestartDelayMs);
    void reply.code(200).send({ restarting: true });
    return reply;
  });
}
