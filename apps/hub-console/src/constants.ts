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
