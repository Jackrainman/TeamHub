import { afterAll, describe, expect, test } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildHubServer } from '../src/server.js';
import {
  AdapterCapabilitiesResponseSchema,
  AdaptersResponseSchema,
  AdapterHealthResponseSchema,
  AdapterInvokeResponseSchema,
  ArtifactsResponseSchema,
  BridgeMembersResponseSchema,
  GitReposResponseSchema,
  HealthResponseSchema,
  HubEventsResponseSchema,
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

  test('GET /api/adapters/:id/health returns mock health for AI adapters', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/adapters/hermes/health',
    });

    expect(response.statusCode).toBe(200);
    const body = AdapterHealthResponseSchema.parse(response.json());
    expect(body.adapterId).toBe('hermes');
    expect(body.status).toBe('unconfigured');
    expect(body.detail).toContain('mock adapter');
  });

  test('GET /api/adapters/:id/capabilities returns mock capabilities', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/adapters/claude-code/capabilities',
    });

    expect(response.statusCode).toBe(200);
    const body = AdapterCapabilitiesResponseSchema.parse(response.json());
    expect(body.adapterId).toBe('claude-code');
    expect(body.mode).toBe('mock');
    expect(body.capabilities).toEqual(
      expect.arrayContaining(['skill.invoke.stub']),
    );
  });

  test('POST /api/adapters/:id/invoke returns a mock invocation response', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/adapters/xiaolongxia/invoke',
      payload: {
        correlationId: 'corr-adapter-001',
        input: {
          symptom: 'auto aim drifts',
        },
      },
    });

    expect(response.statusCode).toBe(200);
    const body = AdapterInvokeResponseSchema.parse(response.json());
    expect(body).toMatchObject({
      adapterId: 'xiaolongxia',
      mode: 'mock',
      status: 'accepted',
      correlationId: 'corr-adapter-001',
    });
    expect(body.output.message).toContain('mock adapter');
    expect(body.output.inputEcho).toMatchObject({
      symptom: 'auto aim drifts',
    });
  });

  test('mock adapter endpoints reject unsupported adapters', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/adapters/lark/health',
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ detail: 'Adapter not found' });
  });

  test('GET /api/events returns mock-first event fixtures', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/events',
    });

    expect(response.statusCode).toBe(200);
    const body = HubEventsResponseSchema.parse(response.json());
    expect(body.events.length).toBeGreaterThan(0);
  });

  test('GET /api/bridge/members returns mock-first bridge fixtures', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/bridge/members',
    });

    expect(response.statusCode).toBe(200);
    const body = BridgeMembersResponseSchema.parse(response.json());
    expect(body.members.length).toBeGreaterThan(0);
  });

  test('GET /api/git/repos returns mock-first repo fixtures', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/git/repos',
    });

    expect(response.statusCode).toBe(200);
    const body = GitReposResponseSchema.parse(response.json());
    expect(body.repos.length).toBeGreaterThan(0);
  });

  test('GET /api/artifacts returns the snapshot artifact version log', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/artifacts',
    });

    expect(response.statusCode).toBe(200);
    const body = ArtifactsResponseSchema.parse(response.json());
    expect(body.artifacts.length).toBeGreaterThan(0);
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

describe('hub-server static console', () => {
  test('serves built console assets when a dist directory is configured', async () => {
    const consoleDistDir = await mkdtemp(path.join(tmpdir(), 'teamhub-console-'));
    await mkdir(path.join(consoleDistDir, 'assets'));
    await writeFile(
      path.join(consoleDistDir, 'index.html'),
      '<!doctype html><div id="root"></div>',
    );
    await writeFile(
      path.join(consoleDistDir, 'assets', 'index.js'),
      'console.log("teamhub");',
    );

    const staticApp = buildHubServer({ consoleDistDir });
    try {
      const root = await staticApp.inject({ method: 'GET', url: '/' });
      expect(root.statusCode).toBe(200);
      expect(root.headers['content-type']).toContain('text/html');
      expect(root.body).toContain('id="root"');

      const asset = await staticApp.inject({
        method: 'GET',
        url: '/assets/index.js',
      });
      expect(asset.statusCode).toBe(200);
      expect(asset.headers['cache-control']).toContain('immutable');
      expect(asset.body).toContain('teamhub');

      const spaFallback = await staticApp.inject({
        method: 'GET',
        url: '/bridge',
      });
      expect(spaFallback.statusCode).toBe(200);
      expect(spaFallback.body).toContain('id="root"');

      const missingApi = await staticApp.inject({
        method: 'GET',
        url: '/api/missing',
      });
      expect(missingApi.statusCode).toBe(404);
      expect(missingApi.json()).toEqual({ detail: 'Not found' });
    } finally {
      await staticApp.close();
      await rm(consoleDistDir, { force: true, recursive: true });
    }
  });
});
