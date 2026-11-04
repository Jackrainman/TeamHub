import { derivePackageReview, type ReimburseProfile, type PackageRole } from '@teamhub/hub-contracts';
import type { PackageDraft, PackageAttachment } from '../lib/package-import';
import { useI18n } from '../../../i18n';

export function ReimbursePackageReview({ data, attachments, onChange, profile, locked }: {
  data: PackageDraft; attachments: PackageAttachment[]; onChange: (next: PackageAttachment[]) => void;
  profile: ReimburseProfile; locked: boolean;
}) {
  const { t } = useI18n();
  const review = derivePackageReview(attachments.filter(a => a.included), profile);
  return <section className="card" aria-label={t('reimb.package.title')}>
    <h3>{t('reimb.package.title')}</h3>
    <p>{t('reimb.package.local')}</p>
    <p>{t('reimb.package.type')}: {t(`reimb.invoiceType.${review.invoiceType}`)}</p>
    <ul>{review.missingMaterials.map(reason => <li key={reason}>{t(`reimb.package.missing.${reason}`)}</li>)}</ul>
    <ul>{review.reviewReasons.map(reason => <li key={reason}>{t(`reimb.package.reason.${reason}`)}</li>)}</ul>
    <ul>{data.notices.map((notice, i) => <li key={i}>{notice.fileName}: {t(`reimb.package.notice.${notice.reason}`)}</li>)}</ul>
    <p>{t('reimb.package.limit')}</p>
    {attachments.map((attachment, index) => <div className="domain-actions" key={index}>
      <label><input type="checkbox" checked={attachment.included} disabled={locked}
        onChange={e => onChange(attachments.map((a, i) => i === index ? { ...a, included: e.target.checked } : a))} /> {attachment.path}</label>
      <select aria-label={t('reimb.package.role')} value={attachment.role} disabled={locked || !attachment.included}
        onChange={e => onChange(attachments.map((a, i) => i === index ? { ...a, role: e.target.value as PackageRole } : a))}>
        {(['unknown', 'invoice', 'paymentShot', 'inspection'] as const).map(role => <option key={role} value={role}>{t(`reimb.package.role.${role}`)}</option>)}
      </select>
    </div>)}
  </section>;
}
