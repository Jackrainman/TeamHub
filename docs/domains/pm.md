---
kind: canonical-domain
status: active
domain: pm
truth_for: projects-tasks-dependencies-needs-claims-and-project-views
last_reviewed: 2026-08-15
---

# PM 领域

## 1. 职责与边界

PM 管赛季项目中的 Task、Dependency、Need、挂单认领、指派、搭档、完成验收和依赖图投影。它围任务运转；成员只作为事实卡片里的对接者和操作凭证。

## 2. 当前行为（CURRENT）

- Task 有待启动、进行中、卡住、完成、搁置等状态，支持 owner、group、robotTarget、里程碑和投资属性。
- Dependency 是确认后才参与归因的有向边；Need 归到 provider group，不被转换为对个人派单。
- API 已支持任务/依赖/Need 创建、状态流转、依赖豁免、任务认领/指派/搭档、跨组确认、完成和复核。
- 挂单允许无 owner；认领即生效。直接指派要求理由并在事实时间线留痕。
- 跨组认领由依赖/门结构判定风险，并可要求本组搭档；不建立个人能力排行榜。
- 依赖图和阻塞归因从 contracts 纯函数派生；第三方读视图不暴露 `confirmedBy`。

## 3. 目标结构（TARGET）

- contracts 拆为 model/requests/policies/projections；阻塞归因、认领规则和校验保持唯一共享实现。
- server 的 route 只解析和鉴权；任务用例进入 service；SQLite repository 只做持久化。
- console 收成一个 PM feature 的 api/hooks/page/components/lib；pool、project、dep-graph、myview 等作为同域视图，不互相导入 Page。
- 与 baseline、checklist、resources 的连接改为显式 ID 引用和窄 port。

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

- CURRENT contracts 的 `pm-core.ts`、`attribution.ts` 过大并跨域导入。
- console 的 PM 子视图分散在多个 feature，并存在跨 feature import 与裸 query。
- route 仍直接依赖 GovStore，application 层尚未建立。
- 历史文档中关于 freeIdle、程序大组领任务、甘特和 InMemory/File Store 的说明已过时。

## 7. 未落地差异与 TODO

- `ARCH-UNIFY`：PM 按标准模块迁移并删除旧 contracts/route/hooks/segment。
- `HOOKS-1-TAIL`：收口 dep-graph 等剩余裸查询。
- `GOV-REPORT`：项目级汇报，只允许项目/组/资源结构维度。
- `DEPGRAPH-AI-AUTODRAW`：仅生成可编辑草图，确认前不得写入 live Dependency。
