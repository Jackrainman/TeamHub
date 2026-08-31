import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  KbCloseoutRequestSchema,
  KbCloseoutResponseSchema,
  KbImportDocsReportSchema,
  KbSimilarResponseSchema,
} from '@teamhub/hub-contracts';
import type { IdentityMode, SessionIdentity } from '@teamhub/hub-contracts';
import { parseBody, parseQuery } from '../../http/helpers.js';
import {
  KbCloseoutDivergenceError,
  KbCloseoutRejectedError,
  KnowledgeService,
} from './service.js';
import type { KbImportDocInput } from './service.js';

const KB_IMPORT_DOC_MAX_BYTES = 1024 * 1024;
const KB_IMPORT_DOCS_MAX_FILES = 20;

/** 相似检索 querystring（server 专用：tags 逗号拆分 transform 不跨端，见 contracts similar.ts 注释）。 */
const KbSimilarQuerySchema = z.object({
  symptom: z.string().min(1),
  tags: z
    .string()
    .optional()
    .transform((s) =>
      s
        ? s
            .split(',')
            .map((t) => t.trim())
            .filter((t) => t.length > 0)
        : [],
    ),
  projectId: z.string().min(1).optional(),
  limit: z.coerce.number().int().positive().max(20).optional(),
  minScore: z.coerce.number().int().nonnegative().optional(),
});

export interface KnowledgeRouteDeps {
  service: KnowledgeService;
  identityMode: IdentityMode;
  /** 超管鉴权（import-docs）：身份模式须 superAdmin，匿名模式放行（组合根适配注入平台 authz）。 */
  requireSuperAdmin: (
    request: FastifyRequest & { identity?: SessionIdentity | null },
    reply: FastifyReply,
  ) => Promise<boolean>;
}

/**
 * 知识库域路由（ARCH-UNIFY A4；前身 routes/kb.ts）。只做 parse/auth/multipart 拆包/调 service/错误映射。
 */
export function registerKnowledgeRoutes(app: FastifyInstance, deps: KnowledgeRouteDeps): void {
  const { service, identityMode } = deps;

  app.get('/api/kb/similar', async (request, reply) => {
    const query = parseQuery(KbSimilarQuerySchema, request, reply);
    if (!query) return;
    return KbSimilarResponseSchema.parse(await service.similar(query));
  });

  app.post('/api/kb/closeout', async (request, reply) => {
    const parsed = parseBody(KbCloseoutRequestSchema, request, reply);
    if (!parsed) return;
    try {
      const result = await service.closeout(parsed);
      void reply.code(201);
      return KbCloseoutResponseSchema.parse(result);
    } catch (err) {
      if (err instanceof KbCloseoutRejectedError) {
        void reply.code(422).send({ detail: err.reason });
        return;
      }
      if (err instanceof KbCloseoutDivergenceError) {
        app.log.error(
          { err, issueId: err.issueId, knowledgeNodeId: err.knowledgeNodeId, errorCode: err.errorCode },
          'kb closeout two-step diverged: knowledge node persisted but corpus reload failed; retry safe (idempotent upsert)',
        );
      }
      throw err;
    }
  });

  app.post('/api/kb/import-docs', async (request, reply) => {
    if (identityMode === 'identity') {
      if (!(await deps.requireSuperAdmin(request as FastifyRequest & { identity?: SessionIdentity | null }, reply))) return;
    }
    // multipart 拆包是 HTTP 关注点：逐份收成 {filename, buf|error}，业务判断全在 service。
    const inputs: KbImportDocInput[] = [];
    try {
      const parts = request.files({
        limits: { fileSize: KB_IMPORT_DOC_MAX_BYTES, files: KB_IMPORT_DOCS_MAX_FILES },
      });
      for await (const part of parts) {
        const filename = part.filename ?? '';
        const lower = filename.toLowerCase();
        if (!lower.endsWith('.md') && !lower.endsWith('.markdown')) {
          part.file.resume();
          inputs.push({ filename });
          continue;
        }
        try {
          const buf = await part.toBuffer();
          if (part.file.truncated) {
            inputs.push({ filename, error: '文件过大（上限 1MB）' });
            continue;
          }
          inputs.push({ filename, buf });
        } catch (err) {
          inputs.push({
            filename,
            error:
              (err as { code?: string })?.code === 'FST_REQ_FILE_TOO_LARGE'
                ? '文件过大（上限 1MB）'
                : '读取文件失败',
          });
        }
      }
    } catch (err) {
      if ((err as { code?: string })?.code === 'FST_FILES_LIMIT') {
        void reply.code(413).send({ detail: '文件数过多（单批上限 20 个）' });
        return;
      }
      void reply.code(400).send({ detail: '请求体不是 multipart 表单' });
      return;
    }
    const outcome = await service.importDocs(inputs);
    return KbImportDocsReportSchema.parse(outcome);
  });
}
