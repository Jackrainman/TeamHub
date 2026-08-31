import { useMemo } from 'react';
import type { RoboticsDiscipline } from '@teamhub/hub-contracts';
import { useI18n } from '../../i18n';
import type { DirectionColumn } from './learning-direction-utils';
import { buildStarmap, GAP_COLOR } from './starmap-data';
import { BACKDROP_STARS, VB_H, VB_W } from './sub/constants';
import { useStarmapCamera } from './sub/useStarmapCamera';
import { StarmapLegend } from './sub/StarmapLegend';
import { StarmapPanel } from './sub/StarmapPanel';
import { StarmapTooltip } from './sub/StarmapTooltip';

/**
 * 学习方向「星图」视图：可拖动的 3D 知识地图（LEARN-DIRECTION 双 UI 之二，实验性）。
 *
 * 自写 SVG 3D（投影/旋转/拖拽/缩放），零新依赖——不引 three.js 的取舍见 starmap-data.ts 头注。
 * 相机/指针会话控制器已拆到 sub/useStarmapCamera.ts（SPLIT-1-TAIL），本文件是数据装配 + SVG 场景渲染。
 *
 * 可访问性口径：完整信息始终在「指南」视图（列表语义），星图是同一数据的增强呈现，
 * 不承载独占内容；容器标 role="img" + 说明性 aria-label，详情面板标 role="dialog"。
 */

export default function DirectionStarmap({
  columns,
  crosscutSummary,
  mineDiscipline,
}: {
  columns: readonly DirectionColumn[];
  crosscutSummary: string;
  mineDiscipline: RoboticsDiscipline | null;
}) {
  const { t } = useI18n();
  const starmap = useMemo(
    () => buildStarmap(columns, crosscutSummary, mineDiscipline),
    [columns, crosscutSummary, mineDiscipline],
  );
  const {
    svgRef,
    wrapRef,
    dragging,
    selectedId,
    setSelectedId,
    setHoverId,
    selectedNode,
    hovered,
    byId,
    related,
    depthSorted,
    hubLabel,
    onCanvasPointerDown,
    onNodePointerDown,
    onPointerMove,
    endPointer,
    cancelPointer,
  } = useStarmapCamera(starmap);

  const nodeOpacity = (id: string) => (related && !related.has(id) ? 0.16 : 1);
  const depthFade = (depth: number) => 0.5 + 0.5 * Math.min(1, Math.max(0, (depth + 220) / 440));

  return (
    <div className="direction-starmap" ref={wrapRef}>
      <svg
        className={dragging ? 'is-dragging' : undefined}
        onPointerCancel={cancelPointer}
        onPointerDown={onCanvasPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        preserveAspectRatio="xMidYMid meet"
        ref={svgRef}
        role="img"
        aria-label={t('direction.starmap.aria')}
        viewBox={`0 0 ${VB_W} ${VB_H}`}
      >
        <defs>
          <filter height="300%" id="sm-glow" width="300%" x="-100%" y="-100%">
            <feGaussianBlur stdDeviation="4.5" />
          </filter>
        </defs>

        {BACKDROP_STARS.map((s, i) => (
          <circle cx={s.x} cy={s.y} fill="#8fa3bf" key={i} opacity={s.o} r={s.r} />
        ))}

        {/* 边：按 own→cross→gap 叠放；悬停/选中时相关边提亮、其余压暗。 */}
        {starmap.links.map((link, i) => {
          const a = byId.get(link.source);
          const b = byId.get(link.target);
          if (!a || !b) return null;
          const isRelated = related ? related.has(link.source) && related.has(link.target) : null;
          const baseOpacity = link.kind === 'own' ? 0.3 : link.kind === 'cross' ? 0.24 : 0.4;
          const opacity = isRelated === null ? baseOpacity : isRelated ? 0.9 : 0.05;
          return (
            <line
              key={i}
              stroke={link.color}
              strokeDasharray={link.kind === 'gap' ? '5 5' : undefined}
              strokeOpacity={opacity * Math.min(depthFade(a.depth), depthFade(b.depth))}
              strokeWidth={isRelated ? 1.7 : 1}
              x1={a.sx}
              x2={b.sx}
              y1={a.sy}
              y2={b.sy}
            />
          );
        })}

        {depthSorted.map(({ node, sx, sy, k, depth }) => {
          const r = node.size * k;
          const fade = depthFade(depth);
          const dim = nodeOpacity(node.id);
          const glow = node.kind === 'hub' || node.kind === 'gap';
          return (
            <g
              key={node.id}
              onPointerDown={(e) => onNodePointerDown(e, node.id)}
              onPointerEnter={() => setHoverId(node.id)}
              onPointerLeave={() => setHoverId((cur) => (cur === node.id ? null : cur))}
              opacity={dim * fade}
              style={{ cursor: 'pointer' }}
            >
              {glow ? (
                <circle cx={sx} cy={sy} fill={node.color} filter="url(#sm-glow)" opacity={0.4} r={r * 1.6} />
              ) : null}
              <circle
                cx={sx}
                cy={sy}
                fill={node.color}
                r={r}
                stroke={node.kind === 'gap' ? GAP_COLOR : 'rgba(10,15,26,0.9)'}
                strokeWidth={node.kind === 'gap' ? 2 : 1}
              />
              {node.id === selectedId ? (
                <circle
                  cx={sx}
                  cy={sy}
                  fill="none"
                  r={r + 5}
                  stroke={node.color}
                  strokeOpacity={0.95}
                  strokeWidth={2}
                />
              ) : null}
              {node.isMine ? (
                <circle
                  cx={sx}
                  cy={sy}
                  fill="none"
                  r={r + (node.id === selectedId ? 10 : 6)}
                  stroke={node.color}
                  strokeDasharray="3 4"
                  strokeOpacity={0.9}
                  strokeWidth={1.5}
                />
              ) : null}
              {node.kind === 'hub' ? (
                <text
                  fill={node.color}
                  fontSize={14 * Math.min(1.15, k)}
                  fontWeight={700}
                  textAnchor="middle"
                  x={sx}
                  y={sy + r + 18}
                >
                  {hubLabel(node.disciplines[0])}
                  {node.isMine ? ` · ${t('direction.starmap.mine')}` : ''}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>

      {/* 悬停浮签只在无选中时出现——选中后详情面板是唯一详情面，避免双浮层打架。 */}
      {hovered && hovered.node.kind !== 'hub' && !selectedNode ? (
        <StarmapTooltip hovered={hovered} hubLabel={hubLabel} />
      ) : null}

      {selectedNode ? (
        <StarmapPanel
          selectedNode={selectedNode}
          nodes={starmap.nodes}
          links={starmap.links}
          hubLabel={hubLabel}
          onClose={() => setSelectedId(null)}
        />
      ) : null}

      <StarmapLegend hubLabel={hubLabel} />
    </div>
  );
}
