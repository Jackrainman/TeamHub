import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Info, Search, Archive } from 'lucide-react';
import type { SimilarIssueMatch } from '@teamhub/hub-contracts';
import type { HubApiClient } from '../../api/client';
import { useI18n, type TranslationKey } from '../../i18n';
import { KbCloseoutForm } from './KbCloseoutForm';

type KbTab = 'search' | 'closeout';

// KB 页：两个标签——相似检索（读）/ 结案归档（写）。两者同属一支柱「战队知识库」。
export function KbSearchPage({
  client,
  source,
}: {
  client: HubApiClient;
  source: string;
}) {
  const { t } = useI18n();
  const [tab, setTab] = useState<KbTab>('search');
  return (
    <div className="kb-page">
      <div className="seg kb-tabs" role="tablist" aria-label={t('toolbar.title.kb')}>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'search'}
          className={tab === 'search' ? 'seg__btn seg__btn--active' : 'seg__btn'}
          onClick={() => setTab('search')}
        >
          <Search size={14} aria-hidden="true" /> {t('kb.tab.search')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'closeout'}
          className={tab === 'closeout' ? 'seg__btn seg__btn--active' : 'seg__btn'}
          onClick={() => setTab('closeout')}
        >
          <Archive size={14} aria-hidden="true" /> {t('kb.tab.closeout')}
        </button>
      </div>
      {tab === 'search' ? (
        <KbSearchPanel client={client} source={source} />
      ) : (
        <KbCloseoutForm client={client} source={source} />
      )}
    </div>
  );
}

// IssueStatus → 文案键（候选记录的状态徽标）。
const KB_STATUS_KEY: Record<SimilarIssueMatch['status'], TranslationKey> = {
  open: 'kb.status.open',
  investigating: 'kb.status.investigating',
  resolved: 'kb.status.resolved',
  archived: 'kb.status.archived',
  needsManualReview: 'kb.status.needsManualReview',
};

interface SubmittedQuery {
  symptom: string;
  tags: string[];
}

function KbSearchPanel({
  client,
  source,
}: {
  client: HubApiClient;
  source: string;
}) {
  const { t } = useI18n();
  const [symptomInput, setSymptomInput] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [submitted, setSubmitted] = useState<SubmittedQuery | null>(null);

  const query = useQuery({
    queryKey: [
      'kb-similar',
      source,
      submitted?.symptom ?? '',
      (submitted?.tags ?? []).join(','),
    ],
    queryFn: () =>
      client.getKbSimilar({
        symptom: submitted?.symptom ?? '',
        tags: submitted?.tags ?? [],
      }),
    enabled: submitted != null && submitted.symptom.length > 0,
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const symptom = symptomInput.trim();
    if (!symptom) return;
    const tags = tagsInput
      .split(',')
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);
    setSubmitted({ symptom, tags });
  }

  return (
    <div className="kb-search-panel">
      <form className="panel kb-search-form" onSubmit={handleSubmit}>
        <label className="kb-field">
          <span>{t('kb.search.symptomLabel')}</span>
          <textarea
            value={symptomInput}
            onChange={(event) => setSymptomInput(event.target.value)}
            placeholder={t('kb.search.symptomPlaceholder')}
            rows={3}
          />
        </label>
        <label className="kb-field">
          <span>{t('kb.search.tagsLabel')}</span>
          <input
            type="text"
            value={tagsInput}
            onChange={(event) => setTagsInput(event.target.value)}
            placeholder={t('kb.search.tagsPlaceholder')}
          />
        </label>
        <button
          className="kb-submit"
          type="submit"
          disabled={symptomInput.trim().length === 0}
        >
          <Search size={16} aria-hidden="true" /> {t('kb.search.submit')}
        </button>
      </form>

      {submitted == null ? (
        <div className="state-band">{t('kb.empty')}</div>
      ) : query.isLoading ? (
        <div className="state-band">{t('kb.loading')}</div>
      ) : query.error || !query.data ? (
        <div className="state-band state-band-error">{t('kb.error')}</div>
      ) : (
        <section className="kb-results">
          {/* A4 护栏：系统只列候选、不断言「同因」，由人按 reasons 自行判断后选用。 */}
          <div className="kb-note">
            <Info size={15} aria-hidden="true" />
            <span>{query.data.note}</span>
          </div>
          {query.data.items.length === 0 ? (
            <div className="state-band">{t('kb.noResults')}</div>
          ) : (
            <>
              <p className="kb-result-count">
                {t('kb.result.count', { n: query.data.items.length })}
              </p>
              <div className="kb-card-list">
                {query.data.items.map((item) => (
                  <KbResultCard item={item} key={item.issueId} />
                ))}
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}

function KbResultCard({ item }: { item: SimilarIssueMatch }) {
  const { t } = useI18n();
  return (
    <article className="kb-card">
      <div className="kb-card__head">
        <h3>{item.title}</h3>
        <div className="kb-card__badges">
          <span className="status-pill">{t(KB_STATUS_KEY[item.status])}</span>
          <span className="kb-score">{t('kb.result.score', { n: item.score })}</span>
        </div>
      </div>
      {item.tags.length > 0 ? (
        <div className="kb-chips" aria-label={t('kb.result.tags')}>
          {item.tags.map((tag, index) => (
            <span className="kb-chip" key={`${tag}-${index}`}>
              {tag}
            </span>
          ))}
        </div>
      ) : null}
      {item.reasons.length > 0 ? (
        <div className="kb-reasons">
          <span className="kb-reasons__label">{t('kb.result.reasons')}</span>
          <ul>
            {item.reasons.map((reason, index) => (
              <li key={`${reason}-${index}`}>{reason}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <dl className="kb-meta">
        {item.errorCode ? (
          <KbMeta label={t('kb.result.errorCode')} value={item.errorCode} mono />
        ) : null}
        {item.rootCauseSummary ? (
          <KbMeta label={t('kb.result.rootCause')} value={item.rootCauseSummary} />
        ) : null}
        {item.resolutionSummary ? (
          <KbMeta label={t('kb.result.resolution')} value={item.resolutionSummary} />
        ) : null}
        {item.archiveFileName ? (
          <KbMeta label={t('kb.result.archive')} value={item.archiveFileName} mono />
        ) : null}
      </dl>
    </article>
  );
}

function KbMeta({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="kb-meta__row">
      <dt>{label}</dt>
      <dd className={mono ? 'kb-mono' : undefined}>{value}</dd>
    </div>
  );
}
