import { createRequire } from 'node:module';
import type {
  AgentBackend,
  DeploymentInfo,
  HealthResponse,
  SystemStatusResponse,
} from './contracts.js';

const SERVICE_NAME = 'teamhub-hub-server' as const;
// 版本号跟随 package.json（单一源），避免手写常量长期停在 0.0.1。
// createRequire 在 src 与编译后的 dist 下 `../package.json` 都指向包根 package.json。
const require = createRequire(import.meta.url);
const { version: VERSION } = require('../package.json') as { version: string };

/** 活体戳：运行进程注入 TEAMHUB_BUILD_ID（start-teamhub.sh 填 git SHA），缺省回落 package.json version。
 *  /health.buildId 与部署信息 deployment.buildId 共用同一源（K3），杜绝两处各算一份漂移。 */
export function resolveBuildId(): string {
  return process.env.TEAMHUB_BUILD_ID ?? VERSION;
}

export function buildHealthResponse(now = new Date()): HealthResponse {
  return {
    status: 'ok',
    service: SERVICE_NAME,
    checkedAt: now.toISOString(),
    buildId: resolveBuildId(),
  };
}

// 系统状态的 adapters 计数现按 Agent 后端统计（集成三分后，唯一仍用 enabled/degraded/unconfigured
// 生命周期枚举的物种）。响应字段名沿用 `adapters` 不改，避免 console / 测试连锁；语义靠 i18n 标签消解。
export function buildSystemStatusResponse(
  agentBackends: AgentBackend[],
  // K3 部署信息：main.ts 启动时收集的「每域走哪种 store + 路径 / 启用模块 / 图纸开关 / 构建标识」事实，
  // 经 BuildHubServerOptions.deployment 透传到此原样回显（缺省 → 不带该字段，旧客户端零影响）。
  deployment?: DeploymentInfo,
  now = new Date(),
  uptimeSeconds = process.uptime(),
  // 默认 'mock-first'（当前唯一产出）；real/hybrid 部署由调用方注入。schema 已放宽（system-status.ts）。
  // 注：console 自 K3 起停止展示 mode（恒 'mock-first' 会误报「本地演示」），改看 deployment 的真实事实；
  // 字段仍在响应里保留兼容（旧客户端 / 未来 real 模式）。
  mode: SystemStatusResponse['mode'] = 'mock-first',
): SystemStatusResponse {
  return {
    service: SERVICE_NAME,
    version: VERSION,
    mode,
    generatedAt: now.toISOString(),
    uptimeSeconds,
    adapters: {
      total: agentBackends.length,
      enabled: countByStatus(agentBackends, 'enabled'),
      degraded: countByStatus(agentBackends, 'degraded'),
      unconfigured: countByStatus(agentBackends, 'unconfigured'),
    },
    ...(deployment ? { deployment } : {}),
  };
}

function countByStatus(
  backends: AgentBackend[],
  status: AgentBackend['status'],
): number {
  return backends.filter((backend) => backend.status === status).length;
}
