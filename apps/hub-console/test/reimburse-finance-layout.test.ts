import { describe, expect, it } from 'vitest';
import {
  FINANCE_LAYOUT_STORAGE_KEY,
  normalizeFinanceLayout,
  readFinanceLayout,
  writeFinanceLayout,
} from '../src/features/reimburse/finance-layout';

describe('reimburse finance layout preference', () => {
  it('defaults to the batch workspace for missing or unknown values', () => {
    expect(normalizeFinanceLayout(null)).toBe('b');
    expect(normalizeFinanceLayout('')).toBe('b');
    expect(normalizeFinanceLayout('A')).toBe('b');
    expect(normalizeFinanceLayout('unknown')).toBe('b');
  });

  it('accepts all three permanent layouts', () => {
    expect(normalizeFinanceLayout('a')).toBe('a');
    expect(normalizeFinanceLayout('b')).toBe('b');
    expect(normalizeFinanceLayout('c')).toBe('c');
  });

  it('reads and writes the dedicated localStorage key', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
    };
    expect(readFinanceLayout(storage)).toBe('b');
    writeFinanceLayout(storage, 'a');
    expect(values.get(FINANCE_LAYOUT_STORAGE_KEY)).toBe('a');
    expect(readFinanceLayout(storage)).toBe('a');
    writeFinanceLayout(storage, 'c');
    expect(readFinanceLayout(storage)).toBe('c');
  });

  it('falls back to the default when storage is unavailable', () => {
    const storage = {
      getItem: () => { throw new Error('storage disabled'); },
      setItem: () => { throw new Error('storage disabled'); },
    };
    expect(readFinanceLayout(storage)).toBe('b');
    expect(() => writeFinanceLayout(storage, 'a')).not.toThrow();
  });
});
