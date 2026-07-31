import type { JSX } from 'react';

interface QueryLike<T> {
  isLoading: boolean;
  error: unknown;
  data: T | undefined;
}

type QueryGuardResult<T> =
  | { guard: JSX.Element; data: null }
  | { guard: null; data: T };

export function useQueryGuard<T>(
  query: QueryLike<T>,
  loadingText: string,
  errorText: string,
): QueryGuardResult<T> {
  if (query.isLoading) {
    return {
      guard: (
        <div className="state-band" role="status" aria-live="polite">
          {loadingText}
        </div>
      ),
      data: null,
    };
  }
  if (query.error || !query.data) {
    return {
      guard: (
        <div className="state-band state-band-error" role="alert">
          {errorText}
        </div>
      ),
      data: null,
    };
  }
  return { guard: null, data: query.data };
}
