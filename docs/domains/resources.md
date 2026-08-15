---
kind: canonical-domain
status: active
domain: resources
truth_for: robots-resource-lifecycle-and-default-plans
last_reviewed: 2026-08-15
---

# Resources 领域

## 1. 职责与边界

Resources 管机器人等共享物理资源的身份、编号、赛季/版本、生命周期状态和默认计划。它回答“有哪些机器人、当前能否上场”，不拥有每日接力顺序或库存零件账。

## 2. 当前行为（CURRENT）

- `SharedResource` 代表一台带编号的独立机器人，不存在 RobotSlot 中间层。
- `deriveDisplayCode(season, position, version)` 生成 `26R1`、`26R1-v2` 等编号，禁止手写。
- 状态覆盖 available/inUse/repair/retired/disassembling，并兼容 legacy down/upgrading；`canBoardResource` 统一判断是否可排。
- 可记录 statusReason 和来源；退役/拆解由人操作。
- `defaultPreset.lineup` 为每台机器人保存默认 group/task 组合，用于一键生成当天计划。
- API 支持资源创建、状态/预设更新、CSV 模板/预览/批量导入。

## 3. 目标结构（TARGET）

- resources 拆成独立 model/policies/import 与 server module；生命周期判断保持 contracts 单源。
- console fleet/resources 统一为本域页面和 hooks，不再跨导 SchedulePage。
- repository 只存资源事实；今日 session 与 relay 继续属于 schedule。
- 与 inventory 只交换 resource reference/display projection，不共享完整实体实现。

## 4. 领域不变式

- 机器人编号由赛季、位置、整车代次派生；同一代编号稳定。
- 状态只表达宏观可用性，具体故障写自由说明，不建机构级状态机。
- 退役、拆解和恢复必须由人确认；AI 只能建议。
- 资源视图不累计成员使用时长或出勤。
- 程序父组只用于汇报，叶子组才可进入默认 lineup。

## 5. 跨域接口

- schedule 读取 boardable 资源和 defaultPreset，创建 ResourceSession。
- inventory 以 resourceId 记录占用/预留并展示 displayCode。
- PM 任务可用 robotTarget/resource reference 表达适用对象。
- artifacts 用 season/robotCode 归档 as-designed 版本，但不与资源对象假定一一同构。

## 6. 已知陷阱

- legacy down/upgrading 仍为兼容状态，统一后需要明确删除时点。
- resource 与 schedule 目前在同一后端 route/store 路径，物理边界尚未形成。
- 新建任务/预设若不复用长期任务，可能每天制造垃圾 Task 并让依赖派生退化。
- 程序父组和收敛任务的历史 fixture 曾有多轮调和，修改前应按 archive 规则定向回查。

## 7. 未落地差异与 TODO

- `ARCH-UNIFY`：resources/schedule 分模块并通过窄 port 连接。
- `SPLIT-1-TAIL`：相关近 400 行组件随功能迭代拆入 components。
- 多车并排密度和状态兼容清理在模块迁移时收口，不另建新模型层。
- 库存血缘和资源状态不一致时的 Hermes 提醒仍是 PLANNED。
