import { useEffect, useMemo, useState } from 'react';
import type { Project, Season } from '@teamhub/hub-contracts';
import type { HubApiClient } from '../../../api/client';
import { queryKeys } from '../../../api/queryKeys';
import { useHubMutation } from '../../../hooks/useHubMutation';
import { useBaseline } from '../../baseline/hooks';
import { useProjects, useSeasons } from '../hooks';
import { filterProjectsByScope, todayKey, type CalendarScope } from './model';

export function useTodayKey(override?: string): string {
  const initial = useMemo(() => override ?? todayKey(new Date()), [override]);
  const [key, setKey] = useState(initial);
  useEffect(() => {
    if (override) {
      setKey(override);
      return;
    }
    setKey(todayKey(new Date()));
    const timer = window.setInterval(() => {
      const next = todayKey(new Date());
      setKey((current) => current === next ? current : next);
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [override]);
  return key;
}

export function useCalendarParticipantMutation(
  client: Pick<HubApiClient, 'updateProject'>,
) {
  return useHubMutation({
    meta: { silent: true },
    invalidateKeys: [queryKeys.projects()],
    mutationFn: ({ projectId, memberIds }: { projectId: string; memberIds: string[] }) =>
      client.updateProject(projectId, { memberIds }),
  });
}

export function useCalendarData(
  client: HubApiClient,
  source: string,
  scope: CalendarScope,
  me: string | null | undefined,
  myGroupId: string | null | undefined,
): {
  projectsQuery: ReturnType<typeof useProjects>;
  seasonsQuery: ReturnType<typeof useSeasons>;
  baselineQuery: ReturnType<typeof useBaseline>;
  activeSeason: Season | null;
  filteredProjects: Project[];
  activeSeasonProjectCount: number;
  hiddenCount: number;
} {
  const projectsQuery = useProjects(client);
  const seasonsQuery = useSeasons(client);
  const seasons = seasonsQuery.data?.seasons ?? [];
  const activeSeason = seasons.find((season) => season.status === 'active') ?? seasons[0] ?? null;
  const projects = projectsQuery.data?.projects ?? [];
  const activeSeasonProjects = useMemo(() => projects
    .filter((project) => project.status === 'active' && (!activeSeason || project.seasonId === activeSeason.id))
    .sort((a, b) => (a.startsAt?.slice(0, 10) ?? '9999-99-99').localeCompare(b.startsAt?.slice(0, 10) ?? '9999-99-99') || a.name.localeCompare(b.name)), [projects, activeSeason]);
  const filteredProjects = useMemo(
    () => filterProjectsByScope(activeSeasonProjects, scope, me, myGroupId),
    [activeSeasonProjects, scope, me, myGroupId],
  );
  const baselineQuery = useBaseline(client, source, activeSeason?.id);
  return {
    projectsQuery,
    seasonsQuery,
    baselineQuery,
    activeSeason,
    filteredProjects,
    activeSeasonProjectCount: activeSeasonProjects.length,
    hiddenCount: projects.length - activeSeasonProjects.length,
  };
}
