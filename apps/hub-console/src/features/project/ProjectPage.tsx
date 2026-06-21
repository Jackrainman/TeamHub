import { useState } from 'react';
import { LayoutGrid, Network } from 'lucide-react';
import type { HubApiClient } from '../../api/client';
import { useI18n } from '../../i18n';
import { segClass } from '../../utils';
import { PmBoardPage } from '../pm/PmBoardPage';
import { DepGraphPage } from '../dep-graph/DepGraphPage';

type ProjectView = 'board' | 'graph';

/**
 * 项目页（IA 阶段 2 / D-075「组合不重写」）：看板(pm)+依赖图(dep-graph) 两视图顶部切换。
 * 不含 gaps —— 缺人方向按用户拍板保留独立顶级导航项（洞察区），不并入此页。
 *
 * 跨视图跳转内化：原 App.tsx 的 focusTaskId 跨页 plumbing 收进本页 state。看板卡片
 * 「在依赖图看」→ setView('graph')+setFocus(id)，DepGraphPage 加载后选中并 onConsumeFocus 清空。
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
  const [view, setView] = useState<ProjectView>('board');
  // 看板「在依赖图看此节点」目标 id：DepGraphPage 加载后选中并消费掉（页内、不跨页）。
  const [focusTaskId, setFocusTaskId] = useState<string | null>(null);

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
          aria-selected={view === 'board'}
          className={segClass(view === 'board')}
          onClick={() => setView('board')}
        >
          <LayoutGrid size={14} aria-hidden="true" /> {t('project.view.board')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === 'graph'}
          className={segClass(view === 'graph')}
          onClick={() => setView('graph')}
        >
          <Network size={14} aria-hidden="true" /> {t('project.view.graph')}
        </button>
      </div>
      {/* 条件 mount：隐藏视图整体卸载，规避 ReactFlow 塌高；board↔graph 共享 tasks 缓存 */}
      {view === 'board' ? (
        <PmBoardPage
          client={client}
          source={source}
          onOpenInDepGraph={(id) => {
            setFocusTaskId(id);
            setView('graph');
          }}
        />
      ) : (
        <DepGraphPage
          client={client}
          source={source}
          focusTaskId={focusTaskId}
          onConsumeFocus={() => setFocusTaskId(null)}
        />
      )}
    </div>
  );
}
