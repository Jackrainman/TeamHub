import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type {
  InventoryImportReport,
  InventoryImportRow,
  InventoryPreviewResponse,
} from '@teamhub/hub-contracts';
import type { HubApiClient } from '../../api/client';
import { useI18n } from '../../i18n';
import { humanizeFormError } from '../../utils';
import { InvPreviewTable, InvReportView } from '../inv/InvPreviewTable';
import { HaveDataChips } from './HaveDataChips';

// ⑥ 录入库存（INV-BULK-IMPORT 刀⑪，结构照 RosterStep 刀⑦）：模板下载 + 上传 → preview 只解析不落库
// → InvPreviewTable 行内编辑（件号只读 = 幂等匹配键）→ 确认后 JSON 导入（partNumber 幂等 upsert、
// totalQuantity 覆盖、绝不删）→ 报告回显；没有库存要录可直接「跳过」。
export function InventoryStep({
  client,
  onNext,
}: {
  client: HubApiClient;
  onNext: (fact?: string) => void;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  // ONBOARD-QA chips 分支：null=未答（先问有没有现成库存表）；true=展开上传；「没有」直接下一题。
  const [hasData, setHasData] = useState<boolean | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [preview, setPreview] = useState<InventoryPreviewResponse | null>(null);
  const [report, setReport] = useState<InventoryImportReport | null>(null);

  async function upload(file: File) {
    setPending(true);
    setError(null);
    try {
      setPreview(await client.previewInventory(file));
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
      void queryClient.invalidateQueries({ queryKey: ['inventory'] });
    } catch (err) {
      setError(err);
    } finally {
      setPending(false);
    }
  }

  if (hasData === null) {
    return (
      <section className="setup-card setup-card--primary">
        <h2 className="setup-card__title">{t('gate.step.inventory')}</h2>
        <p className="setup-card__desc">{t('gate.inv.desc')}</p>
        <HaveDataChips
          questionKey="gate.qa.haveInventory"
          onHave={() => setHasData(true)}
          onLater={() => onNext(t('gate.rail.laterGeneric'))}
        />
      </section>
    );
  }

  return (
    <section className="setup-card setup-card--primary">
      <h2 className="setup-card__title">{t('gate.step.inventory')}</h2>
      <p className="setup-card__desc">{t('gate.inv.desc')}</p>
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
      <button
        type="button"
        className="btn btn--primary"
        onClick={() =>
          onNext(
            report
              ? t('gate.rail.invDone', {
                  n: report.created.length + report.updated.length,
                })
              : undefined,
          )
        }
      >
        {report ? t('gate.inv.next') : t('gate.inv.skip')}
      </button>
    </section>
  );
}
