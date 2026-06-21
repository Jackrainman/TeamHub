import { describe, expect, test } from 'vitest';
import {
  GOVERNANCE_SCENARIO_NOW,
  RelayHandoffSchema,
  RelayStageSchema,
  ResourceSessionSchema,
  deriveRelayBoard,
  scheduleResourceDownFixture,
  scheduleScenarioFixture,
  SCENARIO_WINDOW_WEEKDAY,
} from '../src/index.js';
import type { RelayHandoff } from '../src/index.js';

const NOW = GOVERNANCE_SCENARIO_NOW;

describe('ResourceSession.eta 向后兼容', () => {
  test('不传 eta 仍解析通过，默认 null', () => {
    const { eta: _drop, ...withoutEta } = scheduleScenarioFixture.resourceSessions[0];
    const parsed = ResourceSessionSchema.parse(withoutEta);
    expect(parsed.eta).toBe(null);
  });

  test('传入 eta 字符串保留', () => {
    const parsed = ResourceSessionSchema.parse({
      ...scheduleScenarioFixture.resourceSessions[0],
      eta: '约 22:30',
    });
    expect(parsed.eta).toBe('约 22:30');
  });
});

describe('deriveRelayBoard — 接力画布读视图', () => {
  const board = deriveRelayBoard(scheduleScenarioFixture, SCENARIO_WINDOW_WEEKDAY);

  test('每条 stage 满足 RelayStageSchema', () => {
    for (const s of board.stages)
      expect(RelayStageSchema.safeParse(s).success).toBe(true);
  });

  test('字段正确：sessionId / displayCode / group / task / order / eta / boardable', () => {
    expect(board.stages).toHaveLength(1);
    const s = board.stages[0];
    expect(s.sessionId).toBe('sess-tonight-ec');
    expect(s.resourceId).toBe('res-r1');
    // displayCode 走车号回退链：26R1（deriveDisplayCode）
    expect(s.displayCode).toBe('26R1');
    expect(s.groupId).toBe('grp-ec');
    expect(s.groupName).toBe('电控');
    expect(s.taskLabel).toBe('R1 系统调试');
    expect(s.orderInWindow).toBe(0);
    expect(s.boardable).toBe(true);
    expect(s.statusReason).toBe(null);
  });

  test('eta 默认 null（fixture 未填）', () => {
    expect(board.stages[0].eta).toBe(null);
  });

  test('反监视红线：stage 无 member / 出勤 / invited 维度', () => {
    for (const s of board.stages) {
      for (const key of Object.keys(s)) {
        expect(key).not.toMatch(
          /member|invited|owner|count|score|rank|percent|completed|attendance/i,
        );
      }
    }
  });

  test('车不可上时 boardable=false 且带 statusReason（撞坏维修中）', () => {
    const down = deriveRelayBoard(scheduleResourceDownFixture, SCENARIO_WINDOW_WEEKDAY);
    const s = down.stages.find((x) => x.resourceId === 'res-r1')!;
    expect(s.boardable).toBe(false);
    expect(s.statusReason).toBe('撞坏维修中');
  });

  test('未匹配的 windowLabel → 空看板', () => {
    const empty = deriveRelayBoard(scheduleScenarioFixture, '明天上午');
    expect(empty.stages).toHaveLength(0);
    expect(empty.handoffs).toHaveLength(0);
  });
});

describe('deriveRelayBoard — handoffs 按 windowLabel 过滤', () => {
  const tonightHandoff: RelayHandoff = {
    id: 'ho-tonight-1',
    projectId: 'prj-robots',
    windowLabel: SCENARIO_WINDOW_WEEKDAY,
    fromSessionId: 'sess-tonight-ec',
    toSessionId: 'sess-tonight-mech',
    source: 'console',
    confirmedBy: null,
    createdAt: NOW,
  };
  const tomorrowHandoff: RelayHandoff = {
    ...tonightHandoff,
    id: 'ho-tomorrow-1',
    windowLabel: '明天上午',
  };
  const withHandoffs = {
    ...scheduleScenarioFixture,
    relayHandoffs: [tonightHandoff, tomorrowHandoff],
  };

  test('每条 handoff 满足 RelayHandoffSchema', () => {
    for (const h of withHandoffs.relayHandoffs)
      expect(RelayHandoffSchema.safeParse(h).success).toBe(true);
  });

  test('只返回同窗口的交接线', () => {
    const board = deriveRelayBoard(withHandoffs, SCENARIO_WINDOW_WEEKDAY);
    expect(board.handoffs.map((h) => h.id)).toEqual(['ho-tonight-1']);
  });

  test('另一窗口拿到自己的交接线', () => {
    const board = deriveRelayBoard(withHandoffs, '明天上午');
    expect(board.handoffs.map((h) => h.id)).toEqual(['ho-tomorrow-1']);
  });

  test('交接边表先后交接、非任务依赖：主键只 session（无 task / member）', () => {
    for (const h of withHandoffs.relayHandoffs) {
      for (const key of Object.keys(h)) {
        expect(key).not.toMatch(/member|task|owner|count|attendance/i);
      }
    }
  });
});
