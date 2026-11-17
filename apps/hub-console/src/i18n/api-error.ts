import { HubApiError } from '../api/http';
import { translate, type Lang } from './translations';

export function apiErrorMessage(error: unknown, lang: Lang): string {
  if (error instanceof HubApiError && error.code) {
    return translate(lang, `apiError.${error.code}`);
  }
  return error instanceof Error ? error.message : String(error);
}
