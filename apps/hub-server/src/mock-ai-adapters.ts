import type {
  AdapterCapabilitiesResponse,
  AdapterDescriptor,
  AdapterHealthResponse,
  AdapterInvokeRequest,
  AdapterInvokeResponse,
} from './contracts.js';
import {
  AdapterCapabilitiesResponseSchema,
  AdapterHealthResponseSchema,
  AdapterInvokeResponseSchema,
} from './contracts.js';
import { listMockAdapters } from './mock-adapters.js';

const MOCK_AI_ADAPTER_IDS = ['hermes', 'xiaolongxia', 'claude-code'] as const;

export type MockAiAdapterId = (typeof MOCK_AI_ADAPTER_IDS)[number];

export function isMockAiAdapterId(id: string): id is MockAiAdapterId {
  return (MOCK_AI_ADAPTER_IDS as readonly string[]).includes(id);
}

export function getMockAiAdapterDescriptor(
  id: MockAiAdapterId,
): AdapterDescriptor {
  const adapter = listMockAdapters().find((item) => item.id === id);
  if (!adapter) {
    throw new Error(`missing mock adapter fixture: ${id}`);
  }
  return adapter;
}

export function getMockAiAdapterHealth(
  id: MockAiAdapterId,
  now = new Date(),
): AdapterHealthResponse {
  const adapter = getMockAiAdapterDescriptor(id);
  return AdapterHealthResponseSchema.parse({
    adapterId: adapter.id,
    status: adapter.status,
    checkedAt: now.toISOString(),
    detail: 'mock adapter only; no real provider was called',
  });
}

export function getMockAiAdapterCapabilities(
  id: MockAiAdapterId,
): AdapterCapabilitiesResponse {
  const adapter = getMockAiAdapterDescriptor(id);
  return AdapterCapabilitiesResponseSchema.parse({
    adapterId: adapter.id,
    mode: 'mock',
    capabilities: adapter.capabilities,
  });
}

export function invokeMockAiAdapter(
  id: MockAiAdapterId,
  request: AdapterInvokeRequest,
  now = new Date(),
): AdapterInvokeResponse {
  const adapter = getMockAiAdapterDescriptor(id);
  return AdapterInvokeResponseSchema.parse({
    adapterId: adapter.id,
    mode: 'mock',
    status: 'accepted',
    createdAt: now.toISOString(),
    correlationId: request.correlationId,
    output: {
      message: `${adapter.displayName} mock adapter received the request; no real provider was called.`,
      inputEcho: request.input,
    },
  });
}
