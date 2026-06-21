import { useRef, useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Archive, CheckCircle2 } from 'lucide-react';
import type { IssueSeverity, ArchiveGeneratedBy } from '@teamhub/hub-contracts';
import type { HubApiClient } from '../../api/client';
import type { KbCloseoutRequest } from '../../api/schemas/kb';
import { useI18n, type TranslationKey } from '../../i18n';
import { parseList, errorDetail } from '../../utils';
import { Field } from '../../components/Field';
import { MetaRow } from '../../components/MetaRow';

const SEVERITIES: IssueSeverity[] = ['low', 'medium', 'high', 'critical'];
const GENERATED_BY: ArchiveGeneratedBy[] = ['manual', 'hybrid', 'ai'];

const SEVERITY_KEY: Record<IssueSeverity, TranslationKey> = {
  low: 'kb.severity.low',
  medium: 'kb.severity.medium',
  high: 'kb.severity.high',
  critical: 'kb.severity.critical',
};
const GENERATED_BY_KEY: Record<ArchiveGeneratedBy, TranslationKey> = {
  ai: 'kb.generatedBy.ai',
  manual: 'kb.generatedBy.manual',
  hybrid: 'kb.generatedBy.hybrid',
};

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
  // 实例级单调序号：useRef 避免跨卸载/重挂持续累加和 StrictMode 双增导致非确定的 iss-web-DATE-N ID。
  const seqRef = useRef(0);
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [projectId, setProjectId] = useState('');
  const [symptom, setSymptom] = useState('');
  const [severity, setSeverity] = useState<IssueSeverity>('medium');
  const [tags, setTags] = useState('');
  const [category, setCategory] = useState('');
  const [rootCause, setRootCause] = useState('');
  const [resolution, setResolution] = useState('');
  const [prevention, setPrevention] = useState('');
  const [generatedBy, setGeneratedBy] = useState<ArchiveGeneratedBy>('manual');

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
    seqRef.current += 1;
    mutation.mutate({
      issue: {
        id: `iss-web-${now.slice(0, 10)}-${seqRef.current}`,
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
            placeholder={t('kb.closeout.field.projectId.placeholder')}
          />
          <span className="kb-field__hint">{t('kb.closeout.field.projectId.hint')}</span>
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
            onChange={(e) => setSeverity(e.target.value as IssueSeverity)}
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
      <div className="pm-form__grid">
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
      </div>
      <div className="pm-form__grid">
        <Field label={t('kb.closeout.field.category')}>
          <input value={category} onChange={(e) => setCategory(e.target.value)} />
        </Field>
        <Field label={t('kb.closeout.field.generatedBy')}>
          <select
            value={generatedBy}
            onChange={(e) => setGeneratedBy(e.target.value as ArchiveGeneratedBy)}
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
          rows={1}
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
              detail: errorDetail(mutation.error),
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
            <MetaRow
              label={t('kb.closeout.success.errorCode')}
              value={mutation.data.errorEntry.errorCode}
              mono
            />
            <MetaRow
              label={t('kb.closeout.success.archive')}
              value={mutation.data.archiveDocument.fileName}
              mono
            />
            <MetaRow
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
