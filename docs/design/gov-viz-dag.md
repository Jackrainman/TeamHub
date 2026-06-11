---
status: stable
date: 2026-06-11
owner: Teamhub
scope: governance-viz
decision: D-028
implements: D-026 第③展示层"动态最短任务周期图"（结构+状态版）
---

# 依赖链 · 阻塞归因 — 一屏交互设计

> 落地于 `apps/hub-console/src/features/dep-graph/DepGraphPage.tsx`（`@xyflow/react` + `@dagrejs/dagre`）。
> 目标：让任何人（含大三）**一眼分清"被卡而空闲(正当)"与"摸鱼/自由空闲"**，化解"火大/不团结"。

## 1. 视觉编码（化解火大的核心）

| 状态 | 含义 | 编码 |
|---|---|---|
| `working` | 进行中 | 绿实线竖条 + Activity 图标 |
| **`blockedIdle`** | **被卡而空闲（正当）** | **红实线竖条 + 淡红斜纹背景 + Lock 锁图标** + 副标题"被「上游任务名」卡住"(红) |
| **`freeIdle`** | 自由空闲（真闲） | **琥珀虚线竖条 + 空心 CircleDashed 图标** + "可接任务" |
| `done` / `gap` | 完成 / 缺口(自身挂未满足 Need) | 灰实线降透明 / 红虚线 + AlertCircle |
| `+isCritical` | 关键链 | 蓝发光外环 + ⚡关键链 徽章 |

边：阻塞边(active+上游未完成)=红粗线 + 波浪动画（眼睛自然被吸到卡点）；关键链=蓝粗线；普通=灰。
布局：dagre `rankdir=TB`，散件→拼车→调试→总联调自顶向下；汇总条 `关键链 / 缺口 / 空闲·被卡 / 空闲·自由`。

> 关键对比：`blockedIdle`(斜纹+锁=被封锁) vs `freeIdle`(虚线+空心圆=待填充的空缺)——结构原因不同，视觉一眼可分。**节点上无任何人效/完成量/排名字段（仅 `ownerLabel` 名字），守 C2/A1。**

## 2. "被卡去学"入口（团队规范，非道德绑架）

被卡节点的**详情侧栏底部**显示（条件：`blockedIdle && relatedKnowledge.length>0`，无资料则不显示）：
- 标题"**这段时间可以看的资料**"——主体是资料、说"这段时间"不说"你现在"，逐条客观列（资料来自任务知识标注 + 根因任务标注）。
- **禁止**"你有空去学 / 被卡了记得学习"式针对个人的指责。
- owner 本人另见"**查看我的知识地图**"（第一人称、向内、非考核；D-027 树本体本期占位）。

## 3. 数据接线（mock-first，复用现有模式）

`hub-contracts fixtures` → `toDepGraphView`(派生，非硬设状态) → `src/api/mock/dep-graph.ts` → `client.getDepGraph()`（mock 返回派生视图 / real fetch `/api/dep-graph`）→ `useQuery(['dep-graph'])` → `DepGraphPage`。复用 `StatusPill`/`.panel`/`.metric-tile`/`.state-band`/CSS 色变量；新增 `.dag-node--*` / `.dep-graph-*` 类。

## 4. 真实场景走查（已验证）

`preview:local` mock 数据 = 用户锚点场景。打开"依赖图"页：
- **视觉C**(R1 视觉→运动数据流) = 红斜纹+锁、副标题"被「R1 底盘调试」卡住"、徽章"被卡·等待" → **不会被当成摸鱼**；点开侧栏出现"这段时间可以看的资料"(去年底盘中断笔记/CAN 协议文档/R2 同款视觉代码)。
- **机械D**(R2 备件整理) = 琥珀虚线+"可接任务"(freeIdle) → 与被卡明确区分；汇总条"空闲·被卡 1 / 空闲·自由 1"。
- **电控B**(R1 底盘调试) = 缺口(gap，自身挂 RTOS 未满足 Need)、关键链；红波浪边把注意力导向真正阻塞源。

结论：打开者注意力被导向"底盘何时好/谁能补 RTOS"，而非指责视觉C —— 错误归因被消除。

## 5. 动态编辑 + AI 辅助（设计，未在 MVP 实现）

`[编辑 DAG]` 模式下新建任务：AI 预填建议依赖/Need/知识点 → 人点"确认采纳"才写入（`source=aiSuggested` 未确认不参与归因，C4）。阶段切换 = DAG 版本快照(season/project/stage)。MVP 用规则匹配，不接 LLM。

## 6. 不在本期

R1/R2 泳道分组（dagre TB 已足够表达链路）· 精确工期 · 真实后端 `/api/dep-graph`（可选 Phase D）· 知识树本体页 · 差异化排班。
