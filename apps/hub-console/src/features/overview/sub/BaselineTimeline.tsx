import { useMemo } from 'react';
import {
  deriveBaselineDrift,
  deriveChecklistDrift,
  deriveGroupsBehind,
  deriveInvestmentWarnings,
  deriveTimeAccumulationFlags,
  type BaselineMilestonePublic,
  type GateChecklistItem,
  type MemberPublic,
  type SeasonBaselinePublic,
  type Task,
} from '@teamhub/hub-contracts';
import type { HubApiClient } from '../../../api/client';
import type { PageIdentityCtx } from '../../../console-pages';
import { useI18n } from '../../../i18n';
import { CountUpNumber } from '../../../components/viz/CountUpNumber';
import { GateChecklistCard } from '../../checklist/GateChecklistCard';
import { overdueDays } from '../../../shared/lib/date-utils';
import {
  bandOf,
  currentPhase,
  currentSegment,
  pctOf,
  timelineSpan,
  weeksUntil,
} from '../overview-timeline';
import { PHASE_KEY, SEGMENT_KEY, LEVEL_TONE, statusKey, dateOf } from './constants';

export function BaselineTimeline({
  baseline,
  tasks,
  now,
  groupName,
  taskTitle,
  seasonName,
  client,
  seasonId,
  identity,
  checklistItems,
  members,
  onChecklistChanged,
}: {
  baseline: SeasonBaselinePublic;
  tasks: Task[];
  now: Date;
  groupName: (id: string) => string;
  taskTitle: (id: string) => string;
  seasonName?: string;
  client: HubApiClient;
  seasonId: string;
  identity: PageIdentityCtx;
  checklistItems: GateChecklistItem[];
  members: MemberPublic[];
  onChecklistChanged: () => void;
}) {
  const { t } = useI18n();
  const nowMs = now.getTime();

  const drift = deriveBaselineDrift(baseline, tasks, now);
  const driftById = useMemo(() => new Map(drift.map((d) => [d.milestoneId, d])), [drift]);
  const groupsBehind = deriveGroupsBehind(drift, tasks);
  const investmentWarnings = deriveInvestmentWarnings(tasks, now);
  const timeAccFlags = deriveTimeAccumulationFlags(tasks);

  const itemsByMilestone = useMemo(() => {
    const map = new Map<string, GateChecklistItem[]>();
    for (const item of checklistItems) {
      if (item.anchorMilestoneId === undefined) continue;
      const arr = map.get(item.anchorMilestoneId) ?? [];
      arr.push(item);
      map.set(item.anchorMilestoneId, arr);
    }
    return map;
  }, [checklistItems]);
  const checklistById = useMemo(
    () => new Map(checklistItems.map((it) => [it.id, it])),
    [checklistItems],
  );
  const overdueIous = deriveChecklistDrift(checklistItems, now).filter((d) => d.level === 'red');
  const pendingIouCount = checklistItems.filter((it) => it.status === 'pending').length;

  const span = timelineSpan(baseline);
  const curSeg = currentSegment(baseline.segments, nowMs);
  const curPhase = currentPhase(baseline.phases, nowMs);
  const nowInRange = span != null && nowMs >= span.startMs && nowMs <= span.endMs;
  const competitionDate = baseline.anchors.competitionDate;

  const weeks = competitionDate ? weeksUntil(competitionDate, nowMs) : 0;
  const showCountdown = Boolean(competitionDate) && weeks > 0;
  const phaseMeta = curPhase
    ? t('overview.baseline.currentPhase.noComp', { phase: t(PHASE_KEY[curPhase.type]) })
    : '';

  const nextMilestoneId = baseline.milestones
    .filter((m) => m.status === 'pending')
    .reduce<BaselineMilestonePublic | null>(
      (acc, m) => (acc == null || m.plannedAt < acc.plannedAt ? m : acc),
      null,
    )?.id;

  return (
    <section className="panel panel--hero baseline-hero" aria-label={t('overview.baseline.title')}>
      <header className="baseline-hero__head">
        <div className="baseline-hero__title">
          <h2>{t('overview.baseline.title')}</h2>
          <span className="baseline-hero__phase">
            {[seasonName, phaseMeta].filter(Boolean).join(' · ')}
          </span>
        </div>
        {showCountdown ? (
          <div
            className="baseline-countdown"
            role="group"
            aria-label={t('overview.baseline.countdown.aria', { weeks })}
          >
            <span className="baseline-countdown__num" aria-hidden="true">
              <span className="baseline-countdown__t">T−</span>
              <CountUpNumber value={weeks} />
            </span>
            <span className="baseline-countdown__meta" aria-hidden="true">
              {t('overview.baseline.countdown.meta', {
                date: dateOf(competitionDate as string),
              })}
            </span>
          </div>
        ) : null}
      </header>

      <div className="baseline-hero__body">
      {investmentWarnings.length > 0 ? (
        <div className="baseline-warn baseline-warn--future" role="note">
          <strong>{t('overview.baseline.invest.title')}</strong>
          <ul>
            {investmentWarnings.map((w) => (
              <li key={w.taskId}>
                {t('overview.baseline.invest.cutFuture', {
                  task: taskTitle(w.taskId),
                  group: groupName(w.groupId),
                  weeks: w.weeksSinceProgress,
                })}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {pendingIouCount > 0 ? (
        <div className="baseline-warn baseline-warn--future" role="note">
          <strong>{t('overview.checklist.warn.title')}</strong>
          {overdueIous.length > 0 ? (
            <ul>
              {overdueIous.map((d) => {
                const item = checklistById.get(d.itemId);
                if (!item || item.anchorDueAt === undefined) return null;
                return (
                  <li key={d.itemId}>
                    {t('overview.checklist.warn.overdue', {
                      title: item.title,
                      days: overdueDays(item.anchorDueAt, now),
                    })}
                  </li>
                );
              })}
            </ul>
          ) : null}
          <p className="baseline-muted">
            {t('overview.checklist.warn.pendingCount', { count: pendingIouCount })}
          </p>
        </div>
      ) : null}

      {span ? (
        <div className="baseline-track-wrap">
          <div className="baseline-track">
            {baseline.segments.map((seg, i) => {
              const b = bandOf(span, seg);
              const current = curSeg === seg;
              return (
                <div
                  key={`${seg.kind}-${i}`}
                  className={`baseline-seg baseline-seg--${seg.kind}${current ? ' is-current' : ''}`}
                  style={{ left: `${b.leftPct}%`, width: `${b.widthPct}%` }}
                  title={seg.label}
                >
                  <span className="baseline-seg__label">
                    {t(SEGMENT_KEY[seg.kind])}
                    {current ? ` · ${t('overview.baseline.hereNow')}` : ''}
                  </span>
                </div>
              );
            })}
            {nowInRange ? (
              <div className="baseline-now" style={{ left: `${pctOf(span, now.toISOString())}%` }}>
                <span>{t('overview.baseline.now')}</span>
              </div>
            ) : null}
            {baseline.milestones.map((m) => {
              const level = driftById.get(m.id)?.level ?? 'green';
              return (
                <span
                  key={m.id}
                  className={`baseline-dot baseline-dot--${level} baseline-dot--${m.kind}`}
                  style={{ left: `${pctOf(span, m.plannedAt)}%` }}
                  title={`${m.title}（${dateOf(m.plannedAt)}）`}
                  aria-hidden="true"
                />
              );
            })}
          </div>
        </div>
      ) : null}

      <ul className="baseline-legend" aria-hidden="true">
        <li><i className="baseline-swatch baseline-swatch--red" />{t('overview.baseline.legend.red')}</li>
        <li><i className="baseline-swatch baseline-swatch--yellow" />{t('overview.baseline.legend.yellow')}</li>
        <li><i className="baseline-swatch baseline-swatch--green" />{t('overview.baseline.legend.green')}</li>
        <li><i className="baseline-swatch baseline-swatch--vacuum" />{t('overview.baseline.legend.vacuum')}</li>
      </ul>

      <ol className="baseline-milestones">
        {baseline.milestones.map((m) => {
          const level = driftById.get(m.id)?.level ?? 'green';
          const isNext = m.id === nextMilestoneId;
          return (
            <li key={m.id} className={`baseline-ms${isNext ? ' baseline-ms--next' : ''}`}>
              <span className={`badge badge--xs ${LEVEL_TONE[level]}`}>
                {t(statusKey(m, level))}
              </span>
              <div className="baseline-ms__body">
                <strong>{m.title}</strong>
                <span className="baseline-ms__meta">
                  <span className={`baseline-chip baseline-chip--${m.kind}`}>
                    {t(m.kind === 'gate' ? 'enum.milestone.gate' : 'enum.milestone.milestone')}
                  </span>
                  {m.robotVersion ? <span className="baseline-chip">{m.robotVersion}</span> : null}
                  <span>{t('overview.baseline.plannedAt', { date: dateOf(m.plannedAt) })}</span>
                </span>
                {m.note ? <p className="baseline-ms__note">{m.note}</p> : null}
                {m.kind === 'gate' ? (
                  <GateChecklistCard
                    client={client}
                    seasonId={seasonId}
                    milestone={m}
                    items={itemsByMilestone.get(m.id) ?? []}
                    identity={identity}
                    members={members}
                    onChanged={onChecklistChanged}
                  />
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>

      <div className="baseline-groups">
        <h3>{t('overview.baseline.groupsBehind.title')}</h3>
        {groupsBehind.length === 0 ? (
          <p className="baseline-muted">{t('overview.baseline.groupsBehind.empty')}</p>
        ) : (
          <ul>
            {groupsBehind.map((g) => (
              <li key={g.groupId} className="baseline-group-row">
                <span className={`badge badge--xs ${LEVEL_TONE[g.level]}`}>
                  {t(g.level === 'red' ? 'overview.baseline.behind' : 'overview.baseline.tight')}
                </span>
                <strong>{groupName(g.groupId)}</strong>
                <span className="baseline-muted">
                  {t('overview.baseline.groupsBehind.count', { count: g.attachedTaskCount })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {timeAccFlags.length > 0 ? (
        <div className="baseline-timeacc" role="note">
          {timeAccFlags.map((f) => (
            <p key={f.taskId}>
              <span className="baseline-timeacc__tag">{f.label}</span>
              {t('overview.baseline.invest.timeAcc', {
                task: taskTitle(f.taskId),
                group: groupName(f.groupId),
              })}
            </p>
          ))}
        </div>
      ) : null}
      </div>
    </section>
  );
}
