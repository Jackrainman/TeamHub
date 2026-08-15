export type ApplicationErrorKind =
  | 'validation'
  | 'not_found'
  | 'forbidden'
  | 'conflict';

/** HTTP 无关的统一应用错误；presentation 只按 kind 映射状态码，按 code 给客户端稳定分支。 */
export class ApplicationError extends Error {
  constructor(
    readonly kind: ApplicationErrorKind,
    readonly code: string,
    readonly detail: string,
    readonly fields?: Readonly<Record<string, unknown>>,
  ) {
    super(detail);
    this.name = 'ApplicationError';
  }
}

export function isApplicationError(error: unknown): error is ApplicationError {
  return error instanceof ApplicationError;
}
