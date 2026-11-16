import { AppearancePreferences } from './components/AppearancePreferences';
import type { HubApiClient } from '../../api/client';
import type { OverviewView, PageIdentityCtx } from '../../console-pages';
import { useI18n } from '../../i18n';
import { SegToggle } from '../../components/SegToggle';
import { LANG_OPTIONS } from './settings-constants';
import { StylePreviewSection } from './StylePreviewSection';
import { IdentitySection } from './IdentitySection';
import { SeasonsSection } from './SeasonsSection';
import { ProjectsSection } from './ProjectsSection';
import { GroupsSection } from './GroupsSection';
import { MembersPermissionsSection } from './MembersSection';
import { ExportSection } from './MiscSections';
import { DeveloperSection } from './DeveloperSection';

// 设置页：日常可调的设置在前（外观 / 身份 / 语言 / 风格预览 / 赛季 / 组 / 成员 / 导出），
// 运维与集成向面板收进末尾可折叠的「开发者」区（DeveloperSection）。
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

  return (
    <div className="settings-page">
      <AppearancePreferences />
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

      {/* 外观 = 主题 swatch 选择器 + 风格预览格（原顶级风格预览页降级收进设置，STYLE-PICK）。 */}
      <StylePreviewSection />

      <SeasonsSection client={client} source={source} identity={identity} />
      <ProjectsSection client={client} source={source} identity={identity} />
      <GroupsSection client={client} source={source} identity={identity} />
      <MembersPermissionsSection client={client} source={source} identity={identity} />
      <ExportSection />
      <DeveloperSection client={client} source={source} identity={identity} overview={overview} />
    </div>
  );
}
