import type { RelayStage } from '../../../api/schemas/schedule';
import type { Handoff } from './WorkCard';

type RawHandoff = { id: string; fromSessionId: string; toSessionId: string };

export function buildHandoffMaps(
  rawHandoffs: RawHandoff[],
  stages: RelayStage[] | null,
) {
  const handoffs: Handoff[] = rawHandoffs.map((h) => ({
    id: h.id,
    fromSessionId: h.fromSessionId,
    toSessionId: h.toSessionId,
  }));

  const outgoingBySession = new Map<string, Handoff[]>();
  for (const h of handoffs) {
    const arr = outgoingBySession.get(h.fromSessionId) ?? [];
    arr.push(h);
    outgoingBySession.set(h.fromSessionId, arr);
  }

  const incomingBySession = new Map<string, Handoff[]>();
  for (const h of handoffs) {
    const arr = incomingBySession.get(h.toSessionId) ?? [];
    arr.push(h);
    incomingBySession.set(h.toSessionId, arr);
  }

  const labelBySession = new Map<string, string>();
  for (const s of stages ?? []) {
    labelBySession.set(s.sessionId, s.taskLabel ?? s.groupName);
  }

  return { outgoingBySession, incomingBySession, labelBySession };
}
