import { checklistScenarioFixture } from '@teamhub/hub-contracts';
import type { ActorRef, ChecklistTemplate, GateChecklistItem } from '@teamhub/hub-contracts';
import { createIdSequence, nextSequentialId } from './id-sequence.js';
import type { IdSequence } from './id-sequence.js';
import type { SqliteDatabase } from './sqlite-db.js';
import {
  applyChecklistClear,
  applyChecklistWaive,
  buildChecklistItem,
} from './base-checklist-logic.js';
import type { ChecklistItemDraft, ChecklistStore } from './checklist-store.js';

const CHECKLIST_TABLES = ['checklist_items', 'checklist_templates'] as const;

export class SqliteChecklistStore implements ChecklistStore {
  private readonly sdb: SqliteDatabase;
  private idSeq!: IdSequence;

  private constructor(sdb: SqliteDatabase) {
    this.sdb = sdb;
    this.resyncSequences();
  }

  static fromSharedDb(
    sdb: SqliteDatabase,
    seedItems: GateChecklistItem[] = checklistScenarioFixture,
    seedTemplates: ChecklistTemplate[] = [],
  ): SqliteChecklistStore {
    sdb.ensureEntityTables(CHECKLIST_TABLES);
    if (sdb.allRows('checklist_items').length === 0 && seedItems.length > 0) {
      sdb.tx(() => {
        sdb.bulkInsert('checklist_items', seedItems);
        sdb.bulkInsert('checklist_templates', seedTemplates);
      });
    }
    return new SqliteChecklistStore(sdb);
  }

  private resyncSequences(): void {
    this.idSeq = createIdSequence(this.sdb.maxSuffix('checklist_items', 'chk-new'));
  }

  async listItems(seasonBaselineId: string): Promise<GateChecklistItem[]> {
    const all = this.sdb.allRows<GateChecklistItem>('checklist_items');
    return all.filter((it) => it.seasonBaselineId === seasonBaselineId);
  }

  async createItem(draft: ChecklistItemDraft): Promise<GateChecklistItem> {
    const item = buildChecklistItem(draft, nextSequentialId('chk-new', this.idSeq));
    this.sdb.tx(() => this.sdb.insertRow('checklist_items', item.id, item));
    return item;
  }

  async clearItem(id: string, clearedBy: ActorRef): Promise<GateChecklistItem | null> {
    return this.sdb.tx(() => {
      const updated = applyChecklistClear(this.sdb.getRow<GateChecklistItem>('checklist_items', id), clearedBy);
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
