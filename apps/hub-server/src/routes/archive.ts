import type { FastifyInstance } from 'fastify';
import { extname, isAbsolute, join, relative } from 'node:path';
import { readFile, readdir } from 'node:fs/promises';
import {
  ArtifactsResponseSchema,
  CreateArtifactRequestSchema,
  CreateArtifactResponseSchema,
  UploadArtifactResponseSchema,
  nextArtifactVersionNo,
  deriveArtifactKind,
} from '@teamhub/hub-contracts';
import {
  getArtifactDir,
  sha256Of,
  writeArtifactFile,
  deleteArtifactFile,
} from '../artifact-storage.js';
import type { GovStore } from '../store/gov-store.js';
import type { Clock } from '../clock.js';
import { parseBody } from './helpers.js';

const ARTIFACT_ALLOWED_EXT = new Map<string, string>([
  ['.step', 'application/step'],
  ['.stp', 'application/step'],
  ['.iges', 'model/iges'],
  ['.igs', 'model/iges'],
  ['.sldprt', 'application/octet-stream'],
  ['.sldasm', 'application/octet-stream'],
  ['.slddrw', 'application/octet-stream'],
  ['.dwg', 'application/acad'],
  ['.f3d', 'application/octet-stream'],
  ['.pdf', 'application/pdf'],
  ['.md', 'text/markdown'],
  ['.txt', 'text/plain'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.zip', 'application/zip'],
  ['.bin', 'application/octet-stream'],
  ['.hex', 'application/octet-stream'],
  ['.mp4', 'video/mp4'],
  ['.mov', 'video/quicktime'],
  ['.webm', 'video/webm'],
]);

export interface ArchiveRouteDeps {
  store: GovStore;
  clock: Clock;
}

export function registerArchiveRoutes(app: FastifyInstance, deps: ArchiveRouteDeps): void {
  const { store, clock } = deps;

  app.get('/api/artifacts', async () => {
    const snapshot = await store.getSnapshot();
    return ArtifactsResponseSchema.parse({ artifacts: snapshot.artifacts });
  });

  app.get<{ Params: { id: string } }>(
    '/api/artifacts/:id/download',
    async (request, reply) => {
      const dir = getArtifactDir();
      if (!dir) {
        void reply.code(404).send({ detail: '未配置归档物文件目录' });
        return reply;
      }
      const { id } = request.params;
      const snapshot = await store.getSnapshot();
      const artifact = snapshot.artifacts.find((a) => a.id === id);
      if (!artifact) {
        void reply.code(404).send({ detail: '归档物不存在' });
        return reply;
      }
      const entries = await readdir(dir).catch(() => [] as string[]);
      const match = entries.find((f) => f === id || f.startsWith(`${id}.`));
      if (!match) {
        void reply.code(404).send({ detail: '该归档物暂无可下载文件' });
        return reply;
      }
      const full = join(dir, match);
      const rel = relative(dir, full);
      if (rel.startsWith('..') || isAbsolute(rel)) {
        void reply.code(400).send({ detail: '非法路径' });
        return reply;
      }
      const ext = extname(match);
      const downloadName = `${artifact.name}${ext}`;
      const content = await readFile(full);
      void reply.header('content-disposition', `attachment; filename*=UTF-8''${encodeURIComponent(downloadName)}`);
      void reply.type(
        ext === '.md' ? 'text/markdown; charset=utf-8' : ext === '.txt' ? 'text/plain; charset=utf-8' : 'application/octet-stream',
      );
      return content;
    },
  );

  app.post('/api/artifacts', async (request, reply) => {
    const data = parseBody(CreateArtifactRequestSchema, request, reply);
    if (!data) return;
    const { ownerGroup, season, mechanism, subType } = data;
    const snapshot = await store.getSnapshot();
    const versionNo = nextArtifactVersionNo(snapshot.artifacts, { ownerGroup, season, mechanism });
    const kind = deriveArtifactKind(ownerGroup, subType);
    const revision = `v${versionNo}`;
    const draft =
      ownerGroup !== 'electrical'
        ? (() => { const { subType: _drop, ...rest } = data; void _drop; return { ...rest, kind, versionNo, revision }; })()
        : { ...data, kind, versionNo, revision };
    const artifact = await store.appendArtifact(draft);
    void reply.code(201);
    return CreateArtifactResponseSchema.parse({ artifact });
  });

  app.post<{ Params: { id: string } }>(
    '/api/artifacts/:id/upload',
    async (request, reply) => {
      const dir = getArtifactDir();
      if (!dir) {
        void reply.code(400).send({ detail: '未配置归档物文件目录' });
        return reply;
      }
      const { id } = request.params;
      const snapshot = await store.getSnapshot();
      if (!snapshot.artifacts.some((a) => a.id === id)) {
        void reply.code(404).send({ detail: '归档物不存在' });
        return reply;
      }
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
      const ext = extname(data.filename ?? '').toLowerCase();
      const contentType = ARTIFACT_ALLOWED_EXT.get(ext);
      if (!contentType) {
        await data.toBuffer().catch(() => {});
        void reply.code(415).send({ detail: `不支持的文件类型：${ext || '（无后缀）'}` });
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
      const sha256 = sha256Of(buf);
      const sizeBytes = buf.length;
      let filename: string;
      try {
        filename = await writeArtifactFile(dir, id, ext, buf);
      } catch {
        void reply.code(500).send({ detail: '写入文件失败' });
        return reply;
      }
      const meta = { filename, ext, sizeBytes, contentType, sha256, uploadedAt: clock.now().toISOString() };
      let updated;
      try {
        updated = await store.setArtifactFile(id, meta);
      } catch {
        await deleteArtifactFile(dir, id).catch(() => {});
        void reply.code(500).send({ detail: '保存文件指针失败' });
        return reply;
      }
      if (!updated) {
        await deleteArtifactFile(dir, id).catch(() => {});
        void reply.code(404).send({ detail: '归档物不存在' });
        return reply;
      }
      void reply.code(200);
      return UploadArtifactResponseSchema.parse({ artifact: updated });
    },
  );
}
