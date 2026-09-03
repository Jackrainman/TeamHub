import { LogIn } from 'lucide-react';
import type { HubApiClient } from '../../api/client';
import { useIdentityBarMembers, useSessionMutations } from './hooks';
import { useI18n } from '../../i18n';
import { useForm } from '../../hooks/useForm';
import { Select } from '../../components/Select';
import { FormBanner } from '../../components/FormBanner';
import { memberOptionLabel } from '../../shared/lib/identity-utils';

interface LoginGateFields {
  memberId: string;
  pin: string;
}

/**
 * 整屏登录闸（AUTH-GATE 公网加固）：身份模式 + 未登录时 ConsoleApp 只渲染本页——
 * 未登录者看不到任何业务页面（服务端另有读闸 401 兜底，本页只是体验层）。
 * 首次登录（无 PIN）留空即可，登进后 ForcePinGate 会接力强制设 PIN。
 */
export function LoginGate({ client }: { client: HubApiClient }) {
  const { t } = useI18n();
  const membersQuery = useIdentityBarMembers(client, true);
  const form = useForm<LoginGateFields>({
    fields: {
      memberId: { initial: '' },
      pin: { initial: '' },
    },
    valid: (v) => Boolean(v.memberId),
  });
  const { loginMutation } = useSessionMutations(client, {
    onLoggedIn: () => form.resetAll(),
  });

  const members = membersQuery.data?.members ?? [];

  return (
    <div className="auth-gate">
      <form
        className="auth-gate__card"
        onSubmit={form.handleSubmit(() => {
          if (loginMutation.isPending) return;
          loginMutation.mutate({
            memberId: form.values.memberId,
            pin: form.values.pin.trim() || undefined,
          });
        })}
      >
        <h1 className="auth-gate__title">
          <LogIn aria-hidden="true" size={20} /> {t('identity.gate.title')}
        </h1>
        <p className="auth-gate__subtitle">{t('identity.gate.subtitle')}</p>
        <Select
          value={form.values.memberId}
          onChange={(v) => form.set('memberId', v)}
          options={members.map((m) => m.id)}
          renderOption={(id) => memberOptionLabel(members, id)}
          placeholder={t('identity.login.selectMember')}
          ariaLabel={t('identity.login.selectMember')}
        />
        <input
          type="password"
          className="auth-gate__pin"
          value={form.values.pin}
          onChange={(e) => form.set('pin', e.target.value)}
          placeholder={t('identity.login.pinPlaceholder')}
          aria-label={t('identity.login.pinPlaceholder')}
          autoComplete="off"
        />
        <button
          type="submit"
          className="btn btn--primary"
          disabled={!form.valid || loginMutation.isPending}
        >
          {loginMutation.isPending
            ? t('identity.login.submitting')
            : t('identity.login.submit')}
        </button>
        {loginMutation.isError ? (
          <FormBanner kind="err" message={t('identity.login.error')} />
        ) : null}
        {membersQuery.isError ? (
          <FormBanner kind="err" message={t('identity.gate.membersError')} />
        ) : null}
      </form>
    </div>
  );
}
