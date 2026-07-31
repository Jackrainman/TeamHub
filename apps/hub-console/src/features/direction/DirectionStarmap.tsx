import { useEffect, useMemo, useRef, useState } from 'react';
import type { RoboticsDiscipline } from '@teamhub/hub-contracts';
import { useI18n, type TranslationKey } from '../../i18n';
import { GROUP_LABEL_KEY } from '../../verticals/robotics';
import type { DirectionColumn } from './learning-direction-utils';
import { buildStarmap, GAP_COLOR } from './starmap-data';
import {
  BACKDROP_STARS,
  CLICK_SLOP_PX,
  CX,
  CY,
  FOCAL,
  PITCH_LIMIT,
  VB_H,
  VB_W,
  WORLD_SCALE,
  normalizeAngle,
  rotate,
  unrotate,
  type Projected,
  type Vec3,
} from './sub/constants';
import { StarmapLegend } from './sub/StarmapLegend';
import { StarmapPanel } from './sub/StarmapPanel';
import { StarmapTooltip } from './sub/StarmapTooltip';

/**
 * 学习方向「星图」视图：可拖动的 3D 知识地图（LEARN-DIRECTION 双 UI 之二，实验性）。
 *
 * 自写 SVG 3D（投影/旋转/拖拽/缩放），零新依赖——不引 three.js 的取舍见 starmap-data.ts 头注。
 * 交互：拖画布=旋转（yaw/pitch）· 滚轮=缩放 · 节点可拖（沿视平面挪、松手留位）· 悬停=高亮
 * 该点与其关联边、其余压暗 · **点击节点=选中并打开右侧详情面板**（相机缓动把节点转到正面，
 * Esc/点空白/面板 × 关闭；click 与 drag 以指针累计位移区分）· 无操作时缓慢自转
 * （prefers-reduced-motion 时禁用，相机对焦也退化为直接跳转）。
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

  const [yaw, setYaw] = useState(0.6);
  const [pitch, setPitch] = useState(-0.28);
  const [zoom, setZoom] = useState(1);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [offsets, setOffsets] = useState<Record<string, Vec3>>({});
  const [dragging, setDragging] = useState(false);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  // 指针会话（rotate 或某节点）+ 累计位移；不进 state，move 高频只改必要 state。
  const pointerRef = useRef<{ mode: 'rotate' | 'node'; nodeId?: string; moved: number } | null>(
    null,
  );
  // 相机对焦缓动的 rAF 句柄；任何新的指针按下都会打断它（用户操作优先）。
  const tweenRef = useRef<number | null>(null);

  const reducedMotion = useMemo(
    () =>
      typeof window !== 'undefined' &&
      (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false),
    [],
  );

  // 选中节点从当前数据现查：数据换代后陈旧 id 自然失效（面板消失、自转恢复）。
  const selectedNode = useMemo(
    () => (selectedId ? (starmap.nodes.find((n) => n.id === selectedId) ?? null) : null),
    [selectedId, starmap],
  );

  // 闲时缓慢自转：悬停/拖拽/选中/reduced-motion 时停。
  const autoRotate = !reducedMotion && hoverId === null && !dragging && selectedNode === null;
  useEffect(() => {
    if (!autoRotate) return;
    let raf = 0;
    const tick = () => {
      setYaw((y) => y + 0.0028);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [autoRotate]);

  // 滚轮缩放：原生 non-passive 监听（React onWheel 是 passive，preventDefault 无效）。
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setZoom((z) => Math.min(2.1, Math.max(0.55, z * (e.deltaY < 0 ? 1.08 : 0.925))));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // Esc 关闭详情面板（仅选中时挂监听）。
  useEffect(() => {
    if (!selectedId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId]);

  const stopTween = () => {
    if (tweenRef.current !== null) {
      cancelAnimationFrame(tweenRef.current);
      tweenRef.current = null;
    }
  };
  useEffect(() => stopTween, []);

  /** 相机对焦：把节点转到面向观察者（yaw 消 x、pitch 消 y → 节点落画面中心）。 */
  const focusNode = (nodeId: string) => {
    const node = starmap.nodes.find((n) => n.id === nodeId);
    if (!node) return;
    const off = offsets[nodeId] ?? ([0, 0, 0] as Vec3);
    const x = node.base[0] + off[0];
    const y = node.base[1] + off[1];
    const z = node.base[2] + off[2];
    const h = Math.hypot(x, z);
    const targetYaw = h < 1e-6 ? yaw : Math.atan2(-x, z);
    const targetPitch = Math.min(PITCH_LIMIT, Math.max(-PITCH_LIMIT, Math.atan2(y, h)));
    const dYaw = normalizeAngle(targetYaw - yaw);
    const dPitch = targetPitch - pitch;
    stopTween();
    if (reducedMotion) {
      setYaw(yaw + dYaw);
      setPitch(targetPitch);
      return;
    }
    const y0 = yaw;
    const p0 = pitch;
    let start: number | null = null;
    const step = (now: number) => {
      if (start === null) start = now;
      const tt = Math.min(1, (now - start) / 320);
      const ease = tt * tt * (3 - 2 * tt);
      setYaw(y0 + dYaw * ease);
      setPitch(p0 + dPitch * ease);
      tweenRef.current = tt < 1 ? requestAnimationFrame(step) : null;
    };
    tweenRef.current = requestAnimationFrame(step);
  };

  /** viewBox 单位/客户端像素 换算比（拖拽位移用）。 */
  const vbPerPx = () => {
    const rect = svgRef.current?.getBoundingClientRect();
    return rect && rect.width > 0 ? VB_W / rect.width : 1;
  };

  const projected: Projected[] = starmap.nodes.map((node) => {
    const off = offsets[node.id] ?? ([0, 0, 0] as Vec3);
    const p = rotate(
      [node.base[0] + off[0], node.base[1] + off[1], node.base[2] + off[2]],
      yaw,
      pitch,
    );
    const k = (FOCAL / (FOCAL - p[2])) * WORLD_SCALE * zoom;
    return { node, sx: CX + p[0] * k, sy: CY - p[1] * k, k, depth: p[2] };
  });
  const byId = new Map(projected.map((p) => [p.node.id, p]));

  // 高亮关联集合 = 悬停 ∪ 选中：锚点自身 + 其边 + 边对端（选中是常亮版悬停）。
  const related = useMemo(() => {
    const anchors = [hoverId, selectedId].filter((v): v is string => v !== null);
    if (anchors.length === 0) return null;
    const ids = new Set(anchors);
    for (const link of starmap.links) {
      for (const anchor of anchors) {
        if (link.source === anchor) ids.add(link.target);
        if (link.target === anchor) ids.add(link.source);
      }
    }
    return ids;
  }, [hoverId, selectedId, starmap.links]);

  const onCanvasPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    stopTween();
    pointerRef.current = { mode: 'rotate', moved: 0 };
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onNodePointerDown = (e: React.PointerEvent, nodeId: string) => {
    e.stopPropagation();
    stopTween();
    pointerRef.current = { mode: 'node', nodeId, moved: 0 };
    setDragging(true);
    svgRef.current?.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const session = pointerRef.current;
    if (!session) return;
    session.moved += Math.abs(e.movementX) + Math.abs(e.movementY);
    const ratio = vbPerPx();
    const dx = e.movementX * ratio;
    const dy = e.movementY * ratio;
    if (session.mode === 'rotate') {
      setYaw((y) => y + dx * 0.006);
      setPitch((p) => Math.min(PITCH_LIMIT, Math.max(-PITCH_LIMIT, p - dy * 0.006)));
      return;
    }
    if (session.nodeId) {
      const proj = byId.get(session.nodeId);
      if (!proj) return;
      // 视平面位移 → 逆旋转回基础坐标系（松手留位，同 id 下次进来仍在原始布局位）。
      const world = unrotate([dx / proj.k, -dy / proj.k, 0], yaw, pitch);
      setOffsets((prev) => {
        const cur = prev[session.nodeId!] ?? ([0, 0, 0] as Vec3);
        return {
          ...prev,
          [session.nodeId!]: [cur[0] + world[0], cur[1] + world[1], cur[2] + world[2]],
        };
      });
    }
  };
  /** 松手：位移低于阈值的会话按点击结算——点节点=选中+对焦，点空白=取消选中。 */
  const endPointer = () => {
    const session = pointerRef.current;
    pointerRef.current = null;
    setDragging(false);
    if (!session || session.moved >= CLICK_SLOP_PX) return;
    if (session.mode === 'node' && session.nodeId) {
      setSelectedId(session.nodeId);
      focusNode(session.nodeId);
    } else {
      setSelectedId(null);
    }
  };
  /** 指针会话被系统取消（如触摸被浏览器接管）：只清会话，不结算点击。 */
  const cancelPointer = () => {
    pointerRef.current = null;
    setDragging(false);
  };

  const depthSorted = [...projected].sort((a, b) => a.depth - b.depth);
  const hovered = hoverId ? byId.get(hoverId) : null;

  const hubLabel = (d: RoboticsDiscipline) => t(GROUP_LABEL_KEY[d] as TranslationKey);
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
