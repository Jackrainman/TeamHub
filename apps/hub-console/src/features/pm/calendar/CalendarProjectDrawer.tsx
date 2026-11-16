import { useState, type FormEvent } from 'react';
import { SideDrawer } from '../../../components/SideDrawer';
import { FormActions } from '../../../components/FormActions';
import { FormGrid } from '../../../components/FormGrid';
import { useI18n } from '../../../i18n';
import { Field } from '../../../shared/ui/Field';
import { Input } from '../../../shared/ui/Input';
import { isProjectRangeValid } from '../../../shared/lib/project-utils';
import { humanizeFormError } from '../../../utils';
import type { HubApiClient } from '../../../api/client';
import { useProjectMutations } from '../hooks';

export function CalendarProjectDrawer({ client, open, canWrite, onClose }: {
  client: HubApiClient;
  open: boolean;
  canWrite: boolean;
  onClose: () => void;
}): JSX.Element {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const { saveMutation } = useProjectMutations(client, {
    create: { name, startsAt, endsAt },
    update: null,
    onSuccess: () => {
      setName('');
      setStartsAt('');
      setEndsAt('');
      onClose();
    },
  });
  const orderOk = isProjectRangeValid(startsAt, endsAt);
  const valid = canWrite && Boolean(name.trim() && startsAt && orderOk);
  const lockHint = canWrite ? null : t('identity.writeHint');

  function submit(event: FormEvent): void {
    event.preventDefault();
    if (valid) saveMutation.mutate();
  }

  return <SideDrawer open={open} onClose={onClose} title={t('calendar.project.create')}>
    <form className="pm-form" onSubmit={submit} title={lockHint ?? undefined}>
      <FormGrid>
        <div data-field="name" className="span-all">
          <Field label={t('settings.projects.field.name')} required>
            <Input
              value={name}
              onChange={event => setName(event.target.value)}
              disabled={!canWrite}
              aria-required
            />
          </Field>
        </div>
        <div data-field="startsAt">
          <Field
            label={t('settings.projects.field.startsAt')}
            required
            error={!orderOk ? t('settings.projects.dateOrder') : undefined}
          >
            <Input
              type="date"
              value={startsAt}
              onChange={event => setStartsAt(event.target.value)}
              disabled={!canWrite}
              aria-required
            />
          </Field>
        </div>
        <div data-field="endsAt">
          <Field label={t('settings.projects.field.endsAt')} hint={t('settings.projects.endsAtHint')}>
            <Input
              type="date"
              value={endsAt}
              onChange={event => setEndsAt(event.target.value)}
              disabled={!canWrite}
            />
          </Field>
        </div>
      </FormGrid>
      <FormActions
        submitLabel={t('settings.projects.submit')}
        submittingLabel={t('settings.projects.submitting')}
        submitting={saveMutation.isPending}
        disabled={!valid}
        lockedHint={lockHint}
        error={saveMutation.error ? humanizeFormError(saveMutation.error, t, 'settings.projects.error') : null}
      />
    </form>
  </SideDrawer>;
}
