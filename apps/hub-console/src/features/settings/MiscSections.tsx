import type { HubApiClient } from '../../api/client';
import { useI18n } from '../../i18n';
import { MetaRow } from '../../components/MetaRow';
import { useSystemStatus } from './sub/useSettingsQueries';

export function ExportSection() {
  const { t } = useI18n();
  return (
    <section className="settings-section">
      <h2>{t('settings.export.title')}</h2>
      <p className="settings-desc">{t('settings.export.desc')}</p>
      <div className="settings-actions">
        <a className="btn btn--secondary btn--sm" href="/api/export/roster" download>{t('settings.export.roster')}</a>
        <a className="btn btn--secondary btn--sm" href="/api/export/tasks" download>{t('settings.export.tasks')}</a>
        <a className="btn btn--secondary btn--sm" href="/api/export/inventory" download>{t('settings.export.inventory')}</a>
      </div>
    </section>
  );
}

// 关于：service · version 取 /api/system/status（部署运维事实已上移「部署信息」分区，此处只留身份标识）。
export function AboutSection({
  client,
  source,
}: {
  client: HubApiClient;
  source: string;
}) {
  const { t } = useI18n();
  const statusQuery = useSystemStatus(client, source);

  return (
    <section className="panel settings-panel">
      <div className="panel-header">
        <h2>{t('settings.section.about')}</h2>
      </div>
      <div className="settings-section">
        {statusQuery.isLoading ? (
          <p className="settings-desc" role="status" aria-live="polite">…</p>
        ) : statusQuery.error || !statusQuery.data ? (
          <p className="form-hint form-hint--warn">
            {t('settings.about.unavailable')}
          </p>
        ) : (
          <dl className="kb-meta">
            <MetaRow
              label={t('settings.about.service')}
              value={statusQuery.data.service}
            />
            <MetaRow
              label={t('settings.about.version')}
              value={statusQuery.data.version}
              mono
            />
          </dl>
        )}
      </div>
    </section>
  );
}
