import { useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { deriveLeafGroups } from '@teamhub/hub-contracts';
import { Bot } from 'lucide-react';
import { EmptyState } from '../../shared/EmptyState';
import type { HubApiClient } from '../../api/client';
import { useResources } from '../../hooks/useSchedule';
import { useTasks } from '../../hooks/useTasks';
import { useGroups } from '../../hooks/useRoster';
import { useI18n } from '../../i18n';
import { MetricTile } from '../../components/MetricTile';
import { CreateResourceForm } from './sub/CreateResourceForm';
import { ResourceRow } from './sub/ResourceRow';

/**
 * 机器人管理页（R3 / D-072 §3.2「机器人 = 带编号对象」+ §3.3 机器人生命周期）。
 * 新建机器人（season + robotTarget + version → 派生 displayCode，**禁手写**）/ 改状态（维修 / 退役 / 拆解 / 恢复）。
 * **退役 = 状态迁移、非物理删除**（整机留展示，ResourceSession 仍引用 resourceId；故全页无删除按钮）。
 * 反监视红线（I0）：SharedResource 结构上无成员维度，本页永不渲染 / 收集 memberId / 出勤。
 */
export function ResourcesPage({
  client,
  source,
}: {
  client: HubApiClient;
  source: string;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const query = useResources(client, source);
  const tasksQuery = useTasks(client, 'resourcesPreset');
  const groupsQuery = useGroups(client, 'resourcesPreset');

  const resources = query.data?.resources ?? [];
  const tasks = tasksQuery.data?.tasks ?? [];
  // 「负责组」下拉候选：组 id -> 组名，来源=GET /api/groups 全量组列表（仅叶子组可进 lineup，
  // 见 docs/domains/resources.md §4；与 TodayPlanTable 同源）+ 各车预设 lineup 引用过的组
  // （兜底：预设引用了被滤掉的组时，既有选中值仍能显示，不留空白 option）。
  const groupOptions = useMemo(() => {
    const groups = groupsQuery.data?.groups ?? [];
    const leaf = new Set(deriveLeafGroups([...groups]));
    const map = new Map<string, string>();
    for (const g of groups) if (leaf.has(g.id)) map.set(g.id, g.name);
    for (const r of resources) {
      for (const entry of r.defaultPreset?.lineup ?? []) {
        if (!map.has(entry.groupId)) map.set(entry.groupId, entry.groupId);
      }
    }
    return map;
  }, [groupsQuery.data, resources]);

  if (query.isLoading) {
    return (
      <div className="state-band" role="status" aria-live="polite">
        {t('resources.loading')}
      </div>
    );
  }
  if (query.error || !query.data) {
    return (
      <div className="state-band state-band-error" role="alert">
        {t('resources.error')}
      </div>
    );
  }

  const activeCount = resources.filter(
    (r) => r.status !== 'retired' && r.status !== 'disassembling',
  ).length;

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['resources'] });
    void queryClient.invalidateQueries({ queryKey: ['relay'] });
  };

  return (
    <div className="resources-page">
      <p className="gaps-intro">{t('resources.intro')}</p>

      <section className="resources-summary" aria-label={t('resources.summary.total')}>
        <MetricTile label={t('resources.summary.total')} value={String(resources.length)} />
        <MetricTile
          label={t('resources.summary.active')}
          value={String(activeCount)}
          accent="green"
        />
      </section>

      <CreateResourceForm client={client} onCreated={refresh} />

      <section className="panel" aria-label={t('resources.table.title')}>
        <h2 className="resources-section-title">{t('resources.table.title')}</h2>
        {resources.length === 0 ? (
          <EmptyState
            icon={Bot}
            title={t('resources.empty')}
            desc={t('resources.empty.desc')}
          />
        ) : (
          <div className="resources-table-wrap">
            <table className="resources-table">
              <thead>
                <tr>
                  <th scope="col">{t('resources.col.code')}</th>
                  <th scope="col">{t('resources.col.name')}</th>
                  <th scope="col">{t('resources.col.kind')}</th>
                  <th scope="col">{t('resources.col.status')}</th>
                  <th scope="col">{t('resources.col.actions')}</th>
                  <th scope="col">{t('resources.col.preset')}</th>
                </tr>
              </thead>
              <tbody>
                {resources.map((r) => (
                  <ResourceRow
                    key={r.id}
                    resource={r}
                    client={client}
                    tasks={tasks}
                    groupOptions={groupOptions}
                    onUpdated={refresh}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
