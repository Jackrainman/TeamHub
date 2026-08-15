---
kind: canonical-domain
status: active
domain: schedule
truth_for: daily-resource-sessions-relay-and-presence-projections
last_reviewed: 2026-08-15
---

# Schedule 领域

## 1. 职责与边界

Schedule 管某日/窗口的 ResourceSession、接力顺序、交接线、今日计划和组级在场建议。它调度共享机器人上的工作顺序，不形成个人考勤表。

## 2. 当前行为（CURRENT）

- 一天的计划就是该 `windowLabel` 下的 sessions 集合；空板是合法状态。
- 接力画布支持按机器人多列、加删一棒、调整顺序、ETA 和 handoff。
- 可“继续昨天”或按每车 defaultPreset 铺开今天；复制时清空 ETA、note、handoff 和 invitedMemberIds。
- 每条 session 关联 resource、holder group、可选 holder task 和顺序。
- `derivePresenceSchedule` 从资源可用性、session 和任务依赖派生 present/onCall/free 的组级建议。
- API 支持 schedule/resource-sessions/resources/relay 查询和 session/handoff 写入。

## 3. 目标结构（TARGET）

- schedule 拆为 model/policies 和标准 server/console module；carry-over、preset、presence 保持纯函数。
- resources 通过 `ResourceCatalogPort` 提供可排机器人，PM 通过 `TaskDependencyPort` 提供结构投影。
- application service 编排 session 与 handoff，repository 只写统一 SQLite。
- console 页面只依赖 schedule API/hook，不导入 resources 的 Page 组件。

## 4. 领域不变式

- 所有输出以 group/resource/task 为键，不含个人出勤、时长、完成量或排名。
- invitedMemberIds 即使存在于历史输入，也不得渲染给第三方或跨日复制。
- 空板必须可操作，但不得通过每天预烤 seed 制造幽灵计划。
- carry-over 和使用预设必须由人点击，不自动跨日写入。
- 接力表达“轮到、待命、可下班”，不是“停活”或“谁没来”。

## 5. 跨域接口

- resources 提供 boardable 状态、displayCode 和 defaultPreset。
- PM 提供 holderTask 与依赖结构，用于在场建议和阻塞解释。
- knowledge 可为 free 状态提供相关资料引用，但不得把建议写成任务裁决。
- system 提供 actor/clock；reportingGroupId 可用于大组汇报，不改变叶子组排班事实。

## 6. 已知陷阱

- CURRENT `schedule.ts` contracts 文件过大，混合模型、纯函数和多种投影。
- route 同时依赖 GovStore、resources 和 schedule 逻辑，应用边界不清。
- `windowLabel` 仍是开放字符串；调用方必须统一 ISO 日期或明确窗口语义。
- 历史 invitedMemberIds 字段存在，但当前产品不应再扩大其使用范围。

## 7. 未落地差异与 TODO

- `ARCH-UNIFY`：resources/fleet → schedule 的模块迁移与窄 port。
- `SCHED-NARROW`：排班退出日常强制动线，只服务关键机器人窗口。
- 真实 overload 提示尚无完整、合规的规则来源，不得凭 session 数量推断个人或组表现。
- 常驻任务复用策略需在 PM/schedule 接口中冻结，避免每日创建重复任务。
