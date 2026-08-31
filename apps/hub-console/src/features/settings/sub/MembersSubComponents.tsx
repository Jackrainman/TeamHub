import { useMemo, useRef, useState, type FormEvent } from 'react';
import {
  deriveLeafGroups,
  type Group,
  type MemberPublic,
  type RosterPreviewResponse,
} from '@teamhub/hub-contracts';
import type { HubApiClient } from '../../../api/client';
import { useI18n } from '../../../i18n';
import { Field } from '../../../components/Field';
import { FormActions } from '../../../components/FormActions';
import { RosterReportView } from '../../../shared/roster';
import { GroupLeadConfirm } from '../GroupLeadConfirm';
import { RosterPreviewTable } from '../RosterPreviewTable';
import { humanizeFormError } from '../../../utils';
import {
  useSetupAdminMutation,
  useRosterPreviewMutation,
  useRosterImportMutation,
} from '../hooks';

export function MemberPinReveal({ client, memberId }: { client: HubApiClient; memberId: string }) {
  const { t } = useI18n();
  const [pin, setPin] = useState<string | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'unset' | 'error'>('idle');

  async function reveal() {
    setState('loading');
    try {
      const data = await client.getMemberPin(memberId);
      setPin(data.pin);
      setState('idle');
    } catch (err) {
      setState(err instanceof Error && err.message.startsWith('404') ? 'unset' : 'error');
    }
  }

  if (state === 'unset') {
    return <span className="settings-member__pin">{t('settings.members.showPin.unset')}</span>;
  }
  if (pin !== null) {
    return (
      <span className="settings-member__pin">
        <code>{t('settings.members.showPin.revealed', { pin })}</code>
        <button
          type="button"
          className="btn btn--secondary btn--sm"
          onClick={() => setPin(null)}
        >
          {t('settings.members.showPin.hide')}
        </button>
      </span>
    );
  }
  return (
    <span className="settings-member__pin">
      <button
        type="button"
        className="btn btn--secondary btn--sm"
        disabled={state === 'loading'}
        onClick={() => void reveal()}
      >
        {t('settings.members.showPin')}
      </button>
      {state === 'error' ? (
        <span className="form-hint form-hint--warn">{t('settings.members.showPin.error')}</span>
      ) : null}
    </span>
  );
}

export function SetupAdminCard({
  client,
  writeLocked,
  onDone,
}: {
  client: HubApiClient;
  writeLocked: boolean;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const [pin, setPin] = useState('');
  const mutation = useSetupAdminMutation(client, pin, () => {
    setPin('');
    onDone();
  });
  const valid = pin.trim().length >= 4 && !writeLocked;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!valid) return;
    mutation.mutate();
  }

  return (
    <form className="setup-admin-card" onSubmit={submit}>
      <div>
        <strong>{t('settings.members.setup.title')}</strong>
        <p className="settings-desc">{t('settings.members.setup.desc')}</p>
      </div>
      <Field label={t('settings.members.setup.pinLabel')} required>
        <input
          type="password"
          value={pin}
          placeholder={t('settings.members.setup.pinPlaceholder')}
          onChange={(e) => setPin(e.target.value)}
          autoComplete="new-password"
          aria-required
        />
      </Field>
      <FormActions
        submitLabel={t('settings.members.setup.submit')}
        submittingLabel={t('settings.members.setup.submitting')}
        submitting={mutation.isPending}
        disabled={!valid}
        error={
          mutation.error
            ? humanizeFormError(mutation.error, t, 'settings.members.setup.error')
            : null
        }
        success={mutation.isSuccess ? t('settings.members.setup.success') : null}
      />
    </form>
  );
}

export function RosterImportBlock({
  client,
  emptyRoster,
  sectionWriteLocked,
  lockHint,
  members,
  groups,
  onImported,
}: {
  client: HubApiClient;
  emptyRoster: boolean;
  sectionWriteLocked: boolean;
  lockHint: string | null;
  members: readonly MemberPublic[];
  groups: readonly Group[];
  onImported: () => void;
}) {
  const { t } = useI18n();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [leadsDone, setLeadsDone] = useState(false);
  const [preview, setPreview] = useState<RosterPreviewResponse | null>(null);
  const previewMutation = useRosterPreviewMutation(client, (data) => setPreview(data));
  const importMutation = useRosterImportMutation(client, () => {
    setPreview(null);
    setLeadsDone(false);
    onImported();
  });
  const uploadLocked = emptyRoster ? false : sectionWriteLocked;
  const leafGroupNames = useMemo(() => {
    const leaf = new Set(deriveLeafGroups([...groups]));
    return groups.filter((g) => leaf.has(g.id)).map((g) => g.name);
  }, [groups]);
  const report = importMutation.data;
  const error = previewMutation.error ?? importMutation.error;

  return (
    <div className="roster-import">
      <div className="roster-import__head">
        <strong>{t('settings.roster.title')}</strong>
        <p className="settings-desc">{t('settings.roster.desc')}</p>
      </div>
      <div className="roster-import__actions">
        <a className="btn btn--secondary btn--sm" href={client.rosterTemplateUrl()} download>
          {t('settings.roster.downloadTemplate')}
        </a>
        <button
          type="button"
          className="btn btn--primary btn--sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadLocked || previewMutation.isPending || importMutation.isPending}
          title={uploadLocked ? (lockHint ?? undefined) : undefined}
        >
          {previewMutation.isPending ? t('settings.roster.importing') : t('settings.roster.upload')}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) previewMutation.mutate(file);
            e.target.value = '';
          }}
        />
      </div>
      {emptyRoster ? (
        <p className="settings-desc">{t('settings.roster.firstHint')}</p>
      ) : null}
      {error ? (
        <p className="form-hint form-hint--warn">
          {humanizeFormError(error, t, 'settings.roster.error')}
        </p>
      ) : null}
      {preview ? (
        <RosterPreviewTable
          preview={preview}
          groupNames={leafGroupNames}
          pending={importMutation.isPending}
          onConfirm={(rows) => importMutation.mutate(rows)}
          onCancel={() => setPreview(null)}
        />
      ) : null}
      {report ? <RosterReportView report={report} /> : null}
      {report && !leadsDone ? (
        <GroupLeadConfirm
          client={client}
          members={members}
          groups={groups}
          onConfirmed={() => {
            setLeadsDone(true);
            onImported();
          }}
        />
      ) : null}
    </div>
  );
}
