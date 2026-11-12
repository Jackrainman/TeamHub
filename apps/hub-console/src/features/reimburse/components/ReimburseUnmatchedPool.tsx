import { Inbox } from 'lucide-react';
import { useI18n } from '../../../i18n';

export interface UnmatchedJobView {
  id: number;
  fileName: string;
  attachmentCount: number;
  unmatched: boolean;
}

/** 未匹配材料仍可预览、拆合或稍后处理；不会自动并入“其他”。 */
export function ReimburseUnmatchedPool({ jobs, currentId, onOpen, onDefer }: {
  jobs: UnmatchedJobView[];
  currentId: number | null;
  onOpen: (id: number) => void;
  onDefer: () => void;
}) {
  const { t } = useI18n();
  const unmatched = jobs.filter((job) => job.unmatched);
  if (unmatched.length === 0) return null;
  return <section className="reimb-unmatched" aria-label={t('reimb.unmatched.title')}>
    <h3><Inbox size={16} />{t('reimb.unmatched.title')}<span className="badge badge--dense badge--amber">{unmatched.length}</span></h3>
    <p className="form-hint">{t('reimb.unmatched.hint')}</p>
    <ul>{unmatched.map((job) => <li key={job.id}>
      <span>{job.fileName}<small>{t('reimb.unmatched.files', { count: job.attachmentCount })}</small></span>
      <button type="button" className="btn btn--sm btn--secondary" disabled={job.id === currentId} onClick={() => onOpen(job.id)}>{t('reimb.unmatched.open')}</button>
    </li>)}</ul>
    {currentId !== null && jobs.length > 1 && <button type="button" className="btn btn--sm btn--ghost" onClick={onDefer}>{t('reimb.unmatched.later')}</button>}
  </section>;
}
