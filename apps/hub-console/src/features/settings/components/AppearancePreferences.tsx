import { useConsolePreferences, type FontSize } from '../../../shared/ConsolePreferences';
import { useI18n } from '../../../i18n';
import { SegToggle } from '../../../components/SegToggle';

export function AppearancePreferences() {
  const { t } = useI18n();
  const p = useConsolePreferences();
  return <section className="card appearance-preferences">
    <div><div><h2>{t('expected.autoCollapse')}</h2><p>{t('expected.autoCollapseHint')}</p></div>
      <button type="button" className="preference-switch" role="switch" aria-label={t('expected.autoCollapse')} aria-checked={p.autoCollapse} onClick={() => p.setAutoCollapse(!p.autoCollapse)}><span />{t(p.autoCollapse ? 'expected.on' : 'expected.off')}</button></div>
    <div><div><h2>{t('expected.fontSize')}</h2><p>{t('expected.fontSizeHint')}</p></div>
      <SegToggle value={p.fontSize} options={(['normal', 'large', 'xlarge'] as FontSize[]).map(value => ({ value, label: t(`expected.font.${value}`) }))} onChange={p.setFontSize} ariaLabel={t('expected.fontSize')} /></div>
    <div><div><h2>{t('expected.sidebarState')}</h2><p>{t('expected.sidebarStateHint')}</p></div>
      <button className="btn btn--secondary" onClick={p.toggleSidebar}>{t(p.expanded ? 'expected.collapse' : 'expected.expand')}</button></div>
    <div><div><h2>{t('expected.data')}</h2><p>{t('expected.dataHint')}</p></div></div>
  </section>;
}
