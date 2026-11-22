import { createHash, randomUUID } from 'node:crypto';
import {
  appError,
} from '../../application/application-error.js';
import type { ActorRef, ConfirmReimburseImportRequest, ReimburseEvidence, ReimburseImportFile, ReimburseImportJob, ReimburseImportPair } from '@teamhub/hub-contracts';
import { matchReimburseImportFiles, REIMBURSE_EVIDENCE_MAX_PER_ENTRY, emptyReimburseImportCandidates } from '@teamhub/hub-contracts';
import type { Clock } from '../../clock.js';
import type { ApplicationUnitOfWork } from '../../application/unit-of-work.js';
import type { ReimburseAdminPort } from './public.js';
import type { ReimburseEvidenceStorage, ReimburseRepository } from './repository.js';
import type { ReimburseService } from './service.js';
import { SqliteReimburseImportRepository } from './import-sqlite-repository.js';
import { LocalReimburseImportStorage } from './import-file-storage.js';
import { parseReimburseImportFile, unzipReimburseImport } from './import-parser.js';
import { evidenceExtOf } from '@teamhub/hub-contracts';

const ALLOWED_EXTENSIONS = new Set(['.pdf', '.ofd', '.xml', '.jpg', '.jpeg', '.png', '.zip']);
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const IMPORT_CONTENT_TYPES: Record<string, string> = {
  '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.xml': 'application/xml', '.ofd': 'application/ofd', '.zip': 'application/zip',
};

export interface ReimburseImportUpload { name: string; content: Buffer }

function blankFile(id: string, name: string, content: Buffer, sha256: string): ReimburseImportFile {
  return {
    id, originalName: name, displayName: name, ext: evidenceExtOf(name), sizeBytes: content.length,
    sha256, role: 'unknown', status: 'uploading', amountFen: null, confidence: null,
    parsed: null, candidates: emptyReimburseImportCandidates(), error: null, removedAt: null,
  };
}

function safeDisplayPart(value: string): string {
  return value.replace(/[\\/:*?"<>|\r\n]/g, '-').trim() || '未知';
}

function displayNameFor(file: ReimburseImportFile, at: string): string {
  if (file.amountFen === null || (file.role !== 'invoice' && file.role !== 'paymentShot')) return file.originalName;
  const date = (file.parsed?.invoiceDate ?? at.slice(0, 10)).replaceAll('-', '');
  const amount = (file.amountFen / 100).toFixed(2);
  return file.role === 'invoice'
    ? `${date}-${safeDisplayPart(file.parsed?.seller ?? '未知销方')}-${amount}${file.ext}`
    : `${date}-${amount}-付款${file.ext}`;
}

function importParseError(ext: string, error: unknown): string {
  const kind = ext === '.pdf' ? 'pdf'
    : ext === '.png' || ext === '.jpg' || ext === '.jpeg' ? 'ocr'
      : ext === '.ofd' ? 'ofd' : ext === '.xml' ? 'xml' : 'parse';
  const message = error instanceof Error ? error.message : '';
  // 只透传已知、固定且不含输入内容的原因；其他异常不向前端泄露路径、堆栈或文件文本。
  const reason = /Uint8Array.*Buffer/i.test(message) ? 'Uint8Array required'
    : /timeout/i.test(message) ? 'timeout'
      : /invalid pdf/i.test(message) ? 'invalid PDF'
        : /language directory unconfigured/i.test(message) ? 'language directory unconfigured'
          : kind === 'ocr' ? 'recognition failed' : 'parse failed';
  return `${kind}: ${reason}`;
}

export class ReimburseImportService {
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly jobs: SqliteReimburseImportRepository,
    private readonly entries: ReimburseRepository,
    private readonly entryService: ReimburseService,
    private readonly storage: LocalReimburseImportStorage,
    private readonly evidenceStorage: ReimburseEvidenceStorage,
    private readonly admin: ReimburseAdminPort,
    private readonly unitOfWork: ApplicationUnitOfWork,
    private readonly clock: Clock,
  ) {
    const now = this.clock.now().toISOString();
    for (const job of this.jobs.listJobs()) {
      if (job.status === 'parsing') this.jobs.saveJob({ ...job, status: 'closed', error: 'interrupted', updatedAt: now });
    }
    void this.cleanupExpired();
  }

  private async cleanupExpired(): Promise<void> {
    const cutoff = this.clock.now().getTime() - RETENTION_MS;
    for (const job of this.jobs.listJobs()) {
      if (Date.parse(job.createdAt) < cutoff) await this.storage.removeJob(job.id).catch(() => {});
    }
  }

  private hash(content: Buffer): string {
    return createHash('sha256').update(content).digest('hex');
  }

  private duplicateHashes(memberId: string): Set<string> {
    return new Set(this.jobs.listJobs().filter(job => job.memberId === memberId).flatMap(job => job.files)
      .filter(file => file.status !== 'duplicate' && file.status !== 'removed').map(file => file.sha256));
  }

  async createJob(actor: ActorRef, uploads: ReimburseImportUpload[]): Promise<ReimburseImportJob> {
    if (!uploads.length) throw appError('validation', 'REIMBURSE_EXPORT_EMPTY', '至少上传一个文件');
    if (uploads.length > 50) throw appError('validation', 'REIMBURSE_EVIDENCE_LIMIT', '单次最多上传 50 个文件');
    for (const upload of uploads) {
      if (upload.content.length > MAX_FILE_BYTES) throw appError('validation', 'REIMBURSE_EVIDENCE_LIMIT', '单个文件不能超过 20MB');
      if (!ALLOWED_EXTENSIONS.has(evidenceExtOf(upload.name))) throw appError('validation', 'REIMBURSE_EVIDENCE_UNSUPPORTED_EXT', '只支持 PDF/OFD/XML/JPG/JPEG/PNG/ZIP');
    }
    this.storage.root();
    const at = this.clock.now().toISOString();
    const id = `reimp-${randomUUID()}`;
    const known = this.duplicateHashes(actor.id);
    const files: ReimburseImportFile[] = [];
    for (const upload of uploads) {
      const name = upload.name.split(/[\\/]/).pop()?.trim() || 'unnamed';
      const sha256 = this.hash(upload.content);
      const file = blankFile(`reif-${randomUUID()}`, name, upload.content, sha256);
      if (known.has(sha256)) file.status = 'duplicate';
      else {
        known.add(sha256);
        await this.storage.write(id, file.id, file.ext, upload.content);
      }
      files.push(file);
    }
    const job: ReimburseImportJob = {
      id, memberId: actor.id, status: 'parsing', createdAt: at, updatedAt: at,
      files, pairs: [], confirmedEntryIds: [], history: [], error: null,
    };
    this.jobs.saveJob(job);
    this.queue = this.queue.catch(() => {}).then(() => this.processJob(id));
    return job;
  }

  private async processJob(id: string): Promise<void> {
    let job = this.jobs.getJob(id);
    if (!job || job.status !== 'parsing') return;
    try {
      const expanded: ReimburseImportFile[] = [];
      const known = this.duplicateHashes(job.memberId);
      for (const file of job.files) {
        if (file.status === 'duplicate' || file.status === 'removed') { expanded.push(file); continue; }
        if (file.ext === '.zip') {
          try {
            const members = await unzipReimburseImport(await this.storage.read(id, file.id, file.ext));
            for (const member of members) {
              const sha256 = this.hash(member.content);
              const child = blankFile(`reif-${randomUUID()}`, `${file.originalName} › ${member.name}`, member.content, sha256);
              child.ext = evidenceExtOf(member.name);
              if (known.has(sha256)) child.status = 'duplicate';
              else {
                known.add(sha256);
                await this.storage.write(id, child.id, child.ext, member.content);
              }
              if (child.ext === '.zip') { child.status = 'unreadable'; child.error = 'nested zip unsupported'; }
              expanded.push(child);
            }
            await this.storage.removeFile(id, file.id, file.ext);
          } catch {
            expanded.push({ ...file, status: 'unreadable', error: 'archive parse failed' });
          }
          continue;
        }
        expanded.push(file);
      }
      job = { ...job, files: expanded };
      this.jobs.saveJob(job);
      const parsedFiles: ReimburseImportFile[] = [];
      const profile = this.entries.getProfile();
      for (const file of job.files) {
        if (file.status === 'duplicate' || file.status === 'removed' || file.status === 'mounted' || file.error === 'nested zip unsupported') {
          parsedFiles.push(file); continue;
        }
        if (!ALLOWED_EXTENSIONS.has(file.ext) || file.ext === '.zip') {
          parsedFiles.push({ ...file, status: 'unreadable', error: 'unsupported' }); continue;
        }
        try {
          const parsed = await parseReimburseImportFile(file.ext, await this.storage.read(id, file.id, file.ext), profile);
          const next = { ...file, ...parsed, status: 'parsed' as const, error: null };
          next.displayName = displayNameFor(next, job.createdAt);
          parsedFiles.push(next);
        } catch (error) {
          parsedFiles.push({ ...file, status: 'unreadable', error: importParseError(file.ext, error) });
        }
        this.jobs.saveJob({ ...job, files: parsedFiles.concat(job.files.slice(parsedFiles.length)), updatedAt: this.clock.now().toISOString() });
      }
      const ready = { ...job, files: parsedFiles, updatedAt: this.clock.now().toISOString() };
      const pairs = this.recalculate(ready);
      const status = pairs.length > 0 && pairs.every(pair => pair.status === 'confirmed' || pair.status === 'dismissed') ? 'closed' as const : 'ready' as const;
      this.jobs.saveJob({ ...ready, status, pairs, error: null });
    } catch {
      const current = this.jobs.getJob(id);
      if (current) this.jobs.saveJob({ ...current, status: 'closed', error: 'parse failed', updatedAt: this.clock.now().toISOString() });
    }
  }

  private recalculate(job: ReimburseImportJob): ReimburseImportPair[] {
    const retained = job.pairs.filter(pair => pair.status === 'confirmed' || pair.status === 'dismissed');
    const retainedFiles = new Set(retained.flatMap(pair => pair.fileIds));
    const candidates = job.files.filter(file => !retainedFiles.has(file.id));
    const previousIds = new Map(job.pairs.map(pair => [pair.fileIds.slice().sort().join(','), pair.id]));
    const generated = matchReimburseImportFiles(candidates, () => `reip-${randomUUID()}`)
      .map(pair => ({ ...pair, id: previousIds.get(pair.fileIds.slice().sort().join(',')) ?? pair.id }));
    return [...retained, ...generated];
  }

  private requireJob(id: string): ReimburseImportJob {
    const job = this.jobs.getJob(id);
    if (!job) throw appError('not_found', 'REIMBURSE_ENTRY_NOT_FOUND', '未知导入作业');
    return job;
  }

  private requireOwner(job: ReimburseImportJob, actor: ActorRef): void {
    if (job.memberId !== actor.id) throw appError('forbidden', 'REIMBURSE_ENTRY_FORBIDDEN', '只有上传人能修改导入作业');
  }

  private async canRead(job: ReimburseImportJob, actor: ActorRef): Promise<boolean> {
    return job.memberId === actor.id || await this.admin.isSuperAdmin(actor.id);
  }

  async listJobs(actor: ActorRef, memberId?: string): Promise<ReimburseImportJob[]> {
    const admin = await this.admin.isSuperAdmin(actor.id);
    const scope = admin && memberId ? memberId : actor.id;
    if (!admin && memberId && memberId !== actor.id) throw appError('forbidden', 'REIMBURSE_ENTRY_FORBIDDEN', '只能查看本人的导入作业');
    void this.cleanupExpired();
    return this.jobs.listJobs().filter(job => job.memberId === scope);
  }

  async getJob(id: string, actor: ActorRef): Promise<ReimburseImportJob> {
    const job = this.requireJob(id);
    if (!(await this.canRead(job, actor))) throw appError('forbidden', 'REIMBURSE_ENTRY_FORBIDDEN', '只有本人或财务能查看导入作业');
    return job;
  }

  async getFileContent(id: string, fileId: string, actor: ActorRef): Promise<{ content: Buffer; contentType: string }> {
    const job = this.requireJob(id);
    if (!(await this.canRead(job, actor))) throw appError('forbidden', 'REIMBURSE_ENTRY_FORBIDDEN', '只有本人或财务能查看导入文件');
    const file = job.files.find(item => item.id === fileId);
    if (!file || file.status === 'removed' || file.status === 'duplicate') {
      throw appError('not_found', 'REIMBURSE_EVIDENCE_NOT_FOUND', '未知导入文件');
    }
    try {
      const content = await this.storage.read(id, file.id, file.ext);
      return { content, contentType: IMPORT_CONTENT_TYPES[file.ext.toLowerCase()] ?? 'application/octet-stream' };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw appError('not_found', 'REIMBURSE_EVIDENCE_NOT_FOUND', '导入文件已不存在');
      }
      throw error;
    }
  }

  reparseJob(id: string, actor: ActorRef): ReimburseImportJob {
    const job = this.requireJob(id);
    this.requireOwner(job, actor);
    if (job.status === 'parsing') throw appError('conflict', 'REIMBURSE_ENTRY_LOCKED', '解析完成后才能重新解析');
    const retainedFiles = new Set(job.pairs.filter(pair => pair.status === 'confirmed' || pair.status === 'dismissed')
      .flatMap(pair => pair.fileIds));
    const hasCandidates = job.files.some(file => !retainedFiles.has(file.id)
      && file.status !== 'duplicate' && file.status !== 'removed' && file.status !== 'mounted');
    if (!hasCandidates) return job;
    const parsing = this.jobs.saveJob({ ...job, status: 'parsing', error: null, updatedAt: this.clock.now().toISOString() });
    this.queue = this.queue.catch(() => {}).then(() => this.processJob(id));
    return parsing;
  }

  async deleteFile(id: string, fileId: string, actor: ActorRef): Promise<ReimburseImportJob> {
    const job = this.requireJob(id);
    this.requireOwner(job, actor);
    if (job.status === 'parsing') throw appError('conflict', 'REIMBURSE_ENTRY_LOCKED', '解析完成后才能删除文件');
    const file = job.files.find(item => item.id === fileId);
    if (!file || file.status === 'removed') throw appError('not_found', 'REIMBURSE_EVIDENCE_NOT_FOUND', '未知导入文件');
    if (file.status === 'mounted' || job.pairs.some(pair => pair.status === 'confirmed' && pair.fileIds.includes(fileId))) {
      throw appError('conflict', 'REIMBURSE_ENTRY_LOCKED', '已建单文件请到条目凭证中按工作流规则删除');
    }
    const at = this.clock.now().toISOString();
    await this.storage.removeFile(id, file.id, file.ext);
    const next = {
      ...job,
      files: job.files.map(item => item.id === fileId ? { ...item, status: 'removed' as const, removedAt: at } : item),
      history: [...job.history, { action: 'file-removed' as const, fileId, originalName: file.originalName, sha256: file.sha256, at }],
      updatedAt: at,
    };
    const pairs = this.recalculate(next);
    const status = pairs.length > 0 && pairs.every(pair => pair.status === 'confirmed' || pair.status === 'dismissed') ? 'closed' as const : 'ready' as const;
    return this.jobs.saveJob({ ...next, pairs, status });
  }

  dismissPair(id: string, pairId: string, actor: ActorRef): ReimburseImportJob {
    const job = this.requireJob(id);
    this.requireOwner(job, actor);
    const pair = job.pairs.find(item => item.id === pairId);
    if (!pair || pair.status !== 'pending') throw appError('not_found', 'REIMBURSE_ENTRY_NOT_FOUND', '只有待定项可忽略');
    const pairs = job.pairs.map(item => item.id === pairId ? { ...item, status: 'dismissed' as const } : item);
    const status = pairs.every(item => item.status === 'confirmed' || item.status === 'dismissed') ? 'closed' as const : 'ready' as const;
    return this.jobs.saveJob({ ...job, pairs, status, updatedAt: this.clock.now().toISOString() });
  }

  async purgeJob(id: string, actor: ActorRef): Promise<{ id: string; purgedAt: string }> {
    const job = this.requireJob(id);
    const finance = await this.admin.isSuperAdmin(actor.id);
    if (job.memberId !== actor.id && !finance) {
      throw appError('forbidden', 'REIMBURSE_ENTRY_FORBIDDEN', '只有本人或财务能删除导入作业');
    }
    if (job.confirmedEntryIds.length > 0) {
      throw appError('conflict', 'REIMBURSE_ENTRY_LOCKED', '已建单的导入作业只能关闭归档');
    }
    if (job.status === 'parsing') {
      throw appError('conflict', 'REIMBURSE_ENTRY_LOCKED', '解析完成后才能删除导入作业');
    }
    await this.storage.removeJob(id);
    this.jobs.deleteJob(id);
    return { id, purgedAt: this.clock.now().toISOString() };
  }

  async closeJob(id: string, actor: ActorRef): Promise<ReimburseImportJob> {
    const job = this.requireJob(id);
    this.requireOwner(job, actor);
    await this.storage.removeJob(id);
    const at = this.clock.now().toISOString();
    return this.jobs.saveJob({
      ...job, status: 'closed', updatedAt: at,
      files: job.files.map(file => file.status === 'parsed' || file.status === 'uploading' || file.status === 'pending' || file.status === 'unreadable'
        ? { ...file, status: 'removed' as const, removedAt: at } : file),
    });
  }

  async confirm(id: string, request: ConfirmReimburseImportRequest, actor: ActorRef): Promise<ReimburseImportJob> {
    let job = this.requireJob(id);
    this.requireOwner(job, actor);
    if (job.status === 'parsing') throw appError('conflict', 'REIMBURSE_ENTRY_LOCKED', '解析完成后才能确认');
    const pendingItems = [];
    for (const item of request.items) {
      const pair = job.pairs.find(candidate => candidate.id === item.pairId);
      if (!pair) throw appError('not_found', 'REIMBURSE_ENTRY_NOT_FOUND', '未知导入配对');
      if (pair.status === 'confirmed') {
        const entry = this.entries.getEntry(pair.confirmedEntryId ?? '');
        if (!entry || (entry as { creationRequest?: { id?: string } }).creationRequest?.id !== item.clientRequestId) {
          throw appError('conflict', 'REIMBURSE_REQUEST_CONFLICT', '幂等请求与已确认内容不一致');
        }
        continue;
      }
      if (pair.status === 'dismissed') throw appError('conflict', 'REIMBURSE_ENTRY_LOCKED', '已忽略项不可确认');
      if (item.batchId && !this.entries.getBatch(item.batchId)) throw appError('validation', 'REIMBURSE_BATCH_NOT_FOUND', '未知批次');
      pendingItems.push({ item, pair });
    }
    if (!pendingItems.length) return job;

    const evidenceDir = this.evidenceStorage.dir();
    if (!evidenceDir) throw appError('validation', 'REIMBURSE_EVIDENCE_STORAGE_UNCONFIGURED', '未配置凭证留档目录');
    const plans: Array<{ item: ConfirmReimburseImportRequest['items'][number]; pair: ReimburseImportPair; evidence: ReimburseEvidence[] }> = [];
    const written: ReimburseEvidence[] = [];
    try {
      for (const { item, pair } of pendingItems) {
        const files = pair.fileIds.map(fileId => job!.files.find(file => file.id === fileId))
          .filter((file): file is ReimburseImportFile => !!file && file.status !== 'removed' && file.status !== 'duplicate')
          .filter(file => file.role === 'invoice' || file.role === 'paymentShot' || file.role === 'inspection');
        if (files.length > REIMBURSE_EVIDENCE_MAX_PER_ENTRY) throw appError('validation', 'REIMBURSE_EVIDENCE_LIMIT', '单个条目最多挂载 12 份凭证');
        const evidence: ReimburseEvidence[] = [];
        for (const file of files) {
          const content = await this.storage.read(id, file.id, file.ext);
          const meta: ReimburseEvidence = {
            id: `revd-${randomUUID()}`, kind: file.role as ReimburseEvidence['kind'], originalName: file.displayName,
            ext: file.ext, sizeBytes: file.sizeBytes, sha256: file.sha256,
            uploadedBy: job.memberId, uploadedAt: this.clock.now().toISOString(),
          };
          await this.evidenceStorage.write(evidenceDir, meta.id, meta.ext, content);
          written.push(meta); evidence.push(meta);
        }
        plans.push({ item, pair, evidence });
      }
      const result = this.unitOfWork.run(actor, () => {
        let current = this.requireJob(id);
        const pairs = [...current.pairs];
        const files = [...current.files];
        const confirmedEntryIds = [...current.confirmedEntryIds];
        for (const plan of plans) {
          const entry = this.entryService.createEntry({
            ...plan.item.draft, memberId: current.memberId, batchId: plan.item.batchId ?? null,
            clientRequestId: plan.item.clientRequestId,
          });
          this.entries.updateEntry(entry.id, {
            evidence: plan.evidence,
            materials: {
              invoice: plan.evidence.some(item => item.kind === 'invoice'),
              paymentShot: plan.evidence.some(item => item.kind === 'paymentShot'),
              inspection: plan.evidence.some(item => item.kind === 'inspection'),
            },
          });
          const pairIndex = pairs.findIndex(pair => pair.id === plan.pair.id);
          pairs[pairIndex] = { ...pairs[pairIndex], status: 'confirmed', confirmedEntryId: entry.id };
          const mounted = new Set(plan.evidence.length ? plan.pair.fileIds : []);
          for (let index = 0; index < files.length; index += 1) {
            if (mounted.has(files[index].id)) files[index] = { ...files[index], status: 'mounted' };
          }
          if (!confirmedEntryIds.includes(entry.id)) confirmedEntryIds.push(entry.id);
        }
        const status = pairs.length > 0 && pairs.every(pair => pair.status === 'confirmed' || pair.status === 'dismissed') ? 'closed' as const : 'ready' as const;
        current = this.jobs.saveJob({ ...current, pairs, files, confirmedEntryIds, status, updatedAt: this.clock.now().toISOString() });
        return current;
      });
      job = result;
      return result;
    } catch (error) {
      await Promise.all(written.map(item => this.evidenceStorage.remove(evidenceDir, item.id).catch(() => {})));
      throw error;
    }
  }
}
