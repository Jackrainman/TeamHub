import type { ArtifactRef } from '@teamhub/hub-contracts';
import type { TranslationKey } from './i18n';

/**
 * localStorage key used to override the API base URL.
 * App.tsx reads it at startup; SettingsPage.tsx writes/clears it.
 */
export const APIBASE_KEY = 'teamhub.apiBase';

/**
 * localStorage key for the write token (Bearer) sent on POST /api/* writes.
 * Server requires it when bound to a non-loopback host (0.0.0.0). App.tsx reads
 * it at startup; SettingsPage.tsx writes/clears it. Empty → no Authorization header.
 */
export const WRITE_TOKEN_KEY = 'teamhub.writeToken';

/**
 * localStorage key: 首启动向导（SETUP-WIZARD 刀②）提交并重启完成后、整页刷新前写入的落点提示。
 * 只在「正式 + 登录制」组合下写值 `'roster'`——重启后 ConsoleApp 首屏据此落到设置页 + 亮出
 * 「三步走：导入名册 → 登录本人 → 初始化管理员」引导横幅（复用现有流程，不重复实现）。读到即清除，
 * 只出现一次。其余组合（试驾 / 正式+匿名）不写值，落点走各自默认（总览页）。
 */
export const SETUP_LANDING_KEY = 'teamhub.setup.landing';

/**
 * ArtifactKind → translation key map. Shared between OverviewPage and ArchivePage.
 * HUB-MODULARIZATION 第6步：`ArtifactRef['kind']` 已从闭集 enum 放宽为开放 string（见
 * hub-contracts/schemas.ts），故此处不再是"漏配即编译报错"的穷举——values 是机器人租户已知值
 * （同 `@teamhub/hub-contracts` 的 `ROBOTICS_ARTIFACT_KIND_VALUES`），未知 kind 会读到 undefined，
 * 由调用方兜底（如 ArchivePage 的 groupLabel 模式），不在此处静默假设穷举。
 */
export const ARTIFACT_KIND_KEY: Record<ArtifactRef['kind'], TranslationKey> = {
  firmware: 'enum.artifact.firmware',
  log: 'enum.artifact.log',
  rosbag: 'enum.artifact.rosbag',
  image: 'enum.artifact.image',
  video: 'enum.artifact.video',
  report: 'enum.artifact.report',
  other: 'enum.artifact.other',
};

// B5 图标尺寸三档（design-language §6）：全站 lucide-react 统一用这三档，禁散落魔法数字。
export const ICON_SM = 12;
export const ICON_MD = 14;
export const ICON_LG = 16;
