import { describe, expect, test } from 'vitest';
import { z } from 'zod';
import { fetchJson, HubApiError } from '../src/api/http';
import { apiErrorMessage } from '../src/i18n/api-error';

function errorResponse(status: number, body: unknown): typeof fetch {
  return (async () => ({
    ok: false,
    status,
    json: async () => body,
  })) as unknown as typeof fetch;
}

describe('console HTTP error contract', () => {
  test('parses a closed code, detail and fields while preserving message format', async () => {
    let thrown: unknown;
    try {
      await fetchJson('/api/test', z.unknown(), errorResponse(409, {
        code: 'CONFLICT',
        detail: '发票重复',
        fields: { reason: 'REIMBURSE_INVOICE_DUPLICATE' },
      }));
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(HubApiError);
    expect(thrown).toMatchObject({
      status: 409,
      code: 'CONFLICT',
      detail: '发票重复',
      fields: { reason: 'REIMBURSE_INVOICE_DUPLICATE' },
      message: '409: 发票重复',
    });
  });

  test('degrades missing or invalid codes to null and keeps the legacy URL fallback', async () => {
    for (const body of [{ detail: 'old server' }, { code: 'OLD_CODE' }]) {
      let thrown: unknown;
      try {
        await fetchJson('/api/legacy', z.unknown(), errorResponse(400, body));
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(HubApiError);
      expect((thrown as HubApiError).code).toBeNull();
    }

    const noBody = (async () => ({
      ok: false,
      status: 503,
      json: async () => { throw new Error('not json'); },
    })) as unknown as typeof fetch;
    await expect(fetchJson('/api/legacy', z.unknown(), noBody)).rejects.toMatchObject({
      code: null,
      detail: null,
      message: 'Hub API 503: /api/legacy',
    });
  });

  test('selects Chinese and English copy by code and falls back to message', () => {
    const conflict = new HubApiError(409, 'CONFLICT', '发票号已录入，勿重复报销');
    expect(apiErrorMessage(conflict, 'zh')).toBe('数据已被他人修改或与已有记录冲突，请刷新后重试。');
    expect(apiErrorMessage(conflict, 'en')).toBe('This conflicts with data that already exists or was just changed. Refresh and try again.');
    expect(apiErrorMessage(new HubApiError(400, null, '旧服务详情'), 'en')).toBe('400: 旧服务详情');
  });
});
