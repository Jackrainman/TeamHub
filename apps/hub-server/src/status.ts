import { createRequire } from 'node:module';
import type { HealthResponse, SystemStatusResponse } from '@teamhub/hub-contracts';

const SERVICE_NAME = 'teamhub-hub-server';
const require = createRequire(import.meta.url);
const { version: VERSION } = require('../package.json') as { version: string };
export function resolveBuildId(): string { return process.env.TEAMHUB_BUILD_ID ?? VERSION; }
export function buildHealthResponse(now = new Date()): HealthResponse {
  return { status: 'ok', service: SERVICE_NAME, checkedAt: now.toISOString(), buildId: resolveBuildId() };
}
export function buildSystemStatusResponse(now = new Date()): SystemStatusResponse {
  return { service: SERVICE_NAME, version: VERSION, generatedAt: now.toISOString(),
    uptimeSeconds: process.uptime(), buildId: resolveBuildId() };
}
