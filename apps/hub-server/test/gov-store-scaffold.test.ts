import { describe, expect, test } from 'vitest';
import { buildHubServer } from '../src/server.js';
import { InMemoryGovStore } from '../src/store/mock-gov-store.js';
import { InMemoryKbStore } from '../src/store/mock-kb-store.js';
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

    // PM 录入簇仍实现后置 → throw（而非静默吞 / 就地实现成死表）
    await expect(store.createTask({} as never)).rejects.toThrow(/后置/);
    await expect(store.createDependency({} as never)).rejects.toThrow(/后置/);
    await expect(store.createNeed({} as never)).rejects.toThrow(/后置/);

    // closeoutKbNode 已由 KB-CORE 实现：补 id + createdAt、追加节点、I0 无人维度
    const node = await store.closeoutKbNode({
      name: '踩过的坑：测试',
      groupId: null,
      parentNodeId: null,
      resourceLinks: [],
    });
    expect(node.id).toMatch(/^kn-cl-/);
    expect(node.createdAt).toMatch(/\dT\d/);
    expect(node).not.toHaveProperty('memberId');
    expect((await store.getSnapshot()).knowledgeNodes).toContainEqual(node);
  });

  test('closeoutKbNode 不污染共享 fixture：两个 store 各自独立', async () => {
    const a = new InMemoryGovStore();
    const b = new InMemoryGovStore();
    const baseLen = (await b.getSnapshot()).knowledgeNodes.length;
    await a.closeoutKbNode({ name: 'x', groupId: null, parentNodeId: null, resourceLinks: [] });
    // b 的快照不受 a 写入影响（构造时已克隆 knowledgeNodes 数组）
    expect((await b.getSnapshot()).knowledgeNodes.length).toBe(baseLen);
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
    const shared = new InMemoryGovStore(); // 治理读 + 结案派生 KnowledgeNode 复用同一 GovernanceSnapshot
    const kbStore = new InMemoryKbStore(); // KB 相似检索语料独立 KbStore（IssueCard 不在治理快照内）
    const invStore: InvStore = {}; // INV 独立扩展点（reserved，本刀不建 PartStock）

    const app = buildHubServer({ store: shared, kbStore, invStore });
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

  test('KbStore 独立于 GovStore：InMemoryKbStore 供相似检索语料（IssueCard 不在治理快照内）', async () => {
    const kbStore = new InMemoryKbStore();
    const kb = await kbStore.getKbSnapshot();
    // 相似检索语料：跨赛季历史 bug（治理快照里没有 issueCards 字段）
    expect(kb.issueCards.length).toBeGreaterThan(0);
    expect(kb.errorEntries.length).toBeGreaterThan(0);
    // C2：语料无人维度
    for (const issue of kb.issueCards) {
      expect(issue).not.toHaveProperty('ownerId');
      expect(issue).not.toHaveProperty('memberId');
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
