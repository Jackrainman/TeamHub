import { useEffect, useMemo, useState } from 'react';
import type { Project, Season } from '@teamhub/hub-contracts';
import type { HubApiClient } from '../../../api/client';
import { useBaseline } from '../../baseline/hooks';
import { useProjects, useSeasons } from '../hooks';
import { todayKey } from './model';

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

export function useCalendarData(client: HubApiClient, source: string): {
  projectsQuery: ReturnType<typeof useProjects>;
  seasonsQuery: ReturnType<typeof useSeasons>;
  baselineQuery: ReturnType<typeof useBaseline>;
  activeSeason: Season | null;
  filteredProjects: Project[];
  hiddenCount: number;
} {
  const projectsQuery = useProjects(client);
  const seasonsQuery = useSeasons(client);
  const seasons = seasonsQuery.data?.seasons ?? [];
  const activeSeason = seasons.find((season) => season.status === 'active') ?? seasons[0] ?? null;
  const projects = projectsQuery.data?.projects ?? [];
  const filteredProjects = useMemo(() => projects
    .filter((project) => project.status === 'active' && (!activeSeason || project.seasonId === activeSeason.id))
    .sort((a, b) => (a.startsAt ?? '').localeCompare(b.startsAt ?? '') || a.name.localeCompare(b.name)), [projects, activeSeason]);
  const baselineQuery = useBaseline(client, source, activeSeason?.id);
  return { projectsQuery, seasonsQuery, baselineQuery, activeSeason, filteredProjects, hiddenCount: projects.length - filteredProjects.length };
}
