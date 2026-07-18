import { describe, expect, test } from 'vitest';
import {
  DeploymentInfoSchema,
  SystemStatusResponseSchema,
} from '../src/index.js';

/**
 * 部署信息契约单测（K3 部署信息刀）：deployment 全 optional 增量——旧 server 不回该字段时 status
 * 仍解析通过（旧客户端零影响）；回了则校验域/后端/落盘路径/启用模块/图纸开关/构建标识的结构。
 * 红线：deployment 只报运维定位事实，无任何按人聚合维度、无密钥字段。
 */

const baseStatus = {
  service: 'teamhub-hub-server' as const,
  version: '0.24.2',
  mode: 'mock-first' as const,
  generatedAt: '2026-07-16T00:00:00.000Z',
  uptimeSeconds: 3600,
  adapters: { total: 3, enabled: 1, degraded: 0, unconfigured: 2 },
};

describe('SystemStatusResponseSchema：deployment optional 增量', () => {
  test('省略 deployment 合法（旧 server / 向后兼容）', () => {
    const parsed = SystemStatusResponseSchema.parse(baseStatus);
    expect(parsed.deployment).toBeUndefined();
  });

  test('带 deployment 时回显五域落盘/内存 + 启用模块 + 图纸开关 + 构建标识', () => {
    const parsed = SystemStatusResponseSchema.parse({
      ...baseStatus,
      deployment: {
        dataMode: 'real',
        identityMode: 'identity',
        storage: [
          { domain: 'gov', backend: 'file', path: '/data/gov.json' },
          { domain: 'kb', backend: 'memory' },
          { domain: 'inv', backend: 'sqlite', path: '/data/inv.db' },
        ],
        enabledModules: ['system', 'pm-core'],
        artifactUploadEnabled: false,
        buildId: 'abc1234',
      },
    });
    expect(parsed.deployment?.dataMode).toBe('real');
    expect(parsed.deployment?.identityMode).toBe('identity');
    expect(parsed.deployment?.storage[1]).toEqual({ domain: 'kb', backend: 'memory' });
    expect(parsed.deployment?.artifactUploadEnabled).toBe(false);
  });
});

describe('DeploymentStorageEntry：memory 无路径 / 未知 backend 拒绝', () => {
  test('memory 域可省 path', () => {
    const parsed = DeploymentInfoSchema.parse({
      dataMode: 'demo',
      identityMode: 'anonymous',
      storage: [{ domain: 'checklist', backend: 'memory' }],
      enabledModules: [],
      artifactUploadEnabled: true,
      buildId: '0.24.2',
    });
    expect(parsed.storage[0].path).toBeUndefined();
  });

  test('非法 backend 枚举被拒', () => {
    expect(() =>
      DeploymentInfoSchema.parse({
        identityMode: 'anonymous',
        storage: [{ domain: 'gov', backend: 'redis' }],
        enabledModules: [],
        artifactUploadEnabled: true,
        buildId: 'x',
      }),
    ).toThrow();
  });
});
