import { useMemo } from 'react';
import { useMutation } from '@tanstack/react-query';
import type { HubApiClient } from '../../../api/client';
import {
  deriveDisplayCode,
  type CreateResourceRequest,
  type ResourceKind,
  type RobotTarget,
} from '../../../api/schemas/resources';
import { useI18n } from '../../../i18n';
import { useForm } from '../../../hooks/useForm';
import { formActionsProps } from '../../../hooks/useFormActions';
import { SeasonSelect, guessSeason } from '../../../components/SeasonSelect';
import { Field } from '../../../components/Field';
import { FormActions } from '../../../components/FormActions';
import { FormGrid } from '../../../components/FormGrid';
import { Select } from '../../../components/Select';
import { ROBOT_TARGETS, KINDS, KIND_KEY } from './constants';

interface ResourceFormFields {
  season: string;
  robotTarget: RobotTarget;
  name: string;
  kind: ResourceKind;
  version: string;
}

export function CreateResourceForm({
  client,
  onCreated,
}: {
  client: HubApiClient;
  onCreated: () => void;
}) {
  const { t } = useI18n();
  const now = useMemo(() => new Date(), []);

  const form = useForm<ResourceFormFields>({
    fields: {
      season: { initial: guessSeason(now), sticky: true },
      robotTarget: { initial: 'R1' as RobotTarget, sticky: true },
      name: { initial: '' },
      kind: { initial: 'robot' as ResourceKind, sticky: true },
      version: { initial: '1', sticky: true },
    },
    valid: (v) => {
      const versionNum = Number.parseInt(v.version, 10);
      return Boolean(v.season.trim() && v.name.trim() && Number.isInteger(versionNum) && versionNum >= 1);
    },
  });

  const mutation = useMutation({
    mutationFn: (req: CreateResourceRequest) => client.createResource(req),
    onSuccess: () => {
      form.resetAfterSubmit();
      onCreated();
    },
  });

  const { season, robotTarget, name, kind, version } = form.values;
  const versionNum = Number.parseInt(version, 10);
  const preview = form.valid
    ? deriveDisplayCode(season.trim(), robotTarget, versionNum)
    : '—';

  return (
    <section className="panel" aria-label={t('resources.create.title')}>
      <header className="pm-create__head">
        <div>
          <h2>{t('resources.create.title')}</h2>
          <p className="pm-create__note">{t('resources.create.subtitle')}</p>
        </div>
      </header>
      <form
        className="pm-form"
        onSubmit={form.handleSubmit(() => {
          mutation.mutate({
            projectId: 'prj-robots',
            name: name.trim(),
            kind,
            robotTarget,
            season: season.trim(),
            version: versionNum,
          });
        })}
      >
        <FormGrid cols={3}>
          <Field label={t('resources.field.season')} required>
            <SeasonSelect
              now={now}
              value={season}
              onChange={(v) => form.set('season', v)}
              ariaLabelKey="resources.field.season"
            />
          </Field>
          <Field
            label={t('resources.field.robotTarget')}
            className="kb-field--narrow"
            hint={t('resources.field.robotTargetHint')}
          >
            <Select
              value={robotTarget}
              onChange={(v) => form.set('robotTarget', v)}
              options={ROBOT_TARGETS}
              renderOption={(rt) => (rt === 'shared' ? t('resources.robot.shared') : rt)}
            />
          </Field>
          <Field label={t('resources.field.version')} required>
            <span className="resources-version-row">
              <input
                type="number"
                min={1}
                value={version}
                onChange={(e) => form.set('version', e.target.value)}
              />
              <span
                className="resources-code-badge resources-preview-inline"
                title={t('resources.field.previewHint')}
              >
                {preview}
              </span>
            </span>
          </Field>
        </FormGrid>
        <FormGrid>
          <Field label={t('resources.field.name')} required>
            <input
              value={name}
              placeholder={t('resources.field.namePlaceholder')}
              onChange={(e) => form.set('name', e.target.value)}
            />
          </Field>
          <Field label={t('resources.field.kind')}>
            <Select
              value={kind}
              onChange={(v) => form.set('kind', v)}
              options={KINDS}
              renderOption={(k) => t(KIND_KEY[k])}
            />
          </Field>
        </FormGrid>
        <FormActions
          {...formActionsProps(mutation, {
            submitLabel: t('resources.create.submit'),
            submittingLabel: t('resources.create.submitting'),
            valid: form.valid,
            t,
            errorFallbackKey: 'resources.create.error',
            successMessage: mutation.isSuccess
              ? t('resources.create.success', {
                  code: mutation.data.resource.displayCode ?? mutation.data.resource.name,
                })
              : null,
          })}
        />
      </form>
    </section>
  );
}
