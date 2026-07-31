import type { PageIdentityCtx } from '../../console-pages';
import { useI18n } from '../../i18n';
import { ROLE_KEY } from './settings-constants';

// 身份（K2 身份体验刀）：只读展示这台服务器当前的登录模式——匿名模式（缺省）附「怎么启用登录」说明；
// 登录模式显示登录状态 + 「重启后需重登」提示。数据吃 App 已装配好的 identity 槽（GET /api/session），
// 本分区不发任何写请求（改模式只能改服务器启动环境变量，不在界面里）。
export function IdentitySection({ identity }: { identity: PageIdentityCtx }) {
  const { t } = useI18n();
  const isIdentityMode = identity.mode === 'identity';
  const session = identity.session;

  return (
    <section className="panel settings-panel">
      <div className="panel-header">
        <h2>{t('settings.section.identity')}</h2>
      </div>
      <div className="settings-section">
        <p className="settings-desc">{t('settings.identity.desc')}</p>
        <p>
          <span className={`badge badge--wide${isIdentityMode ? ' badge--green' : ''}`}>
            {t(
              isIdentityMode
                ? 'settings.identity.mode.identity'
                : 'settings.identity.mode.anonymous',
            )}
          </span>
        </p>
        {identity.isLoading ? (
          <p className="settings-desc" role="status" aria-live="polite">…</p>
        ) : isIdentityMode ? (
          <>
            <p className="settings-desc">
              {session
                ? t('settings.identity.identity.loggedIn', {
                    name: session.displayName,
                    role: t(ROLE_KEY[session.role]),
                  })
                : t('settings.identity.identity.loggedOut')}
            </p>
            <p className="settings-desc">{t('settings.identity.identity.restartNote')}</p>
          </>
        ) : (
          // SETUP-WIZARD 刀③：切换登录方式的入口已从「启动 env」改为下方「部署配置」写区（改完自动重启
          // 生效），此处只留一句指路，不再展示已退役的模式类 env。
          <p className="settings-desc">{t('settings.identity.anon.body')}</p>
        )}
      </div>
    </section>
  );
}
