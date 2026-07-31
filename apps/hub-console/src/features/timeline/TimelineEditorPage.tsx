import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useI18n } from '../../i18n';
import type { HubApiClient } from '../../api/client';
import { useBaseline } from '../../hooks/useBaseline';
import { queryKeys } from '../../api/queryKeys';
import type { SeasonBaseline, BaselineMilestone } from '@teamhub/hub-contracts';

const OFFSET_OPTIONS = [
  { label: '+1天', days: 1 },
  { label: '+3天', days: 3 },
  { label: '+7天', days: 7 },
  { label: '+14天', days: 14 },
  { label: '今天完成', days: 0 },
  { label: '-3天', days: -3 },
  { label: '-7天', days: -7 },
];

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

export function TimelineEditorPage({ client, source }: { client: HubApiClient; source: string }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const seasonsQuery = useQuery({
    queryKey: queryKeys.seasons(source),
    queryFn: () => client.getSeasons(),
  });

  const seasons = seasonsQuery.data?.seasons ?? [];
  const seasonId = seasons.find((s) => s.status === 'active')?.id ?? seasons[0]?.id ?? null;

  const baselineQuery = useBaseline(client, source, seasonId ?? undefined);

  const baseline: SeasonBaseline | null = baselineQuery.data?.baseline ?? null;

  const patchMutation = useMutation({
    mutationFn: (updated: SeasonBaseline) =>
      client.updateBaseline(seasonId!, {
        anchors: updated.anchors,
        segments: updated.segments,
        phases: updated.phases,
        milestones: updated.milestones,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.baseline(source, seasonId ?? '') });
      setSelectedId(null);
    },
  });

  const applyOffset = (milestone: BaselineMilestone, days: number) => {
    if (!baseline) return;
    const newPlannedAt = days === 0 ? new Date().toISOString() : addDays(milestone.plannedAt, days);
    const updatedMilestones = baseline.milestones.map((m) =>
      m.id === milestone.id ? { ...m, plannedAt: newPlannedAt } : m,
    );
    patchMutation.mutate({ ...baseline, milestones: updatedMilestones });
  };

  const paceInfo = useMemo(() => {
    if (!baseline?.anchors.competitionDate) return null;
    const now = new Date().toISOString();
    const remaining = baseline.milestones.filter(
      (m) => m.status !== 'passed' && m.status !== 'missed',
    );
    const weeksLeft = Math.max(1, daysBetween(now, baseline.anchors.competitionDate) / 7);
    return { remaining: remaining.length, weeksLeft: Math.round(weeksLeft * 10) / 10, perWeek: Math.ceil(remaining.length / weeksLeft * 10) / 10 };
  }, [baseline]);

  if (!seasonId) {
    return <div className="timeline-editor"><p className="state-band">{t('timeline.noSeason')}</p></div>;
  }

  if (!baseline) {
    return <div className="timeline-editor"><p className="state-band">{t('timeline.noBaseline')}</p></div>;
  }

  const sorted = [...baseline.milestones].sort((a, b) => a.plannedAt.localeCompare(b.plannedAt));
  const now = new Date().toISOString();

  return (
    <div className="timeline-editor">
      <div className="timeline-editor__header">
        <h2>{t('timeline.title')}</h2>
        {paceInfo ? (
          <p className="timeline-editor__pace">
            {t('timeline.pace', { remaining: paceInfo.remaining, weeks: paceInfo.weeksLeft, perWeek: paceInfo.perWeek })}
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
                onClick={() => setSelectedId(isSelected ? null : m.id)}
              >
                <span className="timeline-editor__node-dot" />
                <span className="timeline-editor__node-label">{m.title}</span>
                <span className="timeline-editor__node-date">{m.plannedAt.slice(0, 10)}</span>
              </button>
              {isSelected ? (
                <div className="timeline-editor__popover">
                  {OFFSET_OPTIONS.map((opt) => (
                    <button
                      key={opt.label}
                      type="button"
                      className="timeline-editor__opt"
                      disabled={patchMutation.isPending}
                      onClick={() => applyOffset(m, opt.days)}
                    >
                      {opt.label}
                    </button>
                  ))}
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
    </div>
  );
}
