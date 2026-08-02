import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { QueryKey, UseMutationOptions } from '@tanstack/react-query';

type UseHubMutationOptions<TData, TVariables, TContext = unknown> =
  UseMutationOptions<TData, Error, TVariables, TContext> & {
    invalidateKeys: QueryKey[];
  };

export function useHubMutation<TData = unknown, TVariables = void, TContext = unknown>(
  opts: UseHubMutationOptions<TData, TVariables, TContext>,
) {
  const queryClient = useQueryClient();
  const { invalidateKeys, onSuccess, ...rest } = opts;
  return useMutation<TData, Error, TVariables, TContext>({
    ...rest,
    onSuccess: (data, variables, context, fnContext) => {
      for (const key of invalidateKeys) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
      onSuccess?.(data, variables, context, fnContext);
    },
  });
}
