import { useState, useEffect, useRef } from 'react';
import { Search } from 'lucide-react';
import { useI18n } from '../../i18n';
import type { HubApiClient } from '../../api/client';
import type { ConsolePage } from '../../console-pages';
import { SideDrawer } from '../../components/SideDrawer';
import { useGlobalSearch } from './hooks';

const TYPE_PAGE: Record<string, ConsolePage> = { task: 'project', kb: 'knowledge', inventory: 'inv' };
const TYPE_LABEL = { task: 'expected.searchTask', kb: 'expected.searchKb', inventory: 'expected.searchInventory' } as const;
export function GlobalSearch({ client, onNavigate, availablePages }: {
  client: HubApiClient; onNavigate: (page: ConsolePage) => void; availablePages: ConsolePage[];
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const trigger = useRef<HTMLButtonElement>(null);
  const search = useGlobalSearch(client, query, open);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setOpen(true); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
  const close = () => { setOpen(false); trigger.current?.focus(); };
  const results = search.data?.results.filter(result => availablePages.includes(TYPE_PAGE[result.type])) ?? [];
  return <>
    <button type="button" className="search-trigger" ref={trigger} onClick={() => setOpen(true)} aria-label={t('expected.searchTitle')}><Search size={16} /><span>{t('layout.search.placeholder')}</span><kbd>Ctrl / ⌘ K</kbd></button>
    <SideDrawer open={open} onClose={close} title={t('expected.searchTitle')}>
      <form className="search-dialog-form" onSubmit={event => { event.preventDefault(); const value = input.trim(); if (value === query) void search.refetch(); else setQuery(value); }}>
        <div className="gate-field"><input autoFocus type="search" value={input} onChange={event => { setInput(event.target.value); if (!event.target.value.trim()) setQuery(''); }} aria-label={t('expected.searchTitle')} placeholder={t('layout.search.placeholder')} /></div>
        <button type="submit" className="btn btn--primary" disabled={!input.trim()}>{t('expected.search')}</button>
      </form>
      {!query ? <p className="expected-page-hint">{t('expected.searchHint')}</p> : search.isFetching ? <p role="status">{t('expected.searchLoading')}</p> : search.isError ? <div role="alert"><p>{t('expected.searchError')}</p><button className="btn btn--secondary" onClick={() => void search.refetch()}>{t('week.retry')}</button></div> : <div className="search-results">
        {results.length === 0 && <p>{t('layout.search.empty')}</p>}
        {results.map(result => <button type="button" className="card card--interactive search-result" key={`${result.type}-${result.id}`} onClick={() => { onNavigate(TYPE_PAGE[result.type]); close(); }}>
          <span className="badge">{t(TYPE_LABEL[result.type as keyof typeof TYPE_LABEL])}</span><strong>{result.title}</strong><small>{result.snippet}</small>
        </button>)}
      </div>}
    </SideDrawer>
  </>;
}
