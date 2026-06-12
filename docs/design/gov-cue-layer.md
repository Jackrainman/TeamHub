---
status: spec
written_at: 2026-06-11
activated_by: D-032
note: GOV-MEMBER-STATUS-DERIVE(frontier#2) 与 GOV-RULES-LAYER 的当前 spec。受众路由（队长 vs 组长）标为 OPEN，待 ROLE-VISIBILITY / CUE-AUDIENCE-ROUTING 讨论后再细化。
---

# 治理提示层 GovernanceCue（D-032）

## 0. 一句话

治理层所有"派生出来的事 / 缺口 / 机会"收成**一个统一对象 `GovernanceCue`**：主体永远是 `task / group / need / resource`（**绝无 memberId 聚合维度**），配一个建设性动作（去学 / 去聊 / 去派 / 去支援 / 去开口）+ 受众路由。反排名红线守在这一个 schema 上，不在五处分别防漏。本质是多态：同一个 Cue，`audience` 不同就送给不同的人。

## 1. 背景：为什么统一（讨论 2026-06-11）

`freeIdle` 会把"队长还没录入下一个任务"的人误判成"摸鱼"——系统自己制造了"摸鱼=测量错误"。重设计时发现：idle 检测的产物**不该是贴人身上的标签，而该是建设性提示的触发器**。再一看，它和 `Need` 升级、`OverloadSignal` 是同一个形状：

| 派生出的"事/缺口/机会" | 受众 | 语气 | 建议动作 |
|---|---|---|---|
| 腾出手（有人空了） | 本人 + 队长 | 给予 / 暴露 | 看看别的知识 / 去聊·匀给过载组 |
| 待安排（录入缺口） | 队长 | 暴露 | 去给他派活（= 录入入口） |
| 静默（就绪任务却零进展） | 本人 + 队长 | 询问 / 暴露 | 还在做吗·卡了说一声 / 事级"X 静默 N 天" |
| Need 升级（缺口没人接） | providerGroup 组长 | 暴露 | 这个需求挂 N 天了 |
| 过载（某组扛太多） | 队长 / 组长 | 暴露 | 去支援 |
| 被卡（上游没好，已有） | 本人 + 队长 | 给予 / 暴露 | 去看资料 / 疏通上游 |

六条全是"派生一个事键 + 配一个建设性动作 + 路由受众，无人名排名"。

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

## 3. 受众路由与"不落人名"（关键不变式；受众边界已定 → gov-role-visibility.md / D-033）

- `audience='taskOwnerPrivate'` **不是存 memberId**，而是"本 Cue 主体任务的 owner"。送达时（触点层）才即时解析 `task.ownerId → larkOpenId` 私发，**不沉淀为 Cue 上可聚合的人维度字段** → 反排名保住（你无法 groupBy 人去数谁被提示最多）。
- audience 三值（D-033 关闭 OPEN，改名取消歧义）：`taskOwnerPrivate`（本人私发）/ `subjectGroupLead`（主体所属组的组长，经 `Group.leadMemberId` 解析、有界上溯大组→队长兜底）/ `teamCoordinator`（队长 = `Project.captainMemberId`）。role enum **不动**；队长/老师是项目级指派（`captainMemberId` / `observerMemberIds[]`），superAdmin 收窄为配置、非 Cue 受众。
- 路由表（Cue kind × 受众 × 升级链）+ 角色模型 + 可见性双轴 + 问责上移（silence 纯 pull）+ 审计必修（去名宽视图 / factStatement 文本红线 / 老师 k-anon rollup / 良基兜底 / dedupe）全部见 **`docs/design/gov-role-visibility.md`**。

## 4. `Member.status` 全派生 + 状态机（GOV-MEMBER-STATUS-DERIVE）

**Task 是真相，人是投影，`Member.status` 禁手写**（杀掉与 `Task.status` 的双写，守 G2）。

`deriveMemberStatus(member, tasks, deps, signals, now, config)`：

| 条件 | 态 | 颜色 | 产出 Cue |
|---|---|---|---|
| 无 active 分配任务 | `uncovered`（待安排） | 灰虚线 | `{uncovered, captain, surface, "给 X 派活"}` |
| active 任务被 live 上游卡 | `blocked`（被卡） | 红斜纹+锁 | 复用 `BlockAttribution`（已有），转 `blocked` Cue |
| active 任务就绪未卡、N 天无进度信号 | （仍标 working）→ 触发 `silence` | working 实线 | `{silence, taskOwnerPrivate, ask, "还在做 X 吗?"}` 仅私发本人；**不 push 任何第三方**——停滞以事键快照「任务X·就绪·无进展」在本组 console pull 显示（问责上移，D-033 §6），永不升级对人可见(A4) |
| 最近任务 done、无下一个 | `capacityFreed`（腾出手） | 青 | `{capacityFreed, taskOwnerPrivate, give, "看看别的知识?"+relatedKnowledge}` + `{capacityFreed, captain, surface, "X 做完了，去聊聊 / 可匀给过载组"}` |
| 最近有进度信号 | `working` | 实线 | — |

- **`silence` 与 `capacityFreed` 的区别 = 手里有没有就绪任务**：有（却不动）→ 静默（私下问本人）；没有（做完了）→ 腾出手（去学 + 队长去聊）。两者都**不贴"摸鱼"**。
- "真摸鱼"不靠系统 push 点名发现：`silence` 只私发本人一条可忽略的询问、第三方零 push；停滞事实在本组 console（事键快照、**不持久化按人历史**）由组长自己注意 + 判定（问责上移）。系统**永不**把"某人反复静默"surface 给第三方（A4 红线 + D-033 §6）。

## 5. 五个生产者（= GOV-RULES-LAYER 的实体）

| 函数 | 状态 | 产出 |
|---|---|---|
| `deriveBlockAttributions` | 已有 | `blocked` Cue |
| `deriveMemberStatus` | 新（frontier#2） | `uncovered` / `capacityFreed` + `silence` |
| `deriveNeedEscalations` | 新 | `needEscalation`（`Need.status open>阈值 → escalated`，补上 A.3 死代码） |
| `deriveOverloadSignals` | 新 | `overload`（复用已 export 的 `computeCriticalSet`，组级，补上 #4 空壳） |

**idle ↔ overload 闭环**：`capacityFreed` 与 `overload` Cue 在同一层，队长一眼配对"这人空了 ↔ 那组压了 N 项"——"做完了去聊聊"聊完调去哪，系统替他指出来。

## 6. `RulesConfig` 阈值（per-project，全有默认值，不强制录入，C1/C3）

`silenceDays=3` · `needEscalationDays=2` · `overloadCriticalLimit=3` · `commitSilenceWindow=7d`（备赛 / 摸底节奏不同可改）。

## 7. 反排名不变式（守在一个 schema 上）

- `GovernanceCue` 无 `memberId` 字段、无 `count/score/rank/percent/duration`。
- 受众到人靠送达层即时解析，不存可聚合的人维度。
- 单测锚定：任一 Cue 输出 `Object.keys` 不匹配 `/member|owner|count|score|rank|percent|completed|duration/i`（与现有归因测试同护栏）。

## 8. OPEN / 待议

1. ~~受众路由 队长 vs 组长~~ → **已定（D-033，`docs/design/gov-role-visibility.md`）**：audience 三值 + 路由表 + 角色模型 + 问责上移。
2. 静默措辞口吻 + 同一任务提示频率上限（冷却窗口）→ 冷却窗 `silenceCueCooldownDays` 由 D-034 落 `RulesConfig`；口吻仍待打磨。
3. 阈值默认值是否需 per-赛季 profile。

## 9. 事实源

本 spec；`D-032`（决策）；`docs/design/team-hub-concept.md`（canonical 产品+架构）；讨论记录见 `decisions.md` D-032 上下文。
