import { describe, expect, test } from 'vitest';
import {
  deriveArtifactKind,
  nextArtifactVersionNo,
  ArtifactRefSchema,
  CreateArtifactRequestSchema,
  buildCreateArtifactRequestSchema,
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

describe('ArtifactRefSchema.storedFile — 文件指针（向后兼容 + 校验）', () => {
  const base = {
    id: 'a-1',
    kind: 'report' as const,
    name: '底盘总成',
    createdAt: NOW,
  };
  const goodFile = {
    filename: 'a-1.pdf',
    ext: '.pdf',
    sizeBytes: 12345,
    contentType: 'application/pdf',
    sha256: 'a'.repeat(64),
    uploadedAt: NOW,
  };

  test('无 storedFile 仍解析（旧 8 seed / 旧 JSON 兼容）', () => {
    expect(ArtifactRefSchema.parse(base).storedFile).toBeUndefined();
  });

  test('合法 storedFile 解析', () => {
    const parsed = ArtifactRefSchema.parse({ ...base, storedFile: goodFile });
    expect(parsed.storedFile?.sha256).toHaveLength(64);
    expect(parsed.storedFile?.ext).toBe('.pdf');
  });

  test('坏 sha256（长度≠64）报错', () => {
    expect(() =>
      ArtifactRefSchema.parse({ ...base, storedFile: { ...goodFile, sha256: 'deadbeef' } }),
    ).toThrow();
  });

  test('负 sizeBytes 报错', () => {
    expect(() =>
      ArtifactRefSchema.parse({ ...base, storedFile: { ...goodFile, sizeBytes: -1 } }),
    ).toThrow();
  });
});

describe('CreateArtifactRequestSchema — robotCode 放宽手填 + storedFile 服务器独占', () => {
  const req = {
    ownerGroup: 'mechanical' as const,
    season: '26',
    robotCode: '26R3-试制',
    mechanism: '底盘',
    name: '总成图',
  };

  test('robotCode 接受任意非空串（手填非台账编号）', () => {
    expect(CreateArtifactRequestSchema.parse(req).robotCode).toBe('26R3-试制');
  });

  test('robotCode 空串仍报错（min(1)）', () => {
    expect(() => CreateArtifactRequestSchema.parse({ ...req, robotCode: '' })).toThrow();
  });

  test('客户端塞 storedFile 被剥（omit，不落库）', () => {
    const parsed = CreateArtifactRequestSchema.parse({
      ...req,
      storedFile: {
        filename: 'x.pdf',
        ext: '.pdf',
        sizeBytes: 1,
        contentType: 'application/pdf',
        sha256: 'a'.repeat(64),
        uploadedAt: NOW,
      },
    });
    expect('storedFile' in parsed).toBe(false);
  });
});

describe('buildCreateArtifactRequestSchema — 租户中立工厂函数（AUDIT-DEBT-2026-07 §9-④ 解绑）', () => {
  test('非 robotics 闭集值也能正确注入并校验（证明本包不再硬编码 robotics 词汇）', () => {
    const gameStudioSchema = buildCreateArtifactRequestSchema(['art', 'engine', 'audio']);
    const ok = gameStudioSchema.safeParse({
      ownerGroup: 'engine',
      season: 'S1',
      robotCode: 'build-42',
      mechanism: '渲染管线',
      name: '渲染管线设计稿',
    });
    expect(ok.success).toBe(true);
    // robotics 闭集值在这个租户不合法——证明闭集是参数注入的，非全局硬编码。
    const rejected = gameStudioSchema.safeParse({
      ownerGroup: 'mechanical',
      season: 'S1',
      robotCode: 'build-42',
      mechanism: '渲染管线',
      name: 'x',
    });
    expect(rejected.success).toBe(false);
  });

  test('未传 subTypeRule：任何组既不强制也不禁止 subType（租户无此细分需求时的中立默认）', () => {
    const neutralSchema = buildCreateArtifactRequestSchema(['art', 'engine']);
    expect(
      neutralSchema.safeParse({
        ownerGroup: 'engine',
        season: 'S1',
        robotCode: 'build-42',
        mechanism: '渲染管线',
        name: 'x',
      }).success,
    ).toBe(true);
    expect(
      neutralSchema.safeParse({
        ownerGroup: 'engine',
        season: 'S1',
        robotCode: 'build-42',
        mechanism: '渲染管线',
        name: 'x',
        subType: 'driver',
      }).success,
    ).toBe(true);
  });

  test('robotics 具体化导出（CreateArtifactRequestSchema）仍保留"电路组必须带 subType"业务规则', () => {
    expect(
      CreateArtifactRequestSchema.safeParse({
        ownerGroup: 'electrical',
        season: '26',
        robotCode: 'R1',
        mechanism: '主板',
        name: '驱动板图纸',
        // 缺 subType
      }).success,
    ).toBe(false);
    expect(
      CreateArtifactRequestSchema.safeParse({
        ownerGroup: 'mechanical',
        season: '26',
        robotCode: 'R1',
        mechanism: '底盘',
        name: '总成图',
        subType: 'drawing',
      }).success,
    ).toBe(false); // 机械组不得带 subType
  });
});
