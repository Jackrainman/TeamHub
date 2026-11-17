import { describe, expect, test } from 'vitest';
import type { FastifyReply } from 'fastify';
import { LEGACY_CODE_MAP, type ErrorCode, type LegacyErrorCode } from '@teamhub/hub-contracts';
import { appError, type ApplicationErrorKind } from '../src/application/application-error';
import { sendApplicationError } from '../src/http/helpers';
import { fail } from '../src/lib/fail';

type ErrorBody = { code: string; detail: string; fields?: Record<string, unknown> };

function fakeReply() {
  const captured: { status?: number; body?: ErrorBody } = {};
  const reply = {
    code(status: number) {
      captured.status = status;
      return reply;
    },
    send(body: ErrorBody) {
      captured.body = body;
      return reply;
    },
  };
  return { reply: reply as unknown as FastifyReply, captured };
}

const cases: { code: ErrorCode; legacy: LegacyErrorCode; kind: ApplicationErrorKind; status: number }[] = [
  { code: 'VALIDATION_FAILED', legacy: 'CHECKLIST_ITEM_INVALID', kind: 'validation', status: 400 },
  { code: 'CONFLICT', legacy: 'REIMBURSE_INVOICE_DUPLICATE', kind: 'conflict', status: 409 },
  { code: 'NOT_FOUND', legacy: 'ARTIFACT_NOT_FOUND', kind: 'not_found', status: 404 },
  { code: 'FORBIDDEN', legacy: 'CHECKLIST_WAIVE_FORBIDDEN', kind: 'forbidden', status: 403 },
  { code: 'REQUIREMENT_MISSING', legacy: 'REIMBURSE_RETURN_REASON_REQUIRED', kind: 'validation', status: 400 },
  { code: 'UNAUTHENTICATED', legacy: 'REIMBURSE_LOGIN_REQUIRED', kind: 'unauthorized', status: 401 },
  { code: 'LOCKED', legacy: 'REIMBURSE_ENTRY_LOCKED', kind: 'conflict', status: 409 },
  { code: 'STORAGE_UNCONFIGURED', legacy: 'ARTIFACT_STORAGE_UNCONFIGURED', kind: 'validation', status: 400 },
  { code: 'FILE_TOO_LARGE', legacy: 'REIMBURSE_EVIDENCE_LIMIT', kind: 'validation', status: 400 },
  { code: 'FILE_MISSING', legacy: 'REIMBURSE_EVIDENCE_FILE_MISSING', kind: 'not_found', status: 404 },
  { code: 'EXPORT_EMPTY', legacy: 'REIMBURSE_EXPORT_EMPTY', kind: 'validation', status: 400 },
  { code: 'QUANTITY_EXCEEDED', legacy: 'REIMBURSE_STOCK_QUANTITY_EXCEEDED', kind: 'validation', status: 400 },
  { code: 'ENTRY_NOT_GOODS', legacy: 'REIMBURSE_ENTRY_NOT_GOODS', kind: 'validation', status: 400 },
];

describe('HTTP error contract', () => {
  test.each(cases)('$legacy maps to $code without changing $status', ({ code, legacy, kind, status }) => {
    const { reply, captured } = fakeReply();
    expect(sendApplicationError(appError(kind, legacy, '业务详情'), reply)).toBe(true);
    expect(captured.status).toBe(status);
    expect(captured.body).toEqual({ code, detail: '业务详情', fields: { reason: legacy } });
  });

  test('SETUP_REQUIRED retains the PIN gate 403 and legacy reason', () => {
    const { reply, captured } = fakeReply();
    fail(reply, LEGACY_CODE_MAP.PIN_SETUP_REQUIRED, {
      status: 403,
      detail: '首次登录须先设置 PIN',
      fields: { reason: 'PIN_SETUP_REQUIRED' },
    });
    expect(captured.status).toBe(403);
    expect(captured.body).toEqual({
      code: 'SETUP_REQUIRED',
      detail: '首次登录须先设置 PIN',
      fields: { reason: 'PIN_SETUP_REQUIRED' },
    });
  });

  test('fail uses ERROR_STATUS by default and preserves explicit status overrides', () => {
    const defaults = fakeReply();
    fail(defaults.reply, 'FILE_TOO_LARGE', { detail: 'too large' });
    expect(defaults.captured.status).toBe(413);
    expect(defaults.captured.body).toEqual({ code: 'FILE_TOO_LARGE', detail: 'too large' });

    const override = fakeReply();
    fail(override.reply, 'FILE_TOO_LARGE', {
      status: 400,
      detail: 'legacy status',
      fields: { reason: 'REIMBURSE_EVIDENCE_LIMIT' },
    });
    expect(override.captured.status).toBe(400);
    expect(override.captured.body?.fields).toEqual({ reason: 'REIMBURSE_EVIDENCE_LIMIT' });
  });
});
