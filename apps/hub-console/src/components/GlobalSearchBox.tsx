import { useState, useRef, useEffect } from 'react';
import { Search } from 'lucide-react';
import { useI18n } from '../i18n';
import type { HubApiClient } from '../api/client';
import type { ConsolePage } from '../console-pages';

interface SearchResult {
  type: string;
  id: string;
  title: string;
  snippet: string;
}

const TYPE_PAGE: Record<string, ConsolePage> = {
  task: 'project',
  kb: 'knowledge',
  inventory: 'inv',
};

const TYPE_LABEL: Record<string, string> = {
  task: '任务',
  kb: '知识库',
  inventory: '库存',
};

export function GlobalSearchBox({
  client,
  onNavigate,
}: {
  client: HubApiClient;
  onNavigate: (page: ConsolePage) => void;
}) {
  const { t } = useI18n();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const doSearch = (query: string) => {
    if (!query.trim()) {
      setResults(null);
      setOpen(false);
      return;
    }
    setLoading(true);
    client
      .globalSearch(query.trim())
      .then((res: { results: SearchResult[] }) => {
        setResults(res.results);
        setOpen(true);
      })
      .catch(() => setResults([]))
      .finally(() => setLoading(false));
  };

  const onChange = (val: string) => {
    setQ(val);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => doSearch(val), 300);
  };

  return (
    <div className="global-search" ref={boxRef}>
      <div className="global-search__input-wrap">
        <Search size={14} aria-hidden="true" className="global-search__icon" />
        <input
          className="global-search__input"
          type="search"
          value={q}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => results && setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') doSearch(q);
            if (e.key === 'Escape') setOpen(false);
          }}
          placeholder={t('layout.search.placeholder')}
          aria-label={t('layout.search.placeholder')}
        />
        {loading ? <span className="global-search__spin" /> : null}
      </div>
      {open && results !== null ? (
        <div className="global-search__dropdown" role="listbox">
          {results.length === 0 ? (
            <p className="global-search__empty">{t('layout.search.empty')}</p>
          ) : (
            results.map((r, i) => (
              <button
                key={`${r.type}-${r.id}-${i}`}
                type="button"
                className="global-search__item"
                role="option"
                aria-selected={false}
                onClick={() => {
                  onNavigate(TYPE_PAGE[r.type] ?? 'project');
                  setOpen(false);
                }}
              >
                <span className="global-search__type">{TYPE_LABEL[r.type] ?? r.type}</span>
                <span className="global-search__title">{r.title}</span>
                <span className="global-search__snippet">{r.snippet}</span>
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
