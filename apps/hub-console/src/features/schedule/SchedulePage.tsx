import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { PresenceRecommendation } from '@teamhub/hub-contracts';
import type { HubApiClient } from '../../api/client';
import { queryKeys } from '../../api/queryKeys';
import { useI18n, type TranslationKey } from '../../i18n';
import { segClass } from '../../utils';
import { RelayCanvas } from './RelayCanvas';
import { TodayPlanTable } from './TodayPlanTable';
import { isoToday, relativeSegments } from './date-utils';

// 差异化在场排班（D-029）。反监视纪律（A1/I0）：本页主键是 groupId + resourceId + 任务名，
// 永不渲染 memberId / invitedMemberIds / 出勤计数——只回答「哪个组本窗要不要在场」。
const MODE_KEY: Record<PresenceRecommendation['mode'], TranslationKey> = {
  present: 'schedule.mode.present',
  onCall: 'schedule.mode.onCall',
  free: 'schedule.mode.free',
};

export function SchedulePage({
  client,
  source,
}: {
  client: HubApiClient;
  source: string;
}) {
  const { t } = useI18n();
  // windowLabel = 真实日期串 'YYYY-MM-DD'，一天一计划；默认今天。后端零改动（windowLabel 本就是自由文本）。
  const [windowLabel, setWindowLabel] = useState(isoToday);
  // 三段（今天/明天/后天）在组件生命周期内固定，按挂载日算。
  const [segments] = useState(relativeSegments);

  const query = useQuery({
    queryKey: queryKeys.schedule(source, windowLabel),
    queryFn: () => client.getSchedule(windowLabel),
  });
  // 空状态路由（D-082 §5）：这天 session 数=0 → 自动落表格页；否则落泳道图。
  // 与 TodayPlanTable 内部判「继续昨天」是否可用同一 queryKey（['resource-sessions']，无参数），react-query 去重。
  const sessionsQuery = useQuery({
    queryKey: queryKeys.resourceSessions(),
    queryFn: () => client.getResourceSessions(),
  });
  const todayCount =
    sessionsQuery.data?.sessions.filter((s) => s.windowLabel === windowLabel).length ?? null;

  // 用户手动切换的视图覆盖（表格⇄泳道图双向入口）；换日期时清掉，让空状态判定重新接管默认落点。
  const [manualView, setManualView] = useState<'table' | 'lanes' | null>(null);
  useEffect(() => {
    setManualView(null);
  }, [windowLabel]);
  const view: 'table' | 'lanes' = manualView ?? (todayCount === 0 ? 'table' : 'lanes');

  if (query.isLoading || sessionsQuery.isLoading) {
    return (
      <div className="state-band" role="status" aria-live="polite">
        {t('schedule.loading')}
      </div>
    );
  }
  if (query.error || !query.data) {
    return (
      <div className="state-band state-band-error" role="alert">
        {t('schedule.error')}
      </div>
    );
  }

  const recommendations = query.data.recommendations;

  return (
    <div className="schedule-page">
      <p className="gaps-intro">{t('schedule.intro')}</p>
      <p className="gaps-note">{t('schedule.note')}</p>

      {/* 日期选择器：左=今天/明天/后天分段，右=查找特定日期（windowLabel = 'YYYY-MM-DD'）。 */}
      <div className="schedule-date-bar">
        <div className="schedule-date-seg" role="group" aria-label={t('schedule.date.segLabel')}>
          {segments.map((seg) => (
            <button
              key={seg.iso}
              type="button"
              className={`schedule-date-seg__btn${
                windowLabel === seg.iso ? ' is-active' : ''
              }`}
              aria-pressed={windowLabel === seg.iso}
              onClick={() => setWindowLabel(seg.iso)}
            >
              <span className="schedule-date-seg__name">{t(seg.labelKey)}</span>
              <span className="schedule-date-seg__md">{seg.md}</span>
            </button>
          ))}
        </div>
        <label className="schedule-date-find">
          <span className="schedule-date-find__label">
            {t('schedule.date.findSpecific')}
          </span>
          <input
            className="schedule-date-find__input"
            type="date"
            value={windowLabel}
            onChange={(e) => setWindowLabel(e.target.value)}
          />
        </label>
      </div>

      {/* 表格⇄泳道图双向入口（D-082 §5）：默认落点由空状态判定给，用户随时能手动切换。 */}
      <div className="seg schedule-view-toggle" role="group" aria-label={t('schedule.view.switchLabel')}>
        <button
          type="button"
          className={segClass(view === 'table')}
          aria-pressed={view === 'table'}
          onClick={() => setManualView('table')}
        >
          {t('schedule.view.table')}
        </button>
        <button
          type="button"
          className={segClass(view === 'lanes')}
          aria-pressed={view === 'lanes'}
          onClick={() => setManualView('lanes')}
        >
          {t('schedule.view.lanes')}
        </button>
      </div>

      {view === 'table' ? (
        <TodayPlanTable
          client={client}
          windowLabel={windowLabel}
          onConfirmed={() => setManualView('lanes')}
        />
      ) : (
        // 接力画布**永远渲染**（含「+加一棒」工具条与空态引导卡）——不再被 recommendations.length
        // 短路。否则新一天 0 建议时整块画布连同加棒入口被吞掉成一张没有按钮的死卡
        // （SCHEDULE-DESIGN-LOCK 根因，见 docs/design/schedule-ux-lock.md §0.0）。
        // 空与非空的分支判断全部下沉到 RelayCanvas 内部。
        <RelayCanvas client={client} windowLabel={windowLabel} />
      )}
      {/* 「各组详情」卡片网格只 gate 它自己：有建议才显示（被卡组的「可看资料」收在这里）。 */}
      {recommendations.length > 0 ? (
        <section className="schedule-detail" aria-label={t('schedule.relay.detailTitle')}>
          <h2 className="inv-section-title">{t('schedule.relay.detailTitle')}</h2>
          <div className="gaps-list">
            {recommendations.map((rec) => (
              <RecommendationCard rec={rec} key={rec.id} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function RecommendationCard({ rec }: { rec: PresenceRecommendation }) {
  const { t } = useI18n();
  return (
    <article className={`gap-card gap-card--${rec.mode}`}>
      <header className="gap-card__head">
        {/* B2：present=绿（人要到场）· onCall=琥珀（待命），弱强调灰底染字。 */}
        <span
          className={`badge badge--tint ${rec.mode === 'present' ? 'badge--green' : 'badge--amber'}`}
        >
          {t(MODE_KEY[rec.mode])}
        </span>
        {rec.orderInWindow != null ? (
          <span className="gap-card__count">
            {t('schedule.card.orderLabel')} {rec.orderInWindow}
          </span>
        ) : null}
      </header>
      {/* factStatement = 后端派生的中性事实（组名 + 任务名 + 资源名），无人维度 */}
      <p className="gap-card__fact">{rec.factStatement}</p>
      {rec.holderTaskLabel ? (
        <p className="gap-card__fact gap-card__fact--sub">{rec.holderTaskLabel}</p>
      ) : null}
      {rec.mode === 'free' && rec.relatedKnowledge.length > 0 ? (
        <div className="gap-card__skills">
          <span className="gap-card__skills-label">{t('schedule.card.relatedLabel')}</span>
          {rec.relatedKnowledge.map((k) =>
            k.uri ? (
              <a
                className="gap-chip"
                href={k.uri}
                target="_blank"
                rel="noopener noreferrer"
                key={k.title}
              >
                {k.title}
              </a>
            ) : (
              <span className="gap-chip" key={k.title}>
                {k.title}
              </span>
            ),
          )}
        </div>
      ) : null}
    </article>
  );
}
