---
status: implemented
implemented_at: 2026-06-14
backlog: DEPGRAPH-DRAG-CONNECT
decided_by: wf_3845c9c0-aa2 (3-opus 设计+对抗核实)
blocks_on: 用户 UX 拍板（见 §5）
---

# DEPGRAPH-DRAG-CONNECT 设计（画布拖拽连线建依赖）

> 用户诉求（Q3）：「后续可以拖动连线，连线后自动重绘 DAG。比如现在我想把 R1 视觉数据集采集连接到 R1 总联调上，我都不知道要怎么做，要是能直接连过去就很方便。」
> 本文 = 投产前已核实的技术方案 + 一条待用户拍板的 UX。**实现只差用户对 §5 点头。**

## 1. 一句话方案

把依赖图节点的连接 handle 打开（`nodesConnectable={true}`），加一个 `onConnect`：从**源节点底部 handle** 拖到**目标节点顶部 handle** → 客户端先守（自环/重边/成环）→ `createDependency(源阻塞目标)` → 成功后 `invalidate(['dep-graph', source])` 自动重布局重绘。

## 2. 已核实事实（`wf_3845c9c0-aa2`，附 file:line 证据）

| 问题 | 结论 | 证据 |
|---|---|---|
| `DepNode.id` 是否等于 `Task.id`？ | **是，逐字相等**。`toDepGraphView` 把每个 task 映成 `DepNode{id: task.id}`，React Flow node id 直接 `= node.id`。onConnect 的 `source/target` 就是 Task id，可直传。 | `attribution.ts:305`；`DepGraphPage.tsx:116` |
| `CreateDependencyRequest` 字段 & 方向 | `projectId` + `fromTaskId`(上游/阻塞方) + `toTaskId`(下游/被阻) + `type`('blocks'\|'requires'\|'sharesResource') + `source`('human'\|'aiSuggested'\|'derived') + `confirmedBy`(ActorRef\|null)。**方向：fromTaskId 阻塞 toTaskId**。视图边 `source=fromTaskId → target=toTaskId`。所以拖拽 `connection.source=X → connection.target=Y` ⇒ `fromTaskId=X, toTaskId=Y, type='blocks'`，正好「X 阻塞 Y」。 | `governance.ts:153-165`；`pm-requests.ts:37-44`；`attribution.ts:345` |
| 后端是否拒 自环/重边/成环？ | **全不拒**。POST /api/dependencies 只 `safeParse` 形状后 `store.createDependency` 盲 append（clamp status='active'）。**这正是 AUDIT H1：一条成环边会让下次 `GET /api/dep-graph` 的 `toDepGraphView`/`computeCriticalSet` 死循环、卡死 Node 事件循环。** H1 修复未落地。 | `server.ts:179-188`；`mock-gov-store.ts:79-90`；`docs/archive/audits/code-audit-2026-06-14.md:34-37,166` |
| 重绘要 invalidate 哪个 key？ | **只** `['dep-graph', source]`（DepGraphPage 唯一 query）。重取→`toDepGraphView` 服务端重派生→`useMemo(layoutGraph)` 重布局。**不需要** `['tasks']`（node id 已在图里）。 | `DepGraphPage.tsx:146-149` |
| projectId 从哪取？ | 从顶层 `graph.projectId`（`DepNodeSchema` 无 projectId，`DepGraphSchema` 有）。**不需要 getTasks。** | `governance.ts:306-314`；`DepGraphPage.tsx:152` |
| 拖出来的边会显红色 animated「blocking」吗？ | **仅当 `confirmedBy` 非 null**。`kind='blocking'`(红 #b33434 + animated) 要求 `status==='active' && confirmedBy!==null && from.status!=='done'`。故 onConnect 传一个合成 console ActorRef `{id:'console-drag', displayName, source:'console'}` 才显红；传 null 则结构在但灰色普通边。 | `attribution.ts:335-344`；`DepGraphPage.tsx:49-54,127` |

## 3. 关键安全：前端环守卫是**强制**的（不是可选）

后端 H1 未修前，**一条成环边会卡死服务器**。所以 `onConnect` 必须在 mutate **之前**用已加载的 `graph.edges` 客户端守三件：

```ts
// 模块级纯函数：从 to 出发能否回到 from（回到则这条 from→to 会成环）
function wouldCreateCycle(edges, from, to) {
  const adj = new Map();
  for (const e of edges) (adj.get(e.source) ?? adj.set(e.source, []).get(e.source)).push(e.target);
  const stack = [to], seen = new Set();
  while (stack.length) {
    const cur = stack.pop();
    if (cur === from) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    for (const n of adj.get(cur) ?? []) stack.push(n);
  }
  return false;
}
```

`onConnect`：`from===to`→拒(自环)；`graph.edges.some(e=>e.source===from&&e.target===to)`→拒(重边)；`wouldCreateCycle(graph.edges, from, to)`→拒(成环)。三者任一→轻提示横幅、**不 POST**。

> 这条守卫与 AUDIT-FIXES-H1（后端 `POST /dependencies` 拒成环 + `computeCriticalSet` 加 visited）互补、不替代：前端守是 demo 期止血，后端守是部署前必修。两者都做才双保险。

## 4. 改动面（全在 hub-console，零后端改动）

1. `DepGraphPage.tsx`：`nodesConnectable={false}`→`{true}`（Handle 已是 顶=target/底=source，方向天然对）。
2. `DepGraphPage.tsx`：加 `useQueryClient` + `useMutation(client.createDependency, onSuccess→invalidate ['dep-graph',source]+成功提示, onError→错误条)` + `onConnect`(3 守卫) + `wouldCreateCycle` 模块级纯函数 + 反馈横幅（复用 `form-banner--err`）。
3. `DepGraphPage.tsx`：`<ReactFlow onConnect={onConnect}>`。
4. `i18n/translations.ts`：+6 键 zh/en 对称——`depgraph.connect.{selfEdge,duplicate,cycle,success,error,actor}`（类型强制 parity）。

验证：`apps/hub-console npm run verify:all`（typecheck 守 zh/en + 7 测 + build）+ 本地真机 Playwright（拖成功出红边 / 拖自环·重边·成环各出对应提示且服务器不卡）。

## 5. 待用户拍板的一条 UX（实现前唯一阻塞）

**每条拖拽出来的边，默认就是「阻塞依赖」(type='blocks')，还是落点时弹个小选择器让用户选 blocks / requires / sharesResource？**

- **Option A（推荐）**：固定 `type='blocks'` + 非 null console confirmedBy；drop→mutate→`invalidate`→服务端重派生权威图→dagre 重布局。最简、永远与后端真相一致、零分叉风险（守 G2 单一源）；代价是重取有短暂延迟 + 整图可能「跳一下」重排。拖拽手势的自然含义本就是「这个挡着那个」。
- **Option B**：落点先本地乐观加临时边（即时、不跳），弹 3 选 type 选择器，再 mutate、成功对账/失败移除。更跟手、暴露 PmCreatePanel 已有的 3 种 type，但要在客户端复刻 `toDepGraphView` 的 kind 派生逻辑、有分叉风险（红色/critical 重算、真实 edge id 要等重取）。

> 我的建议：**先上 Option A**（固定 blocks）。type 选择器 + 乐观 UX 留给后续，和 `DEPGRAPH-AI-AUTODRAW`（AI 建议边需要落库前编辑）天然成对再做。次要一条：拒绝反馈用**就地横幅**（推荐，匹配 `form-banner--err`）而非拦截式 modal。

## 6. I0 / 反监视核对（已过）

拖拽建边 + 自动重绘**不外露任何 I0/C2/A1 新禁信息**：重绘走 `getDepGraph→toDepGraphView`，其输出 schema 无 memberId 维度、无 confirmedBy、无完成计数、无谁快谁慢；新边唯一人可见载荷是「任务 X 阻塞任务 Y」这一结构事实（被阻节点可能翻 `blockedIdle`、`blockedByLabel` 是**上游任务名非人名**）——A1 合规（暴露阻塞物是任务/组事实，非「人慢了」）、C2 合规（不产生按人排名面）。合成的 console confirmedBy 是纯内部凭证，`toDepGraphView` 永不 emit（只读它定 kind），第三方读视图见不到——守 I0。创建响应回显完整 Dependency（含 confirmedBy）只回给画线本人（actor 自己），与 PmCreatePanel 同一边界。**唯一真新风险是运维性的——成环卡服务器，已由 §3 强制环守卫兜住。**
