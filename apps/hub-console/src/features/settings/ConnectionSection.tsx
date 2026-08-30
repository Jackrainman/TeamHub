import { useState, type FormEvent } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useI18n } from '../../i18n';
import { APIBASE_KEY, WRITE_TOKEN_KEY } from '../../constants';

// 连接：后端地址 + 写入令牌合并为单一 panel，减少滚动。
// 后端地址覆盖 VITE_API_BASE；写入令牌在 server 绑公网时保证写端点授权。
// 改动后 reload 让 client 按新配置重建。
export function ConnectionSection() {
  const { t } = useI18n();

  // --- 后端地址状态 ---
  const storedBase = window.localStorage.getItem(APIBASE_KEY) ?? '';
  const [baseValue, setBaseValue] = useState(storedBase);
  const effectiveBase = storedBase.trim() || (import.meta.env.VITE_API_BASE ?? '/');

  // FORM-UNIFY B3：apply 改 form 提交语义（type=submit）；行为与旧 onClick 逐字一致——
  // 写 localStorage + reload。preventDefault 防原生导航。disabled 守卫与按钮一致（无变更不提交）。
  function applyBase(event: FormEvent) {
    event.preventDefault();
    if (baseValue.trim() === storedBase.trim()) return;
    if (!window.confirm(t('settings.connection.reloadConfirm'))) return;
    const next = baseValue.trim();
    if (next) window.localStorage.setItem(APIBASE_KEY, next);
    else window.localStorage.removeItem(APIBASE_KEY);
    window.location.reload();
  }

  function resetBase() {
    window.localStorage.removeItem(APIBASE_KEY);
    window.location.reload();
  }

  // --- 写入令牌状态 ---
  const storedToken = window.localStorage.getItem(WRITE_TOKEN_KEY) ?? '';
  const [tokenValue, setTokenValue] = useState(storedToken);
  const [tokenVisible, setTokenVisible] = useState(false);

  function applyToken(event: FormEvent) {
    event.preventDefault();
    if (tokenValue.trim() === storedToken.trim()) return;
    if (!window.confirm(t('settings.connection.reloadConfirm'))) return;
    const next = tokenValue.trim();
    if (next) window.localStorage.setItem(WRITE_TOKEN_KEY, next);
    else window.localStorage.removeItem(WRITE_TOKEN_KEY);
    window.location.reload();
  }

  function resetToken() {
    window.localStorage.removeItem(WRITE_TOKEN_KEY);
    window.location.reload();
  }

  return (
    <section className="panel settings-panel">
      <div className="panel-header">
        <h2>{t('settings.section.connection')}</h2>
      </div>
      <div className="settings-section">
        {/* 后端地址：apply 改真 <form onSubmit>（FORM-UNIFY B3）。form 用 display:contents——
            其盒子从布局消失，label/current/actions 仍作 .settings-section 的直接 flex 项（12px gap 不变），
            像素零变；同时获得真表单语义（Enter 提交、type=submit）。reset 留 type=button（非提交动作）。
            注意：本 section 无外层 form，不会 form 嵌套。 */}
        <form style={{ display: 'contents' }} onSubmit={applyBase}>
          {/* 后端地址 */}
          <p className="settings-desc">{t('settings.apiBase.desc')}</p>
          <label className="kb-field">
            <span>{t('settings.apiBase.label')}</span>
            <input
              type="text"
              value={baseValue}
              onChange={(event) => setBaseValue(event.target.value)}
              placeholder={t('settings.apiBase.placeholder')}
            />
          </label>
          <p className="settings-current">
            {t('settings.apiBase.current', { value: effectiveBase })}
          </p>
          <div className="settings-actions">
            <button
              type="submit"
              className="btn btn--primary"
              disabled={baseValue.trim() === storedBase.trim()}
            >
              {t('settings.apiBase.apply')}
            </button>
            <button
              type="button"
              className="btn btn--secondary"
              onClick={resetBase}
              disabled={storedBase.trim() === ''}
            >
              {t('settings.apiBase.reset')}
            </button>
          </div>
        </form>

        {/* 写入令牌：同上，独立 display:contents form（spaced desc 作首个 flex 项保留 gap）。 */}
        <form style={{ display: 'contents' }} onSubmit={applyToken}>
          {/* 写入令牌 */}
          <p className="settings-desc">{t('settings.writeToken.desc')}</p>
          <label className="kb-field">
            <span>{t('settings.writeToken.label')}</span>
            <span className="settings-token-row">
              <input
                type={tokenVisible ? 'text' : 'password'}
                value={tokenValue}
                onChange={(event) => setTokenValue(event.target.value)}
                placeholder={t('settings.writeToken.placeholder')}
                autoComplete="off"
              />
              <button
                type="button"
                className="today-plan-table__rowBtn"
                onClick={() => setTokenVisible((v) => !v)}
                aria-label={
                  tokenVisible ? t('settings.writeToken.hide') : t('settings.writeToken.show')
                }
                title={
                  tokenVisible ? t('settings.writeToken.hide') : t('settings.writeToken.show')
                }
              >
                {tokenVisible ? (
                  <EyeOff size={14} aria-hidden="true" />
                ) : (
                  <Eye size={14} aria-hidden="true" />
                )}
              </button>
            </span>
          </label>
          <p className="settings-current">
            {tokenValue.trim()
              ? t('settings.writeToken.set')
              : t('settings.writeToken.unset')}
          </p>
          <div className="settings-actions">
            <button
              type="submit"
              className="btn btn--primary"
              disabled={tokenValue.trim() === storedToken.trim()}
            >
              {t('settings.writeToken.apply')}
            </button>
            <button
              type="button"
              className="btn btn--secondary"
              onClick={resetToken}
              disabled={storedToken.trim() === ''}
            >
              {t('settings.writeToken.reset')}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
