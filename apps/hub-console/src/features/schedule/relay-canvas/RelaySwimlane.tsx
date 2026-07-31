import { useI18n } from '../../../i18n';
import type { Lane } from '../relay-lanes';
import { WorkCard, type Handoff } from './WorkCard';

export function RelaySwimlane({
  lanes,
  labelBySession,
  outgoingBySession,
  incomingBySession,
  editingEtaId,
  onStartEditEta,
  onCommitEta,
  onCancelEditEta,
  onMove,
  onDelete,
  onCreateHandoff,
  onDeleteHandoff,
}: {
  lanes: Lane[];
  labelBySession: Map<string, string>;
  outgoingBySession: Map<string, Handoff[]>;
  incomingBySession: Map<string, Handoff[]>;
  editingEtaId: string | null;
  onStartEditEta: (sessionId: string) => void;
  onCommitEta: (sessionId: string, value: string) => void;
  onCancelEditEta: () => void;
  onMove: (sessionId: string, dir: -1 | 1) => void;
  onDelete: (sessionId: string) => void;
  onCreateHandoff: (fromSessionId: string, toSessionId: string) => void;
  onDeleteHandoff: (id: string) => void;
}) {
  const { t } = useI18n();
  return (
    <div
      className="relay-swimlane"
      role="region"
      aria-label={t('schedule.relay.swimlaneLabel')}
    >
      {lanes.map((lane) => (
        <section
          className="relay-lane"
          key={lane.resourceId}
          aria-label={t('schedule.relay.laneLabel', { code: lane.displayCode })}
        >
          <div className="relay-lane__head">
            <span className="relay-lane__code">{lane.displayCode}</span>
            <span className="relay-lane__count">
              {t('schedule.relay.laneCount', { n: lane.stages.length })}
            </span>
          </div>
          <ul className="relay-lane__cards">
            {lane.stages.map((stage, idx) => (
              <WorkCard
                key={stage.sessionId}
                stage={stage}
                labelBySession={labelBySession}
                outgoing={outgoingBySession.get(stage.sessionId) ?? []}
                incoming={incomingBySession.get(stage.sessionId) ?? []}
                laneStages={lane.stages}
                etaEditing={editingEtaId === stage.sessionId}
                canMoveLeft={idx > 0}
                canMoveRight={idx < lane.stages.length - 1}
                onStartEditEta={onStartEditEta}
                onCommitEta={onCommitEta}
                onCancelEditEta={onCancelEditEta}
                onMove={onMove}
                onDelete={onDelete}
                onCreateHandoff={onCreateHandoff}
                onDeleteHandoff={onDeleteHandoff}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
