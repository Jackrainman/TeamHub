import type { FastifyInstance } from 'fastify';
import {
  AgentBackendCapabilitiesResponseSchema,
  AgentBackendHealthResponseSchema,
  AgentBackendInvokeRequestSchema,
  AgentBackendInvokeResponseSchema,
  AgentBackendsResponseSchema,
  BotChannelsResponseSchema,
  BridgeMembersResponseSchema,
  DataSourcesResponseSchema,
  GitReposResponseSchema,
  HealthResponseSchema,
  HubEventsResponseSchema,
  SystemStatusResponseSchema,
  apiContractFixtures,
} from '../contracts.js';
import type { DeploymentInfo } from '@teamhub/hub-contracts';
import {
  listMockAgentBackends,
  listMockBotChannels,
  listMockDataSources,
} from '../mock-integrations.js';
import {
  getMockAgentBackendCapabilities,
  getMockAgentBackendHealth,
  invokeMockAgentBackend,
  isMockAgentBackendId,
} from '../mock-agent-backends.js';
import { buildHealthResponse, buildSystemStatusResponse } from '../status.js';
import { parseBody } from './helpers.js';

export function registerSystemRoutes(
  app: FastifyInstance,
  deployment?: DeploymentInfo,
): void {
  app.get('/health', async () => {
    return HealthResponseSchema.parse(buildHealthResponse());
  });

  app.get('/api/system/status', async () => {
    const agentBackends = listMockAgentBackends();
    return SystemStatusResponseSchema.parse(
      buildSystemStatusResponse(agentBackends, deployment),
    );
  });

  app.get('/api/bot-channels', async () => {
    return BotChannelsResponseSchema.parse({
      botChannels: listMockBotChannels(),
    });
  });

  app.get('/api/agent-backends', async () => {
    return AgentBackendsResponseSchema.parse({
      agentBackends: listMockAgentBackends(),
    });
  });

  app.get('/api/data-sources', async () => {
    return DataSourcesResponseSchema.parse({
      dataSources: listMockDataSources(),
    });
  });

  app.get('/api/agent-backends/:backendId/health', async (request, reply) => {
    const { backendId } = request.params as { backendId: string };
    if (!isMockAgentBackendId(backendId)) {
      void reply.code(404).send({ detail: 'Agent backend not found' });
      return;
    }
    return AgentBackendHealthResponseSchema.parse(
      getMockAgentBackendHealth(backendId),
    );
  });

  app.get(
    '/api/agent-backends/:backendId/capabilities',
    async (request, reply) => {
      const { backendId } = request.params as { backendId: string };
      if (!isMockAgentBackendId(backendId)) {
        void reply.code(404).send({ detail: 'Agent backend not found' });
        return;
      }
      return AgentBackendCapabilitiesResponseSchema.parse(
        getMockAgentBackendCapabilities(backendId),
      );
    },
  );

  app.post('/api/agent-backends/:backendId/invoke', async (request, reply) => {
    const { backendId } = request.params as { backendId: string };
    if (!isMockAgentBackendId(backendId)) {
      void reply.code(404).send({ detail: 'Agent backend not found' });
      return;
    }
    const data = parseBody(AgentBackendInvokeRequestSchema, request, reply);
    if (!data) return;
    return AgentBackendInvokeResponseSchema.parse(
      invokeMockAgentBackend(backendId, data),
    );
  });

  app.get('/api/events', async () => {
    return HubEventsResponseSchema.parse(apiContractFixtures.events);
  });

  app.get('/api/bridge/members', async () => {
    return BridgeMembersResponseSchema.parse(apiContractFixtures.bridgeMembers);
  });

  app.get('/api/git/repos', async () => {
    return GitReposResponseSchema.parse(apiContractFixtures.gitRepos);
  });
}
