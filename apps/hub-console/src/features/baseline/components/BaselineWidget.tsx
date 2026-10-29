import { useState } from 'react';
import { CalendarDays, CheckCircle2, Circle, TriangleAlert, ChevronDown, ChevronUp } from 'lucide-react';
import type { HubApiClient } from '../../../api/client';
import { useI18n } from '../../../i18n';
import { useBaseline } from '../hooks';
import { useSeasons } from '../../pm/hooks';

export function BaselineWidget({ client, source }: { client: HubApiClient; source: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(true);
  const seasons = useSeasons(client);
  const season = seasons.data?.seasons.find(value => value.status === 'active');
  const query = useBaseline(client, source, season?.id);
  const milestones = query.data?.baseline?.milestones ?? [];
  const passed = milestones.filter(item => item.status === 'passed').length;
  const statusKeys = { passed: 'overview.baseline.ms.passed', pending: 'expected.pending', missed: 'overview.baseline.ms.missed' };
  return <section className="card baseline-widget">
    <button className="baseline-widget__toggle" onClick={() => setOpen(value => !value)} aria-expanded={open} aria-label={t(open ? 'expected.baselineClose' : 'expected.baselineOpen')}><span><small>{t('expected.baselineEyebrow')}</small><strong>{t('expected.baseline')}</strong></span>{open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</button>
    {open && <div className="baseline-widget__body">
      {seasons.isLoading || (season && query.isLoading) ? <p role="status">{t('overview.baseline.loading')}</p> : seasons.error || query.error ? <p role="alert">{t('overview.baseline.error')}</p> : milestones.length === 0 ? <p>{t('expected.baselineEmpty')}</p> : <>
        <p>{season?.name}</p><strong>{t('expected.baselineProgress', { done: passed, total: milestones.length })}</strong>
        <div className="baseline-widget__track" role="progressbar" aria-label={t('expected.baseline')} aria-valuenow={passed} aria-valuemin={0} aria-valuemax={milestones.length}><span style={{ width: `${100 * passed / milestones.length}%` }} /></div>
        <p className="expected-page-hint">{t('expected.baselineHint')}</p>
        <ol>{milestones.map(item => { const Icon = item.status === 'passed' ? CheckCircle2 : item.status === 'missed' ? TriangleAlert : Circle; return <li key={item.id} className={`is-${item.status}`}><Icon size={16} /><div><strong>{item.title}</strong><span>{t(statusKeys[item.status])}</span><time dateTime={item.plannedAt}><CalendarDays size={12} />{new Date(item.plannedAt).toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' })}</time></div></li>; })}</ol>
      </>}
    </div>}
  </section>;
}
