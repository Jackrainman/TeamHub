import type {
  AdapterDescriptor,
  HealthResponse,
  SystemStatusResponse,
} from './contracts.js';

const SERVICE_NAME = 'teamhub-hub-server' as const;
const VERSION = '0.0.1';

export function buildHealthResponse(now = new Date()): HealthResponse {
  return {
    status: 'ok',
    service: SERVICE_NAME,
    checkedAt: now.toISOString(),
  };
}

export function buildSystemStatusResponse(
  adapters: AdapterDescriptor[],
  now = new Date(),
  uptimeSeconds = process.uptime(),
): SystemStatusResponse {
  return {
    service: SERVICE_NAME,
    version: VERSION,
    mode: 'mock-first',
    generatedAt: now.toISOString(),
    uptimeSeconds,
    adapters: {
      total: adapters.length,
      enabled: countByStatus(adapters, 'enabled'),
      degraded: countByStatus(adapters, 'degraded'),
      unconfigured: countByStatus(adapters, 'unconfigured'),
    },
  };
}

function countByStatus(
  adapters: AdapterDescriptor[],
  status: AdapterDescriptor['status'],
): number {
  return adapters.filter((adapter) => adapter.status === status).length;
}
