import { useState, type FormEvent } from 'react';
import { Info, Search, Archive, BookOpen } from 'lucide-react';
import type { SimilarIssueMatch } from '@teamhub/hub-contracts';
import type { HubApiClient } from '../../api/client';
import { useKbSimilar } from './hooks';
import { useI18n, type TranslationKey } from '../../i18n';
import { SideDrawer } from '../../components/SideDrawer';
import { Field } from '../../components/Field';
import { MetaRow } from '../../components/MetaRow';
import { KbCloseoutForm } from './KbCloseoutForm';



// 相似检索保持在主页面，记录详情与结案归档在抽屉中完成。
export function KbSearchPage({
  client,
  source,
  projectId,
}: {
  client: HubApiClient;
  source: string;
  projectId: string;
}) {
  const { t } = useI18n();
  const [tab, setTab] = useState<'search' | 'closeout'>('search');
  // 「去归档」带过去的症状文字（仅供 KbCloseoutForm 首挂载取用一次）。
  const [closeoutSymptom, setCloseoutSymptom] = useState<string | undefined>(undefined);
  return (
    <div className="kb-page">
      <div className="domain-actions"><p className="expected-page-hint">{t('expected.kbHint')}</p><button className="btn btn--primary" onClick={() => setTab('closeout')}><Archive size={16} />{t('expected.kbNew')}</button></div>
      <KbSearchPanel client={client} source={source} onGoToCloseout={symptom => { setCloseoutSymptom(symptom); setTab('closeout'); }} />
      <SideDrawer open={tab === 'closeout'} onClose={() => setTab('search')} title={t('expected.kbNew')}>
        <KbCloseoutForm client={client} source={source} projectId={projectId} initialSymptom={closeoutSymptom} />
      </SideDrawer>
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
  const [selected, setSelected] = useState<SimilarIssueMatch | null>(null);
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
      <form className="kb-search-form" onSubmit={handleSubmit}>
        <Field label={t('kb.search.symptomLabel')}>
          <input
            value={symptomInput}
            onChange={(event) => setSymptomInput(event.target.value)}
            placeholder={t('kb.search.symptomPlaceholder')}
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
                  <article className="card card--interactive kb-result-preview" key={item.issueId}><span className="badge"><BookOpen size={14} />{t(KB_STATUS_KEY[item.status])}</span><button className="kb-result-open" onClick={() => setSelected(item)}><h2>{item.title}</h2><p>{item.rootCauseSummary || item.resolutionSummary}</p></button><footer>{item.tags.join(' / ')}</footer></article>
                ))}
              </div>
            </>
          )}
        </section>
      )}
      <SideDrawer open={!!selected} onClose={() => setSelected(null)} title={selected?.title ?? t('expected.kbDetail')}>{selected && <KbResultCard item={selected} />}</SideDrawer>
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
