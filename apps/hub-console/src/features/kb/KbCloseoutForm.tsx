import { useRef, useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Archive, CheckCircle2 } from 'lucide-react';
import type { IssueSeverity, ArchiveGeneratedBy } from '@teamhub/hub-contracts';
import type { HubApiClient } from '../../api/client';
import type { KbCloseoutRequest } from '../../api/schemas/kb';
import { useI18n, type TranslationKey } from '../../i18n';
import { parseList, humanizeFormError } from '../../utils';
import { Field } from '../../components/Field';
import { FormActions } from '../../components/FormActions';
import { FormGrid } from '../../components/FormGrid';
import { Select } from '../../components/Select';
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
  initialSymptom,
}: {
  client: HubApiClient;
  source: string;
  // 从检索页「去归档」带过来的症状文字（仅首挂载生效，之后表单自管）。
  initialSymptom?: string;
}) {
  const { t } = useI18n();
  // 实例级单调序号：useRef 避免跨卸载/重挂持续累加和 StrictMode 双增导致非确定的 iss-web-DATE-N ID。
  const seqRef = useRef(0);
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [projectId, setProjectId] = useState('');
  const [symptom, setSymptom] = useState(initialSymptom ?? '');
  const [severity, setSeverity] = useState<IssueSeverity>('medium');
  const [tags, setTags] = useState('');
  const [category, setCategory] = useState('');
  const [rootCause, setRootCause] = useState('');
  const [resolution, setResolution] = useState('');
  const [prevention, setPrevention] = useState('');
  const [generatedBy, setGeneratedBy] = useState<ArchiveGeneratedBy>('manual');

  // 字段级必填错误：提交尝试过、或该字段已失焦过，才对空值报错（不打扰还没碰过的字段）。
  const [attempted, setAttempted] = useState(false);
  const [touched, setTouched] = useState<Partial<Record<'title' | 'projectId' | 'symptom' | 'rootCause' | 'resolution', true>>>({});
  const markTouched = (field: keyof typeof touched) =>
    setTouched((prev) => (prev[field] ? prev : { ...prev, [field]: true }));
  const fieldError = (field: keyof typeof touched, value: string) =>
    (attempted || touched[field]) && !value.trim() ? t('common.fieldRequired') : null;

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
    if (!valid) {
      setAttempted(true);
      return;
    }
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
      <FormGrid>
        <Field
          label={t('kb.closeout.field.title')}
          required
          error={fieldError('title', title)}
        >
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => markTouched('title')}
            aria-required
          />
        </Field>
        <Field
          label={t('kb.closeout.field.projectId')}
          required
          error={fieldError('projectId', projectId)}
        >
          <input
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            onBlur={() => markTouched('projectId')}
            placeholder={t('kb.closeout.field.projectId.placeholder')}
            aria-required
          />
          <span className="kb-field__hint">{t('kb.closeout.field.projectId.hint')}</span>
        </Field>
      </FormGrid>
      <Field
        label={t('kb.closeout.field.symptom')}
        required
        error={fieldError('symptom', symptom)}
      >
        <textarea
          rows={2}
          value={symptom}
          onChange={(e) => setSymptom(e.target.value)}
          onBlur={() => markTouched('symptom')}
          aria-required
        />
      </Field>
      <FormGrid>
        <Field label={t('kb.closeout.field.severity')}>
          <Select
            value={severity}
            onChange={setSeverity}
            options={SEVERITIES}
            renderOption={(s) => t(SEVERITY_KEY[s])}
          />
        </Field>
        <Field label={t('kb.closeout.field.tags')}>
          <input value={tags} onChange={(e) => setTags(e.target.value)} />
        </Field>
      </FormGrid>
      <FormGrid>
        <Field
          label={t('kb.closeout.field.rootCause')}
          required
          error={fieldError('rootCause', rootCause)}
        >
          <textarea
            rows={2}
            value={rootCause}
            onChange={(e) => setRootCause(e.target.value)}
            onBlur={() => markTouched('rootCause')}
            aria-required
          />
        </Field>
        <Field
          label={t('kb.closeout.field.resolution')}
          required
          error={fieldError('resolution', resolution)}
        >
          <textarea
            rows={2}
            value={resolution}
            onChange={(e) => setResolution(e.target.value)}
            onBlur={() => markTouched('resolution')}
            aria-required
          />
        </Field>
      </FormGrid>
      <FormGrid>
        <Field label={t('kb.closeout.field.category')}>
          <input value={category} onChange={(e) => setCategory(e.target.value)} />
        </Field>
        <Field label={t('kb.closeout.field.generatedBy')}>
          <Select
            value={generatedBy}
            onChange={setGeneratedBy}
            options={GENERATED_BY}
            renderOption={(g) => t(GENERATED_BY_KEY[g])}
          />
        </Field>
      </FormGrid>
      <Field label={t('kb.closeout.field.prevention')}>
        <textarea
          rows={1}
          value={prevention}
          onChange={(e) => setPrevention(e.target.value)}
        />
      </Field>

      <FormActions
        submitLabel={t('kb.closeout.submit')}
        submittingLabel={t('kb.closeout.submitting')}
        submitting={mutation.isPending}
        disabled={!valid}
        icon={<Archive size={15} aria-hidden="true" />}
        error={
          mutation.error
            ? humanizeFormError(mutation.error, t, 'kb.closeout.error')
            : null
        }
      />

      {/* 成功是富结果块（错误码 / 归档 / 知识点三行 + 可检索提示），保留原专有结构、不降级为单条 banner。 */}
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
