---
status: spec
written_at: 2026-06-12
activated_by: D-033
note: ROLE-VISIBILITY / CUE-AUDIENCE-ROUTING 拍定。关闭 D-032 §3 OPEN。定 audience 最终枚举 + 路由表 + 角色模型 + 可见性分层 + 问责上移。实现属 frontier GOV-MEMBER-STATUS-DERIVE / GOV-RULES-LAYER；本文是其设计要求，字段级契约以代码 Zod schema 为准。
---

# 角色模型与受众路由 ROLE-VISIBILITY（D-033）

## 0. 一句话

`GovernanceCue.audience` 不是角色、是**符号路由目标**，送达层即时解析到人、不落人名。三值
`{taskOwnerPrivate, subjectGroupLead, teamCoordinator}` 覆盖全部 Cue；role enum **不动**，队长/老师
是**项目级指派**、组长由 `Group.leadMemberId` 确定。守 C3 轻量：不做完整 RBAC，只够路由 Cue + 可见性分层。

## 1. 背景：D-032 留下的 OPEN（CUE-AUDIENCE-ROUTING）

D-032 把治理层所有"事/缺口/机会"统一成 `GovernanceCue`，靠 `audience` 多态路由，但只占了
`taskOwnerPrivate/captain/groupAdmin` 三个值、没有路由表——因为"队长(全队)"与"组长(子组)"在现有模型里
界定不清：role enum 只有 `superAdmin/groupAdmin/member`，组织树是 `Group.parentGroupId` 自引用可多层
（真实结构：程序大组下分电控/视觉两子组，电路、机械各为顶层大组；汇报按大组 `reportingGroupId` 上溯，D-029）。
反监视宪法约束：A1 暴露缺口不暴露人、A2 提醒先私下给本人/老师只看项目级、A4 升级的是事不是人。

本文经两轮对抗式审计（8-agent 宪法审计 + 3-agent 产品目标核实）拍定，关闭该 OPEN。

## 2. 角色模型（role enum 不变 + 两处指派）

把 D-026 dec4 合并进 `superAdmin` 的"系统维护者 + 队长"**拆开**——搭建权 ≠ 全队治理权 ≠ 只读观察：

| 能力 | 落点 | 是否 Cue 受众 |
|---|---|---|
| 搭建权（组织树/赛季/角色配置） | `Member.role='superAdmin'`（收窄含义） | ❌ 配置面，不收 Cue |
| 全队治理权（跨组协调） | `Project.captainMemberId`（新增） | ✅ `teamCoordinator` |
| 只读观察（项目级） | `Project.observerMemberIds[]`（新增） | ❌ 仅 pull rollup |
| 组长（带某组） | `Group.leadMemberId`（新增） | ✅ `subjectGroupLead` |

- **`Member.role` enum 不变** `{superAdmin, groupAdmin, member}`，零迁移。`groupAdmin` = 可 pull 本组事/缺口的
  **可见性能力**，子组组长 vs 大组组长都是 `groupAdmin`、由 `groupId` 区分，不另立角色（Q2）。
- **新增 `Group.leadMemberId: string|null`** = 该组组长的权威源，消除"一组两个 groupAdmin 谁是组长 / groupAdmin
  坐子组却带大组"的歧义。校验不变式：`leadMemberId` 指向的成员 role 应 ≥ groupAdmin（不双写，仅校验）。
- **新增 `Project.captainMemberId: string|null`** = 队长（全队执行负责人）。为何不进 role enum：队长是**赛季级**
  指派、且与组长正交（一人可同时带组+当队长）。
- **新增 `Project.observerMemberIds: string[]`** = 老师。为何不进 role enum：观察是**多对多**（一项目多老师、
  一老师跨多赛季），1:1 enum 装不下、塞进去要 junction table = 违 C3。
- **为什么不增长 enum**（steelman 结论 keep-enum-unchanged）：observer 多对多是致命点；一旦 observer 进不了
  enum，captain 单独进 enum 会让"特殊项目指派"表达不一致。项目级字段是这两个赛季级、正交指派的正确关系表达。

## 3. audience 枚举 + 解析

```
GovernanceCueAudience = 'taskOwnerPrivate' | 'subjectGroupLead' | 'teamCoordinator'
```

- **`taskOwnerPrivate`** → `subjectRef→owner→larkOpenId` 私发，**不存 memberId**（送达层即时解析，反排名保住）。
  仅 `subjectRef.type==='task'` 且 `task.ownerId≠null` 有效；owner 为 null 的 task → 退到 `subjectGroupLead`。
- **`subjectGroupLead`** → 先按 subject 类型取 groupId：`task→task.groupId` · `group→group.id` ·
  `need→need.providerGroupId` · `resource→直接升 teamCoordinator`（资源无组）。再经 `Group.leadMemberId` 解析；
  **有界**上溯 子组→大组(`reportingGroupId`，复用 D-029 `topLevelGroupId`)→`teamCoordinator` 兜底。
  `providerGroupId=null` 的 need → 直接 `teamCoordinator`（缺口级，A4）。
- **`teamCoordinator`** → `Project.captainMemberId`。为 null 时见 §8「null captain」。

> 解析必须是**全函数**（resolveSubjectGroupLead 纯函数，返回 `{memberId|null, fellBackToCaptain}`），
> 因为 fixtures 里多数组无 `leadMemberId`——无 lead 时落兜底，绝不路由到 NOBODY。

## 4. 路由表（Cue kind × 受众 × 升级链）

| kind | 私发 `taskOwnerPrivate` | 协调面（组键·去名） | 升级 → `teamCoordinator` |
|---|---|---|---|
| `uncovered` | — | subjectGroupLead「给 X 派活」 | 全组无人可接 → 队长 |
| `blocked` | 「这段可看的资料」(give)+knowledge | — | 「这条链卡在 `<任务Y>`，去疏通」(**事键**) |
| `silence` | 「还在做 `<任务X>` 吗?」(ask) | **不 push**；本组 console 事键快照（见 §6） | **永不**升级为全队对人可见 (A4) |
| `capacityFreed` | 「看看别的知识?」(give)+give-floor(见 gov-cue-layer §4) | — | 「`<组>` 腾出手，可匀给过载组」(**组键**) |
| `needEscalation` | — | subjectGroupLead(=providerGroup lead)「`<需求>` 挂 N 天」 | 超 `needEscalationDays` → 队长；providerGroup 单人组 → 不进老师 rollup (k-anon, §8) |
| `overload` | — | subjectGroupLead「本组扛 N 项，别再加」(组键) | 「`<组>` 过载，匀走」(组键) |

升级链一句话：**协调 Cue 默认落本组组长（`Group.leadMemberId`）；动作本质跨组（capacityFreed 匀人 /
blocked 疏通 / overload 匀走）或超阈值（needEscalationDays）时再发一条队长 Cue；silence 例外，永不升级。**

## 5. 可见性分层（双轴：广度 × 深度）

| identity | pull 可见 | push 接收 |
|---|---|---|
| member | 本人私发 Cue + 本组任务/需求板 | `taskOwnerPrivate` |
| 组长 groupAdmin | **本组（直属 groupId）**的事/缺口·去名 | 作 `subjectGroupLead` 时的协调面 |
| 队长 captain | **全队**·组键去名的事/缺口（广度↑，**零人名/零计数**） | `teamCoordinator` |
| 老师 observer | 仅 `toObserverRollup`（大组级进度 + 缺口数，**k≥2，零人名**） | 无 |
| superAdmin | 配置面（组织树/赛季/角色）；治理 Cue 仅当兼任 captain/组长 | 配置类通知 |

> **不变式**：没有任何层级（含队长、老师）看得到人与人完成量排名 (C2)。越高 = 事/缺口**广度**越宽，绝非人
> **粒度**越细；老师深度最浅（仅大组 rollup）。

**push vs pull 拆分**：push（DM）只到 owner / 最近组长 / 队长，升级门控；pull（console）每个 `groupAdmin` 只看
**直属组**（不递归子树 raw），大组只见去名 rollup——防大组 lead 旁观子组 `silence` 绕过 push 的升级门控。

## 6. 问责上移（silence 受众 = 纯 pull，用户 2026-06-12 选 A）

`silence`（有就绪任务却 N 天零进展 = 真摸鱼候选）的第三方可见性：

- **push**：仅私发本人「还在做 `<任务X>` 吗?」（ask，可无代价忽略，A4）。**不 push 任何第三方。**
- **pull**：停滞事实在**本组管理界面**呈现为**事键状态**「任务X · 就绪 · 无进展」——**快照**（非持久化按人历史）、
  **本组组长可见 owner**（本地管理职责，A4 授权"判定权留组长"）、更宽视图去名（§8）。
- **问责上移原则**：系统只 surface、不下判决；组长用自己的注意力发现+判定。「如果还没看到就是组长的问题」——
  问责朝**上**（管理者注意力可被问责），不朝**下**（监视队员）。摸鱼从"要抓的坏队员"被重述成"管理有没有在看"。
  一并分散资历弱者压力（G5）：大一只收一条可忽略私下提示、零第三方点名告警，发现停滞的负担在资深组长。
- **配置期望**：「问责上移」由"每组配 `leadMemberId`"激活；未配组长的组退化为"本人私下提示 + 队长去名看板"。

## 7. 重合（一人多帽，Q4）

一人可同时 `role=groupAdmin` + `Group.leadMemberId`(带某组) + `Project.captainMemberId`(队长) +
`observerMemberIds`(老师)，正交分布在不同实体上、天然多帽，不需要多值 roles 数组。有效可见性 = 帽子并集。
**安全来源不是 schema 单独保证**（审计纠正：schema 反排名只防 C2 聚合，不防 A1 单条点名/广度×时间重建）——
真正的安全靠 §8 的去名 + 去重 + k-anon。送达层 dedupe：`subjectGroupLead==teamCoordinator` → 一条 surface DM；
`owner==lead/captain` → **抑制协调面**只留私发（别让人去和自己聊）。

## 8. 反监视自检 + 审计必修硬化（红线落在投影/送达/测试上）

- **去名宽视图**：person-bound Cue（silence/capacityFreed/blocked-private）的 `displayName/ownerLabel` 只在
  `taskOwnerPrivate` 私链出现；任何**比本组更宽**的视图（队长全队 / 大组 subtree / 老师）一律去名升组键。
  落点：`toDepGraphView` 的 `ownerLabel` 在跨组宽视图置 null。这同时堵 A1 单条点名与 C2 广度×时间反演。
- **factStatement 文本红线**：把现有 `Object.keys` 反排名测试（governance.test.ts:69-75）扩展到**扫
  `factStatement` 文本** `/静默\s*\d|空闲\d|\d+\s*天|idle.*\d/`，且非私发（surface/ask 给第三方）Cue 不得含
  任何 `displayName`——把"暴露的是事不是人"守在单测里。
- **老师 rollup = 真函数 + k-anonymity**：新增 `toObserverRollup(snapshot)` 是老师**唯一**可 pull 的数据产品，
  丢所有 displayName/ownerLabel，**子树成员数 < k（k≥2）的组合并/抑制**（fixtures 里 `grp-circuit` 单人且是
  `Need.providerGroup` → "需求挂 N 天·电路组" 等于点名电路D，必须 k-anon 挡掉）。同 minMembers guard 进
  `deriveNeedEscalations`：providerGroup 单人时只升 teamCoordinator（push）、不进老师可见缺口表。
- **问责上移良基化（noticer 有终点）**：有界 walk 终止加**老师终极兜底**——walk 到 captain 且 `owner==captain`
  （或本会路由到沉默者自己）→ 路由 `observer` 一条事键 surface「任务X·就绪·无进展·顶层未路由」（复用
  observerMemberIds、守 A2 老师只项目级）。链遂良基：子组→大组→captain→**老师 STOP**。
- **owner==lead 不留盲区**：立即上抬一级、不 suppress 成空——修"小组长（可能低资历）反而比普通队员覆盖更少"的
  G5 反转。
- **null captain**：`teamCoordinator` Cue 变 **pull-only**（console 对 groupAdmin 可见）+ 一条 superAdmin 配置
  提示「未指定队长，协调提示无人接收」，**绝不静默丢**跨组升级。
- 沿用 D-032 §7：`GovernanceCue` 无 `memberId/count/score/rank/percent/duration` 字段；受众到人靠送达层即时解析。

## 9. 落地要求（给 frontier 的 schema / 测试清单）

实现时（GOV-MEMBER-STATUS-DERIVE / GOV-RULES-LAYER / HUB-SERVER-GOV-SCAFFOLD）须落：
- schema：`Group.leadMemberId` · `Project.captainMemberId` + `observerMemberIds[]` · `GovernanceCueAudience`
  三值 · `GovernanceSnapshot` 带上 captain/observer（送达层解析 teamCoordinator 不另查 Project）。
- 纯函数：`resolveSubjectGroupLead`（全函数 + 兜底）· `toObserverRollup`（k-anon）· dedupe/suppress（送达层）。
- 测试（沿用 governance.test.ts:69-75 / schedule.test.ts:78-86 反排名 guard 体例）：factStatement 文本红线 ·
  单人组不进 observer rollup · 非私发 Cue 无 displayName · owner==lead 上抬不留空。

## 10. 事实源

本 spec；`D-033`（决策）；`docs/design/gov-cue-layer.md`（GovernanceCue schema，§2/§3/§4 同步改名/关 OPEN）；
`docs/design/gov-data-model.md` / `gov-oncall-schedule.md`（reportingGroupId/topLevelGroupId，D-029）；
`AGENTS.md §5`（宪法 C/G/A）；`docs/design/team-hub-concept.md`（canonical）。
