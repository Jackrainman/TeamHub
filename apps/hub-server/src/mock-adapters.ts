import type { AdapterDescriptor } from './contracts.js';
import { adapterDescriptorFixtures } from '@teamhub/hub-contracts';

export const mockAdapters: AdapterDescriptor[] = adapterDescriptorFixtures;

export function listMockAdapters(): AdapterDescriptor[] {
  return mockAdapters.map((adapter) => ({
    ...adapter,
    capabilities: [...adapter.capabilities],
  }));
}
