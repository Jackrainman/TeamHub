import type { ActorRef } from '@teamhub/hub-contracts';
import type {
  ApplicationTransactionContext,
  ApplicationUnitOfWork,
} from '../application/unit-of-work.js';
import type { Clock } from '../clock.js';
import type { SqliteDatabase } from '../store/sqlite-db.js';

export class SqliteApplicationUnitOfWork implements ApplicationUnitOfWork {
  constructor(
    private readonly database: SqliteDatabase,
    private readonly clock: Clock,
  ) {}

  run<T>(
    actor: ActorRef,
    work: (context: ApplicationTransactionContext) => T,
  ): T {
    return this.database.tx(() =>
      work({ actor, clock: this.clock, occurredAt: this.clock.now() }),
    );
  }
}
