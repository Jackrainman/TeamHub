import React from 'react';
import ReactDOM from 'react-dom/client';
import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from './App';
import { GlobalToast } from './components/GlobalToast';
import { showToast } from './utils/toast';
import { LanguageProvider } from './i18n';
import { ThemeProvider } from './theme';
import './styles.css';

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
