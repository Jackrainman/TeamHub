import { afterAll, describe, expect, test } from 'vitest';
import { buildHubServer } from '../src/server.js';
import {
  AdaptersResponseSchema,
  HealthResponseSchema,
  SystemStatusResponseSchema,
} from '../src/contracts.js';

const app = buildHubServer();

afterAll(async () => {
  await app.close();
});

describe('hub-server routes', () => {
  test('GET /health returns the health contract', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);
    const body = HealthResponseSchema.parse(response.json());
    expect(body.status).toBe('ok');
    expect(body.service).toBe('teamhub-hub-server');
  });

  test('GET /api/system/status summarizes mock adapters', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/system/status',
    });

    expect(response.statusCode).toBe(200);
    const body = SystemStatusResponseSchema.parse(response.json());
    expect(body.mode).toBe('mock-first');
    expect(body.adapters.total).toBeGreaterThanOrEqual(3);
    expect(body.adapters.unconfigured).toBeGreaterThan(0);
  });

  test('GET /api/adapters returns mock adapter descriptors', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/adapters',
    });

    expect(response.statusCode).toBe(200);
    const body = AdaptersResponseSchema.parse(response.json());
    expect(body.adapters.map((adapter) => adapter.id)).toEqual(
      expect.arrayContaining([
        'lark',
        'pf-skills',
        'hermes',
        'xiaolongxia',
        'claude-code',
        'git-forge',
        'artifact-store',
      ]),
    );
  });

  test('unknown routes return the standard error body', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/missing',
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ detail: 'Not found' });
  });
});
