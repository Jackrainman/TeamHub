import {
  CONTRACT_FIXTURE_TIME,
  apiContractFixtures,
} from '@teamhub/hub-contracts';
import { version as consoleVersion } from '../../../package.json';
import {
  OverviewSnapshotSchema,
  type OverviewSnapshot,
} from '../schemas/system';

const adapters = apiContractFixtures.adapters.adapters;

export const mockOverviewSnapshot: OverviewSnapshot =
  OverviewSnapshotSchema.parse({
    health: {
      status: 'ok',
      service: 'teamhub-hub-server',
      checkedAt: CONTRACT_FIXTURE_TIME,
    },
    system: {
      service: 'teamhub-hub-server',
      version: consoleVersion,
      mode: 'mock-first',
      generatedAt: CONTRACT_FIXTURE_TIME,
      uptimeSeconds: 824,
      adapters: {
        total: adapters.length,
        enabled: adapters.filter((adapter) => adapter.status === 'enabled')
          .length,
        degraded: adapters.filter((adapter) => adapter.status === 'degraded')
          .length,
        unconfigured: adapters.filter(
          (adapter) => adapter.status === 'unconfigured',
        ).length,
      },
    },
    adapters: apiContractFixtures.adapters,
    events: apiContractFixtures.events,
    bridgeMembers: apiContractFixtures.bridgeMembers,
    gitRepos: apiContractFixtures.gitRepos,
    artifacts: apiContractFixtures.artifacts,
  });
