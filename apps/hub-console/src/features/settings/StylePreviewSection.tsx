import { useI18n } from '../../i18n';
import { useTheme } from '../../theme';
import { THEME_OPTIONS } from './settings-constants';

/**
 * 外观与风格预览（STYLE-PICK，IA-RESTRUCTURE）：原顶级「风格预览」页降级收进设置页——
 * 风格选型是设置项，不该占导航。上半 = 主题 swatch 选择器（即时控件 FORM-UNIFY B3 §1.3.7：
 * 点选即 setTheme、不套表单、无提交按钮；6 套皮肤太宽，不用 SegToggle 改用 swatch 按钮组），
 * 下半 = kitchen-sink 预览格（按钮/徽章/指标卡/面板行/表单/状态条），让用户在真实组件上
 * 对比候选皮肤，而不是看别人的截图。纯静态展示，零数据请求、零远程状态。
 */
export function StylePreviewSection() {
  const { t } = useI18n();
  const { theme, setTheme } = useTheme();

  return (
    <>
      <section className="panel settings-panel">
        <div className="panel-header">
          <h2>{t('settings.section.appearance')}</h2>
        </div>
        <div className="settings-section">
          <p className="settings-desc">{t('settings.appearance.desc')}</p>
          <div className="style-gallery__themes">
            {THEME_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={
                  theme === opt.value
                    ? 'style-gallery__theme style-gallery__theme--active'
                    : 'style-gallery__theme'
                }
                onClick={() => setTheme(opt.value)}
                aria-pressed={theme === opt.value}
              >
                <span className={`style-gallery__swatch style-gallery__swatch--${opt.value}`} />
                <span>{t(opt.labelKey)}</span>
                {theme === opt.value ? (
                  <span className="badge badge--blue">{t('stylegallery.current')}</span>
                ) : null}
              </button>
            ))}
          </div>
        </div>
      </section>

      <div className="style-gallery__grid">
        <section className="panel">
          <div className="panel-header">
            <h2>{t('stylegallery.section.buttons')}</h2>
          </div>
          <div className="style-gallery__body style-gallery__row">
            <button type="button" className="btn btn--primary">Primary</button>
            <button type="button" className="btn btn--secondary">Secondary</button>
            <button type="button" className="btn btn--ghost">Ghost</button>
            <button type="button" className="btn btn--danger">Danger</button>
            <button type="button" className="btn btn--sm btn--secondary">Small</button>
            <button type="button" className="btn btn--dashed">Dashed</button>
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <h2>{t('stylegallery.section.badges')}</h2>
          </div>
          <div className="style-gallery__body style-gallery__row">
            <span className="badge">default</span>
            <span className="badge badge--green">green</span>
            <span className="badge badge--amber">amber</span>
            <span className="badge badge--red">red</span>
            <span className="badge badge--blue">blue</span>
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <h2>{t('stylegallery.section.metrics')}</h2>
          </div>
          <div className="style-gallery__body style-gallery__row">
            <div className="metric-tile">
              <span>{t('stylegallery.sample.metric')}</span>
              <div className="metric-tile__row">
                <strong>12</strong>
              </div>
            </div>
            <div className="metric-tile metric-tile--green">
              <span>{t('stylegallery.sample.metric2')}</span>
              <div className="metric-tile__row">
                <strong>5</strong>
              </div>
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <h2>{t('stylegallery.section.panel')}</h2>
          </div>
          <div className="stack-list">
            <div className="data-row">
              <div>
                <strong>{t('stylegallery.sample.rowTitle1')}</strong>
                <span>{t('stylegallery.sample.rowMeta1')}</span>
              </div>
              <span className="badge badge--green">green</span>
            </div>
            <div className="data-row">
              <div>
                <strong>{t('stylegallery.sample.rowTitle2')}</strong>
                <span>{t('stylegallery.sample.rowMeta2')}</span>
              </div>
              <span className="badge badge--amber">amber</span>
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <h2>{t('stylegallery.section.form')}</h2>
          </div>
          <div className="style-gallery__body">
            <label className="kb-field">
              <input type="text" placeholder={t('stylegallery.sample.input')} />
            </label>
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <h2>{t('stylegallery.section.states')}</h2>
          </div>
          <div className="style-gallery__body style-gallery__col">
            <div className="state-band">{t('stylegallery.sample.band')}</div>
            <div className="state-band state-band-error">{t('stylegallery.sample.bandError')}</div>
          </div>
        </section>
      </div>
    </>
  );
}
