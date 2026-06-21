import { describe, expect, test } from 'vitest';
import {
  GOVERNANCE_SCENARIO_NOW,
  MemberAvailabilitySchema,
  PresenceRecommendationSchema,
  WeeklyMinuteWindowSchema,
  WindowDefSchema,
  deriveGroupAvailability,
  derivePresenceSchedule,
  scheduleScenarioFixture,
  type AvailabilityContext,
  type Member,
  type MemberAvailability,
  type WindowDef,
} from '../src/index.js';

const NOW = GOVERNANCE_SCENARIO_NOW;

// 周内分钟段：周一(1) 14:00-16:00（840-960）；与之相邻 16:00-18:00（960-1080）不冲突。
const MON_AFTERNOON: WindowDef = { dayOfWeek: 1, startMin: 840, endMin: 960 };

function avail(
  memberId: string,
  visibility: MemberAvailability['visibility'],
  busy: MemberAvailability['recurringBusy'],
): MemberAvailability {
  return { memberId, visibility, recurringBusy: busy };
}

describe('WeeklyMinuteWindow / WindowDef schema 校验', () => {
  test('合法周内分钟段通过；startMin>=endMin 被拒（不支持跨夜）', () => {
    expect(WeeklyMinuteWindowSchema.safeParse(MON_AFTERNOON).success).toBe(true);
    expect(WindowDefSchema.safeParse(MON_AFTERNOON).success).toBe(true);
    expect(
      WeeklyMinuteWindowSchema.safeParse({ dayOfWeek: 1, startMin: 960, endMin: 960 }).success,
    ).toBe(false);
    expect(
      WeeklyMinuteWindowSchema.safeParse({ dayOfWeek: 1, startMin: 1200, endMin: 120 }).success,
    ).toBe(false);
    // 越界 dayOfWeek / 分钟
    expect(WeeklyMinuteWindowSchema.safeParse({ dayOfWeek: 7, startMin: 0, endMin: 10 }).success).toBe(false);
    expect(WeeklyMinuteWindowSchema.safeParse({ dayOfWeek: 1, startMin: 0, endMin: 1441 }).success).toBe(false);
  });

  test('MemberAvailabilitySchema 默认私有形状 + recurringBusy 带 label', () => {
    const ok = MemberAvailabilitySchema.safeParse(
      avail('m-x', 'private', [{ ...MON_AFTERNOON, label: '高数课' }]),
    );
    expect(ok.success).toBe(true);
  });
});

describe('deriveGroupAvailability — 只产组级 headcount 整数（A2 红线）', () => {
  const members: Member[] = scheduleScenarioFixture.members;

  test('返回值只有 groupId→整数，无任何成员维度键', () => {
    const cap = deriveGroupAvailability([], MON_AFTERNOON, members);
    for (const [groupId, n] of cap) {
      expect(typeof groupId).toBe('string');
      expect(Number.isInteger(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(0);
      // groupId 必须是组（grp-），绝不是 memberId（m-）
      expect(groupId.startsWith('grp-')).toBe(true);
      expect(groupId.startsWith('m-')).toBe(false);
    }
    // 无人冲突时每个组的容量 = 该组成员数（调和后 progA→电控、progB→视觉）
    expect(cap.get('grp-vision')).toBe(3); // m-visionA + m-visionC + m-progB
    expect(cap.get('grp-mech')).toBe(2); // m-mechC + m-mechD
    expect(cap.get('grp-ec')).toBe(2); // m-ecB + m-progA
    expect(cap.get('grp-program') ?? 0).toBe(0); // 程序组无直属成员 → 0
  });

  test("visibility==='private' 的成员被跳过（私有课表绝不进派生）", () => {
    // 视觉A 私有课表与窗口冲突，但 private → 不剔除（按"无冲突"计），组容量仍是 3
    const privateBusy = [
      avail('m-visionA', 'private', [MON_AFTERNOON]),
    ];
    const cap = deriveGroupAvailability(privateBusy, MON_AFTERNOON, members);
    expect(cap.get('grp-vision')).toBe(3);
  });

  test("visibility==='aggregateOnly' 且冲突 → 该组容量 -1（仍只是整数）", () => {
    const authorizedBusy = [
      avail('m-visionA', 'aggregateOnly', [MON_AFTERNOON]),
    ];
    const cap = deriveGroupAvailability(authorizedBusy, MON_AFTERNOON, members);
    // 视觉A 授权且冲突 → 视觉组从 3 降到 2
    expect(cap.get('grp-vision')).toBe(2);
  });

  test('半开区间：相邻窗（16:00 结束 vs 16:00 开始）不误判为冲突', () => {
    const adjacent = [
      // 周一 12:00-14:00（720-840），紧贴窗口 840 起点，半开区间不重叠
      avail('m-visionA', 'aggregateOnly', [{ dayOfWeek: 1, startMin: 720, endMin: 840 }]),
    ];
    const cap = deriveGroupAvailability(adjacent, MON_AFTERNOON, members);
    expect(cap.get('grp-vision')).toBe(3); // 不冲突，仍是 3
  });

  test('不同 dayOfWeek 的占用段不算冲突', () => {
    const otherDay = [
      // 周二同时段，不影响周一窗口
      avail('m-visionA', 'aggregateOnly', [{ dayOfWeek: 2, startMin: 840, endMin: 960 }]),
    ];
    const cap = deriveGroupAvailability(otherDay, MON_AFTERNOON, members);
    expect(cap.get('grp-vision')).toBe(3);
  });

  test('单窗签名，结构上无法跨窗按人累计', () => {
    // deriveGroupAvailability 只收单个 windowDef；两次独立调用结果互不影响、不累加。
    const busyMon = deriveGroupAvailability(
      [avail('m-visionA', 'aggregateOnly', [MON_AFTERNOON])],
      MON_AFTERNOON,
      members,
    );
    const busyTue = deriveGroupAvailability(
      [avail('m-visionA', 'aggregateOnly', [{ dayOfWeek: 2, startMin: 840, endMin: 960 }])],
      { dayOfWeek: 2, startMin: 840, endMin: 960 },
      members,
    );
    // 各窗独立：周一冲突→2，周二冲突→2；二者绝不被合成"本周到场最少→多排"
    expect(busyMon.get('grp-vision')).toBe(2);
    expect(busyTue.get('grp-vision')).toBe(2);
  });
});

describe('derivePresenceSchedule — 向后兼容（三参 feasibility=null）', () => {
  const threeArg = derivePresenceSchedule(scheduleScenarioFixture, NOW, '今晚');

  test('三参路径每条 feasibility 恒为 null（键存在、值为 null）', () => {
    for (const r of threeArg) {
      expect('feasibility' in r).toBe(true);
      expect(r.feasibility).toBeNull();
    }
  });

  test('四参但 windowDefs 查无锚定 → 与三参输出 byte-for-byte 一致', () => {
    const ctx: AvailabilityContext = {
      availabilities: [avail('m-progA', 'aggregateOnly', [MON_AFTERNOON])],
      windowDefs: new Map(), // 无 session.id 锚定
    };
    const fourArg = derivePresenceSchedule(scheduleScenarioFixture, NOW, '今晚', ctx);
    expect(JSON.stringify(fourArg)).toBe(JSON.stringify(threeArg));
  });

  test('parse 后仍满足 PresenceRecommendationSchema', () => {
    for (const r of threeArg)
      expect(PresenceRecommendationSchema.safeParse(r).success).toBe(true);
  });
});

describe('derivePresenceSchedule — ctx 锚定时才写 feasibility', () => {
  // 锚定 sess-tonight-ec（电控组持有 R1 做系统调试）到周一下午窗口。
  const ctxAnchored: AvailabilityContext = {
    availabilities: [
      // 电控组有 m-ecB / m-progA；让 progA 授权冲突 → 电控组容量 2→1 = tight
      avail('m-progA', 'aggregateOnly', [MON_AFTERNOON]),
    ],
    windowDefs: new Map([['sess-tonight-ec', MON_AFTERNOON]]),
  };
  const recs = derivePresenceSchedule(scheduleScenarioFixture, NOW, '今晚', ctxAnchored);
  const byGroup = new Map(recs.map((r) => [r.groupId, r]));

  test('电控组（持有窗）feasibility = tight（容量降到 1）', () => {
    expect(byGroup.get('grp-ec')!.feasibility).toBe('tight');
    expect(byGroup.has('grp-program')).toBe(false); // 无成员、无建议
  });

  test('全部 feasibility ∈ {ample,tight,conflict,null}，无成员维度泄漏', () => {
    for (const r of recs) {
      expect([null, 'ample', 'tight', 'conflict']).toContain(r.feasibility);
    }
  });
});

describe('A2 红线：派生输出 JSON 不含个人课表明细 / memberId 出勤次数', () => {
  const ctx: AvailabilityContext = {
    availabilities: [
      avail('m-progA', 'aggregateOnly', [{ ...MON_AFTERNOON, label: '高数课' }]),
      avail('m-visionA', 'private', [{ ...MON_AFTERNOON, label: '英语课' }]),
    ],
    windowDefs: new Map([['sess-tonight-ec', MON_AFTERNOON]]),
  };
  const recs = derivePresenceSchedule(scheduleScenarioFixture, NOW, '今晚', ctx);
  const json = JSON.stringify(recs);

  test('输出 JSON grep 不到课表 label / startMin / dayOfWeek 明细', () => {
    expect(json).not.toContain('高数课');
    expect(json).not.toContain('英语课');
    expect(json).not.toContain('startMin');
    expect(json).not.toContain('endMin');
    expect(json).not.toContain('dayOfWeek');
    expect(json).not.toContain('recurringBusy');
  });

  test('输出 JSON grep 不到任何 memberId（m- 前缀私有信号）', () => {
    expect(json).not.toContain('m-progA');
    expect(json).not.toContain('m-visionA');
    expect(json).not.toMatch(/"member/i);
  });

  test('每条 rec 的 key 不命中反排名 / 按人均摊正则', () => {
    for (const r of recs) {
      for (const key of Object.keys(r)) {
        expect(key).not.toMatch(
          /member|owner|count|score|rank|percent|completed|duration|attendance/i,
        );
      }
    }
  });

  test('不存在"谁到场最少→多排谁"：rec 无任何 per-member 计数字段', () => {
    // feasibility 是组级整数派生的枚举读数，不是人；rec 上唯一新字段就是它。
    for (const r of recs) {
      const keys = Object.keys(r);
      expect(keys).toContain('feasibility');
      expect(keys).not.toContain('availabilityByMember');
      expect(keys).not.toContain('absenceCount');
      expect(keys).not.toContain('headcountByMember');
    }
  });
});
