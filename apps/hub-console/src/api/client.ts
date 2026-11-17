import type { HttpContext } from './http';
import { normalizeBaseUrl } from './http';
import { createPmSegment, type PmSegment } from '../features/pm/api';
import { createIdentitySegment, type IdentitySegment } from '../features/identity/api';
import { createSystemSegment, type SystemSegment } from '../features/system/api';
import { createSearchSegment, type SearchSegment } from '../features/search/api';
import { createReimburseSegment, type ReimburseSegment } from '../features/reimburse/api';

export interface HubApiClientOptions {
  baseUrl?: string;
  fetcher?: typeof fetch;
  writeToken?: string;
}
export type HubApiClient = PmSegment & IdentitySegment & SystemSegment & SearchSegment & ReimburseSegment;
export function createHubApiClient(options: HubApiClientOptions = {}): HubApiClient {
  const ctx: HttpContext = {
    baseUrl: normalizeBaseUrl(options.baseUrl),
    fetcher: options.fetcher ?? fetch,
    writeToken: options.writeToken?.trim() || undefined,
  };
  return {
    ...createReimburseSegment(ctx),
    ...createPmSegment(ctx),
    ...createIdentitySegment(ctx),
    ...createSystemSegment(ctx),
    ...createSearchSegment(ctx),
  };
}
