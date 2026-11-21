import type { FastifyInstance, FastifyReply } from 'fastify';
import {
  ConfirmReimburseImportRequestSchema,
  ConfirmReimburseImportResponseSchema,
  ReimburseImportJobResponseSchema,
  ReimburseImportJobsResponseSchema,
  ReimburseImportListQuerySchema,
} from '@teamhub/hub-contracts';
import { isApplicationError } from '../../application/application-error.js';
import { parseBody, parseQuery, requireActor, sendApplicationError } from '../../http/helpers.js';
import { fail } from '../../lib/fail.js';
import type { ReimburseImportService } from './import-service.js';

const MAX_FILE_BYTES = 20 * 1024 * 1024;

async function present<T>(reply: FastifyReply, action: () => T | Promise<T>): Promise<T | FastifyReply> {
  try { return await action(); }
  catch (error) {
    if (sendApplicationError(error, reply)) return reply;
    throw error;
  }
}

export function registerReimburseImportRoutes(app: FastifyInstance, service: ReimburseImportService): void {
  app.post('/api/reimburse/imports', async (request, reply) => {
    const actor = requireActor(request, reply, undefined, '导入票据须先登录');
    if (!actor) return;
    const uploads: Array<{ name: string; content: Buffer }> = [];
    try {
      for await (const data of request.files({ limits: { fileSize: MAX_FILE_BYTES, files: 50 } })) {
        if (data.fieldname !== 'files') {
          void fail(reply, 'VALIDATION_FAILED', { status: 400, detail: '文件字段名须为 files' });
          return reply;
        }
        const content = await data.toBuffer();
        if (data.file.truncated) {
          void fail(reply, 'FILE_TOO_LARGE', { status: 413, detail: '单个文件不能超过 20MB' });
          return reply;
        }
        uploads.push({ name: data.filename, content });
      }
    } catch (error) {
      if (isApplicationError(error)) throw error;
      const code = (error as { code?: string }).code;
      void fail(reply, code === 'FST_REQ_FILE_TOO_LARGE' ? 'FILE_TOO_LARGE' : 'VALIDATION_FAILED', {
        status: code === 'FST_REQ_FILE_TOO_LARGE' ? 413 : 400,
        detail: code === 'FST_REQ_FILE_TOO_LARGE' ? '单个文件不能超过 20MB' : 'multipart 最多上传 50 个文件',
      });
      return reply;
    }
    return present(reply, async () => {
      const job = await service.createJob(actor, uploads);
      void reply.code(202);
      return ReimburseImportJobResponseSchema.parse({ job });
    });
  });

  app.get('/api/reimburse/imports', async (request, reply) => {
    const actor = requireActor(request, reply, undefined, '查看导入作业须先登录');
    if (!actor) return;
    const query = parseQuery(ReimburseImportListQuerySchema, request, reply);
    if (!query) return;
    return present(reply, async () => ReimburseImportJobsResponseSchema.parse({ jobs: await service.listJobs(actor, query.memberId) }));
  });

  app.get('/api/reimburse/imports/:id', async (request, reply) => {
    const actor = requireActor(request, reply, undefined, '查看导入作业须先登录');
    if (!actor) return;
    const { id } = request.params as { id: string };
    return present(reply, async () => ReimburseImportJobResponseSchema.parse({ job: await service.getJob(id, actor) }));
  });

  app.get('/api/reimburse/imports/:id/files/:fileId/content', async (request, reply) => {
    const actor = requireActor(request, reply, undefined, '查看导入文件须先登录');
    if (!actor) return;
    const { id, fileId } = request.params as { id: string; fileId: string };
    return present(reply, async () => {
      const { content, contentType } = await service.getFileContent(id, fileId, actor);
      void reply.type(contentType).header('Content-Disposition', 'inline');
      return content;
    });
  });

  app.post('/api/reimburse/imports/:id/reparse', async (request, reply) => {
    const actor = requireActor(request, reply, undefined, '重新解析须先登录');
    if (!actor) return;
    const { id } = request.params as { id: string };
    return present(reply, () => {
      const job = service.reparseJob(id, actor);
      void reply.code(202);
      return ReimburseImportJobResponseSchema.parse({ job });
    });
  });

  app.post('/api/reimburse/imports/:id/confirm', async (request, reply) => {
    const actor = requireActor(request, reply, undefined, '确认导入须先登录');
    if (!actor) return;
    const body = parseBody(ConfirmReimburseImportRequestSchema, request, reply);
    if (!body) return;
    const { id } = request.params as { id: string };
    return present(reply, async () => ConfirmReimburseImportResponseSchema.parse({ job: await service.confirm(id, body, actor) }));
  });

  app.delete('/api/reimburse/imports/:id/files/:fileId', async (request, reply) => {
    const actor = requireActor(request, reply, undefined, '删除导入文件须先登录');
    if (!actor) return;
    const { id, fileId } = request.params as { id: string; fileId: string };
    return present(reply, async () => ReimburseImportJobResponseSchema.parse({ job: await service.deleteFile(id, fileId, actor) }));
  });

  app.post('/api/reimburse/imports/:id/pairs/:pairId/dismiss', async (request, reply) => {
    const actor = requireActor(request, reply, undefined, '忽略待定项须先登录');
    if (!actor) return;
    const { id, pairId } = request.params as { id: string; pairId: string };
    return present(reply, () => ReimburseImportJobResponseSchema.parse({ job: service.dismissPair(id, pairId, actor) }));
  });

  app.delete('/api/reimburse/imports/:id', async (request, reply) => {
    const actor = requireActor(request, reply, undefined, '关闭导入作业须先登录');
    if (!actor) return;
    const { id } = request.params as { id: string };
    return present(reply, async () => ReimburseImportJobResponseSchema.parse({ job: await service.closeJob(id, actor) }));
  });
}
