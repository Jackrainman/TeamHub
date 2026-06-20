import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { HubApiClient } from '../../api/client';
import type { PartAction, PartActionKind } from '../../api/schemas/inv';
import { useI18n, type TranslationKey } from '../../i18n';
import { MetricTile } from '../../components/MetricTile';
import { InvLedgerTable } from './InvLedgerTable';
import { InvQuickRecordForm, type HolderOption } from './InvQuickRecordForm';

const IDLE_HOLDER = 'idle';

const KIND_KEY: Record<PartActionKind, TranslationKey> = {
  stocktake: 'inv.kind.stocktake',
  restock: 'inv.kind.restock',
  mount: 'inv.kind.mount',
  dismount: 'inv.kind.dismount',
  reserve: 'inv.kind.reserve',
  release: 'inv.kind.release',
  damage: 'inv.kind.damage',
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
