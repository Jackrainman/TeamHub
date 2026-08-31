import { useState, type FormEvent } from 'react';
import { Info, Search, Archive } from 'lucide-react';
import type { SimilarIssueMatch } from '@teamhub/hub-contracts';
import type { HubApiClient } from '../../api/client';
import { useKbSimilar } from './hooks';
import { useI18n, type TranslationKey } from '../../i18n';
import { segClass } from '../../utils';
import { Field } from '../../components/Field';
import { MetaRow } from '../../components/MetaRow';
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
  // 「去归档」带过去的症状文字（仅供 KbCloseoutForm 首挂载取用一次）。
  const [closeoutSymptom, setCloseoutSymptom] = useState<string | undefined>(undefined);
  return (
    <div className="kb-page">
      <div className="seg kb-tabs" role="tablist" aria-label={t('toolbar.title.kb')}>
        <button
          type="button"
          role="tab"
          id="kb-tab-search-btn"
          aria-selected={tab === 'search'}
          aria-controls="kb-tab-search"
          className={segClass(tab === 'search')}
          onClick={() => setTab('search')}
        >
          <Search size={14} aria-hidden="true" /> {t('kb.tab.search')}
        </button>
        <button
          type="button"
          role="tab"
          id="kb-tab-closeout-btn"
          aria-selected={tab === 'closeout'}
          aria-controls="kb-tab-closeout"
          className={segClass(tab === 'closeout')}
          onClick={() => setTab('closeout')}
        >
          <Archive size={14} aria-hidden="true" /> {t('kb.tab.closeout')}
        </button>
      </div>
      {tab === 'search' ? (
        <div
          role="tabpanel"
          id="kb-tab-search"
          aria-labelledby="kb-tab-search-btn"
          tabIndex={0}
        >
          <KbSearchPanel
            client={client}
            source={source}
            onGoToCloseout={(symptom) => {
              setCloseoutSymptom(symptom);
              setTab('closeout');
            }}
          />
        </div>
      ) : (
        <div
          role="tabpanel"
          id="kb-tab-closeout"
          aria-labelledby="kb-tab-closeout-btn"
          tabIndex={0}
        >
          <KbCloseoutForm client={client} source={source} initialSymptom={closeoutSymptom} />
        </div>
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

// 状态语义色类（2026-06-23 视觉打磨批次B：原 .kb-card .status-pill 一律灰，丢状态语义）。
const KB_STATUS_PILL_CLASS: Record<SimilarIssueMatch['status'], string> = {
  open: 'kb-status--open',
  investigating: 'kb-status--investigating',
  resolved: 'kb-status--resolved',
  archived: 'kb-status--archived',
  needsManualReview: 'kb-status--needsManualReview',
};

interface SubmittedQuery {
  symptom: string;
  tags: string[];
}

function KbSearchPanel({
  client,
  source,
  onGoToCloseout,
}: {
  client: HubApiClient;
  source: string;
  // 「去归档」：把当前查询症状文字带过去，KbCloseoutForm 用它预填 symptom（省一次重复输入）。
  onGoToCloseout: (symptom: string) => void;
}) {
  const { t } = useI18n();
  const [symptomInput, setSymptomInput] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [submitted, setSubmitted] = useState<SubmittedQuery | null>(null);

  const query = useKbSimilar(client, source, submitted);

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
      <form className="panel panel--hero kb-search-form" onSubmit={handleSubmit}>
        <Field label={t('kb.search.symptomLabel')}>
          <textarea
            value={symptomInput}
            onChange={(event) => setSymptomInput(event.target.value)}
            placeholder={t('kb.search.symptomPlaceholder')}
            rows={3}
          />
        </Field>
        <Field label={t('kb.search.tagsLabel')}>
          <input
            type="text"
            value={tagsInput}
            onChange={(event) => setTagsInput(event.target.value)}
            placeholder={t('kb.search.tagsPlaceholder')}
          />
        </Field>
        <button
          className="btn btn--primary"
          type="submit"
          disabled={symptomInput.trim().length === 0}
        >
          <Search size={16} aria-hidden="true" /> {t('kb.search.submit')}
        </button>
      </form>

      {submitted == null ? (
        <div className="state-band" role="status" aria-live="polite">{t('kb.empty')}</div>
      ) : query.isLoading ? (
        <div className="state-band" role="status" aria-live="polite">{t('kb.loading')}</div>
      ) : query.error || !query.data ? (
        <div className="state-band state-band-error" role="alert">{t('kb.error')}</div>
      ) : (
        <section className="kb-results">
          {/* A4 护栏：系统只列候选、不断言「同因」，由人按 reasons 自行判断后选用。 */}
          <div className="kb-note">
            <Info size={16} aria-hidden="true" />
            <span>{query.data.note}</span>
          </div>
          {query.data.items.length === 0 ? (
            <div className="state-band">
              <span>{t('kb.noResults')}</span>
              <button
                type="button"
                className="btn btn--primary kb-noresults__action"
                onClick={() => onGoToCloseout(submitted?.symptom ?? '')}
              >
                <Archive size={14} aria-hidden="true" /> {t('kb.noResults.goArchive')}
              </button>
            </div>
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
          <span className={`badge badge--strong ${KB_STATUS_PILL_CLASS[item.status]}`}>
            {t(KB_STATUS_KEY[item.status])}
          </span>
          <span className="kb-score">{t('kb.result.score', { n: item.score })}</span>
        </div>
      </div>
      {item.tags.length > 0 ? (
        <ul className="kb-chips" aria-label={t('kb.result.tags')} role="list">
          {item.tags.map((tag, index) => (
            <li className="kb-chip" key={`${tag}-${index}`}>
              {tag}
            </li>
          ))}
        </ul>
      ) : null}
      {item.reasons.length > 0 ? (
        <div className="kb-reasons">
          <span className="kb-reasons__label">{t('kb.result.reasons')}</span>
          <ul>
            {item.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <dl className="kb-meta">
        {item.errorCode ? (
          <MetaRow label={t('kb.result.errorCode')} value={item.errorCode} mono />
        ) : null}
        {item.rootCauseSummary ? (
          <MetaRow label={t('kb.result.rootCause')} value={item.rootCauseSummary} />
        ) : null}
        {item.resolutionSummary ? (
          <MetaRow label={t('kb.result.resolution')} value={item.resolutionSummary} />
        ) : null}
        {item.archiveFileName ? (
          <MetaRow label={t('kb.result.archive')} value={item.archiveFileName} mono />
        ) : null}
      </dl>
    </article>
  );
}
