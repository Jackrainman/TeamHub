import React from 'react';
import ReactDOM from 'react-dom/client';
import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from './App';
import { GlobalToast } from './components/GlobalToast';
import { showToast } from './utils/toast';
import { LanguageProvider } from './i18n';
import { ThemeProvider } from './theme';
import './styles/01-tokens.css';
import './styles/02-base.css';
import './styles/03-settings.css';
import './styles/04-setup.css';
import './styles/05-overview.css';
import './styles/06-kb.css';
import './styles/07-archive.css';
import './styles/08-pm.css';
import './styles/09-direction.css';
import './styles/10-myview.css';
import './styles/11-inv.css';
import './styles/12-fleet.css';
import './styles/13-relay-chain.css';
import './styles/14-schedule.css';
import './styles/15-fleet-tabs.css';
import './styles/16-relay-canvas.css';
import './styles/17-tech.css';
import './styles/18-direction-starmap.css';
import './styles/19-timeline.css';
import './styles/20-viz.css';
import './styles/21-pool.css';
import './styles/22-reimburse.css';
import './styles/23-workbench.css';
import './styles/24-notion.css';
import './styles/25-linear.css';
import './styles/26-style-gallery.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: false,
    },
  },
  // 全局兜底：mutation 失败而自身未处理（无 onError / 无 meta.silent）时弹 toast，杜绝静默吞。
  // 自带错误 UI 的 mutation（声明了 onError，或标 meta.silent 用内联 isError 渲染）跳过，避免重复提示。
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      if (mutation.options.onError || mutation.meta?.silent) return;
      showToast(error instanceof Error ? error.message : String(error));
    },
  }),
});

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider>
      <LanguageProvider>
        <QueryClientProvider client={queryClient}>
          <App />
          <GlobalToast />
        </QueryClientProvider>
      </LanguageProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
