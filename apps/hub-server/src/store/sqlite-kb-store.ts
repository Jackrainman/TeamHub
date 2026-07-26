import type { ArchiveDocument, KbSnapshot } from '@teamhub/hub-contracts';
import { kbScenarioFixture } from '@teamhub/hub-contracts';
import type { SqliteDatabase } from './sqlite-db.js';
import type { KbAddArchiveDocsResult, KbCloseoutAppend, KbStore } from './gov-store.js';

const KB_TABLES = ['kb_issue_cards', 'kb_error_entries', 'kb_archive_documents'] as const;

export class SqliteKbStore implements KbStore {
  private readonly sdb: SqliteDatabase;

  private constructor(sdb: SqliteDatabase) {
    this.sdb = sdb;
  }

  static fromSharedDb(sdb: SqliteDatabase, seed: KbSnapshot = kbScenarioFixture): SqliteKbStore {
    sdb.ensureEntityTables(KB_TABLES);
    if (sdb.getMeta('kb_projectId') === undefined) {
      sdb.tx(() => {
        sdb.setMeta('kb_projectId', seed.projectId);
        sdb.bulkInsert('kb_issue_cards', seed.issueCards);
        sdb.bulkInsert('kb_error_entries', seed.errorEntries);
        sdb.bulkInsert('kb_archive_documents', seed.archiveDocuments.map((d) => ({ id: d.issueId, ...d })));
      });
    }
    return new SqliteKbStore(sdb);
  }

  async getKbSnapshot(): Promise<KbSnapshot> {
    const archiveRows = this.sdb.allRows<ArchiveDocument & { id: string }>('kb_archive_documents');
    const archiveDocuments = archiveRows.map(({ id: _id, ...doc }) => doc);
    return {
      projectId: this.sdb.getMeta('kb_projectId') ?? '',
      issueCards: this.sdb.allRows('kb_issue_cards'),
      errorEntries: this.sdb.allRows('kb_error_entries'),
      archiveDocuments,
    };
  }

  async appendCloseout(input: KbCloseoutAppend): Promise<void> {
    const { issueCard, errorEntry, archiveDocument } = input;
    this.sdb.tx(() => {
      this.upsertRow('kb_issue_cards', issueCard.id, issueCard);
      this.upsertRow('kb_error_entries', errorEntry.id, errorEntry);
      this.upsertRow('kb_archive_documents', archiveDocument.issueId, { id: archiveDocument.issueId, ...archiveDocument });
    });
  }

  async addArchiveDocuments(docs: readonly ArchiveDocument[]): Promise<KbAddArchiveDocsResult> {
    const added: ArchiveDocument[] = [];
    const skippedIssueIds: string[] = [];
    this.sdb.tx(() => {
      for (const doc of docs) {
        if (this.sdb.getRow('kb_archive_documents', doc.issueId)) {
          skippedIssueIds.push(doc.issueId);
        } else {
          this.sdb.insertRow('kb_archive_documents', doc.issueId, { id: doc.issueId, ...doc });
          added.push(doc);
        }
      }
    });
    return { added, skippedIssueIds };
  }

  private upsertRow(table: string, id: string, value: unknown): void {
    if (this.sdb.getRow(table, id)) {
      this.sdb.updateRow(table, id, value);
    } else {
      this.sdb.insertRow(table, id, value);
    }
  }
}
