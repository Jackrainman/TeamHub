---
kind: index
status: current
truth_for: documentation-routing
last_reviewed: 2026-08-15
---

# TeamHub 文档入口

本文是仓库文档的唯一导航。先判断任务属于哪个范围，只读取对应活文档；不要从 `docs/` 全量扫描开始。

## 当前真相

| 范围 | 文档 | 用途 |
|---|---|---|
| 产品 | `design/product.md` | 产品定位、不变式、边界 |
| 软件架构 | `design/software-architecture.md` | D-090 目标、迁移顺序、架构约束 |
| 设计系统 | `design/design-system.md` | UI、表单、主题与交互规范 |
| 系统 | `domains/system.md` | 初始化、身份、配置 |
| 项管 | `domains/pm.md` | Task、项目、依赖、认领与学习方向 |
| 知识库 | `domains/knowledge.md` | KB 摄入、检索、结案回灌 |
| 库存 | `domains/inventory.md` | 库存、BOM、动作账本 |
| 基准线 | `domains/baseline.md` | 倒排节奏与验证门 |
| 检查单 | `domains/checklist.md` | 门检查单与欠条 |
| 资源 | `domains/resources.md` | 机器人、资源与接力 |
| 排班 | `domains/schedule.md` | 关键窗口排班 |
| 图纸档案 | `domains/artifacts.md` | 图纸元数据与文件旁路 |
| 报销 | `domains/reimburse.md` | 本地票据解析、批次和库存联动 |
| 集成 | `domains/integrations.md` | 飞书/Hermes 边界 |

## 使用与运维

- 队员上手：`guide/getting-started.md`
- 部署：`operations/deploy.md`
- 运维：`operations/runbook.md`
- 发布：`operations/release.md`
- AI 部署提示：`operations/agent-deploy.md`
- 飞书事实研究：`research/lark.md`（过复查日期后必须重新核实）

## 历史诊断库

历史入口只有 `archive/README.md`。普通任务不得遍历历史；当设计冲突、恢复旧方案、发生数据/权限/事务/配置问题或同一路线连续失败两次时，按根 `AGENTS.md` 的回查协议定向读取。

## 写入规则

- 当前规则更新既有总纲或领域文档，不为单个功能新增永久文档。
- 当前任务只写 `.harness/todo.json`；仍生效 ADR 只写 `.harness/decisions.md`；完成过程只写 Git commit。
- 每个领域只有一份 canonical 文档；活文档必须登记在本页，单份不超过 400 行。
- 归档只能修改既有五份文件，不能按任务新建归档文件。
- 截图、验收结果和生成报告不进仓库。
