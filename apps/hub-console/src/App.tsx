import { lazy, useMemo, useRef, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';
import type { AppSettings } from '@teamhub/hub-contracts';
import { createHubApiClient, type HubApiClient } from './api/client';
import { useSession } from './features/identity/hooks';
import { useSetupState } from './features/system/hooks';
import { ConsoleLayout } from './components/layout/ConsoleLayout';
import { ConsolePreferencesProvider } from './shared/ConsolePreferences';
import { CONSOLE_PAGES, type ConsolePage, type PageIdentityCtx, type PageRenderCtx } from './console-pages';
import { useI18n } from './i18n';
import { APIBASE_KEY, SETUP_LANDING_KEY, WRITE_TOKEN_KEY } from './constants';
import { IdentityBar } from './features/identity/IdentityBar';
import { LoginGate } from './features/identity/LoginGate';
import { ForcePinGate } from './features/identity/ForcePinGate';
import { PageBoundary } from './shared/PageBoundary';
import { canWriteIdentity } from './shared/lib/identity-utils';

const SetupWizard = lazy(() => import('./features/setup/SetupWizard').then(m => ({ default: m.SetupWizard })));
const BootstrapGate = lazy(() => import('./features/setup/BootstrapGate').then(m => ({ default: m.BootstrapGate })));
const SOURCE = 'real';
function readApiBase(): string {
  const override = window.localStorage.getItem(APIBASE_KEY)?.trim();
  return override || import.meta.env.VITE_API_BASE || '/';
}
function readWriteToken(): string | undefined {
  return window.localStorage.getItem(WRITE_TOKEN_KEY)?.trim() || undefined;
}
export function App() {
  const apiClient = useMemo(() => createHubApiClient({ baseUrl: readApiBase(), writeToken: readWriteToken() }), []);
  const setupQuery = useSetupState(apiClient);
  if (setupQuery.isLoading) return <SetupSplash />;
  if (setupQuery.error || !setupQuery.data) return <SetupStateUnavailable onRetry={() => void setupQuery.refetch()} />;
  if (!setupQuery.data.initialized) {
    return <PageBoundary key="setup"><SetupWizard client={apiClient} state={setupQuery.data} /></PageBoundary>;
  }
  return <ConsoleApp apiClient={apiClient} settings={setupQuery.data.settings} />;
}
function SetupSplash() {
  return <div className="setup-wizard setup-wizard--center" aria-hidden="true"><div className="setup-wizard__inner setup-wizard__status"><div className="setup-spinner" /></div></div>;
}
function SetupStateUnavailable({ onRetry }: { onRetry: () => void }) {
  const { t } = useI18n();
  return <div className="setup-wizard setup-wizard--center" role="alert"><div className="setup-wizard__inner setup-wizard__status">
    <h1 className="setup-wizard__title">{t('setup.stateUnavailable.title')}</h1><p className="setup-wizard__subtitle">{t('setup.stateUnavailable.desc')}</p>
    <button type="button" className="btn btn--secondary" onClick={onRetry}>{t('setup.stateUnavailable.retry')}</button>
  </div></div>;
}
function ConsoleApp({ apiClient, settings }: { apiClient: HubApiClient; settings: AppSettings }) {
  const { t } = useI18n();
  const [setupLanding] = useState<boolean>(() => {
    const flag = window.localStorage.getItem(SETUP_LANDING_KEY);
    if (flag) window.localStorage.removeItem(SETUP_LANDING_KEY);
    return flag === 'roster';
  });
  const [page, setPage] = useState<ConsolePage>(setupLanding ? 'settings' : 'workbench');
  const [showSetupGuide, setShowSetupGuide] = useState<boolean>(setupLanding);
  const sessionQuery = useSession(apiClient);
  const identityMode = sessionQuery.data?.mode ?? settings.identityMode;
  const identitySession = sessionQuery.data?.session ?? null;
  const identity: PageIdentityCtx = {
    mode: identityMode, session: identitySession, isLoading: sessionQuery.isLoading,
    canWrite: canWriteIdentity(identityMode, identitySession),
  };
  const [gateDone, setGateDone] = useState(false);
  const gateShownRef = useRef(false);
  const setupStateQuery = useSetupState(apiClient);
  const hasPmMember = setupStateQuery.data?.initialized === true ? setupStateQuery.data.hasPmMember : undefined;
  const gateConditionMet = identityMode === 'identity' && !gateDone && !sessionQuery.isLoading
    && !setupStateQuery.isLoading && hasPmMember === false;
  if (gateConditionMet) gateShownRef.current = true;
  if (gateConditionMet || (gateShownRef.current && !gateDone)) {
    return <PageBoundary key="bootstrap"><BootstrapGate client={apiClient} onDone={() => { gateShownRef.current = false; setGateDone(true); }} /></PageBoundary>;
  }
  if (identityMode === 'identity' && !sessionQuery.isLoading) {
    if (!identitySession) return <LoginGate client={apiClient} />;
    if (sessionQuery.data?.mustSetPin) return <ForcePinGate client={apiClient} session={identitySession} />;
  }
  const activePage = CONSOLE_PAGES.find((item) => item.key === page) ?? CONSOLE_PAGES[0];
  const renderCtx: PageRenderCtx = { apiClient, source: SOURCE, onNavigate: setPage, identity };
  return <ConsolePreferencesProvider><ConsoleLayout page={activePage.key} onNavigate={setPage} pages={CONSOLE_PAGES} client={apiClient} identity={identity}
    actions={<div className="console-toolbar__actions"><IdentityBar client={apiClient} mode={identity.mode} session={identity.session} />
      {activePage.key === 'workbench' ? <button className="icon-button" type="button" onClick={() => window.location.reload()} aria-label={t('toolbar.refresh')} title={t('toolbar.refresh')}><RefreshCw aria-hidden="true" size={18} /></button> : null}
    </div>}>
    <div className="console-toolbar"><div><p className="eyebrow">{t('toolbar.eyebrow')}</p><h1>{t(activePage.titleKey)}
      {activePage.beta ? <span className={activePage.beta === 'public-beta' ? 'beta-badge beta-badge--public' : 'beta-badge'}>{t(activePage.beta === 'public-beta' ? 'beta.badge.public' : 'beta.badge')}</span> : null}
    </h1></div></div>
    {activePage.key === 'settings' && showSetupGuide ? <div className="setup-guide-banner" role="status">
      <div className="setup-guide-banner__body"><strong>{t('setup.landing.title')}</strong><p>{t('setup.landing.steps')}</p></div>
      <button className="icon-button" type="button" onClick={() => setShowSetupGuide(false)} aria-label={t('setup.landing.dismiss')} title={t('setup.landing.dismiss')}><X aria-hidden="true" size={18} /></button>
    </div> : null}
    <PageBoundary key={activePage.key}>{activePage.render(renderCtx)}</PageBoundary>
  </ConsoleLayout></ConsolePreferencesProvider>;
}
