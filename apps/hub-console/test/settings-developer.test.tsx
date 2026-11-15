import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createHubApiClient } from '../src/api/client';
import { queryKeys } from '../src/api/queryKeys';
import { LanguageProvider } from '../src/i18n';
import type { OverviewView, PageIdentityCtx } from '../src/console-pages';
import {
  DEVELOPER_BODY_ID,
  DEVELOPER_EXPANDED_KEY,
  DeveloperSection,
  readDeveloperExpanded,
  resolveDeveloperExpanded,
  saveDeveloperExpanded,
} from '../src/features/settings/DeveloperSection';

// 「开发者」分区（设置页末尾可折叠区）：折叠态必须真的落 localStorage，
// 且 demo 试驾在无用户偏好时默认展开。这里测存储读写/裁决纯函数 + 渲染出的 aria 状态，
// 不测 DOM 事件（本仓「测逻辑不测 DOM」，真实点击走 4177 活体验收）。

function memoryStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
  };
}

const anonymous: PageIdentityCtx = { mode: 'anonymous', session: null, isLoading: false, canWrite: true };

// 受控体里的 ConnectionSection 在渲染期直读 window.localStorage（既存代码），
// node 测试环境没有 window，这里补一个最小的；同时保证分区自己不依赖真实浏览器存储。
beforeEach(() => {
  vi.stubGlobal('window', { localStorage: memoryStorage() });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

function overview(): OverviewView {
  return { isLoading: false, error: null, data: undefined, refetch: () => {} };
}

function renderSection(identity: PageIdentityCtx, dataMode?: 'demo' | 'real') {
  const cache = new QueryClient();
  if (dataMode) {
    cache.setQueryData(queryKeys.systemStatus('test'), {
      service: 'teamhub-hub-server',
      version: '0.0.0',
      mode: 'mock-first',
      generatedAt: '2026-11-14T00:00:00.000Z',
      uptimeSeconds: 1,
      adapters: { total: 0, enabled: 0, degraded: 0, unconfigured: 0 },
      deployment: {
        dataMode,
        identityMode: 'anonymous',
        verticalId: 'robotics',
        storage: [],
        enabledModules: [],
        artifactUploadEnabled: false,
        buildId: 'test-build',
      },
    });
  }
  return renderToStaticMarkup(
    <QueryClientProvider client={cache}>
      <LanguageProvider>
        <DeveloperSection
          client={createHubApiClient()}
          source="test"
          identity={identity}
          overview={overview()}
        />
      </LanguageProvider>
    </QueryClientProvider>,
  );
}

describe('开发者分区：localStorage 折叠态', () => {
  test('已存值可读回：true / false / 未知值', () => {
    expect(readDeveloperExpanded(memoryStorage({ [DEVELOPER_EXPANDED_KEY]: 'true' }))).toBe(true);
    expect(readDeveloperExpanded(memoryStorage({ [DEVELOPER_EXPANDED_KEY]: 'false' }))).toBe(false);
    expect(readDeveloperExpanded(memoryStorage({ [DEVELOPER_EXPANDED_KEY]: 'yes' }))).toBeNull();
    expect(readDeveloperExpanded(memoryStorage())).toBeNull();
    expect(readDeveloperExpanded(null)).toBeNull();
  });

  test('手动切换写入存储（不是只有组件 state），写入后能读回', () => {
    const storage = memoryStorage();
    saveDeveloperExpanded(true, storage);
    expect(storage.map.get(DEVELOPER_EXPANDED_KEY)).toBe('true');
    expect(readDeveloperExpanded(storage)).toBe(true);
    saveDeveloperExpanded(false, storage);
    expect(storage.map.get(DEVELOPER_EXPANDED_KEY)).toBe('false');
    expect(readDeveloperExpanded(storage)).toBe(false);
  });

  test('存储抛错时读写都降级为 null / 静默（禁用存储不炸页面）', () => {
    const throwing = {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('blocked'); },
    };
    expect(readDeveloperExpanded(throwing)).toBeNull();
    expect(() => saveDeveloperExpanded(true, throwing)).not.toThrow();
  });

  test('裁决：用户偏好优先；无偏好时 demo 默认展开、real / 未知默认折叠', () => {
    expect(resolveDeveloperExpanded(null, 'demo')).toBe(true);
    expect(resolveDeveloperExpanded(null, 'real')).toBe(false);
    expect(resolveDeveloperExpanded(null, undefined)).toBe(false);
    expect(resolveDeveloperExpanded(false, 'demo')).toBe(false);
    expect(resolveDeveloperExpanded(true, 'real')).toBe(true);
  });
});

describe('开发者分区：渲染结构', () => {
  test('demo 且无偏好 → 默认展开，标题常驻且 aria-expanded=true', () => {
    const html = renderSection(anonymous, 'demo');
    expect(html).toContain('开发者');
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain(`aria-controls="${DEVELOPER_BODY_ID}"`);
    expect(html).toContain(`id="${DEVELOPER_BODY_ID}"`);
    expect(html).not.toContain('hidden=""');
  });

  test('real 且无偏好 → 默认折叠，受控体隐藏但仍带 id 供 aria-controls 指认', () => {
    const html = renderSection(anonymous, 'real');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain(`id="${DEVELOPER_BODY_ID}"`);
    expect(html).toMatch(new RegExp(`id="${DEVELOPER_BODY_ID}"[^>]*hidden=""`));
  });

  test('外层是 panel settings-panel，且标题按钮可点（button.type=button）', () => {
    const html = renderSection(anonymous, 'real');
    expect(html).toMatch(/<section class="panel settings-panel"><div class="panel-header">/);
    expect(html).toMatch(/<button type="button" class="settings-developer__toggle" aria-expanded="false"/);
  });

  test('受控区内部顺序：集成 → 飞书集成 → 连接 → 部署信息 → 部署配置 → 关于', () => {
    const html = renderSection(anonymous, 'demo');
    const order = ['集成', '连接', '部署信息', '部署配置', '关于'].map((title) => html.indexOf(`<h2>${title}</h2>`));
    expect(order.every((at) => at > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  test('身份模式下普通成员（非项目管理）整块不渲染，包括标题', () => {
    const html = renderSection(
      {
        mode: 'identity',
        session: { memberId: 'm-1', displayName: 'A', groupId: 'grp-1', role: 'member' },
        isLoading: false,
        canWrite: true,
      },
      'demo',
    );
    expect(html).toBe('');
  });

  test('已存 false 压过 demo 默认展开', () => {
    vi.stubGlobal('window', {
      localStorage: memoryStorage({ [DEVELOPER_EXPANDED_KEY]: 'false' }),
    });
    const html = renderSection(anonymous, 'demo');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toMatch(new RegExp(`id="${DEVELOPER_BODY_ID}"[^>]*hidden=""`));
  });

  test('手动切换写入存储后重挂载仍采用存储值', () => {
    vi.stubGlobal('window', {
      localStorage: memoryStorage({ [DEVELOPER_EXPANDED_KEY]: 'true' }),
    });
    expect(renderSection(anonymous, 'real')).toContain('aria-expanded="true"');

    saveDeveloperExpanded(false);
    const html = renderSection(anonymous, 'demo');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toMatch(new RegExp(`id="${DEVELOPER_BODY_ID}"[^>]*hidden=""`));
  });
});
