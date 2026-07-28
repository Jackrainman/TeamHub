import { useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import type { HubApiClient } from '../../api/client';
import type {
  CreatePartActionRequest,
  PartActionKind,
  PartType,
} from '../../api/schemas/inv';
import { useI18n, type TranslationKey } from '../../i18n';
import { useForm } from '../../hooks/useForm';
import { formActionsProps } from '../../hooks/useFormActions';
import { Field } from '../../components/Field';
import { FormActions } from '../../components/FormActions';
import { FormGrid } from '../../components/FormGrid';
import { Select } from '../../components/Select';

const IDLE_HOLDER = 'idle';

const KINDS: PartActionKind[] = [
  'stocktake',
  'restock',
  'mount',
  'dismount',
  'reserve',
  'release',
  'damage',
];

const KIND_KEY: Record<PartActionKind, TranslationKey> = {
  stocktake: 'inv.kind.stocktake',
  restock: 'inv.kind.restock',
  mount: 'inv.kind.mount',
  dismount: 'inv.kind.dismount',
  reserve: 'inv.kind.reserve',
  release: 'inv.kind.release',
  damage: 'inv.kind.damage',
};

function needsHolder(kind: PartActionKind): boolean {
  return kind === 'mount' || kind === 'dismount' || kind === 'reserve' || kind === 'release';
}

function coldStart(partTypes: PartType[]): boolean {
  return partTypes.length === 0 || partTypes.every((p) => p.lastCountedAt == null);
}

export interface HolderOption {
  id: string;
  label: string;
}

interface InvFormFields {
  partTypeId: string;
  kind: PartActionKind;
  quantity: string;
  holder: string;
  note: string;
}

export function InvQuickRecordForm({
  client,
  partTypes,
  holderOptions,
  onRecorded,
}: {
  client: HubApiClient;
  partTypes: PartType[];
  holderOptions: HolderOption[];
  onRecorded: () => void;
}) {
  const { t } = useI18n();

  const form = useForm<InvFormFields>({
    fields: {
      partTypeId: { initial: partTypes[0]?.id ?? '', sticky: true },
      kind: { initial: coldStart(partTypes) ? 'stocktake' : 'damage', sticky: true },
      quantity: { initial: '1' },
      holder: { initial: holderOptions[0]?.id ?? IDLE_HOLDER, sticky: true },
      note: { initial: '' },
    },
    valid: (v) => {
      const qty = Number.parseInt(v.quantity, 10);
      return Boolean(partTypes.find((p) => p.id === v.partTypeId)) && Number.isInteger(qty) && qty >= 1;
    },
  });

  useEffect(() => {
    if (!form.values.partTypeId && partTypes[0]) {
      form.patch({ partTypeId: partTypes[0].id });
    }
  }, [partTypes, form.values.partTypeId, form.patch]);

  const mutation = useMutation({
    mutationFn: (req: CreatePartActionRequest) => client.recordPartAction(req),
    onSuccess: () => {
      form.resetAfterSubmit();
      onRecorded();
    },
  });

  const { partTypeId, kind, quantity, holder, note } = form.values;
  const project = partTypes.find((p) => p.id === partTypeId);
  const qty = Number.parseInt(quantity, 10);

  const isStocktake = kind === 'stocktake';
  const quantityLabel = isStocktake
    ? t('inv.record.field.quantity.stocktakeLabel')
    : t('inv.record.field.quantity');
  const quantityPlaceholder = isStocktake
    ? t('inv.record.field.quantity.stocktakePlaceholder')
    : t('inv.record.field.quantity.placeholder');

  return (
    <section className="inv-record panel" aria-label={t('inv.record.title')}>
      <header className="pm-create__head">
        <div>
          <h2>{t('inv.record.title')}</h2>
          <p className="pm-create__note">{t('inv.record.subtitle')}</p>
        </div>
      </header>
      <form
        className="pm-form"
        onSubmit={form.handleSubmit(() => {
          if (!project) return;
          let fromHolder: string | null = null;
          let toHolder: string | null = null;
          if (kind === 'mount') {
            fromHolder = IDLE_HOLDER;
            toHolder = holder;
          } else if (kind === 'dismount') {
            fromHolder = holder;
            toHolder = IDLE_HOLDER;
          } else if (kind === 'reserve' || kind === 'release') {
            toHolder = holder;
          }
          mutation.mutate({
            projectId: project.projectId,
            partTypeId: project.id,
            trackedPartId: null,
            kind,
            quantityDelta: qty,
            fromHolder,
            toHolder,
            note: note.trim() || null,
          });
        })}
      >
        <FormGrid>
          <Field label={t('inv.record.field.partType')} required>
            <Select
              value={partTypeId}
              onChange={(v) => form.set('partTypeId', v)}
              options={partTypes.map((p) => p.id)}
              renderOption={(id) => partTypes.find((p) => p.id === id)?.name ?? id}
            />
          </Field>
          <Field label={t('inv.record.field.kind')}>
            <Select
              value={kind}
              onChange={(v) => form.set('kind', v)}
              options={KINDS}
              renderOption={(k) => t(KIND_KEY[k])}
            />
          </Field>
        </FormGrid>
        <FormGrid>
          <Field
            label={quantityLabel}
            required
            hint={isStocktake ? t('inv.record.field.quantity.stocktakeHint') : undefined}
          >
            <input
              type="number"
              min={1}
              value={quantity}
              placeholder={quantityPlaceholder}
              onChange={(e) => form.set('quantity', e.target.value)}
            />
          </Field>
          {needsHolder(kind) ? (
            <Field label={t('inv.record.field.holder')}>
              <Select
                value={holder}
                onChange={(v) => form.set('holder', v)}
                options={holderOptions.map((h) => h.id)}
                renderOption={(id) => holderOptions.find((h) => h.id === id)?.label ?? id}
              />
            </Field>
          ) : (
            <Field label={t('inv.record.field.note')}>
              <input value={note} onChange={(e) => form.set('note', e.target.value)} />
            </Field>
          )}
        </FormGrid>
        {needsHolder(kind) ? (
          <Field label={t('inv.record.field.note')}>
            <input value={note} onChange={(e) => form.set('note', e.target.value)} />
          </Field>
        ) : null}
        <FormActions
          {...formActionsProps(mutation, {
            submitLabel: t('inv.record.submit'),
            submittingLabel: t('inv.record.submitting'),
            valid: form.valid,
            t,
            errorFallbackKey: 'inv.record.error',
            successMessage: mutation.isSuccess ? t('inv.record.success') : null,
          })}
        />
      </form>
    </section>
  );
}
