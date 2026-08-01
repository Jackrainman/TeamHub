import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ActorRef, MemberPublic, TaskWithMeta } from '@teamhub/hub-contracts';
import type { HubApiClient } from '../../../api/client';
import type { PageIdentityCtx } from '../../../console-pages';
import { toActor } from '../../../shared/lib/identity-utils';
import { needsCrossClaimConfirm, needsPartner } from '../../../shared/lib/pool-utils';

export function useTaskActions(
  client: HubApiClient,
  source: string,
  task: TaskWithMeta,
  members: MemberPublic[],
  identity: PageIdentityCtx,
) {
  const queryClient = useQueryClient();
  const isIdentity = identity.mode === 'identity' && identity.session != null;
  const writeLocked = !identity.canWrite;

  const [confirmActorId, setConfirmActorId] = useState('');
  const [completeActorId, setCompleteActorId] = useState('');
  const [reviewActorId, setReviewActorId] = useState('');
  const [partnerOpen, setPartnerOpen] = useState(false);
  const [partnerId, setPartnerId] = useState('');
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectNote, setRejectNote] = useState('');

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['tasks', source] });
    void queryClient.invalidateQueries({ queryKey: ['dep-graph', source] });
  };
  const afterAction = () => {
    setPartnerOpen(false);
    setPartnerId('');
    setRejectOpen(false);
    setRejectNote('');
    setConfirmActorId('');
    setCompleteActorId('');
    setReviewActorId('');
    invalidate();
  };

  const partnerMutation = useMutation({
    mutationFn: (memberId: string) =>
      client.setTaskPartner(task.id, { partnerMemberId: memberId }),
    onSuccess: afterAction,
  });
  const confirmMutation = useMutation({
    mutationFn: (actor: ActorRef | undefined) =>
      client.confirmCrossClaim(task.id, actor ? { confirmedBy: actor } : {}),
    onSuccess: afterAction,
  });
  const completeMutation = useMutation({
    mutationFn: (actor: ActorRef | undefined) =>
      client.completeTask(task.id, actor ? { completedBy: actor } : {}),
    onSuccess: afterAction,
  });
  const reviewMutation = useMutation({
    mutationFn: (vars: { outcome: 'accept' | 'reject'; note?: string; actor?: ActorRef }) =>
      client.reviewTask(task.id, {
        outcome: vars.outcome,
        reviewedBy: vars.actor,
        note: vars.note,
      }),
    onSuccess: afterAction,
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
