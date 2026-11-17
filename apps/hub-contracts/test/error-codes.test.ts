import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

import {
  ERROR_CODES,
  ERROR_STATUS,
  LEGACY_CODE_MAP,
  isErrorCode,
} from '../src/index.js';

const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url));

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.isFile() && entry.name.endsWith('.ts') ? [path] : [];
  });
}

function collectMatches(source: string, pattern: RegExp, codes: Set<string>): void {
  for (const match of source.matchAll(pattern)) codes.add(match[1]);
}

function scanLegacyCodes(): Set<string> {
  const roots = ['apps/hub-server/src', 'apps/hub-contracts/src'];
  const files = roots.flatMap((root) => sourceFiles(join(REPO_ROOT, root)));
  const patterns = [
    /new\s+ApplicationError\(\s*['"][^'"]+['"]\s*,\s*['"]([A-Z][A-Z0-9_]{3,})['"]/g,
    /\bappError\(\s*['"][^'"]+['"]\s*,\s*['"]([A-Z][A-Z0-9_]{3,})['"]/g,
    /\bfail\(\s*reply\s*,\s*LEGACY_CODE_MAP\.([A-Z][A-Z0-9_]{3,})/g,
    /reply\.code\(\s*\d+\s*\)\.send\(\s*\{\s*code\s*:\s*['"]([A-Z][A-Z0-9_]{3,})['"]/g,
  ];
  const codes = new Set<string>();
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    for (const pattern of patterns) collectMatches(source, pattern, codes);
  }
  const workflow = readFileSync(
    join(REPO_ROOT, 'apps/hub-contracts/src/domains/reimburse/workflow.ts'),
    'utf8',
  );
  // Two workflow rules return their legacy code from a ternary rather than a return statement.
  collectMatches(workflow, /['"](REIMBURSE_[A-Z0-9_]+)['"]/g, codes);
  return codes;
}

describe('HTTP error code contract', () => {
  test('maps exactly the 61 legacy codes found in server and contracts sources', () => {
    expect(Object.keys(LEGACY_CODE_MAP)).toHaveLength(61);
    expect([...scanLegacyCodes()].sort()).toEqual(Object.keys(LEGACY_CODE_MAP).sort());
  });

  test('keeps the closed code set and default status table complete', () => {
    expect(ERROR_CODES).toHaveLength(15);
    expect(new Set(ERROR_CODES).size).toBe(15);
    expect(Object.keys(ERROR_STATUS).sort()).toEqual([...ERROR_CODES].sort());
    for (const mapped of Object.values(LEGACY_CODE_MAP)) {
      expect(isErrorCode(mapped)).toBe(true);
    }
    expect(new Set(Object.values(LEGACY_CODE_MAP))).toEqual(
      new Set(ERROR_CODES.filter((code) => code !== 'INTERNAL')),
    );
    expect(isErrorCode('NOT_A_CODE')).toBe(false);
    expect(isErrorCode(null)).toBe(false);
  });
});
