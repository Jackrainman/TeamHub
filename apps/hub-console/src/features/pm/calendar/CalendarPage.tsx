import type { HubApiClient } from '../../../api/client';
import type { ConsolePage, PageIdentityCtx } from '../../../console-pages';
import { useI18n } from '../../../i18n';
import { EmptyState } from '../../../shared/EmptyState';
import { dateKeyOf } from './model';

export function CalendarPage({ client, source, projectId, identity, onNavigate, todayOverride }: {
  client: HubApiClient;
  source: string;
  projectId: string;
  identity: PageIdentityCtx;
  onNavigate: (page: ConsolePage) => void;
  todayOverride?: string;
}): JSX.Element {
  const { t } = useI18n();
  void client;
  void source;
  void projectId;
  void identity;
  void onNavigate;
  return <div className="calendar-page" data-today={todayOverride ? dateKeyOf(todayOverride) ?? undefined : undefined}>
    <h1>{t('expected.nav.calendar')}</h1>
    <EmptyState title={t('calendar.empty.projects.title')} desc={t('calendar.empty.projects.desc')} />
  </div>;
}
