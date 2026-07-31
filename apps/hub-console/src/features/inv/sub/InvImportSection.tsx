import { useState, useRef } from 'react';
import type { HubApiClient } from '../../../api/client';
import type {
  InventoryImportReport,
  InventoryImportRow,
  InventoryPreviewResponse,
} from '@teamhub/hub-contracts';
import { useI18n } from '../../../i18n';
import { humanizeFormError } from '../../../utils';
import { InvPreviewTable, InvReportView } from '../InvPreviewTable';

export function InvImportSection({
  client,
  onImported,
}: {
  client: HubApiClient;
  onImported: () => void;
}) {
  const { t } = useI18n();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [preview, setPreview] = useState<InventoryPreviewResponse | null>(null);
  const [report, setReport] = useState<InventoryImportReport | null>(null);

  async function upload(file: File) {
    setPending(true);
    setError(null);
    try {
      setPreview(await client.previewInventory(file));
      setReport(null);
    } catch (err) {
      setError(err);
    } finally {
      setPending(false);
    }
  }

  async function confirm(rows: InventoryImportRow[]) {
    setPending(true);
    setError(null);
    try {
      setReport(await client.importInventoryRows(rows));
      setPreview(null);
      onImported();
    } catch (err) {
      setError(err);
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="inv-create panel" aria-label={t('inv.import.title')}>
      <header className="pm-create__head">
        <div>
          <h2>{t('inv.import.title')}</h2>
          <p className="pm-create__note">{t('inv.import.desc')}</p>
        </div>
      </header>
      <div className="roster-import__actions">
        <a className="btn btn--secondary btn--sm" href={client.inventoryTemplateUrl()} download>
          {t('inv.import.downloadTemplate')}
        </a>
        <button
          type="button"
          className="btn btn--secondary btn--sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={pending}
        >
          {pending && !preview ? t('inv.import.importing') : t('inv.import.upload')}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
            e.target.value = '';
          }}
        />
      </div>
      {error ? (
        <p className="form-hint form-hint--warn">
          {humanizeFormError(error, t, 'inv.import.error')}
        </p>
      ) : null}
      {preview ? (
        <InvPreviewTable
          preview={preview}
          pending={pending}
          onConfirm={(rows) => void confirm(rows)}
          onCancel={() => setPreview(null)}
        />
      ) : null}
      {report ? <InvReportView report={report} /> : null}
    </section>
  );
}
