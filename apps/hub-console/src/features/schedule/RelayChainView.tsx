import {
  canBoardResource,
  type PresenceRecommendation,
  type SharedResource,
} from '@teamhub/hub-contracts';
import { useI18n, type TranslationKey } from '../../i18n';

// 接力顺序链（D-072 §2.2）：按车并排画「此刻轮到谁、谁可下班」，只表先后、不表钟点（读 orderInWindow）。
// 反监视红线：本视图主键是 车(resourceId) / 组接力位置 / 任务名——**绝不渲染 memberId / 出勤计数**；
// 「谁可下班」是帮人省事的私下提示语气，不上报、不排名（§2.4）。
const MODE_KEY: Record<PresenceRecommendation['mode'], TranslationKey> = {
  present: 'schedule.mode.present',
  onCall: 'schedule.mode.onCall',
  free: 'schedule.mode.free',
};

interface RobotColumn {
  resourceId: string;
  label: string; // displayCode ?? name
  boardable: boolean;
  statusReason: string | null;
  stages: PresenceRecommendation[]; // present，按 orderInWindow 升序（接力顺序）
  onCall: PresenceRecommendation[];
}

function buildColumns(
  recommendations: PresenceRecommendation[],
  resources: SharedResource[],
): RobotColumn[] {
  const byId = new Map(resources.map((r) => [r.id, r]));
  // 出现在 recs 里的车（resourceId 非空）即一列，保持 resources 顺序、其余按首次出现追加。
  const order: string[] = [];
  for (const r of resources) order.push(r.id);
  for (const rec of recommendations) {
    if (rec.resourceId && !order.includes(rec.resourceId)) order.push(rec.resourceId);
  }

  const columns: RobotColumn[] = [];
  for (const resourceId of order) {
    const recs = recommendations.filter((r) => r.resourceId === resourceId);
    if (recs.length === 0) continue;
    const resource = byId.get(resourceId);
    const stages = recs
      .filter((r) => r.mode === 'present')
      .sort((a, b) => (a.orderInWindow ?? 0) - (b.orderInWindow ?? 0));
    const onCall = recs.filter((r) => r.mode === 'onCall');
    columns.push({
      resourceId,
      label: resource?.displayCode ?? resource?.name ?? resourceId,
      boardable: resource ? canBoardResource(resource.status) : true,
      statusReason: resource?.statusReason ?? null,
      stages,
      onCall,
    });
  }
  return columns;
}

export function RelayChainView({
  recommendations,
  resources,
}: {
  recommendations: PresenceRecommendation[];
  resources: SharedResource[];
}) {
  const { t } = useI18n();
  const columns = buildColumns(recommendations, resources);
  // 被卡而空闲（blockedFree，resourceId 为空）→ 「可下班」组，单列在底部（不挂某台车）。
  const offDuty = recommendations.filter(
    (r) => r.mode === 'free' && r.resourceId === null,
  );

  if (columns.length === 0) {
    return (
      <div className="pm-coldstart">
        <h3>{t('schedule.relay.title')}</h3>
        <p>{t('schedule.relay.empty')}</p>
      </div>
    );
  }

  return (
    <div className="relay-chain">
      {/* 多车并排：窗宽不足横向滚动（§6 overflow-x:auto），不挤压单车链。 */}
      <div className="relay-chain__track">
        {columns.map((col) => (
          <section className="relay-col" key={col.resourceId} aria-label={col.label}>
            <header className="relay-col__head">
              <span className="relay-col__robot">{col.label}</span>
            </header>
            {!col.boardable ? (
              <p className="relay-col__closed">
                {t('schedule.relay.boardingClosed', {
                  reason: col.statusReason ?? '—',
                })}
              </p>
            ) : (
              <ol className="relay-stages">
                {col.stages.map((stage, i) => (
                  <li className="relay-stage relay-stage--present" key={stage.id}>
                    <span className="relay-stage__order">
                      {t('schedule.relay.stageOrder', {
                        n: (stage.orderInWindow ?? i) + 1,
                      })}
                    </span>
                    <span className="relay-stage__task">
                      {stage.holderTaskLabel ?? stage.factStatement}
                    </span>
                    <span className="gap-badge gap-badge--present">
                      {t(MODE_KEY.present)}
                    </span>
                  </li>
                ))}
                {col.onCall.length > 0 ? (
                  <li className="relay-stage relay-stage--onCall">
                    <span className="relay-stage__order">{t('schedule.relay.onCall')}</span>
                    <div className="relay-oncall">
                      {col.onCall.map((rec) => (
                        <span className="gap-chip" key={rec.id}>
                          {rec.holderTaskLabel ?? rec.groupId}
                        </span>
                      ))}
                    </div>
                  </li>
                ) : null}
              </ol>
            )}
          </section>
        ))}
      </div>

      {offDuty.length > 0 ? (
        <div className="relay-offduty">
          <span className="relay-offduty__label">{t('schedule.relay.offDuty')}</span>
          {offDuty.map((rec) => (
            <span className="gap-chip gap-chip--free" key={rec.id}>
              {rec.factStatement}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
