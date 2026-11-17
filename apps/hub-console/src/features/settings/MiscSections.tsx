import { useI18n } from '../../i18n';

export function ExportSection() {
  const { t } = useI18n();
  return <section className="settings-section">
    <h2>{t('settings.export.title')}</h2><p className="settings-desc">{t('settings.export.desc')}</p>
    <div className="settings-actions">
      <a className="btn btn--secondary btn--sm" href="/api/export/roster" download>{t('settings.export.roster')}</a>
      <a className="btn btn--secondary btn--sm" href="/api/export/tasks" download>{t('settings.export.tasks')}</a>
    </div>
  </section>;
}
