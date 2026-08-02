import { useState } from 'react';
import type { ActorRef, MemberPublic, TaskWithMeta } from '@teamhub/hub-contracts';
import type { HubApiClient } from '../../../api/client';
import { queryKeys } from '../../../api/queryKeys';
import type { PageIdentityCtx } from '../../../console-pages';
import { useHubMutation } from '../../../hooks/useHubMutation';
import { toActor } from '../../../shared/lib/identity-utils';
import { needsCrossClaimConfirm, needsPartner } from '../../../shared/lib/pool-utils';

export function useTaskActions(
  client: HubApiClient,
  source: string,
  task: TaskWithMeta,
  members: MemberPublic[],
  identity: PageIdentityCtx,
) {
  const isIdentity = identity.mode === 'identity' && identity.session != null;
  const writeLocked = !identity.canWrite;

  const [confirmActorId, setConfirmActorId] = useState('');
  const [completeActorId, setCompleteActorId] = useState('');
  const [reviewActorId, setReviewActorId] = useState('');
  const [partnerOpen, setPartnerOpen] = useState(false);
  const [partnerId, setPartnerId] = useState('');
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectNote, setRejectNote] = useState('');

  const resetState = () => {
    setPartnerOpen(false);
    setPartnerId('');
    setRejectOpen(false);
    setRejectNote('');
    setConfirmActorId('');
    setCompleteActorId('');
    setReviewActorId('');
  };

  const invalidateKeys = [queryKeys.tasks(source), queryKeys.depGraph(source)];

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
    mutationFn: (vars: { outcome: 'accept' | 'reject'; note?: string; actor?: ActorRef }) =>
      client.reviewTask(task.id, {
        outcome: vars.outcome,
        reviewedBy: vars.actor,
        note: vars.note,
      }),
    onSuccess: resetState,
  });

  const actionError =
    partnerMutation.error ??
    confirmMutation.error ??
    completeMutation.error ??
    reviewMutation.error ??
    null;

  const groupLeads = members.filter(
    (m) => m.role === 'groupAdmin' && m.groupId === task.groupId,
  );
  const reviewers = members.filter((m) => m.gateReviewer);
  const canConfirmLead =
    identity.session?.role === 'groupAdmin' && identity.session?.groupId === task.groupId;
  const canReview = identity.session?.gateReviewer === true;

  const confirmActor = (): ActorRef | undefined =>
    isIdentity ? undefined : toActor(members, confirmActorId);
  const completeActor = (): ActorRef | undefined =>
    isIdentity ? undefined : toActor(members, completeActorId);
  const reviewActor = (): ActorRef | undefined =>
    isIdentity ? undefined : toActor(members, reviewActorId);

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
    canConfirmLead,
    canReview,
    actionError,
    partnerOpen,
    setPartnerOpen,
    partnerId,
    setPartnerId,
    rejectOpen,
    setRejectOpen,
    rejectNote,
    setRejectNote,
    confirmActorId,
    setConfirmActorId,
    completeActorId,
    setCompleteActorId,
    reviewActorId,
    setReviewActorId,
    partnerMutation,
    confirmMutation,
    completeMutation,
    reviewMutation,
    confirmActor,
    completeActor,
    reviewActor,
  };
}
