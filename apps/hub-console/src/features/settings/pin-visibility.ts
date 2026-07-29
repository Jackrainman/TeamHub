import type { PageIdentityCtx } from '../../console-pages';

export function canShowMemberPin(identity: PageIdentityCtx, memberId: string): boolean {
  if (identity.mode !== 'identity' || !identity.session) return false;
  return identity.session.memberId === memberId || identity.session.projectManager === true;
}
