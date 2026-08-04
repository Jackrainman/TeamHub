import type { HttpContext } from './http';
import { normalizeBaseUrl } from './http';
import { createSystemPmSegment, type SystemPmSegment } from './segments/system-pm';
import { createScheduleSegment, type ScheduleSegment } from './segments/schedule';
import { createMembersSegment, type MembersSegment } from './segments/members';
import { createDomainSegment, type DomainSegment } from './segments/domain';
import { createReimburseSegment, type ReimburseSegment } from './segments/reimburse';

export interface HubApiClientOptions {
  baseUrl?: string;
  fetcher?: typeof fetch;
  writeToken?: string;
}

export type HubApiClient = SystemPmSegment &
  ScheduleSegment &
  MembersSegment &
  DomainSegment &
  ReimburseSegment;

export function createHubApiClient(options: HubApiClientOptions = {}): HubApiClient {
  const ctx: HttpContext = {
    baseUrl: normalizeBaseUrl(options.baseUrl),
    fetcher: options.fetcher ?? fetch,
    writeToken: options.writeToken?.trim() || undefined,
  };
  return {
    ...createSystemPmSegment(ctx),
    ...createScheduleSegment(ctx),
    ...createMembersSegment(ctx),
    ...createDomainSegment(ctx),
    ...createReimburseSegment(ctx),
  };
}
