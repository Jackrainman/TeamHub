import { z } from 'zod';

import { IssueStatusSchema } from './kb.js';
import type { ArchiveDocument, ErrorEntry, IssueCard } from './kb.js';

/**
 * 相似 bug 检索（KB-CORE 核心读派生）。从 Probe_Flash 移植 `rankSimilarIssues` **纯函数段**——
 * 标签 / 关键词 / 根因术语 / 处理术语重合度打分，召回跨赛季同类 bug。
 *
 * 移植差异（诚实标注，AGENTS §10）：
 * - **只移植纯函数 `rankSimilarIssues`**；Probe_Flash 的 `findSimilarIssuesForIssue`（依赖
 *   StorageRepository 做磁盘 IO）不移植——TeamHub 侧的 IO 由 `GET /api/kb/similar` 路由从
 *   `KbStore` 读快照后喂入本纯函数（保持本层全纯、可单测）。
 *
 * 护栏（AGENTS §5 A4 / C4）：返回的是**候选检查单**——`reasons` 是「哪些词重合」的客观依据，
 * **不断言「同因」、不下结论**；由人看 reasons 自行选用（relatedHistoricalIssueIds 是人选后回挂）。
 * 主键是 issue / errorCode / 知识点，**无人维度**（C2）。
 */

export const SimilarIssueMatchSchema = z.object({
  issueId: z.string(),
  title: z.string(),
  status: IssueStatusSchema,
  tags: z.array(z.string()),
  score: z.number(),
  /** 客观重合依据（「标签重合：CAN、电机」等），非「同因」断言（A4）。 */
  reasons: z.array(z.string()),
  matchedTags: z.array(z.string()),
  matchedKeywords: z.array(z.string()),
  matchedRootCauseTerms: z.array(z.string()),
  matchedResolutionTerms: z.array(z.string()),
  errorCode: z.string().optional(),
  rootCauseSummary: z.string().optional(),
  resolutionSummary: z.string().optional(),
  archiveFileName: z.string().optional(),
  updatedAt: z.string(),
});

export type SimilarIssueMatch = z.infer<typeof SimilarIssueMatchSchema>;

export interface RankSimilarIssuesInput {
  currentIssue: IssueCard;
  issues: IssueCard[];
  errorEntries?: ErrorEntry[];
  archives?: ArchiveDocument[];
  limit?: number;
  minScore?: number;
}

const DEFAULT_LIMIT = 4;
const DEFAULT_MIN_SCORE = 4;

const TOKEN_PATTERN = /[\p{L}\p{N}][\p{L}\p{N}_-]*/gu;

const STOP_WORDS = new Set([
  'and',
  'the',
  'with',
  'from',
  'should',
  'issue',
  'error',
  'failure',
  'problem',
  'debug',
  'verify',
  'sentinel',
  'search',
  'tag',
  'tags',
  '问题',
  '现象',
  '排查',
  '验证',
  '错误',
  '失败',
  '历史',
]);

function normalizeText(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function normalizeTagList(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const tag of tags) {
    if (typeof tag !== 'string') continue;
    const trimmed = tag.trim();
    const key = normalizeText(trimmed);
    if (trimmed.length === 0 || seen.has(key)) continue;
    seen.add(key);
    normalized.push(trimmed);
  }
  return normalized;
}

function addTokens(tokens: Set<string>, value: unknown): void {
  if (Array.isArray(value)) {
    value.forEach((item) => addTokens(tokens, item));
    return;
  }
  if (typeof value !== 'string') return;
  for (const match of value.matchAll(TOKEN_PATTERN)) {
    const token = normalizeText(match[0]);
    if (token.length < 2 || STOP_WORDS.has(token)) continue;
    tokens.add(token);
  }
}

function tokenSet(values: unknown[]): Set<string> {
  const tokens = new Set<string>();
  values.forEach((value) => addTokens(tokens, value));
  return tokens;
}

function intersectOrdered(
  left: string[],
  right: Set<string>,
  limit: number,
): string[] {
  const matches: string[] = [];
  const seen = new Set<string>();
  for (const value of left) {
    const key = normalizeText(value);
    if (!right.has(key) || seen.has(key)) continue;
    seen.add(key);
    matches.push(value);
    if (matches.length >= limit) break;
  }
  return matches;
}

function intersectTokens(
  left: Set<string>,
  right: Set<string>,
  limit: number,
): string[] {
  const matches: string[] = [];
  for (const token of left) {
    if (!right.has(token)) continue;
    matches.push(token);
    if (matches.length >= limit) break;
  }
  return matches;
}

function compactSummary(
  value: string | undefined,
  limit = 96,
): string | undefined {
  const compacted = value?.replace(/\s+/g, ' ').trim();
  if (!compacted) return undefined;
  return compacted.length <= limit ? compacted : `${compacted.slice(0, limit)}...`;
}

function issueTokens(issue: IssueCard): Set<string> {
  return tokenSet([
    issue.title,
    issue.rawInput,
    issue.normalizedSummary,
    issue.symptomSummary,
    issue.suspectedDirections,
    issue.suggestedActions,
    issue.tags,
  ]);
}

function groupByIssueId<T extends { sourceIssueId?: string; issueId?: string }>(
  items: T[],
): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const item of items) {
    const issueId = item.sourceIssueId ?? item.issueId;
    if (!issueId) continue;
    const bucket = grouped.get(issueId) ?? [];
    bucket.push(item);
    grouped.set(issueId, bucket);
  }
  return grouped;
}

function isHistoricalIssue(
  issue: IssueCard,
  errorEntries: ErrorEntry[],
  archives: ArchiveDocument[],
): boolean {
  return (
    issue.status === 'archived' ||
    issue.status === 'resolved' ||
    errorEntries.length > 0 ||
    archives.length > 0
  );
}

function buildReasons(match: Omit<SimilarIssueMatch, 'reasons'>): string[] {
  const reasons: string[] = [];
  const labels: Array<[keyof typeof match, string]> = [
    ['matchedTags', '标签重合'],
    ['matchedKeywords', '关键词重合'],
    ['matchedRootCauseTerms', '根因术语重合'],
    ['matchedResolutionTerms', '处理方式术语重合'],
  ];
  for (const [key, prefix] of labels) {
    const list = match[key] as string[];
    if (list.length > 0) reasons.push(`${prefix}：${list.join('、')}`);
  }
  if (match.errorCode) reasons.push(`已有错误表：${match.errorCode}`);
  return reasons;
}

export function rankSimilarIssues(
  input: RankSimilarIssuesInput,
): SimilarIssueMatch[] {
  const limit = input.limit ?? DEFAULT_LIMIT;
  const minScore = input.minScore ?? DEFAULT_MIN_SCORE;
  const errorEntries = input.errorEntries ?? [];
  const archives = input.archives ?? [];
  const errorsByIssueId = groupByIssueId(errorEntries);
  const archivesByIssueId = groupByIssueId(archives);
  const currentTags = normalizeTagList(input.currentIssue.tags);
  const currentTagKeys = new Set(currentTags.map(normalizeText));
  const currentIssueTerms = issueTokens(input.currentIssue);
  const currentErrors = errorsByIssueId.get(input.currentIssue.id) ?? [];
  const currentRootTerms = tokenSet(currentErrors.map((entry) => entry.rootCause));
  const currentResolutionTerms = tokenSet(
    currentErrors.flatMap((entry) => [entry.resolution, entry.prevention]),
  );
  const currentComparisonTerms = new Set([
    ...currentIssueTerms,
    ...currentRootTerms,
    ...currentResolutionTerms,
  ]);

  const matches: SimilarIssueMatch[] = [];

  for (const issue of input.issues) {
    if (
      issue.id === input.currentIssue.id ||
      issue.projectId !== input.currentIssue.projectId
    ) {
      continue;
    }
    const candidateErrors = errorsByIssueId.get(issue.id) ?? [];
    const candidateArchives = archivesByIssueId.get(issue.id) ?? [];
    if (!isHistoricalIssue(issue, candidateErrors, candidateArchives)) {
      continue;
    }

    const candidateTags = normalizeTagList([
      ...normalizeTagList(issue.tags),
      ...candidateErrors.flatMap((entry) => normalizeTagList(entry.tags)),
    ]);
    const matchedTags = intersectOrdered(candidateTags, currentTagKeys, 6);
    const candidateIssueTerms = tokenSet([
      issue.title,
      issue.rawInput,
      issue.normalizedSummary,
      issue.symptomSummary,
      issue.suspectedDirections,
      issue.suggestedActions,
      issue.tags,
      candidateErrors.flatMap((entry) => [
        entry.title,
        entry.category,
        entry.symptom,
      ]),
      candidateArchives.map((archive) => archive.markdownContent),
    ]);
    const candidateRootTerms = tokenSet(
      candidateErrors.map((entry) => entry.rootCause),
    );
    const candidateResolutionTerms = tokenSet(
      candidateErrors.flatMap((entry) => [entry.resolution, entry.prevention]),
    );
    const matchedKeywords = intersectTokens(
      currentIssueTerms,
      candidateIssueTerms,
      8,
    );
    const matchedRootCauseTerms = intersectTokens(
      currentComparisonTerms,
      candidateRootTerms,
      5,
    );
    const matchedResolutionTerms = intersectTokens(
      currentComparisonTerms,
      candidateResolutionTerms,
      5,
    );
    const firstError = candidateErrors[0];
    const firstArchive = candidateArchives[0];
    const score =
      matchedTags.length * 4 +
      matchedKeywords.length * 2 +
      matchedRootCauseTerms.length * 3 +
      matchedResolutionTerms.length * 2 +
      (firstError ? 1 : 0) +
      (firstArchive ? 1 : 0);
    if (score < minScore) {
      continue;
    }
    const matchWithoutReasons = {
      issueId: issue.id,
      title: issue.title,
      status: issue.status,
      tags: candidateTags,
      score,
      matchedTags,
      matchedKeywords,
      matchedRootCauseTerms,
      matchedResolutionTerms,
      errorCode: firstError?.errorCode,
      rootCauseSummary: compactSummary(firstError?.rootCause),
      resolutionSummary: compactSummary(firstError?.resolution),
      archiveFileName: firstArchive?.fileName,
      updatedAt: issue.updatedAt,
    } satisfies Omit<SimilarIssueMatch, 'reasons'>;
    matches.push({
      ...matchWithoutReasons,
      reasons: buildReasons(matchWithoutReasons),
    });
  }

  matches.sort((left, right) => {
    if (left.score !== right.score) return right.score - left.score;
    if (left.updatedAt !== right.updatedAt)
      return left.updatedAt < right.updatedAt ? 1 : -1;
    return left.issueId.localeCompare(right.issueId);
  });

  return matches.slice(0, limit);
}
