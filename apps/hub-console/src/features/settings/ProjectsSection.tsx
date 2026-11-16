import { useState, type FormEvent } from 'react';
import type { Project } from '@teamhub/hub-contracts';
import type { HubApiClient } from '../../api/client';
import type { PageIdentityCtx } from '../../console-pages';
import { useI18n } from '../../i18n';
import { Field } from '../../shared/ui/Field';
import { Button } from '../../shared/ui/Button';
import { Input } from '../../shared/ui/Input';
import { FormActions } from '../../components/FormActions';
import { FormGrid } from '../../components/FormGrid';
import { humanizeFormError } from '../../utils';
import { useProjects } from '../pm/hooks';
import { sectionPermission } from './section-permission';
import { useProjectMutations } from './hooks';

export function isProjectRangeValid(startsAt: string, endsAt: string): boolean {
  return !startsAt || !endsAt || endsAt >= startsAt;
}

/** 项目列表 + 一个新建/编辑共用表单；日期只存 UTC 零点，空结束日由展示层解释为至今。 */
export function ProjectsSection({
  client,
  identity,
}: {
  client: HubApiClient;
  source: string;
  identity: PageIdentityCtx;
}) {
  const { t } = useI18n();
  const { writeLocked, lockHint } = sectionPermission(identity, t);
  const projectsQuery = useProjects(client);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');

  function resetForm() {
    setEditingId(null);
    setName('');
    setStartsAt('');
    setEndsAt('');
  }

  const { saveMutation } = useProjectMutations(client, {
    create: { name, startsAt, endsAt },
    update: editingId ? { id: editingId, name, startsAt, endsAt } : null,
    onSuccess: resetForm,
  });

  function beginEdit(project: Project) {
    setEditingId(project.id);
    setName(project.name);
    setStartsAt(project.startsAt?.slice(0, 10) ?? '');
    setEndsAt(project.endsAt?.slice(0, 10) ?? '');
  }

  const projects = projectsQuery.data?.projects ?? [];
  return (
    <section className="panel settings-panel">
      <div className="panel-header"><h2>{t('settings.section.projects')}</h2></div>
      <div className="settings-section">
        <p className="settings-desc">{t('settings.projects.desc')}</p>
        {projectsQuery.isLoading ? (
          <p className="settings-desc" role="status" aria-live="polite">…</p>
        ) : projects.length === 0 ? (
          <p className="settings-desc">{t('settings.projects.empty')}</p>
        ) : (
          <div className="adapter-grid">
            {projects.map((project) => (
              <article className="adapter-row" key={project.id}>
                <div>
                  <strong>{project.name}</strong>
                  <span>
                    {project.startsAt?.slice(0, 10) ?? '…'} → {project.endsAt?.slice(0, 10) ?? t('settings.projects.ongoing')}
                  </span>
                </div>
                <div className="settings-member__controls">
                  <span className="badge badge--wide badge--green">{t('settings.projects.status.active')}</span>
                  <button
                    type="button"
                    className="btn btn--secondary btn--sm"
                    disabled={writeLocked}
                    title={lockHint ?? undefined}
                    onClick={() => beginEdit(project)}
                  >
                    {t('settings.projects.edit')}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
        <ProjectForm
          name={name}
          startsAt={startsAt}
          endsAt={endsAt}
          editing={editingId !== null}
          writeLocked={writeLocked}
          lockHint={lockHint}
          submitting={saveMutation.isPending}
          error={saveMutation.error ? humanizeFormError(saveMutation.error, t, 'settings.projects.error') : null}
          success={saveMutation.isSuccess ? t('settings.projects.success', { name: saveMutation.data.project.name }) : null}
          onNameChange={setName}
          onStartsAtChange={setStartsAt}
          onEndsAtChange={setEndsAt}
          onSubmit={() => saveMutation.mutate()}
          onCancel={resetForm}
        />
      </div>
    </section>
  );
}

/** 受控表单单独渲染，便于无 DOM 事件地验证日期错误和提交锁态。 */
export function ProjectForm({
  name,
  startsAt,
  endsAt,
  editing,
  writeLocked,
  lockHint,
  submitting,
  error,
  success,
  onNameChange,
  onStartsAtChange,
  onEndsAtChange,
  onSubmit,
  onCancel,
}: {
  name: string;
  startsAt: string;
  endsAt: string;
  editing: boolean;
  writeLocked: boolean;
  lockHint: string | null;
  submitting: boolean;
  error: string | null;
  success: string | null;
  onNameChange: (value: string) => void;
  onStartsAtChange: (value: string) => void;
  onEndsAtChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const orderOk = isProjectRangeValid(startsAt, endsAt);
  const valid = Boolean(name.trim() && startsAt && orderOk) && !writeLocked;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (valid) onSubmit();
  }

  return (
    <form className="pm-form" onSubmit={submit} title={lockHint ?? undefined}>
      <FormGrid>
        <Field label={t('settings.projects.field.name')} required className="span-all">
          <Input
            value={name}
            onChange={(event) => onNameChange(event.target.value)}
            disabled={writeLocked}
            aria-required
          />
        </Field>
        <Field
          label={t('settings.projects.field.startsAt')}
          required
          error={!orderOk ? t('settings.projects.dateOrder') : undefined}
        >
          <Input
            type="date"
            value={startsAt}
            onChange={(event) => onStartsAtChange(event.target.value)}
            disabled={writeLocked}
            aria-required
          />
        </Field>
        <Field label={t('settings.projects.field.endsAt')} hint={t('settings.projects.endsAtHint')}>
          <Input
            type="date"
            value={endsAt}
            onChange={(event) => onEndsAtChange(event.target.value)}
            disabled={writeLocked}
          />
        </Field>
      </FormGrid>
      <FormActions
        submitLabel={editing ? t('settings.projects.save') : t('settings.projects.submit')}
        submittingLabel={t('settings.projects.submitting')}
        submitting={submitting}
        disabled={!valid}
        error={error}
        success={success}
      />
      {editing ? (
        <Button type="button" variant="secondary" size="sm" onClick={onCancel} disabled={writeLocked}>
          {t('settings.projects.cancel')}
        </Button>
      ) : null}
    </form>
  );
}
