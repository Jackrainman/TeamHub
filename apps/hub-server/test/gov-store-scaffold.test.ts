import { describe, expect, test } from 'vitest';
import { buildHubServer } from '../src/server.js';
import { InMemoryGovStore } from '../src/store/mock-gov-store.js';
import { SqliteGovStore } from '../src/store/sqlite-gov-store.js';
import type { GovStore, InvStore } from '../src/store/gov-store.js';

// base 收口刀（D-042 决策 5①）：GovStore 写方法白名单 + kbStore/invStore 扩展点 + 持久化切换合约 stub。
// 验证「接口先行、实现后置」=读路径活、写路径 throw（不静默吞、不过早成主录入口），且 kb/inv/sqlite 三方
// 能插进同一底座而无需重建。

describe('base 收口刀: GovStore 写白名单 + 扩展点 + 持久化切换合约', () => {
  test('InMemoryGovStore: 读路径已实现，写白名单签名齐且实现后置=throw', async () => {
    const store = new InMemoryGovStore();

    // 读路径（D-040 首刀）仍可用
    const snapshot = await store.getSnapshot();
    expect(snapshot.tasks.length).toBeGreaterThan(0);

    // 写白名单四方法齐：实现后置 → throw（而非静默吞 / 就地实现成死表）
    await expect(store.createTask({} as never)).rejects.toThrow(/后置/);
    await expect(store.createDependency({} as never)).rejects.toThrow(/后置/);
    await expect(store.createNeed({} as never)).rejects.toThrow(/后置/);
    await expect(store.closeoutKbNode({} as never)).rejects.toThrow(/后置/);
  });

  test('SqliteGovStore: 同一 GovStore interface 可落持久层（切换合约 stub，全 throw not implemented）', async () => {
    const persisted: GovStore = new SqliteGovStore();

    await expect(persisted.getSnapshot()).rejects.toThrow(/not implemented/);
    await expect(persisted.createTask({} as never)).rejects.toThrow(/not implemented/);
    await expect(persisted.createDependency({} as never)).rejects.toThrow(/not implemented/);
    await expect(persisted.createNeed({} as never)).rejects.toThrow(/not implemented/);
    await expect(persisted.closeoutKbNode({} as never)).rejects.toThrow(/not implemented/);
  });

  test('kb / inv / sqlite 三方扩展同一底座、不重建：buildHubServer 接受各扩展点并仍服务', async () => {
    const shared = new InMemoryGovStore(); // KB 复用同一 store（不必扩 interface）
    const invStore: InvStore = {}; // INV 独立扩展点（reserved，本刀不建 PartStock）

    const app = buildHubServer({ store: shared, kbStore: shared, invStore });
    try {
      const health = await app.inject({ method: 'GET', url: '/health' });
      expect(health.statusCode).toBe(200);

      // 共享底座：注入自定义 store 后 dep-graph 读路径仍正常派生
      const dep = await app.inject({ method: 'GET', url: '/api/dep-graph' });
      expect(dep.statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });

  test('持久层可经 store 扩展点切换：SqliteGovStore 可作为 buildHubServer 的 store 注入（类型相容）', () => {
    const persisted: GovStore = new SqliteGovStore();
    // 类型层证明 SqliteGovStore 满足 BuildHubServerOptions.store?: GovStore（无需重建底座）
    const app = buildHubServer({ store: persisted });
    expect(app).toBeDefined();
    void app.close();
  });
});
