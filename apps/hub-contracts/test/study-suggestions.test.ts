import { describe, expect, test } from 'vitest';
import {
  GroupStudySuggestionSchema,
  SelfStudySuggestionSchema,
  StudySuggestionsResultSchema,
  GOVERNANCE_SCENARIO_NOW,
  deriveStudySuggestions,
  governanceScenarioFixture,
  memberKnowledgeFixtures,
  type GovernanceSnapshot,
  type MemberKnowledge,
} from '../src/index.js';

const NOW = GOVERNANCE_SCENARIO_NOW;

describe('deriveStudySuggestions — 窄义学习建议（S3，B1；D-039 硬边界）', () => {
  // 无 viewer：只产组级，selfPrivate 恒空。
  const baseResult = deriveStudySuggestions(governanceScenarioFixture, NOW);

  test('结果满足 StudySuggestionsResultSchema；每条满足各自 schema', () => {
    expect(StudySuggestionsResultSchema.safeParse(baseResult).success).toBe(true);
    for (const g of baseResult.group)
      expect(GroupStudySuggestionSchema.safeParse(g).success).toBe(true);
    for (const s of baseResult.selfPrivate)
      expect(SelfStudySuggestionSchema.safeParse(s).success).toBe(true);
  });

  test('组级 join：need-rtos(open,grp-ec,[RTOS,CAN]) 命中 kn-rtos + kn-can', () => {
    // node.name 含 token：FreeRTOS… 含 "RTOS"；底盘 CAN… 含 "CAN"；视觉标定不含。
    expect(baseResult.group).toHaveLength(2);
    const byNode = new Map(baseResult.group.map((g) => [g.knowledgeNodeId, g]));
    const rtos = byNode.get('kn-rtos')!;
    const can = byNode.get('kn-can')!;
    expect(rtos.groupId).toBe('grp-ec');
    expect(rtos.matchedSkills).toEqual(['RTOS']);
    expect(can.matchedSkills).toEqual(['CAN']);
    expect(rtos.evidenceNeedIds).toEqual(['need-rtos']);
    expect(rtos.openGapCount).toBe(1);
    expect(rtos.detectedBy).toBe('derived');
    expect(rtos.audience).toBe('group');
    expect(rtos.factStatement).toContain('电控');
    expect(rtos.factStatement).toContain('RTOS');
    // kn-vision-cal 不含 RTOS/CAN → 不产出。
    expect(byNode.has('kn-vision-cal')).toBe(false);
  });

  // ---- DoD (a)：组级输出 JSON.stringify 后 grep 不到任何 memberId/displayName ----
  test('DoD(a)：组级序列化无任何人维度字段（memberId/displayName/confirmedBy/排序）', () => {
    const json = JSON.stringify(baseResult.group);
    expect(json).not.toContain('memberId');
    expect(json).not.toContain('displayName');
    expect(json).not.toContain('confirmedBy');
    expect(json).not.toContain('claimedBy');
    expect(json).not.toContain('rank');
    expect(json).not.toContain('assignee');
    // 每个真实 fixture 成员 id 都不得出现（用具体 id，避免裸 "m-" 撞上 "program-kn-…"）。
    for (const member of governanceScenarioFixture.members) {
      expect(json).not.toContain(member.id);
      expect(json).not.toContain(member.displayName);
    }
  });

  // ---- DoD (d)：组级 schema 无 per-member ranking 字段 ----
  test('DoD(d)：GroupStudySuggestion schema 无 memberId/rank/assignee（无能力排序结构）', () => {
    const shape = GroupStudySuggestionSchema.shape;
    expect('memberId' in shape).toBe(false);
    expect('rank' in shape).toBe(false);
    expect('assignee' in shape).toBe(false);
    expect('assigneeId' in shape).toBe(false);
    expect('memberRanking' in shape).toBe(false);
    // 额外：parse 一条带 memberId 的对象 → strip（z.object 默认 strip），不会保留人维度。
    const withMember = GroupStudySuggestionSchema.parse({
      ...baseResult.group[0]!,
      memberId: 'm-visionC',
    } as unknown);
    expect('memberId' in withMember).toBe(false);
  });

  // ---- DoD (b)+(c)：私有建议只含本人；他人 private MemberKnowledge 不被读取/不外露 ----
  test('DoD(b/c)：viewer=m-visionC 私有建议只含本人 memberId；他人条目不被读取', () => {
    // 构造他人（m-ecB）的 private MemberKnowledge：learning kn-rtos（也命中 open 缺口）。
    // 若被误读，会泄漏出一条 memberId=m-ecB 的私有建议 → 用断言堵死。
    const withOther: MemberKnowledge[] = [
      ...memberKnowledgeFixtures, // m-visionC: kn-vision-cal(interested) + kn-rtos(learning)
      {
        memberId: 'm-ecB',
        knowledgeNodeId: 'kn-rtos',
        relation: 'learning',
        visibility: 'private',
        updatedAt: NOW,
      },
      {
        memberId: 'm-progB',
        knowledgeNodeId: 'kn-can',
        relation: 'interested',
        visibility: 'private',
        updatedAt: NOW,
      },
    ];
    const res = deriveStudySuggestions(governanceScenarioFixture, NOW, {
      viewerMemberId: 'm-visionC',
      memberKnowledge: withOther,
    });

    // 本人 m-visionC：kn-rtos(learning) 命中 open 缺口（RTOS）→ 1 条；
    // kn-vision-cal(interested) 不命中 RTOS/CAN → 沉默。
    expect(res.selfPrivate).toHaveLength(1);
    const self = res.selfPrivate[0]!;
    expect(self.memberId).toBe('m-visionC');
    expect(self.knowledgeNodeId).toBe('kn-rtos');
    expect(self.relation).toBe('learning');
    expect(self.audience).toBe('selfPrivate');
    expect(self.matchedSkills).toEqual(['RTOS']);

    // 每条 selfPrivate 的 memberId 必须是本人，绝无他人。
    for (const s of res.selfPrivate) expect(s.memberId).toBe('m-visionC');

    // (c) 他人 private 不被读取/外露：整个结果序列化里不得出现他人 id。
    const json = JSON.stringify(res);
    expect(json).not.toContain('m-ecB');
    expect(json).not.toContain('m-progB');
  });

  // ---- DoD (b)：私有建议绝不进任何 group / captain 聚合（两数组物理隔离）----
  test('DoD(b)：selfPrivate 与 group 物理隔离——group 数组里不含任何本人私有建议/memberId', () => {
    const res = deriveStudySuggestions(governanceScenarioFixture, NOW, {
      viewerMemberId: 'm-visionC',
      memberKnowledge: memberKnowledgeFixtures,
    });
    // group 仍只有 2 条组级（self 没漏进来）。
    expect(res.group).toHaveLength(2);
    // group 序列化绝无 memberId / selfPrivate 标记。
    const groupJson = JSON.stringify(res.group);
    expect(groupJson).not.toContain('memberId');
    expect(groupJson).not.toContain('selfPrivate');
    expect(groupJson).not.toContain('m-visionC');
    // 每条 group.audience 必为 'group'。
    for (const g of res.group) expect(g.audience).toBe('group');
  });

  // ---- 无 viewer → selfPrivate 空（默认私有不外溢）----
  test('无 viewerMemberId / 无 memberKnowledge → selfPrivate 空', () => {
    expect(baseResult.selfPrivate).toEqual([]);
    // 只给 viewer 不给 knowledge → 仍空。
    expect(
      deriveStudySuggestions(governanceScenarioFixture, NOW, {
        viewerMemberId: 'm-visionC',
      }).selfPrivate,
    ).toEqual([]);
    // 只给 knowledge 不给 viewer → 仍空（不知道是谁 → 不产私有）。
    expect(
      deriveStudySuggestions(governanceScenarioFixture, NOW, {
        memberKnowledge: memberKnowledgeFixtures,
      }).selfPrivate,
    ).toEqual([]);
  });

  // ---- DoD (e)：无 open 缺口 → 全空（沉默）----
  test('DoD(e)：无 open/escalated 缺口 → group 与 selfPrivate 皆空（沉默）', () => {
    const noGap: GovernanceSnapshot = {
      ...governanceScenarioFixture,
      needs: governanceScenarioFixture.needs.map((n) => ({
        ...n,
        status: 'satisfied' as const,
      })),
    };
    const res = deriveStudySuggestions(noGap, NOW, {
      viewerMemberId: 'm-visionC',
      memberKnowledge: memberKnowledgeFixtures,
    });
    expect(res.group).toEqual([]);
    expect(res.selfPrivate).toEqual([]);
  });

  // ---- providerGroupId=null 的 open 缺口不进组级（沉默）----
  test('providerGroupId=null 的 open 缺口 → 不进组级；但私有仍按全局 open skill 命中', () => {
    const orphan: GovernanceSnapshot = {
      ...governanceScenarioFixture,
      needs: governanceScenarioFixture.needs.map((n) =>
        n.id === 'need-rtos' ? { ...n, providerGroupId: null } : n,
      ),
    };
    // 组级：need-rtos 无组可归 → 不产出（need-board-review 是 claimed，本就排除）。
    expect(deriveStudySuggestions(orphan, NOW).group).toEqual([]);
    // 私有：仍按全局 open skill（RTOS/CAN 仍 open）命中本人 learning kn-rtos。
    const res = deriveStudySuggestions(orphan, NOW, {
      viewerMemberId: 'm-visionC',
      memberKnowledge: memberKnowledgeFixtures,
    });
    expect(res.selfPrivate).toHaveLength(1);
    expect(res.selfPrivate[0]!.memberId).toBe('m-visionC');
  });

  // ---- 确定性：同输入 → 同输出（排序稳定）----
  test('纯函数确定性：两次调用结果深相等，detectedBy 恒 derived', () => {
    const a = deriveStudySuggestions(governanceScenarioFixture, NOW, {
      viewerMemberId: 'm-visionC',
      memberKnowledge: memberKnowledgeFixtures,
    });
    const b = deriveStudySuggestions(governanceScenarioFixture, NOW, {
      viewerMemberId: 'm-visionC',
      memberKnowledge: memberKnowledgeFixtures,
    });
    expect(a).toEqual(b);
    for (const g of a.group) expect(g.detectedBy).toBe('derived');
    for (const s of a.selfPrivate) expect(s.detectedBy).toBe('derived');
  });
});
