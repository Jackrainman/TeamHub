import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import {
  AdapterCapabilitiesResponseSchema,
  AdaptersResponseSchema,
  AdapterHealthResponseSchema,
  AdapterInvokeRequestSchema,
  AdapterInvokeResponseSchema,
  ArtifactsResponseSchema,
  BridgeMembersResponseSchema,
  GitReposResponseSchema,
  HealthResponseSchema,
  HubEventsResponseSchema,
  SystemStatusResponseSchema,
  apiContractFixtures,
} from './contracts.js';
import { listMockAdapters } from './mock-adapters.js';
import {
  getMockAiAdapterCapabilities,
  getMockAiAdapterHealth,
  invokeMockAiAdapter,
  isMockAiAdapterId,
} from './mock-ai-adapters.js';
import {
  buildHealthResponse,
  buildSystemStatusResponse,
} from './status.js';
import { tryServeStaticConsole } from './static-console.js';

export interface BuildHubServerOptions {
  consoleDistDir?: string;
}

export function buildHubServer(options: BuildHubServerOptions = {}): FastifyInstance {
  const app = Fastify({ logger: false });

  app.get('/health', async () => {
    return HealthResponseSchema.parse(buildHealthResponse());
  });

  app.get('/api/system/status', async () => {
    const adapters = listMockAdapters();
    return SystemStatusResponseSchema.parse(
      buildSystemStatusResponse(adapters),
    );
  });

  app.get('/api/adapters', async () => {
    return AdaptersResponseSchema.parse({ adapters: listMockAdapters() });
  });

  app.get('/api/adapters/:adapterId/health', async (request, reply) => {
    const { adapterId } = request.params as { adapterId: string };
    if (!isMockAiAdapterId(adapterId)) {
      void reply.code(404).send({ detail: 'Adapter not found' });
      return;
    }
    return AdapterHealthResponseSchema.parse(getMockAiAdapterHealth(adapterId));
  });

  app.get('/api/adapters/:adapterId/capabilities', async (request, reply) => {
    const { adapterId } = request.params as { adapterId: string };
    if (!isMockAiAdapterId(adapterId)) {
      void reply.code(404).send({ detail: 'Adapter not found' });
      return;
    }
    return AdapterCapabilitiesResponseSchema.parse(
      getMockAiAdapterCapabilities(adapterId),
    );
  });

  app.post('/api/adapters/:adapterId/invoke', async (request, reply) => {
    const { adapterId } = request.params as { adapterId: string };
    if (!isMockAiAdapterId(adapterId)) {
      void reply.code(404).send({ detail: 'Adapter not found' });
      return;
    }
    const invokeRequest = AdapterInvokeRequestSchema.parse(request.body ?? {});
    return AdapterInvokeResponseSchema.parse(
      invokeMockAiAdapter(adapterId, invokeRequest),
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

  app.get('/api/artifacts', async () => {
    return ArtifactsResponseSchema.parse(apiContractFixtures.artifacts);
  });

  app.setNotFoundHandler(async (request, reply) => {
    if (await tryServeStaticConsole(request, reply, options.consoleDistDir)) {
      return;
    }

    void reply.code(404).send({ detail: 'Not found' });
  });

  return app;
}
