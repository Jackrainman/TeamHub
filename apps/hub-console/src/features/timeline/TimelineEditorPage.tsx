import { useMemo, useState } from 'react';
import { deriveBaselinePace, validateBaselineSegments } from '@teamhub/hub-contracts';
import type { SeasonBaseline } from '@teamhub/hub-contracts';
import { useI18n } from '../../i18n';
import type { PageIdentityCtx } from '../../console-pages';
import { useBaseline, useUpdateBaseline, type BaselineSegment } from '../baseline';
import type { SeasonsClient } from '../../features/pm/hooks';
import { useSeasons } from '../../features/pm/hooks';
import { applyMilestoneOffsetDays, setSegmentBoundary } from './lib';

/**
 * 里程碑时间线编辑器（TIMELINE-EDITOR）：全页路由（console-pages 注册 'timeline' 页）。
 * 交互形态 = 点击选偏移档位 + 悬停实时 pace 预览 + segment 低频调整，**刻意不引拖拽库**——
 * 低频编排动作用离散档位比拖拽更可控（拖拽容易误碰，且移动端不可用）。
 */

const OFFSET_OPTIONS = [
  { labelKey: 'timeline.offset.plus1d', days: 1 },
  { labelKey: 'timeline.offset.plus3d', days: 3 },
  { labelKey: 'timeline.offset.plus1w', days: 7 },
  { labelKey: 'timeline.offset.plus2w', days: 14 },
  { labelKey: 'timeline.offset.today', days: 0 },
  { labelKey: 'timeline.offset.minus3d', days: -3 },
  { labelKey: 'timeline.offset.minus1w', days: -7 },
] as const;

/** 段边界草稿：date input 的 'YYYY-MM-DD' 字符串对。 */
interface SegmentDraft {
  start: string;
  end: string;
}

function toDateInput(iso: string): string {
  return iso.slice(0, 10);
}

export function TimelineEditorPage({
  client,
  seasonsClient,
  source,
  identity,
}: {
  client: BaselineSegment;
  seasonsClient: SeasonsClient;
  source: string;
  identity: PageIdentityCtx;
}) {
  const { t } = useI18n();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** 悬停/聚焦中的偏移档位：驱动实时 pace 预览，点击才落库。 */
  const [previewDays, setPreviewDays] = useState<number | null>(null);
  const [segmentDrafts, setSegmentDrafts] = useState<Record<number, SegmentDraft>>({});

  const writeLocked = !identity.canWrite;

  const seasonsQuery = useSeasons(seasonsClient);
  const seasons = seasonsQuery.data?.seasons ?? [];
  const seasonId = seasons.find((s) => s.status === 'active')?.id ?? seasons[0]?.id ?? null;

  const baselineQuery = useBaseline(client, source, seasonId ?? undefined);
  const baseline: SeasonBaseline | null = baselineQuery.data?.baseline ?? null;

  const patchMutation = useUpdateBaseline(client, source, seasonId ?? undefined, () => {
    setSelectedId(null);
    setPreviewDays(null);
    setSegmentDrafts({});
  });

  // 实时 pace 反馈：预览态 = 把悬停档位的偏移应用到选中里程碑后的「假如」节奏，
  // 不落库；指针移开即回到已提交节奏。pace 规则本体在 contracts（deriveBaselinePace）。
  const preview = useMemo(() => {
    if (!baseline || selectedId === null || previewDays === null) return null;
    const milestone = baseline.milestones.find((m) => m.id === selectedId);
    if (!milestone) return null;
    const nowIso = new Date().toISOString();
    const milestones = applyMilestoneOffsetDays(baseline.milestones, selectedId, previewDays, nowIso);
    const target = milestones.find((m) => m.id === selectedId)!;
    return {
      plannedAt: target.plannedAt,
      pace: deriveBaselinePace({ anchors: baseline.anchors, milestones }, new Date()),
      overrunsCompetition: Boolean(
        baseline.anchors.competitionDate && target.plannedAt > baseline.anchors.competitionDate,
      ),
    };
  }, [baseline, selectedId, previewDays]);

  if (!seasonId) {
    return <div className="timeline-editor"><p className="state-band">{t('timeline.noSeason')}</p></div>;
  }

  if (!baseline) {
    return <div className="timeline-editor"><p className="state-band">{t('timeline.noBaseline')}</p></div>;
  }

  const pace = deriveBaselinePace(baseline, new Date());
  const sorted = [...baseline.milestones].sort((a, b) => a.plannedAt.localeCompare(b.plannedAt));
  const now = new Date().toISOString();

  const commitOffset = (milestoneId: string, days: number) => {
    patchMutation.mutate({
      milestones: applyMilestoneOffsetDays(baseline.milestones, milestoneId, days, new Date().toISOString()),
    });
  };

  const draftOf = (index: number): SegmentDraft =>
    segmentDrafts[index] ?? {
      start: toDateInput(baseline.segments[index].startsAt),
      end: toDateInput(baseline.segments[index].endsAt),
    };

  const draftSegments = (index: number) => {
    let segments = setSegmentBoundary(baseline.segments, index, 'startsAt', draftOf(index).start);
    segments = setSegmentBoundary(segments, index, 'endsAt', draftOf(index).end);
    return segments;
  };

  return (
    <div className="timeline-editor">
      <div className="timeline-editor__header">
        <h2>{t('timeline.title')}</h2>
        {pace ? (
          <p className="timeline-editor__pace">
            {t('timeline.pace', { remaining: pace.remaining, weeks: pace.weeksLeft, perWeek: pace.perWeek })}
          </p>
        ) : null}
      </div>

      <div className="timeline-editor__track">
        {sorted.map((m) => {
          const isPast = m.plannedAt < now;
          const isPassed = m.status === 'passed';
          const isSelected = selectedId === m.id;
          return (
            <div key={m.id} className="timeline-editor__node-wrap">
              <button
                type="button"
                className={`timeline-editor__node ${isPassed ? 'timeline-editor__node--passed' : isPast ? 'timeline-editor__node--past' : ''}`}
                onClick={() => {
                  setSelectedId(isSelected ? null : m.id);
                  setPreviewDays(null);
                }}
              >
                <span className="timeline-editor__node-dot" />
                <span className="timeline-editor__node-label">{m.title}</span>
                <span className="timeline-editor__node-date">{m.plannedAt.slice(0, 10)}</span>
              </button>
              {isSelected ? (
                <div className="timeline-editor__popover">
                  {OFFSET_OPTIONS.map((opt) => (
                    <button
                      key={opt.labelKey}
                      type="button"
                      className="timeline-editor__opt"
                      disabled={writeLocked || patchMutation.isPending}
                      onMouseEnter={() => setPreviewDays(opt.days)}
                      onFocus={() => setPreviewDays(opt.days)}
                      onMouseLeave={() => setPreviewDays(null)}
                      onBlur={() => setPreviewDays(null)}
                      onClick={() => commitOffset(m.id, opt.days)}
                    >
                      {t(opt.labelKey)}
                    </button>
                  ))}
                  {preview ? (
                    <p
                      className={`timeline-editor__preview ${preview.overrunsCompetition ? 'timeline-editor__preview--overrun' : ''}`}
                    >
                      {t('timeline.preview.date', { date: preview.plannedAt.slice(0, 10) })}
                      {preview.pace
                        ? ` · ${t('timeline.preview.pace', { perWeek: preview.pace.perWeek })}`
                        : ''}
                      {preview.overrunsCompetition ? ` · ${t('timeline.preview.overrun')}` : ''}
                    </p>
                  ) : null}
                  {writeLocked ? <p className="timeline-editor__hint">{t('identity.writeHint')}</p> : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {baseline.anchors.competitionDate ? (
        <p className="timeline-editor__anchor">
          {t('timeline.competition')}: {baseline.anchors.competitionDate.slice(0, 10)}
        </p>
      ) : null}

      {baseline.segments.length > 0 ? (
        <details className="card timeline-editor__segments">
          <summary>{t('timeline.segments.title')}</summary>
          <p className="timeline-editor__hint">{t('timeline.segments.note')}</p>
          {baseline.segments.map((segment, index) => {
            const draft = draftOf(index);
            const segments = draftSegments(index);
            const invalid = validateBaselineSegments(segments) !== null;
            const dirty =
              draft.start !== toDateInput(segment.startsAt) || draft.end !== toDateInput(segment.endsAt);
            return (
              <div key={`${segment.label}-${index}`} className="timeline-editor__segment-row">
                <span className="timeline-editor__segment-label">{segment.label}</span>
                <label className="gate-field">
                  <span>{t('timeline.segments.start')}</span>
                  <input
                    type="date"
                    value={draft.start}
                    disabled={writeLocked || patchMutation.isPending}
                    onChange={(e) =>
                      setSegmentDrafts((prev) => ({ ...prev, [index]: { ...draftOf(index), start: e.target.value } }))
                    }
                  />
                </label>
                <label className="gate-field">
                  <span>{t('timeline.segments.end')}</span>
                  <input
                    type="date"
                    value={draft.end}
                    disabled={writeLocked || patchMutation.isPending}
                    onChange={(e) =>
                      setSegmentDrafts((prev) => ({ ...prev, [index]: { ...draftOf(index), end: e.target.value } }))
                    }
                  />
                </label>
                <button
                  type="button"
                  className="timeline-editor__opt"
                  disabled={writeLocked || invalid || !dirty || patchMutation.isPending}
                  onClick={() => patchMutation.mutate({ segments })}
                >
                  {t('timeline.segments.apply')}
                </button>
              </div>
            );
          })}
          {writeLocked ? <p className="timeline-editor__hint">{t('identity.writeHint')}</p> : null}
        </details>
      ) : null}
    </div>
  );
}
