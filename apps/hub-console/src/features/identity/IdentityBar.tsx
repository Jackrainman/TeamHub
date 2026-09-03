import { useState } from 'react';
import { LogIn, LogOut } from 'lucide-react';
import type { IdentityMode, SessionIdentity } from '@teamhub/hub-contracts';
import type { HubApiClient } from '../../api/client';
import { useSessionMutations } from './hooks';
import { useI18n } from '../../i18n';
import { useForm } from '../../hooks/useForm';
import { FormBanner } from '../../components/FormBanner';

interface LoginFormFields {
  username: string;
  pin: string;
}

export function IdentityBar({
  client,
  mode,
  session,
}: {
  client: HubApiClient;
  mode: IdentityMode;
  session: SessionIdentity | null;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  const form = useForm<LoginFormFields>({
    fields: {
      username: { initial: '' },
      pin: { initial: '' },
    },
    valid: (v) => v.username.trim().length > 0,
  });

  const { loginMutation, logoutMutation } = useSessionMutations(client, {
    onLoggedIn: () => {
      setOpen(false);
      form.resetAll();
    },
  });

  if (mode !== 'identity') {
    return (
      <span
        className="badge badge--neutral identity-bar__mode"
        title={t('identity.anon.hint')}
      >
        {t('identity.anon.badge')}
      </span>
    );
  }

  if (session) {
    return (
      <div className="identity-bar" aria-label={t('identity.bar.aria')}>
        <span className="identity-bar__name">{session.displayName}</span>
        <button
          type="button"
          className="icon-button"
          onClick={() => logoutMutation.mutate()}
          disabled={logoutMutation.isPending}
          aria-label={t('identity.logout')}
          title={t('identity.logout')}
        >
          <LogOut aria-hidden="true" size={16} />
        </button>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        className="identity-bar__login-trigger"
        onClick={() => setOpen(true)}
      >
        <LogIn aria-hidden="true" size={16} /> {t('identity.login.open')}
      </button>
    );
  }

  return (
    <form
      className="identity-bar identity-bar--form"
      onSubmit={form.handleSubmit(() => {
        if (loginMutation.isPending) return;
        loginMutation.mutate({
          username: form.values.username.trim(),
          pin: form.values.pin.trim() || undefined,
        });
      })}
    >
      <input
        className="identity-bar__username"
        value={form.values.username}
        onChange={(e) => form.set('username', e.target.value)}
        placeholder={t('identity.login.usernamePlaceholder')}
        aria-label={t('identity.login.usernamePlaceholder')}
        autoComplete="username"
      />
      <input
        type="password"
        className="identity-bar__pin"
        value={form.values.pin}
        onChange={(e) => form.set('pin', e.target.value)}
        placeholder={t('identity.login.pinPlaceholder')}
        aria-label={t('identity.login.pinPlaceholder')}
        autoComplete="off"
      />
      <button
        type="submit"
        className="btn btn--primary btn--sm identity-bar__submit"
        disabled={!form.valid || loginMutation.isPending}
      >
        {loginMutation.isPending
          ? t('identity.login.submitting')
          : t('identity.login.submit')}
      </button>
      <button
        type="button"
        className="btn btn--secondary btn--sm identity-bar__cancel"
        onClick={() => {
          setOpen(false);
          form.resetAll();
        }}
      >
        {t('identity.login.cancel')}
      </button>
      {loginMutation.isError ? (
        <FormBanner kind="err" message={t('identity.login.error')} className="identity-bar__error" />
      ) : null}
    </form>
  );
}
