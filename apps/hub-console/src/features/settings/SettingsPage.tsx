import { AppearancePreferences } from './components/AppearancePreferences';
import type { HubApiClient } from '../../api/client';
import type { PageIdentityCtx } from '../../console-pages';
import { useI18n } from '../../i18n';
import { SegToggle } from '../../components/SegToggle';
import { LANG_OPTIONS } from './settings-constants';
import { StylePreviewSection } from './StylePreviewSection';
import { IdentitySection } from './IdentitySection';
import { GroupsSection } from './GroupsSection';
import { MembersPermissionsSection } from './MembersSection';
import { ExportSection } from './MiscSections';

export function SettingsPage({ client, source, identity }: {
  client: HubApiClient;
  source: string;
  identity: PageIdentityCtx;
}) {
  const { t, lang, setLang } = useI18n();
  return <div className="settings-page">
    <AppearancePreferences />
    <IdentitySection identity={identity} />
    <section className="panel settings-panel"><div className="panel-header"><h2>{t('settings.section.language')}</h2></div>
      <div className="settings-section"><p className="settings-desc">{t('settings.language.desc')}</p>
        <SegToggle value={lang} options={LANG_OPTIONS.map((opt) => ({ value: opt.value, label: t(opt.labelKey) }))} onChange={setLang} ariaLabel={t('settings.section.language')} />
      </div>
    </section>
    <StylePreviewSection />
    <GroupsSection client={client} source={source} identity={identity} />
    <MembersPermissionsSection client={client} source={source} identity={identity} />
    <ExportSection />
  </div>;
}
