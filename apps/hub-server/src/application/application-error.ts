import {
  LEGACY_CODE_MAP,
  type ErrorCode,
  type LegacyErrorCode,
} from '@teamhub/hub-contracts';

export type ApplicationErrorKind =
  | 'validation'
  | 'unauthorized'
  | 'not_found'
  | 'forbidden'
  | 'conflict';

/** HTTP 无关的统一应用错误；presentation 只按 kind 映射状态码，按 code 给客户端稳定分支。 */
export class ApplicationError extends Error {
  constructor(
    readonly kind: ApplicationErrorKind,
    readonly code: ErrorCode,
    readonly detail: string,
    readonly fields?: Readonly<Record<string, unknown>>,
  ) {
    super(detail);
    this.name = 'ApplicationError';
  }
}

/** Business rules keep their precise legacy code; HTTP responses also retain it as fields.reason. */
export function appError(
  kind: ApplicationErrorKind,
  legacyCode: LegacyErrorCode,
  detail: string,
  fields?: Readonly<Record<string, unknown>>,
): ApplicationError {
  return new ApplicationError(kind, LEGACY_CODE_MAP[legacyCode], detail, {
    ...fields,
    reason: legacyCode,
  });
}

export function isApplicationError(error: unknown): error is ApplicationError {
  return error instanceof ApplicationError;
}
