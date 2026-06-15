import { createRequire } from 'node:module';
import type {
  AgentBackend,
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

// 系统状态的 adapters 计数现按 Agent 后端统计（集成三分后，唯一仍用 enabled/degraded/unconfigured
// 生命周期枚举的物种）。响应字段名沿用 `adapters` 不改，避免 console / 测试连锁；语义靠 i18n 标签消解。
export function buildSystemStatusResponse(
  agentBackends: AgentBackend[],
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
      total: agentBackends.length,
      enabled: countByStatus(agentBackends, 'enabled'),
      degraded: countByStatus(agentBackends, 'degraded'),
      unconfigured: countByStatus(agentBackends, 'unconfigured'),
    },
  };
}

function countByStatus(
  backends: AgentBackend[],
  status: AgentBackend['status'],
): number {
  return backends.filter((backend) => backend.status === status).length;
}
