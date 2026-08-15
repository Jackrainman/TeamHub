import type { ActorRef } from '@teamhub/hub-contracts';
import type {
  ApplicationTransactionContext,
  ApplicationUnitOfWork,
} from '../../src/application/unit-of-work.js';
import type { Clock } from '../../src/clock.js';

/** 测试 fake 专用；生产组合根只能装配 SqliteApplicationUnitOfWork。 */
export class TestApplicationUnitOfWork implements ApplicationUnitOfWork {
  constructor(private readonly clock: Clock) {}

  run<T>(
    actor: ActorRef,
    work: (context: ApplicationTransactionContext) => T,
  ): T {
    const result = work({ actor, clock: this.clock, occurredAt: this.clock.now() });
    if (
      result !== null &&
      (typeof result === 'object' || typeof result === 'function') &&
      typeof (result as { then?: unknown }).then === 'function'
    ) {
      throw new TypeError('ApplicationUnitOfWork 回调必须同步');
    }
    return result;
  }
}
