import { useEffect, useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import type { HubApiClient } from '../../api/client';
import type {
  CreatePartActionRequest,
  PartActionKind,
  PartType,
} from '../../api/schemas/inv';
import { useI18n, type TranslationKey } from '../../i18n';
import { errorDetail } from '../../utils';
import { Field } from '../../components/Field';

const IDLE_HOLDER = 'idle';

const KINDS: PartActionKind[] = [
  'damage',
  'mount',
  'dismount',
  'reserve',
  'release',
  'restock',
  'stocktake',
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

/** 装/拆/预留/释放需指定一台机器人（toHolder/fromHolder=resourceId）；盘点/补料/损坏只动总数。 */
function needsHolder(kind: PartActionKind): boolean {
  return kind === 'mount' || kind === 'dismount' || kind === 'reserve' || kind === 'release';
}

export interface HolderOption {
  id: string;
  label: string;
}

/**
 * 一句话快记（决定 D/E/F + §5③）：选零件 + 动作 + 数量（+ 机器人）+ 备注 → POST /api/inventory/actions。
 * server 钉 source=human（C5；I0 绝无 memberId）。Hermes 将来调同一接口自动填。
 */
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
  const [partTypeId, setPartTypeId] = useState(partTypes[0]?.id ?? '');
  const [kind, setKind] = useState<PartActionKind>('damage');
  const [quantity, setQuantity] = useState('1');
  const [holder, setHolder] = useState(holderOptions[0]?.id ?? IDLE_HOLDER);
  const [note, setNote] = useState('');

  // 冷启动：partTypes / holderOptions 初次为空 → 重填后同步缺省（不覆盖用户已选）。
  useEffect(() => {
    if (!partTypeId && partTypes[0]) setPartTypeId(partTypes[0].id);
  }, [partTypes, partTypeId]);

  const mutation = useMutation({
    mutationFn: (req: CreatePartActionRequest) => client.recordPartAction(req),
    onSuccess: () => {
      setNote('');
      setQuantity('1');
      onRecorded();
    },
  });

  const project = partTypes.find((p) => p.id === partTypeId);
  const qty = Number.parseInt(quantity, 10);
  const valid = Boolean(project) && Number.isInteger(qty) && qty >= 1;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!valid || !project) return;
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
  }

  return (
    <section className="inv-record panel" aria-label={t('inv.record.title')}>
      <header className="pm-create__head">
        <div>
          <h2>{t('inv.record.title')}</h2>
          <p className="pm-create__note">{t('inv.record.subtitle')}</p>
        </div>
      </header>
      <form className="pm-form" onSubmit={submit}>
        <div className="pm-form__grid">
          <Field label={t('inv.record.field.partType')}>
            <select value={partTypeId} onChange={(e) => setPartTypeId(e.target.value)}>
              {partTypes.map((p) => (
                <option value={p.id} key={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('inv.record.field.kind')}>
            <select value={kind} onChange={(e) => setKind(e.target.value as PartActionKind)}>
              {KINDS.map((k) => (
                <option value={k} key={k}>
                  {t(KIND_KEY[k])}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="pm-form__grid">
          <Field label={t('inv.record.field.quantity')}>
            <input
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </Field>
          {needsHolder(kind) ? (
            <Field label={t('inv.record.field.holder')}>
              <select value={holder} onChange={(e) => setHolder(e.target.value)}>
                {holderOptions.map((h) => (
                  <option value={h.id} key={h.id}>
                    {h.label}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}
        </div>
        <Field label={t('inv.record.field.note')}>
          <input value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <div className="pm-form__footer">
          <button className="kb-submit" type="submit" disabled={!valid || mutation.isPending}>
            {mutation.isPending ? t('inv.record.submitting') : t('inv.record.submit')}
          </button>
          {mutation.isSuccess ? (
            <p className="form-banner form-banner--ok">{t('inv.record.success')}</p>
          ) : null}
          {mutation.error ? (
            <p className="form-banner form-banner--err">
              {t('inv.record.error', { detail: errorDetail(mutation.error) })}
            </p>
          ) : null}
        </div>
      </form>
    </section>
  );
}
