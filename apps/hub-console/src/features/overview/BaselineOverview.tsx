import { useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { HubApiClient } from '../../api/client';
import { useBaseline } from '../../hooks/useBaseline';
import { useTasks } from '../../hooks/useTasks';
import { useMembers, useGroups, useSeasons } from '../../hooks/useRoster';
import type { PageIdentityCtx } from '../../console-pages';
import { useI18n } from '../../i18n';
import { BaselineTimeline } from './sub/BaselineTimeline';
import { NoSeasonState, BaselineEmptyState } from './sub/BaselineStates';
import { useChecklist } from '../checklist';

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
  identity: PageIdentityCtx;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const now = useMemo(() => new Date(), []);

  const seasonsQuery = useSeasons(client);
  const activeSeason = useMemo(() => {
    const seasons = seasonsQuery.data?.seasons ?? [];
    return seasons.find((s) => s.status === 'active') ?? seasons[0];
  }, [seasonsQuery.data]);
  const seasonId = activeSeason?.id;

  const baselineQuery = useBaseline(client, source, seasonId);
  const tasksQuery = useTasks(client, source);
  const groupsQuery = useGroups(client, 'overview');
  const checklistQuery = useChecklist(client, source, seasonId);
  const membersQuery = useMembers(client, 'checklist');

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
      <NoSeasonState
        client={client}
        onCreated={() =>
          queryClient.invalidateQueries({ queryKey: ['seasons', source] })
        }
      />
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
      source={source}
      identity={identity}
      checklistItems={checklistItems}
      members={members}
    />
  );
}
