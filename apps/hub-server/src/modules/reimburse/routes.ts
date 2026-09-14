import type { FastifyInstance, FastifyReply } from 'fastify';
import {
  CreateReimburseBatchRequestSchema,
  CreateReimburseEntryRequestSchema,
  CreateReimburseEntryResponseSchema,
  DeleteReimburseEvidenceResponseSchema,
  GetReimburseProfileResponseSchema,
  ReimburseBatchResponseSchema,
  ReimburseBatchesResponseSchema,
  ReimburseEntriesResponseSchema,
  ReimburseEvidenceDownloadsResponseSchema,
  ReimburseEvidenceKindSchema,
  ReimburseEvidenceListResponseSchema,
  REIMBURSE_EVIDENCE_MAX_BYTES,
  StockInContextResponseSchema,
  StockInRequestSchema,
  StockInResponseSchema,
  UpdateReimburseBatchRequestSchema,
  UpdateReimburseEntryRequestSchema,
  UpdateReimburseEntryResponseSchema,
  UpdateReimburseProfileRequestSchema,
  UpdateReimburseProfileResponseSchema,
  UploadReimburseEvidenceResponseSchema,
} from '@teamhub/hub-contracts';
import { isApplicationError } from '../../application/application-error.js';
import { parseBody, requireActor, sendApplicationError } from '../../http/helpers.js';
import type { ReimburseService } from './service.js';

export interface ReimburseRouteDeps {
  service: ReimburseService;
}

/** per-request 覆盖插件级 50MB 默认；上限口径与 contracts 同源（发票 PDF/截图真实体积 << 此值）。 */
const EVIDENCE_MAX_MB = REIMBURSE_EVIDENCE_MAX_BYTES / 1024 / 1024;

/** 凭证上传错误特例：非法后缀按 HTTP 语义回 415（照 archive 上传先例），其余交 sendApplicationError。 */
function sendEvidenceUploadError(error: unknown, reply: FastifyReply): boolean {
  if (isApplicationError(error) && error.code === 'REIMBURSE_EVIDENCE_UNSUPPORTED_EXT') {
    void reply.code(415).send({ code: error.code, detail: error.detail });
    return true;
  }
  return sendApplicationError(error, reply);
}

async function present<T>(reply: FastifyReply, action: () => T | Promise<T>): Promise<T | FastifyReply> {
  try {
    return await action();
  } catch (error) {
    if (sendApplicationError(error, reply)) return reply;
    throw error;
  }
}

export function registerReimburseRoutes(app: FastifyInstance, { service }: ReimburseRouteDeps): void {
  app.get('/api/reimburse/entries', async (request, reply) =>
    present(reply, async () => ReimburseEntriesResponseSchema.parse({
      entries: await service.listEntries(request.identity),
    })),
  );

  app.post('/api/reimburse/entries', async (request, reply) => {
    const body = parseBody(CreateReimburseEntryRequestSchema, request, reply);
    if (!body) return;
    const actor = requireActor(request, reply, undefined, '报销录入须先登录');
    if (!actor) return;
    return present(reply, () => {
      const entry = service.createEntry({ ...body, memberId: actor.id, batchId: null });
      void reply.code(201);
      return CreateReimburseEntryResponseSchema.parse({ entry });
    });
  });

  app.patch('/api/reimburse/entries/:id', async (request, reply) => {
    const body = parseBody(UpdateReimburseEntryRequestSchema, request, reply);
    if (!body) return;
    const actor = requireActor(request, reply, undefined, '改报销条目须先登录');
    if (!actor) return;
    const { id } = request.params as { id: string };
    return present(reply, async () => UpdateReimburseEntryResponseSchema.parse({
      entry: await service.updateEntry(id, body, actor),
    }));
  });

  app.get('/api/reimburse/profile', async (_request, reply) =>
    present(reply, () => GetReimburseProfileResponseSchema.parse({ profile: service.getProfile() })),
  );

  app.put('/api/reimburse/profile', async (request, reply) => {
    const body = parseBody(UpdateReimburseProfileRequestSchema, request, reply);
    if (!body) return;
    return present(reply, async () => UpdateReimburseProfileResponseSchema.parse({
      profile: await service.updateProfile(body, request.identity),
    }));
  });

  app.get('/api/reimburse/batches', async (request, reply) =>
    present(reply, async () => ReimburseBatchesResponseSchema.parse(
      await service.listBatches(request.identity),
    )),
  );

  app.post('/api/reimburse/batches', async (request, reply) => {
    const body = parseBody(CreateReimburseBatchRequestSchema, request, reply);
    if (!body) return;
    return present(reply, async () => {
      const batch = await service.createBatch(body, request.identity);
      void reply.code(201);
      return ReimburseBatchResponseSchema.parse({ batch });
    });
  });

  app.patch('/api/reimburse/batches/:id', async (request, reply) => {
    const body = parseBody(UpdateReimburseBatchRequestSchema, request, reply);
    if (!body) return;
    const { id } = request.params as { id: string };
    return present(reply, async () => ReimburseBatchResponseSchema.parse({
      batch: await service.updateBatch(id, body, request.identity),
    }));
  });

  app.get('/api/reimburse/stock-in-context', async (request, reply) => {
    return present(reply, async () => StockInContextResponseSchema.parse(
      await service.getStockInContext(request.identity),
    ));
  });

  // ── 凭证受控留档（D-094）：上传仅本人；下载/删除/留痕查询本人或超管；字节无任何静态路径。 ──
  app.post('/api/reimburse/entries/:id/evidence', async (request, reply) => {
    const actor = requireActor(request, reply, undefined, '上传凭证须先登录');
    if (!actor) return;
    let data;
    try {
      data = await request.file({ limits: { fileSize: REIMBURSE_EVIDENCE_MAX_BYTES } });
    } catch {
      void reply.code(400).send({ detail: '请求体不是 multipart 表单' });
      return reply;
    }
    if (!data) {
      void reply.code(400).send({ detail: '未收到文件' });
      return reply;
    }
    // kind 是 multipart 字段（客户端须先拼 kind 再拼 file，busboy 才保证字段可读）。
    const kindField = data.fields['kind'];
    const rawKind =
      kindField && !Array.isArray(kindField) && kindField.type === 'field' ? kindField.value : undefined;
    const kind = ReimburseEvidenceKindSchema.safeParse(rawKind);
    if (!kind.success) {
      void reply.code(400).send({ detail: 'kind 须为 invoice / paymentShot / inspection' });
      return reply;
    }
    let buf: Buffer;
    try {
      buf = await data.toBuffer();
    } catch (err) {
      if ((err as { code?: string })?.code === 'FST_REQ_FILE_TOO_LARGE') {
        void reply.code(413).send({ detail: `文件过大（上限 ${EVIDENCE_MAX_MB}MB）` });
        return reply;
      }
      void reply.code(400).send({ detail: '读取文件失败' });
      return reply;
    }
    if (data.file.truncated) {
      void reply.code(413).send({ detail: `文件过大（上限 ${EVIDENCE_MAX_MB}MB）` });
      return reply;
    }
    const { id } = request.params as { id: string };
    try {
      const evidence = await service.uploadEvidence(
        id,
        kind.data,
        { filename: data.filename, buf },
        actor,
      );
      void reply.code(201);
      return UploadReimburseEvidenceResponseSchema.parse({ evidence });
    } catch (err) {
      if (sendEvidenceUploadError(err, reply)) return reply;
      void reply.code(500).send({ detail: '保存文件失败' });
      return reply;
    }
  });

  app.get('/api/reimburse/entries/:id/evidence', async (request, reply) => {
    const actor = requireActor(request, reply, undefined, '查看凭证须先登录');
    if (!actor) return;
    const { id } = request.params as { id: string };
    return present(reply, async () => ReimburseEvidenceListResponseSchema.parse({
      evidence: await service.listEvidence(id, actor),
    }));
  });

  app.get('/api/reimburse/entries/:id/evidence/:evidenceId/download', async (request, reply) => {
    const actor = requireActor(request, reply, undefined, '下载凭证须先登录');
    if (!actor) return;
    const { id, evidenceId } = request.params as { id: string; evidenceId: string };
    try {
      const download = await service.downloadEvidence(id, evidenceId, actor);
      void reply.header(
        'content-disposition',
        `attachment; filename*=UTF-8''${encodeURIComponent(download.downloadName)}`,
      );
      void reply.type(download.contentType);
      return download.content;
    } catch (err) {
      if (sendApplicationError(err, reply)) return reply;
      throw err;
    }
  });

  app.delete('/api/reimburse/entries/:id/evidence/:evidenceId', async (request, reply) => {
    const actor = requireActor(request, reply, undefined, '删除凭证须先登录');
    if (!actor) return;
    const { id, evidenceId } = request.params as { id: string; evidenceId: string };
    return present(reply, async () => DeleteReimburseEvidenceResponseSchema.parse({
      evidence: await service.deleteEvidence(id, evidenceId, actor),
    }));
  });

  app.get('/api/reimburse/entries/:id/evidence-downloads', async (request, reply) => {
    const actor = requireActor(request, reply, undefined, '查看下载留痕须先登录');
    if (!actor) return;
    const { id } = request.params as { id: string };
    return present(reply, async () => ReimburseEvidenceDownloadsResponseSchema.parse({
      downloads: await service.listEvidenceDownloads(id, actor),
    }));
  });

  app.post('/api/reimburse/entries/:id/stock-in', async (request, reply) => {
    const body = parseBody(StockInRequestSchema, request, reply);
    if (!body) return;
    const actor = requireActor(request, reply, undefined, '入库确认须先登录');
    if (!actor) return;
    const { id } = request.params as { id: string };
    return present(reply, async () => {
      const result = service.stockIn({
        entryId: id,
        lines: body.lines,
        actor,
        canManageAll: await service.canManageAll(actor.id),
      });
      void reply.code(201);
      return StockInResponseSchema.parse(result);
    });
  });
}
