import type { InventoryLedgerRow, PartCategory } from '../../api/schemas/inv';
import { useI18n, type TranslationKey } from '../../i18n';

const CATEGORY_KEY: Record<PartCategory, TranslationKey> = {
  motor: 'inv.category.motor',
  esc: 'inv.category.esc',
  controller: 'inv.category.controller',
  mechanical: 'inv.category.mechanical',
  electronic: 'inv.category.electronic',
  other: 'inv.category.other',
};

/**
 * 库存总表：零件 × 机器人 矩阵（决定 F）。机器人列复用 SharedResource（显示 displayCode ?? name）。
 * 闲置列高亮；缺料行（idle < lowStockThreshold）标红 + 「缺料」徽章。**I0**：无任何人维度列。
 */
export function InvLedgerTable({
  ledger,
  shortfallIds,
}: {
  ledger: InventoryLedgerRow[];
  shortfallIds: Set<string>;
}) {
  const { t } = useI18n();

  if (ledger.length === 0) {
    return (
      <div className="pm-coldstart">
        <h3>{t('inv.ledger.empty.title')}</h3>
        <p>{t('inv.ledger.empty.body')}</p>
      </div>
    );
  }

  // 机器人列取自任一行的 perResource（每行同一组资源，由后端按 listResources 顺序展开）。
  const resourceCols = ledger[0]?.perResource ?? [];

  return (
    <div className="inv-table-wrap" tabIndex={0} role="region" aria-label={t('inv.ledger.title')}>
      <table className="inv-table">
        <thead>
          <tr>
            <th scope="col" className="inv-table__part">{t('inv.ledger.part')}</th>
            <th scope="col" className="inv-table__idle">{t('inv.ledger.idle')}</th>
            {resourceCols.map((c) => (
              <th scope="col" key={c.resourceId}>{c.displayCode}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ledger.map((row) => {
            const short = shortfallIds.has(row.partType.id);
            return (
              <tr key={row.partType.id} className={short ? 'inv-row--short' : undefined}>
                <td className="inv-table__part">
                  <span className="inv-part-name">{row.partType.name}</span>
                  <span className="inv-part-meta">
                    {row.partType.partNumber} · {t(CATEGORY_KEY[row.partType.category])}
                    {row.partType.trackIndividually ? (
                      <>
                        {' · '}
                        {/* 单件追踪：贵重件逐个体记血缘（电机/电调/主控）。裸 ● 含义不自解，
                            包成短标签 + abbr title 让人悬停即懂。 */}
                        <abbr className="inv-track-mark" title={t('inv.track.individual.hint')}>
                          {t('inv.track.individual.tag')}
                        </abbr>
                      </>
                    ) : null}
                  </span>
                </td>
                <td className="inv-table__idle">
                  <span className="inv-idle-value">{row.idle}</span>
                  <span className="inv-idle-total"> / {row.partType.totalQuantity}</span>
                  {short ? (
                    <span className="badge badge--alert">{t('inv.shortfall.badge')}</span>
                  ) : null}
                </td>
                {row.perResource.map((c) => (
                  <td key={c.resourceId} className="inv-cell">
                    {c.used > 0 || c.reserved > 0 ? (
                      <>
                        <span>{c.used}</span>
                        {c.reserved > 0 ? (
                          <span className="inv-reserved" title={t('inv.reserved.tooltip')}>
                            {' '}
                            (+{c.reserved})
                          </span>
                        ) : null}
                      </>
                    ) : (
                      <span className="inv-cell--zero">·</span>
                    )}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
