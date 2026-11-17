import type { MemberRole } from '@teamhub/hub-contracts';
import type { TranslationKey } from '../../i18n';

export const ROLE_KEY: Record<MemberRole, TranslationKey> = {
  groupAdmin: 'settings.members.role.groupAdmin',
  member: 'settings.members.role.member',
};
export const MEMBER_ROLE_OPTIONS: readonly MemberRole[] = ['groupAdmin', 'member'];
export const LANG_OPTIONS = [
  { value: 'zh' as const, labelKey: 'settings.language.zh' as const },
  { value: 'en' as const, labelKey: 'settings.language.en' as const },
];
export const THEME_OPTIONS = [
  { value: 'notion' as const, labelKey: 'settings.theme.notion' as const },
  { value: 'notion-dark' as const, labelKey: 'settings.theme.notionDark' as const },
  { value: 'linear' as const, labelKey: 'settings.theme.linear' as const },
  { value: 'tech' as const, labelKey: 'settings.theme.tech' as const },
  { value: 'classic' as const, labelKey: 'settings.theme.classic' as const },
  { value: 'warm' as const, labelKey: 'settings.theme.warm' as const },
  { value: 'dark' as const, labelKey: 'settings.theme.dark' as const },
];
