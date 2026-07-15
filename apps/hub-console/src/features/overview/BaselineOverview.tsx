import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  deriveBaselineDrift,
  deriveChecklistDrift,
  deriveGroupsBehind,
  deriveInvestmentWarnings,
  deriveTimeAccumulationFlags,
  generateRoboconBaselineTemplate,
  type BaselineMilestonePublic,
  type BaselinePhaseType,
  type BaselineSegmentKind,
  type GateChecklistItem,
  type MemberPublic,
  type MilestoneDriftLevel,
  type SeasonBaselinePublic,
  type Task,
} from '@teamhub/hub-contracts';
import type { HubApiClient } from '../../api/client';
import type { PageIdentityCtx } from '../../console-pages';
import { useI18n, type TranslationKey } from '../../i18n';
import { humanizeFormError } from '../../utils';
import { Field } from '../../components/Field';
import { FormGrid } from '../../components/FormGrid';
import { FormActions } from '../../components/FormActions';
import { CountUpNumber } from '../../components/viz/CountUpNumber';
import { GateChecklistCard } from '../checklist/GateChecklistCard';
import { overdueDays } from '../checklist/checklist-utils';
import {
  bandOf,
  currentPhase,
  currentSegment,
  pctOf,
  timelineSpan,
  weeksUntil,
} from './overview-timeline';

const PHASE_KEY: Record<BaselinePhaseType, TranslationKey> = {
  rd: 'enum.phase.rd',
  iterate: 'enum.phase.iterate',
  tuning: 'enum.phase.tuning',
  vacuum: 'enum.phase.vacuum',
};
const SEGMENT_KEY: Record<BaselineSegmentKind, TranslationKey> = {
  semester: 'enum.segment.semester',
  vacation: 'enum.segment.vacation',
  vacuum: 'enum.segment.vacuum',
};

// drift 红黄绿 → .badge tone（B2 归并）：yellow 落 amber 语义轴，红黄绿语义不变。
const LEVEL_TONE: Record<'red' | 'yellow' | 'green', string> = {
  red: 'badge--red',
  yellow: 'badge--amber',
  green: 'badge--green',
};

/** 里程碑 drift 档位 → 人话「快慢」文案（结合里程碑自身 status，红线2：只谈里程碑/门、不点人）。 */
function statusKey(
  milestone: BaselineMilestonePublic,
  level: MilestoneDriftLevel,
): TranslationKey {
  const isGate = milestone.kind === 'gate';
  if (milestone.status === 'passed') {
    return isGate ? 'overview.baseline.ms.passed' : 'overview.baseline.ms.reached';
  }
  if (milestone.status === 'missed') return 'overview.baseline.ms.missed';
  if (level === 'red') {
    return isGate ? 'overview.baseline.ms.overdueGate' : 'overview.baseline.ms.behind';
  }
  if (level === 'yellow') return 'overview.baseline.ms.tight';
  return 'overview.baseline.ms.onTrack';
}

const dateOf = (iso: string): string => iso.slice(0, 10);

/**
 * 总览首屏「基准线 vs 实际」（BASELINE-CORE S6，baseline-design.md §4）：一张横向时间轴 + 里程碑/门
 * 红黄绿节点 + 当前阶段高亮 + 「哪个组慢了」（单位=组，永不人名，红线2）。数据走 S4 GET 路由 + S5 纯派生
 * （console 不重算规则，直接调 hub-contracts 导出的 derive*）。
 */
export function BaselineOverview({
  client,
  source,
  identity,
}: {
  client: HubApiClient;
  source: string;
  // 轻身份（IDENTITY-LITE，I2）：门检查单卡清偿本人一键 / 匿名选人 / 写门禁用依据。
  identity: PageIdentityCtx;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  // 单次求值的「现在」：drift 判定与 now 标记共用，同一渲染内稳定。
  const now = useMemo(() => new Date(), []);

  const seasonsQuery = useQuery({
    queryKey: ['seasons', source],
    queryFn: () => client.getSeasons(),
  });
  const activeSeason = useMemo(() => {
    const seasons = seasonsQuery.data?.seasons ?? [];
    return seasons.find((s) => s.status === 'active') ?? seasons[0];
  }, [seasonsQuery.data]);
  const seasonId = activeSeason?.id;

  const baselineQuery = useQuery({
    queryKey: ['baseline', source, seasonId],
    queryFn: () => client.getBaseline(seasonId as string),
    enabled: Boolean(seasonId),
  });
  const tasksQuery = useQuery({
    queryKey: ['tasks', 'overview', source],
    queryFn: () => client.getTasks(),
  });
  const groupsQuery = useQuery({
    queryKey: ['groups', 'overview', source],
    queryFn: () => client.getGroups(),
  });
  // 门检查单 / 欠条（GATE-CHECKLIST-IOU，D-087）：与全局「快记欠条」共享同一 queryKey，任一处提交后
  // 都失效此键 → 门详情卡 + 告警区即时刷新。checklist / members 为次级数据，未就绪不阻塞基准线渲染。
  const checklistQuery = useQuery({
    queryKey: ['checklist', source, seasonId],
    queryFn: () => client.getChecklist(seasonId as string),
    enabled: Boolean(seasonId),
  });
  // 匿名模式清偿 / 豁免选人的候选（身份模式本人一键不用它）；名册读侧两模式均开（同 GET /api/groups 先例）。
  const membersQuery = useQuery({
    queryKey: ['members', 'checklist', source],
    queryFn: () => client.getMembers(),
  });

  const baseline = baselineQuery.data?.baseline ?? null;
  const tasks = tasksQuery.data?.tasks ?? [];
  const checklistItems = checklistQuery.data?.items ?? [];
  const members = membersQuery.data?.members ?? [];
  const groupName = useMemo(() => {
    const map = new Map<string, string>();
    for (const g of groupsQuery.data?.groups ?? []) map.set(g.id, g.name);
    return (id: string) => map.get(id) ?? id;
  }, [groupsQuery.data]);
  const taskTitle = useMemo(() => {
    const map = new Map<string, string>();
    for (const task of tasks) map.set(task.id, task.title);
    return (id: string) => map.get(id) ?? id;
  }, [tasks]);

  if (seasonsQuery.isLoading || (seasonId && baselineQuery.isLoading)) {
    return (
      <section className="panel panel--hero baseline-hero">
        <div className="baseline-hero__body">
          <div className="state-band" role="status" aria-live="polite">
            {t('overview.baseline.loading')}
          </div>
        </div>
      </section>
    );
  }
  if (seasonsQuery.error || baselineQuery.error) {
    return (
      <section className="panel panel--hero baseline-hero">
        <div className="baseline-hero__body">
          <div className="state-band state-band-error" role="alert">
            {t('overview.baseline.error')}
          </div>
        </div>
      </section>
    );
  }
  if (!seasonId) {
    return (
      <section className="panel panel--hero baseline-hero">
        <div className="baseline-hero__body">
          <div className="state-band" role="status">{t('overview.baseline.noSeason')}</div>
        </div>
      </section>
    );
  }
  if (!baseline) {
    return (
      <BaselineEmptyState
        client={client}
        seasonId={seasonId}
        onSaved={() => queryClient.invalidateQueries({ queryKey: ['baseline', source, seasonId] })}
      />
    );
  }

  return (
    <BaselineTimeline
      baseline={baseline}
      tasks={tasks}
      now={now}
      groupName={groupName}
      taskTitle={taskTitle}
      seasonName={activeSeason?.name}
      client={client}
      seasonId={seasonId}
      identity={identity}
      checklistItems={checklistItems}
      members={members}
      onChecklistChanged={() =>
        queryClient.invalidateQueries({ queryKey: ['checklist', source, seasonId] })
      }
    />
  );
}

/** 已生成基准线：倒计时 hero 头 + 时间轴 + 里程碑节点 + 组落后 + 投资示警 + 门检查单 / 欠条告警。 */
function BaselineTimeline({
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

  // 门检查单 / 欠条派生（GATE-CHECKLIST-IOU，D-087）：
  // - 挂门检查项按 anchorMilestoneId 分桶，供每道门的检查单卡消费（含全状态，事实回看）。
  // - 自选到期日欠条走 deriveChecklistDrift 的周粒度红黄绿：红档（已过期）进告警区。
  // - 全部未清（pending）计数：告警区提示「还有 N 项欠条未清」。
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

  // 倒计时 hero（VISUAL-VITALITY V1 §3.1，全站唯一 signature）：距赛日周数升为 display 级
  // 大数字，阶段文案降为副行；赛日已过（weeks=0）整块不渲染、不摆 0。
  const weeks = competitionDate ? weeksUntil(competitionDate, nowMs) : 0;
  const showCountdown = Boolean(competitionDate) && weeks > 0;
  const phaseMeta = curPhase
    ? t('overview.baseline.currentPhase.noComp', { phase: t(PHASE_KEY[curPhase.type]) })
    : '';

  // 下一个待过的里程碑/门（§3.5）：pending 中 plannedAt 最早者，列表里高亮为「下一站」。
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

      {/* 门检查单 / 欠条告警区（GATE-CHECKLIST-IOU 设计 §6，D-087）：照 investmentWarnings 块先例并列。
          红档欠条（自选到期日已过）逐条列出 + 过期时长；末行提示全部未清（pending）欠条计数。
          仅有未清欠条时才渲染整块（0 未清=无债可提，不占位）。 */}
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
                {/* 门检查单卡（GATE-CHECKLIST-IOU §6）：门=检查项容器，逐门挂一张卡。非门里程碑不挂。 */}
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

/** 空 baseline 态：两锚点 → 生成三版车模板 → PATCH 保存（不做向导，两个日期即可）。 */
function BaselineEmptyState({
  client,
  seasonId,
  onSaved,
}: {
  client: HubApiClient;
  seasonId: string;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const [semesterStart, setSemesterStart] = useState('');
  const [competitionDate, setCompetitionDate] = useState('');

  const mutation = useMutation({
    mutationFn: () => {
      const template = generateRoboconBaselineTemplate({
        semesterStart: `${semesterStart}T00:00:00.000Z`,
        competitionDate: `${competitionDate}T00:00:00.000Z`,
      });
      return client.updateBaseline(seasonId, template);
    },
    onSuccess: () => onSaved(),
  });

  const orderOk =
    !semesterStart || !competitionDate || competitionDate > semesterStart;
  const valid = Boolean(semesterStart && competitionDate && orderOk);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!valid) return;
    mutation.mutate();
  }

  return (
    <section className="panel panel--hero baseline-hero">
      <div className="panel-header">
        <h2>{t('overview.baseline.empty.title')}</h2>
      </div>
      <div className="baseline-hero__body">
      <p className="baseline-muted">{t('overview.baseline.empty.desc')}</p>
      <form className="pm-form" onSubmit={submit}>
        <FormGrid>
          <Field label={t('overview.baseline.empty.semesterStart')} required>
            <input
              type="date"
              value={semesterStart}
              onChange={(e) => setSemesterStart(e.target.value)}
              aria-required
            />
          </Field>
          <Field
            label={t('overview.baseline.empty.competitionDate')}
            required
            error={!orderOk ? t('overview.baseline.empty.dateOrder') : undefined}
          >
            <input
              type="date"
              value={competitionDate}
              onChange={(e) => setCompetitionDate(e.target.value)}
              aria-required
            />
          </Field>
        </FormGrid>
        <FormActions
          submitLabel={t('overview.baseline.empty.generate')}
          submittingLabel={t('overview.baseline.empty.generating')}
          submitting={mutation.isPending}
          disabled={!valid}
          error={
            mutation.error
              ? humanizeFormError(mutation.error, t, 'overview.baseline.empty.error')
              : null
          }
          success={mutation.isSuccess ? t('overview.baseline.empty.success') : null}
        />
      </form>
      </div>
    </section>
  );
}
