import { derivePackageReview, deriveReimburseReviewReasons, type CreateReimburseEntryRequest, type ReimburseProfile, type PackageRole } from '@teamhub/hub-contracts';
import type { PackageDraft, PackageAttachment } from '../lib/package-import';
import { useI18n } from '../../../i18n';

export function ReimbursePackageReview({ data, attachments, onChange, profile, locked, request, targets = [], onSplit, onMove }: {
  data: PackageDraft; attachments: PackageAttachment[]; onChange: (next: PackageAttachment[]) => void;
  profile: ReimburseProfile; locked: boolean;
  request: CreateReimburseEntryRequest | null;
  targets?: { id: number; label: string }[];
  onSplit?: (path: string) => void;
  onMove?: (path: string, targetId: number) => void;
}) {
  const { t } = useI18n();
  const review = derivePackageReview(attachments.filter(a => a.included), profile);
  const fieldReasons = request ? deriveReimburseReviewReasons({ ...request,
    invoiceNo: request.invoiceNo ?? null, invoiceDate: request.invoiceDate ?? null,
    seller: request.seller ?? null, purchaserName: request.purchaserName ?? null,
    purchaserTaxNo: request.purchaserTaxNo ?? null }, profile) : [];
  const reasons = [...new Set([...fieldReasons, ...review.reviewReasons.filter(reason =>
    reason === 'multiple-invoices' || reason === 'ambiguous-invoices' || reason === 'amount-conflict' || reason === 'items-total-mismatch')])];
  const missing = [...review.missingMaterials.map(reason => t(`reimb.package.missing.${reason}`)),
    ...reasons.filter(reason => reason.endsWith('-missing')).map(reason => t(`reimb.package.reason.${reason}`))];
  const checks = reasons.filter(reason => !reason.endsWith('-missing') && reason !== 'manual-entry');
  const notices = data.notices.filter(notice => notice.reason !== 'ocr-unavailable');
  function preview(file: File): void {
    const url = URL.createObjectURL(file);
    window.open(url, '_blank', 'noopener,noreferrer');
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
  return <section className="reimb-package-review" aria-label={t('reimb.package.title')}>
    <p>{t('reimb.package.recognized', { value: t(`reimb.invoiceType.${review.invoiceType}`) })}</p>
    {missing.length > 0 && <p>{t('reimb.package.missing', { value: missing.join('、') })}</p>}
    {checks.length > 0 && <p>{t('reimb.package.check', { value: checks.map(reason => t(`reimb.package.reason.${reason}`)).join('；') })}</p>}
    {attachments.filter(a => a.included).length > 12 && <p role="alert">{t('reimb.package.limitExceeded')}</p>}
    {notices.length > 0 && <ul>{notices.map((notice, i) => <li key={i}>{notice.fileName.split(/[\\/]/).pop()}: {t(`reimb.package.notice.${notice.reason}`)}</li>)}</ul>}
    <details>
    <summary>{t('reimb.package.files', { count: attachments.filter(a => a.included).length })}</summary>
    {attachments.map((attachment, index) => <div className="reimb-attachment" key={index}>
      <label><input type="checkbox" checked={attachment.included} disabled={locked}
        onChange={e => onChange(attachments.map((a, i) => i === index ? { ...a, included: e.target.checked } : a))} /> <span title={attachment.path}>{attachment.path.split(/[\\/]/).pop()}</span></label>
      <select aria-label={t('reimb.package.role')} value={attachment.role === 'unknown' ? 'supporting' : attachment.role} disabled={locked || !attachment.included}
        onChange={e => onChange(attachments.map((a, i) => i === index ? { ...a, role: e.target.value as PackageRole } : a))}>
        {(['supporting', 'invoice', 'paymentShot', 'inspection'] as const).map(role => <option key={role} value={role}>{t(`reimb.package.role.${role}`)}</option>)}
      </select>
      <div className="reimb-attachment__ops">
        <button type="button" className="btn btn--sm btn--ghost" onClick={() => preview(attachment.file)}>{t('reimb.package.preview')}</button>
        {onSplit && <button type="button" className="btn btn--sm btn--ghost" disabled={locked} onClick={() => onSplit(attachment.path)}>{t('reimb.package.split')}</button>}
        {onMove && targets.length > 0 && <select aria-label={t('reimb.package.move')} value="" disabled={locked} onChange={(event) => { if (event.target.value) onMove(attachment.path, Number(event.target.value)); }}>
          <option value="">{t('reimb.package.move')}</option>
          {targets.map((target) => <option key={target.id} value={target.id}>{target.label}</option>)}
        </select>}
      </div>
    </div>)}
    </details>
  </section>;
}
