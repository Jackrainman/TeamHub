import type { ArtifactRef } from '@teamhub/hub-contracts';
import type { TranslationKey } from './i18n';

/**
 * localStorage key used to override the API base URL.
 * App.tsx reads it at startup; SettingsPage.tsx writes/clears it.
 */
export const APIBASE_KEY = 'teamhub.apiBase';

/**
 * ArtifactKind → translation key map.
 * Shared between OverviewPage and ArchivePage (type-safe: enum changes
 * cause a compile error here).
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
