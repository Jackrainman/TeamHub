import { useQuery } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { createHubApiClient } from './api/client';
import { ConsoleLayout } from './components/layout/ConsoleLayout';
import { OverviewPage } from './features/overview/OverviewPage';

const apiClient = createHubApiClient({
  baseUrl: import.meta.env.VITE_API_BASE,
});

export function App() {
  const overviewQuery = useQuery({
    queryKey: ['hub-overview'],
    queryFn: () => apiClient.getOverview(),
  });

  return (
    <ConsoleLayout mode={apiClient.mode}>
      <div className="console-toolbar">
        <div>
          <p className="eyebrow">Team Hub</p>
          <h1>Operations Console</h1>
        </div>
        <button
          className="icon-button"
          type="button"
          onClick={() => void overviewQuery.refetch()}
          aria-label="Refresh overview"
          title="Refresh overview"
        >
          <RefreshCw aria-hidden="true" size={18} />
        </button>
      </div>
      <OverviewPage
        isLoading={overviewQuery.isLoading}
        error={overviewQuery.error}
        snapshot={overviewQuery.data}
      />
    </ConsoleLayout>
  );
}
