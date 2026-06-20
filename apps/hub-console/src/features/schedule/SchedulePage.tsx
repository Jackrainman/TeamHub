import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { PresenceRecommendation } from '@teamhub/hub-contracts';
import type { HubApiClient } from '../../api/client';
import { useI18n, type TranslationKey } from '../../i18n';
import { RelayChainView } from './RelayChainView';

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
  // 默认锚到 seed fixture 里的 '今晚'，可通过输入框切换其他窗口标签。
  const [windowLabel, setWindowLabel] = useState('今晚');
  const [inputValue, setInputValue] = useState('今晚');

  const query = useQuery({
    queryKey: ['schedule', source, windowLabel],
    queryFn: () => client.getSchedule(windowLabel),
  });
  // 接力链按车并排需要车的 displayCode 作列头（D-072 §2.2）。独立查询，失败不阻塞主排班视图。
  const resourcesQuery = useQuery({
    queryKey: ['resources', source],
    queryFn: () => client.getResources(),
  });

  function handleApply() {
    const trimmed = inputValue.trim();
    if (trimmed) setWindowLabel(trimmed);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') handleApply();
  }

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

      {/* 窗口标签选择器 */}
      <div className="schedule-window-selector">
        <label className="schedule-window-label" htmlFor="schedule-window-input">
          {t('schedule.windowLabel')}
        </label>
        <input
          id="schedule-window-input"
          className="schedule-window-input"
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t('schedule.windowPlaceholder')}
        />
        <button
          className="schedule-window-apply"
          type="button"
          onClick={handleApply}
        >
          →
        </button>
        <span className="schedule-window-active">
          {windowLabel}
        </span>
      </div>

      {recommendations.length === 0 ? (
        <div className="pm-coldstart">
          <h3>{t('schedule.empty.title')}</h3>
          <p>{t('schedule.empty.body')}</p>
        </div>
      ) : (
        <>
          {/* 主推短期视图：接力顺序链（多车并排）。卡片网格降级为下方「明细（按组）」。 */}
          <RelayChainView
            recommendations={recommendations}
            resources={resourcesQuery.data?.resources ?? []}
          />
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
