import { useMemo } from 'react';
import type { BaselineMilestonePublic } from '@teamhub/hub-contracts';
import {
  CONVERGENCE_SCOPE_ALL_LEAF_GROUPS,
  deriveMyVehicleProgress,
  deriveSeasonTaskProgress,
  deriveStagePipeline,
  type StagePipelineStage,
} from '@teamhub/hub-contracts';
import type { HubApiClient } from '../../api/client';
import type { ConsolePage, PageIdentityCtx } from '../../console-pages';
import { useI18n } from '../../i18n';
import { useSeasons } from '../../hooks/useRoster';
import { useTasks } from '../../hooks/useTasks';
import { useBaseline } from '../baseline';
import { splitMyTasks } from '../myview/myview-utils';
import { BaselineOverview } from '../overview/BaselineOverview';
import { useWorkbenchDepGraph } from './hooks';

/**
 * 首页工作台（IA-RESTRUCTURE demo，TEACHING-FLOW 主页信息分层落地）：萌新登录后的落地页，
 * 一屏回答三件事——
 *   ① 我这周要干什么（复用 MY-VIEW 的 dep-graph 派生 + splitMyTasks，不重造过滤逻辑）
 *   ② 还有多久要汇报（复用基准线 milestones：下一个 pending 节点倒计时 + 比赛 T−周数）
 *   ③ 整车到哪了（直接内嵌总览页的 BaselineOverview 组件，零重写）
 * 管理向指标（系统健康/事件流等）留在原总览页，不进本页。
 */

const DAY_MS = 24 * 60 * 60 * 1000;
/** 首页「我这周」卡片上限：超出部分引导去我的视图，保持首屏一屏读完。 */
const MY_WEEK_LIMIT = 5;

export function WorkbenchPage({
  client,
  source,
  identity,
  onNavigate,
}: {
  client: HubApiClient;
  source: string;
  identity: PageIdentityCtx;
  onNavigate: (page: ConsolePage) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="workbench-page">
      <div className="workbench-top">
        <MyWeekSection client={client} source={source} identity={identity} onNavigate={onNavigate} />
        <ReportCountdownSection client={client} source={source} />
      </div>
      <ProgressStripSection client={client} source={source} identity={identity} onNavigate={onNavigate} />
      <section className="workbench-section" aria-label={t('workbench.section.fleet')}>
        <h2 className="workbench-section__title">{t('workbench.section.fleet')}</h2>
        <StagePipelineStrip client={client} source={source} />
        <BaselineOverview
          client={client}
          baselineClient={client}
          source={source}
          identity={identity}
        />
      </section>
    </div>
  );
}

/** ① 我这周要干什么：dep-graph ∩ 我负责 ∩ 未卡住的 compact 列表；被卡住的只给计数，不展开。 */
function MyWeekSection({
  client,
  source,
  identity,
  onNavigate,
}: {
  client: HubApiClient;
  source: string;
  identity: PageIdentityCtx;
  onNavigate: (page: ConsolePage) => void;
}) {
  const { t } = useI18n();
  const session = identity.session;
  const enabled = identity.mode === 'identity' && session !== null;
  const query = useWorkbenchDepGraph(client, source, session, enabled);

  return (
    <section className="workbench-section panel" aria-label={t('workbench.section.myWeek')}>
      <h2 className="workbench-section__title">{t('workbench.section.myWeek')}</h2>
      {identity.mode !== 'identity' ? (
        <p className="workbench-note">{t('workbench.myWeek.needIdentityMode')}</p>
      ) : !session ? (
        <p className="workbench-note">{t('workbench.myWeek.needLogin')}</p>
      ) : query.isLoading ? (
        <p className="workbench-note" role="status" aria-live="polite">
          {t('workbench.myWeek.loading')}
        </p>
      ) : query.error || !query.data ? (
        <p className="workbench-note workbench-note--error" role="alert">
          {t('workbench.myWeek.error')}
        </p>
      ) : (
        <MyWeekList
          nodes={query.data.nodes}
          memberId={session.memberId}
          onNavigate={onNavigate}
        />
      )}
    </section>
  );
}

function MyWeekList({
  nodes,
  memberId,
  onNavigate,
}: {
  nodes: Parameters<typeof splitMyTasks>[0];
  memberId: string;
  onNavigate: (page: ConsolePage) => void;
}) {
  const { t } = useI18n();
  const { doable, blocked } = splitMyTasks(nodes, memberId);
  if (doable.length === 0 && blocked.length === 0) {
    return <p className="workbench-note">{t('workbench.myWeek.empty')}</p>;
  }
  return (
    <>
      <p className="workbench-myweek__summary">
        <span className="workbench-chip workbench-chip--ok">
          {t('workbench.myWeek.doable', { n: doable.length })}
        </span>
        {blocked.length > 0 ? (
          <span className="workbench-chip workbench-chip--warn">
            {t('workbench.myWeek.blocked', { n: blocked.length })}
          </span>
        ) : null}
      </p>
      <ul className="workbench-myweek__list">
        {doable.slice(0, MY_WEEK_LIMIT).map((node) => (
          <li className="workbench-myweek__row" key={node.id}>
            <span className="badge">{node.groupName}</span>
            <span className="workbench-myweek__label">{node.label}</span>
            {node.robotTarget ? (
              <span className="workbench-myweek__robot">{node.robotTarget}</span>
            ) : null}
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="btn btn--secondary workbench-myweek__more"
        onClick={() => onNavigate('myview')}
      >
        {t('workbench.myWeek.more')}
      </button>
    </>
  );
}

/** ② 汇报倒计时：下一个 pending 里程碑/门的天数倒计时 + 比赛 T−周数。 */
function ReportCountdownSection({ client, source }: { client: HubApiClient; source: string }) {
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
              <span className="workbench-countdown__kind">
                {next.kind === 'gate'
                  ? t('workbench.report.kind.gate')
                  : t('workbench.report.kind.milestone')}
              </span>
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
                    <span className="workbench-countdown__kind">
                      {m.kind === 'gate'
                        ? t('workbench.report.kind.gate')
                        : t('workbench.report.kind.milestone')}
                    </span>{' '}
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

/** ④ 进度条双卡（WORKBENCH-MY-VEHICLE / WORKBENCH-SEASON-PROGRESS）：本车（session 派生）与全赛季并列。 */
function ProgressStripSection({
  client,
  source,
  identity,
  onNavigate,
}: {
  client: HubApiClient;
  source: string;
  identity: PageIdentityCtx;
  onNavigate: (page: ConsolePage) => void;
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
              onClick={() => onNavigate('myview')}
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

const STAGE_I18N_KEY: Record<StagePipelineStage, Parameters<ReturnType<typeof useI18n>['t']>[0]> = {
  moduleDesign: 'workbench.stage.moduleDesign',
  moduleAssembly: 'workbench.stage.moduleAssembly',
  moduleTest: 'workbench.stage.moduleTest',
  integratedAssembly: 'workbench.stage.integratedAssembly',
  integratedTest: 'workbench.stage.integratedTest',
  convergence: 'workbench.stage.convergence',
};

/**
 * 整车六阶段 stepper（STAGE-PIPELINE Step1）：用现有 phases 时间窗近似映射六阶段，零 schema
 * 变更看形态（Step2 merge 后才给 milestone 加可选 stage 字段）。「待联调」段附总联调任务计数
 * （CONVERGENCE-TASK-ENTRY 咬合）。赛季级模板一份、不建 per-robot 流水线实例。
 */
function StagePipelineStrip({ client, source }: { client: HubApiClient; source: string }) {
  const { t } = useI18n();
  const now = useMemo(() => new Date().toISOString(), []);
  const seasonsQuery = useSeasons(client);
  const activeSeason = useMemo(() => {
    const seasons = seasonsQuery.data?.seasons ?? [];
    return seasons.find((s) => s.status === 'active') ?? seasons[0];
  }, [seasonsQuery.data]);
  const baselineQuery = useBaseline(client, source, activeSeason?.id);
  const baseline = baselineQuery.data?.baseline ?? null;

  const tasksQuery = useTasks(client, source);
  const convergence = useMemo(() => {
    const list = (tasksQuery.data?.tasks ?? []).filter(
      (tk) => tk.convergenceScope === CONVERGENCE_SCOPE_ALL_LEAF_GROUPS,
    );
    return { done: list.filter((tk) => tk.status === 'done').length, total: list.length };
  }, [tasksQuery.data]);

  if (!baseline) return null;
  const stages = deriveStagePipeline(baseline.phases, baseline.anchors.competitionDate, now);
  if (!stages) {
    return <p className="workbench-note">{t('workbench.stage.empty')}</p>;
  }
  return (
    <div className="workbench-stages" role="list" aria-label={t('workbench.stage.title')}>
      {stages.map((s) => (
        <div className={`workbench-stage workbench-stage--${s.status}`} role="listitem" key={s.stage}>
          <span className="workbench-stage__name">{t(STAGE_I18N_KEY[s.stage])}</span>
          {s.stage === 'convergence' && convergence.total > 0 ? (
            <span className="workbench-stage__sub">
              {t('workbench.stage.convergenceTasks', { done: convergence.done, total: convergence.total })}
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
}
