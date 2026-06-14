import { createRequire } from 'node:module';
import type {
  AdapterDescriptor,
  HealthResponse,
  SystemStatusResponse,
} from './contracts.js';

const SERVICE_NAME = 'teamhub-hub-server' as const;
// 版本号跟随 package.json（单一源），避免手写常量长期停在 0.0.1。
// createRequire 在 src 与编译后的 dist 下 `../package.json` 都指向包根 package.json。
const require = createRequire(import.meta.url);
const { version: VERSION } = require('../package.json') as { version: string };

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
