import { describe, expect, test } from 'vitest';
import {
  BlockAttributionSchema,
  DependencySchema,
  DepGraphSchema,
  GroupSchema,
  KnowledgeNodeSchema,
  MemberKnowledgeSchema,
  MemberSchema,
  NeedSchema,
  TaskKnowledgeTagSchema,
  TaskSchema,
  GOVERNANCE_SCENARIO_NOW,
  deriveBlockAttributions,
  governanceScenarioFixture,
  memberKnowledgeFixtures,
  toDepGraphView,
} from '../src/index.js';

const F = governanceScenarioFixture;
const NOW = GOVERNANCE_SCENARIO_NOW;

describe('治理场景 fixtures 满足 schema', () => {
  test('每个实体 round-trip parse', () => {
    for (const g of F.groups) expect(GroupSchema.safeParse(g).success).toBe(true);
    for (const m of F.members) expect(MemberSchema.safeParse(m).success).toBe(true);
    for (const t of F.tasks) expect(TaskSchema.safeParse(t).success).toBe(true);
    for (const d of F.dependencies) expect(DependencySchema.safeParse(d).success).toBe(true);
    for (const n of F.needs) expect(NeedSchema.safeParse(n).success).toBe(true);
    for (const k of F.knowledgeNodes) expect(KnowledgeNodeSchema.safeParse(k).success).toBe(true);
    for (const tag of F.taskKnowledgeTags) expect(TaskKnowledgeTagSchema.safeParse(tag).success).toBe(true);
    for (const mk of memberKnowledgeFixtures) expect(MemberKnowledgeSchema.safeParse(mk).success).toBe(true);
  });
});

describe('deriveBlockAttributions — 被卡可见、摸鱼沉默、零人名', () => {
  const attrs = deriveBlockAttributions(F, NOW);

  test('只对被卡的视觉C任务产出归因（自由空闲不产出）', () => {
    expect(attrs).toHaveLength(1);
    const ids = attrs.map((a) => a.idleTaskId);
    expect(ids).toContain('t-r1-vision-stream');
    // 机械D 的 t-r2-spare 是自由空闲（无 active 上游边）→ 沉默，不产出归因
    expect(ids).not.toContain('t-r2-spare');
  });

  test('视觉C 归因到底盘任务 + RTOS 缺口（任务/依赖/Need 键）', () => {
    const a = attrs.find((x) => x.idleTaskId === 't-r1-vision-stream')!;
    expect(a.rootBlockerTaskId).toBe('t-r1-chassis');
    expect(a.idleGroupId).toBe('grp-vision');
    expect(a.rootBlockerGroupId).toBe('grp-ec');
    expect(a.blockingDependencyIds).toContain('dep-003');
    expect(a.unmetNeedIds).toContain('need-rtos');
    expect(a.reason).toBe('unmetNeed');
    expect(a.detectedBy).toBe('derived');
    expect(BlockAttributionSchema.safeParse(a).success).toBe(true);
  });

  test('归因事实陈述只含任务/Need，不含任何人名（反排名）', () => {
    const a = attrs.find((x) => x.idleTaskId === 't-r1-vision-stream')!;
    expect(a.factStatement).toContain('视觉→运动数据流');
    expect(a.factStatement).toContain('底盘调试');
    expect(a.factStatement).toContain('RTOS');
    for (const name of ['视觉C', '电控B', '视觉A', '程序A', '机械C', '电路D']) {
      expect(a.factStatement).not.toContain(name);
    }
  });

  test('归因输出结构上无 memberId / 计数 / 时长聚合维度', () => {
    for (const a of attrs) {
      for (const key of Object.keys(a)) {
        expect(key).not.toMatch(/member|owner|count|score|rank|percent|completed|duration/i);
      }
    }
  });
});

describe('toDepGraphView — 两种空闲结构可分', () => {
  const view = toDepGraphView(F, NOW);
  const byId = new Map(view.nodes.map((n) => [n.id, n]));

  test('视图满足 DepGraphSchema', () => {
    expect(DepGraphSchema.safeParse(view).success).toBe(true);
  });

  test('视觉C = blockedIdle 且标明被底盘卡住（任务名非人名）', () => {
    const n = byId.get('t-r1-vision-stream')!;
    expect(n.status).toBe('blockedIdle');
    expect(n.blockedByTaskId).toBe('t-r1-chassis');
    expect(n.blockedByLabel).toBe('R1 底盘调试');
    // 被卡去学资料挂接（本任务 + 根因任务的知识标注）
    const titles = n.relatedKnowledge.map((k) => k.title);
    expect(titles).toContain('R2 同款视觉代码');
    expect(titles).toContain('去年底盘中断笔记');
  });

  test('机械D = freeIdle（自由空闲，与被卡区分开）', () => {
    expect(byId.get('t-r2-spare')!.status).toBe('freeIdle');
  });

  test('底盘 = gap（自身挂未满足 Need）；联调在关键链', () => {
    const chassis = byId.get('t-r1-chassis')!;
    expect(chassis.status).toBe('gap');
    expect(chassis.unmetNeedLabels.length).toBeGreaterThan(0);
    expect(chassis.isCritical).toBe(true);
    expect(byId.get('t-r1-integration')!.isCritical).toBe(true);
    expect(byId.get('t-r1-vision-stream')!.isCritical).toBe(true);
  });

  test('working / 汇总条 / 阻塞边正确', () => {
    expect(byId.get('t-r1-dataset')!.status).toBe('working');
    expect(view.summary.blockedIdleCount).toBe(1);
    expect(view.summary.freeIdleCount).toBe(1);
    expect(view.summary.blockedCount).toBeGreaterThanOrEqual(1);
    const blockingEdge = view.edges.find((e) => e.id === 'dep-003');
    expect(blockingEdge?.kind).toBe('blocking');
  });

  test('DepNode 无人效/排名字段（ownerLabel 仅名字，允许）', () => {
    for (const n of view.nodes) {
      for (const key of Object.keys(n)) {
        expect(key).not.toMatch(/count|score|rank|percent|completed|efficiency|duration/i);
      }
    }
  });
});

describe('C4 护栏：未确认 AI 不参与派生（与 isLiveEdge 对称）', () => {
  test('关键链只走 live 边：satisfied 的 arm-mount 不在关键链，live blocker newboard 在', () => {
    const view = toDepGraphView(F, NOW);
    const byId = new Map(view.nodes.map((n) => [n.id, n]));
    // dep-001 (arm-mount→chassis) status=satisfied → 非 live，不得延伸关键链
    expect(byId.get('t-r1-arm-mount')!.isCritical).toBe(false);
    // dep-002 (newboard→chassis) active+confirmed → live blocker，应在关键链
    expect(byId.get('t-r1-newboard')!.isCritical).toBe(true);
    // 关键链终点链路不变
    expect(byId.get('t-r1-chassis')!.isCritical).toBe(true);
    expect(byId.get('t-r1-integration')!.isCritical).toBe(true);
  });

  test('未确认 AI 知识标注(confirmedBy=null)不进 relatedKnowledge', () => {
    const tampered = {
      ...F,
      knowledgeNodes: [
        ...F.knowledgeNodes,
        {
          id: 'kn-ghost',
          name: '未确认猜测知识点',
          groupId: null,
          parentNodeId: null,
          resourceLinks: [{ label: 'AI瞎猜的资料', uri: 'doc://ghost' }],
          createdAt: NOW,
        },
      ],
      taskKnowledgeTags: [
        ...F.taskKnowledgeTags,
        {
          id: 'tkt-ghost',
          taskId: 't-r1-vision-stream',
          knowledgeNodeId: 'kn-ghost',
          source: 'aiSuggested' as const,
          confirmedBy: null,
        },
      ],
    };
    const view = toDepGraphView(tampered, NOW);
    const n = view.nodes.find((x) => x.id === 't-r1-vision-stream')!;
    const titles = n.relatedKnowledge.map((k) => k.title);
    expect(titles).not.toContain('AI瞎猜的资料');
    // 已确认的标注仍正常挂接（回归护栏）
    expect(titles).toContain('R2 同款视觉代码');
  });
});
