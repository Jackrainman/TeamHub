import { describe, expect, test } from 'vitest';
import {
  PresenceRecommendationSchema,
  ResourceSessionSchema,
  SharedResourceSchema,
  GOVERNANCE_SCENARIO_NOW,
  derivePresenceSchedule,
  scheduleResourceDownFixture,
  scheduleScenarioFixture,
} from '../src/index.js';

const NOW = GOVERNANCE_SCENARIO_NOW;

describe('排班 fixtures 满足 schema', () => {
  test('SharedResource / ResourceSession round-trip parse', () => {
    for (const r of scheduleScenarioFixture.resources)
      expect(SharedResourceSchema.safeParse(r).success).toBe(true);
    for (const s of scheduleScenarioFixture.resourceSessions)
      expect(ResourceSessionSchema.safeParse(s).success).toBe(true);
  });
});

describe('derivePresenceSchedule — 差异化在场（在场 / 随叫 / 去学 / 沉默）', () => {
  const recs = derivePresenceSchedule(scheduleScenarioFixture, NOW, '今晚');
  const byGroup = new Map(recs.map((r) => [r.groupId, r]));

  test('每条满足 PresenceRecommendationSchema', () => {
    for (const r of recs)
      expect(PresenceRecommendationSchema.safeParse(r).success).toBe(true);
  });

  test('程序组 = present（持有 R1 做 R1 总联调）', () => {
    const r = byGroup.get('grp-program')!;
    expect(r.mode).toBe('present');
    expect(r.reason).toBe('holdsResource');
    expect(r.holderTaskLabel).toBe('R1 总联调');
    expect(r.resourceId).toBe('res-r1');
    expect(r.orderInWindow).toBe(0);
  });

  test('电控 + 电路 = onCall（上游链上仍在推进）', () => {
    expect(byGroup.get('grp-ec')!.mode).toBe('onCall');
    expect(byGroup.get('grp-ec')!.reason).toBe('upstreamOnCall');
    expect(byGroup.get('grp-circuit')!.mode).toBe('onCall');
  });

  test('视觉组 = free（被卡）且挂"可看的资料"', () => {
    const r = byGroup.get('grp-vision')!;
    expect(r.mode).toBe('free');
    expect(r.reason).toBe('blockedFree');
    const titles = r.relatedKnowledge.map((k) => k.title);
    expect(titles).toContain('R2 同款视觉代码');
  });

  test('机械组 = 沉默（机械臂已装完，链上无活，不产生建议）', () => {
    expect(byGroup.has('grp-mech')).toBe(false);
  });

  test('排班按小组、汇报按大组：reportingGroupId 上溯到顶层大组', () => {
    // 电控 / 视觉是程序大组的小组 → reportingGroupId = 程序
    expect(byGroup.get('grp-ec')!.reportingGroupId).toBe('grp-program');
    expect(byGroup.get('grp-vision')!.reportingGroupId).toBe('grp-program');
    // 电路本就顶层 → reportingGroupId = 自身；程序大组自身亦然
    expect(byGroup.get('grp-circuit')!.reportingGroupId).toBe('grp-circuit');
    expect(byGroup.get('grp-program')!.reportingGroupId).toBe('grp-program');
    // 排班单元仍是小组（groupId 不被汇报层吞掉）
    expect(byGroup.get('grp-ec')!.groupId).toBe('grp-ec');
  });

  test('事实陈述只含组 / 任务 / 资源名，不含任何人名（反排名）', () => {
    for (const r of recs) {
      for (const name of ['视觉C', '电控B', '视觉A', '程序A', '程序B', '机械C', '机械D', '电路D']) {
        expect(r.factStatement).not.toContain(name);
      }
    }
  });

  test('输出结构上无 member / 出勤计数 / 时长聚合维度', () => {
    for (const r of recs) {
      for (const key of Object.keys(r)) {
        expect(key).not.toMatch(
          /member|owner|count|score|rank|percent|completed|duration|attendance/i,
        );
      }
    }
  });

  test('排序：present 在前，free 在后', () => {
    expect(recs[0].mode).toBe('present');
    expect(recs[recs.length - 1].mode).toBe('free');
  });
});

describe('derivePresenceSchedule — 车撞坏：整片下游今晚作罢', () => {
  const recs = derivePresenceSchedule(scheduleResourceDownFixture, NOW, '今晚');
  const byGroup = new Map(recs.map((r) => [r.groupId, r]));

  test('R1 链相关组全部 free / resourceDown', () => {
    expect(recs.length).toBeGreaterThan(0);
    for (const r of recs) {
      expect(r.mode).toBe('free');
      expect(r.reason).toBe('resourceDown');
    }
  });

  test('持有方程序组也被打成 free（车坏了谁都上不了）', () => {
    const prog = byGroup.get('grp-program');
    expect(prog?.mode).toBe('free');
    expect(prog?.reason).toBe('resourceDown');
    expect(prog?.factStatement).toContain('撞坏维修中');
  });

  test('只跑 R2 的机械组不受 R1 撞坏影响（沉默）', () => {
    expect(byGroup.has('grp-mech')).toBe(false);
  });
});
