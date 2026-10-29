import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../api/queryKeys';
import type { SearchSegment } from './api';

export function useGlobalSearch(client: SearchSegment, query: string, enabled: boolean) {
  return useQuery({ queryKey: queryKeys.globalSearch(query), queryFn: () => client.globalSearch(query), enabled: enabled && query.length > 0, retry: false });
}
