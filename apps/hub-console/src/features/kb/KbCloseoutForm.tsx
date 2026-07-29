import { useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Archive, CheckCircle2 } from 'lucide-react';
import type { IssueSeverity, ArchiveGeneratedBy } from '@teamhub/hub-contracts';
import type { HubApiClient } from '../../api/client';
import type { KbCloseoutRequest } from '../../api/schemas/kb';
import { useI18n, type TranslationKey } from '../../i18n';
import { parseList } from '../../utils';
import { useForm } from '../../hooks/useForm';
import { formActionsProps } from '../../hooks/useFormActions';
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

interface KbFormFields {
  title: string;
  projectId: string;
  symptom: string;
  severity: IssueSeverity;
  tags: string;
  category: string;
  rootCause: string;
  resolution: string;
  prevention: string;
  generatedBy: ArchiveGeneratedBy;
}

export function KbCloseoutForm({
  client,
  source,
  initialSymptom,
}: {
  client: HubApiClient;
  source: string;
  initialSymptom?: string;
}) {
  const { t } = useI18n();
  const seqRef = useRef(0);
  const queryClient = useQueryClient();

  const required = (v: string) => (v.trim() ? null : t('common.fieldRequired'));

  const form = useForm<KbFormFields>({
    fields: {
      title: { initial: '', validate: required },
      projectId: { initial: '', sticky: true, validate: required },
      symptom: { initial: initialSymptom ?? '', validate: required },
      severity: { initial: 'medium' as IssueSeverity, sticky: true },
      tags: { initial: '', sticky: true },
      category: { initial: '', sticky: true },
      rootCause: { initial: '', validate: required },
      resolution: { initial: '', validate: required },
      prevention: { initial: '' },
      generatedBy: { initial: 'manual' as ArchiveGeneratedBy, sticky: true },
    },
    valid: (v) => Boolean(v.title.trim() && v.projectId.trim() && v.symptom.trim() && v.rootCause.trim() && v.resolution.trim()),
  });

  const mutation = useMutation({
    mutationFn: (req: KbCloseoutRequest) => client.closeoutKb(req),
    onSuccess: () => {
      form.resetAfterSubmit();
      void queryClient.invalidateQueries({ queryKey: ['kb-similar', source] });
    },
  });

  const { title, projectId, symptom, severity, tags, category, rootCause, resolution, prevention, generatedBy } = form.values;

  return (
    <form
      className="panel kb-closeout-form"
      onSubmit={form.handleSubmit(() => {
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
      })}
    >
      <p className="kb-closeout__intro">{t('kb.closeout.intro')}</p>
      <FormGrid>
        <Field
          label={t('kb.closeout.field.title')}
          required
          error={form.errors.title}
        >
          <input
            value={title}
            onChange={(e) => form.set('title', e.target.value)}
            onBlur={() => form.touch('title')}
            aria-required
          />
        </Field>
        <Field
          label={t('kb.closeout.field.projectId')}
          required
          error={form.errors.projectId}
        >
          <input
            value={projectId}
            onChange={(e) => form.set('projectId', e.target.value)}
            onBlur={() => form.touch('projectId')}
            placeholder={t('kb.closeout.field.projectId.placeholder')}
            aria-required
          />
          <span className="kb-field__hint">{t('kb.closeout.field.projectId.hint')}</span>
        </Field>
      </FormGrid>
      <Field
        label={t('kb.closeout.field.symptom')}
        required
        error={form.errors.symptom}
      >
        <textarea
          rows={2}
          value={symptom}
          onChange={(e) => form.set('symptom', e.target.value)}
          onBlur={() => form.touch('symptom')}
          aria-required
        />
      </Field>
      <FormGrid>
        <Field label={t('kb.closeout.field.severity')}>
          <Select
            value={severity}
            onChange={(v) => form.set('severity', v)}
            options={SEVERITIES}
            renderOption={(s) => t(SEVERITY_KEY[s])}
          />
        </Field>
        <Field label={t('kb.closeout.field.tags')}>
          <input value={tags} onChange={(e) => form.set('tags', e.target.value)} />
        </Field>
      </FormGrid>
      <FormGrid>
        <Field
          label={t('kb.closeout.field.rootCause')}
          required
          error={form.errors.rootCause}
        >
          <textarea
            rows={2}
            value={rootCause}
            onChange={(e) => form.set('rootCause', e.target.value)}
            onBlur={() => form.touch('rootCause')}
            aria-required
          />
        </Field>
        <Field
          label={t('kb.closeout.field.resolution')}
          required
          error={form.errors.resolution}
        >
          <textarea
            rows={2}
            value={resolution}
            onChange={(e) => form.set('resolution', e.target.value)}
            onBlur={() => form.touch('resolution')}
            aria-required
          />
        </Field>
      </FormGrid>
      <FormGrid>
        <Field label={t('kb.closeout.field.category')}>
          <input value={category} onChange={(e) => form.set('category', e.target.value)} />
        </Field>
        <Field label={t('kb.closeout.field.generatedBy')}>
          <Select
            value={generatedBy}
            onChange={(v) => form.set('generatedBy', v)}
            options={GENERATED_BY}
            renderOption={(g) => t(GENERATED_BY_KEY[g])}
          />
        </Field>
      </FormGrid>
      <Field label={t('kb.closeout.field.prevention')}>
        <textarea
          rows={1}
          value={prevention}
          onChange={(e) => form.set('prevention', e.target.value)}
        />
      </Field>

      <FormActions
        {...formActionsProps(mutation, {
          submitLabel: t('kb.closeout.submit'),
          submittingLabel: t('kb.closeout.submitting'),
          valid: form.valid,
          t,
          errorFallbackKey: 'kb.closeout.error',
        })}
        icon={<Archive size={16} aria-hidden="true" />}
      />

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
