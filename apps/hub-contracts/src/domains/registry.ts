export type DomainId = 'tasks' | 'system' | 'reimburse' | 'search';
export interface DomainDescriptor {
  id: DomainId;
  title: string;
  group: 'core' | 'pillar' | 'support';
  packages: { contracts?: string; server?: string; console?: string | readonly string[] };
}
export const DOMAINS: readonly DomainDescriptor[] = [
  { id: 'tasks', title: '任务、周工作台、交付验收与 Task 月历', group: 'core',
    packages: { contracts: 'tasks', server: 'tasks', console: ['pm', 'workbench'] } },
  { id: 'system', title: '初始化、会话、成员、组与设置', group: 'core',
    packages: { contracts: 'system', server: 'system', console: ['system', 'settings', 'identity', 'setup'] } },
  { id: 'reimburse', title: '报销条目、材料、核对、核准、打款与导出', group: 'pillar',
    packages: { contracts: 'reimburse', server: 'reimburse', console: 'reimburse' } },
  { id: 'search', title: '任务、成员与报销窄搜索', group: 'support', packages: { server: 'search', console: 'search' } },
] as const;
