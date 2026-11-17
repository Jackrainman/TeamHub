#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function lineAt(content, index) {
  return content.slice(0, index).split('\n').length;
}

function report(relativePath, content, index, message) {
  errors.push(`${relativePath}:${lineAt(content, index)} ${message}`);
}

function listTypeScriptFiles(directory) {
  const absoluteDirectory = path.join(root, directory);
  return fs.readdirSync(absoluteDirectory, { withFileTypes: true }).flatMap((entry) => {
    const relativePath = `${directory}/${entry.name}`;
    if (entry.isDirectory()) return listTypeScriptFiles(relativePath);
    return entry.isFile() && entry.name.endsWith('.ts') ? [relativePath] : [];
  });
}

function stringLiteral(pattern, content, callback) {
  for (const match of content.matchAll(pattern)) callback(match[1], match.index ?? 0);
}

const codesSource = read('apps/hub-contracts/src/common/error-codes.ts');
const codesBlock = codesSource.match(/export const ERROR_CODES = \[([\s\S]*?)\] as const;/)?.[1] ?? '';
const errorCodes = [...codesBlock.matchAll(/'([A-Z][A-Z0-9_]+)'/g)].map((match) => match[1]);
const errorCodeSet = new Set(errorCodes);
const legacyBlock = codesSource.match(/export const LEGACY_CODE_MAP = \{([\s\S]*?)\} as const/)?.[1] ?? '';
const legacyCodes = [...legacyBlock.matchAll(/^\s*([A-Z][A-Z0-9_]+):/gm)].map((match) => match[1]);
const legacyCodeSet = new Set(legacyCodes);

if (errorCodes.length !== 15 || errorCodeSet.size !== 15) {
  errors.push(`apps/hub-contracts/src/common/error-codes.ts ERROR_CODES 必须恰好包含 15 个唯一闭集码，实际 ${errorCodeSet.size}`);
}
if (legacyCodes.length !== 61 || legacyCodeSet.size !== 61) {
  errors.push(`apps/hub-contracts/src/common/error-codes.ts LEGACY_CODE_MAP 必须恰好包含 61 个唯一旧码，实际 ${legacyCodeSet.size}`);
}

for (const relativePath of listTypeScriptFiles('apps/hub-server/src')) {
  const content = read(relativePath);
  for (const match of content.matchAll(/\breply\.code\(\s*4\d\d\s*\)\s*\.send\s*\(/g)) {
    report(relativePath, content, match.index ?? 0, '禁止裸 4xx send，请使用 fail()');
  }

  stringLiteral(/\bnew\s+ApplicationError\s*\(\s*[^,]+,\s*['"]([A-Z][A-Z0-9_]+)['"]/g, content, (code, index) => {
    if (!errorCodeSet.has(code)) report(relativePath, content, index, `ApplicationError 使用非闭集码 ${code}`);
  });
  stringLiteral(/\bappError\s*\(\s*[^,]+,\s*['"]([A-Z][A-Z0-9_]+)['"]/g, content, (code, index) => {
    if (!legacyCodeSet.has(code)) report(relativePath, content, index, `appError 使用未映射旧码 ${code}`);
  });
  stringLiteral(/\bfail\s*\(\s*reply\s*,\s*['"]([A-Z][A-Z0-9_]+)['"]/g, content, (code, index) => {
    if (!errorCodeSet.has(code)) report(relativePath, content, index, `fail() 使用非闭集码 ${code}`);
  });
}

const i18nSource = read('apps/hub-console/src/i18n/locales/errors.ts');
for (const [name, nextName] of [['zhErrors', 'enErrors'], ['enErrors', null]]) {
  const start = i18nSource.indexOf(`export const ${name}`);
  const end = nextName ? i18nSource.indexOf(`export const ${nextName}`, start + 1) : i18nSource.length;
  const block = start < 0 ? '' : i18nSource.slice(start, end);
  const keys = new Set([...block.matchAll(/'apiError\.([A-Z][A-Z0-9_]+)'\s*:/g)].map((match) => match[1]));
  for (const code of errorCodeSet) {
    if (!keys.has(code)) errors.push(`apps/hub-console/src/i18n/locales/errors.ts ${name} 缺少 apiError.${code}`);
  }
  for (const code of keys) {
    if (!errorCodeSet.has(code)) errors.push(`apps/hub-console/src/i18n/locales/errors.ts ${name} 含非闭集 apiError.${code}`);
  }
  if (keys.size !== 15) errors.push(`apps/hub-console/src/i18n/locales/errors.ts ${name} 必须有 15 个文案，实际 ${keys.size}`);
}

const legacyFiles = [
  'apps/hub-server/src/modules/reimburse/service.ts',
  'apps/hub-server/src/modules/checklist/service.ts',
  'apps/hub-server/src/modules/archive/service.ts',
  'apps/hub-server/src/modules/baseline/service.ts',
  'apps/hub-contracts/src/domains/reimburse/workflow.ts',
  'apps/hub-server/src/middleware/auth-gate.ts',
  'apps/hub-server/src/modules/pm/tasks.ts',
  'apps/hub-server/src/modules/reimburse/routes.ts',
];
const observedLegacyCodes = new Set();
for (const relativePath of legacyFiles) {
  const content = read(relativePath);
  const patterns = [
    /\bappError\s*\(\s*[^,]+,\s*['"]([A-Z][A-Z0-9_]{3,})['"]/g,
    /\bLEGACY_CODE_MAP\.([A-Z][A-Z0-9_]{3,})/g,
    /\breason\s*:\s*['"]([A-Z][A-Z0-9_]{3,})['"]/g,
    /\breason\s*===\s*['"]([A-Z][A-Z0-9_]{3,})['"]/g,
    /\breturn\s+['"](REIMBURSE_[A-Z0-9_]+)['"]/g,
  ];
  for (const pattern of patterns) {
    stringLiteral(pattern, content, (code, index) => {
      observedLegacyCodes.add(code);
      if (!legacyCodeSet.has(code)) report(relativePath, content, index, `发现未映射旧码 ${code}`);
    });
  }
}

if (errors.length > 0) {
  console.error(`✗ error codes: ${errors.length} 项违规`);
  for (const error of errors) console.error(`  ${error}`);
  process.exitCode = 1;
} else {
  console.log(`✓ error codes: ${legacyCodeSet.size}/61 mapped, ${errorCodeSet.size} closed codes, 15×2 i18n keys`);
}
