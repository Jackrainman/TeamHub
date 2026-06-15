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
import { KbSearchPage } from './features/kb/KbSearchPage';
import { PmBoardPage } from './features/pm/PmBoardPage';
import { SettingsPage } from './features/settings/SettingsPage';
import { useI18n, type TranslationKey } from './i18n';

const SOURCE_KEY = 'teamhub.dataSource';
const APIBASE_KEY = 'teamhub.apiBase';

const TITLE_KEY: Record<ConsolePage, TranslationKey> = {
  overview: 'toolbar.title.overview',
  'dep-graph': 'toolbar.title.depGraph',
  kb: 'toolbar.title.kb',
  pm: 'toolbar.title.pm',
  settings: 'toolbar.title.settings',
};

function readInitialSource(): DataSource {
  if (typeof window === 'undefined') return 'real';
  return window.localStorage.getItem(SOURCE_KEY) === 'mock' ? 'mock' : 'real';
}

// 真实模式后端地址：localStorage 覆盖（设置页可改）> VITE_API_BASE > 同源 '/'。
function readApiBase(): string {
  const override = window.localStorage.getItem(APIBASE_KEY)?.trim();
  if (override) return override;
  return import.meta.env.VITE_API_BASE ?? '/';
}

export function App() {
  const { t } = useI18n();
  const [page, setPage] = useState<ConsolePage>('overview');
  const [source, setSource] = useState<DataSource>(readInitialSource);
  // 看板「在依赖图查看此节点」跳转：暂存目标任务 id，DepGraphPage 加载后选中并消费掉。
  const [focusTaskId, setFocusTaskId] = useState<string | null>(null);

  useEffect(() => {
    window.localStorage.setItem(SOURCE_KEY, source);
  }, [source]);

  // 真实模式默认相对路径同源（dev 走 vite proxy → 本地 hub-server；同源部署直接命中 /api）。
  // VITE_API_BASE 可覆盖为绝对地址。Mock 模式 baseUrl=undefined → 用内置演示数据。
  const apiClient = useMemo(
    () =>
      createHubApiClient({
        baseUrl: source === 'real' ? readApiBase() : undefined,
      }),
    [source],
  );

  const overviewQuery = useQuery({
    queryKey: ['hub-overview', source],
    queryFn: () => apiClient.getOverview(),
  });

  return (
    <ConsoleLayout mode={apiClient.mode} page={page} onNavigate={setPage}>
      <div className="console-toolbar">
        <div>
          <p className="eyebrow">{t('toolbar.eyebrow')}</p>
          <h1>{t(TITLE_KEY[page])}</h1>
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
          onNavigate={setPage}
        />
      ) : page === 'dep-graph' ? (
        <DepGraphPage
          client={apiClient}
          source={source}
          focusTaskId={focusTaskId}
          onConsumeFocus={() => setFocusTaskId(null)}
        />
      ) : page === 'kb' ? (
        <KbSearchPage client={apiClient} source={source} />
      ) : page === 'pm' ? (
        <PmBoardPage
          client={apiClient}
          source={source}
          onOpenInDepGraph={(id) => {
            setFocusTaskId(id);
            setPage('dep-graph');
          }}
        />
      ) : page === 'settings' ? (
        <SettingsPage
          client={apiClient}
          source={source}
          onChangeSource={setSource}
        />
      ) : null}
    </ConsoleLayout>
  );
}
