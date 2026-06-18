import { useQuery } from '@tanstack/react-query';
import type { DirectionGap } from '@teamhub/hub-contracts';
import type { HubApiClient } from '../../api/client';
import { useI18n, type TranslationKey } from '../../i18n';

// 缺人方向（S2，D-069）。反监视纪律（A1/I0）：本页主键是 groupId + 能力方向 + 缺口数，
// 永不渲染 memberId / 认领人 / "谁该来"——只回答"哪个组缺什么方向"，下钻到人在结构上不可能。
const SEVERITY_KEY: Record<DirectionGap['severity'], TranslationKey> = {
  emerging: 'gaps.severity.emerging',
  pressing: 'gaps.severity.pressing',
};

export function GapsPage({
  client,
  source,
}: {
  client: HubApiClient;
  source: string;
}) {
  const { t } = useI18n();
  const query = useQuery({
    queryKey: ['group-gaps', source],
    queryFn: () => client.getGroupGaps(),
  });

  if (query.isLoading) {
    return <div className="state-band" role="status" aria-live="polite">{t('gaps.loading')}</div>;
  }
  if (query.error || !query.data) {
    return <div className="state-band state-band-error" role="alert">{t('gaps.error')}</div>;
  }

  const gaps = query.data.gaps;

  return (
    <div className="gaps-page">
      <p className="gaps-intro">{t('gaps.intro')}</p>
      <p className="gaps-note">{t('gaps.note')}</p>
      {gaps.length === 0 ? (
        <div className="pm-coldstart">
          <h3>{t('gaps.empty.title')}</h3>
          <p>{t('gaps.empty.body')}</p>
        </div>
      ) : (
        <div className="gaps-list">
          {gaps.map((gap) => (
            <GapCard gap={gap} key={gap.id} />
          ))}
        </div>
      )}
    </div>
  );
}

function GapCard({ gap }: { gap: DirectionGap }) {
  const { t } = useI18n();
  return (
    <article className={`gap-card gap-card--${gap.severity}`}>
      <header className="gap-card__head">
        <span className={`gap-badge gap-badge--${gap.severity}`}>
          {t(SEVERITY_KEY[gap.severity])}
        </span>
        <span className="gap-card__count">
          {gap.evidenceNeedIds.length} · {t('gaps.card.needCountLabel')}
        </span>
      </header>
      {/* factStatement = 后端派生的中性事实（组名 + 缺口数 + 方向），无人维度 */}
      <p className="gap-card__fact">{gap.factStatement}</p>
      {gap.neededSkills.length > 0 ? (
        <div className="gap-card__skills">
          <span className="gap-card__skills-label">{t('gaps.card.skills')}</span>
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
