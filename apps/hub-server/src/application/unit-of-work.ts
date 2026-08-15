import type { ActorRef } from '@teamhub/hub-contracts';
import type { Clock } from '../clock.js';

/** 一个应用事务内稳定可用的平台上下文。Actor 只表达事实，不用于人员统计。 */
export interface ApplicationTransactionContext {
  readonly actor: ActorRef;
  readonly clock: Clock;
  /** 事务边界只取一次时间，保证同一用例的多条写入时间一致。 */
  readonly occurredAt: Date;
}

/**
 * 应用层唯一事务端口。work 必须同步：node:sqlite 的 DatabaseSync 不能跨 await 保持事务所有权。
 */
export interface ApplicationUnitOfWork {
  run<T>(
    actor: ActorRef,
    work: (context: ApplicationTransactionContext) => T,
  ): T;
}
