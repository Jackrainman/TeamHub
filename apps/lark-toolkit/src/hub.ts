import {
  AdapterDescriptorSchema,
  type AdapterDescriptor,
} from '@teamhub/hub-contracts';
import type { ToolkitConfig } from './types.js';
import { route } from './boundary.js';

export function buildLarkToolkitAdapterDescriptor(
  cfg?: Pick<ToolkitConfig, 'larkDomain'>,
  now = new Date(),
): AdapterDescriptor {
  return AdapterDescriptorSchema.parse({
    id: 'lark-toolkit',
    kind: 'tool',
    displayName: 'Lark Toolkit',
    status: cfg ? 'enabled' : 'unconfigured',
    capabilities: [
      `reply.${route('im.v1.message.create')}`,
      'openapi.cli.route',
      'hub.adapter.descriptor',
    ],
    healthCheckedAt: cfg ? now.toISOString() : undefined,
  });
}
