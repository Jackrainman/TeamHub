import type { TranslationKey } from '../../../i18n';
import type { BaselineMilestonePublic, BaselinePhaseType, BaselineSegmentKind, MilestoneDriftLevel } from '@teamhub/hub-contracts';

export const PHASE_KEY: Record<BaselinePhaseType, TranslationKey> = {
  rd: 'enum.phase.rd',
  iterate: 'enum.phase.iterate',
  tuning: 'enum.phase.tuning',
  vacuum: 'enum.phase.vacuum',
};
export const SEGMENT_KEY: Record<BaselineSegmentKind, TranslationKey> = {
  semester: 'enum.segment.semester',
  vacation: 'enum.segment.vacation',
  vacuum: 'enum.segment.vacuum',
};

export const LEVEL_TONE: Record<'red' | 'yellow' | 'green', string> = {
  red: 'badge--red',
  yellow: 'badge--amber',
  green: 'badge--green',
};

export function statusKey(
  milestone: BaselineMilestonePublic,
  level: MilestoneDriftLevel,
): TranslationKey {
  const isGate = milestone.kind === 'gate';
  if (milestone.status === 'passed') {
    return isGate ? 'overview.baseline.ms.passed' : 'overview.baseline.ms.reached';
  }
  if (milestone.status === 'missed') return 'overview.baseline.ms.missed';
  if (level === 'red') {
    return isGate ? 'overview.baseline.ms.overdueGate' : 'overview.baseline.ms.behind';
  }
  if (level === 'yellow') return 'overview.baseline.ms.tight';
  return 'overview.baseline.ms.onTrack';
}

export const dateOf = (iso: string): string => iso.slice(0, 10);
