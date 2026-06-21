import { describe, expect, test } from 'vitest';
import {
  DirectionGapSchema,
  GroupGapsResponseSchema,
  GOVERNANCE_SCENARIO_NOW,
  deriveDirectionGaps,
  governanceScenarioFixture,
  type GovernanceSnapshot,
} from '../src/index.js';

const NOW = GOVERNANCE_SCENARIO_NOW;

describe('deriveDirectionGaps — 组级方向缺口（S2，A1 归组不归人）', () => {
  const gaps = deriveDirectionGaps(governanceScenarioFixture, NOW);

  test('fixture 仅 need-rtos(open/grp-ec) 产缺口；claimed need-board-review 不计', () => {
    // 两条 need：need-rtos=open(grp-ec)、need-board-review=claimed(grp-circuit，排除)
    expect(gaps).toHaveLength(1);
    const g = gaps[0]!;
    expect(g.groupId).toBe('grp-ec');
    expect(g.neededSkills).toEqual(['CAN', 'RTOS']); // 并集、排序
    expect(g.evidenceNeedIds).toEqual(['need-rtos']);
    expect(g.evidenceTaskIds).toEqual(['t-r1-chassis']);
    expect(g.detectedBy).toBe('derived');
    expect(g.factStatement).toContain('电控');
    expect(g.factStatement).toContain('RTOS');
  });

  test('每条满足 DirectionGapSchema + 响应满足 GroupGapsResponseSchema', () => {
    for (const g of gaps)
      expect(DirectionGapSchema.safeParse(g).success).toBe(true);
    expect(
      GroupGapsResponseSchema.safeParse({ gaps, generatedAt: NOW }).success,
    ).toBe(true);
  });

  test('I0/A1：序列化后无任何人维度字段（memberId/displayName/confirmedBy/claimedBy）', () => {
    const json = JSON.stringify(gaps);
    expect(json).not.toContain('memberId');
    expect(json).not.toContain('displayName');
    expect(json).not.toContain('confirmedBy');
    expect(json).not.toContain('claimedBy');
    expect(json).not.toContain('m-'); // fixture member id 前缀
  });

  test('沉默（A4）：无 open/escalated 缺口 → 空数组', () => {
    const noGap: GovernanceSnapshot = {
      ...governanceScenarioFixture,
      needs: governanceScenarioFixture.needs.map((n) => ({
        ...n,
        status: 'satisfied' as const,
      })),
    };
    expect(deriveDirectionGaps(noGap, NOW)).toEqual([]);
  });

  test('escalated 缺口 → severity=pressing', () => {
    const escalated: GovernanceSnapshot = {
      ...governanceScenarioFixture,
      needs: governanceScenarioFixture.needs.map((n) =>
        n.id === 'need-rtos'
          ? { ...n, status: 'escalated' as const, escalatedAt: NOW }
          : n,
      ),
    };
    const g = deriveDirectionGaps(escalated, NOW).find(
      (x) => x.groupId === 'grp-ec',
    );
    expect(g?.severity).toBe('pressing');
  });

  test('providerGroupId=null 的 open 缺口不归组（沉默，不产出）', () => {
    const orphan: GovernanceSnapshot = {
      ...governanceScenarioFixture,
      needs: governanceScenarioFixture.needs.map((n) =>
        n.id === 'need-rtos' ? { ...n, providerGroupId: null } : n,
      ),
    };
    expect(deriveDirectionGaps(orphan, NOW)).toEqual([]);
  });
});
