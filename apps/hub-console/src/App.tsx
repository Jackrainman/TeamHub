import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { createHubApiClient } from './api/client';
import {
  ConsoleLayout,
  type ConsolePage,
} from './components/layout/ConsoleLayout';
import { OverviewPage } from './features/overview/OverviewPage';
import { DepGraphPage } from './features/dep-graph/DepGraphPage';
import { KbSearchPage } from './features/kb/KbSearchPage';
import { PmBoardPage } from './features/pm/PmBoardPage';
import { ArchivePage } from './features/archive/ArchivePage';
import { SettingsPage } from './features/settings/SettingsPage';
import { useI18n, type TranslationKey } from './i18n';

const APIBASE_KEY = 'teamhub.apiBase';
// 单一真实后端：queryKey 维度保留稳定常量（曾区分 mock/real，现恒为 real），
// 避免改动各页 queryKey 形状。
const SOURCE = 'real';

const TITLE_KEY: Record<ConsolePage, TranslationKey> = {
  overview: 'toolbar.title.overview',
  'dep-graph': 'toolbar.title.depGraph',
  kb: 'toolbar.title.kb',
  pm: 'toolbar.title.pm',
  archive: 'toolbar.title.archive',
  settings: 'toolbar.title.settings',
};

// 后端地址：localStorage 覆盖（设置页可改）> VITE_API_BASE > 同源 '/'。
function readApiBase(): string {
  const override = window.localStorage.getItem(APIBASE_KEY)?.trim();
  if (override) return override;
  return import.meta.env.VITE_API_BASE ?? '/';
}

export function App() {
  const { t } = useI18n();
  const [page, setPage] = useState<ConsolePage>('overview');
  // 看板「在依赖图查看此节点」跳转：暂存目标任务 id，DepGraphPage 加载后选中并消费掉。
  const [focusTaskId, setFocusTaskId] = useState<string | null>(null);

  // 单一真实后端：默认相对路径同源（dev 走 vite proxy → 本地 hub-server；同源部署直接命中 /api）。
  // VITE_API_BASE / 设置页 localStorage 可覆盖为绝对地址。
  const apiClient = useMemo(() => createHubApiClient({ baseUrl: readApiBase() }), []);

  const overviewQuery = useQuery({
    queryKey: ['hub-overview', SOURCE],
    queryFn: () => apiClient.getOverview(),
  });

  return (
    <ConsoleLayout page={page} onNavigate={setPage}>
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
          source={SOURCE}
          focusTaskId={focusTaskId}
          onConsumeFocus={() => setFocusTaskId(null)}
        />
      ) : page === 'kb' ? (
        <KbSearchPage client={apiClient} source={SOURCE} />
      ) : page === 'pm' ? (
        <PmBoardPage
          client={apiClient}
          source={SOURCE}
          onOpenInDepGraph={(id) => {
            setFocusTaskId(id);
            setPage('dep-graph');
          }}
        />
      ) : page === 'archive' ? (
        <ArchivePage client={apiClient} source={SOURCE} />
      ) : page === 'settings' ? (
        <SettingsPage client={apiClient} source={SOURCE} />
      ) : null}
    </ConsoleLayout>
  );
}
