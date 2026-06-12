---
status: spec
written_at: 2026-06-11
activated_by: D-032
revised_by: D-033 (受众路由) / D-037 (定位回中 + silence 自指化)
note: GOV-MEMBER-STATUS-DERIVE(frontier#2) 与 GOV-RULES-LAYER 的当前 spec。受众路由见 gov-role-visibility.md(D-033)；**D-037** 把 silence 收为纯自指（只回本人 + AI 指引、不上报任何管理者），capacityFreed 队长面改"机会导向协调视图"，并把 D-034 的 k-anon / 保守铁律重机器降级为低风险自助提示。核心不变式 I0：人键只回本人当帮助、第三方只见结构键。
---

# 协作提示层 GovernanceCue（D-032，D-037 去监视化）

## 0. 一句话

协作层所有"派生出来的事 / 缺口 / 机会"收成**一个统一对象 `GovernanceCue`**：主体永远是 `task / group / need / resource`（**绝无 memberId 聚合维度**），配一个建设性动作（去学 / 去聊 / 去派 / 去支援 / 去开口）+ 受众路由。本质是多态：同一个 Cue，`audience` 不同就送给不同的人。**核心不变式 I0（D-037）**：`audience='taskOwnerPrivate'` 的人键 Cue 只回本人当帮助；其余受众一律只收**结构键**（事 / 组 / 资源 / 需求），永不收到"某个人怎样了"。反排名红线守在这一个 schema + I0 上。

## 1. 背景：为什么统一（讨论 2026-06-11，D-037 去监视化）

`freeIdle` 会把"队长还没录入下一个任务"的人误判成"摸鱼"——系统自己制造了"摸鱼=测量错误"。idle 检测的产物**不该是贴人身上的标签，而该是建设性提示的触发器**。它和 `Need` 升级、`OverloadSignal` 是同一个形状，收成一层。**D-037 进一步分清主语**：凡主语是"人"的（腾出手 / 静默 / 被卡去学），输出**只回本人当帮助**（I0）；凡主语是"事 / 组"的（待安排缺口 / Need 升级 / 过载 / 卡点链），才暴露给协调者——且永远是结构键、机会措辞，不是"谁慢了"。

| 派生出的"事/缺口/机会" | 受众（D-037） | 语气 | 建议动作 |
|---|---|---|---|
| 腾出手（有人空了 capacityFreed） | **本人**（给予）；协调视图见**组级前瞻余力** | 给予 / 暴露 | 看看可接的活 / 可学的；协调面"X 组有余力可支援" |
| 待安排（录入缺口 uncovered） | 队长（派活 TODO，**结构键空槽**） | 暴露 | 去给他派活（= 录入入口）；是队长的缺口、非成员判断 |
| 静默（就绪任务却零进展 silence） | **仅本人** | 询问 | 还在做吗 + AI 给本人建议；**不上报任何管理者** |
| Need 升级（缺口没人接） | providerGroup 组长 / 队长 | 暴露 | 这个需求挂 N 天了（事键） |
| 过载（某组扛太多） | 队长 / 组长 | 暴露 | 去支援（组键） |
| 被卡（上游没好，已有） | **本人**（给予资料）；协调者看**卡点链**（结构） | 给予 / 暴露 | 去看资料 / 疏通上游 |

六条全是"派生一个事键 + 配一个建设性动作 + 路由受众，无人名排名"；其中人键三条（腾出手 / 静默 / 被卡去学）的 push 受众**只有本人**（I0）。

## 2. `GovernanceCue` schema（hub-contracts 新增）

```
GovernanceCueKind  = 'blocked' | 'uncovered' | 'capacityFreed'
                   | 'silence' | 'needEscalation' | 'overload'
GovernanceCueTone  = 'give' | 'ask' | 'surface'          // 给予 / 询问 / 暴露
GovernanceCueAudience = 'taskOwnerPrivate' | 'subjectGroupLead' | 'teamCoordinator'   // ← 已定，见 gov-role-visibility.md (D-033)

GovernanceCue = {
  id: string
  kind: GovernanceCueKind
  subjectRef: { type: 'task'|'group'|'need'|'resource', id: string }   // 主体永远是事/组
  audience: GovernanceCueAudience
  tone: GovernanceCueTone
  factStatement: string          // 中性事实，无判断词（不出现"懒/拖/摸鱼"）
  suggestedAction: string        // 建议动作（去学/去聊/去派/去支援/去开口）
  relatedKnowledge: DepNodeKnowledge[]   // 仅 tone='give'（去学）时挂；复用已派生、已过滤 confirmedBy 的资料
  detectedBy: 'derived'
  detectedAt: string
}
```

## 3. 受众路由与"不落人名"（核心不变式 I0；受众边界 → gov-role-visibility.md / D-033，D-037 收窄）

- `audience='taskOwnerPrivate'` **不是存 memberId**，而是"本 Cue 主体任务的 owner"。送达时（触点层）才即时解析 `task.ownerId → larkOpenId` 私发，**不沉淀为 Cue 上可聚合的人维度字段**，且 **D-037：不沉淀按人历史**（不能事后 `groupBy` 出"谁被提示最多"）→ 反排名保住。
- audience 三值（D-033 定，改名取消歧义）：`taskOwnerPrivate`（本人私发）/ `subjectGroupLead`（主体所属组的组长，经 `Group.leadMemberId` 解析、有界上溯大组→队长兜底）/ `teamCoordinator`（队长 = `Project.captainMemberId`）。role enum **不动**；队长 / 老师是项目级指派（`captainMemberId` / `observerMemberIds[]`），superAdmin 收窄为配置、非 Cue 受众。
- **D-037 收窄（I0）**：`subjectGroupLead` / `teamCoordinator` **只承载结构键** Cue（uncovered 派活缺口 / needEscalation / overload / blocked 的卡点链——主语是事 / 组）。**人键 Cue（silence、capacityFreed 的给予、被卡去学）一律只 `taskOwnerPrivate`**，绝不路由给组长 / 队长。silence 的"问责上移"+ 本组 console 事键快照（旧 D-033 §6）已**删**——真想帮学弟早就线下问了，管理者面只多监视味、零增益。
- 路由表 + 角色模型 + 可见性 + 机会导向协调视图 + "坦白小团队反推边界"见 **`docs/design/gov-role-visibility.md`**（D-037 已收窄；k-anon / 良基兜底因不再对第三方暴露人而多数移除）。

## 4. `Member.status` 全派生 + 状态机（GOV-MEMBER-STATUS-DERIVE）

**Task 是真相，人是投影，`Member.status` 禁手写**（杀掉与 `Task.status` 的双写，守 G2）。

`deriveMemberStatus(member, tasks, deps, signals, now, config)`：

| 条件 | 态 | 颜色 | 产出 Cue（D-037 受众） |
|---|---|---|---|
| 无 active 分配任务 | `uncovered`（待安排） | 灰虚线 | `{uncovered, subjectGroupLead, surface, "给 X 派活"}` —— **队长/组长的派活缺口（结构键空槽）**，全组无人可接 → 升 `teamCoordinator`；是队长的 TODO、非成员判断 |
| active 任务被 live 上游卡 | `blocked`（被卡） | 红斜纹+锁 | `{blocked, taskOwnerPrivate, give, "这段可看的资料"}` 给本人 + 卡点链作为**结构**对协调者可见（复用 `BlockAttribution`，已有） |
| active 任务就绪未卡、**本组数据河** N 天无信号（分河见 §6 / D-034） | （仍标 working）→ 触发 `silence` | working 实线 | `{silence, taskOwnerPrivate, ask, "还在做 X 吗?"}` + **AI 给本人建议**；**只回本人、不上报任何管理者**（I0/A4）。停滞事实仅作为**任务态**在共享进度表被动可见（结构、pull、中性），不作为 silence 事件路由给任何第三方 |
| 最近任务 done、无下一个 | `capacityFreed`（腾出手） | 青 | 本人面 `{capacityFreed, taskOwnerPrivate, give, "看看可接的活 / 可学的"+relatedKnowledge}`（give-floor 见下 / D-035）+ 协调面 `{capacityFreed, teamCoordinator, surface, "<组> 有余力，可支援过载组"}`（**subjectRef=group、前瞻"可支援"，非"X 做完了空着"**；gate on 有过载组 OR cooldown） |
| 最近有进度信号 | `working` | 实线 | — |

- **`silence` 与 `capacityFreed` 的区别 = 手里有没有就绪任务**：有（却 N 天无信号）→ 静默（**私下问本人 + AI 建议**）；没有（做完了）→ 腾出手（本人去学 / 接活 + 协调面组级余力）。两者都**不贴"摸鱼"**、都不路由到管理者个人。
- **不抓摸鱼，只正名 + 帮助（I0，D-037）**：系统**不建"谁没主动"探测器**。`silence` 只回本人一条可忽略的询问 + AI 建议；那个就绪却停滞的任务**老实摆在共享进度表上**（任务态、pull、中性），组长 / 队长看板时**顺手**看到、去做人的对话——被动显形 ≠ 系统主动指控。系统**永不**把"某人反复静默"路由给任何第三方。
- **give-floor（A3 纯给予，D-035）**：`capacityFreed` 本人面的 `relatedKnowledge` 从**本人私有** `MemberKnowledge`(relation∈{interested,learning} 的 `KnowledgeNode.resourceLinks`，growth.ts，fixtures.ts:292-295 已 seed) 平铺取，**仅 `taskOwnerPrivate`**——让他自己挑自己存的兴趣（agency 留本人）。D-037 后这不再是"补偿暴露"（不再对第三方暴露人），而就是产品对个人的**纯给予**。整棵知识树（D-027）仍后置；此切片 tree-free、无父子结构。
- **化解前先修正测量（第 4 段意图，D-035 / D-037 去"问责"段）**：`修正测量(兜底) → 暴露(结构) → 化解(帮助)`——`uncovered` 先走"去派活 = 录入入口"、`silence` 先查信号源新鲜度（D-034 分河），别在"未录入 / 信号没接"的假象上开火。

## 5. 五个生产者（= GOV-RULES-LAYER 的实体）

| 函数 | 状态 | 产出 |
|---|---|---|
| `deriveBlockAttributions` | 已有 | `blocked` Cue（本人给资料 + 卡点链结构） |
| `deriveMemberStatus` | 新（frontier#2） | `uncovered` / `capacityFreed` + `silence`；须读 `group.kind` 分河信号 + `artifactUpload` / presence 佐证（D-034） |
| `deriveNeedEscalations` | 新 | `needEscalation`（`Need.status open>阈值 → escalated`，补上 A.3 死代码） |
| `deriveOverloadSignals` | 新 | `overload`（复用已 export 的 `computeCriticalSet`，组级，补上 #4 空壳） |

**余力 ↔ 过载闭环（组级，D-037）**：`capacityFreed` 协调面（"<组> 有余力"）与 `overload`（"<组> 过载"）Cue 在同一层，队长一眼配对**组级余力 ↔ 组级过载**——机会导向、组键、"哪组能匀给哪组"，系统替队长指出来、**不点具体的人**（点谁去由组长定；小团队反推边界见 gov-role-visibility §8）。

**四段意图（D-035 / D-037 去"问责"）**：生产者整体遵循 `修正测量(兜底) → 暴露(结构) → 化解(帮助)`，化解叉 3a 人力调度（匀过载，组级协调面，captain）/ 3b 自我成长（知识树 D-027 **整棵后置**，仅 give-floor 这块"本人私有兴趣链"tree-free 切片现在做、**仅本人**）。`capacityFreed` 协调面 gate on (有过载组 OR cooldown)，无过载且无 give 时不打扰队长。

## 6. `RulesConfig` 阈值（per-project，全有默认值，不强制录入，C1/C3）

`silenceDays`（**按 GroupKind 配**：硬件 mechanical/electrical 更长；默认软件 3） · `silenceCueCooldownDays`（同任务每窗至多一条**自指**提示，杀累积打扰，A4） · `needEscalationDays=2` · `overloadCriticalLimit=3` · `commitSilenceWindow=7d`（备赛 / 摸底节奏不同可改）。

**数据生命线分组化（D-034，= silence 信号源的真正修法 C5）**：silence 的"零进展"按组分河——机械/电路河 = **图纸版本上传**（`ProgressSignalKind='artifactUpload'`，archive-first 见 `gov-data-model.md`），程序河 = **git**（经薄封装 adapter 降门槛），通用兜底 = **larkCheckIn**（须回 Cue/digest 的自然副产品，非日报打卡 C5）。

**D-037 降级（重机器只为指控而生，指控没了就拆）**：silence 既然**只回本人当帮助**，D-034 那套为"给第三方建站得住的指控"而生的脚手架（per-kind 强弱触发、k-anon、良基兜底）降级为**尽力而为的低风险自助提示**——误判代价只是"本人收到一条不太用得上的好心建议"，不再是"被错误上报给管理者"。仍保留的最小约束：
- **分河仍需要**（仍要知道"有没有进展"才决定要不要给本人提示）；
- **保守过渡铁律降为"别打扰"礼貌**：各组的河真实接入前，非 program 组的 git 缺失不触发 silence（硬件本就难卡，宁漏报不打扰）；
- **presence 佐证**：owner 当窗在某 `ResourceSession` present/onCall（物理在场干活）→ 抑制 silence（复用 `derivePresenceSchedule`，零新录入）；
- **parity 单测**（仍要、护栏体例不变）：仅差 `group.kind`、相同 check-in/note 历史的两任务 → 必须出相同 silence 判定（gitCommit 计数对非软件组 silence 可证明不承重）。

## 7. 反排名不变式（守在一个 schema + I0 上）

- `GovernanceCue` 无 `memberId` 字段、无 `count/score/rank/percent/duration`。
- 受众到人靠送达层即时解析，不存可聚合的人维度。
- 单测锚定：任一 Cue 输出 `Object.keys` 不匹配 `/member|owner|count|score|rank|percent|completed|duration/i`（与现有归因测试同护栏）。
- **人键只回本人（I0，D-037，取代旧"暴露必带给予"）**：`silence` / `capacityFreed`(give) / `blocked`(give) 等人键 Cue 的 push 受众**只能是 `taskOwnerPrivate`**——单测断言这三类 Cue 永不出现 `subjectGroupLead`/`teamCoordinator`。由此 D-035"暴露必带给予"失去前提（不再对第三方暴露人）、被本不变式收编：面向个人 = 纯给予，结构上无"第三方人-暴露"可补偿。
- **自指 Cue 不沉淀按人历史（D-037）**：`taskOwnerPrivate` Cue 不持久化为可按 owner 聚合的历史——单测断言送达层无"某人被提示 N 次"的可查结构。
- **AI 数据边界（D-037）**：给本人的 AI 建议读任务 / 知识上下文，**不读 / 不计算"本人被提醒过几次"**（建议不判定，A4）。

## 8. OPEN / 待议

1. ~~受众路由 队长 vs 组长~~ → **已定（D-033）并经 D-037 收窄**：结构键 Cue 用 `subjectGroupLead`/`teamCoordinator`，人键 Cue 只 `taskOwnerPrivate`；问责上移已删。
2. ~~"没派活 + 被卡 + 没主动接"是否标记管理者~~ → **已定（D-037）= 机会导向协调视图**：管理者只看工作分配视角（待派活 + 过载组 + 组级前瞻余力），不收个人空闲点名；详见 `gov-role-visibility.md` §4/§8。
3. 静默 / 腾出手措辞口吻 + AI 给本人建议的具体内容形态（口吻仍待打磨；冷却窗 `silenceCueCooldownDays` 已落）。
4. 阈值默认值是否需 per-赛季 profile。

## 9. 事实源

本 spec；`D-032`（统一层）/ `D-033`（受众路由）/ `D-034`（数据河）/ `D-035`（give-floor）/ **`D-037`（定位回中 + silence 自指化 + 核心不变式 I0）**；`docs/design/team-hub-concept.md`（canonical 产品 + 架构）；`docs/design/gov-role-visibility.md`（受众 / 机会导向协调视图）。
