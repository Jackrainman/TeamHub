import { kbScenarioFixture } from '@teamhub/hub-contracts';
import type { KbSnapshot } from '@teamhub/hub-contracts';
import type { KbStore } from './gov-store.js';

/**
 * 知识库读语料内存实现（KB-CORE）：默认 seed `kbScenarioFixture`（跨赛季 CAN/3508/MicroROS 历史 bug），
 * 让 `GET /api/kb/similar` 从第一个请求起就能演示同类 bug 召回（与 InMemoryGovStore seed 治理 fixture 对称）。
 * 进程重启丢失为预期；真实持久层随部署服务器审批后接（同 SqliteGovStore 路径，AGENTS §8）。
 *
 * 只读：知识库相似检索语料无写白名单（结案派生走 GovStore.closeoutKbNode；本 Store 只供检索排序）。
 */
export class InMemoryKbStore implements KbStore {
  private readonly snapshot: KbSnapshot;

  constructor(seed: KbSnapshot = kbScenarioFixture) {
    this.snapshot = seed;
  }

  async getKbSnapshot(): Promise<KbSnapshot> {
    return this.snapshot;
  }
}
