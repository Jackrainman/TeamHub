import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  KB_TITLE_MAX,
  ArchiveDocumentSchema,
  KbImportDocsReportSchema,
  buildCloseoutFromIssue,
  rankSimilarIssues,
} from '@teamhub/hub-contracts';
import type { IssueCard, ArchiveDocument, KbImportDocIssue, IdentityMode, SessionIdentity } from '@teamhub/hub-contracts';
import {
  KB_SIMILAR_NOTE,
  KbSimilarQuerySchema,
  KbSimilarResponseSchema,
  KbCloseoutRequestSchema,
  KbCloseoutResponseSchema,
} from '../contracts.js';
import type { GovStore, KbStore } from '../store/gov-store.js';
import type { Clock } from '../clock.js';
import { deriveErrorCode } from '../kb/error-code.js';
import { isSuperAdmin } from '../authz.js';
import { firstZodMsg, parseBody } from './helpers.js';

const KB_IMPORT_DOC_MAX_BYTES = 1024 * 1024;
const KB_IMPORT_DOCS_MAX_FILES = 20;

function kbImportTitle(filename: string): string {
  const stripped = filename.replace(/\.(md|markdown)$/i, '').trim();
  return (stripped || filename.trim() || 'untitled').slice(0, KB_TITLE_MAX);
}

function kbImportSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
    .replace(/-+$/g, '');
}

function kbImportTitleHash(title: string): string {
  let h = 5381;
  for (let i = 0; i < title.length; i++) {
    h = ((h << 5) + h + title.charCodeAt(i)) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

export interface KbRouteDeps {
  store: GovStore;
  clock: Clock;
  kbStore: KbStore;
  identityMode: IdentityMode;
}

export function registerKnowledgeBaseRoutes(app: FastifyInstance, deps: KbRouteDeps): void {
  const { store, clock, kbStore, identityMode } = deps;

  app.get('/api/kb/similar', async (request, reply) => {
    const parsed = KbSimilarQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) {
      void reply.code(400).send({ detail: firstZodMsg(parsed.error, 'invalid query') });
      return;
    }
    const { symptom, tags, projectId, limit, minScore } = parsed.data;
    const kb = await kbStore.getKbSnapshot();
    const now = clock.now().toISOString();
    const currentIssue: IssueCard = {
      id: 'iss-probe',
      projectId: projectId ?? kb.projectId,
      title: symptom,
      rawInput: symptom,
      normalizedSummary: symptom,
      symptomSummary: symptom,
      suspectedDirections: [],
      suggestedActions: [],
      status: 'open',
      severity: 'medium',
      tags,
      relatedFiles: [],
      relatedCommits: [],
      relatedHistoricalIssueIds: [],
      createdAt: now,
      updatedAt: now,
    };
    const items = rankSimilarIssues({
      currentIssue,
      issues: kb.issueCards,
      errorEntries: kb.errorEntries,
      archives: kb.archiveDocuments,
      limit,
      minScore,
    });
    return KbSimilarResponseSchema.parse({
      query: { symptom, tags },
      items,
      note: KB_SIMILAR_NOTE,
    });
  });

  app.post('/api/kb/closeout', async (request, reply) => {
    const parsed = parseBody(KbCloseoutRequestSchema, request, reply);
    if (!parsed) return;
    const { issue, records, category, rootCause, resolution, prevention, generatedBy } = parsed;
    const now = clock.now().toISOString();
    const kbSnapshot = await kbStore.getKbSnapshot();
    const dayPrefix = `DBG-${now.slice(0, 10).replace(/-/g, '')}-`;
    const sameDaySeq =
      kbSnapshot.errorEntries.filter((e) => e.errorCode.startsWith(dayPrefix)).length + 1;
    const result = buildCloseoutFromIssue(
      issue,
      records,
      { category, rootCause, resolution, prevention },
      {
        now,
        errorEntryId: `err-${issue.id}`,
        errorCode: deriveErrorCode(now, issue.id, sameDaySeq),
        generatedBy,
      },
    );
    if (!result.ok) {
      void reply.code(422).send({ detail: result.reason });
      return;
    }
    const knowledgeNode = await store.closeoutKbNode(result.knowledgeNodeDraft);
    try {
      await kbStore.appendCloseout({
        issueCard: result.updatedIssueCard,
        errorEntry: result.errorEntry,
        archiveDocument: result.archiveDocument,
      });
    } catch (err) {
      app.log.error(
        { err, issueId: issue.id, knowledgeNodeId: knowledgeNode.id, errorCode: result.errorEntry.errorCode },
        'kb closeout two-step diverged: knowledge node persisted but corpus reload failed; retry safe (idempotent upsert)',
      );
      throw err;
    }
    void reply.code(201);
    return KbCloseoutResponseSchema.parse({
      archiveDocument: result.archiveDocument,
      errorEntry: result.errorEntry,
      updatedIssueCard: result.updatedIssueCard,
      knowledgeNode,
    });
  });

  app.post('/api/kb/import-docs', async (request, reply) => {
    if (identityMode === 'identity') {
      const snapshot = await store.getSnapshot();
      if (!isSuperAdmin(snapshot.members, (request as FastifyRequest & { identity: SessionIdentity | null }).identity?.memberId ?? '')) {
        void reply.code(403).send({ detail: '该操作需管理员（superAdmin）' });
        return;
      }
    }
    const projectId = (await kbStore.getKbSnapshot()).projectId;
    const now = clock.now().toISOString();
    const datePart = now.slice(0, 10);
    const skipped: KbImportDocIssue[] = [];
    const failed: KbImportDocIssue[] = [];
    const docs: ArchiveDocument[] = [];
    const titleByIssueId = new Map<string, string>();
    try {
      const parts = request.files({
        limits: { fileSize: KB_IMPORT_DOC_MAX_BYTES, files: KB_IMPORT_DOCS_MAX_FILES },
      });
      for await (const part of parts) {
        const filename = part.filename ?? '';
        const lower = filename.toLowerCase();
        if (!lower.endsWith('.md') && !lower.endsWith('.markdown')) {
          skipped.push({ title: kbImportTitle(filename), reason: '仅支持 .md / .markdown 文件' });
          part.file.resume();
          continue;
        }
        const title = kbImportTitle(filename);
        let buf: Buffer;
        try {
          buf = await part.toBuffer();
        } catch (err) {
          failed.push({
            title,
            reason:
              (err as { code?: string })?.code === 'FST_REQ_FILE_TOO_LARGE'
                ? '文件过大（上限 1MB）'
                : '读取文件失败',
          });
          continue;
        }
        if (part.file.truncated) {
          failed.push({ title, reason: '文件过大（上限 1MB）' });
          continue;
        }
        const slug = kbImportSlug(title);
        const hash = kbImportTitleHash(title);
        const issueId = `iss-md-${slug || 'doc'}-${hash}`;
        const fileName = `${datePart}_${slug || `doc-${hash}`}.md`;
        const parsedDoc = ArchiveDocumentSchema.safeParse({
          issueId,
          projectId,
          fileName,
          filePath: `.debug_workspace/archive/${fileName}`,
          markdownContent: buf.toString('utf8'),
          generatedBy: 'manual',
          generatedAt: now,
        });
        if (!parsedDoc.success) {
          failed.push({ title, reason: firstZodMsg(parsedDoc.error) });
          continue;
        }
        docs.push(parsedDoc.data);
        titleByIssueId.set(issueId, title);
      }
    } catch (err) {
      if ((err as { code?: string })?.code === 'FST_FILES_LIMIT') {
        void reply.code(413).send({ detail: '文件数过多（单批上限 20 个）' });
        return;
      }
      void reply.code(400).send({ detail: '请求体不是 multipart 表单' });
      return;
    }
    const outcome = await kbStore.addArchiveDocuments(docs);
    for (const issueId of outcome.skippedIssueIds) {
      skipped.push({
        title: titleByIssueId.get(issueId) ?? issueId,
        reason: '同名文档已在库（按 title 幂等去重，不重复导入）',
      });
    }
    return KbImportDocsReportSchema.parse({
      imported: outcome.added.map((d) => ({
        id: d.issueId,
        title: titleByIssueId.get(d.issueId) ?? d.issueId,
      })),
      skipped,
      failed,
    });
  });
}
