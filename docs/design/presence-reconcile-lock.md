# fixture 调和 + 总联调收敛语义 — 字段级/派生级/测试级定稿（locked，路线 C）

> 权威实现规格。消解 D-072 §1/§7.1 给出方向但无字段级/派生级/测试级精度的歧义
> （`presence-resource-redesign.md §7.1 DEFERRED` 标注：「无安全默认、改动会波及 ~9 测试文件」）。
> 本文锁定后，PRESENCE-RECONCILE 阶段② 可无人值守实现、零猜测。
>
> 上游决策：`decisions.md` D-072（组织结构 G/L）+ `presence-resource-redesign.md §1`（调和三步）。
>
> **路线 C（用户 2026-06-21 拍板）= 鱼与熊掌兼得**：总联调「全组各一人」语义**忠实落地**
> （保留收敛任务机制），**同时**把共享 demo 拆成两个场景——「平日差异化」（首屏默认，仍见
> 在场/待命/不加班三态）+「总联调日」（单独演示全组各一人）。详见 §0 与 §10。
>
> **红线复述（全文每处自检，AGENTS.md §2 I0/C2/A1）**：派生输出主键只能是 group / resource / task，
> **绝无 memberId 维度、绝无个人出勤 / 时长聚合**。总联调「全组各一人」语义 = 收敛任务在场要求，
> **不是对人点名**（出场顺序仍是接力链的组键视图）。

---

## 0. 已锁决策（消解设计歧义）

> **⚠️ 阶段② 实现真相 = §11 决议表 + §12 实现清单**（7 个 open question 2026-06-21 全部拍板）。
> §1–§10 为推演留档，**部分按早期默认写**（Q1 保留 id / Q2 保留名单 / Q4 仅 R1 / Q5 后置 console），
> 这 4 项已被决议覆盖——实现以 §11+§12 为准，冲突处后者优先。

> **路线 C 拍板（2026-06-21）**：总联调收敛语义忠实落地，但 demo 拆成两场景。
> A 的核心机制（`convergenceScope` flag + `grp-convergence` sentinel + 全叶子组 upgrade）**全部保留**；
> C 只在 A 之上**多做一步 demo 拆分**——让今晚/首屏展示的不是总联调日、而是一个普通日子，保住差异化三态。
> A 的「今晚=总联调」方案作为「曾考虑/被否」存档（见 §10）。

### 0.1 收敛语义（与 A 一致，全部保留）

| # | 议题 | 决定 |
|---|---|---|
| 1 | 总联调「全组各一人」在 schema 层怎么表达 | 给 Task 加 optional `convergenceScope: 'allLeafGroups'` flag；fixture 里两个总联调任务补此字段，**不新建实体类** |
| 2 | 哪些组算「叶子组」 | 运行时派生：组树中 `parentGroupId !== null` 且没有子组的节点 = 叶子组。当前 fixture：`grp-ec`（电控）/ `grp-vision`（视觉）/ `grp-mech`（机械）/ `grp-circuit`（电路）四个叶子组 |
| 3 | `grp-program` 去领任务身份后它仍存在于 groups 数组吗 | 保留（仍用于汇报视角 / `parentGroupId` 外键 / `reportingGroupId` 上溯）；仅从 tasks 的 `groupId` 切走、不再作任务主责组 |
| 4 | `m-progA`/`m-progB` 归口 | `m-progA` → `grp-ec`（电控）；`m-progB` → `grp-vision`（视觉）；`m-progA` 的 `role` 由 `groupAdmin` 降为 `member`（不再管程序组内部） |
| 5 | 两个总联调任务的 `groupId` 改成什么 | 不再挂 `grp-program`；改用新增 sentinel 组 `grp-convergence`（kind=custom，parentGroupId=null，name='全组联调'）；任务本身的 `convergenceScope:'allLeafGroups'` 是在场派生的信号，`groupId` 指向 sentinel 只是 DAG/PM 归属（挂任何单一叶子组语义都不对） |
| 6 | 总联调的 `ownerId` / `collaboratorIds` | `ownerId=null`（收敛任务无单一负责组长）；`collaboratorIds=[]`（成员移走后清空） |
| 7 | 资源关联（26R1/26R2） | `res-r1.robotTarget='R1'` / `res-r2.robotTarget='R2'` 已正确。不需要额外字段 |
| 8 | `derivePresenceSchedule` 怎么处理 convergenceScope | 遇到 `holderTask.convergenceScope==='allLeafGroups'`：**所有叶子组**都 `upgrade(gid, {mode:'present',...})`（而不是仅 `session.holderGroupId` 那一个）；其余上游/blocked/down 逻辑不变 |
| 9 | convergence session 的 `holderGroupId` 填什么 | 填 `grp-convergence`（sentinel）；接力链渲染时叶子组各自持有 present；sentinel 本身不输出 PresenceRecommendation |
| 10 | `grp-convergence` 的 feasibility 计算 | sentinel 组无成员 → headcount=0 → conflict；但 sentinel **不输出** rec（收敛分支只 upgrade 叶子组，`upgrade('grp-convergence',...)` 不调用，rec 数组自然不含它）；各叶子组 feasibility 由各自 headcount 各自计算 |

### 0.2 demo 拆分（路线 C 新增，A 没有）

| # | 议题 | 决定 |
|---|---|---|
| C-1 | 首屏/默认展示哪个场景 | **平日差异化**（windowLabel=`今晚`）——非总联调日。让首屏仍能看到在场/待命/不加班三态。 |
| C-2 | 「今晚」场景的持有任务改成什么 | **新增一个常规组任务 `t-r1-system-tune`（R1 系统调试，groupId=grp-ec，ownerId=m-progA）**，让今晚 session 持有它；其上游链复刻原总联调的三态结构（见 §3.6）。**今晚 session 不再持有总联调任务** → 不触发收敛分支 → 三态自然成立。 |
| C-3 | 总联调「全组各一人」放哪演示 | **新增「总联调日」场景**（windowLabel=`总联调日`）——一条新 session `sess-convergence-day` 指向 `t-r1-integration`（收敛任务），落在与今晚不同的 window。看这个场景 → 四叶子组全 present。 |
| C-4 | 两场景为何能共存于同一 fixture | `derivePresenceSchedule` / `deriveRelayBoard` 都按 `windowLabel` 过滤 session（schedule.ts L240-242 / relay 同理）。`ResourceSession` **无日期字段**，「不同日子」用不同 `windowLabel` 字符串表达（粗粒度标签，C1 低录入）。两 session 各自一个 windowLabel，互不串场。 |
| C-5 | 「今晚」持有组为何是 grp-ec 而非 grp-program | `grp-program` 调和后无成员；持有一个空组的任务 = 一条无人 present 建议（无意义）。`m-progA` 归口 grp-ec 后正好让 grp-ec 持有新常规任务 → present 有人。 |

---

## 1. TaskSchema 新增字段（`governance.ts`）

```typescript
TaskSchema.extend({
  // convergence 任务标记（optional，仅总联调类型）：
  //   'allLeafGroups' = 所有叶子组各到至少一人在场（D-072 决定 L）。
  // 未填 = 普通任务（普通 groupId 持有语义，行为完全不变）。
  convergenceScope: z.enum(['allLeafGroups']).optional(),
})
```

**向后兼容**：`convergenceScope` 是纯 optional 增量，既有 fixture / 落盘 JSON 不填此字段 → parse 后 `undefined`，行为与原来普通任务完全相同。

类型导出：`export type TaskConvergenceScope = z.infer<typeof z.enum(['allLeafGroups'])>` 或直接用 `Task['convergenceScope']`。

---

## 2. Group seed 新增 `grp-convergence`（`fixtures.ts`，`governanceScenarioFixture.groups`）

```typescript
// 末尾新增第 6 条 sentinel 组：
{ id: 'grp-convergence', seasonId: 'season-robocon-2026', parentGroupId: null,
  name: '全组联调', kind: 'custom' as const }
```

`parentGroupId=null`（顶层），`kind='custom'`（不引入新 kind enum 值）。

---

## 3. `fixtures.ts` 字段级 before→after

### 3.1 `members` 数组（`governanceScenarioFixture.members`）

| 成员 id | 字段 | Before | After |
|---|---|---|---|
| `m-progA` | `groupId` | `'grp-program'` | `'grp-ec'` |
| `m-progA` | `role` | `'groupAdmin'` | `'member'` |
| `m-progA` | `currentTaskId` | `'t-r1-integration'` | `'t-r1-system-tune'`（改：归口 grp-ec 后改持有新常规任务；见 §3.6） |
| `m-progB` | `groupId` | `'grp-program'` | `'grp-vision'` |
| `m-progB` | `role` | `'member'` | `'member'`（不变） |
| `m-progB` | `currentTaskId` | `'t-r2-integration'` | `'t-r2-integration'`（不变；注：t-r2-integration 调和后 ownerId=null，currentTaskId 是成员侧字段、无 owner 一致约束，保留即可，见 §3.3） |

全部其他成员字段（displayName / grade / status / updatedBy / updatedAt）**不改**。

### 3.2 `tasks` 数组（`governanceScenarioFixture.tasks` 中两个总联调任务）

**`t-r1-integration`（R1 总联调，收敛任务）**：

| 字段 | Before | After |
|---|---|---|
| `groupId` | `'grp-program'` | `'grp-convergence'` |
| `ownerId` | `'m-progA'` | `null` |
| `collaboratorIds` | `['m-visionC', 'm-ecB']` | `[]` |
| `convergenceScope` | （字段不存在） | `'allLeafGroups'` |
| `robotTarget` | `'R1'` | `'R1'`（不变，已正确） |
| 其余所有字段 | — | 不变 |

**`t-r2-integration`（R2 总联调，收敛任务）**：

| 字段 | Before | After |
|---|---|---|
| `groupId` | `'grp-program'` | `'grp-convergence'` |
| `ownerId` | `'m-progB'` | `null` |
| `collaboratorIds` | `[]` | `[]`（不变） |
| `convergenceScope` | （字段不存在） | `'allLeafGroups'` |
| `robotTarget` | `'R2'` | `'R2'`（不变，已正确） |
| 其余所有字段 | — | 不变 |

### 3.3 `governanceScenarioFixture.needs`（need-rtos）

| 字段 | Before | After |
|---|---|---|
| `providerGroupId` | `'grp-program'` | `'grp-ec'`（懂 RTOS 的人归口电控，程序组已去领任务身份） |
| 其余字段 | — | 不变 |

### 3.4 `scheduleScenarioFixture.resources`（无改动）

`res-r1` / `res-r2` 的 `displayCode`（`26R1` / `26R2`）已正确，**不改**。

### 3.5 `scheduleScenarioFixture.resourceSessions`（路线 C 拆分核心）

**改 `sess-tonight-prog`（今晚 = 平日差异化场景）**：今晚不再持有总联调，改持有新常规任务 `t-r1-system-tune`，持有组 grp-ec。

| 字段 | Before | After |
|---|---|---|
| `id` | `'sess-tonight-prog'` | `'sess-tonight-prog'`（**保留 id**，仅一个不透明键，避免牵动 `resource-session-route.test.ts` 的 `sess-tonight-prog` 引用；语义已变为「电控持新常规任务」，更新 `note` 文案说明即可） |
| `holderGroupId` | `'grp-program'` | `'grp-ec'` |
| `holderTaskId` | `'t-r1-integration'` | `'t-r1-system-tune'`（新常规任务，§3.6） |
| `invitedMemberIds` | `['m-progA']` | `['m-progA']`（m-progA 已归口 grp-ec，仍是该窗操作名单成员，保留合法；invitedMemberIds 永不外露派生，I0 不受影响）。**也可清空为 `[]`**，二者派生输出完全一致——见 Q4 |
| `windowLabel` | `'今晚'` | `'今晚'`（不变，首屏默认窗） |
| `note` | `'今晚 R1 归程序调总联调'` | `'今晚 R1 归电控做系统调试（平日差异化场景）'` |
| 其余字段 | — | 不变 |

**新增 `sess-convergence-day`（总联调日 = 全组各一人场景）**：一条新 session，指向收敛任务、落在不同 window。

```typescript
{ id: 'sess-convergence-day', projectId: 'prj-robots', resourceId: 'res-r1',
  windowLabel: '总联调日', orderInWindow: 0,
  holderGroupId: 'grp-convergence',          // sentinel（持有组键 = 收敛组）
  holderTaskId: 't-r1-integration',          // 收敛任务（convergenceScope=allLeafGroups）
  invitedMemberIds: [],                        // 收敛任务无单一组名单；在场由派生给全叶子组
  note: '总联调日：R1 全组各到一人',
  source: 'human', confirmedBy: PROVIDER_PROGRAM_A, eta: null,
  createdAt: GOVERNANCE_SCENARIO_NOW }
```

> 两 session 共用 `res-r1`，但 windowLabel 不同（`今晚` vs `总联调日`），`derivePresenceSchedule` / `deriveRelayBoard` 按 windowLabel 过滤（schedule.ts L240-242），各自独立成图、互不串场（C-4）。

### 3.6 `scheduleScenarioFixture.tasks` / `dependencies` 新增（路线 C 的常规持有任务）

> A 路线无此节；C 因「今晚改持常规任务」需要一个能复刻三态的常规 sink 任务。
> `scheduleScenarioFixture` 通过 `...governanceScenarioFixture` 展开，新增 task/dep 应加进
> `governanceScenarioFixture.tasks` / `.dependencies`（两者共享同一份治理快照）。

**新增常规任务 `t-r1-system-tune`（R1 系统调试）**——今晚 session 的持有任务：

```typescript
{ id: 't-r1-system-tune', projectId: 'prj-robots', groupId: 'grp-ec',
  title: 'R1 系统调试', rawSummary: 'R1 子系统联合调试（常规、非总联调）',
  status: 'inProgress', statusSource: 'git',
  ownerId: 'm-progA', collaboratorIds: [],     // m-progA 归口 grp-ec、working → 节点为 working（非 idle）
  robotTarget: 'R1', intrinsicComplexity: 'hard',
  lastProgressAt: '2026-06-10T23:30:00.000Z',
  createdAt: GOVERNANCE_SCENARIO_TIME, updatedAt: GOVERNANCE_SCENARIO_NOW }
```

**新增两条 blocks 边**，把现有上游链接到新 sink（**不动** dep-004/dep-005——它们仍指向 t-r1-integration，保住 `t-r1-integration.isCritical=true`）：

```typescript
{ id: 'dep-006', projectId: 'prj-robots',
  fromTaskId: 't-r1-vision-stream', toTaskId: 't-r1-system-tune',
  type: 'blocks', status: 'active', source: 'human', confirmedBy: PROVIDER_PROGRAM_A,
  createdAt: GOVERNANCE_SCENARIO_TIME, updatedAt: GOVERNANCE_SCENARIO_NOW },
{ id: 'dep-007', projectId: 'prj-robots',
  fromTaskId: 't-r1-chassis', toTaskId: 't-r1-system-tune',
  type: 'blocks', status: 'active', source: 'human', confirmedBy: PROVIDER_PROGRAM_A,
  createdAt: GOVERNANCE_SCENARIO_TIME, updatedAt: GOVERNANCE_SCENARIO_NOW }
```

**为什么这样设计 = 复刻原三态**（held=t-r1-system-tune，grp-ec，windowLabel=今晚）：
- 持有组 `grp-ec` → present（holdsResource，`R1 系统调试`）。
- t-r1-system-tune 的 live 上游（dep-006/dep-007）= `t-r1-vision-stream`(grp-vision) + `t-r1-chassis`(grp-ec)；经 chassis 再上溯 `t-r1-newboard`(grp-circuit，dep-002)。上游组集（剔除 holderGroupId=grp-ec）= **grp-vision + grp-circuit**。
- blockedIdle 集 = `{t-r1-vision-stream}`（owner m-visionC=idle，归因路径 dep-003 不变）：
  - `grp-vision`：上游只有 blockedIdle 的 vision-stream → 全被卡 → **free(blockedFree)**，挂「可看的资料」。
  - `grp-circuit`：上游 t-r1-newboard 非 blockedIdle → 有 active 上游 → **onCall**。
- `grp-mech`：与今晚 R1 链无活（arm-mount 已 done，spare 是 R2）→ **沉默**。
- 结果：grp-ec=present / grp-circuit=onCall / grp-vision=free / grp-mech 沉默 = **差异化三态复刻**（仅持有组从 grp-program 换成 grp-ec）。

**关键链不受影响**（governance/depgraph 测试保命）：
- dep-004/005 仍指 t-r1-integration → integration 仍是最长链终点。`computeCriticalSet` 取唯一 `endId`（最长链长度严格大者；等长按 taskId 升序先到者胜，`t-r1-integration` < `t-r1-system-tune`）→ **integration 仍 isCritical=true，system-tune 不抢关键链**（attribution.ts L233-241 strict `>` + sorted taskIds）。
- t-r1-system-tune owner=m-progA(working) → 节点 status=`working` → 不计入 `blockedIdleCount`/`freeIdleCount`（两者仍 =1，governance.test.ts L113-114 不变）。
- 无环（vision-stream/chassis → system-tune 是新 sink，不回指）→ `wouldCreateCycle` 安全，含环测试自包含不受影响。

---

## 4. 派生函数受影响分析

### 4.1 `derivePresenceSchedule`（`schedule.ts`）

**变更位置**：持有组 `present` 赋值分支（现在 line ~300）。

**新增纯函数 `deriveLeafGroups`**（可内联也可在模块顶层导出）：
```typescript
function deriveLeafGroups(groups: Group[]): string[] {
  // 有子组的 = 非叶子（某 group.parentGroupId 指向它）
  const hasChildren = new Set(
    groups.map(g => g.parentGroupId).filter((p): p is string => p !== null)
  );
  return groups
    .filter(g => g.parentGroupId !== null && !hasChildren.has(g.id))
    .map(g => g.id);
}
```

当前 fixture 叶子组结果：`['grp-ec', 'grp-vision', 'grp-mech', 'grp-circuit']`
（`grp-program` parentGroupId=null，不是叶子；`grp-convergence` parentGroupId=null，不是叶子）。

**`derivePresenceSchedule` 持有组分支改写（伪代码意图）**：
```typescript
// Before：
upgrade(session.holderGroupId, { mode: 'present', reason: 'holdsResource', ... });

// After：
if (holderTask?.convergenceScope === 'allLeafGroups') {
  // 收敛任务：每个叶子组都 present（仅总联调日 session 走这里）
  const leafGroupIds = deriveLeafGroups(snapshot.groups);
  for (const gid of leafGroupIds) {
    upgrade(gid, {
      mode: 'present',
      reason: 'holdsResource',
      resourceId: session.resourceId,
      holderTaskLabel,
      orderInWindow: session.orderInWindow,
      feasibility: feasibilityFor(gid),
    });
  }
  // sentinel grp-convergence 本身不 upgrade，rec 数组自然不含它
} else {
  // 普通任务：只有 holderGroupId（原逻辑不变；平日今晚 session 走这里）
  upgrade(session.holderGroupId, {
    mode: 'present',
    reason: 'holdsResource',
    resourceId: session.resourceId,
    holderTaskLabel,
    orderInWindow: session.orderInWindow,
    feasibility: feasibilityFor(session.holderGroupId),
  });
}
```

**上游 onCall/free 逻辑不变**：`upstreamLiveTaskIds(holderTask.id, ...)` 仍按持有任务往上找。
- 平日今晚（held=t-r1-system-tune）：走 else 分支 + 上游派生 → 三态（§3.6）。
- 总联调日（held=t-r1-integration，convergence）：走 if 分支 → 四叶子组全 present；其后上游 onCall/free 也会算（integration 上游 = vision-stream/chassis/newboard），但这些组已被 present upgrade 覆盖（present rank 3 > onCall 2 > free 1），最终仍是四叶子组全 present。

### 4.2 派生函数两场景输出对照（路线 C 核心结论）

**场景甲 · 平日差异化（windowLabel=`今晚`，held=`t-r1-system-tune` 常规，holderGroupId=grp-ec）**：

| 组 | 派生在场态 | reason | 说明 |
|---|---|---|---|
| `grp-ec` | **present** | holdsResource | 持有 R1 做「R1 系统调试」（orderInWindow=0） |
| `grp-circuit` | **onCall** | upstreamOnCall | 上游 t-r1-newboard 仍在推进 |
| `grp-vision` | **free** | blockedFree | 被 t-r1-vision-stream（被底盘卡）拖住 → 挂「可看的资料」 |
| `grp-mech` | 沉默（无 rec） | — | 今晚 R1 链上无活 |
| `grp-program` | 沉默（无 rec） | — | 无成员、非持有组、非上游组 |
| `grp-convergence` | 沉默（无 rec） | — | 今晚不涉收敛任务 |

→ **首屏三态俱在（present/onCall/free），差异化在场展示成立**。

**场景乙 · 总联调日（windowLabel=`总联调日`，held=`t-r1-integration` 收敛，holderGroupId=grp-convergence）**：

| 组 | 派生在场态 | reason | 说明 |
|---|---|---|---|
| `grp-ec` | **present** | holdsResource | 叶子组之一，holderTaskLabel='R1 总联调'，orderInWindow=0 |
| `grp-vision` | **present** | holdsResource | 叶子组之一 |
| `grp-mech` | **present** | holdsResource | 叶子组之一（不再沉默——总联调要求全组到人） |
| `grp-circuit` | **present** | holdsResource | 叶子组之一 |
| `grp-convergence` | 沉默（无 rec） | — | sentinel，收敛分支不 upgrade 它；render 亦显式跳过 |
| `grp-program` | 沉默（无 rec） | — | 非叶子、无成员 |

→ **恰好 4 条 present = 四叶子组「全组各一人」，无 onCall/free**。

**`derivePresenceSchedule` 内部分支命中**：平日今晚 → else（单组 present）；总联调日 → if（全叶子组 present）。同一份代码、同一份 fixture，靠 windowLabel 选 session、靠 session 的 holderTask 是否 convergence 选分支。

### 4.3 resourceDown 分支 + sentinel render 跳过

`scheduleResourceDownFixture` = `scheduleScenarioFixture` + `res-r1.status='down'`，down 测试仍跑 windowLabel=`今晚`（held=t-r1-system-tune）：
- res-r1 不可上 → 走 resourceDown 分支：`affected = {holderGroupId=grp-ec}` + 遍历 `robotTarget=R1 && status!=done` 的任务 groupId。
- R1 非 done 任务的 groupId 集 = grp-circuit(newboard) / grp-ec(chassis, system-tune) / grp-vision(dataset, vision-stream) / **grp-convergence**(t-r1-integration，R1 非 done 收敛任务) → affected = {grp-ec, grp-circuit, grp-vision, grp-convergence}。
- grp-mech 不入 affected（arm-mount=done、spare=R2）→ **仍沉默**。
- 各 affected 组 free(resourceDown)。**grp-convergence 因 t-r1-integration.groupId 进了 affected** → `byGroup` 会含它 → **render 循环必须显式跳过 sentinel**：

> ```typescript
> for (const [groupId, acc] of byGroup) {
>   if (groupId === 'grp-convergence') continue; // sentinel，不出排班建议
>   // ... render rec
> }
> ```
> （down 分支不显式判 convergenceScope，故 grp-convergence 是经「R1 非 done 任务的 groupId」混入 affected 的——render 跳过是唯一拦截点。路线 C 与 A 在此完全一致：sentinel render 跳过不可省。）

down 场景输出：grp-ec / grp-circuit / grp-vision = free(resourceDown)；grp-convergence 被 render 跳过；grp-mech 沉默。

### 4.4 `deriveBlockAttributions`（`attribution.ts`）

- 归因仍命中 `t-r1-vision-stream`（owner m-visionC=idle），路径 dep-003(chassis→vision-stream) 不变。
- `idleGroupId = grp-vision` ✓；`rootBlockerGroupId = grp-ec`（t-r1-chassis.groupId 仍 grp-ec）✓；`unmetNeedIds` 含 need-rtos ✓；仍只产 1 条归因。
- 新增 t-r1-system-tune(owner m-progA=working) → 非 idle → 不触发归因。
- `m-progA` status=working → 不触发归因（不变）。

### 4.5 `toDepGraphView`（`attribution.ts`）

- `t-r1-integration` 节点：`groupId='grp-convergence'`，`ownerLabel=null`，**isCritical=true**（dep-004/005 仍指它，最长链终点，§3.6）。
- 新增 `t-r1-system-tune` 节点：status=`working`，isCritical=false（等长但 taskId 升序排在 integration 后，不抢关键链）。
- `summary.blockedIdleCount=1 / freeIdleCount=1 / blockedCount≥1` 不变。
- 现有测试无直接断言 `t-r1-integration.ownerLabel`，**不需改既有断言**；新节点不触发任何既有计数断言。

### 4.6 `deriveDirectionGaps`（`attribution.ts`）

`need-rtos.providerGroupId='grp-ec'` → 缺口归口 grp-ec、`factStatement` 含「电控」。其余不变（1 条，neededSkills=['CAN','RTOS']，severity='emerging'）。

### 4.7 `deriveStudySuggestions`（`study.ts` / study-suggestions）

> A 路线漏掉本文件。need-rtos 归口 grp-ec → 组级建议的 `groupId` 跟着变。

`need-rtos(open, grp-ec, [RTOS,CAN])` join 知识节点：`kn-rtos`/`kn-can` 仍命中（节点 name 含 token，不依赖 group）。组级建议 2 条不变，但 `rtos.groupId` / `can.groupId` 从 `grp-program` → `grp-ec`，`factStatement` 含「电控」而非「程序」。私有建议路径与 group 无关，不变。

### 4.8 `deriveRelayBoard`（relay）

- 今晚看板（windowLabel=`今晚`）：仍恰好 1 站（sess-tonight-prog），`groupId='grp-ec'`，`groupName='电控'`，`taskLabel='R1 系统调试'`，displayCode='26R1'，boardable=true，orderInWindow=0。
- 总联调日看板（windowLabel=`总联调日`）：1 站（sess-convergence-day），groupId='grp-convergence'，groupName='全组联调'，taskLabel='R1 总联调'。**现有 relay 测试只查 windowLabel=今晚 / 明天上午，不查总联调日**，故新场景不触发既有 relay 断言（如需可加新 test）。

### 4.9 `deriveGroupAvailability`（`schedule.ts`）

成员归口变化后组级 headcount（无冲突时）：

| 组 | Before 成员 | After 成员 | 无冲突 headcount |
|---|---|---|---|
| `grp-program` | `m-progA`, `m-progB` | （无成员） | 0 |
| `grp-ec` | `m-ecB` | `m-ecB`, `m-progA` | 2 |
| `grp-vision` | `m-visionA`, `m-visionC` | `m-visionA`, `m-visionC`, `m-progB` | 3 |
| `grp-mech` | `m-mechC`, `m-mechD` | 不变 | 2 |
| `grp-circuit` | `m-circuitD` | 不变 | 1 |
| `grp-convergence` | （新，无成员） | （无成员） | 0 |

I0 不变量：输出仍是 `Map<groupId, int>`，无 memberId 维度。

---

## 5. 测试级逐文件影响（路线 C 实测清单 = 10 个文件）

> **与 A 的关键差异**：A 下「今晚=总联调」把三态全压成四叶子组 present，所以要重写
> schedule.test.ts 8 处 + schedule-route.test.ts 三态断言、且 blockedFree 测试在 A 下会红。
> **C 下今晚 = 平日三态**，三态断言基本保留、仅持有组从 grp-program 换成 grp-ec；
> 收敛断言搬到「总联调日」新 describe；**blockedFree 测试在 C 下保持绿**（blocker 已消，见 §5.2-10）。

### 5.1 `apps/hub-contracts/test/governance.test.ts`

1. **`每个实体 round-trip parse`**（L25-34）：
   - `groups` 新增 `grp-convergence`（6 条）→ safeParse 通过。
   - `tasks` 新增 `t-r1-system-tune`、两个 integration 任务新增 `convergenceScope` → TaskSchema 已接受（阶段②同改）→ 通过。
   - `dependencies` 新增 dep-006/dep-007 → DependencySchema 通过。
   - `members` `m-progA.groupId=grp-ec`/`role=member`/`currentTaskId=t-r1-system-tune` → 合法。
   - **断言本身不改**（只看 safeParse 成功）。

2. **`deriveBlockAttributions` 系列**（L40-76）：`attrs.length=1`、`idleTaskId=t-r1-vision-stream`、`idleGroupId=grp-vision`、`rootBlockerGroupId=grp-ec`、`unmetNeedIds 含 need-rtos` — **全部不改**（路径不变；新任务 working 不产归因）。

3. **`toDepGraphView` 系列**（L83-126）：
   - `t-r1-integration.isCritical=true`（L107/139）— **不改**（§3.6 关键链保命）。
   - `t-r1-vision-stream` blockedIdle、`blockedByTaskId='t-r1-chassis'`、relatedKnowledge — **不改**。
   - `t-r2-spare` freeIdle、`blockedIdleCount=1`/`freeIdleCount=1`、dep-003 kind=blocking — **不改**。
   - `t-r1-newboard.isCritical=true`、`t-r1-arm-mount.isCritical=false` — **不改**。

4. **C4 护栏 / 软删除 / 含环图**（L129-262）— **全部不改**（自包含或不依赖改动实体）。

5. **可选新增**（§5.10 防回归）：断言 t-r1-integration 的 groupId/convergenceScope/ownerId；断言 t-r1-system-tune 节点 working + 非 critical。

### 5.2 `apps/hub-contracts/test/schedule.test.ts`

> 今晚仍三态，仅持有组 grp-program→grp-ec、持有任务标签 'R1 总联调'→'R1 系统调试'。

1. **`程序组 = present（持有 R1 做 R1 总联调）`**（L33-40）：
   **改写为**：
   ```typescript
   test('电控组 = present（持有 R1 做 R1 系统调试，平日差异化）', () => {
     const r = byGroup.get('grp-ec')!;
     expect(r.mode).toBe('present');
     expect(r.reason).toBe('holdsResource');
     expect(r.holderTaskLabel).toBe('R1 系统调试'); // 改：今晚持常规任务
     expect(r.resourceId).toBe('res-r1');
     expect(r.orderInWindow).toBe(0);
   });
   ```

2. **`电控 + 电路 = onCall`**（L42-46）：
   今晚 grp-ec 现为 present（持有组）、grp-circuit 仍 onCall。
   **改写为**：
   ```typescript
   test('电路 = onCall（上游 t-r1-newboard 仍在推进）；电控已是持有组 present', () => {
     expect(byGroup.get('grp-circuit')!.mode).toBe('onCall');
     expect(byGroup.get('grp-circuit')!.reason).toBe('upstreamOnCall');
     expect(byGroup.get('grp-ec')!.mode).toBe('present'); // 持有组，非 onCall
   });
   ```

3. **`视觉组 = free（被卡）且挂"可看的资料"`**（L48-54）：
   **不改逻辑、断言保留**（视觉仍 blockedFree、relatedKnowledge 含「R2 同款视觉代码」）。可仅更新测试上方注释（今晚持有任务换成 system-tune，但视觉被卡路径 dep-003 不变）。

4. **`机械组 = 沉默`**（L56-58）：**不改**（`byGroup.has('grp-mech')===false` 仍成立）。

5. **`排班按小组、汇报按大组`**（L60-69）：
   **改写为**（持有组 grp-ec 仍是 grp-program 子组，reportingGroupId 链不变；删去对已无 rec 的 grp-program 的断言）：
   ```typescript
   test('排班按小组、汇报按大组：reportingGroupId 上溯到顶层大组', () => {
     expect(byGroup.get('grp-ec')!.reportingGroupId).toBe('grp-program');
     expect(byGroup.get('grp-vision')!.reportingGroupId).toBe('grp-program');
     expect(byGroup.get('grp-circuit')!.reportingGroupId).toBe('grp-circuit');
     // 排班单元仍是小组
     expect(byGroup.get('grp-ec')!.groupId).toBe('grp-ec');
     // grp-program 无成员、无排班建议
     expect(byGroup.has('grp-program')).toBe(false);
   });
   ```

6. **`事实陈述只含组 / 任务 / 资源名，不含任何人名`**（L71-77）：**不改**（人名列表不变，今晚派生仍零人名）。

7. **`输出结构上无 member / 出勤计数 / 时长聚合维度`**（L79-87）：**不改**。

8. **`排序：present 在前，free 在后`**（L89-92）：**不改**（今晚仍 present...free，首末断言成立）。

9. **车撞坏 describe（L95-117）**：
   - **`R1 链相关组全部 free / resourceDown`**（L99-105）：**不改**（render 跳过 grp-convergence 后，recs 全 free/resourceDown）。
   - **`持有方程序组也被打成 free`**（L107-112）：
     **改写为**（持有组现为 grp-ec）：
     ```typescript
     test('持有方电控组也被打成 free（车坏了谁都上不了）；sentinel 不出现', () => {
       const ec = byGroup.get('grp-ec');
       expect(ec?.mode).toBe('free');
       expect(ec?.reason).toBe('resourceDown');
       expect(ec?.factStatement).toContain('撞坏维修中');
       expect(byGroup.has('grp-convergence')).toBe(false); // sentinel render 跳过
       expect(byGroup.has('grp-program')).toBe(false);
     });
     ```
   - **`只跑 R2 的机械组不受 R1 撞坏影响（沉默）`**（L114-116）：**不改**。

10. **`blockedFree relatedKnowledge 跨 task 去重（URI 唯一）`**（L119-165，tampered snapshot）：
    **【blocker 已消，不改】**。该 tampered 仍跑 windowLabel=`今晚`，C 下今晚 held=t-r1-system-tune（**非收敛任务，不触发全叶子组 upgrade**）。grp-vision 经上游 t-r1-vision-stream（blockedIdle）落 `free(blockedFree)`；relatedKnowledge 附加循环遍历**全局 blockedIdle 集**（schedule.ts L356-371，与持有任务上游无关），tampered 让 vision-stream + dataset 双双 blockedIdle 且同 grp-vision、同挂 kn-vision-cal（同 URI）→ 去重断言照常成立。**A 下此测试会红**（今晚=总联调把 grp-vision upgrade 成 present、盖掉 blockedFree）；**C 下保持绿**。

11. **新增 describe（总联调日，§5.10）**：见 §5.10。

### 5.3 `apps/hub-contracts/test/availability.test.ts`

1. **`返回值只有 groupId→整数`**（L56-69）：
   `deriveGroupAvailability([], MON_AFTERNOON, members)`，members 归口变化后无冲突容量变。
   - 原断言 `grp-vision=2` → **改 `3`**（m-visionA + m-visionC + m-progB）。
   - `grp-mech=2` → **不变**。
   - **可选新增**（注意：原测试只断言 grp-vision/grp-mech，故下两条是 **新增（add）非改写**——更正 A 草案把它们标「改写」的笔误）：
     ```typescript
     expect(cap.get('grp-ec')).toBe(2);            // 新增：m-ecB + m-progA
     expect(cap.get('grp-program') ?? 0).toBe(0);  // 新增：无成员 → 0
     ```

2. **`visibility==='private' 的成员被跳过`**（L71-78）：`grp-vision` 2→**3**（m-visionA private 不剔除按无冲突计，仍 m-visionC + m-progB 入账 + m-visionA）。
   ```typescript
   expect(cap.get('grp-vision')).toBe(3); // 改（原 2）
   ```

3. **`aggregateOnly 且冲突 → -1`**（L80-87）：m-visionA aggregateOnly 冲突 → 3-1=**2**。
   ```typescript
   expect(cap.get('grp-vision')).toBe(2); // 改（原 1）
   ```

4. **`半开区间不误判`**（L89-96）：不冲突 → **3**。 `expect(cap.get('grp-vision')).toBe(3);`（原 2）

5. **`不同 dayOfWeek 不算冲突`**（L98-105）：**3**。 `expect(cap.get('grp-vision')).toBe(3);`（原 2）

6. **`单窗签名，无法跨窗累计`**（L107-122）：各窗 m-visionA 冲突 → 3-1=**2**。
   ```typescript
   expect(busyMon.get('grp-vision')).toBe(2); // 改（原 1）
   expect(busyTue.get('grp-vision')).toBe(2); // 改（原 1）
   ```

7. **`三参路径 feasibility 恒 null` / `四参无锚定 byte-for-byte 一致` / `parse 满足 schema`**（L125-148）：**不改**（结构性断言，不依赖具体组数值；今晚仍非空有 present/onCall/free）。

8. **`ctx 锚定时才写 feasibility`**（L150-164）：
   anchor `sess-tonight-prog`（今晚 held=t-r1-system-tune，holderGroupId=grp-ec），m-progA aggregateOnly 冲突。
   收敛分支**不触发**（held 是常规任务）→ 持有组 grp-ec present，feasibility 由 grp-ec headcount 算：grp-ec={m-ecB, m-progA}，m-progA 冲突 → 1 → **tight**。
   **改写断言**（原 L163：`grp-program=tight`）：
   ```typescript
   expect(byGroup.get('grp-ec')!.feasibility).toBe('tight'); // 改（持有组现为 grp-ec）
   expect(byGroup.has('grp-program')).toBe(false);           // 无成员、无建议
   ```
   同步更新注释（L154）：「电控组有 m-ecB / m-progA；让 progA 授权冲突 → 电控组容量 2→1 = tight」。

9. **`A2 红线：派生输出 JSON 不含个人课表明细`**（L173-219）：**不改**（反监视正则不变；今晚派生仍零 memberId）。

### 5.4 `apps/hub-contracts/test/direction-gaps.test.ts`

1. **`fixture 仅 need-rtos(open/grp-program) 产缺口`**（L16-27）：
   **改写**：
   ```typescript
   test('fixture 仅 need-rtos(open/grp-ec) 产缺口；claimed need-board-review 不计', () => {
     expect(gaps).toHaveLength(1);
     const g = gaps[0]!;
     expect(g.groupId).toBe('grp-ec');                  // 改（原 grp-program）
     expect(g.neededSkills).toEqual(['CAN', 'RTOS']);   // 不变
     expect(g.evidenceNeedIds).toEqual(['need-rtos']);  // 不变
     expect(g.evidenceTaskIds).toEqual(['t-r1-chassis']); // 不变
     expect(g.factStatement).toContain('电控');          // 改（原 '程序'）
     expect(g.factStatement).toContain('RTOS');          // 不变
   });
   ```

2. **`每条满足 DirectionGapSchema + GroupGapsResponseSchema`**（L29-35）— **不改**。

3. **`I0/A1 序列化后无任何人维度字段`**（L37-44）— **不改**（providerGroupId=grp-ec 仍非 memberId）。

4. **`沉默：无 open/escalated → 空数组`**（L46-55）— **不改**（人造 satisfied）。

5. **`escalated → severity=pressing`**（L57-70）：
   **改写 find**：`(x) => x.groupId === 'grp-ec'`（原 grp-program）。

6. **`providerGroupId=null 不归组`**（L72-80）— **不改**（人造 null）。

### 5.5 `apps/hub-contracts/test/relay-board.test.ts`

1. **`字段正确`**（L39-52）：今晚看板仍 1 站，但持有组/任务变。
   ```typescript
   expect(board.stages).toHaveLength(1);            // 不变（总联调日是另一窗）
   expect(s.sessionId).toBe('sess-tonight-prog');   // 不变（id 保留）
   expect(s.resourceId).toBe('res-r1');             // 不变
   expect(s.displayCode).toBe('26R1');              // 不变
   expect(s.groupId).toBe('grp-ec');                // 改（原 grp-program）
   expect(s.groupName).toBe('电控');                 // 改（原 程序）
   expect(s.taskLabel).toBe('R1 系统调试');          // 改（原 R1 总联调）
   expect(s.orderInWindow).toBe(0);                 // 不变
   expect(s.boardable).toBe(true);                  // 不变
   expect(s.statusReason).toBe(null);               // 不变
   ```

2. **eta / 反监视 / boardable=false / 空看板 / handoffs 过滤**（L54-125）— **不改**（down 看板仍按 res-r1 找站；'明天上午' 仍空）。

### 5.6 `apps/hub-server/test/schedule-route.test.ts`

1. **`windowLabel=今晚 → 非空 + present/onCall/free 三态俱在`**（L16-35）：
   **不改**！C 下今晚仍是平日三态（grp-ec present / grp-circuit onCall / grp-vision free），`modes.has('present'|'onCall'|'free')` 全 true 照常成立。仅可更新注释（L28）：「今晚 R1 归电控做系统调试：电控 present、电路 onCall、视觉 free（被底盘卡）」。
   > 这是 C 相对 A 的最大省力点——A 要把 onCall/free 断言改成 false 并断言 4 条 present；**C 完全不动这条**。

2. **`I0：响应 JSON 不含任何人维度字段`**（L37-61）— **不改**。

3. **`windowLabel 缺失 / 空串 → 400`**（L63-81）— **不改**。

4. **`未知窗口 → 200 + 空 recommendations`**（L83-96）— **不改**（'下个月' 仍无 session）。

5. **`GET /api/resource-sessions → seed 含 sess-tonight-prog`**（L100-111）：**不改**（id 保留；新增 sess-convergence-day 只让 sessions ≥1 更稳）。

6. **`GET /api/resources → res-r1/res-r2`**（L113-123）— **不改**。

7. **`POST … 201 / source 钉 human / 剥 confirmedBy`**（L125-159）— **不改**。

8. **`POST 一条今晚接力窗口后 GET 仍含派生建议`**（L161-201）：
   **不改**（nit #3 显式说明）。POST 一条今晚 grp-mech 接力窗口（holderTaskId=null）→ 走 else 分支、resource 可上 → grp-mech present；GET 今晚 recommendations 仍非空且含 `grp-mech present`。调和后今晚原本就有 grp-ec present + grp-circuit onCall + grp-vision free，叠加新 grp-mech present，断言 `some(r=>r.groupId==='grp-mech' && r.mode==='present')` 成立、I0 守恒。**该测试在调和后保持绿。**

9. **`POST 缺必填 → 400` / `无 Bearer → 401` / `带 Bearer + 合法 body → 201`**（L203-254）：**不改**。
   - L231-254 那条 body 用 `holderGroupId:'grp-program'`、`holderTaskId:'t-r2-integration'`：`grp-program` 仍在 groups（保留为汇报组）、t-r2-integration 仍是合法 task id → **201 不变**（POST 不校验 holderGroupId 是否有成员）。

### 5.7 `apps/hub-server/test/relay-route.test.ts`

1. **`windowLabel=今晚 → stages 富集`**（L133-148）：
   ```typescript
   expect(stage!.groupId).toBe('grp-ec'); // 改（原 grp-program）
   ```
   `sessionId='sess-tonight-prog'`（不变）、`displayCode='26R1'`（不变）、`resourceId='res-r1'`（不变）。

2. **`I0：返回体不含人维度`**（L155+）— **不改**。

3. **其余 PATCH/POST/DELETE/400/404**（含级联删棒）— **不改**（不断言 groupId/taskLabel；`sess-tonight-prog` id 保留）。

### 5.8 `apps/hub-server/test/group-gaps-route.test.ts`

1. **`GET /api/group-gaps`**（L11-30）：
   ```typescript
   // Before: const program = body.gaps.find((g) => g.groupId === 'grp-program');
   const ec = body.gaps.find((g) => g.groupId === 'grp-ec'); // 改
   expect(ec).toBeDefined();
   expect(ec!.neededSkills).toContain('RTOS');               // 不变
   // 注释更新：open need-rtos(grp-ec) 产一条组级缺口
   ```

2. **`反监视护栏`**（L29）— **不改**。

### 5.9 `apps/hub-contracts/test/resource-display.test.ts`（A 路线漏掉）

1. **`R1 down → 持有组 + 该车下游组本窗 free(resourceDown)`**（L55-65）：
   持有组现为 grp-ec（held=t-r1-system-tune），grp-program 无 rec。
   **改写**：
   ```typescript
   // 注释 L61：sess-tonight-prog 持有组 grp-ec 在 R1 down 时应落 free
   const ec = recs.find((r) => r.groupId === 'grp-ec'); // 改（原 grp-program）
   expect(ec?.mode).toBe('free');
   expect(ec?.reason).toBe('resourceDown');
   ```

2. **`新增维修/退役/拆解态 schema 校验` / 反监视护栏**（L44-84）— **不改**（schema / I0，不依赖持有组）。

### 5.10 `apps/hub-contracts/test/study-suggestions.test.ts`（A 路线漏掉）

1. **`组级 join：need-rtos(open,grp-program,...) 命中 kn-rtos + kn-can`**（L28-45）：
   need-rtos 归口 grp-ec → 组级建议 groupId 跟着变。
   **改写**：
   ```typescript
   test('组级 join：need-rtos(open,grp-ec,[RTOS,CAN]) 命中 kn-rtos + kn-can', () => {
     expect(baseResult.group).toHaveLength(2);              // 不变
     // ...
     expect(rtos.groupId).toBe('grp-ec');                  // 改（原 grp-program）
     expect(rtos.matchedSkills).toEqual(['RTOS']);          // 不变
     expect(can.matchedSkills).toEqual(['CAN']);            // 不变
     expect(rtos.evidenceNeedIds).toEqual(['need-rtos']);   // 不变
     expect(rtos.factStatement).toContain('电控');           // 改（原 '程序'）
     expect(rtos.factStatement).toContain('RTOS');           // 不变
   });
   ```

2. **`DoD(a/b/c/d/e)` 反监视 / 私有隔离 / 确定性 / null 归组**（L47-208）— **不改**（不依赖 need-rtos 的 groupId 具体值；遍历真实成员 id 黑名单仍成立——m-progA/B 不出现在组级输出）。

### 5.11 新增测试建议（防回归，路线 C 专属）

**新 test → `governance.test.ts`**：
```typescript
test('总联调任务：groupId=grp-convergence + convergenceScope=allLeafGroups + ownerId=null；关键链仍成立', () => {
  const t = F.tasks.find((x) => x.id === 't-r1-integration')!;
  expect(t.groupId).toBe('grp-convergence');
  expect(t.convergenceScope).toBe('allLeafGroups');
  expect(t.ownerId).toBeNull();
  const view = toDepGraphView(F, NOW);
  const byId = new Map(view.nodes.map((n) => [n.id, n]));
  expect(byId.get('t-r1-integration')!.isCritical).toBe(true);
  // 平日常规 sink 不抢关键链、是 working 节点
  expect(byId.get('t-r1-system-tune')!.isCritical).toBe(false);
  expect(byId.get('t-r1-system-tune')!.status).toBe('working');
});
```

**新 describe → `schedule.test.ts`（总联调日 = 全组各一人）**：
```typescript
describe('derivePresenceSchedule — 总联调日（全组各一人，收敛任务）', () => {
  const recs = derivePresenceSchedule(scheduleScenarioFixture, NOW, '总联调日');
  const byGroup = new Map(recs.map((r) => [r.groupId, r]));

  test('四叶子组各 present；reason=holdsResource、标签=R1 总联调', () => {
    for (const gid of ['grp-ec', 'grp-vision', 'grp-mech', 'grp-circuit']) {
      const r = byGroup.get(gid)!;
      expect(r.mode).toBe('present');
      expect(r.reason).toBe('holdsResource');
      expect(r.holderTaskLabel).toBe('R1 总联调');
      expect(r.resourceId).toBe('res-r1');
      expect(r.orderInWindow).toBe(0);
    }
  });

  test('恰好 4 条 present，无 onCall/free；sentinel/program 不出现', () => {
    expect(recs.filter((r) => r.mode === 'present')).toHaveLength(4);
    expect(recs.every((r) => r.mode === 'present')).toBe(true);
    expect(recs.map((r) => r.groupId).sort()).toEqual(
      ['grp-circuit', 'grp-ec', 'grp-mech', 'grp-vision'],
    );
    expect(byGroup.has('grp-convergence')).toBe(false); // sentinel 不输出
    expect(byGroup.has('grp-program')).toBe(false);     // 非叶子、无成员
  });

  test('I0：总联调日输出仍零 memberId', () => {
    expect(JSON.stringify(recs)).not.toContain('memberId');
    expect(JSON.stringify(recs)).not.toContain('invitedMemberIds');
  });
});
```

---

## 6. 不变量清单（实现轮自检）

| 不变量 | 验证方式 |
|---|---|
| I0：所有 `PresenceRecommendation` 输出 JSON 无 memberId / invitedMemberIds | `JSON.stringify(recs).indexOf('memberId') === -1` |
| `grp-convergence` 不出现在任何 `PresenceRecommendation.groupId` 中（含 down 场景） | `recs.every(r => r.groupId !== 'grp-convergence')` |
| `grp-program` 不出现在 `PresenceRecommendation.groupId` 中 | `!byGroup.has('grp-program')` |
| 平日今晚 → 三态俱在（present + onCall + free） | `new Set(recs.map(r=>r.mode))` ⊇ {present,onCall,free} |
| 总联调日 → 恰好 4 个 present（四叶子组），无 onCall/free | `recs.filter(r=>r.mode==='present').length === 4 && recs.every(r=>r.mode==='present')` |
| `t-r1-integration.isCritical = true`（关键链不断） | `toDepGraphView(F, NOW)` 结果 |
| `t-r1-system-tune` 不抢关键链、是 working 节点 | `node.isCritical===false && node.status==='working'` |
| `deriveBlockAttributions` 仍只产 1 条归因（`t-r1-vision-stream`） | `attrs.length === 1` |
| `blockedIdleCount===1 && freeIdleCount===1`（新任务不扰动） | `toDepGraphView(F, NOW).summary` |
| `deriveDirectionGaps` 产 1 条缺口，归口 `grp-ec` | `gaps[0].groupId === 'grp-ec'` |
| `deriveStudySuggestions` 组级 2 条，rtos/can 归口 `grp-ec` | `byNode.get('kn-rtos').groupId === 'grp-ec'` |
| `grp-convergence` / `convergenceScope:'allLeafGroups'` schema parse 通过 | `GroupSchema.safeParse / TaskSchema.safeParse` |
| down 场景：`grp-ec/vision/circuit` 各 `free(resourceDown)`、`grp-mech` 沉默 | `byGroup.get('grp-ec')?.reason==='resourceDown' && !byGroup.has('grp-mech')` |
| `m-progA.groupId = grp-ec`，`m-progB.groupId = grp-vision` | `MemberSchema.safeParse` |

---

## 7. AGENTS.md §1 更新（同轮同刀）

**`AGENTS.md §1` 第 4 条（组织结构）末尾**，将：

> fixtures 遗留（`grp-program` 仍持 `t-r1/r2-integration` + `m-progA/B`）下一轮调和：成员归电控/视觉、总联调改全组各一人、`grp-program` 去领任务身份。

改为：

> fixtures 调和由 `docs/design/presence-reconcile-lock.md` 锁定定稿（路线 C，PRESENCE-RECONCILE 阶段②实现）：`m-progA→grp-ec`（role 降 member，改持新常规任务 `t-r1-system-tune`）、`m-progB→grp-vision`；两个总联调任务 `groupId→grp-convergence`（新增 sentinel 组）、`convergenceScope='allLeafGroups'`、`ownerId=null`；`grp-program` 不再领任务（仅汇报视角，parentGroupId 链保留）；`need-rtos.providerGroupId→grp-ec`。demo 拆两场景：今晚=平日差异化（三态）、总联调日=全组各一人。

---

## 8. 实现锚点（文件 → 改动汇总）

| 文件 | 改动性质 |
|---|---|
| `apps/hub-contracts/src/governance.ts` | `TaskSchema` 新增 `convergenceScope: z.enum(['allLeafGroups']).optional()`；`Task` 类型自动更新 |
| `apps/hub-contracts/src/fixtures.ts` | `groups` +`grp-convergence`；`members` ×2 归口/role/currentTaskId；`tasks` ×2 总联调（groupId/ownerId/collaboratorIds/convergenceScope）+ **新增 `t-r1-system-tune`**；`dependencies` **新增 dep-006/dep-007**；`needs.need-rtos.providerGroupId`；`resourceSessions` 改 `sess-tonight-prog`（holderGroupId/holderTaskId/note）+ **新增 `sess-convergence-day`** |
| `apps/hub-contracts/src/schedule.ts` | `deriveLeafGroups` 新增纯函数；`derivePresenceSchedule` 持有组分支按 convergenceScope 分流；render 循环跳过 `grp-convergence` sentinel |
| `apps/hub-contracts/test/governance.test.ts` | 既有断言不改；可加 §5.11 新 test |
| `apps/hub-contracts/test/schedule.test.ts` | §5.2：今晚三态持有组 grp-program→grp-ec（4 处改写）+ down 持有组改写 + **新增总联调日 describe**；blockedFree 去重测试**不改** |
| `apps/hub-contracts/test/availability.test.ts` | §5.3：grp-vision 数值 2→3（6 处）+ feasibility grp-program→grp-ec + 注释 |
| `apps/hub-contracts/test/direction-gaps.test.ts` | §5.4：groupId/factStatement grp-program→grp-ec（3 处改写） |
| `apps/hub-contracts/test/relay-board.test.ts` | §5.5：今晚 stage groupId/groupName/taskLabel（3 处） |
| `apps/hub-contracts/test/resource-display.test.ts` | §5.9：down 持有组 grp-program→grp-ec（1 处 + 注释） |
| `apps/hub-contracts/test/study-suggestions.test.ts` | §5.10：rtos/can groupId + factStatement grp-program→grp-ec（2 处 + 标题/注释） |
| `apps/hub-server/test/schedule-route.test.ts` | §5.6：**三态断言不改**；仅可更新注释；POST-then-GET 不改 |
| `apps/hub-server/test/relay-route.test.ts` | §5.7：stage.groupId grp-program→grp-ec（1 处） |
| `apps/hub-server/test/group-gaps-route.test.ts` | §5.8：groupId grp-program→grp-ec（1 处 + 注释） |
| `AGENTS.md §1` | §7 组织结构说明更新（含 demo 拆分） |

> **resourceDown 分支锚点（schedule.ts ~line 277-296）**：现状 `affected.add(task.groupId)` 直接取 `task.groupId`。
> 本定稿用 sentinel 组 `grp-convergence`（`groupId` 非 null）承载总联调任务，因此 **无需** 给该行加
> `task.groupId !== null` guard（走 sentinel 路线，不走 groupId→null）。t-r1-integration.groupId=grp-convergence
> 会经此行混入 down 场景 affected → **render 循环跳过 sentinel 是唯一拦截点**（§4.3），不可省。

---

## 9. 阶段② 实现 checklist + 风险

**实现顺序（依赖拓扑）**：
1. `governance.ts`：`TaskSchema` 加 `convergenceScope: z.enum(['allLeafGroups']).optional()`（其余 schema 不动；不需要改 `groupId` 为 nullable——sentinel 路线 groupId 恒非空）。
2. `fixtures.ts`：
   - `groups` +`grp-convergence`；
   - `members` ×2 归口/role（m-progA.currentTaskId→t-r1-system-tune）；
   - `tasks`：两总联调（groupId→grp-convergence / ownerId→null / collaboratorIds→[] / +convergenceScope）+ **新增 `t-r1-system-tune`**（grp-ec / owner m-progA / working）；
   - `dependencies` **+ dep-006（vision-stream→system-tune）/ dep-007（chassis→system-tune）**（不动 dep-004/005）；
   - `needs.need-rtos.providerGroupId→grp-ec`；
   - `resourceSessions`：改 `sess-tonight-prog`（holderGroupId→grp-ec / holderTaskId→t-r1-system-tune / note）+ **新增 `sess-convergence-day`**（windowLabel='总联调日' / holderGroupId=grp-convergence / holderTaskId=t-r1-integration / invitedMemberIds=[]）。
3. `schedule.ts`：加 `deriveLeafGroups`；持有组分支按 §4.1 分流（convergence → 全叶子组 upgrade present，否则原逻辑）；render 循环跳过 `grp-convergence`。
4. 改测试（§5.2 ~ §5.10）+ 加 §5.11 防回归 test。
5. 三包 `verify:all` 全绿；`grep -ri memberId` 在 `derivePresenceSchedule` 两窗输出体均为空（I0）。
6. 同刀改 `AGENTS.md §1`（§7 文案）。

**风险与缓解**：
- **R1 sentinel 泄漏进输出**：down 场景经 t-r1-integration.groupId 让 grp-convergence 进 affected；若 render 漏跳，会冒出无成员的 free 建议。缓解 = §4.3 显式 `if (groupId === 'grp-convergence') continue` + §5.11 / §6 回归断言 `byGroup.has('grp-convergence')===false`。
- **R2 平日 sink 抢关键链**：若 dep-006/007 让 t-r1-system-tune 成为更长链或等长却排序在前，可能抢走 isCritical。缓解 = 保持 dep-004/005 指 t-r1-integration（等长），且 `t-r1-integration` < `t-r1-system-tune`（taskId 升序），strict `>` 让 integration 胜（§3.6）。实现后用 §5.11 回归 test 钉死 `integration.isCritical===true && system-tune.isCritical===false`。
- **R3 叶子组定义漂移**：未来给 grp-mech/grp-circuit 加子组，它们将不再是叶子，总联调日在场组集自动变化（期望行为，但 demo 数值会变）。`deriveLeafGroups` 纯派生、不硬编码 4 组；总联调日 test 若硬编码 `['grp-circuit','grp-ec','grp-mech','grp-vision']` 需在组树变化时同步。
- **R4 两窗 windowLabel 串场**：若误把 sess-convergence-day 的 windowLabel 也填 `今晚`，则今晚会同时跑常规 + 收敛 → 四叶子组被 present 覆盖、三态崩。缓解 = windowLabel 必须不同（`今晚` vs `总联调日`），§5.2 三态 test + §5.11 总联调日 test 互为护栏（前者验今晚仍三态、后者验总联调日全 present）。
- **R5 feasibility 分散（总联调日）**：收敛日 feasibility 各叶子组各算（非单一持有组一个数）。今晚 feasibility 仍是单一持有组 grp-ec（§5.3 第 8 条锁 grp-ec=tight），实现者照此即可。

---

## 10. 路线选定记录 + 曾考虑/被否

**路线 C（选定，用户 2026-06-21 拍板）= 总联调语义忠实 + demo 拆「平日差异化 + 总联调日」两场景。**
- 保留 A 的全部收敛机制（`convergenceScope` flag + `grp-convergence` sentinel + 全叶子组 upgrade + render 跳过 sentinel）。
- 多做一步：新增常规任务 `t-r1-system-tune` + dep-006/007 让今晚持常规任务（三态复刻），新增 `sess-convergence-day`（总联调日）单独演示全组各一人。
- 收益：① 首屏仍见差异化三态（产品演示价值不丢）；② 总联调「全组各一人」仍按 §7.1 忠实落地、可单独点开演示；③ blockedFree 去重测试在 C 下保持绿（今晚非收敛，不触发 upgrade），消除 A 下的 blocker；④ schedule-route 三态断言完全不动（A 要改成全 present）。
- 代价：比 A 多一个常规任务 + 两条 dep + 一条 session（fixture 略增），但都是安全增量（新任务 working 不扰计数、新 sink 不抢关键链、新 session 另开 windowLabel 不串场）。

**路线 A（曾考虑，被否）= 今晚 = 总联调，全组各一人直接占首屏。**
- 机制与 C 的收敛部分相同，但**不拆 demo**：今晚 session 直接持有 t-r1-integration（收敛任务）→ 今晚四叶子组全 present。
- 否决理由：① 首屏从「差异化三态」塌成「四叶子组全 present」，丢掉差异化在场的演示价值（D-029 杀手锏看不见）；② blockedFree relatedKnowledge 去重测试在 A 下**会红**（今晚把 grp-vision upgrade 成 present、盖掉 blockedFree 路径），需额外改写或迁移该测试；③ schedule.test.ts / schedule-route.test.ts 的三态断言需大改（onCall/free 断言全翻成 false + 断言 4 条 present）。C 用「拆场景」一并解决①②③。
- A 的字段级机制（除 demo 拆分外）已被 C 全量继承，故无真相丢失。

**路线（更早曾考虑，被否）= groupId=null 表达收敛、不建 sentinel。**
- 总联调任务 `groupId=null` 表「不挂单一组」。否决理由：需 `TaskSchema.groupId` 改 nullable + resourceDown 分支 `affected.add(task.groupId)` 加 null-guard + 多处下游消费 null 兜底，schema 改动面更大。C/A 共用的 sentinel 路线 groupId 恒非空、resourceDown 分支零改（仅 render 跳过），代码面最小。

---

## 11. 决议（2026-06-21 用户拍板，7 项 open question 全部定案）

> 本表为准；与 §5 正文叙述冲突处以本表为准（正文部分按最小改面写，决议含 2 处加项）。

| # | 议题 | 决议 | 落地影响 |
|---|---|---|---|
| 1 | 今晚电控 session id | **改名 `sess-tonight-prog → sess-tonight-ec`** | 同步 `resource-session-route` / `relay-route` / `schedule-route` ~5 处引用；界面零影响（id 仅不透明键） |
| 2 | 今晚 session `invitedMemberIds` | **留空 `[]`**（不预填建议名单） | 派生输出不变（invitedMemberIds 永不进派生，I0 结构保证） |
| 3 | 总联调日 windowLabel | **`总联调日`** | §5.11 总联调日 test 的 windowLabel 参数用此串 |
| 4 | 总联调日是否加 R2 | **加 R2**（两台车都演示收敛） | 总联调日除 `sess-convergence-day`(→`t-r1-integration`) 外，**新增一条 sess**(resourceId=`res-r2` → `t-r2-integration`)；R2 总联调任务也须标收敛 |
| 5 | convergenceScope 是否进 console UI | **这轮就加「全组」徽章** | DAG 收敛任务节点显「全组」徽标（不再只 fallback 组名）；scope 从「仅 contracts」**扩到 console** |
| 6 | m-progA role | **member**；且**成员展示不突出组长，统一显示组员** | progA `role=member`；console 成员展示层不渲染 groupAdmin/组长 徽章（I0 反层级，全当组员显示）——一条衍生 console 显示规则 |
| 7 | need-rtos 归口 | **grp-ec** | 缺口挂电控组（程序组已无直属成员，挂之则空挂无人承接） |

> **较原定稿的 2 处加项**：Q4（总联调日 +R2 一条 sess）、Q5（+console「全组」徽章）。Q6 衍生一条 console 显示规则（不显组长）。其余 5 项采最小改面。阶段② 实现以本表为准。

---

## 12. 阶段② 实现清单（file-by-file，FINAL — 提示词指向本节）

> 本节是阶段② **唯一实现真相**，已并入 §11 七项决议。与 §1–§10 推演冲突处以本节为准。
> **红线**：I0 永不渲染 memberId/invitedMemberId；`invitedMemberIds` 永不进派生输出；
> 今晚三态 `grp-ec=present / grp-circuit=onCall / grp-vision=blockedFree` 保留；
> `t-r1-integration` / `t-r2-integration` 保持 `isCritical=true`。

### 12.1 contracts — `apps/hub-contracts/src/governance.ts`
- `TaskSchema` += `convergenceScope: z.enum(['allLeafGroups']).optional()`。
- `DepNodeSchema` += `isConvergenceTask: z.boolean()`。
- `toDepGraphView`：每个 DepNode `isConvergenceTask = task.convergenceScope === 'allLeafGroups'`。

### 12.2 contracts — `apps/hub-contracts/src/fixtures.ts`
- **groups**：新增 `grp-convergence`（哨兵组，仅承载收敛任务，不进派生输出 / 不进归因）。
- **members**：
  - `m-progA` → `groupId='grp-ec'`、`role='member'`（Q6）、`currentTaskId='t-r1-system-tune'`。
  - `m-progB` → `groupId='grp-vision'`、`currentTaskId` 改派非收敛任务或 `null`（令 `grp-program` 无直属成员）。
- **tasks**：
  - `t-r1-integration` / `t-r2-integration` → `groupId='grp-convergence'`、`ownerId=null`、`collaboratorIds=[]`、`convergenceScope='allLeafGroups'`，**保持 `isCritical=true`**。
  - 新增 `t-r1-system-tune`（`groupId='grp-ec'`、`ownerId='m-progA'`、`status='working'`，普通常规任务，非收敛）。
- **dependencies**：新增 `dep-006`(`t-r1-vision-stream → t-r1-system-tune`)、`dep-007`(`t-r1-chassis → t-r1-system-tune`)；`dep-004`/`dep-005`(→ `t-r1-integration`) **不动**。
- **needs**：`need-rtos.providerGroupId` → `'grp-ec'`（Q7）。
- **resourceSessions**：
  - **改名** `sess-tonight-prog` → `sess-tonight-ec`（Q1）：`holderGroupId='grp-ec'`、`holderTaskId='t-r1-system-tune'`、`invitedMemberIds=[]`（Q2）、`windowLabel='今晚'`。
  - 新增 `sess-convergence-day-r1`：`windowLabel='总联调日'`（Q3）、`resourceId='res-r1'`、`holderGroupId='grp-convergence'`、`holderTaskId='t-r1-integration'`、`invitedMemberIds=[]`。
  - 新增 `sess-convergence-day-r2`（Q4）：`windowLabel='总联调日'`、`resourceId='res-r2'`、`holderGroupId='grp-convergence'`、`holderTaskId='t-r2-integration'`、`invitedMemberIds=[]`。

### 12.3 contracts — `apps/hub-contracts/src/schedule.ts`
- 新增纯函数 `deriveLeafGroups(groups)`：返回「有 `parentGroupId` 且不是任何组之父」的叶子组 id 列表。
- `derivePresenceSchedule` 持有组分支按 `holderTask?.convergenceScope === 'allLeafGroups'` 分流：
  - 真 → 遍历 `deriveLeafGroups` 全部 `upgrade(gid, {mode:'present', reason:'holdsResource', ...})`。
  - 假 → 原 `upgrade(session.holderGroupId, ...)` 逻辑不变。
- render 循环首行 `if (groupId === 'grp-convergence') continue;`（哨兵不进输出）。

### 12.4 contracts — `apps/hub-contracts/src/attribution.ts`
- 核对哨兵 `grp-convergence` 不漏进归因输出（无幽灵组 / 无空组缺口）。

### 12.5 console — DAG「全组」徽章（**唯一 console 改动**）
- `apps/hub-console/src/features/dep-graph/DepGraphPage.tsx` `DepNodeCard`：`n.isConvergenceTask` 为真时，在 `.dag-node__badges` 渲染一枚「全组」徽章（复用 `.dag-node__tag` + 新 `--convergence` 变体，参考 `--critical`）。
- `apps/hub-console/src/styles.css`：加 `.dag-node__tag--convergence`（配色区别于 `--critical`）。
- `apps/hub-console/src/i18n/translations.ts`：新增 `depgraph.node.convergence`（zh `全组` / en `All groups`），**zh/en 成对、双侧键数平衡**。
- **Q6 不改 console**：成员展示不突出组长由现状满足（成员面板 06-18 已隐藏 / 看板按任务流 / DAG 只显负责人名不显角色徽章）。

### 12.6 测试（~10 文件，逐文件细节见 §5）
- id 改名 `sess-tonight-prog → sess-tonight-ec`：`availability` / `relay-board` / `resource-display`（contracts test）+ `relay-route` / `resource-session-route`（server test）。
- 持有组 `grp-program → grp-ec`：`schedule` / `availability` / `resource-display` + relay stage `groupId` / `groupName='电控'` / `taskLabel`。
- need-rtos `grp-program → grp-ec`：`direction-gaps` / `study-suggestions` / `group-gaps-route`。
- `grp-vision` headcount `2 → 3`：`availability`。
- **新增「总联调日」describe**（`schedule.test.ts`）：windowLabel='总联调日' 下全叶子组 present（R1+R2 两 session 都验）。
- **`schedule-route.test.ts` 三态断言不改**（仅注释更新为持有组 grp-ec）。

### 12.7 `AGENTS.md` §1（**勿碰 §7 + `scripts/`**）
- 组织结构说明按本定稿 §7 更新（m-progA→grp-ec role=member 持 t-r1-system-tune / m-progB→grp-vision / grp-program 不再领任务 / grp-convergence 哨兵 + convergenceScope / need-rtos→grp-ec / demo 拆今晚+总联调日两场景）。

### 12.8 验证 + 提交
- 三包 `npm --prefix apps/hub-{contracts,server,console} run verify:all` 全绿（typecheck 兜 schema/i18n 平衡 + build）。
- WSL2 真机 Playwright：依赖图「全组」徽章可见 + 今晚三态 + 总联调日全组到场；grep memberId 净；截图入 `docs/screenshots/`。
- 提交：pre-commit 钩子自动 bump；PRESENCE = feature → `VERSION_BUMP_LEVEL=minor git commit ...`；勿删钩子、勿碰 AGENTS §7 / `scripts/`。
