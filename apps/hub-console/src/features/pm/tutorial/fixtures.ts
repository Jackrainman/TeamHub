import type { ActorRef, Group, MemberPublic, TaskWithMeta } from '@teamhub/hub-contracts';

export const TUTORIAL_OWNER_ID = 'tutorial-owner';
export const TUTORIAL_REVIEWER_ID = 'tutorial-reviewer';
export const TUTORIAL_GROUP_ID = 'tutorial-group';
export const TUTORIAL_WEEK_KEY = '2026-W45';
export const TUTORIAL_TASK_TITLE = '完成 R1 联调检查';
export const TUTORIAL_TASK_SUMMARY = '按检查单完成联调，记录结果并提交验收。';
export const TUTORIAL_CREATED_AT = '2026-11-02T01:00:00.000Z';

export const tutorialOwner: ActorRef = {
  id: TUTORIAL_OWNER_ID,
  displayName: '林同学',
  source: 'console',
};

export const tutorialReviewer: ActorRef = {
  id: TUTORIAL_REVIEWER_ID,
  displayName: '周同学',
  source: 'console',
};

export const tutorialGroup: Group = {
  id: TUTORIAL_GROUP_ID,
  seasonId: 'tutorial-season',
  parentGroupId: null,
  name: '电控组',
  kind: '电控',
};

function member(actor: ActorRef, grade: MemberPublic['grade']): MemberPublic {
  return {
    id: actor.id,
    displayName: actor.displayName,
    role: 'member',
    grade,
    groupId: TUTORIAL_GROUP_ID,
    status: 'idle',
    currentTaskId: null,
    updatedBy: 'console',
    updatedAt: TUTORIAL_CREATED_AT,
  };
}

export const tutorialMembers: MemberPublic[] = [
  member(tutorialOwner, 'junior'),
  member(tutorialReviewer, 'senior'),
];

export function createTutorialTask(reviewerIds: string[], at: string): TaskWithMeta {
  return {
    id: 'tutorial-task',
    projectId: 'tutorial-project',
    groupId: TUTORIAL_GROUP_ID,
    title: TUTORIAL_TASK_TITLE,
    rawSummary: TUTORIAL_TASK_SUMMARY,
    status: 'inProgress',
    statusSource: 'console',
    ownerId: TUTORIAL_OWNER_ID,
    collaboratorIds: [],
    intrinsicComplexity: 'normal',
    lastProgressAt: at,
    createdAt: at,
    updatedAt: at,
    createdBy: tutorialOwner,
    reviewerIds,
    claimedAt: at,
    weekLinks: [{ weekKey: TUTORIAL_WEEK_KEY, linkedAt: at, linkedBy: tutorialOwner }],
    activity: [{
      kind: 'created',
      at,
      by: tutorialOwner,
      title: TUTORIAL_TASK_TITLE,
      rawSummary: TUTORIAL_TASK_SUMMARY,
      reviewerIds,
    }],
    transitions: [{ from: null, to: 'inProgress', at, by: tutorialOwner }],
    ownershipEvents: [{
      kind: 'claimed',
      fromOwnerId: null,
      toOwnerId: TUTORIAL_OWNER_ID,
      at,
      by: tutorialOwner,
    }],
    revision: 0,
    isBig: false,
    previousOwnerIds: [],
  };
}
