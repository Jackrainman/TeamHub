import { useMemo } from 'react';
import type { HubApiClient } from '../../../api/client';
import { useI18n } from '../../../i18n';
import { useSeasons } from '../../pm/hooks';
import { useBaseline } from '../../baseline';
import type { BaselineMilestonePublic } from '@teamhub/hub-contracts';
const DAY_MS = 24 * 60 * 60 * 1000;
export function ReportCountdownSection({ client, source }: { client: HubApiClient; source: string }) {
  const { t } = useI18n();
  const now = useMemo(() => new Date(), []);
  const seasonsQuery = useSeasons(client);
  const activeSeason = useMemo(() => {
    const seasons = seasonsQuery.data?.seasons ?? [];
    return seasons.find((s) => s.status === 'active') ?? seasons[0];
  }, [seasonsQuery.data]);
  const baselineQuery = useBaseline(client, source, activeSeason?.id);
  const baseline = baselineQuery.data?.baseline ?? null;

  const pending = useMemo(() => {
    if (!baseline) return [];
    return baseline.milestones
      .filter((m) => m.status === 'pending')
      .slice()
      .sort((a, b) => (a.plannedAt < b.plannedAt ? -1 : 1));
  }, [baseline]);
  const next = pending[0] ?? null;
  const upcoming = pending.slice(1, 4);

  const competitionDate = baseline?.anchors.competitionDate;
  const competitionWeeks = competitionDate
    ? Math.max(0, Math.ceil((new Date(competitionDate).getTime() - now.getTime()) / (7 * DAY_MS)))
    : null;

  return (
    <section className="workbench-section panel" aria-label={t('workbench.section.report')}>
      <h2 className="workbench-section__title">{t('workbench.section.report')}</h2>
      {seasonsQuery.isLoading || (activeSeason && baselineQuery.isLoading) ? (
        <p className="workbench-note" role="status" aria-live="polite">
          {t('workbench.myWeek.loading')}
        </p>
      ) : !baseline || !next ? (
        <p className="workbench-note">{t('workbench.report.none')}</p>
      ) : (
        <>
          <div className="workbench-countdown">
            <span className="workbench-countdown__num">
              <CountdownDays milestone={next} nowMs={now.getTime()} />
            </span>
            <div className="workbench-countdown__meta">
              <strong className="workbench-countdown__title">{next.title}</strong>
              <span className="workbench-countdown__date">
                {next.plannedAt.slice(0, 10)}
              </span>
            </div>
          </div>
          {competitionWeeks !== null ? (
            <p className="workbench-report__competition">
              {t('workbench.report.competition')}{' '}
              <strong>{t('workbench.report.weeksLeft', { n: competitionWeeks })}</strong>
            </p>
          ) : null}
          {upcoming.length > 0 ? (
            <div className="workbench-report__upcoming">
              <span className="workbench-report__upcoming-label">
                {t('workbench.report.upcoming')}
              </span>
              <ul>
                {upcoming.map((m) => (
                  <li key={m.id}>
                    {m.title}
                    <span className="workbench-countdown__date"> {m.plannedAt.slice(0, 10)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

function CountdownDays({ milestone, nowMs }: { milestone: BaselineMilestonePublic; nowMs: number }) {
  const { t } = useI18n();
  const days = Math.ceil((new Date(milestone.plannedAt).getTime() - nowMs) / DAY_MS);
  if (days > 0) return <>{t('workbench.report.daysLeft', { n: days })}</>;
  if (days === 0) return <>{t('workbench.report.today')}</>;
  return <>{t('workbench.report.overdue', { n: -days })}</>;
}
