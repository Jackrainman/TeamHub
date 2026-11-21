import { useState } from 'react';
import { FileText, Maximize2 } from 'lucide-react';
import type { ReimburseImportFile, ReimburseImportJob, ReimburseImportPair } from '@teamhub/hub-contracts';
import { ReimbursePdfCanvas } from './ReimbursePdfCanvas';
import { ReimburseImportViewer } from './ReimburseImportViewer';

function canRender(file: ReimburseImportFile): boolean {
  return ['.pdf', '.png', '.jpg', '.jpeg'].includes(file.ext.toLowerCase());
}

export function ReimburseImportPreview({
  job,
  pair,
  contentUrl,
}: {
  job: ReimburseImportJob;
  pair: ReimburseImportPair;
  contentUrl: (jobId: string, fileId: string) => string;
}) {
  const [viewing, setViewing] = useState<ReimburseImportFile | null>(null);
  const active = job.files.filter(file => pair.fileIds.includes(file.id) && file.status !== 'removed' && file.status !== 'duplicate');
  const items = [
    { role: 'invoice' as const, label: '发票', ids: pair.invoiceFileIds },
    { role: 'paymentShot' as const, label: '付款截图', ids: pair.paymentFileIds },
  ].flatMap(group => group.ids.map(id => {
    const file = active.find(item => item.id === id);
    return file ? { ...group, file } : null;
  })).filter((item): item is { role: 'invoice' | 'paymentShot'; label: string; ids: string[]; file: ReimburseImportFile } => item !== null);

  return <section className="reimb-import-review__preview" aria-label="原件预览">
    <header className="reimb-preview__head">
      <div><h3>原件核对</h3><p>两张原件并排看，点击缩略图放大核对。</p></div>
      <small>{items.length} 份</small>
    </header>
    <div className="reimb-preview__cards">
      {items.map(({ file, label }) => <button
        type="button"
        className="reimb-preview-card"
        key={file.id}
        disabled={!canRender(file)}
        aria-label={`放大查看${label}：${file.displayName}`}
        onClick={() => setViewing(file)}
      >
        <span className="reimb-preview-card__media">
          {file.ext.toLowerCase() === '.pdf' ? <ReimbursePdfCanvas url={contentUrl(job.id, file.id)} label={`${label}首页缩略图`} />
            : canRender(file) ? <img src={contentUrl(job.id, file.id)} alt={`${label}缩略图：${file.displayName}`} />
              : <span className="reimb-preview-card__unsupported"><FileText size={32} /><span>{file.ext.toUpperCase()} 原件</span></span>}
        </span>
        <span className="reimb-preview-card__meta">
          <span className={`reimb-preview-card__role reimb-preview-card__role--${file.role}`}>{label}</span>
          <span className="reimb-preview-card__name">{file.displayName}</span>
          {canRender(file) && <Maximize2 size={15} aria-hidden="true" />}
        </span>
      </button>)}
      {items.length === 0 && <p className="reimb-import-pool__empty">没有可预览的配对原件。</p>}
    </div>
    {viewing && <ReimburseImportViewer
      key={viewing.id}
      file={viewing}
      url={contentUrl(job.id, viewing.id)}
      roleLabel={viewing.role === 'invoice' ? '发票' : '付款截图'}
      onClose={() => setViewing(null)}
      returnFocus={() => document.querySelector<HTMLInputElement>('.reimb-entry-form--review input:not(:disabled)')}
    />}
  </section>;
}
