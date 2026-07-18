import { useState } from 'react';
import type {
  ConfigIdentityMode,
  DataMode,
  SetupStateResponse,
} from '@teamhub/hub-contracts';
import type { HubApiClient } from '../../api/client';
import { useI18n } from '../../i18n';
import { SETUP_LANDING_KEY } from '../../constants';

/**
 * 首启动向导（SETUP-WIZARD 刀②，setup-wizard.md §5）。
 *
 * App.tsx 的 setup 分支在 `GET /api/setup/state` 报未初始化时渲染本组件——**整个 app shell 换成全屏向导**，
 * 现有页面一个都不渲染（store 未建、渲染了也全是错）。第 1 步（唯一必答）两张大卡二选一：
 *  - 「先试试」：演示数据（冻结钟 + 演示车 / 排班 / 语料），随便点不心疼；可选折叠「高级」= 演示态也开登录制
 *    （§10 拍板①，默认收起 + 默认匿名）。
 *  - 「直接安装」：真实空板；追问一格「写操作要登录吗」= 登录制（推荐）/ 匿名共用。
 * 提交 → `POST /api/setup/init` 写 config.json → 服务 exit 42 自动重启 → 全屏「正在应用配置…」+ 轮询复活 →
 * 整页刷新。重启后落点见 §5 末段（试驾 / 正式+匿名 → 总览；正式+身份 → 设置页 + 三步走引导横幅，落点标记
 * 经 localStorage 传递给 ConsoleApp）。
 *
 * 反监视 I0：向导只问部署形态（数据形态 + 登录方式），不收集任何成员维度。
 */

/** 重启轮询节奏：约定 exit 42 → start 脚本 / compose 拉起正常模式，重启约 10 秒，45×1s 上限留足冗余。 */
const POLL_INTERVAL_MS = 1000;
const POLL_MAX_ATTEMPTS = 45;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 提交后轮询 `GET /api/setup/state` 直到 `initialized:true`（= 正常模式已复活）。重启窗口内端口暂不可达
 * （fetch 抛错）属预期，吞掉继续轮询；超过上限抛 restart-timeout（前端转错误态，给「重新加载」兜底）。
 * 用 setup/state 的 initialized 作复活信号（而非 /health.setupPending），语义等价且无需触碰 health 契约。
 */
async function pollUntilInitialized(client: HubApiClient): Promise<void> {
  for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt += 1) {
    await sleep(POLL_INTERVAL_MS);
    try {
      const state = await client.getSetupState();
      if (state.initialized) return;
    } catch {
      // 重启窗口内 server 暂不可达，预期内，继续轮询。
    }
  }
  throw new Error('restart-timeout');
}

type Phase = 'form' | 'applying' | 'error';

export function SetupWizard({
  client,
  state,
}: {
  client: HubApiClient;
  state: SetupStateResponse;
}) {
  const { t } = useI18n();
  const [phase, setPhase] = useState<Phase>('form');
  const [timedOut, setTimedOut] = useState(false);
  // 试驾「高级」折叠内的开关（§10 拍板①）：默认收起 + 默认关（= 匿名）。
  const [demoIdentity, setDemoIdentity] = useState(false);
  // 直接安装追问格「写操作要登录吗」：默认登录制（推荐）。
  const [realIdentity, setRealIdentity] = useState<ConfigIdentityMode>('identity');

  async function submit(dataMode: DataMode, identityMode: ConfigIdentityMode) {
    if (phase === 'applying') return;
    setTimedOut(false);
    setPhase('applying');
    try {
      try {
        await client.initSetup({ dataMode, identityMode });
      } catch (err) {
        // 409 = 已初始化（多标签页并发有人先提交了）→ 当作已完成，直接进重启轮询；其余错误 → 错误态。
        if (!/\b409\b/.test(String(err))) throw err;
      }
      await pollUntilInitialized(client);
      // 落点标记（§5 末段）：仅「正式 + 登录制」写 'roster'，重启后 ConsoleApp 落设置页 + 三步走横幅；
      // 试驾 / 正式+匿名 不写值，走默认（总览）。
      if (dataMode === 'real' && identityMode === 'identity') {
        window.localStorage.setItem(SETUP_LANDING_KEY, 'roster');
      }
      window.location.reload();
    } catch (err) {
      // 复活超时（config 多半已写、server 已在起）与真失败统一走「重新加载」兜底：reload 后 gate 重判
      // ——已初始化则进正常 app，未初始化则回向导，两种情形都自愈。
      setTimedOut(/restart-timeout/.test(String(err)));
      setPhase('error');
    }
  }

  if (phase === 'applying') {
    return (
      <div className="setup-wizard setup-wizard--center" role="status" aria-live="polite">
        <div className="setup-wizard__inner setup-wizard__status">
          <div className="setup-spinner" aria-hidden="true" />
          <h1 className="setup-wizard__title">{t('setup.applying.title')}</h1>
          <p className="setup-wizard__subtitle">{t('setup.applying.desc')}</p>
        </div>
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div className="setup-wizard setup-wizard--center">
        <div className="setup-wizard__inner setup-wizard__status">
          <h1 className="setup-wizard__title">{t('setup.error.title')}</h1>
          <p className="setup-wizard__subtitle">
            {timedOut ? t('setup.error.timeout') : t('setup.error.desc')}
          </p>
          <button
            type="button"
            className="btn btn--secondary"
            onClick={() => window.location.reload()}
          >
            {t('setup.error.retry')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="setup-wizard">
      <div className="setup-wizard__inner">
        <header className="setup-wizard__head">
          <p className="eyebrow">{t('toolbar.eyebrow')}</p>
          <h1 className="setup-wizard__title">{t('setup.title')}</h1>
          <p className="setup-wizard__subtitle">{t('setup.subtitle')}</p>
        </header>

        {/* 升级迁移提示（§3/§5）：数据目录非空（既有 v0.25.x 部署升级后见一次向导）→ 明示不动数据。 */}
        {state.dataDirHasData ? (
          <p className="setup-wizard__notice" role="status">
            {t('setup.existingData')}
          </p>
        ) : null}

        <div className="setup-wizard__cards">
          {/* 先试试（演示数据） */}
          <section className="setup-card">
            <h2 className="setup-card__title">{t('setup.demo.title')}</h2>
            <p className="setup-card__desc">{t('setup.demo.desc')}</p>
            <details className="setup-card__advanced">
              <summary>{t('setup.demo.advanced')}</summary>
              <label className="setup-card__check">
                <input
                  type="checkbox"
                  checked={demoIdentity}
                  onChange={(e) => setDemoIdentity(e.target.checked)}
                />
                <span>{t('setup.demo.advanced.identityLabel')}</span>
              </label>
              <p className="setup-card__hint">{t('setup.demo.advanced.identityHint')}</p>
            </details>
            <div className="setup-card__spacer" />
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => submit('demo', demoIdentity ? 'identity' : 'anonymous')}
            >
              {t('setup.demo.cta')}
            </button>
            <p className="setup-card__foot">{t('setup.changeableHint')}</p>
          </section>

          {/* 直接安装（正式使用） */}
          <section className="setup-card setup-card--primary">
            <h2 className="setup-card__title">{t('setup.real.title')}</h2>
            <p className="setup-card__desc">{t('setup.real.desc')}</p>
            <fieldset className="setup-card__choice">
              <legend>{t('setup.real.identity.question')}</legend>
              <label className="setup-choice">
                <input
                  type="radio"
                  name="setup-identity"
                  checked={realIdentity === 'identity'}
                  onChange={() => setRealIdentity('identity')}
                />
                <span className="setup-choice__body">
                  <span className="setup-choice__label">
                    {t('setup.real.identity.identity')}
                  </span>
                  <span className="setup-choice__hint">
                    {t('setup.real.identity.identityHint')}
                  </span>
                </span>
              </label>
              <label className="setup-choice">
                <input
                  type="radio"
                  name="setup-identity"
                  checked={realIdentity === 'anonymous'}
                  onChange={() => setRealIdentity('anonymous')}
                />
                <span className="setup-choice__body">
                  <span className="setup-choice__label">
                    {t('setup.real.identity.anon')}
                  </span>
                  <span className="setup-choice__hint">
                    {t('setup.real.identity.anonHint')}
                  </span>
                </span>
              </label>
            </fieldset>
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => submit('real', realIdentity)}
            >
              {t('setup.real.cta')}
            </button>
            <p className="setup-card__foot">{t('setup.changeableHint')}</p>
          </section>
        </div>
      </div>
    </div>
  );
}
