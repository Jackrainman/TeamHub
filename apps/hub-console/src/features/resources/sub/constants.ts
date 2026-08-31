import type { TranslationKey } from '../../../i18n';
import type { ResourceKind, ResourceStatus, RobotTarget } from '@teamhub/hub-contracts';

export const ROBOT_TARGETS: RobotTarget[] = ['R1', 'R2', 'shared'];
export const KINDS: ResourceKind[] = ['robot', 'testRig', 'instrument'];

export const STATUSES: ResourceStatus[] = [
  'available',
  'inUse',
  'repair',
  'retired',
  'disassembling',
  'down',
  'upgrading',
];

export const KIND_KEY: Record<ResourceKind, TranslationKey> = {
  robot: 'resources.kind.robot',
  testRig: 'resources.kind.testRig',
  instrument: 'resources.kind.instrument',
};

export const STATUS_KEY: Record<ResourceStatus, TranslationKey> = {
  available: 'resources.status.available',
  inUse: 'resources.status.inUse',
  down: 'resources.status.down',
  upgrading: 'resources.status.upgrading',
  repair: 'resources.status.repair',
  retired: 'resources.status.retired',
  disassembling: 'resources.status.disassembling',
};

export const STATUS_OPTION_KEY: Record<ResourceStatus, TranslationKey> = {
  available: 'resources.status.available',
  inUse: 'resources.status.inUse',
  down: 'resources.status.down.legacy',
  upgrading: 'resources.status.upgrading.legacy',
  repair: 'resources.status.repair',
  retired: 'resources.status.retired',
  disassembling: 'resources.status.disassembling',
};

export function statusTone(status: ResourceStatus): string {
  switch (status) {
    case 'inUse':
      return 'badge--green';
    case 'available':
      return 'badge--blue';
    case 'repair':
    case 'upgrading':
      return 'badge--amber';
    case 'down':
      return 'badge--red';
    case 'retired':
    case 'disassembling':
      return 'badge--faint';
    default:
      return '';
  }
}
