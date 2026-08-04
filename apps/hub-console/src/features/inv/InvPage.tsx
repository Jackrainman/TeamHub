import { useQueryClient } from '@tanstack/react-query';
import { EmptyState } from '../../shared/EmptyState';
import { useQueryGuard } from '../../shared/QueryGate';
import { useInventory } from '../../hooks/useInventory';
import type { HubApiClient } from '../../api/client';
import type { PartAction, PartActionKind } from '../../api/schemas/inv';
import { useI18n, type TranslationKey } from '../../i18n';
import { MetricTile } from '../../components/MetricTile';
import { InvLedgerTable } from './InvLedgerTable';
import { InvQuickRecordForm, type HolderOption } from './InvQuickRecordForm';
import { CreatePartTypeForm } from './sub/CreatePartTypeForm';
import { InvImportSection } from './sub/InvImportSection';

const IDLE_HOLDER = 'idle';

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

function kindTone(kind: PartActionKind): string {
  switch (kind) {
    case 'damage':
      return 'badge--red';
    case 'mount':
    case 'dismount':
      return 'badge--green';
    case 'reserve':
    case 'release':
      return 'badge--amber';
    case 'stocktake':
    case 'restock':
      return 'badge--blue';
    default:
      return '';
  }
}

function nameLookup(partTypes: { id: string; name: string }[]): (id: string) => string {
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
        <EmptyState title={t('inv.history.empty')} />
      ) : (
        <ul className="inv-history">
          {desc.map((a) => (
            <li key={a.id} className="inv-history__item">
              <span className={`badge badge--dense ${kindTone(a.kind)}`.trim()}>
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

export function InvPage({
  client,
  source,
}: {
  client: HubApiClient;
  source: string;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const query = useInventory(client, source);

  const gate = useQueryGuard(query, t('inv.loading'), t('inv.error'));
  if (gate.guard) return gate.guard;

  const { partTypes, ledger, shortfalls, trackedParts } = gate.data;
  void trackedParts;
  const shortfallIds = new Set(shortfalls.map((p) => p.id));

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

      <InvImportSection client={client} onImported={refresh} />

      <InvQuickRecordForm
        client={client}
        partTypes={partTypes}
        holderOptions={holderOptions}
        onRecorded={refresh}
      />

      <section className="panel" aria-label={t('inv.ledger.title')}>
        <h2 className="inv-section-title">{t('inv.ledger.title')}</h2>
        <InvLedgerTable ledger={ledger} shortfallIds={shortfallIds} actions={gate.data.actions} />
      </section>

      <ActionHistory
        actions={gate.data.actions}
        partTypeName={nameLookup(partTypes)}
        kindKey={KIND_KEY}
      />
    </div>
  );
}
