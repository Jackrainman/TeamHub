import type { FastifyInstance, FastifyReply } from 'fastify';
import {
  ArtifactsResponseSchema,
  CreateArtifactRequestSchema,
  CreateArtifactResponseSchema,
  UploadArtifactResponseSchema,
} from '@teamhub/hub-contracts';
import { isApplicationError } from '../../application/application-error.js';
import type { ApplicationError } from '../../application/application-error.js';
import { parseBody } from '../../http/helpers.js';
import type { ArchiveService } from './service.js';

/**
 * 归档物域路由（ARCH-UNIFY A4；前身 routes/archive.ts）。只做 parse/调 service/错误映射/schema 校验。
 * multipart 解析与尺寸上限是 HTTP 关注点留本层；字节落卷/校验和/指针回写编排全在 ArchiveService。
 */

/** 上传端点错误 → 状态码（未配置目录=400、未知归档物=404、非法后缀=415、落盘/指针故障=500）。 */
function sendUploadError(error: unknown, reply: FastifyReply): boolean {
  if (isApplicationError(error)) {
    const status = uploadStatusOf(error);
    void reply.code(status).send({ code: error.code, detail: error.detail });
    return true;
  }
  return false;
}

function uploadStatusOf(error: ApplicationError): number {
  switch (error.code) {
    case 'ARTIFACT_NOT_FOUND':
      return 404;
    case 'ARTIFACT_UNSUPPORTED_EXT':
      return 415;
    default:
      return 400;
  }
}

/** 下载端点错误 → 状态码（未配置目录/未知归档物/无文件=404、路径逃逸=400）。 */
function sendDownloadError(error: unknown, reply: FastifyReply): boolean {
  if (isApplicationError(error)) {
    void reply
      .code(error.code === 'ARTIFACT_ILLEGAL_PATH' ? 400 : 404)
      .send({ code: error.code, detail: error.detail });
    return true;
  }
  return false;
}

export function registerArchiveRoutes(app: FastifyInstance, service: ArchiveService): void {
  app.get('/api/artifacts', async () => {
    return ArtifactsResponseSchema.parse({ artifacts: await service.listArtifacts() });
  });

  app.get<{ Params: { id: string } }>(
    '/api/artifacts/:id/download',
    async (request, reply) => {
      try {
        const download = await service.download(request.params.id);
        void reply.header(
          'content-disposition',
          `attachment; filename*=UTF-8''${encodeURIComponent(download.downloadName)}`,
        );
        void reply.type(download.contentType);
        return download.content;
      } catch (err) {
        if (sendDownloadError(err, reply)) return reply;
        throw err;
      }
    },
  );

  app.post('/api/artifacts', async (request, reply) => {
    const data = parseBody(CreateArtifactRequestSchema, request, reply);
    if (!data) return;
    const artifact = await service.createArtifact(data);
    void reply.code(201);
    return CreateArtifactResponseSchema.parse({ artifact });
  });

  app.post<{ Params: { id: string } }>(
    '/api/artifacts/:id/upload',
    async (request, reply) => {
      let data;
      try {
        data = await request.file();
      } catch {
        void reply.code(400).send({ detail: '请求体不是 multipart 表单' });
        return reply;
      }
      if (!data) {
        void reply.code(400).send({ detail: '未收到文件' });
        return reply;
      }
      let buf: Buffer;
      try {
        buf = await data.toBuffer();
      } catch (err) {
        if ((err as { code?: string })?.code === 'FST_REQ_FILE_TOO_LARGE') {
          void reply.code(413).send({ detail: '文件过大（上限 50MB）' });
          return reply;
        }
        void reply.code(400).send({ detail: '读取文件失败' });
        return reply;
      }
      if (data.file.truncated) {
        void reply.code(413).send({ detail: '文件过大（上限 50MB）' });
        return reply;
      }
      try {
        const updated = await service.uploadFile(request.params.id, {
          filename: data.filename,
          buf,
        });
        void reply.code(200);
        return UploadArtifactResponseSchema.parse({ artifact: updated });
      } catch (err) {
        if (sendUploadError(err, reply)) return reply;
        void reply.code(500).send({ detail: '保存文件失败' });
        return reply;
      }
    },
  );
}
