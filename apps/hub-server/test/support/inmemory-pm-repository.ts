import { InMemoryPmRepositoryBase } from './inmemory-pm-repository-base.js';
import { PmCoreMixin } from './pm-core-mixin.js';

/**
 * pm 域内存 fake：基座（状态 + 构造 + 持久层内部句柄，inmemory-pm-repository-base.ts）上叠
 * PmCoreMixin（pm-core-mixin.ts，PmRepository 全方法）。`implements PmRepository` 的编译期校验由消费点承担
 *（build-test-hub-server.ts `const store: PmRepository = new InMemoryPmRepository(…)`）。
 */
export const InMemoryPmRepository = PmCoreMixin(InMemoryPmRepositoryBase);
export type InMemoryPmRepository = InstanceType<typeof InMemoryPmRepository>;
