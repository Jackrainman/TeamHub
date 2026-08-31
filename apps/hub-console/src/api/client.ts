import type { HttpContext } from './http';
import { normalizeBaseUrl } from './http';
import { createSystemPmSegment, type SystemPmSegment } from './segments/system-pm';
import {
  createScheduleSegment,
  type ScheduleSegment,
} from '../features/schedule/api';
import { createMembersSegment, type MembersSegment } from './segments/members';
import {
  createReimburseSegment,
  type ReimburseSegment,
} from '../features/reimburse/api';
import {
  createChecklistSegment,
  type ChecklistSegment,
} from '../features/checklist/api';
import {
  createBaselineSegment,
  type BaselineSegment,
} from '../features/baseline/api';
import {
  createInventorySegment,
  type InventorySegment,
} from '../features/inv/api';
import {
  createArchiveSegment,
  type ArchiveSegment,
} from '../features/archive/api';
import {
  createKnowledgeSegment,
  type KnowledgeSegment,
} from '../features/kb/api';

export interface HubApiClientOptions {
  baseUrl?: string;
  fetcher?: typeof fetch;
  writeToken?: string;
}

export type HubApiClient = SystemPmSegment &
  ScheduleSegment &
  MembersSegment &
  ReimburseSegment &
  ChecklistSegment &
  BaselineSegment &
  InventorySegment &
  ArchiveSegment &
  KnowledgeSegment;

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
    ...createReimburseSegment(ctx),
    ...createChecklistSegment(ctx),
    ...createBaselineSegment(ctx),
    ...createInventorySegment(ctx),
    ...createArchiveSegment(ctx),
    ...createKnowledgeSegment(ctx),
  };
}
