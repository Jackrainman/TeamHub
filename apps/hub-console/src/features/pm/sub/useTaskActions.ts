import { canReviewWeekTask, taskAuthorId } from '@teamhub/hub-contracts';
import { useState } from 'react';
import type { ActorRef, Delivery, MemberPublic, TaskWithMeta } from '@teamhub/hub-contracts';
import type { HubApiClient } from '../../../api/client';
import { queryKeys } from '../../../api/queryKeys';
import type { PageIdentityCtx } from '../../../console-pages';
import { useHubMutation } from '../../../hooks/useHubMutation';
import { toActor } from '../../../shared/lib/identity-utils';
import { needsCrossClaimConfirm, needsPartner } from '../../../shared/lib/pool-utils';

export function useTaskActions(
  client: HubApiClient,
  _source: string,
  task: TaskWithMeta,
  members: MemberPublic[],
  identity: PageIdentityCtx,
) {
  const isIdentity = identity.mode === 'identity' && identity.session != null;
  const writeLocked = !identity.canWrite || (!!task.weekLinks?.length && !isIdentity);

  const [confirmActorId, setConfirmActorId] = useState('');
  const [completeActorId, setCompleteActorId] = useState('');
  const [reviewActorId, setReviewActorId] = useState('');
  const [releaseActorId, setReleaseActorId] = useState('');
  const [partnerOpen, setPartnerOpen] = useState(false);
  const [partnerId, setPartnerId] = useState('');
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectNote, setRejectNote] = useState('');
  const [releaseOpen, setReleaseOpen] = useState(false);
  const [releaseReason, setReleaseReason] = useState('');
  const [selfAcceptOpen, setSelfAcceptOpen] = useState(false);
  const [deliverySummary, setDeliverySummary] = useState('');
  const [deliveryDeliverable, setDeliveryDeliverable] = useState('');
  const [deliveryPaths, setDeliveryPaths] = useState('');

  const resetState = () => {
    setPartnerOpen(false);
    setPartnerId('');
    setRejectOpen(false);
    setRejectNote('');
    setReleaseOpen(false);
    setReleaseReason('');
    setSelfAcceptOpen(false);
    setDeliverySummary('');
    setDeliveryDeliverable('');
    setDeliveryPaths('');
    setConfirmActorId('');
    setCompleteActorId('');
    setReviewActorId('');
    setReleaseActorId('');
  };

  const invalidateKeys = [queryKeys.allTasks(), queryKeys.allDepGraphs()];

  const partnerMutation = useHubMutation({
    invalidateKeys,
    mutationFn: (memberId: string) =>
      client.setTaskPartner(task.id, { partnerMemberId: memberId }),
    onSuccess: resetState,
  });
  const confirmMutation = useHubMutation({
    invalidateKeys,
    mutationFn: (actor: ActorRef | undefined) =>
      client.confirmCrossClaim(task.id, actor ? { confirmedBy: actor } : {}),
    onSuccess: resetState,
  });
  const completeMutation = useHubMutation({
    invalidateKeys,
    mutationFn: (actor: ActorRef | undefined) =>
      client.completeTask(task.id, actor ? { completedBy: actor } : {}),
    onSuccess: resetState,
  });
  const reviewMutation = useHubMutation({
    invalidateKeys,
    mutationFn: (vars: { outcome: 'accept' | 'reject'; note?: string; actor?: ActorRef; delivery?: Delivery }) =>
      client.reviewTask(task.id, {
        expectedRevision: task.revision ?? 0,
        outcome: vars.outcome,
        reviewedBy: vars.actor,
        note: vars.note,
        delivery: vars.delivery,
      }),
    onSuccess: resetState,
  });
  const releaseMutation = useHubMutation({
    invalidateKeys,
    mutationFn: (vars: { reason?: string; actor?: ActorRef }) =>
      client.releaseTask(task.id, { reason: vars.reason, releasedBy: vars.actor }),
    onSuccess: resetState,
  });

  const actionError =
    partnerMutation.error ??
    confirmMutation.error ??
    completeMutation.error ??
    reviewMutation.error ??
    releaseMutation.error ??
    null;

  const groupLeads = members.filter(
    (m) => m.role === 'groupAdmin' && m.groupId === task.groupId,
  );
  const selectedReviewers = members.filter(member => task.reviewerIds?.includes(member.id));
  const reviewers = task.weekLinks?.length || (!task.isBig && selectedReviewers.length)
    ? selectedReviewers
    : members.filter(member => member.gateReviewer);
  const canConfirmLead =
    identity.session?.role === 'groupAdmin' && identity.session?.groupId === task.groupId;
  const selfAccept = !!identity.session && !task.weekLinks?.length && !task.isBig &&
    !task.reviewerIds?.length && task.status === 'done' && task.completedBy?.id === identity.session.memberId;
  const sessionId = identity.session?.memberId;
  const canReview = task.weekLinks?.length
    ? !!sessionId && canReviewWeekTask(task, sessionId)
    : task.isBig
      ? identity.session?.gateReviewer === true
      : task.reviewerIds?.length
        ? !!sessionId && task.reviewerIds.includes(sessionId) && taskAuthorId(task) !== sessionId && task.completedBy?.id !== sessionId
        : selfAccept;
  const canComplete = !task.weekLinks?.length || identity.session?.memberId === task.ownerId;
  const canRelease =
    identity.session?.memberId === task.ownerId ||
    (identity.session?.role === 'groupAdmin' && identity.session?.groupId === task.groupId);
  const releaseCandidates = members.filter(
    (m) => m.id === task.ownerId || groupLeads.some((lead) => lead.id === m.id),
  );

  const confirmActor = (): ActorRef | undefined =>
    isIdentity ? undefined : toActor(members, confirmActorId);
  const completeActor = (): ActorRef | undefined =>
    isIdentity ? undefined : toActor(members, completeActorId);
  const reviewActor = (): ActorRef | undefined =>
    isIdentity ? undefined : toActor(members, reviewActorId);
  const releaseActor = (): ActorRef | undefined =>
    isIdentity ? undefined : toActor(members, releaseActorId);

  const partnerWanted = needsPartner(task, members);
  const crossWanted = needsCrossClaimConfirm(task, task.isBig, members);
  const sameGroupMembers = members.filter((m) => m.groupId === task.groupId);

  return {
    isIdentity,
    writeLocked,
    partnerWanted,
    crossWanted,
    sameGroupMembers,
    groupLeads,
    reviewers,
    releaseCandidates,
    canConfirmLead,
    canReview,
    selfAccept,
    canComplete,
    canRelease,
    actionError,
    partnerOpen,
    setPartnerOpen,
    partnerId,
    setPartnerId,
    rejectOpen,
    setRejectOpen,
    rejectNote,
    setRejectNote,
    releaseOpen,
    setReleaseOpen,
    releaseReason,
    setReleaseReason,
    selfAcceptOpen,
    setSelfAcceptOpen,
    deliverySummary,
    setDeliverySummary,
    deliveryDeliverable,
    setDeliveryDeliverable,
    deliveryPaths,
    setDeliveryPaths,
    confirmActorId,
    setConfirmActorId,
    completeActorId,
    setCompleteActorId,
    reviewActorId,
    setReviewActorId,
    releaseActorId,
    setReleaseActorId,
    partnerMutation,
    confirmMutation,
    completeMutation,
    reviewMutation,
    releaseMutation,
    confirmActor,
    completeActor,
    reviewActor,
    releaseActor,
  };
}
