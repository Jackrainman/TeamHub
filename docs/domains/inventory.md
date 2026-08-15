---
kind: canonical-domain
status: active
domain: inventory
truth_for: inventory-ledger-part-lineage-shortfalls-and-bom
last_reviewed: 2026-08-15
---

# Inventory 领域

## 1. 职责与边界

Inventory 管零件类型、重要单件、append-only 动作日志、机器人占用/预留、盘点、缺料和 CSV 导入。它记录 as-built 物料事实；不拥有机器人生命周期、采购报账审批或个人操作统计。

## 2. 当前行为（CURRENT）

- `PartType` 管数量、分类、单位、低储阈值和各机器人 allocation。
- `TrackedPart` 只用于电机、电调、主控等重要件，记录 holder、预留和状态。
- `PartAction` 统一承载 stocktake/restock/mount/dismount/reserve/release/damage，并保留来源。
- `deriveInventoryLedger` 派生“零件×机器人”矩阵；`deriveShortfalls` 派生低储告警。
- API 支持建/更新零件类型、记录动作、模板/预览/导入和 Hermes 入站动作。
- 报账条目可经 stock-in 动作联动库存，但 CURRENT 关联仍部分隐藏在 note 前缀。

## 3. 目标结构（TARGET）

- inventory 领域拥有 model/policies/import 和独立 repository；生产只实现统一 SQLite。
- service 暴露窄的 stock-in、record-action、import 和 query use case。
- 报账通过 `InventoryStockInPort` 和同一 UnitOfWork 写入，不读取完整库存实体。
- BOM 缺口、库存水位和装箱核对保持纯派生，不新增第二本账。

## 4. 领域不变式

- `PartAction` append-only；修正通过新动作完成，不删除历史。
- 拆装只改变 holder，绝不删除 TrackedPart，以保存血缘。
- 绝大多数物料按数量/包记录；耗材可不进系统，拒绝虚假精细化。
- `recordedBy` 不含 memberId，禁止“谁损坏/领取最多”等个人聚合。
- 预留属于某台机器人并从闲置量扣除；不另建“在造”列。

## 5. 跨域接口

- resources 提供稳定 resourceId/displayCode 和可引用的机器人事实。
- reimburse 提交结构化 stock-in line 与来源引用，库存返回动作/数量结果。
- checklist 可消费装箱清单投影，但勾选结果仍经 inventory use case 落动作。
- integrations 可生成动作草稿；必须经人确认后提交。

## 6. 已知陷阱

- 生产持久化已收成统一 SQLite，测试 fake 已物理移入 `test/support`；下一步是把 route/store 形状迁为领域 module/repository。
- 报账入库通过 `reimb-stock-in:<itemIndex>` note 前缀关联，属于隐藏协议。
- BOM 需求事实尚不完整，因而“从未买过/下一版不够”不能在没有上游时强推。
- 历史“对话记账作为主路径”已被否决；Hermes 只适合作为低频补录和草稿入口。

## 7. 未落地差异与 TODO

- `ARCH-UNIFY`：建立 inventory module、application service 和结构化跨域入库引用。
- `INV-BOM-DESIGN`：BOM 自保鲜、双报警和装箱门，必须先确认自然上游。
- 赛场 site/transfer、TrackedPart.note 等仍是 PLANNED，不得按历史草案当作 CURRENT。
- 库存导入已存在；后续只补领域能力，不另造第二套 CSV 管线。
