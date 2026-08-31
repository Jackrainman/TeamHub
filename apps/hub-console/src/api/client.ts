import type { HttpContext } from './http';
import { normalizeBaseUrl } from './http';
import { createPmSegment, type PmSegment } from '../features/pm/api';
import { createIdentitySegment, type IdentitySegment } from '../features/identity/api';
import { createSystemSegment, type SystemSegment } from '../features/system/api';
import { createSettingsSegment, type SettingsSegment } from '../features/settings/api';
import { createSearchSegment, type SearchSegment } from '../features/search/api';
import {
  createScheduleSegment,
  type ScheduleSegment,
} from '../features/schedule/api';
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

export type HubApiClient =
  PmSegment &
  IdentitySegment &
  SystemSegment &
  SettingsSegment &
  SearchSegment &
  ScheduleSegment &
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
    ...createScheduleSegment(ctx),
    ...createReimburseSegment(ctx),
    ...createChecklistSegment(ctx),
    ...createBaselineSegment(ctx),
    ...createInventorySegment(ctx),
    ...createArchiveSegment(ctx),
    ...createPmSegment(ctx),
    ...createIdentitySegment(ctx),
    ...createSystemSegment(ctx),
    ...createSettingsSegment(ctx),
    ...createSearchSegment(ctx),
    ...createKnowledgeSegment(ctx),
  };
}
