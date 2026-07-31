import { useEffect, useState } from 'react';
import { BookOpen, MapPin } from 'lucide-react';
import { EmptyState } from '../../../shared/EmptyState';
import type { DepNode, TaskStatus } from '@teamhub/hub-contracts';
import { useI18n, type TranslationKey } from '../../../i18n';
import { STATUS_META } from './constants';

const TASK_STATUS_ORDER: TaskStatus[] = [
  'pending',
  'inProgress',
  'blocked',
  'done',
  'shelved',
];
const TASK_STATUS_LABEL: Record<TaskStatus, TranslationKey> = {
  pending: 'depgraph.status.raw.pending',
  inProgress: 'depgraph.status.raw.inProgress',
  blocked: 'depgraph.status.raw.blocked',
  done: 'depgraph.status.raw.done',
  shelved: 'depgraph.status.raw.shelved',
};

function complexityKey(c: DepNode['intrinsicComplexity']): TranslationKey {
  if (c === 'trivial') return 'depgraph.complexity.trivial';
  if (c === 'normal') return 'depgraph.complexity.normal';
  return 'depgraph.complexity.hard';
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="detail-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function DetailPanel({
  node,
  currentStatus,
  onChangeStatus,
  statusPending,
}: {
  node: DepNode | null;
  currentStatus?: TaskStatus;
  onChangeStatus: (status: TaskStatus) => void;
  statusPending: boolean;
}) {
  const { t } = useI18n();
  const [pendingShelve, setPendingShelve] = useState(false);
  useEffect(() => {
    setPendingShelve(false);
  }, [node?.id ?? null]);
  if (!node) {
    return (
      <aside className="panel dep-graph-detail">
        <div className="panel-header">
          <h2>{t('depgraph.detail.title')}</h2>
          <span>{t('depgraph.detail.clickAny')}</span>
        </div>
        <EmptyState title={t('depgraph.detail.empty')} />
      </aside>
    );
  }
  const meta = STATUS_META[node.status];
  const onSelectStatus = (next: TaskStatus) => {
    if (next === 'shelved') {
      setPendingShelve(true);
      return;
    }
    setPendingShelve(false);
    onChangeStatus(next);
  };
  const showLearn = node.status === 'blockedIdle' && node.relatedKnowledge.length > 0;
  const showMyMap = node.status === 'blockedIdle' || node.status === 'freeIdle';
  return (
    <aside className="panel dep-graph-detail">
      <div className="panel-header">
        <h2>{node.label}</h2>
        <span className={`badge badge--wide ${meta.pill}`}>{t(meta.labelKey)}</span>
      </div>
      <div className="detail-list">
        <DetailRow
          label={t('depgraph.detail.ownerGroup')}
          value={`${node.ownerLabel ?? t('depgraph.node.unassigned')} · ${node.groupName}`}
        />
        <p className="detail-note">{t('depgraph.detail.ownerNote')}</p>
        <DetailRow
          label={t('depgraph.detail.robotComplexity')}
          value={[node.robotTarget, t(complexityKey(node.intrinsicComplexity))]
            .filter(Boolean)
            .join(' · ')}
        />
        {node.status === 'blockedIdle' && node.blockedByLabel ? (
          <DetailRow
            label={t('depgraph.detail.blockedBy')}
            value={t('depgraph.detail.blockedByValue', { label: node.blockedByLabel })}
          />
        ) : null}
        {node.unmetNeedLabels.length > 0 ? (
          <DetailRow
            label={t('depgraph.detail.unmetNeeds')}
            value={node.unmetNeedLabels.join('；')}
          />
        ) : null}
        {node.isCritical ? (
          <DetailRow
            label={t('depgraph.detail.criticalChain')}
            value={t('depgraph.detail.criticalChainValue')}
          />
        ) : null}
      </div>
      <div className="detail-actions">
        <label className="detail-status-select">
          <span>{t('depgraph.status.changeLabel')}</span>
          <select
            value={currentStatus ?? ''}
            disabled={statusPending}
            onChange={(e) => onSelectStatus(e.target.value as TaskStatus)}
          >
            {currentStatus ? null : (
              <option value="" disabled>
                {t('depgraph.status.changePlaceholder')}
              </option>
            )}
            {TASK_STATUS_ORDER.map((s) => (
              <option key={s} value={s}>
                {t(TASK_STATUS_LABEL[s])}
              </option>
            ))}
          </select>
        </label>
        {pendingShelve ? (
          <div className="detail-confirm">
            <span>{t('depgraph.status.shelveConfirmPrompt')}</span>
            <div className="detail-confirm__btns">
              <button
                type="button"
                className="btn btn--sm btn--danger"
                disabled={statusPending}
                onClick={() => {
                  setPendingShelve(false);
                  onChangeStatus('shelved');
                }}
              >
                {t('depgraph.status.shelveConfirm')}
              </button>
              <button
                type="button"
                className="btn btn--sm btn--ghost"
                onClick={() => setPendingShelve(false)}
              >
                {t('depgraph.status.shelveCancel')}
              </button>
            </div>
          </div>
        ) : null}
      </div>
      {showLearn ? (
        <div className="learn-block">
          <h4>
            <BookOpen size={14} aria-hidden="true" /> {t('depgraph.detail.learnTitle')}
          </h4>
          <ul>
            {node.relatedKnowledge.map((k) => (
              <li key={k.uri ?? k.title} className="learn-block__pending">
                <span>{k.title}</span>
                <span className="soon-badge">{t('nav.soon')}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {showMyMap ? (
        <span
          className="my-map-link my-map-link--disabled"
          title={t('nav.soon')}
        >
          <MapPin size={14} aria-hidden="true" /> {t('depgraph.detail.myMap')}
          <span className="soon-badge">{t('nav.soon')}</span>
        </span>
      ) : null}
    </aside>
  );
}
