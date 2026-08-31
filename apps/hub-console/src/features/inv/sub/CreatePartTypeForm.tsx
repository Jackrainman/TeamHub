import { useState, type FormEvent } from 'react';
import type { HubApiClient } from '../../../api/client';
import type { PartCategory } from '@teamhub/hub-contracts';
import { useUpsertPartType } from '../hooks';
import { useI18n, type TranslationKey } from '../../../i18n';
import { humanizeFormError } from '../../../utils';
import { Field } from '../../../components/Field';
import { FormActions } from '../../../components/FormActions';
import { FormGrid } from '../../../components/FormGrid';
import { Select } from '../../../components/Select';
import { SegToggle } from '../../../components/SegToggle';

const CATEGORIES: PartCategory[] = [
  'motor',
  'esc',
  'controller',
  'mechanical',
  'electronic',
  'other',
];

const CATEGORY_OPTION_KEY: Record<PartCategory, TranslationKey> = {
  motor: 'inv.catopt.motor',
  esc: 'inv.catopt.esc',
  controller: 'inv.catopt.controller',
  mechanical: 'inv.catopt.mechanical',
  electronic: 'inv.catopt.electronic',
  other: 'inv.catopt.other',
};

export function CreatePartTypeForm({
  client,
  source,
  defaultProjectId,
}: {
  client: HubApiClient;
  source: string;
  defaultProjectId: string;
}) {
  const { t } = useI18n();
  const [partNumber, setPartNumber] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState<PartCategory>('mechanical');
  const [unit, setUnit] = useState('个');
  const [totalQuantity, setTotalQuantity] = useState('0');
  const [lowStockThreshold, setLowStockThreshold] = useState('0');
  const [trackIndividually, setTrackIndividually] = useState(false);

  const mutation = useUpsertPartType(client, source, () => {
    setPartNumber('');
    setName('');
    setTotalQuantity('0');
    setLowStockThreshold('0');
    setTrackIndividually(false);
  });

  const total = Number.parseInt(totalQuantity, 10);
  const low = Number.parseInt(lowStockThreshold, 10);
  const valid =
    partNumber.trim().length > 0 &&
    name.trim().length > 0 &&
    unit.trim().length > 0 &&
    Number.isInteger(total) &&
    total >= 0 &&
    Number.isInteger(low) &&
    low >= 0;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!valid) return;
    mutation.mutate({
      projectId: defaultProjectId,
      partNumber: partNumber.trim(),
      name: name.trim(),
      category,
      unit: unit.trim(),
      trackIndividually,
      totalQuantity: total,
      allocations: [],
      lowStockThreshold: low,
    });
  }

  return (
    <section className="panel" aria-label={t('inv.create.title')}>
      <header className="pm-create__head">
        <div>
          <h2>{t('inv.create.title')}</h2>
          <p className="pm-create__note">{t('inv.create.subtitle')}</p>
        </div>
      </header>
      <form className="pm-form" onSubmit={submit}>
        <FormGrid>
          <Field label={t('inv.create.field.partNumber')} required>
            <input
              value={partNumber}
              placeholder={t('inv.create.field.partNumberPlaceholder')}
              onChange={(e) => setPartNumber(e.target.value)}
            />
          </Field>
          <Field label={t('inv.create.field.name')} required>
            <input
              value={name}
              placeholder={t('inv.create.field.namePlaceholder')}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
        </FormGrid>
        <FormGrid>
          <Field label={t('inv.create.field.category')}>
            <Select
              value={category}
              onChange={setCategory}
              options={CATEGORIES}
              renderOption={(c) => t(CATEGORY_OPTION_KEY[c])}
            />
          </Field>
          <Field label={t('inv.create.field.unit')} className="kb-field--narrow" required>
            <input
              value={unit}
              placeholder={t('inv.create.field.unitPlaceholder')}
              onChange={(e) => setUnit(e.target.value)}
            />
          </Field>
        </FormGrid>
        <FormGrid>
          <Field label={t('inv.create.field.totalQuantity')} required>
            <input
              type="number"
              min={0}
              value={totalQuantity}
              onChange={(e) => setTotalQuantity(e.target.value)}
            />
          </Field>
          <Field label={t('inv.create.field.lowStockThreshold')} required>
            <input
              type="number"
              min={0}
              value={lowStockThreshold}
              onChange={(e) => setLowStockThreshold(e.target.value)}
            />
          </Field>
        </FormGrid>
        <FormGrid>
          <Field label={t('inv.create.field.track')} className="span-all">
            <SegToggle<boolean>
              value={trackIndividually}
              onChange={setTrackIndividually}
              ariaLabel={t('inv.create.field.track')}
              options={[
                { value: false, label: t('inv.create.track.bulk') },
                { value: true, label: t('inv.create.track.individual') },
              ]}
            />
          </Field>
        </FormGrid>
        <FormActions
          submitLabel={t('inv.create.submit')}
          submittingLabel={t('inv.create.submitting')}
          submitting={mutation.isPending}
          disabled={!valid}
          error={
            mutation.error
              ? humanizeFormError(mutation.error, t, 'inv.create.error')
              : null
          }
          success={
            mutation.isSuccess
              ? t('inv.create.success', { name: mutation.data.partType.name })
              : null
          }
        />
      </form>
    </section>
  );
}
