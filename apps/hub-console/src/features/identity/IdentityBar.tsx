import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LogIn, LogOut } from 'lucide-react';
import type { IdentityMode, SessionIdentity } from '@teamhub/hub-contracts';
import type { HubApiClient } from '../../api/client';
import { useI18n } from '../../i18n';
import { Select } from '../../components/Select';
import { FormBanner } from '../../components/FormBanner';
import { memberOptionLabel } from './identity-utils';

/**
 * 顶部工具条身份挂载点（IDENTITY-LITE，I2 console 接线，product-redefine §4.2）。
 *
 * **匿名模式（`mode!=='identity'`）**：渲染一枚中性徽章「匿名模式」——无动作、不刺眼，只是让人一眼
 * 知道「这台现在不用登录、大家都能读写」（K2 身份体验刀，此前直接 `return null` 导致界面零标识）。
 * 匿名模式仍不启用任何登录动作：下方几个 hook 虽照跑，但 `enabled` 全关、零网络请求，副作用为零。
 *
 * 身份模式：未登录 → 一个「登录」按钮，点开变成「选人 + 可选 PIN」内联小表单；已登录 → 显示
 * 当前登录人 displayName + 登出按钮。登录/登出成功后：① 用响应直接写回 `['session']` 缓存（不留
 * 登录成功但界面还没刷新的空档）② `invalidateQueries()` 使全站缓存跟着重新拉取——身份切换后
 * 不会吃到切换前那个人缓存下的数据（product-redefine §9-②）。
 */
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
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [memberId, setMemberId] = useState('');
  const [pin, setPin] = useState('');

  // 成员候选只在「登录表单已展开」时才拉，未开就不发请求（登出态/已登录态都不需要）。
  const membersQuery = useQuery({
    queryKey: ['members', 'identity-bar'],
    queryFn: () => client.getMembers(),
    enabled: mode === 'identity' && open,
  });

  function onIdentityChanged(next: { mode: IdentityMode; session: SessionIdentity | null }) {
    queryClient.setQueryData(['session'], next);
    // 身份切换：全站缓存作废重拉，杜绝「登录后仍显示上一个人视角数据」的残留态。
    void queryClient.invalidateQueries();
  }

  const loginMutation = useMutation({
    mutationFn: () => client.login({ memberId, pin: pin.trim() || undefined }),
    onSuccess: (data) => {
      onIdentityChanged(data);
      setOpen(false);
      setMemberId('');
      setPin('');
    },
  });

  const logoutMutation = useMutation({
    mutationFn: () => client.logout(),
    onSuccess: (data) => onIdentityChanged(data),
  });

  // 匿名模式：登录模块不启用，只挂一枚中性徽章标明当前形态（无动作，title 里给一句大白话说明）。
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
        <LogIn aria-hidden="true" size={15} /> {t('identity.login.open')}
      </button>
    );
  }

  const members = membersQuery.data?.members ?? [];

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!memberId || loginMutation.isPending) return;
    loginMutation.mutate();
  }

  return (
    <form className="identity-bar identity-bar--form" onSubmit={submit}>
      <Select
        value={memberId}
        onChange={setMemberId}
        options={members.map((m) => m.id)}
        renderOption={(id) => memberOptionLabel(members, id)}
        placeholder={t('identity.login.selectMember')}
        ariaLabel={t('identity.login.selectMember')}
      />
      <input
        type="password"
        className="identity-bar__pin"
        value={pin}
        onChange={(e) => setPin(e.target.value)}
        placeholder={t('identity.login.pinPlaceholder')}
        aria-label={t('identity.login.pinPlaceholder')}
        autoComplete="off"
      />
      {/* B3：登录=表单提交 → primary（原双灰无主次，属 U2 顺带修复）；38px 齐高留在 feature 类。 */}
      <button
        type="submit"
        className="btn btn--primary btn--sm identity-bar__submit"
        disabled={!memberId || loginMutation.isPending}
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
          setMemberId('');
          setPin('');
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
