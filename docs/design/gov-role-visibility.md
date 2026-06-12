---
status: spec
written_at: 2026-06-12
activated_by: D-033
revised_by: D-037 (定位回中 + 人键自指化 + 机会导向协调视图)
note: 角色模型 + 受众路由 + 可见性分层。**D-037 收窄**：人键 Cue 只回本人，问责上移废除，k-anon / 良基兜底因不再对第三方暴露人而多数移除；新增"机会导向协调视图"+ 坦白小团队反推边界。实现属 frontier GOV-MEMBER-STATUS-DERIVE / GOV-RULES-LAYER；字段级契约以代码 Zod schema 为准。
---

# 角色模型与受众路由 ROLE-VISIBILITY（D-033，D-037 去监视化收窄）

## 0. 一句话

`GovernanceCue.audience` 不是角色、是**符号路由目标**，送达层即时解析到人、不落人名。三值
`{taskOwnerPrivate, subjectGroupLead, teamCoordinator}` 覆盖全部 Cue；role enum **不动**，队长/老师
是**项目级指派**、组长由 `Group.leadMemberId` 确定。**核心不变式 I0（D-037）凌驾本文**：人键 Cue
（silence / capacityFreed 的给予 / 被卡去学）**只回 `taskOwnerPrivate`**；`subjectGroupLead` / `teamCoordinator`
只承载**结构键** Cue（派活缺口 / Need 升级 / 过载 / 卡点链）。守 C3 轻量：不做完整 RBAC，只够路由 Cue + 可见性分层。

## 1. 背景：D-033 的角色模型仍在，D-037 砍掉它上面的监视层

D-033 把治理层所有"事/缺口/机会"统一成 `GovernanceCue`、靠 `audience` 多态路由，并为"队长(全队)"与
"组长(子组)"建了角色模型（role enum 只有 `superAdmin/groupAdmin/member`、组织树是 `Group.parentGroupId`
自引用：程序大组下分电控/视觉，电路、机械各为顶层大组；汇报按大组 `reportingGroupId` 上溯，D-029）。

**D-037 的转向**：D-033 当时为 silence 设计了"问责上移 + 老师 k-anon rollup + 良基兜底"一整套——为了让
"把某人停滞 surface 给管理者"站得住脚而不像监视。用户触底反思：**真想帮学弟早就线下问了，这套机器只是给一个
监视形状的操作拔牙**。故 D-037：silence 收为纯自指、问责上移废除、k-anon 机器因不再对第三方暴露人而多数移除。
**角色模型（本文 §2）保留**——它仍用于路由结构键 Cue（派活/过载/Need 升级）+ 给老师项目级汇报。

## 2. 角色模型（role enum 不变 + 三处指派，D-037 保留）

把 D-026 dec4 合并进 `superAdmin` 的"系统维护者 + 队长"**拆开**——搭建权 ≠ 全队协调权 ≠ 只读观察：

| 能力 | 落点 | 是否 Cue 受众 |
|---|---|---|
| 搭建权（组织树/赛季/角色配置） | `Member.role='superAdmin'`（收窄含义） | ❌ 配置面，不收 Cue |
| 全队协调权（跨组调度） | `Project.captainMemberId`（新增） | ✅ `teamCoordinator`（仅结构键） |
| 只读观察（项目级） | `Project.observerMemberIds[]`（新增） | ❌ 仅 pull 项目级 rollup |
| 组长（带某组） | `Group.leadMemberId`（新增） | ✅ `subjectGroupLead`（仅结构键） |

- **`Member.role` enum 不变** `{superAdmin, groupAdmin, member}`，零迁移。`groupAdmin` = 可 pull 本组事/缺口的
  **可见性能力**，子组组长 vs 大组组长都是 `groupAdmin`、由 `groupId` 区分，不另立角色。
- **`Group.leadMemberId`** = 该组组长权威源，消"一组两个 groupAdmin 谁是组长"歧义。校验不变式：指向成员 role ≥ groupAdmin。
- **`Project.captainMemberId`** = 队长（全队协调负责人）；**`Project.observerMemberIds[]`** = 老师（多对多）。
  队长/老师不进 enum：赛季级 + 与组长正交 + observer 多对多（1:1 enum 装不下、塞进去要 junction = 违 C3）。
- **D-037 强调**：这三处指派只决定**结构键 Cue 的去向 + 项目级汇报的可见性**，**不**让任何人收到"某个人怎样了"。

## 3. audience 枚举 + 解析（D-037：人键只 taskOwnerPrivate）

```
GovernanceCueAudience = 'taskOwnerPrivate' | 'subjectGroupLead' | 'teamCoordinator'
```

- **`taskOwnerPrivate`** → `subjectRef→owner→larkOpenId` 私发，**不存 memberId**、**不沉淀按人历史**（送达层即时解析）。
  **人键 Cue（silence / capacityFreed 给予 / 被卡去学）只用此值**，绝不路由第三方（I0）。
- **`subjectGroupLead`** → 仅**结构键** Cue（uncovered 派活缺口 / needEscalation / overload）。先按 subject 取
  groupId（`task→task.groupId` · `group→group.id` · `need→need.providerGroupId`），经 `Group.leadMemberId`
  解析；**有界**上溯 子组→大组(`reportingGroupId`，复用 D-029 `topLevelGroupId`)→`teamCoordinator` 兜底。
- **`teamCoordinator`** → `Project.captainMemberId`，仅结构键 Cue（跨组协调 / 机会导向协调视图）。为 null 见 §8。

> 解析必须是**全函数**（`resolveSubjectGroupLead` 纯函数，返回 `{memberId|null, fellBackToCaptain}`），
> 无 lead 时落兜底，绝不路由到 NOBODY。

## 4. 路由表（Cue kind × 受众，D-037 收窄）

| kind | 私发 `taskOwnerPrivate`（本人帮助） | 协调面（结构键·组键） | 升级 → `teamCoordinator` |
|---|---|---|---|
| `blocked` | 「这段可看的资料」(give)+knowledge | 卡点链作为结构对协调者可见 | 「这条链卡在 `<任务Y>`，去疏通」(**事键**) |
| `silence` | 「还在做 `<任务X>` 吗?」(ask)+AI 建议 | **无**（只回本人；停滞作为任务态在共享进度表被动可见） | **永不**（I0/A4） |
| `capacityFreed` | 「看看可接的活 / 可学的」(give)+give-floor | 「`<组>` 有余力，可支援过载组」(**组键·前瞻**，gate on 有过载组) | 同左（组键机会导向，非个人空闲点名） |
| `uncovered` | — | 「给 `<组>` 派活」(派活 TODO，结构键空槽) | 全组无人可接 → 队长 |
| `needEscalation` | — | subjectGroupLead(=providerGroup lead)「`<需求>` 挂 N 天」 | 超 `needEscalationDays` → 队长 |
| `overload` | — | 「本组扛 N 项，别再加」(组键) | 「`<组>` 过载，匀走」(组键) |

升级链一句话：**结构键 Cue 默认落本组组长；动作本质跨组（capacityFreed 匀人 / blocked 疏通 / overload 匀走）或
超阈值（needEscalationDays）时再发一条队长 Cue。人键 Cue（silence / 给予）永不升级、永不离开本人（I0）。**

## 5. 可见性分层（双轴：广度 × 深度）

| identity | pull 可见 | push 接收 |
|---|---|---|
| member | **本人私发 Cue（人键帮助）** + 本组任务/需求板 | `taskOwnerPrivate` |
| 组长 groupAdmin | **本组（直属 groupId）**的事/缺口·去名（结构键） | 作 `subjectGroupLead` 时的结构键协调面 |
| 队长 captain | **全队**·组键的事/缺口 + 机会导向协调视图（**零人名/零计数**） | `teamCoordinator`（结构键） |
| 老师 observer | 仅 `toObserverRollup`（大组级项目进度 + 缺口数，**零人名**） | 无 |
| superAdmin | 配置面（组织树/赛季/角色）；治理 Cue 仅当兼任 captain/组长 | 配置类通知 |

> **不变式**：没有任何层级（含队长、老师）看得到"某个人在不在产出 / 完成量排名"（C2 + I0）。越高 = 事/缺口
> **广度**越宽，绝非人**粒度**越细。**人键帮助只到本人**；管理者面只见结构。

## 6. 机会导向协调视图（D-037，取代旧"问责上移"）

旧 D-033 §6"问责上移"（把 silence 停滞 surface 给本组组长、组长用注意力发现+判定）**已废除**——理由：真想帮
学弟早就线下问了，管理者面只多监视味、零增益。取而代之，对"没派活 / 被卡 / 没主动接活"这类**空闲 + 无主动**：

- **拆三 case**：① **没派活** = 队长的缺口（"这些活还没派人"= `uncovered` 派活 TODO，结构键空槽、前瞻，**非成员
  判断**）；② **被卡** = 结构已正名（卡点在依赖图上可见）；③ **没自己主动** = 唯一关于人的部分 → **不建"谁没主动"
  探测器**，本人收 AI「可接的活 / 可学的」、那个空槽 / 停滞任务**在共享进度表被动显形**（任务态、pull、中性、顺手
  可见），系统**从不主动说"X 没在主动"**。
- **管理者只看工作分配视角**：待派的活（uncovered）+ 过载组（overload）+ **某组前瞻余力**（capacityFreed 协调面，
  "`<组>` 有余力可支援"、组键、机会措辞）。队长靠它再平衡负载——**点谁去由组长定**，系统不点名。
- **「X 有余力可支援」(前瞻机会) ≠ 「X 没在干活」(回溯判断)**：协调面只说前者（forward、opportunity），永不说后者
  （backward、judgment）。这是 silence（看人活动）与 overload/capacity（看工作分配）的分界。

## 7. 重合（一人多帽）

一人可同时 `role=groupAdmin` + `Group.leadMemberId` + `Project.captainMemberId` + `observerMemberIds`，正交分布
在不同实体上、天然多帽，不需要多值 roles 数组。有效可见性 = 帽子并集。送达层 dedupe：`subjectGroupLead==
teamCoordinator` → 一条结构键 DM；`owner==lead/captain` → 因人键 Cue 本就只回本人、结构键协调面又是组键，天然
不会"和自己聊"，无需特殊抑制。

## 8. 反监视自检 + 坦白边界（D-037 取代 k-anon 机器）

D-037 后**不再对第三方暴露人**，故旧 §8 的"去名宽视图 / factStatement 文本红线 / 老师 k-anon rollup / 良基兜底 /
dedupe"——它们多数是为"第三方人-暴露站得住"而生——大幅简化。仍守 + 新增坦白：

- **人键 Cue 永不离开本人**（落单测）：`silence` / `capacityFreed`(give) / `blocked`(give) 的受众断言只
  `taskOwnerPrivate`；非私发 Cue 不含任何 `displayName`/`ownerLabel`（结构键只填任务/组/Need 名）。
- **结构键宽视图去名**：队长全队视图 / 老师 rollup 的节点一律组键、零人名、零计数（`toDepGraphView` 跨组宽视图
  `ownerLabel=null`；`toObserverRollup` 丢所有 displayName、只给大组级进度 + 缺口数）。
- **坦白小团队反推边界（取代 k-anon 幻觉）**：5–15 人团队里"`<组>` 有余力"几乎一定能反推到人（电控组就仨人）。
  **纯匿名做不到**，承认它。真护栏不是匿名算法，而是：**① 机会措辞**（"可支援" ≠ "没干活"）；**② 调度最小单位是
  人、但点谁去由组长定，系统不点名**；**③ 人在环**（管理者用自己的判断 + 线下对话，系统只摆结构）。
- **不沉淀按人历史**：`taskOwnerPrivate` Cue 不持久化为可按 owner 聚合的记录；任何视图不出现"某人被提示/空闲 N 次"。
- **null captain**：`teamCoordinator` 结构键 Cue 变 pull-only（console 对 groupAdmin 可见）+ 一条 superAdmin 配置
  提示「未指定队长，协调提示无人接收」，**绝不静默丢**跨组升级。

## 9. 落地要求（给 frontier 的 schema / 测试清单）

实现时（GOV-MEMBER-STATUS-DERIVE / GOV-RULES-LAYER / HUB-SERVER-GOV-SCAFFOLD）须落：
- schema：`Group.leadMemberId` · `Project.captainMemberId` + `observerMemberIds[]` · `GovernanceCueAudience`
  三值 · `GovernanceSnapshot` 带 captain/observer（送达层解析 teamCoordinator 不另查 Project）。
- 纯函数：`resolveSubjectGroupLead`（全函数 + 兜底）· `toObserverRollup`（组键去名）· dedupe（送达层）。
- 测试（沿用 governance.test.ts:69-75 / schedule.test.ts:78-86 反排名 guard 体例）：**人键 Cue 受众只 taskOwnerPrivate
  · 非私发 Cue 无 displayName · 结构键宽视图 ownerLabel=null · 无按人历史聚合结构**。

## 10. 事实源

本 spec；`D-033`（角色模型 + 受众路由）/ **`D-037`（定位回中 + 人键自指化 + 机会导向协调视图 + 核心不变式 I0）**；
`docs/design/gov-cue-layer.md`（GovernanceCue schema + §3/§4 路由）；`docs/design/gov-data-model.md` /
`gov-oncall-schedule.md`（reportingGroupId/topLevelGroupId，D-029）；`AGENTS.md §5`（I0 + 宪法 C/G/A）；
`docs/design/team-hub-concept.md`（canonical）。
