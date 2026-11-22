import { describe, expect, it } from 'vitest';
import { shouldPollReimburseImports } from '../src/features/reimburse/hooks';

describe('reimburse import polling', () => {
  const now = Date.parse('2026-01-01T00:05:00.000Z');
  const createdAt = '2026-01-01T00:00:00.000Z';

  it('polls both queued and parsing jobs', () => {
    expect(shouldPollReimburseImports([{ status: 'queued', createdAt }], now)).toBe(true);
    expect(shouldPollReimburseImports([{ status: 'parsing', createdAt }], now)).toBe(true);
  });

  it('stops for terminal jobs and stale active jobs', () => {
    expect(shouldPollReimburseImports([{ status: 'ready', createdAt }], now)).toBe(false);
    expect(shouldPollReimburseImports([{ status: 'queued', createdAt: '2025-12-31T23:00:00.000Z' }], now)).toBe(false);
  });
});
