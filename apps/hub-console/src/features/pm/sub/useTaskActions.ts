import { canReviewWeekTask, taskAuthorId } from '@teamhub/hub-contracts';
import { useState } from 'react';
import type { ActorRef, Delivery, MemberPublic, TaskWithMeta } from '@teamhub/hub-contracts';
import type { HubApiClient } from '../../../api/client';
import { queryKeys } from '../../../api/queryKeys';
import type { PageIdentityCtx } from '../../../console-pages';
import { useHubMutation } from '../../../hooks/useHubMutation';
import { toActor } from '../../../shared/lib/identity-utils';

export function useTaskActions(client: HubApiClient, _source: string, task: TaskWithMeta, members: MemberPublic[], identity: PageIdentityCtx) {
  const isIdentity = identity.mode === 'identity' && identity.session != null;
  const writeLocked = !identity.canWrite || (!!task.weekLinks?.length && !isIdentity);
  const [completeActorId, setCompleteActorId] = useState('');
  const [reviewActorId, setReviewActorId] = useState('');
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectNote, setRejectNote] = useState('');
  const [selfAcceptOpen, setSelfAcceptOpen] = useState(false);
  const [deliverySummary, setDeliverySummary] = useState('');
  const [deliveryDeliverable, setDeliveryDeliverable] = useState('');
  const [deliveryPaths, setDeliveryPaths] = useState('');
  const resetState = () => {
    setRejectOpen(false); setRejectNote(''); setSelfAcceptOpen(false);
    setDeliverySummary(''); setDeliveryDeliverable(''); setDeliveryPaths('');
    setCompleteActorId(''); setReviewActorId('');
  };
  const invalidateKeys = [queryKeys.allTasks()];
  const completeMutation = useHubMutation({ invalidateKeys,
    mutationFn: (actor: ActorRef | undefined) => client.completeTask(task.id, actor ? { completedBy: actor } : {}), onSuccess: resetState });
  const reviewMutation = useHubMutation({ invalidateKeys,
    mutationFn: (vars: { outcome: 'accept' | 'reject'; note?: string; actor?: ActorRef; delivery?: Delivery }) =>
      client.reviewTask(task.id, { expectedRevision: task.revision ?? 0, outcome: vars.outcome,
        reviewedBy: vars.actor, note: vars.note, delivery: vars.delivery }), onSuccess: resetState });
  const claimMutation = useHubMutation({ invalidateKeys,
    mutationFn: () => client.claimTask(task.id, { memberId: identity.session?.memberId }) });
  const actionError = completeMutation.error ?? reviewMutation.error ?? claimMutation.error ?? null;
  const sessionId = identity.session?.memberId;
  const selfAccept = Boolean(identity.session && !task.weekLinks?.length && !task.reviewerIds?.length
    && task.status === 'done' && task.completedBy?.id === identity.session.memberId);
  const reviewers = task.reviewerIds?.length
    ? members.filter(member => task.reviewerIds?.includes(member.id))
    : members.filter(member => member.projectManager);
  const canReview = task.weekLinks?.length
    ? Boolean(sessionId && canReviewWeekTask(task, sessionId))
    : task.reviewerIds?.length
      ? Boolean(sessionId && task.reviewerIds.includes(sessionId) && taskAuthorId(task) !== sessionId
        && task.ownerId !== sessionId && task.completedBy?.id !== sessionId)
      : selfAccept || identity.session?.projectManager === true;
  const canComplete = Boolean(task.ownerId && (!sessionId || task.ownerId === sessionId || identity.session?.projectManager));
  const completeActor = (): ActorRef | undefined => isIdentity ? undefined : toActor(members, completeActorId);
  const reviewActor = (): ActorRef | undefined => isIdentity ? undefined : toActor(members, reviewActorId);
  return {
    isIdentity, writeLocked, reviewers, canReview, selfAccept, canComplete, actionError,
    rejectOpen, setRejectOpen, rejectNote, setRejectNote,
    selfAcceptOpen, setSelfAcceptOpen, deliverySummary, setDeliverySummary,
    deliveryDeliverable, setDeliveryDeliverable, deliveryPaths, setDeliveryPaths,
    completeActorId, setCompleteActorId, reviewActorId, setReviewActorId,
    completeMutation, reviewMutation, claimMutation, completeActor, reviewActor,
  };
}
