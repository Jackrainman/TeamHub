import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import type { HubApiClient } from '../../api/client';
import type {
  PartAction,
  PartActionKind,
  PartCategory,
  CreatePartTypeRequest,
} from '../../api/schemas/inv';
import { useI18n, type TranslationKey } from '../../i18n';
import { errorDetail } from '../../utils';
import { Field } from '../../components/Field';
import { FormActions } from '../../components/FormActions';
import { FormGrid } from '../../components/FormGrid';
import { Select } from '../../components/Select';
import { SegToggle } from '../../components/SegToggle';
import { MetricTile } from '../../components/MetricTile';
import { InvLedgerTable } from './InvLedgerTable';
import { InvQuickRecordForm, type HolderOption } from './InvQuickRecordForm';

const IDLE_HOLDER = 'idle';

// 新建零件归属的项目：与种子整机 / 机器人队页（ResourcesPage）同口径用 prj-robots，
// 库存录入不暴露项目维度。有既有零件时优先沿用其 projectId（同库同项目）。
// TODO(backend): 理想是 server 端按当前队伍/默认项目兜底 projectId，console 不该硬编码常量。
const DEFAULT_PROJECT_ID = 'prj-robots';

const KIND_KEY: Record<PartActionKind, TranslationKey> = {
  stocktake: 'inv.kind.stocktake',
  restock: 'inv.kind.restock',
  mount: 'inv.kind.mount',
  dismount: 'inv.kind.dismount',
  reserve: 'inv.kind.reserve',
  release: 'inv.kind.release',
  damage: 'inv.kind.damage',
};

const CATEGORIES: PartCategory[] = [
  'motor',
  'esc',
  'controller',
  'mechanical',
  'electronic',
  'other',
];

// 类目下拉文案：带中文说明更可读（枚举值不变，仅 option 展示更自解）。
const CATEGORY_OPTION_KEY: Record<PartCategory, TranslationKey> = {
  motor: 'inv.catopt.motor',
  esc: 'inv.catopt.esc',
  controller: 'inv.catopt.controller',
  mechanical: 'inv.catopt.mechanical',
  electronic: 'inv.catopt.electronic',
  other: 'inv.catopt.other',
};

/**
 * 库存 / BOM 第三支柱页（INV-BOM-CORE）。汇总 + 一句话快记 + 零件×机器人 矩阵 + 拆装记账历史。
 * 反监视纪律（I0）：全页主键是零件 / 机器人 / 动作，永不渲染 memberId / 按人聚合——动作只显来源（human/hermes…）。
 */
export function InvPage({
  client,
  source,
}: {
  client: HubApiClient;
  source: string;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['inventory', source],
    queryFn: () => client.getInventory(),
  });

  if (query.isLoading) {
    return (
      <div className="state-band" role="status" aria-live="polite">
        {t('inv.loading')}
      </div>
    );
  }
  if (query.error || !query.data) {
    return (
      <div className="state-band state-band-error" role="alert">
        {t('inv.error')}
      </div>
    );
  }

  const { partTypes, ledger, shortfalls, trackedParts } = query.data;
  void trackedParts; // 个体件血缘当前不单列渲染（矩阵已含其计数）；保留读取以备后续血缘视图。
  const shortfallIds = new Set(shortfalls.map((p) => p.id));

  // 机器人 / 货架选项：货架（idle）+ 矩阵任一行的机器人列（displayCode）。
  const holderOptions: HolderOption[] = [
    { id: IDLE_HOLDER, label: t('inv.holder.idle') },
    ...(ledger[0]?.perResource ?? []).map((c) => ({
      id: c.resourceId,
      label: c.displayCode,
    })),
  ];

  const refresh = () =>
    void queryClient.invalidateQueries({ queryKey: ['inventory', source] });

  return (
    <div className="inv-page">
      <p className="gaps-intro">{t('inv.intro')}</p>

      <section className="inv-summary" aria-label={t('inv.summary.partTypes')}>
        <MetricTile label={t('inv.summary.partTypes')} value={String(partTypes.length)} />
        <MetricTile
          label={t('inv.summary.shortfalls')}
          value={String(shortfalls.length)}
          accent={shortfalls.length > 0 ? 'red' : undefined}
        />
      </section>

      <CreatePartTypeForm
        client={client}
        defaultProjectId={partTypes[0]?.projectId ?? DEFAULT_PROJECT_ID}
        onCreated={refresh}
      />

      <InvQuickRecordForm
        client={client}
        partTypes={partTypes}
        holderOptions={holderOptions}
        onRecorded={refresh}
      />

      <section className="panel" aria-label={t('inv.ledger.title')}>
        <h2 className="inv-section-title">{t('inv.ledger.title')}</h2>
        <InvLedgerTable ledger={ledger} shortfallIds={shortfallIds} />
      </section>

      <ActionHistory
        actions={query.data.actions}
        partTypeName={nameLookup(partTypes)}
        kindKey={KIND_KEY}
      />
    </div>
  );
}

// --- 新增零件 --------------------------------------------------------------

/**
 * 新增零件（建底前置）：填编号 / 名称 / 类目 / 单位 / 初始数量 / 缺料阈值 / 是否单件追踪
 * → POST /api/inventory/part-types（client.upsertPartType，无 id 即创建）。
 * 反监视纪律（I0）：零件维度本就无成员字段，表单不收集 / 不展示任何人维度。
 */
function CreatePartTypeForm({
  client,
  defaultProjectId,
  onCreated,
}: {
  client: HubApiClient;
  defaultProjectId: string;
  onCreated: () => void;
}) {
  const { t } = useI18n();
  const [partNumber, setPartNumber] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState<PartCategory>('mechanical');
  const [unit, setUnit] = useState('个');
  const [totalQuantity, setTotalQuantity] = useState('0');
  const [lowStockThreshold, setLowStockThreshold] = useState('0');
  const [trackIndividually, setTrackIndividually] = useState(false);

  const mutation = useMutation({
    mutationFn: (req: CreatePartTypeRequest) => client.upsertPartType(req),
    onSuccess: () => {
      setPartNumber('');
      setName('');
      setTotalQuantity('0');
      setLowStockThreshold('0');
      setTrackIndividually(false);
      onCreated();
    },
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
      allocations: [], // 新建零件无机器人占用，矩阵从空起；装机后由动作日志派生。
      lowStockThreshold: low,
    });
  }

  return (
    <section className="inv-create panel" aria-label={t('inv.create.title')}>
      <header className="pm-create__head">
        <div>
          <h2>{t('inv.create.title')}</h2>
          <p className="pm-create__note">{t('inv.create.subtitle')}</p>
        </div>
      </header>
      <form className="pm-form" onSubmit={submit}>
        <FormGrid>
          <Field label={t('inv.create.field.partNumber')}>
            <input
              value={partNumber}
              placeholder={t('inv.create.field.partNumberPlaceholder')}
              onChange={(e) => setPartNumber(e.target.value)}
            />
          </Field>
          <Field label={t('inv.create.field.name')}>
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
          <Field label={t('inv.create.field.unit')} className="kb-field--narrow">
            <input
              value={unit}
              placeholder={t('inv.create.field.unitPlaceholder')}
              onChange={(e) => setUnit(e.target.value)}
            />
          </Field>
        </FormGrid>
        <FormGrid>
          <Field label={t('inv.create.field.totalQuantity')}>
            <input
              type="number"
              min={0}
              value={totalQuantity}
              onChange={(e) => setTotalQuantity(e.target.value)}
            />
          </Field>
          <Field label={t('inv.create.field.lowStockThreshold')}>
            <input
              type="number"
              min={0}
              value={lowStockThreshold}
              onChange={(e) => setLowStockThreshold(e.target.value)}
            />
          </Field>
        </FormGrid>
        {/* 追踪粒度独占整行（FormGrid + span-all）。*/}
        <FormGrid>
          <Field label={t('inv.create.field.track')} className="span-all">
            {/* 是否单件追踪：贵重件（电机/电调/主控）逐个体记血缘；琐碎件不建实例。
                行为原样保留（陷阱 A）：默认 trackIndividually=false → bulk 高亮；
                点 individual → true、individual 高亮。active 由 value===option.value 统一管，
                不再各写镜像三元。 */}
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
              ? t('inv.create.error', { detail: errorDetail(mutation.error) })
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

function nameLookup(
  partTypes: { id: string; name: string }[],
): (id: string) => string {
  const map = new Map(partTypes.map((p) => [p.id, p.name]));
  return (id: string) => map.get(id) ?? id;
}

function ActionHistory({
  actions,
  partTypeName,
  kindKey,
}: {
  actions: PartAction[];
  partTypeName: (id: string) => string;
  kindKey: Record<PartActionKind, TranslationKey>;
}) {
  const { t } = useI18n();
  const desc = [...actions].reverse();
  return (
    <section className="panel" aria-label={t('inv.history.title')}>
      <h2 className="inv-section-title">{t('inv.history.title')}</h2>
      {desc.length === 0 ? (
        <p className="inv-history-empty">{t('inv.history.empty')}</p>
      ) : (
        <ul className="inv-history">
          {desc.map((a) => (
            <li key={a.id} className="inv-history__item">
              <span className={`inv-kind-badge inv-kind-badge--${a.kind}`}>
                {t(kindKey[a.kind])}
              </span>
              <span className="inv-history__part">{partTypeName(a.partTypeId)}</span>
              <span className="inv-history__qty">×{Math.abs(a.quantityDelta)}</span>
              {a.note ? <span className="inv-history__note">{a.note}</span> : null}
              <span className="inv-history__src">{a.recordedBy.source}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
