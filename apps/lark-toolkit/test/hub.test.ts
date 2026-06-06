import { describe, expect, test } from 'vitest';
import { AdapterDescriptorSchema } from '@teamhub/hub-contracts';
import { buildLarkToolkitAdapterDescriptor } from '../src/hub';

describe('lark-toolkit Hub contract adapter', () => {
  test('builds a schema-valid toolkit descriptor without exposing secrets', () => {
    const descriptor = buildLarkToolkitAdapterDescriptor(
      { larkDomain: 'feishu' },
      new Date('2026-06-06T00:00:00.000Z'),
    );

    expect(AdapterDescriptorSchema.safeParse(descriptor).success).toBe(true);
    expect(descriptor).toMatchObject({
      id: 'lark-toolkit',
      kind: 'tool',
      status: 'enabled',
    });
    expect(JSON.stringify(descriptor)).not.toContain('secret');
    expect(descriptor.capabilities).toContain('reply.sdk');
  });
});
