import type { GovernanceSnapshot } from '@teamhub/hub-contracts';

/**
 * 三支柱共享底座的读取出入口（D-040 首任务收敛：本轮只读一个快照）。
 * 写方法（createTask / createDependency / … 的 C1 兜底写入路径）后置——避免被上层当主录入口
 * 退化成新死表（P13）、也避免触 G2 双写；接口先行，后续 kb/inv 扩展同一 Store 而非各自重建。
 */
export interface GovStore {
  getSnapshot(): Promise<GovernanceSnapshot>;
}
