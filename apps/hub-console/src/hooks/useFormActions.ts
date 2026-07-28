import type { TranslationKey } from '../i18n';
import { humanizeFormError } from '../utils';

export interface FormActionsPropsInput {
  submitLabel: string;
  submittingLabel: string;
  valid: boolean;
  writeLocked?: boolean;
  lockedHint?: string | null;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  errorFallbackKey: TranslationKey;
  successMessage?: string | null;
}

export function formActionsProps(
  mutation: { isPending: boolean; error: unknown },
  opts: FormActionsPropsInput,
) {
  return {
    submitLabel: opts.submitLabel,
    submittingLabel: opts.submittingLabel,
    submitting: mutation.isPending,
    disabled: !opts.valid || opts.writeLocked,
    error: mutation.error
      ? humanizeFormError(mutation.error, opts.t, opts.errorFallbackKey)
      : null,
    success: opts.successMessage ?? null,
    lockedHint: opts.writeLocked ? (opts.lockedHint ?? null) : null,
  };
}
