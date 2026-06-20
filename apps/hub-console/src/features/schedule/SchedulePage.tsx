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

      {recommendations.length === 0 ? (
        <div className="pm-coldstart">
          <h3>{t('schedule.empty.title')}</h3>
          <p>{t('schedule.empty.body')}</p>
        </div>
      ) : (
        <>
          {/* 主推短期视图：队长可编辑的接力交接画布（R1，内部自取 /api/relay 数据）。
              卡片网格降级为下方「明细（按组）」。 */}
          <RelayCanvas client={client} windowLabel={windowLabel} />
          <section className="schedule-detail" aria-label={t('schedule.relay.detailTitle')}>
            <h2 className="inv-section-title">{t('schedule.relay.detailTitle')}</h2>
            <div className="gaps-list">
              {recommendations.map((rec) => (
                <RecommendationCard rec={rec} key={rec.id} />
              ))}
            </div>
          </section>
        </>
      )}
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
        <p className="gap-card__fact" style={{ opacity: 0.7, fontSize: '0.85em' }}>
          {rec.holderTaskLabel}
        </p>
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
