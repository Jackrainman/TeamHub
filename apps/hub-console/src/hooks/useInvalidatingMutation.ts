import { useMutation, useQueryClient, type UseMutationOptions } from '@tanstack/react-query';
import type { QueryKey } from '@tanstack/react-query';

interface UseInvalidatingMutationOptions<TData, TVariables>
  extends Omit<UseMutationOptions<TData, Error, TVariables>, 'onSuccess'> {
  invalidateKeys: QueryKey[];
  onSuccess?: (data: TData, variables: TVariables) => void;
}

export function useInvalidatingMutation<TData, TVariables>(
  opts: UseInvalidatingMutationOptions<TData, TVariables>,
) {
  const queryClient = useQueryClient();
  const { invalidateKeys, onSuccess, ...rest } = opts;
  return useMutation<TData, Error, TVariables>({
    ...rest,
    onSuccess: (data, variables) => {
      for (const key of invalidateKeys) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
      onSuccess?.(data, variables);
    },
  });
}
