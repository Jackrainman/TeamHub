import type {
  AgentBackend,
  AgentBackendCapabilitiesResponse,
  AgentBackendHealthResponse,
  AgentBackendInvokeRequest,
  AgentBackendInvokeResponse,
} from './contracts.js';
import {
  AgentBackendCapabilitiesResponseSchema,
  AgentBackendHealthResponseSchema,
  AgentBackendInvokeResponseSchema,
} from './contracts.js';
import { listMockAgentBackends } from './mock-integrations.js';

// Agent 后端是唯一可 invoke 的物种。放行按 ID（mock-first 桩），真接入时此处注入 real provider。
const MOCK_AGENT_BACKEND_IDS = ['hermes', 'openclaw', 'claude-code'] as const;

export type MockAgentBackendId = (typeof MOCK_AGENT_BACKEND_IDS)[number];

export function isMockAgentBackendId(id: string): id is MockAgentBackendId {
  return (MOCK_AGENT_BACKEND_IDS as readonly string[]).includes(id);
}

export function getMockAgentBackend(id: MockAgentBackendId): AgentBackend {
  const backend = listMockAgentBackends().find((item) => item.id === id);
  if (!backend) {
    throw new Error(`missing mock agent backend fixture: ${id}`);
  }
  return backend;
}

export function getMockAgentBackendHealth(
  id: MockAgentBackendId,
  now = new Date(),
): AgentBackendHealthResponse {
  const backend = getMockAgentBackend(id);
  return AgentBackendHealthResponseSchema.parse({
    backendId: backend.id,
    status: backend.status,
    checkedAt: now.toISOString(),
    detail: 'mock agent backend only; no real provider was called',
  });
}

export function getMockAgentBackendCapabilities(
  id: MockAgentBackendId,
): AgentBackendCapabilitiesResponse {
  const backend = getMockAgentBackend(id);
  return AgentBackendCapabilitiesResponseSchema.parse({
    backendId: backend.id,
    mode: 'mock',
    capabilities: backend.capabilities,
  });
}

export function invokeMockAgentBackend(
  id: MockAgentBackendId,
  request: AgentBackendInvokeRequest,
  now = new Date(),
): AgentBackendInvokeResponse {
  const backend = getMockAgentBackend(id);
  return AgentBackendInvokeResponseSchema.parse({
    backendId: backend.id,
    mode: 'mock',
    status: 'accepted',
    createdAt: now.toISOString(),
    correlationId: request.correlationId,
    output: {
      message: `${backend.displayName} mock agent backend received the request; no real provider was called.`,
      inputEcho: request.input,
    },
  });
}
