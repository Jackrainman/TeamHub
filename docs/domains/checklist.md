---
kind: canonical-domain
status: active
domain: checklist
truth_for: gate-checklists-ious-waivers-and-templates
last_reviewed: 2026-08-15
---

# Checklist 领域

## 1. 职责与边界

Checklist 管验证门检查项、现场欠条、清偿、书面豁免和跨赛季模板。它允许试验阶段“先凑合”，但要求凑合留下可追踪的结构事实。

## 2. 当前行为（CURRENT）

- `GateChecklistItem` 以 `anchorMilestoneId` 或 `anchorDueAt` 二选一挂接门/日期。
- item 来源分 template/iou，状态分 pending/passed/waived。
- 任何人可记欠条和标记清偿；豁免要求有资格的验收人、强制理由并留名。
- 门下有 pending 项时禁止过门；自选日期 pending 项按周派生 red/yellow/green。
- `ChecklistTemplate` 是跨赛季资产；当前 API 支持列表、创建和模板读取。
- 总览和门详情可显示未清项，不按记录人聚合。

## 3. 目标结构（TARGET）

- 已冻结 `model/requests/policies`、`routes/service/repository/sqlite-repository` 与 `api/hooks/components` 三包模板。
- 后续模板导入只增加本域 use case，不把复盘/knowledge repository 注入 checklist route。

## 4. 领域不变式

- 欠条不是 Task；`anchorDueAt` 不构成个人 dueDate。
- 门下所有检查项均非 pending 才能通过，不能由前端自行绕过。
- 豁免必须带理由和事实留名；名字只留在单条卡片，不进入统计。
- 模板是历史教训的触发器，不是禁止探索的规章大全。
- AI 可生成检查清单草稿，不能自动清偿、豁免或过门。

## 5. 跨域接口

- baseline 只提供 `{baselineId, milestone ids}` 窄引用，并经 `GateChecklistPort.listBlockingItems` 消费门禁。
- artifacts 可作为清偿/验证证据引用；文件字节不进入 checklist 数据。
- system 提供 actor 和验收人资格。
- knowledge/复盘可产出模板候选，经人确认后进入 ChecklistTemplate。

## 6. 已知陷阱

- season 归属必须在 clear/waive 写入前验证，不能用错误 season 修改另一赛季的同 ID 条目。
- 模板导入通道尚未实现，当前模板主要来自代码/既有数据。
- 旧设计中“扩展 deriveBaselineDrift”已在实现时改为独立 `deriveChecklistDrift`。
- checklist 与 baseline contracts 已解除互相 import；后续不得为共享常量恢复整域依赖。

## 7. 未落地差异与 TODO

- `ARCH-UNIFY`：checklist 模板与 `GateChecklistPort` 已完成并由架构门冻结；下一刀迁 baseline。
- `CHECKLIST-TPL-IMPORT`：等待真实复盘输出积累后设计最小模板导入。
- baseline 迁移必须只依赖已冻结的窄门禁接口，不能重新取得完整 checklist repository。
- 复盘产生模板时，同批更新本领域当前规则或归档里程碑，不新建功能设计稿。
