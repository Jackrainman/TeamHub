import { describe, expect, test } from 'vitest';
import {
  deriveArtifactKind,
  nextArtifactVersionNo,
  type ArtifactRef,
  type ArtifactVersionKey,
} from '../src/index.js';

const NOW = '2025-09-01T00:00:00.000Z';

// 构造一条带四键 + versionNo 的 artifact（v2 完整形态）。
function art(partial: Partial<ArtifactRef> & { mechanism: string }): ArtifactRef {
  return {
    id: `a-${Math.random().toString(36).slice(2)}`,
    kind: 'report',
    name: 'n',
    uri: 'artifact://x',
    createdAt: NOW,
    ...partial,
  };
}

const CHASSIS_KEY: ArtifactVersionKey = {
  ownerGroup: 'mechanical',
  season: '25',
  robotCode: 'R1',
  mechanism: '底盘',
};

describe('nextArtifactVersionNo — 四键自增', () => {
  test('空集 → 1', () => {
    expect(nextArtifactVersionNo([], CHASSIS_KEY)).toBe(1);
  });

  test('同键累加 → max(versionNo)+1', () => {
    const existing: ArtifactRef[] = [
      art({ ...CHASSIS_KEY, versionNo: 1 }),
      art({ ...CHASSIS_KEY, versionNo: 2 }),
    ];
    expect(nextArtifactVersionNo(existing, CHASSIS_KEY)).toBe(3);
  });

  test('异键隔离：另一机构/车/赛季/组都不参与', () => {
    const existing: ArtifactRef[] = [
      art({ ...CHASSIS_KEY, versionNo: 5 }),
      // 异 mechanism
      art({ ...CHASSIS_KEY, mechanism: '抬升机构', versionNo: 9 }),
      // 异 robotCode
      art({ ...CHASSIS_KEY, robotCode: 'R2', versionNo: 9 }),
      // 异 season
      art({ ...CHASSIS_KEY, season: '24', versionNo: 9 }),
      // 异 ownerGroup
      art({ ...CHASSIS_KEY, ownerGroup: 'electrical', versionNo: 9 }),
    ];
    expect(nextArtifactVersionNo(existing, CHASSIS_KEY)).toBe(6);
  });

  test('旧 seed 无 versionNo（四键碰巧匹配）视为 0、不参与 → 仍从 1', () => {
    const existing: ArtifactRef[] = [
      // 无 ownerGroup/season/robotCode 的旧裸 seed（四键不匹配，天然不计）
      art({
        ownerGroup: undefined,
        season: undefined,
        robotCode: undefined,
        mechanism: '底盘',
      }),
      // 四键全等但无 versionNo（视为 0）→ 不抬高基线
      art({ ...CHASSIS_KEY, versionNo: undefined }),
    ];
    expect(nextArtifactVersionNo(existing, CHASSIS_KEY)).toBe(1);
  });

  test('混合：有版本 + 无版本同键，仍取已有 max+1', () => {
    const existing: ArtifactRef[] = [
      art({ ...CHASSIS_KEY, versionNo: undefined }),
      art({ ...CHASSIS_KEY, versionNo: 2 }),
    ];
    expect(nextArtifactVersionNo(existing, CHASSIS_KEY)).toBe(3);
  });
});

describe('deriveArtifactKind — 三分支', () => {
  test('机械组 → report（subType 缺省）', () => {
    expect(deriveArtifactKind('mechanical', undefined)).toBe('report');
  });

  test('电路图纸（drawing）→ report', () => {
    expect(deriveArtifactKind('electrical', 'drawing')).toBe('report');
  });

  test('电路驱动（driver）→ firmware', () => {
    expect(deriveArtifactKind('electrical', 'driver')).toBe('firmware');
  });
});
