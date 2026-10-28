---
kind: canonical-domain
status: active
domain: pm
truth_for: projects-tasks-dependencies-needs-claims-and-project-views
last_reviewed: 2026-10-28
---

# PM 领域

## 1. 职责与边界

PM 管赛季项目中的 Task、Dependency、Need、挂单认领、指派、搭档、完成验收和依赖图投影。它围任务运转；成员只作为事实卡片里的对接者和操作凭证。

## 2. 当前行为（CURRENT）

- Task 有待启动、进行中、卡住、完成、搁置等状态，支持 owner、group、robotTarget、里程碑和投资属性。
- Dependency 是确认后才参与归因的有向边；Need 归到 provider group，不被转换为对个人派单。
- API 已支持任务/依赖/Need 创建、状态流转、依赖豁免、任务认领/指派/退池/搭档、跨组确认、完成和复核。
- 挂单允许无 owner；认领即生效。直接指派要求理由并在事实时间线留痕。
- 进行中且有当前完成人的任务可由本人或本组组长退回任务池（`POST /api/tasks/:taskId/release`），理由可选；退回后 `ownerId=null`、`status=pending`，保留任务结构与进度事实，清理当前认领/指派字段，状态 transition 与 released 归属事件在同一次 SQLite 更新中落库。
- Task 以追加式 `ownershipEvents` 分别记录 claimed/assigned/released 归属事实；历任完成人由 contracts 纯函数按首次接任顺序去重、排除当前完成人，`GET /api/tasks` 以 `previousOwnerIds` 读模型附加，不落盘维护该数组。任务池卡与任务事实卡只显示“曾经执行”名单，不做按人统计。
- 跨组认领由依赖/门结构判定风险，并可要求本组搭档；不建立个人能力排行榜。
- 依赖图和阻塞归因从 contracts 纯函数派生；第三方读视图不暴露 `confirmedBy`。
- 首页包含进行中、全局任务池、已完成三个视图。我的范围只用当前会话身份，全队范围按任务展示，不提供其他成员筛选或个人统计。
- Task 的可选 `weekLinks` 只记录 `weekKey/linkedAt/linkedBy`。周按 Asia/Shanghai 的 ISO 周一至周日计算；`GET /api/tasks` 返回服务器 `currentWeek`，前端与写入校验共用时间口径。不建 Week 表，不增加个人截止日期。
- 自报接口 `POST /api/weeks/:weekKey/tasks` 固定 owner 为登录人，一次保存任务、认领事实与本周关联。认领请求可带 `weekKey`，同一次 SQLite Task 更新完成认领与关联。
- `POST /api/tasks/:taskId/weeks` 仅允许本人将未完成任务延续到当前周；重复关联幂等。历史周不可补写，未来周不可计划。退池保留周关联，再次认领不覆盖原关联时间。
- 周任务推进、完成仅限登录的当前承担者；无论任务大小，完成后都待另一名册成员验收，验收者不能是 owner 或 completedBy，无需 gateReviewer。非周任务保留原有简单任务抽查与 gateReviewer 规则。
- 完成时间取最后一次 done transition，验收写 `reviewedBy/reviewedAt`；打回回到 inProgress 并记录理由，重新完成清除上一轮当前验收结论。历史页显示关联任务的最新结果，不是周末快照。

## 3. 当前结构与边界

- contracts 位于 `domains/pm/`，周计算、视图分桶与验收规则由 `week.ts` 和 model/policies 共享。
- server 位于 `modules/pm/`，路由负责解析和鉴权，PmService 执行业务规则，统一 SQLite repository 持久化；内存实现只供测试。
- console 的周组件在 `features/pm/week/`，API 与查询保持 PM 单源。WorkbenchPage 只组合工作区和侧栏；MyView 独立页面已删除。
- 总览子组件承接倒计时、本车/赛季进度、六阶段和基准线；项目页继续管理全赛季看板、依赖图与全局任务池。跨 feature 不导入 Page。
- baseline、checklist、resources 连接使用显式 ID 引用和应用层编排；视觉组合不替代领域边界治理（ARC-DEC-005）。

## 4. 领域不变式

- Task 永不增加个人 `dueDate`；时间压力只能由里程碑、门或欠条表达。
- owner/claimer/reviewer 是事实，不得按人计数、排名或形成产能画像。
- 卡住原因来自 Dependency/Need，不在 Task 上重复存 `blockedBy` 文本。
- AI 建议边在人工确认前不参与阻塞归因。
- 没有结构依据时派生应沉默，不能猜谁拖慢了项目。

## 5. 跨域接口

- baseline 以 `Task.milestoneId` 挂接里程碑，并读取任务状态计算漂移。
- checklist 在过门时提供 pending 项门禁。
- resources/schedule 通过 `holderTaskId` 读取任务依赖位置，派生接力建议。
- knowledge 可与 Task/Issue 建结构引用，但相似召回不能写回任务事实。
- artifacts 作为任务证据或版本引用；二进制由 artifact 域管理。

## 6. 已知陷阱

- 周任务档案保存关联与最新结果，不能据此生成周末状态快照或个人完成量。
- “任务池”始终是当前可认领任务，切到历史周仍只向当前周认领。
- 周验收规则不能扩散成非周任务的权限放宽；人员匹配、画像和产能比较仍不建设（ARC-DEF-003）。
- 历史文档中关于 freeIdle、程序大组领任务、甘特和 InMemory/File Store 的说明已过时。

## 7. 未落地差异与 TODO

- `GOV-REPORT`：项目级汇报，只允许项目/组/资源结构维度。
- `DEPGRAPH-AI-AUTODRAW`：仅生成可编辑草图，确认前不得写入 live Dependency。
- 队伍近况目前仅为规划区，未实现动态发布、链接存储或社区后端。
