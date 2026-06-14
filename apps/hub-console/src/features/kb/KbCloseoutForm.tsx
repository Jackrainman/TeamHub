import { useState, type FormEvent, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Archive, CheckCircle2 } from 'lucide-react';
import type { HubApiClient } from '../../api/client';
import type { KbCloseoutRequest } from '../../api/schemas/kb';
import { useI18n, type TranslationKey } from '../../i18n';

type Severity = 'low' | 'medium' | 'high' | 'critical';
type GeneratedBy = 'ai' | 'manual' | 'hybrid';

const SEVERITIES: Severity[] = ['low', 'medium', 'high', 'critical'];
const GENERATED_BY: GeneratedBy[] = ['manual', 'hybrid', 'ai'];

const SEVERITY_KEY: Record<Severity, TranslationKey> = {
  low: 'kb.severity.low',
  medium: 'kb.severity.medium',
  high: 'kb.severity.high',
  critical: 'kb.severity.critical',
};
const GENERATED_BY_KEY: Record<GeneratedBy, TranslationKey> = {
  ai: 'kb.generatedBy.ai',
  manual: 'kb.generatedBy.manual',
  hybrid: 'kb.generatedBy.hybrid',
};

let seq = 0;

/**
 * 结案归档 web 录入口（补 kb-debug skill 之外的人工通道）。把一次排障沉淀进知识库：
 * 归档 + 错误码 + 派生知识点，下次同类症状可被 GET /api/kb/similar 召回。
 * I0：generatedBy 是来源凭证（ai/manual/hybrid），**不记结案人**；派生知识点无人维度（C2）。
 */
export function KbCloseoutForm({
  client,
  source,
}: {
  client: HubApiClient;
  source: string;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [projectId, setProjectId] = useState('');
  const [symptom, setSymptom] = useState('');
  const [severity, setSeverity] = useState<Severity>('medium');
  const [tags, setTags] = useState('');
  const [category, setCategory] = useState('');
  const [rootCause, setRootCause] = useState('');
  const [resolution, setResolution] = useState('');
  const [prevention, setPrevention] = useState('');
  const [generatedBy, setGeneratedBy] = useState<GeneratedBy>('manual');

  const mutation = useMutation({
    mutationFn: (req: KbCloseoutRequest) => client.closeoutKb(req),
    onSuccess: () => {
      // 保留 root cause/resolution 视图给成功条；只清掉一次性的标题/症状，便于连续录入。
      setTitle('');
      setSymptom('');
      setRootCause('');
      setResolution('');
      setPrevention('');
      // 结案已写回检索语料（D-047 闭环）→ 失效相似检索缓存，否则上一次检索结果会停在旧语料上。
      void queryClient.invalidateQueries({ queryKey: ['kb-similar', source] });
    },
  });

  const valid =
    title.trim() &&
    projectId.trim() &&
    symptom.trim() &&
    rootCause.trim() &&
    resolution.trim();

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!valid) return;
    const now = new Date().toISOString();
    const trimmedSymptom = symptom.trim();
    seq += 1;
    mutation.mutate({
      issue: {
        id: `iss-web-${now.slice(0, 10)}-${seq}`,
        projectId: projectId.trim(),
        title: title.trim(),
        rawInput: trimmedSymptom,
        normalizedSummary: trimmedSymptom,
        symptomSummary: trimmedSymptom,
        suspectedDirections: [],
        suggestedActions: [],
        status: 'resolved',
        severity,
        tags: parseList(tags),
        relatedFiles: [],
        relatedCommits: [],
        relatedHistoricalIssueIds: [],
        createdAt: now,
        updatedAt: now,
      },
      records: [],
      category: category.trim(),
      rootCause: rootCause.trim(),
      resolution: resolution.trim(),
      prevention: prevention.trim(),
      generatedBy,
    });
  }

  return (
    <form className="panel kb-closeout-form" onSubmit={submit}>
      <p className="kb-closeout__intro">{t('kb.closeout.intro')}</p>
      <div className="pm-form__grid">
        <Field label={t('kb.closeout.field.title')}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label={t('kb.closeout.field.projectId')}>
          <input
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
          />
        </Field>
      </div>
      <Field label={t('kb.closeout.field.symptom')}>
        <textarea
          rows={2}
          value={symptom}
          onChange={(e) => setSymptom(e.target.value)}
        />
      </Field>
      <div className="pm-form__grid">
        <Field label={t('kb.closeout.field.severity')}>
          <select
            value={severity}
            onChange={(e) => setSeverity(e.target.value as Severity)}
          >
            {SEVERITIES.map((s) => (
              <option value={s} key={s}>
                {t(SEVERITY_KEY[s])}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('kb.closeout.field.tags')}>
          <input value={tags} onChange={(e) => setTags(e.target.value)} />
        </Field>
      </div>
      <Field label={t('kb.closeout.field.rootCause')}>
        <textarea
          rows={2}
          value={rootCause}
          onChange={(e) => setRootCause(e.target.value)}
        />
      </Field>
      <Field label={t('kb.closeout.field.resolution')}>
        <textarea
          rows={2}
          value={resolution}
          onChange={(e) => setResolution(e.target.value)}
        />
      </Field>
      <div className="pm-form__grid">
        <Field label={t('kb.closeout.field.category')}>
          <input value={category} onChange={(e) => setCategory(e.target.value)} />
        </Field>
        <Field label={t('kb.closeout.field.generatedBy')}>
          <select
            value={generatedBy}
            onChange={(e) => setGeneratedBy(e.target.value as GeneratedBy)}
          >
            {GENERATED_BY.map((g) => (
              <option value={g} key={g}>
                {t(GENERATED_BY_KEY[g])}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label={t('kb.closeout.field.prevention')}>
        <textarea
          rows={2}
          value={prevention}
          onChange={(e) => setPrevention(e.target.value)}
        />
      </Field>

      <div className="pm-form__footer">
        <button
          className="kb-submit"
          type="submit"
          disabled={!valid || mutation.isPending}
        >
          <Archive size={15} aria-hidden="true" />
          {mutation.isPending
            ? t('kb.closeout.submitting')
            : t('kb.closeout.submit')}
        </button>
        {mutation.error ? (
          <p className="form-banner form-banner--err">
            {t('kb.closeout.error', {
              detail:
                mutation.error instanceof Error
                  ? mutation.error.message
                  : String(mutation.error),
            })}
          </p>
        ) : null}
      </div>

      {mutation.isSuccess ? (
        <div className="kb-closeout__result">
          <p className="kb-closeout__result-head">
            <CheckCircle2 size={16} aria-hidden="true" />
            {t('kb.closeout.success.title')}
          </p>
          <dl className="kb-meta">
            <Meta
              label={t('kb.closeout.success.errorCode')}
              value={mutation.data.errorEntry.errorCode}
              mono
            />
            <Meta
              label={t('kb.closeout.success.archive')}
              value={mutation.data.archiveDocument.fileName}
              mono
            />
            <Meta
              label={t('kb.closeout.success.knowledge')}
              value={mutation.data.knowledgeNode.name}
            />
          </dl>
          <p className="kb-closeout__searchable">
            {t('kb.closeout.success.searchable')}
          </p>
        </div>
      ) : null}
    </form>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="kb-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function Meta({
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

function parseList(csv: string): string[] {
  return csv
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
