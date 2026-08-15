import { checklistScenarioFixture } from '@teamhub/hub-contracts';
import type {
  ActorRef,
  ChecklistTemplate,
  GateChecklistItem,
} from '@teamhub/hub-contracts';
import { createIdSequence, nextSequentialId } from '../../store/id-sequence.js';
import type { IdSequence } from '../../store/id-sequence.js';
import type { SqliteDatabase } from '../../store/sqlite-db.js';
import {
  applyChecklistClear,
  applyChecklistWaive,
  buildChecklistItem,
} from './repository.js';
import type {
  ChecklistItemDraft,
  ChecklistRepository,
} from './repository.js';

const CHECKLIST_TABLES = ['checklist_items', 'checklist_templates'] as const;

export class SqliteChecklistRepository implements ChecklistRepository {
  private idSeq!: IdSequence;

  private constructor(private readonly sdb: SqliteDatabase) {
    this.resyncSequences();
  }

  static fromSharedDb(
    sdb: SqliteDatabase,
    seedItems: GateChecklistItem[] = checklistScenarioFixture,
    seedTemplates: ChecklistTemplate[] = [],
  ): SqliteChecklistRepository {
    sdb.ensureEntityTables(CHECKLIST_TABLES);
    if (sdb.allRows('checklist_items').length === 0 && seedItems.length > 0) {
      sdb.tx(() => {
        sdb.bulkInsert('checklist_items', seedItems);
        sdb.bulkInsert('checklist_templates', seedTemplates);
      });
    }
    return new SqliteChecklistRepository(sdb);
  }

  private resyncSequences(): void {
    this.idSeq = createIdSequence(this.sdb.maxSuffix('checklist_items', 'chk-new'));
  }

  async listItems(seasonBaselineId: string): Promise<GateChecklistItem[]> {
    return this.sdb
      .allRows<GateChecklistItem>('checklist_items')
      .filter((item) => item.seasonBaselineId === seasonBaselineId);
  }

  async createItem(draft: ChecklistItemDraft): Promise<GateChecklistItem> {
    const item = buildChecklistItem(draft, nextSequentialId('chk-new', this.idSeq));
    this.sdb.tx(() => this.sdb.insertRow('checklist_items', item.id, item));
    return item;
  }

  async clearItem(id: string, clearedBy: ActorRef): Promise<GateChecklistItem | null> {
    return this.sdb.tx(() => {
      const updated = applyChecklistClear(
        this.sdb.getRow<GateChecklistItem>('checklist_items', id),
        clearedBy,
      );
      if (!updated) return null;
      this.sdb.updateRow('checklist_items', id, updated);
      return updated;
    });
  }

  async waiveItem(
    id: string,
    waivedBy: ActorRef,
    waiveReason: string,
  ): Promise<GateChecklistItem | null> {
    return this.sdb.tx(() => {
      const updated = applyChecklistWaive(
        this.sdb.getRow<GateChecklistItem>('checklist_items', id),
        waivedBy,
        waiveReason,
      );
      if (!updated) return null;
      this.sdb.updateRow('checklist_items', id, updated);
      return updated;
    });
  }

  async listTemplates(): Promise<ChecklistTemplate[]> {
    return this.sdb.allRows('checklist_templates');
  }
}
