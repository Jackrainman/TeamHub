import { describe, expect, test } from 'vitest';
import {
  GOVERNANCE_SCENARIO_NOW,
  GOVERNANCE_SCENARIO_TIME,
  PresenceRecommendationSchema,
  ResourceSessionSchema,
  SharedResourceSchema,
  derivePresenceSchedule,
  deriveTodayPlanFromPresets,
  scheduleResourceDownFixture,
  scheduleScenarioFixture,
  SCENARIO_WINDOW_WEEKDAY,
  SCENARIO_WINDOW_CONVERGENCE,
  type SharedResource,
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
  const recs = derivePresenceSchedule(scheduleScenarioFixture, NOW, SCENARIO_WINDOW_WEEKDAY);
  const byGroup = new Map(recs.map((r) => [r.groupId, r]));

  test('每条满足 PresenceRecommendationSchema', () => {
    for (const r of recs)
      expect(PresenceRecommendationSchema.safeParse(r).success).toBe(true);
  });

  test('电控组 = present（持有 R1 做 R1 系统调试，平日差异化）', () => {
    const r = byGroup.get('grp-ec')!;
    expect(r.mode).toBe('present');
    expect(r.reason).toBe('holdsResource');
    expect(r.holderTaskLabel).toBe('R1 系统调试'); // 今晚持常规任务（非总联调）
    expect(r.resourceId).toBe('res-r1');
    expect(r.orderInWindow).toBe(0);
  });

  test('电路 = onCall（上游 t-r1-newboard 仍在推进）；电控已是持有组 present', () => {
    expect(byGroup.get('grp-circuit')!.mode).toBe('onCall');
    expect(byGroup.get('grp-circuit')!.reason).toBe('upstreamOnCall');
    expect(byGroup.get('grp-ec')!.mode).toBe('present'); // 持有组，非 onCall
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
    // 电控 / 视觉是程序大组的小组 → reportingGroupId = 程序（parentGroupId 链不变）
    expect(byGroup.get('grp-ec')!.reportingGroupId).toBe('grp-program');
    expect(byGroup.get('grp-vision')!.reportingGroupId).toBe('grp-program');
    // 电路本就顶层 → reportingGroupId = 自身
    expect(byGroup.get('grp-circuit')!.reportingGroupId).toBe('grp-circuit');
    // 排班单元仍是小组（groupId 不被汇报层吞掉）
    expect(byGroup.get('grp-ec')!.groupId).toBe('grp-ec');
    // 程序大组调和后无成员、非持有组、非上游组 → 无排班建议
    expect(byGroup.has('grp-program')).toBe(false);
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
  const recs = derivePresenceSchedule(scheduleResourceDownFixture, NOW, SCENARIO_WINDOW_WEEKDAY);
  const byGroup = new Map(recs.map((r) => [r.groupId, r]));

  test('R1 链相关组全部 free / resourceDown', () => {
    expect(recs.length).toBeGreaterThan(0);
    for (const r of recs) {
      expect(r.mode).toBe('free');
      expect(r.reason).toBe('resourceDown');
    }
  });

  test('持有方电控组也被打成 free（车坏了谁都上不了）；sentinel 不出现', () => {
    const ec = byGroup.get('grp-ec');
    expect(ec?.mode).toBe('free');
    expect(ec?.reason).toBe('resourceDown');
    expect(ec?.factStatement).toContain('撞坏维修中');
    // 哨兵组经 t-r1-integration.groupId 混入 affected，但 render 跳过 → 不出建议
    expect(byGroup.has('grp-convergence')).toBe(false);
    expect(byGroup.has('grp-program')).toBe(false);
  });

  test('只跑 R2 的机械组不受 R1 撞坏影响（沉默）', () => {
    expect(byGroup.has('grp-mech')).toBe(false);
  });
});

describe('blockedFree relatedKnowledge 跨 task 去重（URI 唯一）', () => {
  // 让视觉组两个任务都 blockedIdle 且都挂同一份知识 URI（repo://r2-vision/src）：
  // 不去重则该组 free 建议的 relatedKnowledge 会把同一条资料列两遍。
  const visionA = { id: 'm-visionA', displayName: '视觉A', source: 'console' as const };
  const tampered = {
    ...scheduleScenarioFixture,
    members: scheduleScenarioFixture.members.map((m) =>
      m.id === 'm-visionA' ? { ...m, status: 'idle' as const } : m,
    ),
    dependencies: [
      ...scheduleScenarioFixture.dependencies,
      {
        id: 'dep-dataset-blocked',
        projectId: 'prj-robots',
        fromTaskId: 't-r1-chassis',
        toTaskId: 't-r1-dataset',
        type: 'blocks' as const,
        status: 'active' as const,
        source: 'human' as const,
        confirmedBy: visionA,
        createdAt: GOVERNANCE_SCENARIO_TIME,
        updatedAt: GOVERNANCE_SCENARIO_NOW,
      },
    ],
    taskKnowledgeTags: [
      ...scheduleScenarioFixture.taskKnowledgeTags,
      // 第二个被卡视觉任务挂同一知识节点（kn-vision-cal → repo://r2-vision/src）。
      {
        id: 'tkt-dataset-cal',
        taskId: 't-r1-dataset',
        knowledgeNodeId: 'kn-vision-cal',
        source: 'human' as const,
        confirmedBy: visionA,
      },
    ],
  };

  test('视觉组 free，relatedKnowledge URI 不重复', () => {
    const recs = derivePresenceSchedule(tampered, NOW, SCENARIO_WINDOW_WEEKDAY);
    const vision = recs.find((r) => r.groupId === 'grp-vision');
    expect(vision?.reason).toBe('blockedFree');
    const uris = vision!.relatedKnowledge.map((k) => k.uri);
    // 同一 URI 被两个被卡任务带入，去重后只出现一次
    expect(uris.filter((u) => u === 'repo://r2-vision/src')).toHaveLength(1);
    expect(new Set(uris).size).toBe(uris.length);
  });
});

describe('derivePresenceSchedule — 总联调日（全组各一人，收敛任务）', () => {
  const recs = derivePresenceSchedule(scheduleScenarioFixture, NOW, SCENARIO_WINDOW_CONVERGENCE);
  const byGroup = new Map(recs.map((r) => [r.groupId, r]));

  test('四叶子组各 present；reason=holdsResource、标签=R1 总联调', () => {
    // R1/R2 两条总联调 session 都在「总联调日」；orderInWindow 同为 0，R1 先到 → 标签/资源取 R1。
    for (const gid of ['grp-ec', 'grp-vision', 'grp-mech', 'grp-circuit']) {
      const r = byGroup.get(gid)!;
      expect(r.mode).toBe('present');
      expect(r.reason).toBe('holdsResource');
      expect(r.holderTaskLabel).toBe('R1 总联调');
      expect(r.resourceId).toBe('res-r1');
      expect(r.orderInWindow).toBe(0);
    }
  });

  test('恰好 4 条 present，无 onCall/free；sentinel/program 不出现', () => {
    expect(recs.filter((r) => r.mode === 'present')).toHaveLength(4);
    expect(recs.every((r) => r.mode === 'present')).toBe(true);
    expect(recs.map((r) => r.groupId).sort()).toEqual([
      'grp-circuit',
      'grp-ec',
      'grp-mech',
      'grp-vision',
    ]);
    expect(byGroup.has('grp-convergence')).toBe(false); // 哨兵不输出
    expect(byGroup.has('grp-program')).toBe(false); // 非叶子、无成员
  });

  test('I0：总联调日输出仍零 memberId', () => {
    expect(JSON.stringify(recs)).not.toContain('memberId');
    expect(JSON.stringify(recs)).not.toContain('invitedMemberIds');
  });
});

describe('SharedResourceSchema — defaultPreset 向后兼容（D-082）', () => {
  test('旧落盘数据（无 defaultPreset 键）parse 仍通过', () => {
    const { defaultPreset: _omit, ...legacy } = scheduleScenarioFixture.resources[0];
    expect(SharedResourceSchema.safeParse(legacy).success).toBe(true);
  });

  test('fixture 车带 defaultPreset 时 parse 通过', () => {
    for (const r of scheduleScenarioFixture.resources) {
      expect(SharedResourceSchema.safeParse(r).success).toBe(true);
    }
  });
});

describe('deriveTodayPlanFromPresets — 「使用预设」一键铺今日计划草稿（D-082）', () => {
  const DATE = '2026-07-05';

  test('单组阵型（R1）铺出 1 条草稿：字段对齐 lineup entry', () => {
    const drafts = deriveTodayPlanFromPresets(scheduleScenarioFixture.resources, DATE);
    const r1Drafts = drafts.filter((d) => d.resourceId === 'res-r1');
    expect(r1Drafts).toHaveLength(1);
    expect(r1Drafts[0]).toMatchObject({
      projectId: 'prj-robots',
      resourceId: 'res-r1',
      windowLabel: DATE,
      orderInWindow: 0,
      holderGroupId: 'grp-ec',
      holderTaskId: 't-r1-system-tune',
      invitedMemberIds: [],
      note: null,
      source: 'human',
      eta: null,
    });
  });

  test('多组阵型（R2）lineup 多条 → 多条草稿，orderInWindow 按下标；taskId 可空则 holderTaskId=null', () => {
    const drafts = deriveTodayPlanFromPresets(scheduleScenarioFixture.resources, DATE);
    const r2Drafts = drafts
      .filter((d) => d.resourceId === 'res-r2')
      .sort((a, b) => a.orderInWindow - b.orderInWindow);
    expect(r2Drafts).toHaveLength(2);
    expect(r2Drafts[0]).toMatchObject({
      orderInWindow: 0,
      holderGroupId: 'grp-mech',
      holderTaskId: 't-r2-spare',
    });
    expect(r2Drafts[1]).toMatchObject({
      orderInWindow: 1,
      holderGroupId: 'grp-ec',
      holderTaskId: null,
    });
  });

  test('跳过不可上场车（down/repair/retired/disassembling）即便带 defaultPreset', () => {
    const downResources: SharedResource[] = scheduleScenarioFixture.resources.map((r) =>
      r.id === 'res-r1' ? { ...r, status: 'down' as const } : r,
    );
    const drafts = deriveTodayPlanFromPresets(downResources, DATE);
    expect(drafts.some((d) => d.resourceId === 'res-r1')).toBe(false);
    expect(drafts.some((d) => d.resourceId === 'res-r2')).toBe(true);
  });

  test('未设 defaultPreset 的车沉默跳过（不铺、不报错）', () => {
    const noPreset: SharedResource[] = scheduleScenarioFixture.resources.map((r) =>
      r.id === 'res-r2' ? { ...r, defaultPreset: undefined } : r,
    );
    const drafts = deriveTodayPlanFromPresets(noPreset, DATE);
    expect(drafts.some((d) => d.resourceId === 'res-r2')).toBe(false);
    expect(drafts.some((d) => d.resourceId === 'res-r1')).toBe(true);
  });

  test('I0：invitedMemberIds 恒为空数组，草稿全程无 memberId 维度', () => {
    const drafts = deriveTodayPlanFromPresets(scheduleScenarioFixture.resources, DATE);
    for (const d of drafts) {
      expect(d.invitedMemberIds).toEqual([]);
    }
    expect(JSON.stringify(drafts)).not.toContain('memberId');
  });
});
