import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { createHubApiClient } from './api/client';
import { ConsoleLayout } from './components/layout/ConsoleLayout';
import { CONSOLE_PAGES, type ConsolePage, type PageRenderCtx } from './console-pages';
import { useI18n } from './i18n';
import { APIBASE_KEY, WRITE_TOKEN_KEY } from './constants';
// 单一真实后端：queryKey 维度保留稳定常量（曾区分 mock/real，现恒为 real），
// 避免改动各页 queryKey 形状。
const SOURCE = 'real';

// 后端地址：localStorage 覆盖（设置页可改）> VITE_API_BASE > 同源 '/'。
function readApiBase(): string {
  const override = window.localStorage.getItem(APIBASE_KEY)?.trim();
  if (override) return override;
  return import.meta.env.VITE_API_BASE ?? '/';
}

// 写入令牌：设置页填入 localStorage；server 绑非 loopback 时写端点需带它（读端点不限）。
function readWriteToken(): string | undefined {
  return window.localStorage.getItem(WRITE_TOKEN_KEY)?.trim() || undefined;
}

export function App() {
  const { t } = useI18n();
  const [page, setPage] = useState<ConsolePage>('overview');

  // 单一真实后端：默认相对路径同源（dev 走 vite proxy → 本地 hub-server；同源部署直接命中 /api）。
  // VITE_API_BASE / 设置页 localStorage 可覆盖为绝对地址。
  const apiClient = useMemo(
    () =>
      createHubApiClient({
        baseUrl: readApiBase(),
        writeToken: readWriteToken(),
      }),
    [],
  );

  const overviewQuery = useQuery({
    queryKey: ['hub-overview', SOURCE],
    queryFn: () => apiClient.getOverview(),
  });

  // 页面注册表（console-pages.tsx）驱动渲染 + 标题——不再是 if-else 链（HUB-MODULARIZATION 第2步）。
  const activePage = CONSOLE_PAGES.find((p) => p.key === page);
  const renderCtx: PageRenderCtx = {
    apiClient,
    source: SOURCE,
    onNavigate: setPage,
    overview: {
      isLoading: overviewQuery.isLoading,
      error: overviewQuery.error,
      data: overviewQuery.data,
    },
  };

  return (
    <ConsoleLayout page={page} onNavigate={setPage}>
      <div className="console-toolbar">
        <div>
          <p className="eyebrow">{t('toolbar.eyebrow')}</p>
          <h1>{activePage ? t(activePage.titleKey) : null}</h1>
        </div>
        {page === 'overview' ? (
          <button
            className="icon-button"
            type="button"
            onClick={() => void overviewQuery.refetch()}
            aria-label={t('toolbar.refresh')}
            title={t('toolbar.refresh')}
          >
            <RefreshCw aria-hidden="true" size={18} />
          </button>
        ) : null}
      </div>
      {activePage ? activePage.render(renderCtx) : null}
    </ConsoleLayout>
  );
}
