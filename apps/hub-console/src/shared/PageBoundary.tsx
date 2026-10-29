import { Component, Suspense, type PropsWithChildren } from 'react';
import { useI18n } from '../i18n';

function PageLoadFailure() {
  const { t } = useI18n();
  return (
    <div className="state-band state-band-error" role="alert">
      <p>{t('page.loadFailed')}</p>
      <button type="button" className="secondary-button" onClick={() => window.location.reload()}>
        {t('page.reload')}
      </button>
    </div>
  );
}

class PageErrorBoundary extends Component<PropsWithChildren, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? <PageLoadFailure /> : this.props.children;
  }
}

/** 边界只包页面内容，失败时导航仍可用；由调用方的 key 在切页时重置。 */
export function PageBoundary({ children }: PropsWithChildren) {
  const { t } = useI18n();
  return (
    <PageErrorBoundary>
      <Suspense fallback={<div className="state-band" role="status" aria-live="polite">{t('page.loading')}</div>}>
        {children}
      </Suspense>
    </PageErrorBoundary>
  );
}
