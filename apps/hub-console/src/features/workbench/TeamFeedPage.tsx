import { MessageSquare } from 'lucide-react';
import type { HubApiClient } from '../../api/client';
import { useI18n } from '../../i18n';
import { BaselineWidget } from '../baseline/components/BaselineWidget';

export function TeamFeedPage({ client, source }: { client: HubApiClient; source: string }) {
  const { t } = useI18n();
  return <><p className="expected-page-hint">{t('expected.feedHint')}</p><div className="team-feed-layout">
    <section className="card team-feed-planned"><MessageSquare size={30} /><span className="badge">{t('week.planned')}</span><h2>{t('week.teamNews')}</h2><p>{t('week.plannedHint')}</p></section>
    <aside><BaselineWidget client={client} source={source} /><section className="card team-feed-boundary"><h2>{t('expected.feedBoundary')}</h2><p>{t('expected.feedBoundaryHint')}</p></section></aside>
  </div></>;
}
