import { InMemoryGovStoreBase } from './mock-gov-store-base.js';
import { PmCoreMixin } from './mock-gov-store-pm.js';
import { ArtifactMixin } from './mock-gov-store-artifact.js';
import { ScheduleMixin } from './mock-gov-store-schedule.js';

/**
 * 内存实现（GOV-SPLIT，mock-gov-store 单文件 862 行按域拆分）：基座（状态 + 构造 + 持久层内部句柄，
 * mock-gov-store-base.ts）上按域叠 mixin——pm-core（PmCoreStore 全方法）/ artifact（ArtifactStore 两条写）/
 * schedule（ScheduleStore 全 12 条）。方法体逐字搬迁、零行为变化；`implements GovStore` 的编译期校验由
 * 消费点承担（server.ts `const store: GovStore = … new InMemoryGovStore(…)` / FileGovStore 全方法委托 inner）。
 *
 * 导出名 `InMemoryGovStore` 不变（value=组合后的类、type=其实例类型）：既有 `new InMemoryGovStore(seed?, clock?,
 * demoSeed?)` 构造签名经 mixin 链逐字保留，FileGovStore 组合复用与全部测试 import 零改动。
 */
export const InMemoryGovStore = ScheduleMixin(ArtifactMixin(PmCoreMixin(InMemoryGovStoreBase)));
export type InMemoryGovStore = InstanceType<typeof InMemoryGovStore>;
