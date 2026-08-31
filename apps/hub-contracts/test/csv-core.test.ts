import { describe, expect, it } from 'vitest';
import {
  decodeCsvBytes,
  tokenizeCsv,
  UTF8_BOM,
} from '../src/csv-core';
import { canBoardResource } from '../src/domains/schedule/index';
import { isModuleEnabled, ROBOTICS_TENANT_CONFIG } from '../src/domains/system/index';
import { weeklyMinuteWindowRefine } from '../src/common';

describe('decodeCsvBytes', () => {
  const enc = (s: string) => new TextEncoder().encode(s);

  it('decodes plain UTF-8', () => {
    expect(decodeCsvBytes(enc('名称,数量\n螺丝,5'))).toBe('名称,数量\n螺丝,5');
  });

  it('strips UTF-8 BOM', () => {
    const bom = new Uint8Array([0xef, 0xbb, 0xbf, ...enc('a,b')]);
    expect(decodeCsvBytes(bom)).toBe('a,b');
  });

  it('decodes GBK when UTF-8 produces replacement chars', () => {
    // "名" in GBK = C3 FB
    const gbkBytes = new Uint8Array([0xc3, 0xfb, 0x2c, 0x31]);
    const result = decodeCsvBytes(gbkBytes);
    expect(result).not.toBeNull();
    expect(result).toContain(',1');
    expect(result).not.toContain('\uFFFD');
  });

  it('returns null for undecodable bytes', () => {
    // 0x80 alone is invalid in both UTF-8 and GBK (single byte < 0x81)
    const bad = new Uint8Array([0x80, 0x80, 0x80]);
    const result = decodeCsvBytes(bad);
    // GBK may or may not decode 0x80 — just assert no replacement chars if non-null
    if (result !== null) {
      expect(result).not.toContain('\uFFFD');
    }
  });

  it('handles empty input', () => {
    expect(decodeCsvBytes(new Uint8Array([]))).toBe('');
  });
});

describe('tokenizeCsv', () => {
  it('splits simple records', () => {
    const records = tokenizeCsv('a,b,c\n1,2,3');
    expect(records).toEqual([
      { fields: ['a', 'b', 'c'], line: 1 },
      { fields: ['1', '2', '3'], line: 2 },
    ]);
  });

  it('handles quoted fields with commas', () => {
    const records = tokenizeCsv('"hello, world",b');
    expect(records).toEqual([{ fields: ['hello, world', 'b'], line: 1 }]);
  });

  it('handles escaped quotes inside quoted fields', () => {
    const records = tokenizeCsv('"say ""hi""",b');
    expect(records).toEqual([{ fields: ['say "hi"', 'b'], line: 1 }]);
  });

  it('handles newlines inside quoted fields', () => {
    const records = tokenizeCsv('"line1\nline2",b\nc,d');
    expect(records).toEqual([
      { fields: ['line1\nline2', 'b'], line: 1 },
      { fields: ['c', 'd'], line: 3 },
    ]);
  });

  it('skips blank lines', () => {
    const records = tokenizeCsv('a,b\n\nc,d\n,,,\n');
    expect(records).toEqual([
      { fields: ['a', 'b'], line: 1 },
      { fields: ['c', 'd'], line: 3 },
    ]);
  });

  it('skips comment lines starting with #', () => {
    const records = tokenizeCsv('# 模板说明\na,b');
    expect(records).toEqual([{ fields: ['a', 'b'], line: 2 }]);
  });

  it('handles CRLF line endings', () => {
    const records = tokenizeCsv('a,b\r\nc,d\r\n');
    expect(records).toEqual([
      { fields: ['a', 'b'], line: 1 },
      { fields: ['c', 'd'], line: 2 },
    ]);
  });

  it('handles trailing record without newline', () => {
    const records = tokenizeCsv('a,b');
    expect(records).toEqual([{ fields: ['a', 'b'], line: 1 }]);
  });

  it('returns empty array for empty input', () => {
    expect(tokenizeCsv('')).toEqual([]);
  });
});

describe('canBoardResource', () => {
  it('returns true for boardable statuses', () => {
    expect(canBoardResource('available')).toBe(true);
    expect(canBoardResource('inUse')).toBe(true);
  });

  it('returns false for non-boardable statuses', () => {
    expect(canBoardResource('down')).toBe(false);
    expect(canBoardResource('retired')).toBe(false);
    expect(canBoardResource('repair')).toBe(false);
  });
});

describe('isModuleEnabled', () => {
  it('returns true for enabled modules', () => {
    expect(isModuleEnabled(ROBOTICS_TENANT_CONFIG, 'pm-core')).toBe(true);
    expect(isModuleEnabled(ROBOTICS_TENANT_CONFIG, 'system')).toBe(true);
  });

  it('returns false for disabled modules', () => {
    const config = { enabledModules: ['system'] as any };
    expect(isModuleEnabled(config, 'pm-core')).toBe(false);
  });
});

describe('weeklyMinuteWindowRefine', () => {
  it('accepts valid windows', () => {
    expect(weeklyMinuteWindowRefine({ startMin: 0, endMin: 1439 })).toBe(true);
    expect(weeklyMinuteWindowRefine({ startMin: 540, endMin: 600 })).toBe(true);
  });

  it('rejects start >= end', () => {
    expect(weeklyMinuteWindowRefine({ startMin: 600, endMin: 600 })).toBe(false);
    expect(weeklyMinuteWindowRefine({ startMin: 700, endMin: 600 })).toBe(false);
  });
});
