import { useMemo } from 'react';
import type { HubApiClient } from '../../../api/client';
import { useI18n } from '../../../i18n';
import { useSeasons, useTasks } from '../../pm/hooks';
import { useBaseline } from '../../baseline';
import { deriveMyVehicleProgress, deriveSeasonTaskProgress } from '@teamhub/hub-contracts';
import type { ConsolePage, PageIdentityCtx } from '../../../console-pages';
export function ProgressStripSection({
  client,
  source,
  identity,
  onNavigate,
}: {
  client: HubApiClient;
  source: string;
  identity: PageIdentityCtx;
  onNavigate?: (page: ConsolePage) => void;
}) {
  const { t } = useI18n();
  const tasksQuery = useTasks(client, source);
  const tasks = useMemo(() => tasksQuery.data?.tasks ?? [], [tasksQuery.data]);

  // 里程碑完成率（全赛季卡小字）：与汇报倒计时同 queryKey 缓存共享，不增发请求。
  const seasonsQuery = useSeasons(client);
  const activeSeason = useMemo(() => {
    const seasons = seasonsQuery.data?.seasons ?? [];
    return seasons.find((s) => s.status === 'active') ?? seasons[0];
  }, [seasonsQuery.data]);
  const baselineQuery = useBaseline(client, source, activeSeason?.id);
  const milestones = baselineQuery.data?.baseline?.milestones ?? [];
  const milestoneDone = milestones.filter((m) => m.status === 'passed').length;

  const session = identity.session;
  const season = deriveSeasonTaskProgress(tasks);
  // 红线（I0）：本车进度只按 session 本人 memberId 派生，不提供查他人入口。
  const myVehicle = session ? deriveMyVehicleProgress(tasks, session.memberId) : null;

  return (
    <div className="workbench-top workbench-progress-strip">
      <section className="workbench-section panel" aria-label={t('workbench.progress.myVehicle')}>
        <h2 className="workbench-section__title">{t('workbench.progress.myVehicle')}</h2>
        {identity.mode !== 'identity' ? (
          <p className="workbench-note">{t('workbench.myWeek.needIdentityMode')}</p>
        ) : !session ? (
          <p className="workbench-note">{t('workbench.myWeek.needLogin')}</p>
        ) : tasksQuery.isLoading ? (
          <p className="workbench-note" role="status" aria-live="polite">
            {t('workbench.myWeek.loading')}
          </p>
        ) : !myVehicle ? (
          <>
            <p className="workbench-note">{t('workbench.progress.emptyVehicle')}</p>
            <button
              type="button"
              className="btn btn--secondary workbench-myweek__more"
              onClick={() => onNavigate?.('workbench')}
            >
              {t('workbench.progress.claim')}
            </button>
          </>
        ) : (
          <>
            <p className="workbench-progress__meta">
              <span className="badge">{myVehicle.robotTarget}</span>
              <span>{t('workbench.progress.doneOf', { done: myVehicle.done, total: myVehicle.total })}</span>
            </p>
            <ProgressBar ratio={myVehicle.ratio} />
          </>
        )}
      </section>
      <section className="workbench-section panel" aria-label={t('workbench.progress.season')}>
        <h2 className="workbench-section__title">{t('workbench.progress.season')}</h2>
        {tasksQuery.isLoading ? (
          <p className="workbench-note" role="status" aria-live="polite">
            {t('workbench.myWeek.loading')}
          </p>
        ) : season.total === 0 ? (
          <p className="workbench-note">{t('workbench.progress.noTasks')}</p>
        ) : (
          <>
            <p className="workbench-progress__meta">
              <span>{t('workbench.progress.doneOf', { done: season.done, total: season.total })}</span>
              {milestones.length > 0 ? (
                <span className="workbench-progress__milestones">
                  {t('workbench.progress.milestones', { done: milestoneDone, total: milestones.length })}
                </span>
              ) : null}
            </p>
            <ProgressBar ratio={season.ratio} />
          </>
        )}
      </section>
    </div>
  );
}

function ProgressBar({ ratio }: { ratio: number }) {
  const pct = Math.round(ratio * 100);
  return (
    <div className="workbench-progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className="workbench-progress__bar" style={{ width: `${pct}%` }} />
      <span className="workbench-progress__pct">{pct}%</span>
    </div>
  );
}
