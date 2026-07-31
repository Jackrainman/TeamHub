import { Handle, Position, type NodeProps, type NodeTypes } from '@xyflow/react';
import { Users, Zap } from 'lucide-react';
import { useI18n } from '../../../i18n';
import { STATUS_META, type DepFlowNode } from './constants';

export function DepNodeCard({ data, selected }: NodeProps<DepFlowNode>) {
  const { t } = useI18n();
  const n = data.depNode;
  const meta = STATUS_META[n.status];
  const Icon = meta.Icon;
  const className = [
    'dag-node',
    meta.modifier,
    n.isCritical ? 'dag-node--critical' : '',
    selected ? 'dag-node--selected' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={className}>
      <Handle type="target" position={Position.Top} />
      <div className="dag-node__head">
        <Icon size={14} aria-hidden="true" />
        <span className="dag-node__title">{n.label}</span>
      </div>
      <div className="dag-node__owner">
        {n.groupName}
        {n.robotTarget ? ` · ${n.robotTarget}` : ''}
      </div>
      {n.status === 'blockedIdle' && n.blockedByLabel ? (
        <div className="dag-node__blocked">
          {t('depgraph.node.blockedBy', { label: n.blockedByLabel })}
        </div>
      ) : null}
      <div className="dag-node__badges">
        <span className={`dag-node__tag ${meta.pill}`}>{t(meta.labelKey)}</span>
        {n.isCritical ? (
          <span className="dag-node__tag dag-node__tag--critical">
            <Zap size={12} aria-hidden="true" /> {t('depgraph.node.criticalChain')}
          </span>
        ) : null}
        {n.isConvergenceTask ? (
          <span className="dag-node__tag dag-node__tag--convergence">
            <Users size={12} aria-hidden="true" /> {t('depgraph.node.convergence')}
          </span>
        ) : null}
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

export const nodeTypes: NodeTypes = { dep: DepNodeCard };
