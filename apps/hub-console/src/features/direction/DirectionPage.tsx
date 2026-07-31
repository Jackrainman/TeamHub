import { lazy, Suspense, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AI_BOUNDARY_CROSSCUT,
  ROBOTICS_LEARNING_MAP,
  ROBOTICS_LEARNING_SEED_GAPS,
} from '@teamhub/hub-contracts';
import type { HubApiClient } from '../../api/client';
import { queryKeys } from '../../api/queryKeys';
import { useGroups } from '../../hooks/useRoster';
import type { PageIdentityCtx } from '../../console-pages';
import { useI18n, type TranslationKey } from '../../i18n';
import { GROUP_LABEL_KEY } from '../../verticals/robotics';
import {
  buildDirectionView,
  type DirectionColumn,
  type DirectionColumnGap,
} from './learning-direction-utils';

// 星图 = 双 UI 之二（实验性 3D 视图），懒加载单开 chunk：不进入口包，不看星图不下载。
const DirectionStarmap = lazy(() => import('./DirectionStarmap'));

/**
 * 学习方向页（LEARN-DIRECTION-REDESIGN，product-redefine §5，原「缺人方向」组级页改造）。
 *
 * **定位翻转**：从"组级缺人"→"对个人的学习建议"。展示 = 跨工种学习地图（静态资产，
 * `ROBOTICS_LEARNING_MAP`）× 队内缺口（`deriveDirectionGaps` 组级派生，永不指向人）+
 * 已知种子缺口（`ROBOTICS_LEARNING_SEED_GAPS`，如 sim2real「现状没人研究」）。
 *
 * **红线6 自查**：无"推荐：某人"——个性化只做"排序 + 高亮"（把本人所在组的列排到最前），
 * 不做过滤、不做指派、不点名；语气恒是对"你"说，不是对第三方评价谁。无常驻人员能力页——
 * 地图主键是 discipline（工种），不是 memberId。
 *
 * **匿名模式一等公民**：地图 + 队内缺口两个数据源本身与身份模式无关（现状即读一切），
 * 匿名模式 / 未登录时页面正常渲染，只是不做个性化排序——恒用地图静态顺序。
 */
export function DirectionPage({
  client,
  source,
  identity,
}: {
  client: HubApiClient;
  source: string;
  identity: PageIdentityCtx;
}) {
  const { t } = useI18n();
  // 双 UI（用户 2026-07-12 拍板）：指南=信息权威（列表语义、可访问性完整），星图=增强呈现。
  const [viewMode, setViewMode] = useState<'guide' | 'starmap'>('guide');
  const groupsQuery = useGroups(client, source);
  const gapsQuery = useQuery({
    queryKey: queryKeys.groupGaps(source),
    queryFn: () => client.getGroupGaps(),
  });

  if (groupsQuery.isLoading || gapsQuery.isLoading) {
    return (
      <div className="state-band" role="status" aria-live="polite">
        {t('direction.loading')}
      </div>
    );
  }
  if (groupsQuery.error || !groupsQuery.data || gapsQuery.error || !gapsQuery.data) {
    return (
      <div className="state-band state-band-error" role="alert">
        {t('direction.error')}
      </div>
    );
  }

  // 身份模式已登录 → 本人所在组；匿名模式 / 未登录 → null（地图保持通用顺序，不个性化）。
  const sessionGroupId =
    identity.mode === 'identity' && identity.session ? identity.session.groupId : null;

  const view = buildDirectionView(
    ROBOTICS_LEARNING_MAP,
    ROBOTICS_LEARNING_SEED_GAPS,
    groupsQuery.data.groups,
    gapsQuery.data.gaps,
    sessionGroupId,
  );
  const myColumn = view.columns.find((c) => c.isMine) ?? null;

  return (
    // .gaps-page 复用（MY-VIEW 先例：本页与 GapsPage 原本共享的 gaps-intro/gaps-note/gaps-list/
    // gap-card 一档一并沿用，新增 .direction-* 只覆盖真正新的视觉元素——学习地图列 + AI 边界横条）。
    <div className="gaps-page">
      <div className="direction-viewbar">
        <div className="seg" role="tablist">
          <button
            className={`seg__btn${viewMode === 'guide' ? ' seg__btn--active' : ''}`}
            onClick={() => setViewMode('guide')}
            role="tab"
            aria-selected={viewMode === 'guide'}
            type="button"
          >
            {t('direction.view.guide')}
          </button>
          <button
            className={`seg__btn${viewMode === 'starmap' ? ' seg__btn--active' : ''}`}
            onClick={() => setViewMode('starmap')}
            role="tab"
            aria-selected={viewMode === 'starmap'}
            type="button"
          >
            {t('direction.view.starmap')}
          </button>
        </div>
        {viewMode === 'starmap' ? (
          <p className="direction-starmap__hint">{t('direction.starmap.hint')}</p>
        ) : null}
      </div>

      {viewMode === 'starmap' ? (
        <Suspense
          fallback={
            <div className="state-band" role="status" aria-live="polite">
              {t('direction.loading')}
            </div>
          }
        >
          <DirectionStarmap
            columns={view.columns}
            crosscutSummary={AI_BOUNDARY_CROSSCUT.summary}
            mineDiscipline={myColumn?.discipline ?? null}
          />
        </Suspense>
      ) : null}

      {viewMode === 'starmap' ? null : (
        <>
      <p className="gaps-intro">
        {myColumn
          ? t('direction.intro.personalized', { group: t(GROUP_LABEL_KEY[myColumn.discipline]) })
          : t('direction.intro.generic')}
      </p>
      <p className="gaps-note">{t('direction.note')}</p>

      <div className="direction-crosscut">
        <span className="direction-crosscut__label">{t('direction.aiBoundary.label')}</span>
        <p className="direction-crosscut__summary">{AI_BOUNDARY_CROSSCUT.summary}</p>
        <p className="gaps-note">{AI_BOUNDARY_CROSSCUT.example}</p>
      </div>

      <div className="direction-map">
        {view.columns.map((column) => (
          <DirectionColumnCard column={column} key={column.discipline} />
        ))}
      </div>

      {view.unmatchedGaps.length > 0 ? (
        <section>
          <h2 className="myview-section-title">{t('direction.unmatched.title')}</h2>
          <div className="gaps-list">
            {view.unmatchedGaps.map((gap) => (
              <UnmatchedGapCard gap={gap} key={gap.id} />
            ))}
          </div>
        </section>
      ) : null}
        </>
      )}
    </div>
  );
}

const SEVERITY_KEY: Record<DirectionColumnGap['severity'], TranslationKey> = {
  emerging: 'direction.severity.emerging',
  pressing: 'direction.severity.pressing',
};

function DirectionColumnCard({ column }: { column: DirectionColumn }) {
  const { t } = useI18n();
  return (
    <article className={`direction-column${column.isMine ? ' direction-column--mine' : ''}`}>
      <header className="direction-column__head">
        <h3 className="direction-column__title">{t(GROUP_LABEL_KEY[column.discipline])}</h3>
        {column.note ? <span className="badge">{column.note}</span> : null}
        {column.isMine ? (
          <span className="badge badge--tint badge--green">{t('direction.column.mine')}</span>
        ) : null}
      </header>
      <ul className="direction-column__skills">
        {column.crossSkillItems.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>

      {column.seedGaps.length > 0 ? (
        <div className="direction-column__seeds">
          {column.seedGaps.map((seed) => (
            <div className="direction-seed" key={seed.id}>
              <span className="badge">{t('direction.column.seed.badge')}</span>
              <p className="gap-card__fact">{seed.statement}</p>
            </div>
          ))}
        </div>
      ) : null}

      <div className="direction-column__gaps">
        <span className="gap-card__skills-label">{t('direction.column.gaps.title')}</span>
        {column.liveGaps.length === 0 ? (
          <p className="gaps-note">{t('direction.column.gaps.empty')}</p>
        ) : (
          column.liveGaps.map((gap) => <DirectionGapRow gap={gap} key={gap.id} />)
        )}
      </div>
    </article>
  );
}

function DirectionGapRow({ gap }: { gap: DirectionColumnGap }) {
  const { t } = useI18n();
  return (
    <div className={`direction-gap-row direction-gap-row--${gap.severity}`}>
      {/* 严重度=弱强调徽章（B2）：pressing 染红、emerging 沿现状不上色。 */}
      <span className={`badge badge--tint${gap.severity === 'pressing' ? ' badge--red' : ''}`}>
        {t(SEVERITY_KEY[gap.severity])}
      </span>
      <p className="gap-card__fact">{gap.factStatement}</p>
      {gap.neededSkills.length > 0 ? (
        <div className="gap-card__skills">
          <span className="gap-card__skills-label">{t('direction.card.skills')}</span>
          {gap.neededSkills.map((skill) => (
            <span className="gap-chip" key={skill}>
              {skill}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function UnmatchedGapCard({ gap }: { gap: DirectionColumnGap }) {
  const { t } = useI18n();
  return (
    <article className={`gap-card gap-card--${gap.severity}`}>
      <header className="gap-card__head">
        <span className={`badge badge--tint${gap.severity === 'pressing' ? ' badge--red' : ''}`}>
          {t(SEVERITY_KEY[gap.severity])}
        </span>
        <span className="gap-card__count">{t('direction.card.needCount', { n: gap.needCount })}</span>
      </header>
      <p className="gap-card__fact">{gap.factStatement}</p>
      {gap.neededSkills.length > 0 ? (
        <div className="gap-card__skills">
          <span className="gap-card__skills-label">{t('direction.card.skills')}</span>
          {gap.neededSkills.map((skill) => (
            <span className="gap-chip" key={skill}>
              {skill}
            </span>
          ))}
        </div>
      ) : null}
    </article>
  );
}
