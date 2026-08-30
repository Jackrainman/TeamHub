import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, GitBranch, X } from 'lucide-react';
import type { RelayStage } from '../../../api/schemas/schedule';
import { useI18n } from '../../../i18n';

export type Handoff = { id: string; fromSessionId: string; toSessionId: string };

function EtaInput({
  initial,
  placeholder,
  ariaLabel,
  onCommit,
  onCancel,
}: {
  initial: string;
  placeholder: string;
  ariaLabel: string;
  onCommit: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  return (
    <input
      ref={ref}
      className="relay-card__eta-input"
      type="text"
      value={value}
      aria-label={ariaLabel}
      placeholder={placeholder}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => onCommit(value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          onCommit(value);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          onCancel();
        }
      }}
    />
  );
}

export function WorkCard({
  stage,
  labelBySession,
  outgoing,
  incoming,
  laneStages,
  etaEditing,
  canMoveLeft,
  canMoveRight,
  onStartEditEta,
  onCommitEta,
  onCancelEditEta,
  onMove,
  onDelete,
  onCreateHandoff,
  onDeleteHandoff,
}: {
  stage: RelayStage;
  labelBySession: Map<string, string>;
  outgoing: Handoff[];
  incoming: Handoff[];
  laneStages: RelayStage[];
  etaEditing: boolean;
  canMoveLeft: boolean;
  canMoveRight: boolean;
  onStartEditEta: (sessionId: string) => void;
  onCommitEta: (sessionId: string, value: string) => void;
  onCancelEditEta: () => void;
  onMove: (sessionId: string, dir: -1 | 1) => void;
  onDelete: (sessionId: string) => void;
  onCreateHandoff: (fromSessionId: string, toSessionId: string) => void;
  onDeleteHandoff: (id: string) => void;
}) {
  const { t } = useI18n();
  const [showPicker, setShowPicker] = useState(false);
  const s = stage;
  const className = [
    'relay-card',
    s.boardable ? 'relay-card--boardable' : 'relay-card--closed',
    // IA-RESTRUCTURE 产品拍板：未挂任务的排班卡显式标注（虚线边 + 徽标），消除"泳道有卡、依赖图无节点"的误导。
    s.taskLabel ? '' : 'relay-card--unlinked',
  ]
    .filter(Boolean)
    .join(' ');

  const downstreamIds = new Set(outgoing.map((h) => h.toSessionId));
  const pickable = laneStages.filter(
    (c) => c.sessionId !== s.sessionId && !downstreamIds.has(c.sessionId),
  );

  return (
    <li className={className}>
      <div className="relay-card__head">
        <span className="relay-card__code">{s.displayCode}</span>
        <div className="relay-card__reorder">
          <button
            type="button"
            className="relay-card__move"
            aria-label={t('schedule.relay.moveLeft')}
            title={t('schedule.relay.moveLeft')}
            disabled={!canMoveLeft}
            onClick={() => onMove(s.sessionId, -1)}
          >
            <ChevronLeft size={14} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="relay-card__move"
            aria-label={t('schedule.relay.moveRight')}
            title={t('schedule.relay.moveRight')}
            disabled={!canMoveRight}
            onClick={() => onMove(s.sessionId, 1)}
          >
            <ChevronRight size={14} aria-hidden="true" />
          </button>
        </div>
      </div>
      <div className="relay-card__group">{s.groupName}</div>
      {s.taskLabel ? (
        <div className="relay-card__task">{s.taskLabel}</div>
      ) : (
        <div className="relay-card__unlinked">{t('schedule.relay.unlinked')}</div>
      )}
      {!s.boardable ? (
        <div className="relay-card__closed-note">
          {t('schedule.relay.boardingClosed', { reason: s.statusReason ?? '—' })}
        </div>
      ) : null}

      {incoming.length > 0 || outgoing.length > 0 ? (
        <ul className="relay-rels" aria-label={t('schedule.relay.relsLabel')}>
          {incoming.map((h) => (
            <li className="relay-rel relay-rel--in" key={h.id}>
              <span className="relay-rel__text">
                {t('schedule.relay.relAfter', {
                  task: labelBySession.get(h.fromSessionId) ?? '—',
                })}
              </span>
              <button
                type="button"
                className="relay-rel__del"
                aria-label={t('schedule.relay.handoffDelete')}
                title={t('schedule.relay.handoffDelete')}
                onClick={() => onDeleteHandoff(h.id)}
              >
                <X size={12} aria-hidden="true" />
              </button>
            </li>
          ))}
          {outgoing.map((h) => (
            <li className="relay-rel relay-rel--out" key={h.id}>
              <span className="relay-rel__text">
                {t('schedule.relay.relThen', {
                  task: labelBySession.get(h.toSessionId) ?? '—',
                })}
              </span>
              <button
                type="button"
                className="relay-rel__del"
                aria-label={t('schedule.relay.handoffDelete')}
                title={t('schedule.relay.handoffDelete')}
                onClick={() => onDeleteHandoff(h.id)}
              >
                <X size={12} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="relay-card__eta">
        <span className="relay-card__eta-label">{t('schedule.relay.eta')}</span>
        {etaEditing ? (
          <EtaInput
            initial={s.eta ?? ''}
            placeholder={t('schedule.relay.etaPlaceholder')}
            ariaLabel={t('schedule.relay.eta')}
            onCommit={(value) => onCommitEta(s.sessionId, value)}
            onCancel={onCancelEditEta}
          />
        ) : (
          <button
            type="button"
            className="relay-card__eta-value"
            onClick={() => onStartEditEta(s.sessionId)}
            title={t('schedule.relay.etaEdit')}
          >
            {s.eta ?? t('schedule.relay.etaEmpty')}
          </button>
        )}
      </div>

      <div className="relay-card__actions">
        <div className="relay-card__then">
          <button
            type="button"
            className="relay-card__then-btn"
            aria-label={t('schedule.relay.addHandoff')}
            title={t('schedule.relay.addHandoff')}
            aria-expanded={showPicker}
            disabled={pickable.length === 0}
            onClick={() => setShowPicker((v) => !v)}
          >
            <GitBranch size={12} aria-hidden="true" />
            {t('schedule.relay.addHandoff')}
          </button>
          {showPicker ? (
            <select
              className="relay-card__then-select"
              aria-label={t('schedule.relay.handoffPick')}
              defaultValue=""
              onChange={(e) => {
                const to = e.target.value;
                if (to) onCreateHandoff(s.sessionId, to);
                setShowPicker(false);
              }}
            >
              <option value="" disabled>
                {t('schedule.relay.handoffPick')}
              </option>
              {pickable.map((c) => (
                <option value={c.sessionId} key={c.sessionId}>
                  {labelBySession.get(c.sessionId) ?? c.groupName}
                </option>
              ))}
            </select>
          ) : null}
        </div>
        <button
          type="button"
          className="relay-card__delete"
          onClick={() => onDelete(s.sessionId)}
        >
          {t('schedule.relay.deleteLeg')}
        </button>
      </div>
    </li>
  );
}
