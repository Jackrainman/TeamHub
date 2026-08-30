export const queryKeys = {
  tasks: (source: string) => ['tasks', source] as const,
  tasksOverview: (source: string) => ['tasks', 'overview', source] as const,
  tasksSearch: (source: string, q: string) => ['tasks', source, 'search', q] as const,
  tasksTodayPlan: () => ['tasks', 'todayPlan'] as const,
  tasksRelay: () => ['tasks', 'relay'] as const,
  tasksResourcesPreset: () => ['tasks', 'resourcesPreset'] as const,
  depGraph: (source: string) => ['dep-graph', source] as const,
  seasons: (source?: string) => (source ? ['seasons', source] as const : ['seasons'] as const),
  groups: (source?: string) => (source ? ['groups', source] as const : ['groups'] as const),
  members: () => ['members'] as const,
  resources: (source?: string) => (source ? ['resources', source] as const : ['resources'] as const),
  resourceSessions: () => ['resource-sessions'] as const,
  schedule: (source: string, windowLabel: string) => ['schedule', source, windowLabel] as const,
  relay: (windowLabel?: string) =>
    windowLabel ? ['relay', windowLabel] as const : ['relay'] as const,
  inventory: (source: string) => ['inventory', source] as const,
  reimburse: {
    all: (source: string) => ['reimburse', source] as const,
    entries: (source: string) => ['reimburse', source, 'entries'] as const,
    batches: (source: string) => ['reimburse', source, 'batches'] as const,
    profile: (source: string) => ['reimburse', source, 'profile'] as const,
    stockInContext: (source: string) => ['reimburse', source, 'stock-in-context'] as const,
  },
  baseline: {
    all: (source: string) => ['baseline', source] as const,
    season: (source: string, seasonId: string) => ['baseline', source, seasonId] as const,
  },
  checklist: {
    all: (source: string) => ['checklist', source] as const,
    season: (source: string, seasonId: string) => ['checklist', source, seasonId] as const,
  },
  artifacts: (source: string) => ['artifacts', source] as const,
  groupGaps: (source: string) => ['group-gaps', source] as const,
  kbSimilar: (source: string, symptom: string, tagsKey: string) =>
    ['kb-similar', source, symptom, tagsKey] as const,
  hubOverview: (source: string, cacheKey?: string) =>
    cacheKey ? ['hub-overview', source, cacheKey] as const : ['hub-overview', source] as const,
  systemStatus: (source: string) => ['system-status', source] as const,
  larkConfig: () => ['lark-config'] as const,
  larkChats: () => ['lark-chats'] as const,
  setupState: () => ['setup-state'] as const,
  session: () => ['session'] as const,
} as const;
