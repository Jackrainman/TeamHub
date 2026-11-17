#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];
function read(relativePath) { return fs.readFileSync(path.join(root, relativePath), 'utf8'); }
function listTypeScriptFiles(directory) {
  const absolute = path.join(root, directory);
  if (!fs.existsSync(absolute)) return [];
  return fs.readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    const relativePath = `${directory}/${entry.name}`;
    return entry.isDirectory() ? listTypeScriptFiles(relativePath)
      : entry.isFile() && /\.tsx?$/.test(entry.name) ? [relativePath] : [];
  });
}
function lineAt(content, index) { return content.slice(0, index).split('\n').length; }
function report(file, content, index, message) { errors.push(`${file}:${lineAt(content, index)} ${message}`); }
function literals(pattern, content, callback) {
  for (const match of content.matchAll(pattern)) callback(match[1], match.index ?? 0);
}
const codesSource = read('apps/hub-contracts/src/common/error-codes.ts');
const codesBlock = codesSource.match(/export const ERROR_CODES = \[([\s\S]*?)\] as const;/)?.[1] ?? '';
const errorCodes = [...codesBlock.matchAll(/'([A-Z][A-Z0-9_]+)'/g)].map((match) => match[1]);
const errorCodeSet = new Set(errorCodes);
const legacyBlock = codesSource.match(/export const LEGACY_CODE_MAP = \{([\s\S]*?)\} as const/)?.[1] ?? '';
const legacyCodes = [...legacyBlock.matchAll(/^\s*([A-Z][A-Z0-9_]+):/gm)].map((match) => match[1]);
const legacyCodeSet = new Set(legacyCodes);
if (errorCodes.length === 0 || errorCodes.length !== errorCodeSet.size) errors.push('ERROR_CODES 必须是非空唯一闭集');
if (legacyCodes.length === 0 || legacyCodes.length !== legacyCodeSet.size) errors.push('LEGACY_CODE_MAP 必须是非空唯一映射');
for (const match of codesSource.matchAll(/^\s*[A-Z][A-Z0-9_]+:\s*'([A-Z][A-Z0-9_]+)'/gm)) {
  if (!errorCodeSet.has(match[1])) errors.push(`LEGACY_CODE_MAP 映射到非闭集码 ${match[1]}`);
}
const observedLegacyCodes = new Set();
for (const file of listTypeScriptFiles('apps/hub-server/src')) {
  const content = read(file);
  for (const match of content.matchAll(/\breply\.code\(\s*4\d\d\s*\)\s*\.send\s*\(/g)) {
    report(file, content, match.index ?? 0, '禁止裸 4xx send，请使用结构化出口');
  }
  literals(/\bnew\s+ApplicationError\s*\(\s*[^,]+,\s*['"]([A-Z][A-Z0-9_]+)['"]/g, content, (code, index) => {
    if (!errorCodeSet.has(code)) report(file, content, index, `ApplicationError 使用非闭集码 ${code}`);
  });
  for (const pattern of [
    /\bappError\s*\(\s*[^,]+,\s*['"]([A-Z][A-Z0-9_]{3,})['"]/g,
    /\bLEGACY_CODE_MAP\.([A-Z][A-Z0-9_]{3,})/g,
    /\breason\s*:\s*['"]([A-Z][A-Z0-9_]{3,})['"]/g,
    /\breturn\s+['"](REIMBURSE_[A-Z0-9_]+)['"]/g,
  ]) literals(pattern, content, (code, index) => {
    observedLegacyCodes.add(code);
    if (!legacyCodeSet.has(code)) report(file, content, index, `发现未映射旧码 ${code}`);
  });
  literals(/\bfail\s*\(\s*reply\s*,\s*['"]([A-Z][A-Z0-9_]+)['"]/g, content, (code, index) => {
    if (!errorCodeSet.has(code)) report(file, content, index, `fail() 使用非闭集码 ${code}`);
  });
}
for (const file of listTypeScriptFiles('apps/hub-contracts/src/domains/reimburse')) {
  const content = read(file);
  literals(/\breturn\s+['"](REIMBURSE_[A-Z0-9_]+)['"]/g, content, (code, index) => {
    observedLegacyCodes.add(code);
    if (!legacyCodeSet.has(code)) report(file, content, index, `发现未映射旧码 ${code}`);
  });
}
const i18nSource = read('apps/hub-console/src/i18n/locales/errors.ts');
for (const [name, next] of [['zhErrors', 'enErrors'], ['enErrors', null]]) {
  const start = i18nSource.indexOf(`export const ${name}`);
  const end = next ? i18nSource.indexOf(`export const ${next}`, start + 1) : i18nSource.length;
  const block = start < 0 ? '' : i18nSource.slice(start, end);
  const keys = new Set([...block.matchAll(/'apiError\.([A-Z][A-Z0-9_]+)'\s*:/g)].map((match) => match[1]));
  for (const code of errorCodeSet) if (!keys.has(code)) errors.push(`${name} 缺少 apiError.${code}`);
  for (const code of keys) if (!errorCodeSet.has(code)) errors.push(`${name} 含非闭集 apiError.${code}`);
}
if (errors.length) {
  console.error(`✗ error codes: ${errors.length} 项违规`);
  for (const error of errors) console.error(`  ${error}`);
  process.exitCode = 1;
} else {
  console.log(`✓ error codes: ${legacyCodeSet.size} mapped, ${errorCodeSet.size} closed codes, ${observedLegacyCodes.size} observed legacy codes, 双语完整`);
}
