import { LogIn } from 'lucide-react';
import type { HubApiClient } from '../../api/client';
import { useSessionMutations } from './hooks';
import { useI18n } from '../../i18n';
import { useForm } from '../../hooks/useForm';
import { FormBanner } from '../../components/FormBanner';

interface LoginGateFields {
  username: string;
  pin: string;
}

/**
 * 整屏登录闸（AUTH-GATE 公网加固 + AUTH-LOGIN-USERNAME 自输用户名）：身份模式 + 未登录时
 * ConsoleApp 只渲染本页——未登录者看不到任何业务页面（服务端另有读闸 401 兜底，本页只是体验层）。
 * 用户名 = 名册姓名（displayName，全名册唯一），**自己输入**（旧版下拉选人随 /api/members
 * 移出预登录白名单一并退役——公网不再能枚举名册）。首次登录（无 PIN）留空即可，
 * 登进后 ForcePinGate 会接力强制设 PIN。
 */
export function LoginGate({ client }: { client: HubApiClient }) {
  const { t } = useI18n();
  const form = useForm<LoginGateFields>({
    fields: {
      username: { initial: '' },
      pin: { initial: '' },
    },
    valid: (v) => v.username.trim().length > 0,
  });
  const { loginMutation } = useSessionMutations(client, {
    onLoggedIn: () => form.resetAll(),
  });

  return (
    <div className="auth-gate">
      <form
        className="auth-gate__card"
        onSubmit={form.handleSubmit(() => {
          if (loginMutation.isPending) return;
          loginMutation.mutate({
            username: form.values.username.trim(),
            pin: form.values.pin.trim() || undefined,
          });
        })}
      >
        <h1 className="auth-gate__title">
          <LogIn aria-hidden="true" size={20} /> {t('identity.gate.title')}
        </h1>
        <p className="auth-gate__subtitle">{t('identity.gate.subtitle')}</p>
        <input
          className="auth-gate__username"
          value={form.values.username}
          onChange={(e) => form.set('username', e.target.value)}
          placeholder={t('identity.login.usernamePlaceholder')}
          aria-label={t('identity.login.usernamePlaceholder')}
          autoComplete="username"
          autoFocus
        />
        <input
          type="password"
          className="auth-gate__pin"
          value={form.values.pin}
          onChange={(e) => form.set('pin', e.target.value)}
          placeholder={t('identity.login.pinPlaceholder')}
          aria-label={t('identity.login.pinPlaceholder')}
          autoComplete="current-password"
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
      </form>
    </div>
  );
}
