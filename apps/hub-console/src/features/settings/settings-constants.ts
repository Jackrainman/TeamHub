import type {
  AgentBackend,
  BotChannel,
  MemberRole,
} from '@teamhub/hub-contracts';
import type { TranslationKey } from '../../i18n';

// Agent 后端 / 数据源共用生命周期状态枚举 → 文案键（枚举变更会在此处编译报错）。
export const LIFECYCLE_STATUS_KEY: Record<AgentBackend['status'], TranslationKey> = {
  enabled: 'enum.adapter.enabled',
  disabled: 'enum.adapter.disabled',
  degraded: 'enum.adapter.degraded',
  unconfigured: 'enum.adapter.unconfigured',
};

// BOT 渠道用连接型状态枚举（独立文案）。
export const BOT_CHANNEL_STATUS_KEY: Record<BotChannel['status'], TranslationKey> = {
  connected: 'enum.botChannel.connected',
  disconnected: 'enum.botChannel.disconnected',
  unconfigured: 'enum.botChannel.unconfigured',
};

// tone 映射（design-language.md §3）：未配置=中性基色（非活跃信号），空串即 .badge 默认灰。
export const BOT_CHANNEL_PILL_CLASS: Record<BotChannel['status'], string> = {
  connected: 'badge--green',
  disconnected: 'badge--red',
  unconfigured: '',
};

// Agent 后端 / 数据源生命周期状态 → tone（原 `status-${status}` 字符串拼接类）。
export const LIFECYCLE_PILL_CLASS: Record<AgentBackend['status'], string> = {
  enabled: 'badge--green',
  degraded: 'badge--amber',
  disabled: 'badge--red',
  unconfigured: '',
};

// 成员角色枚举 → 文案键（K1 权限地基 + MEMBER-PM-FLAG 刀②b 收窄两档；枚举变更会在此处编译报错）。
// 项目管理权限不走本下拉——每行另有「项目管理」开关（PUT project-manager）。
export const ROLE_KEY: Record<MemberRole, TranslationKey> = {
  groupAdmin: 'settings.members.role.groupAdmin',
  member: 'settings.members.role.member',
};
export const MEMBER_ROLE_OPTIONS: readonly MemberRole[] = ['groupAdmin', 'member'];

// 语言选项——扩展时须同步 i18n 键（settings.language.<value>）与 Lang 类型。
export const LANG_OPTIONS = [
  { value: 'zh' as const, labelKey: 'settings.language.zh' as const },
  { value: 'en' as const, labelKey: 'settings.language.en' as const },
];

// 主题选项——扩展时须同步 i18n 键（settings.theme.<value>）与 Theme 类型。
export const THEME_OPTIONS = [
  { value: 'tech' as const, labelKey: 'settings.theme.tech' as const },
  { value: 'classic' as const, labelKey: 'settings.theme.classic' as const },
  { value: 'warm' as const, labelKey: 'settings.theme.warm' as const },
  { value: 'dark' as const, labelKey: 'settings.theme.dark' as const },
];

// 数据域标识 → 人话标签键（K3 部署信息）。deployment.storage 的 domain 是稳定机器键
// （gov/kb/inv/baseline/checklist），此处映射到 i18n；未知域回落显示原始 domain 串。
export const DEPLOY_DOMAIN_KEY: Record<string, TranslationKey> = {
  gov: 'settings.deployment.domain.gov',
  kb: 'settings.deployment.domain.kb',
  inv: 'settings.deployment.domain.inv',
  baseline: 'settings.deployment.domain.baseline',
  checklist: 'settings.deployment.domain.checklist',
};

// 落盘后端 → 徽章文案键（K3）。file/sqlite = 落盘（绿）；memory = 内存（琥珀警示）。
export const DEPLOY_BACKEND_KEY: Record<'file' | 'sqlite' | 'memory', TranslationKey> = {
  file: 'settings.deployment.backend.file',
  sqlite: 'settings.deployment.backend.sqlite',
  memory: 'settings.deployment.backend.memory',
};

export interface IntegrationRow {
  key: string;
  name: string;
  meta: string;
  statusLabel: string;
  pillClass: string;
}
