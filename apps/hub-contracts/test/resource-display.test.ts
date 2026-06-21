import { describe, expect, test } from 'vitest';
import {
  PresenceRecommendationSchema,
  SharedResourceSchema,
  canBoardResource,
  deriveDisplayCode,
  derivePresenceSchedule,
  scheduleScenarioFixture,
  scheduleResourceDownFixture,
  GOVERNANCE_SCENARIO_NOW,
} from '../src/index.js';
import type { ResourceStatus } from '../src/index.js';

describe('deriveDisplayCode（D-072 §3.2 决定 K，禁手写）', () => {
  test('赛季 + 位置（默认 v1 不显 -vN）', () => {
    expect(deriveDisplayCode('25', 'R1', 1)).toBe('25R1');
    expect(deriveDisplayCode('26', 'R2')).toBe('26R2'); // version 默认 1
  });
  test('第二代整车显 -v2', () => {
    expect(deriveDisplayCode('26', 'R1', 2)).toBe('26R1-v2');
  });
  test('种子资源 displayCode 派生为 26R1 / 26R2（库存车列复用）', () => {
    const codes = scheduleScenarioFixture.resources.map((r) => r.displayCode);
    expect(codes).toContain('26R1');
    expect(codes).toContain('26R2');
  });
});

describe('canBoardResource（D-072 §3.3：能否上车）', () => {
  test('仅 available / inUse 可上车', () => {
    expect(canBoardResource('available')).toBe(true);
    expect(canBoardResource('inUse')).toBe(true);
  });
  test('维修 / 退役 / 拆解 / down / upgrading 不可上车（接力释放）', () => {
    const blocked: ResourceStatus[] = [
      'repair',
      'retired',
      'disassembling',
      'down',
      'upgrading',
    ];
    for (const s of blocked) expect(canBoardResource(s)).toBe(false);
  });
  test('新增维修/退役/拆解态可通过 SharedResourceSchema 校验', () => {
    const base = scheduleScenarioFixture.resources[0];
    for (const status of ['repair', 'retired', 'disassembling'] as ResourceStatus[]) {
      expect(() =>
        SharedResourceSchema.parse({ ...base, status, statusReason: '撞坏底盘' }),
      ).not.toThrow();
    }
  });
});

describe('车不可上 → 接力释放（cascade 读 canBoardResource，非硬编码状态名）', () => {
  test('R1 down → 持有组 + 该车下游组本窗 free(resourceDown)', () => {
    const recs = derivePresenceSchedule(
      scheduleResourceDownFixture,
      GOVERNANCE_SCENARIO_NOW,
      '今晚',
    );
    // sess-tonight-ec 持有组 grp-ec 在 R1 down 时应落 free
    const ec = recs.find((r) => r.groupId === 'grp-ec');
    expect(ec?.mode).toBe('free');
    expect(ec?.reason).toBe('resourceDown');
  });
});

describe('反监视护栏（结构约束，§2.4/§3.6）', () => {
  test('PresenceRecommendation schema 无 memberId / invitedMemberIds 字段', () => {
    const keys = Object.keys(PresenceRecommendationSchema.shape);
    expect(keys).not.toContain('memberId');
    expect(keys).not.toContain('invitedMemberIds');
  });
  test('derivePresenceSchedule 输出（含 free / present）任何 rec 序列化后无 memberId', () => {
    const recs = derivePresenceSchedule(
      scheduleScenarioFixture,
      GOVERNANCE_SCENARIO_NOW,
      '今晚',
    );
    expect(recs.length).toBeGreaterThan(0);
    expect(JSON.stringify(recs)).not.toContain('memberId');
    expect(JSON.stringify(recs)).not.toContain('invitedMemberIds');
  });
});
