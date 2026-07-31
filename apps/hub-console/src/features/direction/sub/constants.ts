import type { TranslationKey } from '../../../i18n';
import type { StarmapNode } from '../starmap-data';

export const VB_W = 900;
export const VB_H = 560;
export const CX = VB_W / 2;
export const CY = VB_H / 2;
export const FOCAL = 520;
export const WORLD_SCALE = 1.18;
/** 指针累计位移（客户端 px）低于此值的会话视为点击而非拖拽。 */
export const CLICK_SLOP_PX = 6;
export const PITCH_LIMIT = 1.25;

export type Vec3 = readonly [number, number, number];

export function rotate(p: Vec3, yaw: number, pitch: number): [number, number, number] {
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
export function unrotate(v: Vec3, yaw: number, pitch: number): [number, number, number] {
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

/** 角度差规范到 [-π, π)（相机缓动走最短弧；自转累计的大 yaw 也安全）。 */
export function normalizeAngle(a: number): number {
  const twoPi = Math.PI * 2;
  return ((((a + Math.PI) % twoPi) + twoPi) % twoPi) - Math.PI;
}

export interface Projected {
  node: StarmapNode;
  sx: number;
  sy: number;
  k: number; // 透视比例（含 zoom），节点拖拽换算复用
  depth: number; // 越大越靠近观察者
}

/** 背景静态星点（确定性伪随机，不随场景旋转——远景层）。 */
export const BACKDROP_STARS: { x: number; y: number; r: number; o: number }[] = (() => {
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

export const KIND_KEY: Record<StarmapNode['kind'], TranslationKey> = {
  hub: 'direction.starmap.panel.kind.hub',
  skill: 'direction.starmap.panel.kind.skill',
  gap: 'direction.starmap.panel.kind.gap',
  crosscut: 'direction.starmap.panel.kind.crosscut',
};
