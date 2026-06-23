import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { PresenceRecommendation } from '@teamhub/hub-contracts';
import type { HubApiClient } from '../../api/client';
import { useI18n, type TranslationKey } from '../../i18n';
import { RelayCanvas } from './RelayCanvas';
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
    queryKey: ['schedule', source, windowLabel],
    queryFn: () => client.getSchedule(windowLabel),
  });

  if (query.isLoading) {
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
        <div className="schedule-date-seg" role="group">
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

      {/* 接力画布**永远渲染**（含「+加一棒」工具条与空态引导卡）——不再被 recommendations.length
          短路。否则新一天 0 建议时整块画布连同加棒入口被吞掉成一张没有按钮的死卡
          （SCHEDULE-DESIGN-LOCK 根因，见 docs/design/schedule-ux-lock.md §0.0）。
          空与非空的分支判断全部下沉到 RelayCanvas 内部。 */}
      <RelayCanvas client={client} windowLabel={windowLabel} />
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
        <span className={`gap-badge gap-badge--${rec.mode}`}>
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
