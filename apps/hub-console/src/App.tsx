import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { createHubApiClient } from './api/client';
import { ConsoleLayout, type ConsolePage } from './components/layout/ConsoleLayout';
import { OverviewPage } from './features/overview/OverviewPage';
import { DepGraphPage } from './features/dep-graph/DepGraphPage';

const apiClient = createHubApiClient({
  baseUrl: import.meta.env.VITE_API_BASE,
});

export function App() {
  const [page, setPage] = useState<ConsolePage>('overview');
  const overviewQuery = useQuery({
    queryKey: ['hub-overview'],
    queryFn: () => apiClient.getOverview(),
  });

  return (
    <ConsoleLayout mode={apiClient.mode} page={page} onNavigate={setPage}>
      <div className="console-toolbar">
        <div>
          <p className="eyebrow">Team Hub</p>
          <h1>{page === 'overview' ? 'Operations Console' : '依赖链 · 阻塞归因'}</h1>
        </div>
        {page === 'overview' ? (
          <button
            className="icon-button"
            type="button"
            onClick={() => void overviewQuery.refetch()}
            aria-label="Refresh overview"
            title="Refresh overview"
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
        <DepGraphPage client={apiClient} />
      )}
    </ConsoleLayout>
  );
}
