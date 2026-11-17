export const queryKeys = {
  globalSearch: (query: string) => ['global-search', query] as const,
  allTasks: () => ['tasks'] as const,
  tasks: (source: string) => ['tasks', source] as const,
  tasksSearch: (source: string, q: string) => ['tasks', source, 'search', q] as const,
  groups: (source?: string) => (source ? ['groups', source] as const : ['groups'] as const),
  members: () => ['members'] as const,
  reimburse: {
    all: (source: string) => ['reimburse', source] as const,
    entries: (source: string, filter = 'all') => ['reimburse', source, 'entries', filter] as const,
    batches: (source: string) => ['reimburse', source, 'batches'] as const,
    payouts: (source: string) => ['reimburse', source, 'payouts'] as const,
    summary: (source: string, batchId: string, expenseType: string) =>
      ['reimburse', source, 'summary', batchId, expenseType] as const,
    profile: (source: string) => ['reimburse', source, 'profile'] as const,
    evidence: (source: string, entryId: string) =>
      ['reimburse', source, 'entries', entryId, 'evidence'] as const,
  },
  systemStatus: (source: string) => ['system-status', source] as const,
  setupState: () => ['setup-state'] as const,
  session: () => ['session'] as const,
} as const;
