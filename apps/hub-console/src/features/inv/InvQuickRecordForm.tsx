import { useEffect, useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import type { HubApiClient } from '../../api/client';
import type {
  CreatePartActionRequest,
  PartActionKind,
  PartType,
} from '../../api/schemas/inv';
import { useI18n, type TranslationKey } from '../../i18n';
import { humanizeFormError } from '../../utils';
import { Field } from '../../components/Field';
import { FormActions } from '../../components/FormActions';
import { FormGrid } from '../../components/FormGrid';
import { Select } from '../../components/Select';

const IDLE_HOLDER = 'idle';

// 顺序即引导（与空态「先盘点建底」一致）：盘点 / 补料 这类「建底 / 进货」动作提前，
// damage 等日常消耗动作往后；冷启动默认选 stocktake（见 initialKind）。
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

/** 装/拆/预留/释放需指定一台机器人（toHolder/fromHolder=resourceId）；盘点/补料/损坏只动总数。 */
function needsHolder(kind: PartActionKind): boolean {
  return kind === 'mount' || kind === 'dismount' || kind === 'reserve' || kind === 'release';
}

/**
 * 冷启动判定：没有任何零件、或所有零件都还没盘点过（lastCountedAt 全空）。
 * 此时默认动作选 stocktake，引导「先盘点建底」；否则保留日常主路径 damage。
 */
function coldStart(partTypes: PartType[]): boolean {
  return partTypes.length === 0 || partTypes.every((p) => p.lastCountedAt == null);
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
  // 冷启动（无零件 / 无盘点史）默认 stocktake 引导建底；有底后默认日常主路径 damage。
  const [kind, setKind] = useState<PartActionKind>(() =>
    coldStart(partTypes) ? 'stocktake' : 'damage',
  );
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

  // 数量字段语义随动作切换：盘点填「当前实际总数」，其余动作填「本次数量」（增减/装拆的这一笔）。
  const isStocktake = kind === 'stocktake';
  const quantityLabel = isStocktake
    ? t('inv.record.field.quantity.stocktakeLabel')
    : t('inv.record.field.quantity');
  const quantityPlaceholder = isStocktake
    ? t('inv.record.field.quantity.stocktakePlaceholder')
    : t('inv.record.field.quantity.placeholder');

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
        <FormGrid>
          <Field label={t('inv.record.field.partType')} required>
            {/* 零件下拉文案是各零件 name，非枚举键映射 → renderOption 回查 name。 */}
            <Select
              value={partTypeId}
              onChange={setPartTypeId}
              options={partTypes.map((p) => p.id)}
              renderOption={(id) => partTypes.find((p) => p.id === id)?.name ?? id}
            />
          </Field>
          <Field label={t('inv.record.field.kind')}>
            <Select
              value={kind}
              onChange={setKind}
              options={KINDS}
              renderOption={(k) => t(KIND_KEY[k])}
            />
          </Field>
        </FormGrid>
        {/* 密度：需要机器人时本行 = 数量 + 机器人、备注独占下一行；不需要时把备注并到本行
            第二格，避免数量行半空 + 备注空占整行。 */}
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
              onChange={(e) => setQuantity(e.target.value)}
            />
          </Field>
          {needsHolder(kind) ? (
            <Field label={t('inv.record.field.holder')}>
              {/* holder 是已知货架/机器人的固定枚举（提交映射为 resourceId，手填会失效）→ Select 非 Combobox。
                  下拉文案是 holderOption.label → renderOption 回查 label。 */}
              <Select
                value={holder}
                onChange={setHolder}
                options={holderOptions.map((h) => h.id)}
                renderOption={(id) => holderOptions.find((h) => h.id === id)?.label ?? id}
              />
            </Field>
          ) : (
            <Field label={t('inv.record.field.note')}>
              <input value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
          )}
        </FormGrid>
        {needsHolder(kind) ? (
          <Field label={t('inv.record.field.note')}>
            <input value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        ) : null}
        <FormActions
          submitLabel={t('inv.record.submit')}
          submittingLabel={t('inv.record.submitting')}
          submitting={mutation.isPending}
          disabled={!valid}
          error={
            mutation.error
              ? humanizeFormError(mutation.error, t, 'inv.record.error')
              : null
          }
          success={mutation.isSuccess ? t('inv.record.success') : null}
        />
      </form>
    </section>
  );
}
