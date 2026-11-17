import type { Member } from '@teamhub/hub-contracts';

export function isGateReviewer(members: readonly Member[], memberId: string): boolean {
  return members.some((member) => member.id === memberId && member.gateReviewer === true);
}
export function isGroupLeadOf(members: readonly Member[], memberId: string, groupId: string): boolean {
  return members.some((member) => member.id === memberId && member.groupId === groupId && member.role === 'groupAdmin');
}
export function memberHasPmFlag(member: Pick<Member, 'projectManager'>): boolean {
  return member.projectManager === true;
}
export function isSuperAdmin(members: readonly Member[], memberId: string): boolean {
  return members.some((member) => member.id === memberId && memberHasPmFlag(member));
}
