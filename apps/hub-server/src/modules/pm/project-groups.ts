import type { Member } from '@teamhub/hub-contracts';

/** Resolve unique project groups in participant order; unknown members have no derived group. */
export function deriveProjectGroupIds(
  memberIds: readonly string[],
  members: readonly Pick<Member, 'id' | 'groupId'>[],
): string[] {
  const membersById = new Map(members.map((member) => [member.id, member]));
  const seen = new Set<string>();
  const groupIds: string[] = [];
  for (const memberId of memberIds) {
    const groupId = membersById.get(memberId)?.groupId;
    if (!groupId || seen.has(groupId)) continue;
    seen.add(groupId);
    groupIds.push(groupId);
  }
  return groupIds;
}
