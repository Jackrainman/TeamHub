import {
  ArchiveDocumentSchema,
  KB_TITLE_MAX,
  buildCloseoutFromIssue,
  deriveErrorCode,
  rankSimilarIssues,
} from '@teamhub/hub-contracts';
import type {
  ArchiveDocument,
  IssueCard,
  KbCloseoutRequest,
  KbImportDocIssue,
  KbSimilarResponse,
  KnowledgeNode,
} from '@teamhub/hub-contracts';
import type { Clock } from '../../clock.js';
import type {
  KnowledgeNodeCloseoutPort,
  KnowledgeRepository,
} from './repository.js';

/** A4 护栏措辞：相似检索只列候选、不断言同因、由人选用（后端焊进响应、前端原样呈现）。 */
export const KB_SIMILAR_NOTE =
  '下面是几条相似的历史记录，按匹配程度排序。系统只给候选、不断言是同一个原因，每条附了相似依据，合不合用你自己判断。';

/** 结案失败（buildCloseoutFromIssue 返回 ok:false）——route 映射 422。 */
export class KbCloseoutRejectedError extends Error {
  constructor(public readonly reason: string) {
    super(reason);
    this.name = 'KbCloseoutRejectedError';
  }
}

export interface KbSimilarQuery {
  symptom: string;
  tags: string[];
  projectId?: string;
  limit?: number;
  minScore?: number;
}

/** import-docs 的单条输入：route 只负责 multipart 拆包，业务判断全在本 service。 */
export interface KbImportDocInput {
  filename: string;
  /** 读取成功的内容；读取失败/超限时由 route 置 error、buf 省略。 */
  buf?: Buffer;
  error?: string;
}

export interface KbImportDocsOutcome {
  imported: { id: string; title: string }[];
  skipped: KbImportDocIssue[];
  failed: KbImportDocIssue[];
}

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

/**
 * 知识库域 application service（ARCH-UNIFY A4；前身 routes/kb.ts 的路由内编排）。
 * 用例：相似检索（探针 IssueCard 构造 + rankSimilarIssues 纯派生）、结案闭环（跨域写：
 * KnowledgeNode 走 KnowledgeNodeCloseoutPort、语料回灌走本域 repository）、批量 md 导入。
 */
export class KnowledgeService {
  constructor(
    private readonly repository: KnowledgeRepository,
    private readonly closeoutNode: KnowledgeNodeCloseoutPort,
    private readonly clock: Clock,
  ) {}

  /** GET /api/kb/similar：把 querystring 捏成探针 IssueCard，喂纯函数排序（语料全读自 repository）。 */
  async similar(query: KbSimilarQuery): Promise<KbSimilarResponse> {
    const { symptom, tags, projectId, limit, minScore } = query;
    const kb = await this.repository.getKbSnapshot();
    const now = this.clock.now().toISOString();
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
    return {
      query: { symptom, tags },
      items,
      note: KB_SIMILAR_NOTE,
    };
  }

  /**
   * POST /api/kb/closeout：buildCloseoutFromIssue 纯派生 → KnowledgeNode 回挂（pm 窄口）→ 语料回灌。
   * errorCode 序号 = 同日既有条目数 + 1（M9 防生日碰撞）。
   * **两步写非事务**（历史行为保留）：node 落库成功而语料回灌失败时由 route 记结构化日志
   * （回灌是幂等 upsert，重试安全）；A5 拆 GovStore 后应评估并进同一 UoW。
   */
  async closeout(request: KbCloseoutRequest): Promise<{
    archiveDocument: ArchiveDocument;
    errorEntry: import('@teamhub/hub-contracts').ErrorEntry;
    updatedIssueCard: IssueCard;
    knowledgeNode: KnowledgeNode;
  }> {
    const { issue, records, category, rootCause, resolution, prevention, generatedBy } = request;
    const now = this.clock.now().toISOString();
    const kbSnapshot = await this.repository.getKbSnapshot();
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
      throw new KbCloseoutRejectedError(result.reason);
    }
    const knowledgeNode = await this.closeoutNode.closeoutKbNode(result.knowledgeNodeDraft);
    try {
      await this.repository.appendCloseout({
        issueCard: result.updatedIssueCard,
        errorEntry: result.errorEntry,
        archiveDocument: result.archiveDocument,
      });
    } catch (err) {
      throw new KbCloseoutDivergenceError(issue.id, knowledgeNode.id, result.errorEntry.errorCode, err);
    }
    return {
      archiveDocument: result.archiveDocument,
      errorEntry: result.errorEntry,
      updatedIssueCard: result.updatedIssueCard,
      knowledgeNode,
    };
  }

  /**
   * POST /api/kb/import-docs：文件名确定性派生 issueId/fileName（幂等去重的结构性保证），
   * 逐条 safeParse 后整批交 repository（只动 archiveDocuments）。
   */
  async importDocs(inputs: readonly KbImportDocInput[]): Promise<KbImportDocsOutcome> {
    const projectId = (await this.repository.getKbSnapshot()).projectId;
    const now = this.clock.now().toISOString();
    const datePart = now.slice(0, 10);
    const skipped: KbImportDocIssue[] = [];
    const failed: KbImportDocIssue[] = [];
    const docs: ArchiveDocument[] = [];
    const titleByIssueId = new Map<string, string>();
    for (const input of inputs) {
      const filename = input.filename;
      const title = kbImportTitle(filename);
      const lower = filename.toLowerCase();
      if (!lower.endsWith('.md') && !lower.endsWith('.markdown')) {
        skipped.push({ title, reason: '仅支持 .md / .markdown 文件' });
        continue;
      }
      if (input.error || !input.buf) {
        failed.push({ title, reason: input.error ?? '读取文件失败' });
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
        markdownContent: input.buf.toString('utf8'),
        generatedBy: 'manual',
        generatedAt: now,
      });
      if (!parsedDoc.success) {
        failed.push({ title, reason: parsedDoc.error.issues[0]?.message ?? '文档不合规' });
        continue;
      }
      docs.push(parsedDoc.data);
      titleByIssueId.set(issueId, title);
    }
    const outcome = await this.repository.addArchiveDocuments(docs);
    for (const issueId of outcome.skippedIssueIds) {
      skipped.push({
        title: titleByIssueId.get(issueId) ?? issueId,
        reason: '同名文档已在库（按 title 幂等去重，不重复导入）',
      });
    }
    return {
      imported: outcome.added.map((d) => ({
        id: d.issueId,
        title: titleByIssueId.get(d.issueId) ?? d.issueId,
      })),
      skipped,
      failed,
    };
  }
}

/** 结案两步写分叉（node 已落、语料回灌失败）——route 记结构化日志后 500。 */
export class KbCloseoutDivergenceError extends Error {
  constructor(
    public readonly issueId: string,
    public readonly knowledgeNodeId: string,
    public readonly errorCode: string,
    public readonly cause?: unknown,
  ) {
    super('kb closeout two-step diverged: knowledge node persisted but corpus reload failed');
    this.name = 'KbCloseoutDivergenceError';
  }
}
