import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import {
  AdaptersResponseSchema,
  HealthResponseSchema,
  SystemStatusResponseSchema,
} from './contracts.js';
import { listMockAdapters } from './mock-adapters.js';
import {
  buildHealthResponse,
  buildSystemStatusResponse,
} from './status.js';

export function buildHubServer(): FastifyInstance {
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

  app.setNotFoundHandler((_request, reply) => {
    void reply.code(404).send({ detail: 'Not found' });
  });

  return app;
}
