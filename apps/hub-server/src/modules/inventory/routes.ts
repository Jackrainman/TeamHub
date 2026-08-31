import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  CreatePartActionRequestSchema,
  CreatePartActionResponseSchema,
  CreatePartTypeRequestSchema,
  CreatePartTypeResponseSchema,
  HermesInboundRequestSchema,
  HermesInboundResponseSchema,
  InvalidPartActionError,
  InventoryImportReportSchema,
  InventoryImportRowsRequestSchema,
  InventoryPreviewResponseSchema,
  InventoryResponseSchema,
  buildInventoryTemplateCsv,
  decodeCsvBytes,
} from '@teamhub/hub-contracts';
import type {
  IdentityMode,
  InventoryImportFailure,
  InventoryImportRow,
  SessionIdentity,
} from '@teamhub/hub-contracts';
import { parseBody, readCsvUpload } from '../../http/helpers.js';
import { HermesUnknownCommandError, InventoryService } from './service.js';

const INVENTORY_IMPORT_MAX_BYTES = 1024 * 1024;

export interface InventoryRouteDeps {
  service: InventoryService;
  identityMode: IdentityMode;
  /**
   * 超管鉴权（CSV 导入/预览）：身份模式下须 superAdmin，匿名模式放行。
   * 由组合根把平台 authz（routes/helpers.requireSuperAdmin + PmRepository 成员表）适配注入，
   * 库存模块不反向依赖 PmRepository。
   */
  requireSuperAdmin: (
    request: FastifyRequest & { identity?: SessionIdentity | null },
    reply: FastifyReply,
  ) => Promise<boolean>;
}

/**
 * 库存域路由（ARCH-UNIFY A4；前身 routes/ledger.ts）。只做六件事：parse/auth/调 service/错误映射/schema 校验/返回。
 * `/api/hermes/inbound` 暂挂本域（当前命令面=库存两命令）；HERMES-CHAT-MVP 命令面扩展时抽独立 hermes 适配模块。
 */
export function registerInventoryRoutes(app: FastifyInstance, deps: InventoryRouteDeps): void {
  const { service, identityMode } = deps;

  app.get('/api/inventory', async () => {
    return InventoryResponseSchema.parse(await service.getInventory());
  });

  app.post('/api/inventory/part-types', async (request, reply) => {
    const parsed = parseBody(CreatePartTypeRequestSchema, request, reply);
    if (!parsed) return;
    const partType = await service.upsertPartType(parsed);
    void reply.code(201);
    return CreatePartTypeResponseSchema.parse({ partType });
  });

  app.post('/api/inventory/actions', async (request, reply) => {
    const parsed = parseBody(CreatePartActionRequestSchema, request, reply);
    if (!parsed) return;
    try {
      const action = await service.recordPartAction({ ...parsed, source: 'human' });
      void reply.code(201);
      return CreatePartActionResponseSchema.parse({ action });
    } catch (err) {
      if (err instanceof InvalidPartActionError) {
        void reply.code(400).send({ detail: err.message });
        return;
      }
      throw err;
    }
  });

  app.get('/api/inventory/template', async (_request, reply) => {
    void reply.header(
      'content-disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent('库存模板.csv')}`,
    );
    void reply.type('text/csv; charset=utf-8');
    return buildInventoryTemplateCsv();
  });

  const inventoryWriteAuth = async (
    request: FastifyRequest & { identity?: SessionIdentity | null },
    reply: FastifyReply,
  ): Promise<boolean> => {
    if (identityMode === 'identity') {
      return deps.requireSuperAdmin(request, reply);
    }
    return true;
  };

  const readInventoryCsvText = (request: FastifyRequest, reply: FastifyReply) =>
    readCsvUpload(request, reply, { maxBytes: INVENTORY_IMPORT_MAX_BYTES, decode: decodeCsvBytes });

  app.post('/api/inventory/preview', async (request, reply) => {
    if (!(await inventoryWriteAuth(request as FastifyRequest & { identity?: SessionIdentity | null }, reply))) return;
    const text = await readInventoryCsvText(request, reply);
    if (text === null) return;
    const { rows, errors } = service.previewCsv(text);
    return InventoryPreviewResponseSchema.parse({ rows, failed: errors });
  });

  app.post('/api/inventory/import', async (request, reply) => {
    if (!(await inventoryWriteAuth(request as FastifyRequest & { identity?: SessionIdentity | null }, reply))) return;
    let rows: InventoryImportRow[];
    let parseErrors: InventoryImportFailure[] = [];
    if ((request.headers['content-type'] ?? '').includes('application/json')) {
      const parsed = parseBody(InventoryImportRowsRequestSchema, request, reply);
      if (!parsed) return;
      rows = parsed.rows;
    } else {
      const text = await readInventoryCsvText(request, reply);
      if (text === null) return;
      const parsedCsv = service.previewCsv(text);
      rows = parsedCsv.rows;
      parseErrors = parsedCsv.errors;
    }
    const outcome = await service.importRows(rows);
    return InventoryImportReportSchema.parse({
      created: outcome.created,
      updated: outcome.updated,
      failed: [...parseErrors, ...outcome.failed],
    });
  });

  app.post('/api/hermes/inbound', async (request, reply) => {
    const parsed = parseBody(HermesInboundRequestSchema, request, reply);
    if (!parsed) return;
    try {
      return HermesInboundResponseSchema.parse(await service.handleHermesInbound(parsed));
    } catch (err) {
      if (err instanceof HermesUnknownCommandError) {
        void reply.code(400).send({ detail: err.message });
        return;
      }
      if (err instanceof InvalidPartActionError) {
        return HermesInboundResponseSchema.parse({ ok: false, text: `记账失败：${err.message}` });
      }
      throw err;
    }
  });
}
