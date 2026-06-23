import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { LayoutGrid, Network } from 'lucide-react';
import type { HubApiClient } from '../../api/client';
import { useI18n } from '../../i18n';
import { segClass } from '../../utils';
import { SideDrawer } from '../../components/SideDrawer';
import { PmBoardPage } from '../pm/PmBoardPage';
import { PmCreatePanel } from '../pm/PmCreatePanel';
import { DepGraphPage } from '../dep-graph/DepGraphPage';

type ProjectView = 'board' | 'graph';

/**
 * 项目页（IA 阶段 2 / D-075「组合不重写」）：看板(pm)+依赖图(dep-graph) 两视图顶部切换。
 * 不含 gaps —— 缺人方向按用户拍板保留独立顶级导航项（洞察区），不并入此页。
 *
 * 跨视图跳转内化：原 App.tsx 的 focusTaskId 跨页 plumbing 收进本页 state。看板卡片
 * 「在依赖图看」→ setView('graph')+setFocus(id)，DepGraphPage 加载后选中并 onConsumeFocus 清空。
 *
 * 新建任务抽屉提升至本页：看板与依赖图各有「新建任务」按钮 → 共享同一个右侧 SideDrawer 就地建任务，
 * 不再切视图。表单需要的 tasks 在此处用 ['tasks',source] 拉取（与两子页命中同一缓存，零额外请求）；
 * 建成功后同时失效 ['tasks'] 与 ['dep-graph']，使看板与依赖图都即时刷新。
 *
 * @xyflow：DepGraphPage 仅在 graph 视图激活时条件 mount（非 display:hidden），规避 D-075 踩过的
 * ReactFlow visibility:hidden/塌高 bug；画布定高在 DepGraph 自身 CSS（沿用 clamp 内容无关定高）。
 * 两视图共享 ['tasks',source] 缓存，切回看板命中缓存无闪烁。
 *
 * I0：本页只组合、不新增渲染数据；两子页结构上均无成员/出勤维度。
 */
export function ProjectPage({
  client,
  source,
}: {
  client: HubApiClient;
  source: string;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  // 依赖图为项目页默认视图（用户拍板）：先看「卡在哪/谁空着」的结构图，看板退第二。
  const [view, setView] = useState<ProjectView>('graph');
  // 看板「在依赖图看此节点」目标 id：DepGraphPage 加载后选中并消费掉（页内、不跨页）。
  const [focusTaskId, setFocusTaskId] = useState<string | null>(null);
  // 新建任务抽屉开关（看板 / 依赖图共享）。
  const [createOpen, setCreateOpen] = useState(false);

  // 抽屉表单用的 tasks：与 board/graph 命中同一缓存，无额外网络。
  const tasksQuery = useQuery({
    queryKey: ['tasks', source],
    queryFn: () => client.getTasks(),
  });

  // 建成功后失效任务与依赖图两份查询 → 看板新增卡片、依赖图新增节点同步刷新。
  const onCreated = () => {
    void queryClient.invalidateQueries({ queryKey: ['tasks', source] });
    void queryClient.invalidateQueries({ queryKey: ['dep-graph', source] });
  };

  return (
    <div className="project-page">
      <div
        className="seg project-view-switch"
        role="tablist"
        aria-label={t('project.view.aria')}
      >
        <button
          type="button"
          role="tab"
          id="project-view-board-btn"
          aria-selected={view === 'board'}
          aria-controls="project-view-board"
          className={segClass(view === 'board')}
          onClick={() => setView('board')}
        >
          <LayoutGrid size={14} aria-hidden="true" /> {t('project.view.board')}
        </button>
        <button
          type="button"
          role="tab"
          id="project-view-graph-btn"
          aria-selected={view === 'graph'}
          aria-controls="project-view-graph"
          className={segClass(view === 'graph')}
          onClick={() => setView('graph')}
        >
          <Network size={14} aria-hidden="true" /> {t('project.view.graph')}
        </button>
      </div>
      {/* 条件 mount：隐藏视图整体卸载，规避 ReactFlow 塌高；board↔graph 共享 tasks 缓存 */}
      {view === 'board' ? (
        <div
          role="tabpanel"
          id="project-view-board"
          aria-labelledby="project-view-board-btn"
          tabIndex={0}
        >
          <PmBoardPage
            client={client}
            source={source}
            onNewTask={() => setCreateOpen(true)}
            onOpenInDepGraph={(id) => {
              setFocusTaskId(id);
              setView('graph');
            }}
          />
        </div>
      ) : (
        <div
          role="tabpanel"
          id="project-view-graph"
          aria-labelledby="project-view-graph-btn"
          tabIndex={0}
        >
          <DepGraphPage
            client={client}
            source={source}
            focusTaskId={focusTaskId}
            onConsumeFocus={() => setFocusTaskId(null)}
            onNewTask={() => setCreateOpen(true)}
          />
        </div>
      )}
      <SideDrawer
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title={t('pm.create.open')}
      >
        <PmCreatePanel
          client={client}
          tasks={tasksQuery.data?.tasks ?? []}
          onCreated={onCreated}
        />
      </SideDrawer>
    </div>
  );
}
