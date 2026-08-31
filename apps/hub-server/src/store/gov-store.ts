import type { PmCoreStore } from './pm-core-store.js';
import type { ScheduleStore } from './schedule-store.js';

// 域接口 + 其 Draft/Patch 类型的定义已按语义拆到独立文件（STORE-SPLIT-SQLITE，
// product-redefine-2026-07 §4.4 / §9-③）；本文件 `export *` 全量转发，
// 消费点（test/support fake / 旧 JSON decorator / sqlite-gov-repository.ts / server.ts）
// 继续从 './gov-store.js' 导入、**零 import 路径改动**。
export * from './pm-core-store.js';
export * from './schedule-store.js';

/**
 * `GovStore`（product-redefine-2026-07 §4.4 / §9-③ STORE-SPLIT-SQLITE）：三支柱共享底座的读写
 * 出入口，**域接口交叉类型**——pm-core（项目计划表核心 + 受限状态机迁移 + 身份写路径）/
 * schedule（共享资源车 + 差异化在场排班）。
 *
 * ARCH-UNIFY A4：artifact 域已摘出（modules/archive；提交日志不再进 GovernanceSnapshot）。
 *
 * **拆分前史**：本类型此前是单一 21+ 方法的 god-interface（混 6 域，见 §9-③ 审计账单）；
 * 拆分「纯重构」——GovStore 的方法签名集合逐字不变（仍是三个域接口方法的并集），
 * 三实现（`测试 fake` / `旧 JSON decorator` / `SqliteGovRepository` stub）与 `server.ts` 消费点
 * 继续 `implements GovStore` / `import type { GovStore }`，**零行为变化**。
 *
 * 各域接口的写白名单护栏（C2 反排名 / G2 不双写 / I0 confirmedBy 不外露 / C1 派生优先 / C3 小作坊
 * 受限 CRUD）详见 pm-core-store.ts / artifact-store.ts / schedule-store.ts 各自文档；
 * id 生成 / clamp 初始态默认值已抽独立纯函数模块（见 id-sequence.ts / clamp-defaults.ts），
 * 三实现共享同一份策略——为 SQLite 增量迁移（SS3 后续刀）铺路。
 */
export type GovStore = PmCoreStore & ScheduleStore;
