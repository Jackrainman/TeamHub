import { useEffect, useState, type FormEvent } from 'react';
import type { ReimburseProfile } from '@teamhub/hub-contracts';
import type { ReimburseSegment } from '../api';
import { useUpdateReimburseProfile } from '../hooks';
import { useI18n } from '../../../i18n';

/** 管理员维护购买方校验标准；两个字段均为空即明确跳过抬头校验。 */
export function ReimburseProfileSection({
  client,
  source,
  profile,
}: {
  client: ReimburseSegment;
  source: string;
  profile: ReimburseProfile;
}) {
  const { t } = useI18n();
  const [expectedPurchaserName, setExpectedPurchaserName] = useState(profile.expectedPurchaserName);
  const [expectedPurchaserTaxNo, setExpectedPurchaserTaxNo] = useState(profile.expectedPurchaserTaxNo);
  const mutation = useUpdateReimburseProfile(client, source);

  useEffect(() => {
    setExpectedPurchaserName(profile.expectedPurchaserName);
    setExpectedPurchaserTaxNo(profile.expectedPurchaserTaxNo);
  }, [profile.expectedPurchaserName, profile.expectedPurchaserTaxNo]);

  function submit(event: FormEvent) {
    event.preventDefault();
    mutation.mutate({
      expectedPurchaserName: expectedPurchaserName.trim(),
      expectedPurchaserTaxNo: expectedPurchaserTaxNo.trim(),
    });
  }

  return (
    <section className="panel" aria-label={t('reimb.profile.title')}>
      <h3>{t('reimb.profile.title')}</h3>
      <p className="pm-create__note">{t('reimb.profile.hint')}</p>
      <form className="pm-form" onSubmit={submit}>
        <div className="reimb-batch-create">
          <input
            value={expectedPurchaserName}
            aria-label={t('reimb.profile.name')}
            placeholder={t('reimb.profile.name.placeholder')}
            onChange={(event) => setExpectedPurchaserName(event.target.value)}
          />
          <input
            value={expectedPurchaserTaxNo}
            aria-label={t('reimb.profile.taxNo')}
            placeholder={t('reimb.profile.taxNo.placeholder')}
            onChange={(event) => setExpectedPurchaserTaxNo(event.target.value)}
          />
          <button className="btn btn--primary btn--sm" type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? t('reimb.profile.saving') : t('reimb.profile.save')}
          </button>
        </div>
      </form>
    </section>
  );
}
