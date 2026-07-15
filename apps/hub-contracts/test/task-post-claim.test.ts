import { describe, expect, test } from 'vitest';
import {
  TaskSchema,
  isBigTask,
  deriveTaskAcceptance,
  isPostedTask,
  AssignTaskRequestSchema,
  ReviewTaskRequestSchema,
  ClaimTaskRequestSchema,
  TasksQuerySchema,
} from '../src/index.js';
import type { ActorRef } from '../src/index.js';

/**
 * 挂单认领制契约单测（TASK-POST-CLAIM，D-088 / docs/design/task-post-claim.md §3–§5）：
 * 结构尺（isBigTask）+ 验收态派生（deriveTaskAcceptance）+ 挂单态派生（isPostedTask）
 * + 留名字段向后兼容 + 写侧动作契约（Assign 理由强制 / Review reject 带 note）。
 */

const reviewer: ActorRef = {
  id: 'm-senior',
  displayName: '大三学长',
  source: 'console',
};

/**
 * 最小合法 Task 输入（覆盖字段用 overrides 覆写）——**不含任何挂单留名字段**，专测向后兼容：
 * 旧 fixture / 落盘 JSON 不带留名字段簇，仍应 parse 通过。
 */
function taskInput(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: 't-1',
    projectId: 'prj-1',
    groupId: 'grp-ec',
    title: '组装 R1 底盘',
    rawSummary: '把底盘装起来',
    status: 'pending',
    statusSource: 'console',
    ownerId: null,
    collaboratorIds: [],
    intrinsicComplexity: 'normal',
    lastProgressAt: null,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('isBigTask — 大任务结构尺（§4 不看大小看结构）', () => {
  test('挂门/里程碑（milestoneId != null）→ 大', () => {
    expect(isBigTask({ id: 't-1', milestoneId: 'm-g4' }, [])).toBe(true);
  });

  test('有下游依赖边（fromTaskId===id 且 status active）→ 大', () => {
    expect(
      isBigTask({ id: 't-1', milestoneId: undefined }, [
        { fromTaskId: 't-1', status: 'active' },
      ]),
    ).toBe(true);
  });

  test('下游边已 waived → 不算"有人等"→ 非大', () => {
    expect(
      isBigTask({ id: 't-1', milestoneId: undefined }, [
        { fromTaskId: 't-1', status: 'waived' },
      ]),
    ).toBe(false);
  });

  test('裸任务（无门、无下游边）→ 非大', () => {
    expect(
      isBigTask({ id: 't-1', milestoneId: undefined }, [
        // 该边的上游是别的任务（fromTaskId !== 't-1'），不构成 t-1 的下游压力
        { fromTaskId: 't-other', status: 'active' },
      ]),
    ).toBe(false);
  });
});

describe('deriveTaskAcceptance — 验收态派生（§5 两档制，不动 TaskStatus 枚举）', () => {
  test('status !== done → notDone（无论大小活）', () => {
    expect(
      deriveTaskAcceptance({ status: 'inProgress', reviewedBy: undefined }, true),
    ).toBe('notDone');
    expect(
      deriveTaskAcceptance({ status: 'pending', reviewedBy: undefined }, false),
    ).toBe('notDone');
  });

  test('done + 简单活（!isBig）→ selfDone', () => {
    expect(
      deriveTaskAcceptance({ status: 'done', reviewedBy: undefined }, false),
    ).toBe('selfDone');
  });

  test('done + 大活 + 未验收 → awaitingReview（done 后仍"待验收"）', () => {
    expect(
      deriveTaskAcceptance({ status: 'done', reviewedBy: undefined }, true),
    ).toBe('awaitingReview');
  });

  test('done + 大活 + 已 reviewedBy 留名 → accepted', () => {
    expect(
      deriveTaskAcceptance({ status: 'done', reviewedBy: reviewer }, true),
    ).toBe('accepted');
  });
});

describe('isPostedTask — 挂单态派生（§3 无主的活，零新增字段）', () => {
  test('ownerId null + pending → 挂单', () => {
    expect(isPostedTask({ ownerId: null, status: 'pending' })).toBe(true);
  });

  test('ownerId null + inProgress → 挂单（仍待做）', () => {
    expect(isPostedTask({ ownerId: null, status: 'inProgress' })).toBe(true);
  });

  test('ownerId null + done → 非挂单（已完成，池子不再需要有人领）', () => {
    expect(isPostedTask({ ownerId: null, status: 'done' })).toBe(false);
  });

  test('ownerId null + shelved → 非挂单（已搁置）', () => {
    expect(isPostedTask({ ownerId: null, status: 'shelved' })).toBe(false);
  });

  test('ownerId 有主 + pending → 非挂单（有人领了）', () => {
    expect(isPostedTask({ ownerId: 'm-2', status: 'pending' })).toBe(false);
  });
});

describe('TaskSchema — 留名字段簇 optional 向后兼容', () => {
  test('不带任何留名字段的老 JSON → parse 通过，留名字段为 undefined', () => {
    const res = TaskSchema.safeParse(taskInput());
    expect(res.success).toBe(true);
    if (!res.success) throw new Error('应通过');
    expect(res.data.claimedAt).toBeUndefined();
    expect(res.data.assignReason).toBeUndefined();
    expect(res.data.assignedBy).toBeUndefined();
    expect(res.data.partnerMemberId).toBeUndefined();
    expect(res.data.crossClaimConfirmedBy).toBeUndefined();
    expect(res.data.completedBy).toBeUndefined();
    expect(res.data.reviewedBy).toBeUndefined();
    expect(res.data.reviewNote).toBeUndefined();
  });

  test('带全套留名字段的任务 → parse 通过并保留值', () => {
    const res = TaskSchema.safeParse(
      taskInput({
        ownerId: 'm-2',
        status: 'done',
        claimedAt: '2026-07-02T10:00:00.000Z',
        assignReason: '带他上手 6020 拓展测试',
        assignedBy: reviewer,
        partnerMemberId: 'm-3',
        crossClaimConfirmedBy: reviewer,
        completedBy: { id: 'm-2', displayName: '学弟', source: 'console' },
        reviewedBy: reviewer,
        reviewNote: '抽查通过',
      }),
    );
    expect(res.success).toBe(true);
    if (!res.success) throw new Error('应通过');
    expect(res.data.claimedAt).toBe('2026-07-02T10:00:00.000Z');
    expect(res.data.assignReason).toBe('带他上手 6020 拓展测试');
    expect(res.data.partnerMemberId).toBe('m-3');
    expect(res.data.reviewedBy).toEqual(reviewer);
  });

  test('assignReason 空串 → 拒绝（min(1)）', () => {
    const res = TaskSchema.safeParse(taskInput({ assignReason: '' }));
    expect(res.success).toBe(false);
  });
});

describe('AssignTaskRequestSchema — 指派理由 schema 层强制（§3）', () => {
  test('有 ownerId + reason → 通过', () => {
    const res = AssignTaskRequestSchema.safeParse({
      ownerId: 'm-2',
      reason: '分配 = 显式培养投资',
    });
    expect(res.success).toBe(true);
  });

  test('缺 reason → 拒绝（指派必写理由的结构强制点）', () => {
    const res = AssignTaskRequestSchema.safeParse({ ownerId: 'm-2' });
    expect(res.success).toBe(false);
  });

  test('reason 空串 → 拒绝', () => {
    const res = AssignTaskRequestSchema.safeParse({
      ownerId: 'm-2',
      reason: '',
    });
    expect(res.success).toBe(false);
  });
});

describe('ClaimTaskRequestSchema — 认领零摩擦（§3 无 reason）', () => {
  test('空 body（身份模式服务端取 session）→ 通过', () => {
    expect(ClaimTaskRequestSchema.safeParse({}).success).toBe(true);
  });

  test('匿名模式带 memberId → 通过', () => {
    expect(ClaimTaskRequestSchema.safeParse({ memberId: 'm-2' }).success).toBe(
      true,
    );
  });
});

describe('ReviewTaskRequestSchema — 学长验收/打回（§5）', () => {
  test('reject 带 note（打回理由）→ 通过', () => {
    const res = ReviewTaskRequestSchema.safeParse({
      outcome: 'reject',
      reviewedBy: reviewer,
      note: '焊点虚焊，重做',
    });
    expect(res.success).toBe(true);
    if (!res.success) throw new Error('应通过');
    expect(res.data.outcome).toBe('reject');
    expect(res.data.note).toBe('焊点虚焊，重做');
  });

  test('accept 无 note → 通过（note optional）', () => {
    expect(
      ReviewTaskRequestSchema.safeParse({ outcome: 'accept' }).success,
    ).toBe(true);
  });

  test('非法 outcome → 拒绝', () => {
    expect(
      ReviewTaskRequestSchema.safeParse({ outcome: 'maybe' }).success,
    ).toBe(false);
  });

  test('note 空串 → 拒绝（min(1)）', () => {
    expect(
      ReviewTaskRequestSchema.safeParse({ outcome: 'reject', note: '' })
        .success,
    ).toBe(false);
  });
});

describe('TasksQuerySchema — "看谁做过"子串搜索（§3）', () => {
  test('带 q → 通过', () => {
    expect(TasksQuerySchema.safeParse({ q: 'CAN 丢包' }).success).toBe(true);
  });

  test('缺省 q → 通过（返回全部，向后兼容）', () => {
    expect(TasksQuerySchema.safeParse({}).success).toBe(true);
  });

  test('q 空串 → 拒绝（min(1)）', () => {
    expect(TasksQuerySchema.safeParse({ q: '' }).success).toBe(false);
  });
});
