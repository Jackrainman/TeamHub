import { taskAuthorId, type ActorRef, type Task, type UpdateSelfTaskRequest } from '@teamhub/hub-contracts';

/** The version check and history append run inside the repository transaction. */
export function buildEditedSelfTask(prev: Task, input: UpdateSelfTaskRequest, actor: ActorRef, at: string): Task | null {
  if (!prev.weekLinks?.length || taskAuthorId(prev) !== actor.id || (prev.revision ?? 0) !== input.expectedRevision) return null;
  const title = input.title ?? prev.title;
  const rawSummary = input.rawSummary ?? prev.rawSummary;
  const reviewerIds = input.reviewerIds ? [...new Set(input.reviewerIds)] : prev.reviewerIds ?? [];
  const contentChanged = title !== prev.title || rawSummary !== prev.rawSummary;
  const reviewersChanged = JSON.stringify([...reviewerIds].sort()) !== JSON.stringify([...(prev.reviewerIds ?? [])].sort());
  if (!contentChanged && !reviewersChanged) return prev;
  const activity = [...(prev.activity ?? [])];
  if (prev.status === 'done' && prev.reviewedBy && prev.reviewedAt && !activity.some(event => event.kind === 'accepted' && event.at === prev.reviewedAt)) {
    activity.push({ kind: 'accepted', at: prev.reviewedAt, by: prev.reviewedBy, ...(prev.reviewNote ? { note: prev.reviewNote } : {}) });
  }
  if (!activity.some(event => event.kind === 'created')) activity.unshift({
    kind: 'created', at: prev.createdAt, by: prev.createdBy ?? prev.weekLinks[0]!.linkedBy,
    title: prev.title, rawSummary: prev.rawSummary, reviewerIds: prev.reviewerIds ?? [],
  });
  if (contentChanged) activity.push({ kind: 'edited', at, by: actor, title, rawSummary });
  if (reviewersChanged) activity.push({ kind: 'reviewersChanged', at, by: actor, reviewerIds });
  const next: Task = { ...prev, title, rawSummary, reviewerIds, activity, updatedAt: at, revision: (prev.revision ?? 0) + 1 };
  if (contentChanged) {
    delete next.polishedSummary;
    delete next.reviewedBy;
    delete next.reviewedAt;
    delete next.reviewNote;
  }
  return next;
}
