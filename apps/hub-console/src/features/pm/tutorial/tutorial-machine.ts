import { canReviewWeekTask, type TaskWithMeta } from '@teamhub/hub-contracts';
import {
  createTutorialTask,
  TUTORIAL_CREATED_AT,
  TUTORIAL_OWNER_ID,
  TUTORIAL_REVIEWER_ID,
  tutorialOwner,
  tutorialReviewer,
} from './fixtures';

export const TASK_TUTORIAL_PHASES = [
  'intro',
  'create',
  'reviewer',
  'submit',
  'complete',
  'switchReviewer',
  'openReview',
  'review',
  'rejectReason',
  'rejectSwitchOwner',
  'completeAgain',
  'rejectSwitchReviewer',
  'reopenReview',
  'finished',
] as const;

export type TaskTutorialPhase = typeof TASK_TUTORIAL_PHASES[number];

export interface TaskTutorialState {
  phase: TaskTutorialPhase;
  actorId: string;
  selectedReviewerIds: string[];
  task: TaskWithMeta | null;
  detailOpen: boolean;
  rejectOpen: boolean;
  eventIndex: number;
}

export type TaskTutorialAction =
  | { type: 'next' }
  | { type: 'openCreate' }
  | { type: 'toggleReviewer', memberId: string }
  | { type: 'submit' }
  | { type: 'complete' }
  | { type: 'switchActor', memberId: string }
  | { type: 'openDetail' }
  | { type: 'startReject' }
  | { type: 'reject', reason: string }
  | { type: 'accept' }
  | { type: 'reset' };

export const TASK_TUTORIAL_TARGETS: Partial<Record<TaskTutorialPhase, string>> = {
  create: 'create',
  reviewer: 'reviewer',
  submit: 'submit',
  complete: 'complete',
  completeAgain: 'complete',
  switchReviewer: 'reviewer-role',
  rejectSwitchReviewer: 'reviewer-role',
  rejectSwitchOwner: 'owner-role',
  openReview: 'open-task',
  reopenReview: 'open-task',
  review: 'accept',
  rejectReason: 'reject',
};

const MAIN_PHASES: TaskTutorialPhase[] = [
  'intro', 'create', 'reviewer', 'submit', 'complete',
  'switchReviewer', 'openReview', 'review', 'finished',
];

export function taskTutorialProgress(phase: TaskTutorialPhase): number {
  if (phase === 'rejectReason' || phase.startsWith('reject')) return 8;
  if (phase === 'completeAgain' || phase === 'reopenReview') return 8;
  return MAIN_PHASES.indexOf(phase) + 1;
}

export function initialTaskTutorialState(): TaskTutorialState {
  return {
    phase: 'intro',
    actorId: TUTORIAL_OWNER_ID,
    selectedReviewerIds: [],
    task: null,
    detailOpen: false,
    rejectOpen: false,
    eventIndex: 0,
  };
}

function nextTimestamp(state: TaskTutorialState): string {
  return new Date(Date.parse(TUTORIAL_CREATED_AT) + (state.eventIndex + 1) * 60_000).toISOString();
}

function actorFor(memberId: string) {
  return memberId === TUTORIAL_REVIEWER_ID ? tutorialReviewer : tutorialOwner;
}

export function taskTutorialReducer(
  state: TaskTutorialState,
  action: TaskTutorialAction,
): TaskTutorialState {
  if (action.type === 'reset') return initialTaskTutorialState();
  if (action.type === 'next' && state.phase === 'intro') return { ...state, phase: 'create' };
  if (action.type === 'openCreate' && state.phase === 'create') return { ...state, phase: 'reviewer' };

  if (action.type === 'toggleReviewer' && state.phase === 'reviewer' && action.memberId === TUTORIAL_REVIEWER_ID) {
    const selected = state.selectedReviewerIds.includes(action.memberId);
    return {
      ...state,
      selectedReviewerIds: selected ? [] : [action.memberId],
      phase: selected ? 'reviewer' : 'submit',
    };
  }

  if (action.type === 'submit' && state.phase === 'submit' && !state.task &&
      state.selectedReviewerIds.includes(TUTORIAL_REVIEWER_ID)) {
    const at = nextTimestamp(state);
    return {
      ...state,
      task: createTutorialTask(state.selectedReviewerIds, at),
      phase: 'complete',
      eventIndex: state.eventIndex + 1,
    };
  }

  if (action.type === 'complete' &&
      (state.phase === 'complete' || state.phase === 'completeAgain') &&
      state.actorId === TUTORIAL_OWNER_ID && state.task?.status === 'inProgress' &&
      state.task.reviewerIds?.includes(TUTORIAL_REVIEWER_ID)) {
    const at = nextTimestamp(state);
    return {
      ...state,
      task: {
        ...state.task,
        status: 'done',
        completedBy: tutorialOwner,
        reviewedBy: undefined,
        reviewedAt: undefined,
        reviewNote: undefined,
        lastProgressAt: at,
        updatedAt: at,
        revision: (state.task.revision ?? 0) + 1,
        transitions: [...(state.task.transitions ?? []), { from: 'inProgress', to: 'done', at, by: tutorialOwner }],
      },
      phase: state.phase === 'completeAgain' ? 'rejectSwitchReviewer' : 'switchReviewer',
      detailOpen: false,
      eventIndex: state.eventIndex + 1,
    };
  }

  if (action.type === 'switchActor') {
    const destinations: Partial<Record<TaskTutorialPhase, { actor: string; phase: TaskTutorialPhase }>> = {
      switchReviewer: { actor: TUTORIAL_REVIEWER_ID, phase: 'openReview' },
      rejectSwitchOwner: { actor: TUTORIAL_OWNER_ID, phase: 'completeAgain' },
      rejectSwitchReviewer: { actor: TUTORIAL_REVIEWER_ID, phase: 'reopenReview' },
    };
    const destination = destinations[state.phase];
    if (!destination || destination.actor !== action.memberId) return state;
    return { ...state, actorId: action.memberId, phase: destination.phase };
  }

  if (action.type === 'openDetail' &&
      (state.phase === 'openReview' || state.phase === 'reopenReview') && state.task) {
    return { ...state, detailOpen: true, phase: 'review' };
  }

  if (action.type === 'startReject' && state.phase === 'review' && state.task &&
      canReviewWeekTask(state.task, state.actorId)) {
    return { ...state, phase: 'rejectReason', rejectOpen: true };
  }

  if (action.type === 'reject' && state.phase === 'rejectReason' && state.task &&
      action.reason.trim() && canReviewWeekTask(state.task, state.actorId)) {
    const at = nextTimestamp(state);
    const reviewer = actorFor(state.actorId);
    return {
      ...state,
      task: {
        ...state.task,
        status: 'inProgress',
        reviewedBy: reviewer,
        reviewedAt: at,
        reviewNote: action.reason.trim(),
        updatedAt: at,
        revision: (state.task.revision ?? 0) + 1,
        activity: [...(state.task.activity ?? []), { kind: 'rejected', at, by: reviewer, note: action.reason.trim() }],
        transitions: [...(state.task.transitions ?? []), { from: 'done', to: 'inProgress', at, by: reviewer }],
      },
      phase: 'rejectSwitchOwner',
      detailOpen: false,
      rejectOpen: false,
      eventIndex: state.eventIndex + 1,
    };
  }

  if (action.type === 'accept' && state.phase === 'review' && state.task &&
      canReviewWeekTask(state.task, state.actorId)) {
    const at = nextTimestamp(state);
    const reviewer = actorFor(state.actorId);
    return {
      ...state,
      task: {
        ...state.task,
        reviewedBy: reviewer,
        reviewedAt: at,
        reviewNote: undefined,
        updatedAt: at,
        revision: (state.task.revision ?? 0) + 1,
        activity: [...(state.task.activity ?? []), { kind: 'accepted', at, by: reviewer }],
      },
      phase: 'finished',
      eventIndex: state.eventIndex + 1,
    };
  }

  return state;
}
