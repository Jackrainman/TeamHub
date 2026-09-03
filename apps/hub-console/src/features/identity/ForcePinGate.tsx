import { KeyRound } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import type { SessionIdentity } from '@teamhub/hub-contracts';
import type { HubApiClient } from '../../api/client';
import { useI18n } from '../../i18n';
import { useForm } from '../../hooks/useForm';
import { FormBanner } from '../../components/FormBanner';
import { useHubMutation } from '../../hooks/useHubMutation';

interface PinGateFields {
  pin: string;
  confirm: string;
}

/**
 * 首登强制设 PIN 闸（AUTH-GATE）：会话成员无 pinHash（mustSetPin）时整屏只渲染本页。
 * 服务端 auth-gate 同步拦该会话的一切业务请求（403 PIN_SETUP_REQUIRED），本页是体验层。
 * 设完 PIN 失效 session 查询——GET /api/session 重读实时名册回 mustSetPin:false，闸门自开。
 */
export function ForcePinGate({
  client,
  session,
}: {
  client: HubApiClient;
  session: SessionIdentity;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const form = useForm<PinGateFields>({
    fields: {
      pin: { initial: '' },
      confirm: { initial: '' },
    },
    valid: (v) => v.pin.trim().length >= 8 && v.pin === v.confirm,
  });

  const setPinMutation = useHubMutation({
    meta: { silent: true },
    invalidateKeys: [],
    mutationFn: (vars: { pin: string }) =>
      client.setMemberPin(session.memberId, { pin: vars.pin }),
    onSuccess: () => {
      void queryClient.invalidateQueries();
    },
  });

  const mismatch =
    form.values.confirm.length > 0 && form.values.pin !== form.values.confirm;

  return (
    <div className="auth-gate">
      <form
        className="auth-gate__card"
        onSubmit={form.handleSubmit(() => {
          if (setPinMutation.isPending) return;
          setPinMutation.mutate({ pin: form.values.pin.trim() });
        })}
      >
        <h1 className="auth-gate__title">
          <KeyRound aria-hidden="true" size={20} /> {t('identity.pinGate.title')}
        </h1>
        <p className="auth-gate__subtitle">
          {t('identity.pinGate.desc', { name: session.displayName })}
        </p>
        <input
          type="password"
          className="auth-gate__pin"
          value={form.values.pin}
          onChange={(e) => form.set('pin', e.target.value)}
          placeholder={t('identity.pinGate.field')}
          aria-label={t('identity.pinGate.field')}
          autoComplete="new-password"
        />
        <input
          type="password"
          className="auth-gate__pin"
          value={form.values.confirm}
          onChange={(e) => form.set('confirm', e.target.value)}
          placeholder={t('identity.pinGate.confirm')}
          aria-label={t('identity.pinGate.confirm')}
          autoComplete="new-password"
        />
        {mismatch ? (
          <FormBanner kind="err" message={t('identity.pinGate.mismatch')} />
        ) : null}
        <button
          type="submit"
          className="btn btn--primary"
          disabled={!form.valid || setPinMutation.isPending}
        >
          {setPinMutation.isPending
            ? t('identity.pinGate.submitting')
            : t('identity.pinGate.submit')}
        </button>
        {setPinMutation.isError ? (
          <FormBanner kind="err" message={t('identity.pinGate.error')} />
        ) : null}
      </form>
    </div>
  );
}
