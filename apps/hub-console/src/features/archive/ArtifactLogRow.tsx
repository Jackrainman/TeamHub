import { useRef } from 'react';
import type { ArtifactRef } from '@teamhub/hub-contracts';
import type { HubApiClient } from '../../api/client';
import { useI18n } from '../../i18n';
import { errorDetail } from '../../utils';
import { useHubMutation } from '../../hooks/useHubMutation';
import { MetaRow } from '../../components/MetaRow';
import { ARTIFACT_ACCEPT_EXT } from '../../verticals/robotics';

const ARTIFACT_ACCEPT = ARTIFACT_ACCEPT_EXT.join(',');

export function formatDate(iso: string, lang: 'zh' | 'en'): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

export function ArtifactLogRow({
  artifact,
  lang,
  client,
  uploadDisabled,
}: {
  artifact: ArtifactRef;
  lang: 'zh' | 'en';
  client: HubApiClient;
  uploadDisabled?: boolean;
}) {
  const { t } = useI18n();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const upload = useHubMutation({
    mutationFn: (f: File) => client.uploadArtifactFile(artifact.id, f),
    invalidateKeys: [['artifacts']],
  });
  const versionLabel =
    artifact.versionNo != null
      ? `v${artifact.versionNo}`
      : (artifact.revision ?? null);
  const robotLabel = artifact.robotCode
    ? artifact.robotCode === 'universal'
      ? t('enum.robot.universal')
      : artifact.robotCode
    : null;
  const hasFile = Boolean(artifact.storedFile);
  return (
    <article className="data-row archive-row">
      <div className="archive-row__content">
        <div className="archive-row__main">
          <strong>{artifact.name}</strong>
          <span className="archive-row__meta">
            {versionLabel ? (
              <span className="badge badge--blue badge--strong">{versionLabel}</span>
            ) : null}
            {robotLabel ? (
              <span className="badge badge--outline">
                {robotLabel}
              </span>
            ) : null}
            <span>
              {t('archive.meta.submittedAt')}{' '}
              {formatDate(artifact.createdAt, lang)}
            </span>
          </span>
        </div>
        <dl className="archive-row__detail">
          {artifact.relatedCommit ? (
            <MetaRow
              label={t('archive.meta.commit')}
              value={artifact.relatedCommit}
              mono
              rowClass="archive-meta__row"
            />
          ) : null}
          {artifact.uri ? (
            <MetaRow
              label={t('archive.meta.uri')}
              value={artifact.uri}
              mono
              rowClass="archive-meta__row"
            />
          ) : null}
        </dl>
      </div>
      <div className="archive-row__actions">
        {hasFile ? (
          <a
            className="archive-download"
            href={`/api/artifacts/${encodeURIComponent(artifact.id)}/download`}
            download
          >
            {t('archive.download')}
          </a>
        ) : null}
        {artifact.uri ? (
          <a
            className="archive-download archive-openlink"
            href={artifact.uri}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t('archive.openLink')}
          </a>
        ) : null}
        {!hasFile && !artifact.uri ? (
          <span className="archive-nofile">{t('archive.noFile')}</span>
        ) : null}
        <button
          type="button"
          className="btn btn--dashed"
          onClick={() => fileInputRef.current?.click()}
          disabled={upload.isPending || uploadDisabled}
          title={uploadDisabled ? t('archive.uploadDisabled') : undefined}
        >
          {upload.isPending
            ? t('archive.uploading')
            : hasFile
              ? t('archive.replaceFile')
              : t('archive.uploadFile')}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept={ARTIFACT_ACCEPT}
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) upload.mutate(f);
            e.target.value = '';
          }}
        />
        {upload.error ? (
          <span className="archive-upload-err">
            {/401|unauthorized/i.test(errorDetail(upload.error))
              ? t('archive.form.error401')
              : t('archive.uploadError', { detail: errorDetail(upload.error) })}
          </span>
        ) : null}
      </div>
    </article>
  );
}
