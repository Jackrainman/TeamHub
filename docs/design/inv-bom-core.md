# 库存/BOM 第三支柱 — buildable-now 内核设计（locked）

> 权威实现规格。消解 D-042/D-072 §3.4 只给概念、无 schema 的歧义（sonnet 审计 2026-06-19 标 AMBIGUOUS）。
> 本文锁定后，INV 内核可无人值守实现、零猜测。上游决策见 `decisions.md` D-042（定位/排序）+ D-072 §3.4（血缘/总表/预留）+ `docs/archive/three-pillar-feasibility.md` §4（防死/大概账）。

## 0. 已锁决策（消解 sonnet 两问）
1. **本轮在范围内**：INV 最小内核（contracts + 落盘 store + API + 表格 UI + 一句话快记 + demo seed）本轮做；自动对话记账（Hermes 自动填）后置，但**手动一句话快记现在就上**（满足"不许做纯手敲死表"铁律，Hermes 将来调同一 POST）。
2. **两实体 + 一条统一动作日志**（非"单实体带 flag"）：
   - `PartType` — 按数量件（绝大多数），存总数 + 各车占用。
   - `TrackedPart` — 单件追踪个体，**仅电机/电调/主控**；螺丝等琐碎件不建实例（"丢几个都不知道"）。
   - `PartAction` — **唯一 append-only 动作日志**，同时承载按数量件的 `quantityDelta` 与个体件的归属迁移，**就是对话记账 + 拆装血缘的落点**。
   - **损坏 = `PartAction` kind=damage**（非独立 DamagedPart 实体）；**预留 = kind=reserve**（非独立 Reservation 实体）。
3. **存储 = JSON 文件**（`~/teamhub-data/inventory.json`，`TEAMHUB_INV_DATA_FILE`），照 KB/PM；不用 CSV/DB。
4. **车列复用 `SharedResource`**（governance.ts），显示 `displayCode ?? name`，与 PRESENCE-01 解耦。

## 1. Schema（新文件 `apps/hub-contracts/src/inventory.ts` + `inventory.test.ts`）

```
PartCategory   = 'motor' | 'esc' | 'controller' | 'mechanical' | 'electronic' | 'other'
PartActionKind = 'stocktake' | 'restock' | 'mount' | 'dismount' | 'reserve' | 'release' | 'damage'
HolderRef      = string(resourceId) | 'idle'        // 'idle' = 货架/闲置池

PartType {
  id: string                 // parttype-xxx
  projectId: string
  partNumber: string         // "GM6020" / "C620" / "main-controller"
  name: string
  category: PartCategory
  unit: string               // "个"
  trackIndividually: boolean // true 仅电机/电调/主控
  totalQuantity: number(int≥0)
  allocations: Array<{ resourceId: string; used: number(int≥0); reserved: number(int≥0) }>  // 各车已用/预留
  lowStockThreshold: number(int≥0)   // 闲置低于此 → 缺料告警
  lastCountedAt: isoDateTime | null
  updatedAt: isoDateTime
}

TrackedPart {                 // 仅 trackIndividually=true 的件有实例
  id: string                  // part-xxx
  projectId: string
  partTypeId: string
  serialLabel: string | null  // 队内编号
  currentHolder: HolderRef    // resourceId | 'idle'
  reserved: boolean           // 已拿出记在车上、禁他用
  status: 'ok' | 'damaged' | 'retired'
  updatedAt: isoDateTime
}

PartAction {                  // append-only，绝不删
  id: string                  // act-xxx
  projectId: string
  partTypeId: string
  trackedPartId: string | null
  kind: PartActionKind
  quantityDelta: number(int)  // 按数量件用；个体件填 0/1
  fromHolder: HolderRef | null
  toHolder: HolderRef | null
  note: string | null         // 一句话快记："坏了一个3508、烧了"
  recordedBy: { source: 'human'|'aiSuggested'|'hermes'|'derived'; at: isoDateTime }  // I0：绝无 memberId
  recordedAt: isoDateTime
}

InventorySnapshot { projectId, partTypes: PartType[], trackedParts: TrackedPart[], actions: PartAction[] }
```

**纯派生函数（+单测）**：
- `deriveInventoryLedger(snapshot, resources)` → 每 PartType 一行 `{ partType, idle, perResource: [{ resourceId, displayCode, used, reserved }] }`；`idle = totalQuantity − Σ(used + reserved)`。**不画"在造"列**。
- `deriveShortfalls(snapshot)` → `idle < lowStockThreshold` 的 PartType 列表。

**红线（结构约束，非散文）**：`recordedBy` 永无 memberId、无任何按人聚合视图（I0）；INV 自有真相、不回写飞书 Bitable（G2）；写白名单仅 `upsertPartType / recordPartAction`，无通用 delete（C3）；个体件拆装只移 `currentHolder`、**绝不删 TrackedPart**（保血缘，D-072 §3.4）。

## 2. 动作语义（`recordPartAction` 如何改状态 + append 一条 PartAction）
| kind | 按数量件（PartType） | 个体件（TrackedPart） |
|---|---|---|
| stocktake | 设 totalQuantity + lastCountedAt（盘点建底） | — |
| restock | totalQuantity += |delta| | — |
| mount | allocations[toResource].used += |delta| | currentHolder=toResource, reserved=false |
| dismount | allocations[fromResource].used −= |delta| | currentHolder='idle' |
| reserve | allocations[toResource].reserved += |delta| | reserved=true, currentHolder=toResource |
| release | allocations[toResource].reserved −= |delta| | reserved=false |
| damage | totalQuantity −= |delta|（一句话快记主路径） | status='damaged' |

非法迁移（负库存 / used 超 total / 未知 resourceId）→ store 拒绝 + 400，不静默吞。

## 3. 持久层（`apps/hub-server/src/store/`）
- 充实 `gov-store.ts` 的 `InvStore`：`getInventorySnapshot()` / `upsertPartType(draft)` / `recordPartAction(draft)` / `listShortfalls()`。
- 新建 `mock-inv-store.ts`（in-memory 参考实现，含上表迁移逻辑 + 派生）+ `file-inv-store.ts`（照 `file-gov-store.ts`：tmp+rename 原子写、fail-closed seed/throw、writeChain + H2 catch 复位、组合复用 mock）。
- `main.ts` 接 `TEAMHUB_INV_DATA_FILE`（unset → in-memory + warn，照 KB/Gov）；`buildHubServer({ store, kbStore, invStore })`。

## 4. API（`server.ts`，照现有 /api/* + Bearer+限流+bodyLimit）
- `GET /api/inventory` → `{ partTypes, trackedParts, ledger, shortfalls }`
- `POST /api/inventory/part-types`（盘点建底/补料/调阈值）→ 201 `{ partType }`
- `POST /api/inventory/actions`（**一句话快记** = kind=damage + partTypeId + quantityDelta + note；拆装 = mount/dismount；预留 = reserve/release）→ 201 `{ action }`。**Hermes 将来调同一接口自动填**。

## 5. Console UI（`apps/hub-console/src/features/inv/`）
- 点亮导航：`ConsoleLayout.tsx` 给 inv 项加 `page: 'inv'`（去掉 `tooltipKey` 禁用），`ConsolePage` 联合加 `'inv'`；`App.tsx` 加渲染 + `TITLE_KEY['inv']`。
- `InvPage.tsx`：① 顶部汇总（`MetricTile`：总零件种类 / 缺料告警数）② `InvLedgerTable.tsx`（**零件×车 矩阵网格**，车列 `displayCode ?? name`，闲置列高亮；缺料行标红）③ `InvQuickRecordForm.tsx`（**一句话快记**：选零件 + kind + 数量 + note 文本框 → POST /actions）④ 拆装/记账历史（actions append-only 列表，倒序）。
- 复用：React Query `useQuery/useMutation` + 失效刷新、`Field`、`.panel`/`.kb-card`/`.pm-form__grid`/`.status-pill`/`.pm-coldstart` 空态、`translations.ts` 加 `inv.*`（中英）、`api/client.ts` 加 `getInventory/upsertPartType/recordPartAction`、`styles.css` 加 `.inv-*`。

## 6. Demo seed（`fixtures.ts`，demo 模式才注入）
PartType ×3：GM6020 电机（trackIndividually，total 9，allocations 26R1 used2 / 26R2 used4，idle 派生 3，threshold 2）、C620 电调（trackIndividually，类似）、主控板（trackIndividually，total 3）。普通件 ×1~2 按数量示例（如 M4 螺丝 category=mechanical，trackIndividually=false，仅总数）。TrackedPart：电机/电调/主控各建实例并 mount 到 26R1/26R2，留 idle 若干。actions：seed 几条 stocktake + mount + 一条 damage 示例。

## 7. 验收（仅 WSL 测试，本机只 verify:all）
- 本机：三包 `verify:all` 全绿（含新 `inventory.test.ts` 派生函数单测、server 路由测、console 构建）。`curl GET /api/inventory` 返 ledger+shortfalls；`POST /api/inventory/actions` 无 token=401、带 token=201。`grep -ri memberId` 库存返回体为空（I0）。
- WSL：4177 起服，Playwright 截「库存/BOM」页（矩阵+快记表单+缺料告警渲染）；POST 一条 damage 快记 → 表格刷新数量减一。
