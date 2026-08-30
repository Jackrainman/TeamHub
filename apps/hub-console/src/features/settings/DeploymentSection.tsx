import { useState } from 'react';
import type { ConfigIdentityMode } from '@teamhub/hub-contracts';
import type { HubApiClient } from '../../api/client';
import type { PageIdentityCtx } from '../../console-pages';
import { useI18n, type TranslationKey } from '../../i18n';
import { MetaRow } from '../../components/MetaRow';
import { DEPLOY_BACKEND_KEY, DEPLOY_DOMAIN_KEY } from './settings-constants';
import { sectionPermission } from './section-permission';
import { useSystemStatus } from './sub/useSettingsQueries';

// 部署信息：运维路径与构建信息由运行环境回显，产品模式、垂直包和模块列表来自
// 同一 SQLite app_settings 快照。界面不再把环境变量解释为产品配置源。I0：本分区无任何按人维度。
export function DeploymentSection({
  client,
  source,
}: {
  client: HubApiClient;
  source: string;
}) {
  const { t } = useI18n();
  const statusQuery = useSystemStatus(client, source);
  const deployment = statusQuery.data?.deployment;

  return (
    <section className="panel settings-panel">
      <div className="panel-header">
        <h2>{t('settings.section.deployment')}</h2>
      </div>
      <div className="settings-section">
        <p className="settings-desc">{t('settings.deployment.desc')}</p>
        {statusQuery.isLoading ? (
          <p className="settings-desc" role="status" aria-live="polite">…</p>
        ) : statusQuery.error || !statusQuery.data ? (
          <p className="form-hint form-hint--warn">{t('settings.about.unavailable')}</p>
        ) : !deployment ? (
          <p className="form-hint form-hint--warn">{t('settings.deployment.unavailable')}</p>
        ) : (
          <>
            {/* 五域落盘 / 内存逐行：内存态用琥珀警示徽章 + 「重启即丢」文案，落盘态显示路径（mono）。 */}
            <h3 className="integration-group__title">
              {t('settings.deployment.storage.title')}
            </h3>
            <div className="adapter-grid">
              {deployment.storage.map((entry) => {
                const domainKey = DEPLOY_DOMAIN_KEY[entry.domain];
                const domainLabel = domainKey ? t(domainKey) : entry.domain;
                const isMemory = entry.backend === 'memory';
                return (
                  <article className="adapter-row" key={entry.domain}>
                    <div>
                      <strong>{domainLabel}</strong>
                      {isMemory ? (
                        <span>{t('settings.deployment.memory.warn')}</span>
                      ) : entry.path ? (
                        <span className="kb-mono">{entry.path}</span>
                      ) : null}
                    </div>
                    <span
                      className={`badge badge--wide${isMemory ? ' badge--amber' : ' badge--green'}`}
                    >
                      {t(DEPLOY_BACKEND_KEY[entry.backend])}
                    </span>
                  </article>
                );
              })}
            </div>
            <dl className="kb-meta">
              <MetaRow
                label={t('settings.deployment.identityMode')}
                value={t(
                  deployment.identityMode === 'identity'
                    ? 'settings.identity.mode.identity'
                    : 'settings.identity.mode.anonymous',
                )}
              />
              <MetaRow
                label={t('settings.deployment.vertical')}
                value={t(`settings.deployment.vertical.${deployment.verticalId}`)}
              />
              <MetaRow
                label={t('settings.deployment.modules')}
                value={deployment.enabledModules.join(' · ')}
                mono
              />
              <MetaRow
                label={t('settings.deployment.buildId')}
                value={deployment.buildId}
                mono
              />
              <MetaRow
                label={t('settings.deployment.uptime')}
                value={humanizeUptime(statusQuery.data.uptimeSeconds, t)}
              />
              <MetaRow
                label={t('settings.deployment.artifactUpload')}
                value={t(
                  deployment.artifactUploadEnabled
                    ? 'settings.deployment.artifactUpload.enabled'
                    : 'settings.deployment.artifactUpload.disabled',
                )}
              />
            </dl>
          </>
        )}
      </div>
    </section>
  );
}

// ── 部署配置写区（SETUP-WIZARD 刀③，setup-wizard.md §6）───────────────────────────────────────
// 重启轮询节奏（同刀② 向导）：约定 exit 42 → start 脚本 / compose 拉起正常模式，重启约 10 秒，
// 45×1s 上限留足冗余。正常模式两态皆 initialized:true，故复活信号取「端口重新可达」——先等一段宽限
// （服务端延迟 ~500ms 退出，避免探到正要死的旧进程），再轮询 getSetupState 首次成功即复活。
const DEPLOY_POLL_INTERVAL_MS = 1000;
const DEPLOY_POLL_MAX_ATTEMPTS = 45;
const DEPLOY_RESTART_GRACE_MS = 1500;
const deploySleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

async function pollUntilRestarted(client: HubApiClient): Promise<void> {
  await deploySleep(DEPLOY_RESTART_GRACE_MS);
  for (let attempt = 0; attempt < DEPLOY_POLL_MAX_ATTEMPTS; attempt += 1) {
    try {
      await client.getSetupState();
      return; // 新进程已在服
    } catch {
      // 重启窗口内端口暂不可达，预期，继续轮询。
    }
    await deploySleep(DEPLOY_POLL_INTERVAL_MS);
  }
  throw new Error('restart-timeout');
}

// 部署配置写区：登录方式切换（匿名 ⇄ 身份）+「结束试驾，转正式」（仅 dataMode=demo 显示）。两动作都走
// 「确认弹窗 → 调写 API → 服务端 exit 42 自动重启 → 前端轮询复活 → 整页刷新」流（§6）。dataMode /
// identityMode 取 /api/system/status 的 deployment 字段（与「部署信息」/「关于」共享 query 缓存）。
// 鉴权镜像服务端：身份模式须 superAdmin（sectionPermission 的 adminLocked）、匿名模式恒可写（走写门）。
export function DeploymentConfigSection({
  client,
  source,
  identity,
}: {
  client: HubApiClient;
  source: string;
  identity: PageIdentityCtx;
}) {
  const { t } = useI18n();
  const { writeLocked, lockHint } = sectionPermission(identity, t);
  const statusQuery = useSystemStatus(client, source);
  const deployment = statusQuery.data?.deployment;

  // applying = 提交后到整页刷新之间的过渡态（轮询重启复活）；error = app_settings 多半已写但复活超时 / 真失败，
  // 统一给「重新加载」兜底（reload 后按新配置重判）。
  const [phase, setPhase] = useState<'idle' | 'applying' | 'error'>('idle');
  const [timedOut, setTimedOut] = useState(false);
  const [backupConfirmed, setBackupConfirmed] = useState(false);

  async function applyRestart(action: () => Promise<unknown>): Promise<void> {
    if (phase === 'applying') return;
    setTimedOut(false);
    setPhase('applying');
    try {
      await action();
      await pollUntilRestarted(client);
      window.location.reload();
    } catch (err) {
      setTimedOut(/restart-timeout/.test(String(err)));
      setPhase('error');
    }
  }

  function switchIdentity(next: ConfigIdentityMode): void {
    if (writeLocked || !deployment || next === deployment.identityMode) return;
    // 身份→匿名：警示留名 / 会话失效；匿名→身份：提示重启后需名册 + 管理员初始化（若未做过）。
    const confirmMsg =
      next === 'anonymous'
        ? t('settings.deployConfig.identity.toAnonConfirm')
        : t('settings.deployConfig.identity.toIdentityConfirm');
    if (!window.confirm(confirmMsg)) return;
    void applyRestart(() => client.setConfig({ identityMode: next }));
  }

  function graduate(): void {
    if (writeLocked || !backupConfirmed) return;
    if (!window.confirm(t('settings.deployConfig.graduate.confirm'))) return;
    void applyRestart(() => client.graduate());
  }

  return (
    <section className="panel settings-panel">
      <div className="panel-header">
        <h2>{t('settings.section.deployConfig')}</h2>
      </div>
      <div className="settings-section">
        <p className="settings-desc">{t('settings.deployConfig.desc')}</p>
        {phase === 'applying' ? (
          <div className="setup-wizard__status" role="status" aria-live="polite">
            <div className="setup-spinner" aria-hidden="true" />
            <p className="settings-desc">{t('settings.deployConfig.applying')}</p>
          </div>
        ) : phase === 'error' ? (
          <>
            <p className="form-hint form-hint--warn">
              {timedOut
                ? t('settings.deployConfig.error.timeout')
                : t('settings.deployConfig.error.desc')}
            </p>
            <div className="settings-actions">
              <button
                type="button"
                className="btn btn--secondary"
                onClick={() => window.location.reload()}
              >
                {t('settings.deployConfig.reload')}
              </button>
            </div>
          </>
        ) : statusQuery.isLoading ? (
          <p className="settings-desc" role="status" aria-live="polite">…</p>
        ) : statusQuery.error || !deployment ? (
          <p className="form-hint form-hint--warn">{t('settings.deployment.unavailable')}</p>
        ) : (
          <>
            {/* 登录方式切换（匿名 ⇄ 身份） */}
            <h3 className="integration-group__title">
              {t('settings.deployConfig.identity.title')}
            </h3>
            <p className="settings-desc">
              {t('settings.deployConfig.identity.current', {
                mode: t(
                  deployment.identityMode === 'identity'
                    ? 'settings.identity.mode.identity'
                    : 'settings.identity.mode.anonymous',
                ),
              })}
            </p>
            {lockHint ? <p className="task-detail__hint">{lockHint}</p> : null}
            <div className="settings-actions">
              <button
                type="button"
                className="btn btn--secondary"
                disabled={writeLocked}
                title={lockHint ?? undefined}
                onClick={() =>
                  switchIdentity(
                    deployment.identityMode === 'identity' ? 'anonymous' : 'identity',
                  )
                }
              >
                {t(
                  deployment.identityMode === 'identity'
                    ? 'settings.deployConfig.identity.toAnon'
                    : 'settings.deployConfig.identity.toIdentity',
                )}
              </button>
            </div>

            {/* 结束试驾，转正式（单向门，仅演示态显示） */}
            {deployment.dataMode === 'demo' ? (
              <>
                <h3 className="integration-group__title">
                  {t('settings.deployConfig.graduate.title')}
                </h3>
                <p className="settings-desc">{t('settings.deployConfig.graduate.desc')}</p>
                {lockHint ? <p className="task-detail__hint">{lockHint}</p> : null}
                <label className="setup-card__check">
                  <input
                    type="checkbox"
                    checked={backupConfirmed}
                    disabled={writeLocked}
                    onChange={(event) => setBackupConfirmed(event.target.checked)}
                  />
                  <span>{t('settings.deployConfig.graduate.backupConfirmed')}</span>
                </label>
                <div className="settings-actions">
                  <button
                    type="button"
                    className="btn btn--primary"
                    disabled={writeLocked || !backupConfirmed}
                    title={
                      lockHint ??
                      (!backupConfirmed
                        ? t('settings.deployConfig.graduate.backupRequired')
                        : undefined)
                    }
                    onClick={graduate}
                  >
                    {t('settings.deployConfig.graduate.cta')}
                  </button>
                </div>
              </>
            ) : null}

            {/* 常驻底注：改部署配置会自动重启。 */}
            <p className="settings-desc">
              {t('settings.deployConfig.restartNote')}
            </p>
          </>
        )}
      </div>
    </section>
  );
}

// 运行时长人话化（K3）：秒 → 「X 天 X 小时」/「X 小时 X 分」/「X 分钟」。单位随语言（i18n 键）。
function humanizeUptime(
  totalSeconds: number,
  t: (key: TranslationKey, params?: Record<string, string | number>) => string,
): string {
  const sec = Math.max(0, Math.floor(totalSeconds));
  const days = Math.floor(sec / 86400);
  const hours = Math.floor((sec % 86400) / 3600);
  const mins = Math.floor((sec % 3600) / 60);
  if (days > 0) return t('settings.deployment.uptime.days', { d: days, h: hours });
  if (hours > 0) return t('settings.deployment.uptime.hours', { h: hours, m: mins });
  return t('settings.deployment.uptime.mins', { m: mins });
}
