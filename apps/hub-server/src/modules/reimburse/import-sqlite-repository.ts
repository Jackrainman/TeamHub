import { ReimburseImportJobSchema } from '@teamhub/hub-contracts';
import type { ReimburseImportJob } from '@teamhub/hub-contracts';
import type { SqliteDatabase } from '../../store/sqlite-db.js';

export const REIMBURSE_IMPORT_JOB_TABLE = 'reimburse_import_jobs';

/** JSON 行持久化：作业与文件字节分离，重开同一 sqlite 文件不丢审阅进度。 */
export class SqliteReimburseImportRepository {
  private constructor(private readonly sdb: SqliteDatabase) {}

  static fromSharedDb(sdb: SqliteDatabase): SqliteReimburseImportRepository {
    return new SqliteReimburseImportRepository(sdb);
  }

  saveJob(job: ReimburseImportJob): ReimburseImportJob {
    const validated = ReimburseImportJobSchema.parse(job);
    this.sdb.tx(() => {
      if (this.sdb.getRow(REIMBURSE_IMPORT_JOB_TABLE, job.id)) {
        this.sdb.updateRow(REIMBURSE_IMPORT_JOB_TABLE, job.id, validated);
      } else {
        this.sdb.insertRow(REIMBURSE_IMPORT_JOB_TABLE, job.id, validated);
      }
    });
    return validated;
  }

  getJob(id: string): ReimburseImportJob | undefined {
    const row = this.sdb.getRow<unknown>(REIMBURSE_IMPORT_JOB_TABLE, id);
    return row ? ReimburseImportJobSchema.parse(row) : undefined;
  }

  listJobs(): ReimburseImportJob[] {
    return this.sdb.allRows<unknown>(REIMBURSE_IMPORT_JOB_TABLE)
      .map(row => ReimburseImportJobSchema.parse(row))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  deleteJob(id: string): void {
    this.sdb.tx(() => { this.sdb.deleteRow(REIMBURSE_IMPORT_JOB_TABLE, id); });
  }
}
