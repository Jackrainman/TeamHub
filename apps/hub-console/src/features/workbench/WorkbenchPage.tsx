import { BookOpen, Boxes, CalendarDays, LayoutGrid } from 'lucide-react';
import type { HubApiClient } from '../../api/client';
import type { ConsolePage, PageIdentityCtx } from '../../console-pages';
import { useI18n } from '../../i18n';
import { WeekWorkspace } from '../pm/week/WeekWorkspace';

export function WorkbenchPage({ client, source, projectId, identity, onNavigate, availablePages }: {
  client: HubApiClient; source: string; projectId: string; identity: PageIdentityCtx;
  onNavigate: (page: ConsolePage) => void;
  availablePages?: ConsolePage[];
}) {
  const { t } = useI18n();
  const shortcuts = [
    { page: 'project', label: 'nav.project', icon: LayoutGrid },
    { page: 'knowledge', label: 'nav.knowledge', icon: BookOpen },
    { page: 'inv', label: 'nav.inv', icon: Boxes },
    { page: 'schedule', label: 'nav.schedule', icon: CalendarDays },
  ] as const;
  return <WeekWorkspace client={client} source={source} projectId={projectId} identity={identity} aside={<>
    <section><h2>{t('week.shortcuts')}</h2><div className="week-shortcuts">
      {shortcuts.filter(item => !availablePages || availablePages.includes(item.page)).map(({ page, label, icon: Icon }) => <button key={page} className="btn btn--ghost" onClick={() => onNavigate(page)}><Icon size={16} /><span>{t(label)}</span></button>)}
    </div></section>
    <section><h2>{t('week.teamNews')}</h2><span className="week-planned">{t('week.planned')}</span><p className="week-note">{t('week.plannedHint')}</p></section>
  </>} />;
}
