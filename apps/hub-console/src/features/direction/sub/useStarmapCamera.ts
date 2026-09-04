import { useEffect, useMemo, useRef, useState } from 'react';
import type { RoboticsDiscipline } from '@teamhub/hub-contracts';
import { useI18n, type TranslationKey } from '../../../i18n';
import { GROUP_LABEL_KEY } from '../../../verticals/robotics';
import {
  CLICK_SLOP_PX,
  FOCAL,
  PITCH_LIMIT,
  VB_W,
  WORLD_SCALE,
  CX,
  CY,
  normalizeAngle,
  rotate,
  unrotate,
  type Projected,
  type Vec3,
} from './constants';
import type { buildStarmap } from '../starmap-data';

type Starmap = ReturnType<typeof buildStarmap>;

/**
 * 星图相机 + 指针会话控制器（SPLIT-1-TAIL 自 DirectionStarmap.tsx 拆出）：
 * yaw/pitch/zoom、节点拖拽偏移（松手留位）、悬停/选中、闲时自转、滚轮缩放、Esc 关面板、
 * 相机对焦缓动（prefers-reduced-motion 退化直接跳转）、点击与拖拽以指针累计位移区分。
 * 纯本地状态，无远端数据。
 */
export function useStarmapCamera(starmap: Starmap) {
  const { t } = useI18n();
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
      // 缩放范围 0.55–2.1 倍，每格滚轮约 ±8%（0.925≈1/1.08，上下对称；手感调参非计算值）。
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
    // 对焦补间：320ms smoothstep 缓动（tt²(3−2t)），时长为手感调参。
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
      // 拖拽旋转灵敏度 0.006 rad/px（手感调参）。
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

  return {
    svgRef,
    wrapRef,
    dragging,
    selectedId,
    setSelectedId,
    setHoverId,
    selectedNode,
    hovered,
    projected,
    byId,
    related,
    depthSorted,
    hubLabel,
    onCanvasPointerDown,
    onNodePointerDown,
    onPointerMove,
    endPointer,
    cancelPointer,
  };
}
