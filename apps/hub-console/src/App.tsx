import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { createHubApiClient } from './api/client';
import {
  ConsoleLayout,
  type ConsolePage,
} from './components/layout/ConsoleLayout';
import { OverviewPage } from './features/overview/OverviewPage';
import { ProjectPage } from './features/project/ProjectPage';
import { GapsPage } from './features/gaps/GapsPage';
import { KbSearchPage } from './features/kb/KbSearchPage';
import { ArchivePage } from './features/archive/ArchivePage';
import { InvPage } from './features/inv/InvPage';
import { FleetPage } from './features/fleet/FleetPage';
import { SettingsPage } from './features/settings/SettingsPage';
import { useI18n, type TranslationKey } from './i18n';
import { APIBASE_KEY, WRITE_TOKEN_KEY } from './constants';
// 单一真实后端：queryKey 维度保留稳定常量（曾区分 mock/real，现恒为 real），
// 避免改动各页 queryKey 形状。
const SOURCE = 'real';

const TITLE_KEY: Record<ConsolePage, TranslationKey> = {
  overview: 'toolbar.title.overview',
  project: 'toolbar.title.project',
  gaps: 'toolbar.title.gaps',
  kb: 'toolbar.title.kb',
  archive: 'toolbar.title.archive',
  inv: 'toolbar.title.inv',
  fleet: 'toolbar.title.fleet',
  settings: 'toolbar.title.settings',
};

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
      ) : page === 'project' ? (
        <ProjectPage client={apiClient} source={SOURCE} />
      ) : page === 'gaps' ? (
        <GapsPage client={apiClient} source={SOURCE} />
      ) : page === 'kb' ? (
        <KbSearchPage client={apiClient} source={SOURCE} />
      ) : page === 'archive' ? (
        <ArchivePage client={apiClient} source={SOURCE} />
      ) : page === 'inv' ? (
        <InvPage client={apiClient} source={SOURCE} />
      ) : page === 'fleet' ? (
        <FleetPage client={apiClient} source={SOURCE} />
      ) : page === 'settings' ? (
        <SettingsPage client={apiClient} source={SOURCE} />
      ) : null}
    </ConsoleLayout>
  );
}
