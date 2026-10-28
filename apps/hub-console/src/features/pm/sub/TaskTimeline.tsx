import type { TaskWithMeta } from '@teamhub/hub-contracts';
import { useI18n } from '../../../i18n';
import { formatDay, STATUS_KEY } from './constants';
import { factTime } from '../week/format';

export function TaskTimeline({ task }: { task: TaskWithMeta }) {
  const { t } = useI18n();
  const facts = [
    ...(task.transitions ?? []).map(event => ({
      at: event.at,
      label: `${event.from ? `${t(STATUS_KEY[event.from])} → ` : ''}${t(STATUS_KEY[event.to])}`,
      by: event.by?.displayName, note: undefined as string | undefined,
    })),
    ...(task.ownershipEvents ?? []).map(event => ({
      at: event.at, label: t(`week.fact.${event.kind}`), by: event.by.displayName, note: event.reason,
    })),
    ...(task.reviewedAt && task.reviewedBy ? [{
      at: task.reviewedAt, label: t('week.reviewedBy'), by: task.reviewedBy.displayName, note: task.reviewNote,
    }] : []),
  ].sort((a, b) => a.at.localeCompare(b.at));
  if (!facts.length) return null;
  return <div className="tl-wrap">
    <h4 className="tl-title">{t('pool.timeline.title')}</h4>
    <ol className="tl-list">{facts.map((fact, index) => <li key={index} className="tl-item">
      <span className="tl-status">{fact.label}{fact.note ? ` · ${fact.note}` : ''}</span>
      <time className="tl-at" dateTime={fact.at}>{task.weekLinks?.length ? factTime(fact.at) : formatDay(fact.at)}</time>
      {fact.by && <span className="tl-by">{fact.by}</span>}
    </li>)}</ol>
  </div>;
}
