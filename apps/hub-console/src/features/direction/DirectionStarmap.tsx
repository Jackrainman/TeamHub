import { useEffect, useMemo, useRef, useState } from 'react';
import type { RoboticsDiscipline } from '@teamhub/hub-contracts';
import { useI18n, type TranslationKey } from '../../i18n';
import { GROUP_LABEL_KEY } from '../../verticals/robotics';
import type { DirectionColumn } from './learning-direction-utils';
import {
  buildStarmap,
  blendColors,
  CROSSCUT_COLOR,
  DISCIPLINE_COLORS,
  GAP_COLOR,
  type StarmapNode,
} from './starmap-data';

/**
 * 学习方向「星图」视图：可拖动的 3D 知识地图（LEARN-DIRECTION 双 UI 之二，实验性）。
 *
 * 自写 SVG 3D（投影/旋转/拖拽/缩放），零新依赖——不引 three.js 的取舍见 starmap-data.ts 头注。
 * 交互：拖画布=旋转（yaw/pitch）· 滚轮=缩放 · 节点可拖（沿视平面挪、松手留位）· 悬停=高亮
 * 该点与其关联边、其余压暗 · 无操作时缓慢自转（prefers-reduced-motion 时禁用）。
 *
 * 可访问性口径：完整信息始终在「指南」视图（列表语义），星图是同一数据的增强呈现，
 * 不承载独占内容；容器标 role="img" + 说明性 aria-label。
 */

const VB_W = 900;
const VB_H = 560;
const CX = VB_W / 2;
const CY = VB_H / 2;
const FOCAL = 520;
const WORLD_SCALE = 1.18;

type Vec3 = readonly [number, number, number];

function rotate(p: Vec3, yaw: number, pitch: number): [number, number, number] {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const x1 = p[0] * cy + p[2] * sy;
  const z1 = -p[0] * sy + p[2] * cy;
  const y2 = p[1] * cp - z1 * sp;
  const z2 = p[1] * sp + z1 * cp;
  return [x1, y2, z2];
}

/** rotate 的逆（节点拖拽：把视平面位移换回基础坐标系）。 */
function unrotate(v: Vec3, yaw: number, pitch: number): [number, number, number] {
  const cy = Math.cos(-yaw);
  const sy = Math.sin(-yaw);
  const cp = Math.cos(-pitch);
  const sp = Math.sin(-pitch);
  const y1 = v[1] * cp - v[2] * sp;
  const z1 = v[1] * sp + v[2] * cp;
  const x2 = v[0] * cy + z1 * sy;
  const z2 = -v[0] * sy + z1 * cy;
  return [x2, y1, z2];
}

interface Projected {
  node: StarmapNode;
  sx: number;
  sy: number;
  k: number; // 透视比例（含 zoom），节点拖拽换算复用
  depth: number; // 越大越靠近观察者
}

/** 背景静态星点（确定性伪随机，不随场景旋转——远景层）。 */
const BACKDROP_STARS: { x: number; y: number; r: number; o: number }[] = (() => {
  const stars = [];
  let h = 41;
  const next = () => {
    h = (h * 48271) % 2147483647;
    return h / 2147483647;
  };
  for (let i = 0; i < 46; i++) {
    stars.push({
      x: next() * VB_W,
      y: next() * VB_H,
      r: 0.6 + next() * 1.1,
      o: 0.1 + next() * 0.22,
    });
  }
  return stars;
})();

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
  const [offsets, setOffsets] = useState<Record<string, Vec3>>({});
  const [dragging, setDragging] = useState(false);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  // 指针会话（rotate 或某节点）；不进 state，move 高频只改必要 state。
  const pointerRef = useRef<{ mode: 'rotate' | 'node'; nodeId?: string } | null>(null);

  const reducedMotion = useMemo(
    () =>
      typeof window !== 'undefined' &&
      (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false),
    [],
  );

  // 闲时缓慢自转：悬停/拖拽/reduced-motion 时停。
  const autoRotate = !reducedMotion && hoverId === null && !dragging;
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

  // 悬停关联集合：该节点自身 + 其边 + 边对端。
  const related = useMemo(() => {
    if (!hoverId) return null;
    const ids = new Set([hoverId]);
    for (const link of starmap.links) {
      if (link.source === hoverId) ids.add(link.target);
      if (link.target === hoverId) ids.add(link.source);
    }
    return ids;
  }, [hoverId, starmap.links]);

  const onCanvasPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    pointerRef.current = { mode: 'rotate' };
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onNodePointerDown = (e: React.PointerEvent, nodeId: string) => {
    e.stopPropagation();
    pointerRef.current = { mode: 'node', nodeId };
    setDragging(true);
    svgRef.current?.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const session = pointerRef.current;
    if (!session) return;
    const ratio = vbPerPx();
    const dx = e.movementX * ratio;
    const dy = e.movementY * ratio;
    if (session.mode === 'rotate') {
      setYaw((y) => y + dx * 0.006);
      setPitch((p) => Math.min(1.25, Math.max(-1.25, p - dy * 0.006)));
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
  const endPointer = () => {
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
        onPointerCancel={endPointer}
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

        {/* 边：按 own→cross→gap 叠放；悬停时相关边提亮、其余压暗。 */}
        {starmap.links.map((link, i) => {
          const a = byId.get(link.source);
          const b = byId.get(link.target);
          if (!a || !b) return null;
          const isRelated = related ? related.has(link.source) && related.has(link.target) : null;
          const baseOpacity = link.kind === 'own' ? 0.3 : link.kind === 'cross' ? 0.24 : 0.4;
          const opacity =
            isRelated === null ? baseOpacity : isRelated ? 0.9 : 0.05;
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
              {node.isMine ? (
                <circle
                  cx={sx}
                  cy={sy}
                  fill="none"
                  r={r + 6}
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

      {hovered && hovered.node.kind !== 'hub' ? (
        <div
          className="direction-starmap__tooltip"
          style={{
            left: `${(hovered.sx / VB_W) * 100}%`,
            top: `${(hovered.sy / VB_H) * 100}%`,
          }}
        >
          {hovered.node.kind === 'gap' ? (
            <span className={`gap-badge gap-badge--${hovered.node.severity ?? 'pressing'}`}>
              {t(
                hovered.node.severity === 'emerging'
                  ? 'direction.severity.emerging'
                  : 'direction.severity.pressing',
              )}
            </span>
          ) : null}
          <p className="direction-starmap__tooltip-text">{hovered.node.label}</p>
          {hovered.node.detail ? (
            <p className="direction-starmap__tooltip-detail">{hovered.node.detail}</p>
          ) : null}
          {hovered.node.disciplines.length > 0 ? (
            <div className="direction-starmap__tooltip-chips">
              {hovered.node.disciplines.map((d) => (
                <span key={d} style={{ color: DISCIPLINE_COLORS[d] }}>
                  ● {hubLabel(d)}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="direction-starmap__legend">
        {(Object.keys(DISCIPLINE_COLORS) as RoboticsDiscipline[]).map((d) => (
          <span key={d}>
            <i className="direction-starmap__swatch" style={{ background: DISCIPLINE_COLORS[d] }} />
            {hubLabel(d)}
          </span>
        ))}
        <span>
          <i
            className="direction-starmap__swatch"
            style={{
              background: `linear-gradient(90deg, ${DISCIPLINE_COLORS.ec}, ${blendColors([
                DISCIPLINE_COLORS.ec,
                DISCIPLINE_COLORS.mechanical,
              ])}, ${DISCIPLINE_COLORS.mechanical})`,
            }}
          />
          {t('direction.starmap.legend.cross')}
        </span>
        <span>
          <i
            className="direction-starmap__swatch direction-starmap__swatch--ring"
            style={{ borderColor: GAP_COLOR }}
          />
          {t('direction.starmap.legend.gap')}
        </span>
        <span>
          <i className="direction-starmap__swatch" style={{ background: CROSSCUT_COLOR }} />
          {t('direction.starmap.legend.ai')}
        </span>
      </div>
    </div>
  );
}
