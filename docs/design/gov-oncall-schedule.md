---
status: stable
date: 2026-06-11
owner: Teamhub
scope: governance-schedule
decision: D-029
implements: D-026 第②规则层（按依赖位置差异化在场）+ 第③展示层"谁该在场"一屏
---

# 差异化在场排班 — 数据模型 + 一屏交互设计

> 数据模型与派生纯函数落地于 `apps/hub-contracts/src/{governance,schedule}.ts`（`derivePresenceSchedule`，11+ 单测）。
> 控制台"谁该在场"活页面为下一原子任务 `GOV-SCHED-VIZ-DESIGN`（本文档即其页面状态 + API mock 设计前置）。

## 0. 为什么是杀手锏（通用 PM 没有）

通用 PM（Jira / Linear / 飞书项目）调度的是**任务**，隐含假设：人可并行、资源是抽象的。机器人战队场景有它们没有的两条硬约束：

1. **单一共享物理资源（实车）= 硬串行点**：同一时刻车只能给一拨人，其状态门控所有下游。
2. **物理共处要求**：要人在实验室、车在你手上才能干活。

于是"今晚 / 明天你这角色要不要在场"**不是一张要人手填的排班表，而是从 DAG + 车可用性派生出来的结论**。差异化（程序熬夜调车、机械电路"一车一技术支持"on-call、被卡的今晚直接别来去学）由**依赖位置 + 资源状态**自动落出 —— 直击锚点痛点："被卡的人来了也只能空耗、火大、伤团结"，以及"程序组永远最后一关、要燃尽"。

## 1. 数据模型（`governance.ts`，D-029）

三个新概念，全部沿用既有 schema 约定（组键、派生优先、AI 建议需人确认）：

| 实体 | 角色 | 关键字段 |
|---|---|---|
| `SharedResource` | 共享物理资源升一等公民 | `status: available\|inUse\|down\|upgrading` + `statusReason`（"撞坏维修中"，中性事实）+ `robotTarget`（对齐 Task）|
| `ResourceSession` | 占用窗口（队长一拍即录，低录入 C1）| `windowLabel`（粗粒度，不锁 enum）+ `orderInWindow`（窗口内接力："先程序后机械"）+ `holderGroupId/holderTaskId` + `invitedMemberIds[]`（单窗名单）+ `note` + `confirmedBy`（C4）|
| `PresenceRecommendation` | 派生输出（组键，**无人维度**）| `mode: present\|onCall\|free` + `reason` + `relatedKnowledge[]`（free 挂"可看的资料"，A3）|

**关键决策（D-029）**：
- 资源升一等实体 → "车撞坏 = `status='down'`，一个状态翻转整片下游变 free"，不必手摆 N 条 pairwise 边。
- 窗口粗粒度 + 接力顺序（`orderInWindow`），**不锁定钟点**（`startsAt/endsAt` 留 open）。
- 一次可选多组多人 + 备注：`ResourceSession.invitedMemberIds` 承载，但**仅本窗操作名单，绝不跨窗按人累计**。

## 2. 派生规则（`derivePresenceSchedule`，MVP 启发式）

输入 = `ScheduleSnapshot`（治理快照 + resources + resourceSessions）+ `windowLabel`。逐条 confirmed session：

1. 持有该窗口资源的组 → **present**（接力则多组，各带 `orderInWindow`）。
2. 持有任务的 live 未完成上游组 → **onCall**；若该组上游任务**全是 `blockedIdle`** 则降为 **free**。
3. 被卡而空闲（`blockedIdle`，复用 `deriveBlockAttributions`）的组 → **free**，挂"这段时间可以看的资料"。
4. 资源 `down/upgrading` → holder + 所有 require 它（`robotTarget` 对齐）的组 → **free(`resourceDown`)**。
5. 与窗口资源 / 持有任务**无任何依赖关系**的组 → **不产生建议（沉默，A4）**。
- 优先级 `present > onCall > free`（同组跨 session 取最高）。

**锚点场景验证**（今晚 R1 归程序调总联调，`scheduleScenarioFixture`）：

| 组 | 派生 | 因为 |
|---|---|---|
| 程序 | 🟢 **present** | 持有 R1，做「R1 总联调」（最后一关）|
| 电控 | 🟡 **onCall** | 「R1 底盘调试」在上游链上仍在攻坚 |
| 电路 | 🟡 **onCall** | 「R1 新版电路板验证」上游、要和电控一起看 |
| 视觉 | ⚪ **free** | 被底盘卡住 → 挂"R2 同款视觉代码 / 去年底盘中断笔记" |
| 机械 | （沉默）| 机械臂已装完，今晚链上无活 → 不产生建议 |

车撞坏变体（`scheduleResourceDownFixture`，R1 `down`）：R1 链相关组（程序 / 电控 / 电路 / 视觉）整片 **free(resourceDown)**；只跑 R2 的机械沉默。

## 3. 一屏交互（"谁该在场"，下一任务实现）

```
┌─ 谁该在场 · R1 · 联调冲刺 ─────────────────[ 今晚 ▾ ]┐
│  实车 R1   ● 在用 — 程序组「R1 总联调」     [改占用▾] │
│  实车 R2   ○ 空闲                                     │
│  ┌────────┬──────────┬──────────────────────────────┐ │
│  │ 程序组 │🟢 在场    │ 持有 R1，总联调（最后一关）  │ │
│  │ 电控组 │🟡 随叫    │ 底盘调试上游，仍在攻坚       │ │
│  │ 电路组 │🟡 随叫    │ 新版电路板，要和电控一起看   │ │
│  │ 视觉组 │⚪ 今晚不用来│ 被「底盘调试」卡住 · 可看的资料→│
│  └────────┴──────────┴──────────────────────────────┘ │
│  ⚠ 程序组连在关键链 → 别再往这组加新任务（私下，组级）│
└────────────────────────────────────────────────────────┘
```

### 页面状态（GOV-SCHED-VIZ 前置）
- `windowLabel`：当前窗口选择（默认"今晚"），下拉切换 → 重新派生。
- `resources[]`：资源条（状态点 + `[改占用]` 入口）。
- `recommendations[]`：`derivePresenceSchedule` 派生结果，按 `mode` 分色：
  - present = 绿实心 🟢 + 接力序号（present 多组时）；onCall = 琥珀 🟡；free = 灰空心 ⚪。
  - free 行右侧"可看的资料→"中性入口（链 `relatedKnowledge`，复用 DepGraph"被卡去学"样式）。
- `⚠ overload` 行：读 `OverloadSignal`（组级、私下），**非本派生产出**（待 GOV-RULES-LAYER 完整阈值检测）。

### API mock 设计
- `GET /api/schedule/presence?window=今晚` → `PresenceScheduleResponseSchema`（`{ windowLabel, recommendations[] }`），mock 由 `derivePresenceSchedule(scheduleScenarioFixture, now, window)` 派生（不硬设状态，与 DAG 页同构）。
- `GET /api/schedule/resources` → `SharedResourcesResponseSchema`。
- `[改占用]` 写入 = `POST /api/schedule/sessions`（`ResourceSessionSchema`）—— 真实写路径后置（hub-server 仍 mock-first，待服务器审批）。

## 4. 反监视自检（C2 / A1，红线不动）

- **输出无人维度**：`PresenceRecommendation` 主键是 `group/resource/task`，结构上无 `memberId`、无出勤计数 / 时长聚合 → groupBy 不出"谁在场最久"。单测断言 key 不匹配 `/member|count|score|rank|percent|completed|duration|attendance/i`。
- **名单只在输入侧、不跨窗累计**：`ResourceSession.invitedMemberIds` 是队长单窗操作名单；**不做任何按人聚合视图**，所以累计不出"出勤排名"。
- **事实陈述零人名**：`factStatement` 模板只填组 / 任务 / 资源名（单测断言不含人名）。
- **mode 是需求陈述、不是产能分**："程序组在场"是*这段工作需要谁在*，不是*谁干得多*。与 06-11 定调一致："该看的是谁被什么卡 + 谁要燃尽，皆任务 / 依赖键"。

## 5. Open（留用户线下，标进 now.md open_for_decision）

1. **窗口精确语义**：是否需要 `startsAt/endsAt` 钟点？当前用粗粒度 `windowLabel` + `orderInWindow`，够不够表达"今晚程序先调到 22 点再给机械"。
2. **invitedMemberIds 的展示边界**：单窗名单在 UI 上展示到什么程度（"今晚来的人"是否显示具体人名），既要可操作又不能沉淀成出勤档案。
3. **overloadRelief 的触发**：`⚠ 别再往这组加` 依赖 `OverloadSignal` 的完整派生（沉默 / 阈值 / 关键链负载），归 `GOV-RULES-LAYER-DESIGN`。
4. **真实占用来源**：`ResourceSession` 是队长手录，还是可从飞书 check-in / Git 活动派生（"程序在 R1 上有 commit → 推断在用"），归 `GOV-LARK-DERIVE-DESIGN`。
