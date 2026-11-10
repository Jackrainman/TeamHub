import { describe, expect, test } from 'vitest';
import { deriveTaskAcceptance, TaskSchema } from '@teamhub/hub-contracts';
import {
  initialTaskTutorialState,
  taskTutorialReducer,
  taskTutorialProgress,
  type TaskTutorialState,
} from '../src/features/pm/tutorial/tutorial-machine';
import {
  TUTORIAL_OWNER_ID,
  TUTORIAL_REVIEWER_ID,
} from '../src/features/pm/tutorial/fixtures';

function atReview(): TaskTutorialState {
  let state = initialTaskTutorialState();
  for (const action of [
    { type: 'next' },
    { type: 'openCreate' },
    { type: 'toggleReviewer', memberId: TUTORIAL_REVIEWER_ID },
    { type: 'submit' },
    { type: 'complete' },
    { type: 'switchActor', memberId: TUTORIAL_REVIEWER_ID },
    { type: 'openDetail' },
  ] as const) state = taskTutorialReducer(state, action);
  return state;
}

describe('任务教程固定 Demo 状态机', () => {
  test('未选验收人时不能创建，选择后才进入提交步骤', () => {
    const initial = initialTaskTutorialState();
    expect(taskTutorialReducer(initial, { type: 'submit' })).toBe(initial);
    const opened = taskTutorialReducer(
      taskTutorialReducer(initial, { type: 'next' }),
      { type: 'openCreate' },
    );
    expect(taskTutorialReducer(opened, { type: 'submit' })).toBe(opened);
    const selected = taskTutorialReducer(opened, { type: 'toggleReviewer', memberId: TUTORIAL_REVIEWER_ID });
    expect(selected.phase).toBe('submit');
    const created = taskTutorialReducer(selected, { type: 'submit' });
    expect(created.task?.status).toBe('inProgress');
    expect(created.task?.ownerId).toBe(TUTORIAL_OWNER_ID);
    expect(created.task?.reviewerIds).toEqual([TUTORIAL_REVIEWER_ID]);
    expect(TaskSchema.parse(created.task)).toBeTruthy();
  });

  test('负责人完成后保持待验收，指定验收人通过后才已验收', () => {
    const review = atReview();
    expect(review.task?.status).toBe('done');
    expect(deriveTaskAcceptance(review.task!, review.task!.isBig)).toBe('awaitingReview');
    const accepted = taskTutorialReducer(review, { type: 'accept' });
    expect(accepted.phase).toBe('finished');
    expect(accepted.task?.status).toBe('done');
    expect(accepted.task?.reviewedBy?.id).toBe(TUTORIAL_REVIEWER_ID);
    expect(deriveTaskAcceptance(accepted.task!, accepted.task!.isBig)).toBe('accepted');
    expect(accepted.task?.activity?.at(-1)?.kind).toBe('accepted');
    expect(TaskSchema.parse(accepted.task)).toBeTruthy();
  });

  test('负责人、其他成员和跳步动作都不能验收或推进', () => {
    const review = atReview();
    const ownerTrying = { ...review, actorId: TUTORIAL_OWNER_ID };
    expect(taskTutorialReducer(ownerTrying, { type: 'accept' })).toBe(ownerTrying);
    const strangerTrying = { ...review, actorId: 'tutorial-stranger' };
    expect(taskTutorialReducer(strangerTrying, { type: 'accept' })).toBe(strangerTrying);
    const initial = initialTaskTutorialState();
    expect(taskTutorialReducer(initial, { type: 'accept' })).toBe(initial);
    expect(taskTutorialReducer(initial, { type: 'complete' })).toBe(initial);
  });

  test('打回需要理由，回到进行中；再次完成清除旧结论但保留历史', () => {
    const review = atReview();
    const rejecting = taskTutorialReducer(review, { type: 'startReject' });
    expect(taskTutorialReducer(rejecting, { type: 'reject', reason: ' ' })).toBe(rejecting);
    const rejected = taskTutorialReducer(rejecting, { type: 'reject', reason: '请补充联调记录' });
    expect(rejected.task?.status).toBe('inProgress');
    expect(rejected.task?.reviewNote).toBe('请补充联调记录');
    expect(rejected.task?.activity?.at(-1)?.kind).toBe('rejected');

    const owner = taskTutorialReducer(rejected, { type: 'switchActor', memberId: TUTORIAL_OWNER_ID });
    const completed = taskTutorialReducer(owner, { type: 'complete' });
    expect(completed.task?.status).toBe('done');
    expect(completed.task?.reviewedBy).toBeUndefined();
    expect(completed.task?.reviewedAt).toBeUndefined();
    expect(completed.task?.reviewNote).toBeUndefined();
    expect(completed.task?.activity?.some(event => event.kind === 'rejected')).toBe(true);
    expect(deriveTaskAcceptance(completed.task!, completed.task!.isBig)).toBe('awaitingReview');

    const reviewer = taskTutorialReducer(completed, { type: 'switchActor', memberId: TUTORIAL_REVIEWER_ID });
    const reopened = taskTutorialReducer(reviewer, { type: 'openDetail' });
    const accepted = taskTutorialReducer(reopened, { type: 'accept' });
    expect(accepted.phase).toBe('finished');
    expect(accepted.task?.activity?.filter(event => event.kind === 'accepted')).toHaveLength(1);
    expect(TaskSchema.parse(accepted.task)).toBeTruthy();
  });

  test('重置恢复完全相同的固定初始状态，步骤进度稳定', () => {
    const review = atReview();
    expect(taskTutorialReducer(review, { type: 'reset' })).toEqual(initialTaskTutorialState());
    expect(taskTutorialProgress('intro')).toBe(1);
    expect(taskTutorialProgress('review')).toBe(8);
    expect(taskTutorialProgress('rejectReason')).toBe(8);
    expect(taskTutorialProgress('finished')).toBe(9);
  });
});
