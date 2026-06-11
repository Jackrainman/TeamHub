import {
  AdaptersResponseSchema,
  ArtifactsResponseSchema,
  BridgeMembersResponseSchema,
  DepGraphSchema,
  GitReposResponseSchema,
  HubEventsResponseSchema,
  type DepGraph,
} from '@teamhub/hub-contracts';
import { mockDepGraph } from './mock/dep-graph';
import { mockOverviewSnapshot } from './mock/overview';
import {
  HealthResponseSchema,
  OverviewSnapshotSchema,
  SystemStatusResponseSchema,
  type OverviewSnapshot,
} from './schemas/system';

type FetchLike = typeof fetch;

export interface HubApiClientOptions {
  baseUrl?: string;
  fetcher?: FetchLike;
}

export interface HubApiClient {
  mode: 'mock' | 'real';
  getOverview(): Promise<OverviewSnapshot>;
  getDepGraph(): Promise<DepGraph>;
}

export function createHubApiClient(options: HubApiClientOptions = {}): HubApiClient {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  if (baseUrl === null) {
    return {
      mode: 'mock',
      async getOverview() {
        return OverviewSnapshotSchema.parse(mockOverviewSnapshot);
      },
      async getDepGraph() {
        return DepGraphSchema.parse(mockDepGraph);
      },
    };
  }

  const fetcher = options.fetcher ?? fetch;
  return {
    mode: 'real',
    async getOverview() {
      const [
        health,
        system,
        adapters,
        events,
        bridgeMembers,
        gitRepos,
        artifacts,
      ] = await Promise.all([
        fetchJson(`${baseUrl}/health`, HealthResponseSchema, fetcher),
        fetchJson(
          `${baseUrl}/api/system/status`,
          SystemStatusResponseSchema,
          fetcher,
        ),
        fetchJson(`${baseUrl}/api/adapters`, AdaptersResponseSchema, fetcher),
        fetchJson(`${baseUrl}/api/events`, HubEventsResponseSchema, fetcher),
        fetchJson(
          `${baseUrl}/api/bridge/members`,
          BridgeMembersResponseSchema,
          fetcher,
        ),
        fetchJson(`${baseUrl}/api/git/repos`, GitReposResponseSchema, fetcher),
        fetchJson(`${baseUrl}/api/artifacts`, ArtifactsResponseSchema, fetcher),
      ]);

      return OverviewSnapshotSchema.parse({
        health,
        system,
        adapters,
        events,
        bridgeMembers,
        gitRepos,
        artifacts,
      });
    },
    async getDepGraph() {
      return fetchJson(`${baseUrl}/api/dep-graph`, DepGraphSchema, fetcher);
    },
  };
}

function normalizeBaseUrl(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed === '/') {
    return '';
  }
  return trimmed.replace(/\/+$/, '');
}

async function fetchJson<T>(
  url: string,
  schema: { parse(value: unknown): T },
  fetcher: FetchLike,
): Promise<T> {
  const response = await fetcher(url);
  if (!response.ok) {
    throw new Error(`Hub API ${response.status}: ${url}`);
  }
  return schema.parse(await response.json());
}
