#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const ACTIVE_MARKDOWN = Object.freeze([
  'docs/README.md',
  'docs/design/product.md',
  'docs/design/software-architecture.md',
  'docs/design/design-system.md',
  'docs/domains/system.md',
  'docs/domains/pm.md',
  'docs/domains/knowledge.md',
  'docs/domains/inventory.md',
  'docs/domains/baseline.md',
  'docs/domains/checklist.md',
  'docs/domains/resources.md',
  'docs/domains/schedule.md',
  'docs/domains/artifacts.md',
  'docs/domains/reimburse.md',
  'docs/domains/integrations.md',
  'docs/guide/getting-started.md',
  'docs/operations/deploy.md',
  'docs/operations/runbook.md',
  'docs/operations/release.md',
  'docs/operations/agent-deploy.md',
  'docs/research/lark.md',
]);

export const ARCHIVE_MARKDOWN = Object.freeze([
  'docs/archive/README.md',
  'docs/archive/milestones.md',
  'docs/archive/decisions.md',
  'docs/archive/incidents.md',
  'docs/archive/deferred.md',
]);

const CANONICAL_MARKDOWN = new Set([
  'docs/design/product.md',
  'docs/design/software-architecture.md',
  'docs/design/design-system.md',
  ...ACTIVE_MARKDOWN.filter((relativePath) => relativePath.startsWith('docs/domains/')),
]);

const DATE_FILENAME = /(?:^|[-_.])(?:19|20)\d{2}[-_]\d{2}(?:[-_]\d{2})?(?:[-_.]|$)/i;
const FORBIDDEN_FILENAME_TOKEN = /(?:^|[-_.])(status|plan|issues)(?:[-_.]|$)/i;
const STABLE_ARCHIVE_ID = /^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+\b/;
const FULL_SHA = /\b[0-9a-f]{40}\b/i;
const SOURCE_LABEL = /(?:source[ _-]?sha|来源(?:\s*commit)?\s*sha|来源\s*(?:提交|版本|commit))/i;

function toPosix(relativePath) {
  return relativePath.split(path.sep).join('/');
}

function listFilesRecursively(directory) {
  if (!fs.existsSync(directory)) return [];

  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFilesRecursively(entryPath));
    } else if (entry.isFile()) {
      files.push(entryPath);
    }
  }
  return files;
}

function lineCount(content) {
  if (content.length === 0) return 0;
  return content.replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n').length;
}

function frontmatter(content) {
  const normalized = content.replace(/\r\n?/g, '\n');
  const match = normalized.match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
  if (!match) return null;

  const fields = new Map();
  for (const line of match[1].split('\n')) {
    const field = line.match(/^([A-Za-z][A-Za-z0-9_-]*)\s*:\s*(.*?)\s*$/);
    if (field) fields.set(field[1], field[2].replace(/^['"]|['"]$/g, ''));
  }
  return fields;
}

function markdownTargets(content) {
  const targets = [];
  const inlineLink = /\]\(\s*(?:<([^>]+)>|([^\s)]+))(?:\s+['"][^'"]*['"])?\s*\)/g;
  const referenceLink = /^\s*\[[^\]]+\]:\s*(?:<([^>]+)>|([^\s]+))/gm;

  for (const pattern of [inlineLink, referenceLink]) {
    for (const match of content.matchAll(pattern)) targets.push(match[1] ?? match[2]);
  }
  return targets;
}

function linksDirectlyToArchiveEntry(repoRoot, sourceRelativePath, target) {
  if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('#')) return false;

  let decodedTarget = target;
  try {
    decodedTarget = decodeURIComponent(target);
  } catch {
    // An invalid URL escape is somebody else's concern; retain the literal path here.
  }
  const pathOnly = decodedTarget.split(/[?#]/, 1)[0].replaceAll('\\', '/');
  const resolved = path.resolve(repoRoot, path.dirname(sourceRelativePath), pathOnly);
  const archiveRoot = path.resolve(repoRoot, 'docs/archive');
  const archiveReadme = path.join(archiveRoot, 'README.md');
  return resolved.startsWith(`${archiveRoot}${path.sep}`) && resolved !== archiveReadme;
}

function validateArchiveEntries(relativePath, content, errors) {
  const normalized = content.replace(/\r\n?/g, '\n');
  const headings = [...normalized.matchAll(/^##\s+(.+)$/gm)];
  if (headings.length === 0) {
    errors.push(`${relativePath}: 至少需要一个以二级标题表示的归档条目`);
    return;
  }

  for (let index = 0; index < headings.length; index += 1) {
    const heading = headings[index];
    const title = heading[1].trim();
    const blockStart = heading.index + heading[0].length;
    const blockEnd = headings[index + 1]?.index ?? normalized.length;
    const block = normalized.slice(blockStart, blockEnd);

    if (!STABLE_ARCHIVE_ID.test(title)) {
      errors.push(`${relativePath}: 二级标题“${title}”必须以稳定 ID 开头（例如 INC-001）`);
    }
    if (!SOURCE_LABEL.test(block) || !FULL_SHA.test(block)) {
      errors.push(`${relativePath}: 条目“${title}”必须包含来源标签和完整 40 位 source SHA`);
    }
  }
}

export function verifyDocsArchitecture(repoRoot = process.cwd()) {
  const absoluteRoot = path.resolve(repoRoot);
  const docsRoot = path.join(absoluteRoot, 'docs');
  const archiveRoot = path.join(docsRoot, 'archive');
  const errors = [];
  const allowedActive = new Set(ACTIVE_MARKDOWN);
  const allowedArchive = new Set(ARCHIVE_MARKDOWN);

  if (!fs.existsSync(docsRoot)) {
    return { errors: ['docs: 目录不存在'], summary: { active: 0, archive: 0, canonical: 0 } };
  }

  const allDocsFiles = listFilesRecursively(docsRoot);
  const allMarkdown = allDocsFiles
    .filter((filePath) => filePath.toLowerCase().endsWith('.md'))
    .map((filePath) => toPosix(path.relative(absoluteRoot, filePath)))
    .sort();
  const activeMarkdown = allMarkdown.filter((relativePath) => !relativePath.startsWith('docs/archive/'));
  const archiveFiles = listFilesRecursively(archiveRoot)
    .map((filePath) => toPosix(path.relative(absoluteRoot, filePath)))
    .sort();

  for (const relativePath of ACTIVE_MARKDOWN) {
    if (!allMarkdown.includes(relativePath)) errors.push(`${relativePath}: allowlist 中的活文档不存在`);
  }
  for (const relativePath of activeMarkdown) {
    if (!allowedActive.has(relativePath)) errors.push(`${relativePath}: 活跃 Markdown 未登记在显式 allowlist`);
  }

  for (const relativePath of ARCHIVE_MARKDOWN) {
    if (!archiveFiles.includes(relativePath)) errors.push(`${relativePath}: 必需的归档文档不存在`);
  }
  for (const relativePath of archiveFiles) {
    if (!allowedArchive.has(relativePath)) errors.push(`${relativePath}: docs/archive 只允许固定的五份 Markdown，不得包含其他文件`);
  }

  if (fs.existsSync(path.join(docsRoot, 'screenshots'))) {
    errors.push('docs/screenshots: 目录必须不存在；截图应输出到被 gitignore 覆盖的测试产物目录');
  }

  for (const relativePath of activeMarkdown) {
    const basename = path.posix.basename(relativePath, '.md');
    if (DATE_FILENAME.test(basename)) errors.push(`${relativePath}: 活文档文件名不得包含日期`);
    if (FORBIDDEN_FILENAME_TOKEN.test(basename)) {
      errors.push(`${relativePath}: 活文档文件名不得使用 status/plan/issues 标记`);
    }

    const content = fs.readFileSync(path.join(absoluteRoot, relativePath), 'utf8');
    if (CANONICAL_MARKDOWN.has(relativePath)) {
      const lines = lineCount(content);
      if (lines > 400) errors.push(`${relativePath}: canonical 文档为 ${lines} 行，超过 400 行上限`);
    }
    for (const target of markdownTargets(content)) {
      if (linksDirectlyToArchiveEntry(absoluteRoot, relativePath, target)) {
        errors.push(`${relativePath}: 活文档只能链接 docs/archive/README.md，不得直链 ${target}`);
      }
    }
  }

  for (const relativePath of activeMarkdown.filter((entry) => entry.startsWith('docs/research/'))) {
    const content = fs.readFileSync(path.join(absoluteRoot, relativePath), 'utf8');
    const metadata = frontmatter(content);
    if (!metadata) {
      errors.push(`${relativePath}: research 文档必须包含 YAML frontmatter`);
      continue;
    }
    for (const key of ['checked_at', 'review_after']) {
      const value = metadata.get(key);
      if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        errors.push(`${relativePath}: frontmatter 的 ${key} 必须是 YYYY-MM-DD`);
      }
    }
  }

  for (const relativePath of ARCHIVE_MARKDOWN.filter((entry) => !entry.endsWith('/README.md'))) {
    const absolutePath = path.join(absoluteRoot, relativePath);
    if (!fs.existsSync(absolutePath)) continue;
    validateArchiveEntries(relativePath, fs.readFileSync(absolutePath, 'utf8'), errors);
  }

  return {
    errors,
    summary: {
      active: activeMarkdown.length,
      archive: archiveFiles.length,
      canonical: [...CANONICAL_MARKDOWN].filter((entry) => allMarkdown.includes(entry)).length,
    },
  };
}

function runCli() {
  const repoRoot = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();
  const result = verifyDocsArchitecture(repoRoot);
  if (result.errors.length > 0) {
    console.error(`文档架构检查失败（${result.errors.length} 项）：`);
    for (const error of result.errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }

  console.log(
    `文档架构检查通过：${result.summary.active} 份活文档，` +
      `${result.summary.archive} 份归档文档，${result.summary.canonical} 份 canonical 文档。`,
  );
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) runCli();
