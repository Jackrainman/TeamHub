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
  mechanism: '底盘',
};

describe('nextArtifactVersionNo — 三键自增（车不进键）', () => {
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

  test('车不进键：同机构跨车（R1→R2）版本号仍连续', () => {
    const existing: ArtifactRef[] = [
      art({ ...CHASSIS_KEY, robotCode: 'R1', versionNo: 1 }),
      art({ ...CHASSIS_KEY, robotCode: 'R2', versionNo: 2 }),
      art({ ...CHASSIS_KEY, robotCode: 'universal', versionNo: 3 }),
    ];
    // 三条都同 (组别+赛季+机构)，车不同也算入 → 下一版 = 4
    expect(nextArtifactVersionNo(existing, CHASSIS_KEY)).toBe(4);
  });

  test('异键隔离：另一机构/赛季/组不参与（但车不隔离）', () => {
    const existing: ArtifactRef[] = [
      art({ ...CHASSIS_KEY, versionNo: 5 }),
      // 异 mechanism
      art({ ...CHASSIS_KEY, mechanism: '抬升机构', versionNo: 9 }),
      // 异 season
      art({ ...CHASSIS_KEY, season: '24', versionNo: 9 }),
      // 异 ownerGroup
      art({ ...CHASSIS_KEY, ownerGroup: 'electrical', versionNo: 9 }),
    ];
    expect(nextArtifactVersionNo(existing, CHASSIS_KEY)).toBe(6);
  });

  test('旧 seed 无 versionNo（三键碰巧匹配）视为 0、不参与 → 仍从 1', () => {
    const existing: ArtifactRef[] = [
      // 无 ownerGroup/season 的旧裸 seed（三键不匹配，天然不计）
      art({
        ownerGroup: undefined,
        season: undefined,
        mechanism: '底盘',
      }),
      // 三键全等但无 versionNo（视为 0）→ 不抬高基线
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

describe('deriveArtifactKind', () => {
  test('机械组 → report（subType 缺省）', () => {
    expect(deriveArtifactKind('mechanical', undefined)).toBe('report');
  });

  test('电路图纸（drawing）→ report', () => {
    expect(deriveArtifactKind('electrical', 'drawing')).toBe('report');
  });

  test('电路驱动（driver）→ firmware', () => {
    expect(deriveArtifactKind('electrical', 'driver')).toBe('firmware');
  });

  test('电控 → firmware', () => {
    expect(deriveArtifactKind('ec', undefined)).toBe('firmware');
  });

  test('视觉 → firmware', () => {
    expect(deriveArtifactKind('vision', undefined)).toBe('firmware');
  });
});
