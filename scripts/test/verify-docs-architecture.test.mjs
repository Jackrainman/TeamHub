import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  ACTIVE_MARKDOWN,
  ARCHIVE_MARKDOWN,
  verifyDocsArchitecture,
} from '../verify-docs-architecture.mjs';

const SHA = '0123456789abcdef0123456789abcdef01234567';

function write(root, relativePath, content) {
  const absolutePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, content, 'utf8');
}

function validFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'teamhub-docs-'));
  for (const relativePath of ACTIVE_MARKDOWN) {
    const content = relativePath.startsWith('docs/research/')
      ? '---\nchecked_at: 2026-08-15\nreview_after: 2026-11-15\n---\n\n# Research\n'
      : '# Current truth\n';
    write(root, relativePath, content);
  }
  for (const relativePath of ARCHIVE_MARKDOWN) {
    const content = relativePath.endsWith('/README.md')
      ? '# Archive index\n'
      : `# Archive\n\n## ARC-001 Example\n\nsource_sha: ${SHA}\n`;
    write(root, relativePath, content);
  }
  return root;
}

test('accepts the exact target documentation structure', (context) => {
  const root = validFixture();
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const result = verifyDocsArchitecture(root);
  assert.deepEqual(result.errors, []);
  assert.equal(result.summary.active, ACTIVE_MARKDOWN.length);
  assert.equal(result.summary.archive, 5);
});

test('reports structural, naming, metadata, archive and link violations together', (context) => {
  const root = validFixture();
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));

  write(root, 'docs/status-2026-08-15.md', '# Status\n');
  write(root, 'docs/archive/extra.txt', 'not allowed\n');
  write(root, 'docs/screenshots/example.png', 'fake image\n');
  write(root, 'docs/research/lark.md', '# Missing frontmatter\n');
  write(root, 'docs/design/product.md', `${'# Product\n'}${'line\n'.repeat(400)}`);
  write(root, 'docs/domains/system.md', '# System\n\n[old incident](../archive/incidents.md)\n');
  write(root, 'docs/archive/incidents.md', '# Incidents\n\n## Missing identifier\n\nsource_sha: short\n');

  const messages = verifyDocsArchitecture(root).errors.join('\n');
  assert.match(messages, /未登记在显式 allowlist/);
  assert.match(messages, /不得包含日期/);
  assert.match(messages, /status\/plan\/issues/);
  assert.match(messages, /只允许固定的五份 Markdown/);
  assert.match(messages, /目录必须不存在/);
  assert.match(messages, /必须包含 YAML frontmatter/);
  assert.match(messages, /超过 400 行上限/);
  assert.match(messages, /不得直链/);
  assert.match(messages, /必须以稳定 ID 开头/);
  assert.match(messages, /完整 40 位 source SHA/);
});

test('allows active documents to link to the archive index', (context) => {
  const root = validFixture();
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  write(root, 'docs/domains/system.md', '# System\n\n[history](../archive/README.md#incidents)\n');

  assert.deepEqual(verifyDocsArchitecture(root).errors, []);
});
