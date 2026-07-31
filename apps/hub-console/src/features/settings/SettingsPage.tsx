import type { HubApiClient } from '../../api/client';
import type { OverviewView, PageIdentityCtx } from '../../console-pages';
import { useI18n } from '../../i18n';
import { useTheme } from '../../theme';
import { SegToggle } from '../../components/SegToggle';
import { LANG_OPTIONS, THEME_OPTIONS } from './settings-constants';
import { IdentitySection } from './IdentitySection';
import { SeasonsSection } from './SeasonsSection';
import { GroupsSection } from './GroupsSection';
import { MembersPermissionsSection } from './MembersSection';
import { IntegrationsSection, LarkIntegrationSection } from './IntegrationsSection';
import { ConnectionSection } from './ConnectionSection';
import { DeploymentSection, DeploymentConfigSection } from './DeploymentSection';
import { ExportSection, AboutSection } from './MiscSections';

// 设置页：收纳此前散落各处的运行时设置——语言 / 集成 / 后端地址 / 关于。
// 语言复用 i18n 的同一份状态（无本地副本，故无同步问题）。单一真实后端，无数据源切换。

export function SettingsPage({
  client,
  source,
  identity,
  overview,
}: {
  client: HubApiClient;
  source: string;
  identity: PageIdentityCtx;
  overview: OverviewView;
}) {
  const { t, lang, setLang } = useI18n();
  const { theme, setTheme } = useTheme();

  return (
    <div className="settings-page">
      <IdentitySection identity={identity} />

      <section className="panel settings-panel">
        <div className="panel-header">
          <h2>{t('settings.section.language')}</h2>
        </div>
        <div className="settings-section">
          <p className="settings-desc">{t('settings.language.desc')}</p>
          {/* 语言 = 即时控件（FORM-UNIFY B3 / §1.3.7）：点选即 setLang、不套表单、无提交按钮。
              seg → SegToggle（吐同款 div.seg + seg__btn(segClass)，像素零变）。 */}
          <SegToggle
            value={lang}
            options={LANG_OPTIONS.map((opt) => ({
              value: opt.value,
              label: t(opt.labelKey),
            }))}
            onChange={setLang}
            ariaLabel={t('settings.section.language')}
          />
        </div>
      </section>

      <section className="panel settings-panel">
        <div className="panel-header">
          <h2>{t('settings.section.appearance')}</h2>
        </div>
        <div className="settings-section">
          <p className="settings-desc">{t('settings.appearance.desc')}</p>
          {/* 主题 = 即时控件（FORM-UNIFY B3 / §1.3.7）：点选即 setTheme、不套表单、无提交按钮。
              seg → SegToggle（吐同款 div.seg + seg__btn(segClass)，像素零变）。 */}
          <SegToggle
            value={theme}
            options={THEME_OPTIONS.map((opt) => ({
              value: opt.value,
              label: t(opt.labelKey),
            }))}
            onChange={setTheme}
            ariaLabel={t('settings.section.appearance')}
          />
        </div>
      </section>

      <SeasonsSection client={client} source={source} identity={identity} />
      <GroupsSection client={client} source={source} identity={identity} />
      <MembersPermissionsSection client={client} source={source} identity={identity} />
      <IntegrationsSection overview={overview} />
      <LarkIntegrationSection client={client} />
      <ConnectionSection />
      <DeploymentSection client={client} source={source} />
      <DeploymentConfigSection client={client} source={source} identity={identity} />
      <ExportSection />
      <AboutSection client={client} source={source} />
    </div>
  );
}
