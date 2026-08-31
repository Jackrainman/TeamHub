import { useState } from 'react';
import { Search } from 'lucide-react';
import type { MemberPublic } from '@teamhub/hub-contracts';
import type { HubApiClient } from '../../../api/client';
import { useI18n } from '../../../i18n';
import { memberOptionLabel } from '../../../shared/lib/identity-utils';
import { useTasksSearch } from '../../../features/pm/hooks';
import { STATUS_KEY } from './constants';

export function PoolSearch({
  client,
  source,
  members,
}: {
  client: HubApiClient;
  source: string;
  members: MemberPublic[];
}) {
  const { t } = useI18n();
  const [search, setSearch] = useState('');
  const q = search.trim();
  const searchQuery = useTasksSearch(client, source, q);

  return (
    <section className="pool-search" aria-label={t('pool.search.aria')}>
      <div className="pool-search__box">
        <Search size={16} aria-hidden="true" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('pool.search.placeholder')}
          aria-label={t('pool.search.aria')}
        />
      </div>
      <p className="pool-search__note">{t('pool.search.note')}</p>
      {q.length > 0 ? (
        searchQuery.isLoading ? (
          <p className="gaps-note">{t('pm.loading')}</p>
        ) : searchQuery.data && searchQuery.data.tasks.length > 0 ? (
          <ul className="pool-results">
            {searchQuery.data.tasks.map((task) => (
              <li key={task.id} className="pool-result">
                <div className="pool-result__head">
                  <strong>{task.title}</strong>
                  <span className="badge badge--xs">{t(STATUS_KEY[task.status])}</span>
                </div>
                <p className="pool-result__meta">
                  {t('pool.result.owner', {
                    name: task.ownerId
                      ? memberOptionLabel(members, task.ownerId)
                      : t('pool.result.unowned'),
                  })}
                  {' · '}
                  {new Date(task.updatedAt).toISOString().slice(0, 10)}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="gaps-note">{t('pool.search.empty')}</p>
        )
      ) : null}
    </section>
  );
}
