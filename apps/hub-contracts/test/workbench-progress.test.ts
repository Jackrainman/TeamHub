import { describe, expect, test } from 'vitest';
import {
  deriveMyVehicleProgress,
  deriveSeasonTaskProgress,
  type Task,
} from '../src/index.js';

/**
 * 工作台进度条派生（WORKBENCH-MY-VEHICLE / WORKBENCH-SEASON-PROGRESS）：
 * 非搁置口径 done/total；本车 = 我持有任务中 robotTarget 最多者，完成率按该车全量任务。
 */

function task(partial: Partial<Task> & Pick<Task, 'id'>): Task {
  return {
    projectId: 'prj-robots',
    groupId: 'grp-mech',
    title: partial.id,
    rawSummary: partial.id,
    status: 'pending',
    statusSource: 'console',
    ownerId: null,
    collaboratorIds: [],
    intrinsicComplexity: 'normal',
    lastProgressAt: null,
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    ...partial,
  };
}

describe('deriveSeasonTaskProgress', () => {
  test('空任务列 → 0/0 ratio 0（不 NaN）', () => {
    expect(deriveSeasonTaskProgress([])).toEqual({ total: 0, done: 0, ratio: 0 });
  });

  test('done/total；shelved 从分母分子同时剔除', () => {
    const tasks = [
      task({ id: 'a', status: 'done' }),
      task({ id: 'b', status: 'inProgress' }),
      task({ id: 'c', status: 'blocked' }),
      task({ id: 'd', status: 'shelved' }),
    ];
    const p = deriveSeasonTaskProgress(tasks);
    expect(p.total).toBe(3);
    expect(p.done).toBe(1);
    expect(p.ratio).toBeCloseTo(1 / 3);
  });
});

describe('deriveMyVehicleProgress', () => {
  test('我无持有任务 → null（引导空态）', () => {
    const tasks = [task({ id: 'a', ownerId: 'm-other', robotTarget: 'R1' })];
    expect(deriveMyVehicleProgress(tasks, 'm-me')).toBeNull();
  });

  test('持有任务均无 robotTarget → null', () => {
    const tasks = [task({ id: 'a', ownerId: 'm-me' })];
    expect(deriveMyVehicleProgress(tasks, 'm-me')).toBeNull();
  });

  test('我的车 = 持有任务中出现最多的 robotTarget；完成率 = 该车全量任务（含他人）', () => {
    const tasks = [
      task({ id: 'a', ownerId: 'm-me', robotTarget: 'R1' }),
      task({ id: 'b', ownerId: 'm-me', robotTarget: 'R1', status: 'inProgress' }),
      task({ id: 'c', ownerId: 'm-me', robotTarget: 'R2' }),
      // 他人持有的 R1 任务也计入该车完成率分母
      task({ id: 'd', ownerId: 'm-other', robotTarget: 'R1', status: 'done' }),
      // R2 任务不进 R1 口径
      task({ id: 'e', ownerId: 'm-other', robotTarget: 'R2', status: 'done' }),
    ];
    const p = deriveMyVehicleProgress(tasks, 'm-me');
    expect(p).not.toBeNull();
    expect(p!.robotTarget).toBe('R1');
    expect(p!.total).toBe(3); // a/b/d
    expect(p!.done).toBe(1); // d
    expect(p!.ratio).toBeCloseTo(1 / 3);
  });

  test('我持有的搁置任务不参与「我的车」判定', () => {
    const tasks = [
      task({ id: 'a', ownerId: 'm-me', robotTarget: 'R2', status: 'shelved' }),
      task({ id: 'b', ownerId: 'm-me', robotTarget: 'R1', status: 'done' }),
    ];
    const p = deriveMyVehicleProgress(tasks, 'm-me');
    expect(p!.robotTarget).toBe('R1');
    expect(p!.done).toBe(1);
    expect(p!.total).toBe(1);
  });

  test('并列取先出现者（Map 插入序稳定）', () => {
    const tasks = [
      task({ id: 'a', ownerId: 'm-me', robotTarget: 'R2' }),
      task({ id: 'b', ownerId: 'm-me', robotTarget: 'R1' }),
    ];
    expect(deriveMyVehicleProgress(tasks, 'm-me')!.robotTarget).toBe('R2');
  });
});
