import type { DepNode, DepEdge } from '@teamhub/hub-contracts';
import type { Node } from '@xyflow/react';
import type { TranslationKey } from '../../../i18n';
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  CircleDashed,
  Lock,
} from 'lucide-react';

export const NODE_W = 212;
export const NODE_H = 96;

export type DepNodeData = { depNode: DepNode };
export type DepFlowNode = Node<DepNodeData, 'dep'>;

export const STATUS_META: Record<
  DepNode['status'],
  { labelKey: TranslationKey; pill: string; modifier: string; Icon: typeof Activity }
> = {
  working: { labelKey: 'depgraph.status.working', pill: 'badge--green', modifier: 'dag-node--working', Icon: Activity },
  blockedIdle: { labelKey: 'depgraph.status.blockedIdle', pill: 'badge--red', modifier: 'dag-node--blocked-idle', Icon: Lock },
  freeIdle: { labelKey: 'depgraph.status.freeIdle', pill: 'badge--amber', modifier: 'dag-node--free-idle', Icon: CircleDashed },
  done: { labelKey: 'depgraph.status.done', pill: 'badge--neutral', modifier: 'dag-node--done', Icon: CheckCircle2 },
  gap: { labelKey: 'depgraph.status.gap', pill: 'badge--red', modifier: 'dag-node--gap', Icon: AlertCircle },
};

export const EDGE_COLORS: Record<DepEdge['kind'], string> = {
  blocking: 'var(--red)',
  critical: 'var(--blue)',
  need: 'var(--amber)',
  normal: 'var(--border-strong)',
};
