import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { buildCloseoutFromIssue } from '@teamhub/hub-contracts';
import type { IssueCard } from '@teamhub/hub-contracts';
import { FileKbStore } from '../store/file-kb-store.js';
import { deriveErrorCode } from '../kb/error-code.js';
import { parseDebugArchive } from './parse-debug-archive.js';

/**
 * ProbeFlash `.debug-archive` → KB 检索语料 **一次性**导入 CLI（KB-IMPORT-PROBEFLASH，frontier#1）。
 *
 * 流水：读归档目录每份 md → `parseDebugArchive`（best-effort，纯）→ 组输入 IssueCard（status=resolved）→
 * canonical `buildCloseoutFromIssue`（**注入历史时戳**：归档日期而非 server 当前钟，errorCode/归档名反映 bug 当年时间）→
 * 写进 `FileKbStore`（与 server `TEAMHUB_KB_DATA_FILE` 同一落盘文件，server 启动即读、`/api/kb/similar` 可召回）。
 *
 * 为何独立 CLI 而非走 `POST /api/kb/closeout`：那条路由用 server 当前钟戳 errorCode/日期（丢历史），
 * 且导入是**一次性非长期同步**（用户已定「后续本地不再产 archive、全留服务器」）。本 CLI 直接复用
 * canonical 纯函数 + 同一持久层，不复刻派生逻辑（§10 / G2 单一真相）。
 *
 * I0/C2：导入物无人维度——generatedBy=hybrid（非人名）、知识档案主键是 issue/errorCode；
 * 解析只做客观关键词标签，不推断「同因 / 该谁修」（A4/C4）。
 */

export interface ImportOptions {
  archiveDir: string;
  dataFile: string;
  projectId?: string;
  /** 已存在同 id 的卡是否覆盖重导（默认 false：一次性导入，重跑跳过已导，避免 errorEntry 重复追加）。 */
  force?: boolean;
}

export interface ImportFileResult {
  fileName: string;
  status: 'imported' | 'skipped-existing' | 'skipped-empty' | 'failed';
  issueId?: string;
  errorCode?: string;
  warnings: string[];
  detail?: string;
}

export interface ImportSummary {
  archiveDir: string;
  dataFile: string;
  results: ImportFileResult[];
  imported: number;
  skipped: number;
  failed: number;
}

const DEFAULT_PROJECT_ID = 'prj-robots';
const SKIP_FILES = new Set(['README.md', 'readme.md']);

/** 组 best-effort 输入 IssueCard（status=resolved 非 archived，buildCloseoutFromIssue 据此产 archived 版）。 */
function toInputIssueCard(
  issueId: string,
  projectId: string,
  parsed: ReturnType<typeof parseDebugArchive>,
): IssueCard {
  if (!parsed) throw new Error('parsed is null');
  const p = parsed.parsed;
  return {
    id: issueId,
    projectId,
    title: p.title,
    rawInput: p.rawInput,
    normalizedSummary: p.symptom,
    symptomSummary: p.symptom,
    suspectedDirections: [],
    suggestedActions: [],
    status: 'resolved',
    severity: p.severity,
    tags: p.tags,
    relatedFiles: p.relatedFiles,
    relatedCommits: p.relatedCommits,
    relatedHistoricalIssueIds: [],
    createdAt: p.historicalNow,
    updatedAt: p.historicalNow,
  };
}

export async function runImport(options: ImportOptions): Promise<ImportSummary> {
  const projectId = options.projectId ?? DEFAULT_PROJECT_ID;
  const store = await FileKbStore.create(options.dataFile);
  const existingIds = new Set(
    (await store.getKbSnapshot()).issueCards.map((card) => card.id),
  );

  const entries = (await readdir(options.archiveDir))
    .filter((name) => name.toLowerCase().endsWith('.md') && !SKIP_FILES.has(name))
    .sort();

  const results: ImportFileResult[] = [];

  for (const fileName of entries) {
    const markdown = await readFile(join(options.archiveDir, fileName), 'utf8');
    const parsed = parseDebugArchive(markdown, fileName);
    if (!parsed) {
      results.push({ fileName, status: 'skipped-empty', warnings: [] });
      continue;
    }

    const issueId = `iss-pf-${parsed.parsed.slug}`;
    if (existingIds.has(issueId) && !options.force) {
      results.push({
        fileName,
        status: 'skipped-existing',
        issueId,
        warnings: parsed.warnings,
      });
      continue;
    }

    const inputCard = toInputIssueCard(issueId, projectId, parsed);
    const historicalNow = parsed.parsed.historicalNow;
    const result = buildCloseoutFromIssue(
      inputCard,
      [],
      {
        category: parsed.parsed.category,
        rootCause: parsed.parsed.rootCause,
        resolution: parsed.parsed.resolution,
        prevention: parsed.parsed.prevention,
      },
      {
        now: historicalNow,
        errorEntryId: `err-${issueId}`,
        errorCode: deriveErrorCode(historicalNow, issueId),
        generatedBy: 'hybrid',
      },
    );

    if (!result.ok) {
      results.push({
        fileName,
        status: 'failed',
        issueId,
        warnings: parsed.warnings,
        detail: result.reason,
      });
      continue;
    }

    await store.appendCloseout({
      issueCard: result.updatedIssueCard,
      errorEntry: result.errorEntry,
      archiveDocument: result.archiveDocument,
    });
    existingIds.add(issueId);
    results.push({
      fileName,
      status: 'imported',
      issueId,
      errorCode: result.errorEntry.errorCode,
      warnings: parsed.warnings,
    });
  }

  return {
    archiveDir: options.archiveDir,
    dataFile: options.dataFile,
    results,
    imported: results.filter((r) => r.status === 'imported').length,
    skipped: results.filter((r) => r.status.startsWith('skipped')).length,
    failed: results.filter((r) => r.status === 'failed').length,
  };
}

function formatSummary(summary: ImportSummary): string {
  const lines: string[] = [];
  lines.push(`[kb-import] archive: ${summary.archiveDir}`);
  lines.push(`[kb-import] data file: ${summary.dataFile}`);
  for (const r of summary.results) {
    const head = `[kb-import] ${r.status.padEnd(16)} ${r.fileName}`;
    const code = r.errorCode ? ` (${r.errorCode})` : '';
    const id = r.issueId ? ` → ${r.issueId}` : '';
    lines.push(`${head}${id}${code}`);
    if (r.detail) lines.push(`              ! ${r.detail}`);
    for (const w of r.warnings) lines.push(`              · ${w}`);
  }
  lines.push(
    `[kb-import] done: ${summary.imported} imported / ${summary.skipped} skipped / ${summary.failed} failed`,
  );
  return lines.join('\n');
}

async function main(): Promise<void> {
  const archiveDir = process.argv[2] ?? process.env.IMPORT_ARCHIVE_DIR;
  const dataFile = process.argv[3] ?? process.env.TEAMHUB_KB_DATA_FILE;
  const force = process.env.IMPORT_FORCE === '1';

  if (!archiveDir || !dataFile) {
    console.error(
      'usage: node dist/import/import-debug-archive.js <archiveDir> <dataFile>\n' +
        '  (or set IMPORT_ARCHIVE_DIR + TEAMHUB_KB_DATA_FILE; IMPORT_FORCE=1 to re-import existing)',
    );
    process.exit(2);
    return;
  }

  const summary = await runImport({ archiveDir, dataFile, force });
  console.log(formatSummary(summary));
  if (summary.failed > 0) process.exitCode = 1;
}

// 仅作为 CLI 入口执行时跑 main（被 import 时不跑）。
const isCli = process.argv[1]?.endsWith('import-debug-archive.js');
if (isCli) {
  main().catch((error) => {
    console.error(`[kb-import] ${(error as Error).message}`);
    process.exit(1);
  });
}
