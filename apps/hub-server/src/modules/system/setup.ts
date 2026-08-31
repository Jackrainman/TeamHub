import type { FastifyInstance } from 'fastify';
import {
  SetupConfigRequestSchema,
  SetupStateResponseSchema,
} from '@teamhub/hub-contracts';
import type { IdentityMode } from '@teamhub/hub-contracts';
import { RESTART_EXIT_CODE } from '../../build-setup-server.js';
import type { SetupControl } from '../../server.js';
import type { PmRepository } from '../pm/repository.js';
import { parseBody, requireSuperAdmin } from '../../http/helpers.js';

export interface SetupRouteDeps {
  store: PmRepository;
  identityMode: IdentityMode;
  setupControl?: SetupControl;
}

export function registerSetupRoutes(app: FastifyInstance, deps: SetupRouteDeps): void {
  const { store, identityMode, setupControl } = deps;

  app.get('/api/setup/state', async () => {
    if (!setupControl) {
      throw new Error('正常模式缺少 app_settings service');
    }
    const settings = setupControl.settingsService.getSettings();
    if (!settings) throw new Error('正常模式 app_settings 单例不存在');
    return SetupStateResponseSchema.parse({ initialized: true, settings });
  });

  app.post('/api/setup/init', async (_request, reply) => {
    void reply.code(409).send({ detail: 'TeamHub 已初始化' });
    return reply;
  });

  if (!setupControl) return;

  const setupExit = setupControl.exit ?? ((code: number) => process.exit(code));
  const setupNow = setupControl.now ?? (() => new Date());
  const setupRestartDelayMs = setupControl.restartDelayMs ?? 500;

  app.put('/api/setup/config', async (request, reply) => {
    if (identityMode === 'identity') {
      if (!(await requireSuperAdmin(store, request, reply))) return reply;
    }
    const parsed = parseBody(SetupConfigRequestSchema, request, reply);
    if (!parsed) return reply;
    setupControl.settingsService.updateIdentityMode(parsed.identityMode, setupNow());
    setTimeout(() => setupExit(RESTART_EXIT_CODE), setupRestartDelayMs);
    void reply.code(200).send({ restarting: true });
    return reply;
  });

  app.post('/api/setup/graduate', async (request, reply) => {
    if (identityMode === 'identity') {
      if (!(await requireSuperAdmin(store, request, reply))) return reply;
    }
    const settings = setupControl.settingsService.getSettings();
    if (!settings || settings.dataMode !== 'demo') {
      void reply
        .code(409)
        .send({ detail: '当前已是正式（real）部署，转正式门只在演示（demo）态可用' });
      return reply;
    }

    // 同库事务只清业务表并更新 app_settings。write_token/lark_config 位于 meta，构件物理目录不触碰。
    setupControl.settingsService.graduateToReal(setupNow());
    setTimeout(() => setupExit(RESTART_EXIT_CODE), setupRestartDelayMs);
    void reply.code(200).send({ restarting: true });
    return reply;
  });
}
