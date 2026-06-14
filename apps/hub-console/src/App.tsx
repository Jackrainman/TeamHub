import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { createHubApiClient } from './api/client';
import {
  ConsoleLayout,
  type ConsolePage,
  type DataSource,
} from './components/layout/ConsoleLayout';
import { OverviewPage } from './features/overview/OverviewPage';
import { DepGraphPage } from './features/dep-graph/DepGraphPage';
import { useI18n } from './i18n';

const SOURCE_KEY = 'teamhub.dataSource';

function readInitialSource(): DataSource {
  if (typeof window === 'undefined') return 'real';
  return window.localStorage.getItem(SOURCE_KEY) === 'mock' ? 'mock' : 'real';
}

export function App() {
  const { t } = useI18n();
  const [page, setPage] = useState<ConsolePage>('overview');
  const [source, setSource] = useState<DataSource>(readInitialSource);

  useEffect(() => {
    window.localStorage.setItem(SOURCE_KEY, source);
  }, [source]);

  // 真实模式默认相对路径同源（dev 走 vite proxy → 本地 hub-server；同源部署直接命中 /api）。
  // VITE_API_BASE 可覆盖为绝对地址。Mock 模式 baseUrl=undefined → 用内置演示数据。
  const apiClient = useMemo(
    () =>
      createHubApiClient({
        baseUrl: source === 'real' ? import.meta.env.VITE_API_BASE ?? '/' : undefined,
      }),
    [source],
  );

  const overviewQuery = useQuery({
    queryKey: ['hub-overview', source],
    queryFn: () => apiClient.getOverview(),
  });

  return (
    <ConsoleLayout
      mode={apiClient.mode}
      source={source}
      onToggleSource={() => setSource((p) => (p === 'real' ? 'mock' : 'real'))}
      page={page}
      onNavigate={setPage}
    >
      <div className="console-toolbar">
        <div>
          <p className="eyebrow">{t('toolbar.eyebrow')}</p>
          <h1>
            {page === 'overview'
              ? t('toolbar.title.overview')
              : t('toolbar.title.depGraph')}
          </h1>
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
      {page === 'overview' ? (
        <OverviewPage
          isLoading={overviewQuery.isLoading}
          error={overviewQuery.error}
          snapshot={overviewQuery.data}
        />
      ) : (
        <DepGraphPage client={apiClient} source={source} />
      )}
    </ConsoleLayout>
  );
}
