# 今日计划：每车预设 + 表格录入 / 泳道图调整

> **状态：讨论中（DRAFT，未 commit）**。源对话 2026-06-24：把"每天排班"从「预烤 seed + 浮层加一棒」改成「每车预设一键铺表格 → 微调 → 进泳道图调整」。
> 本稿先做**字段梳理**，再立**数据模型**，决策点留 §6 待用户拍。确认后才 commit。

---

## 1. 痛点（三个叠在一起）

1. **示例排班被预烤进数据库**：`FileGovStore` 只在文件不存在时 seed 一次、之后永不重 seed；seed 的 `windowLabel` 又写死成 `2026-06-21`/`06-28` → 换天打开第一屏空屏（「这天还没排机器人」）。
2. **现「加一棒」是浮层选车选任务**（`RelayCanvas.tsx` 加一项浮层），多车每天从零排会炸。
3. **缺一个「每车默认阵型一键铺开」的入口**——每车平时就那套（默认电控、或电控+视觉），只有少数车每天有变（电路坏了/视觉在调）。

**核心转向**：今天的排班**不该预烤**，应是今天现场几秒钟「按每车预设铺出来 + 改几行」。耐久的只有**车 + 每车预设**；「今天」现用现生成 → 永不变质。

---

## 2. 字段梳理（三个 schema 实测，apps/hub-contracts/src/governance.ts）

### 2.1 `ResourceSession` —— 每天每车一条 = 今日计划的核心记录

| 字段 | 含义 | 现状 | 在新「今日计划」里 |
|---|---|---|---|
| `id` `projectId` | 系统主键 | 系统 | 系统，不露 |
| `resourceId` | 哪台车 | 录入（选车） | **表格列①：车**（显示 displayCode 如 26R1） |
| `holderGroupId` | 哪个组 | 录入（选组） | **表格列②：负责组**（预设默认值来源） |
| `holderTaskId`（可空） | 关联任务「R1 总联调」 | 录入（选任务） | **表格列③：今日任务**（轻量录入，见 §6 D1） |
| `orderInWindow` | 接力顺序 0,1,2… | 画布 ▲▼ 调 | **不在表格，留给泳道图** |
| `eta` | 预估完成「约22:30」 | 画布内联编辑·**内存不落盘** | **不在表格，留给泳道图** |
| `note`（可空） | 自由备注 | 少用 | 可选，表格末列或省 |
| `invitedMemberIds` | 本窗操作名单 | 存在但 **I0 红线** | **绝不显示给第三方 / 表格不出现**（carry-over 恒清空） |
| `source` | human/aiSuggested/derived | 系统 | 系统 |
| `confirmedBy` | 确认人 ActorRef | 系统 | 系统 |
| `createdAt` `windowLabel` | 时间戳 / 日期串 | 系统（windowLabel = 这天） | 系统 |

### 2.2 `SharedResource` —— 车（耐久，赛季初建一次）

| 字段 | 含义 | 现状 | 结论 |
|---|---|---|---|
| `name` `kind` `robotTarget` `season` `version` | 车的身份 | 在「机器人清单」页录 | 不动（建车时录，非每日） |
| `displayCode` | 派生编号 26R1 | 系统派生·禁手写 | 不动 |
| `status` `statusReason` `statusSource` | 在用/维修/退役 | 「机器人清单」页管 | 不动（影响能不能上场） |
| **`defaultPreset`（新增）** | **每车默认阵型** | — | **§6 建议加**：`{ defaultGroupIds, defaultTaskTitle? }` |

### 2.3 `Task` —— 任务

| 字段 | 含义 | 与今日计划的关系 |
|---|---|---|
| `title` | 「R1 系统调试」 | 今日计划列③显示的就是它 |
| `intrinsicComplexity` | **任务难度** easy/medium/hard | ★难度是**任务的属性**，不是预设字段（澄清：常规任务 ≠ 任务难度） |
| `convergenceScope='allLeafGroups'` | **总联调标记** | ★**总联调 = 任务的一个属性/状态，不是日期类型**（与用户判断一致，无需做「日类型」） |
| `groupId` `ownerId` `robotTarget` `status` `lastProgressAt` … | 任务其余属性 | 任务自己的事，今日计划不录 |

---

## 3. 分类结论（用户要的：显示 / 录入 / 删改 / 保留 / 加）

- **表格显示+录入（子集）**：车 / 负责组 / 今日任务。← 高频、结构化，工科生填表最顺。
- **留给泳道图（不进表格）**：`orderInWindow`（先后）/ `eta`（预估）/ 接力交接线。← 空间/时序，画布更直观。
- **系统管、不建议动**：id/projectId/windowLabel/source/confirmedBy/createdAt + displayCode 派生。
- **I0 红线、绝不能碰**：`invitedMemberIds` —— 不显示、表格不出现、carry-over 恒清空。反监视底线。
- **建议加**：`SharedResource.defaultPreset`（每车默认组 + 可选默认任务名）。
- **不建议加**：把「难度 / 日类型」塞进预设——难度跟任务走，总联调是任务属性，都不是预设的事。

---

## 4. 数据模型（函数式内核，不走 OOP）

「每车拥有自己的预设、每次调用它」是封装式**思维**，但实现仍是 **数据字段 + 纯函数**，与现有引擎（`derivePresenceSchedule` / `deriveInventoryLedger`）同 grain，不引类层。

### 4.1 数据：车上加一个字段（D2=A 已拍）
```
SharedResource += defaultPreset?: {
  lineup: Array<{ groupId: string; taskId?: string }>;
  // 该车默认阵型：通常 1 条（[电控]），可多条（[电控, 视觉]，= 两条接力 session）。
  // taskId 指向该车的「常驻任务」（D1 复用优先，见 §6.D1 优化）；可空 = 只定组、任务每天填。
}  // optional，向后兼容既有车 / 落盘 JSON（不填 → 该车不参与「使用预设」铺底）
```
> 为什么是 `lineup` 列表而非单 `groupId`：用户提的「默认电控、可能电控+视觉」= 同一台车两个组各一条 session（接力/并行），单字段表达不了。一条 lineup entry → 一条 session。

### 4.2 纯函数 ×2（产出今天的 ResourceSession[]，函数式·零副作用）
- **`deriveTodayPlanFromPresets(resources, date): ResourceSessionDraft[]`** —「使用预设」(**新增**)：
  - 遍历**可上场**车（status 可 board / 非退役维修）；
  - 每条 `lineup` entry → 一条 session 草稿：`resourceId` / `holderGroupId=entry.groupId` / `holderTaskId=entry.taskId ?? null` / `windowLabel=date` / `orderInWindow=lineup 下标` / `invitedMemberIds=[]` / `source='human'`（队长一键铺即视为人工基线）/ `eta=note=null`。
  - **复用优先**（D1 优化）：`taskId` 直接挂常驻任务，**不每天新建** → 不攒垃圾、依赖稳定。
- **`carryForwardPlan(prevDaySessions, date)`** —「继续昨天」(**已存在** = `features/schedule/carry-over.ts`)：继承昨天每车实际占用（组/任务/序），清 eta/note/invited。符合用户「继承昨天谁在用，而非 copy 模板」。

### 4.3 三个动作来源（一张表说清）
| 动作 | 数据从哪来 | 何时用 | 实现 |
|---|---|---|---|
| 使用预设 | 每车 `defaultPreset`（稳定基线） | 新一天从标准阵型起步 | 新纯函数 |
| 继续昨天 | 昨天实际占用 | 联调还在继续，接着走 | 已有 carry-over.ts |
| 手动改 | 现场填表格 | 今天的例外（坏了/在调） | 表格编辑 session |

---

## 5. 交互流程

```
打开某天，还没排
   └─ 自动落到「表格页」
        右上角：[继续昨天]   [使用预设]
            │                  │
            └──── 预填表格 ◄───┘
                    │  改掉例外的那几辆（电路坏了/视觉在调）
                    ▼
                 [确认]
                    │
                    ▼
                泳道图（顺序 / 拉交接线 / 填 ETA）
```
- **表格 ⇄ 泳道图 双向**：泳道图里发现少排一辆 → 能跳回表格加。别单向。
- **「未初始化」判定** = 这天 session 数为 0。

---

## 6. 决策（2026-06-24 用户拍板，三项均选 A）

- **D1 = A ✅ 正式任务 + 轻量录入**：表格「今日任务」格 = 组合框，底层仍挂正式任务（保 PRESENCE 三态智能排班），录入轻。
  - **⚠️ D1 待优化（用户标「标记可能有问题」）= 任务挂接语义**。隐患：每天输任务名若都新建 Task → 攒垃圾任务 + 每个新任务无依赖 → 三态退化。**解法 = 复用优先**：
    1. **常驻任务**：每车 `defaultPreset.lineup[].taskId` 指向该车一个**长期复用**的任务（如 26R1 的「系统调试」是同一个持续任务，不每天新建）；依赖也挂在它上、稳定。
    2. **输名匹配**：表格里输任务名 → 先**按该车现有任务标题匹配复用**；匹配不到才提示「建新任务」（显式确认，非静默暴增）。
    3. **不自动建空依赖任务**：新建的任务依赖留空是正常的——三态只对**有依赖**的任务差异化，无依赖车默认 present，不报错、不假装智能。
  - 此优化需用户最终确认后并入实现清单（本节 §6.D1 即真相）。
- **D2 = A ✅ 默认组 + 默认任务**：`defaultPreset.lineup = [{groupId, taskId?}]`，铺出来组+任务都预填，每天只改例外。
- **D3 = A ✅ 灰掉 + 提示**：赛季第一天无「昨天」→「继续昨天」按钮灰掉 + hover 提示，只能「使用预设」。

---

## 7. 反监视红线（全程守 I0）

预设 / 表格 / 泳道图全程只到**组**级，绝不渲染 / 录入 / 派生 `memberId`、`invitedMemberIds`、出勤维度。carry-over 与新预设函数均恒清空 `invitedMemberIds`。
