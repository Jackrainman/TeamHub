import { afterAll, describe, expect, test } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildHubServer } from '../src/server.js';
import {
  AgentBackendCapabilitiesResponseSchema,
  AgentBackendHealthResponseSchema,
  AgentBackendInvokeResponseSchema,
  AgentBackendsResponseSchema,
  ArtifactsResponseSchema,
  BotChannelsResponseSchema,
  BridgeMembersResponseSchema,
  DataSourcesResponseSchema,
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

  test('GET /api/system/status summarizes mock agent backends', async () => {
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

  test('GET /api/bot-channels returns mock bot channels', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/bot-channels',
    });

    expect(response.statusCode).toBe(200);
    const body = BotChannelsResponseSchema.parse(response.json());
    expect(body.botChannels.map((channel) => channel.id)).toEqual(
      expect.arrayContaining(['feishu', 'wechat', 'qq']),
    );
  });

  test('GET /api/agent-backends returns mock agent backends (no xiaolongxia/pf-skills)', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/agent-backends',
    });

    expect(response.statusCode).toBe(200);
    const body = AgentBackendsResponseSchema.parse(response.json());
    const ids = body.agentBackends.map((backend) => backend.id);
    expect(ids).toEqual(
      expect.arrayContaining(['hermes', 'openclaw', 'claude-code']),
    );
    expect(ids).not.toContain('xiaolongxia');
    expect(ids).not.toContain('pf-skills');
  });

  test('GET /api/data-sources returns mock data sources', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/data-sources',
    });

    expect(response.statusCode).toBe(200);
    const body = DataSourcesResponseSchema.parse(response.json());
    expect(body.dataSources.map((source) => source.id)).toEqual(
      expect.arrayContaining(['git-forge', 'artifact-store']),
    );
  });

  test('GET /api/agent-backends/:id/health returns mock health', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/agent-backends/hermes/health',
    });

    expect(response.statusCode).toBe(200);
    const body = AgentBackendHealthResponseSchema.parse(response.json());
    expect(body.backendId).toBe('hermes');
    expect(body.status).toBe('unconfigured');
    expect(body.detail).toContain('mock agent backend');
  });

  test('GET /api/agent-backends/:id/capabilities returns mock capabilities', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/agent-backends/claude-code/capabilities',
    });

    expect(response.statusCode).toBe(200);
    const body = AgentBackendCapabilitiesResponseSchema.parse(response.json());
    expect(body.backendId).toBe('claude-code');
    expect(body.mode).toBe('mock');
    expect(body.capabilities).toEqual(
      expect.arrayContaining(['skill.invoke.stub']),
    );
  });

  test('POST /api/agent-backends/:id/invoke returns a mock invocation response', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/agent-backends/openclaw/invoke',
      payload: {
        correlationId: 'corr-backend-001',
        input: {
          symptom: 'auto aim drifts',
        },
      },
    });

    expect(response.statusCode).toBe(200);
    const body = AgentBackendInvokeResponseSchema.parse(response.json());
    expect(body).toMatchObject({
      backendId: 'openclaw',
      mode: 'mock',
      status: 'accepted',
      correlationId: 'corr-backend-001',
    });
    expect(body.output.message).toContain('mock agent backend');
    expect(body.output.inputEcho).toMatchObject({
      symptom: 'auto aim drifts',
    });
  });

  test('agent backend endpoints reject non-backend ids', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/agent-backends/feishu/health',
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ detail: 'Agent backend not found' });
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
