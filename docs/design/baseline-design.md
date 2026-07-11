# 倒排基准线设计（BASELINE-DESIGN）— 三版车节奏 · 验证门 · 投资类任务

> **status: DESIGN-LOCKED v1**（2026-07-11 用户拍板全部待定细节；**真实时间线待 2026 赛季赛后回填**，模板 v1 按三版车节奏用相对周占位）。
> 上游 = D-083 / `product-redefine-2026-07.md` §4.1。本文是 **BASELINE-CORE 实现轮的口径**，实现偏离须回写本文。

## 1. 定稿的五个细节（用户 2026-07-11 拍板）

1. **基准线是战队级**：赛季一条链（不按组各建一条）；任务**多对一**挂里程碑（`Task.milestoneId?` optional）；"哪个组慢了"从挂接任务的组归属**派生**，不单独建模。
2. **"慢了"按周判**：周粒度红黄绿三档，规则简单到人人能心算；基准 = **内置模板默认 + 手写覆盖**（模板生成后队长可逐条改日期/增删里程碑）。
3. **验证门角色分工**：**大二提交证据（视频/图片）→ 大三验收留名过门**。存储修正（对"丢 SQLite 里"的技术纠正）：**证据字节走既有 artifact 本地卷**（D-025 二进制不进库；D-078 multipart 上传链路 50MB 先例直接复用），store/SQLite 只存 `evidenceRefs: artifactId[]` 引用 + 验收元数据——功能不变，库不膨胀、备份不变重。
4. **投资类任务三维分类**：`horizon`（本赛季 / 未来赛季）× `value`（高 / 低）× `timeAccumulation`（高 / 低）。**高时间积累** = 需要"感觉"的技术（调参手感、装配经验），突击无效、只能早开始摊；**未来赛季×高价值**（如 sim2real）= 最容易被砍、重点保护对象。
5. **版次可裁剪**：模板按三版车生成，但**允许 V3 合并进 V2**（用户自评"可能只能实现两版"）；裁剪是显式人操作，**门随版合并、不消失**（验证要求不因裁版而降低）。

## 2. Robocon 赛季模板 v1 — 三版车节奏（用户口述整理；日期=相对周占位，锚点=秋季开学日/赛日）

| 时段 | 阶段类型 | 里程碑 / 门 | 内容（定位原文口径） |
|---|---|---|---|
| 第一学期（开学起） | 研发→迭代 | — | **V1 实验车**：定位=技术积累。不考虑重量，只考虑能完赛；不考虑设计感，只考虑能不能把线接上 + 电路组理线；给最终版做技术积累与准备 |
| 第一学期中后段 | 迭代 | **门 G1：问题清单收敛**（V2 设计拍板门） | V1 上**电控去找极限、视觉组做技术实验**——找到所有问题才能拍板第二版设计。**第一学期必须完成** |
| 期末前 4 周 + 考试 | **真空（硬约束）** | — | 计划恒为零；倒排自动绕开（6 周） |
| 寒假 | 迭代（假期双链） | 里程碑 M1：sim2real 环境可用 | **sim2real 启动**：电控在仿真里先摔、摔明白再上车；机械不在校画 V2 图 ∥ 仿真链并行（假期双链，见 product-redefine §6.2）。**前置=有人提前研究——现状没人研究**（此缺口直接进「学习方向」当第一条真实数据） |
| 第二学期第 1–2 周 | 迭代 | **门 G2：V2 拼装完成** | 第二版车拼出来。**V2 定位=冲着最后能完赛的设计去** |
| 期中前 | 迭代 | **门 G3：最终版（V3）出车** | **V3 定位=冲奖、能完整闭环** |
| V3 后 | 联调 | **门 G4：整车试跑**（+破坏性/极限工况项） | 没过门图上是红的；"测试不完全"赛前显形（今年教训：两小时撞坏 4 打印件、无加速跑点） |
| G4 过门后 | **调参** | 里程碑 M2：调参入场 | **调参期默认挂 G4 后**（堵"车没跑通就调参"）；上届实际=备馆才开始，结论=过晚（模板内置这条教训注记） |
| 赛前 | 调参→赛 | 备馆 / 赛日 | 真实日期赛后回填 |

- **期末 6 周真空**同样适用第二学期（若赛程在期末后）。
- 模板生成 = 填「秋季开学日 + 赛日」两个锚点 → 相对周展开 → 手写覆盖。

## 3. 数据模型方向（实现轮落 zod；独立域文件，不塞 GovernanceSnapshot）

```
SeasonBaseline {
  id, seasonId,                       // Season 需先接线（现死脚手架，audit §9-①）
  anchors: { semesterStart?, competitionDate? },        // 两锚点
  segments: [{ kind: 'semester'|'vacation'|'vacuum', startsAt, endsAt, label }],
  phases:   [{ type: 'rd'|'iterate'|'tuning'|'vacuum', startsAt, endsAt }],
  milestones: [{
    id, title, kind: 'milestone'|'gate',
    plannedAt,                        // 内置默认+手写覆盖
    robotVersion?: 'V1'|'V2'|'V3',    // 版次裁剪=把 V3 里程碑显式 merge 进 V2，门不消失
    status: 'pending'|'passed'|'missed',
    passedBy?: ActorRef,              // 大三验收留名（写侧收集，读视图沿 I0 口径）
    evidenceRefs?: artifactId[],      // 大二提交的视频/图片 → artifact 本地卷，只存引用
    note?
  }]
}
Task.milestoneId?      // 唯一新增的挂接字段；Task 永不加 dueDate（G4 修正红线）
Task.investment?: { horizon: 'season'|'future', value: 'high'|'low', timeAccumulation: 'high'|'low' }
```

- 落点：独立 `baselineStore`（InMemory/File 两实现 + 独立落盘 `baseline.json`），照 kbStore/invStore 先例；SQLite 随刀④统一迁。
- 证据上传复用 `POST /api/artifacts/:id/upload` 既有链路（后缀白名单加视频格式、体积上限实现期定）。

## 4. 派生与展示

- **`deriveBaselineDrift(baseline, tasks, now)` 周粒度红黄绿**（规则可心算）：里程碑已过期未 passed = 红；≤N 周内到期且挂接任务完成度 < 阈值 = 黄；其余绿。N/阈值 = 常量起步，不做加权算法。
- **总览页首屏一张"基准线 vs 实际"**：时间轴 + 里程碑状态 + 当前阶段；任何人打开三秒知道快慢。落后单位 = 里程碑/模块，**永不点人名**。
- **阶段 × 工种负载**：让"调参期 = 电控还债期"提前可见（v1 可后置到实现轮末批）。
- **投资类任务示警**（v1 只做最简）：`future×high`（如 sim2real）被连续 2 周零进展 → 单独提示"正在砍未来"；`timeAccumulation:high`（如调参）展示"早开始摊、突击无效"标注。复杂象限策略后置。

## 5. 红线

- Task 永不加 `dueDate`（G4 修正案，AGENTS §2.2 A4）；快慢只从里程碑派生。
- 落后展示单位 = 里程碑/模块/组，不点人名；`passedBy` 写侧收集、读视图按 I0 口径处理。
- 独立 baselineStore + 独立落盘；不改 `GovernanceSnapshot`（三处手写同步雷区，audit §9-①）。
- 证据二进制不进 store/SQLite/git（D-025）。
- 版次裁剪 = 显式人操作 + 留痕；门不随裁版消失。

## 6. 待回填 / 待办

- **真实时间线（用户，赛后）**：规则发布 / 方案冻结 / 开学 / 备馆 / 赛日 + 各里程碑实际达成时间 → 回填模板 v2，"模板从上届长出来"闭环第一次转起来。
- sim2real「现状没人研究」→ 学习方向（LEARN-DIRECTION-REDESIGN）的第一条真实缺口种子。
- 验证门证据的后缀白名单/体积上限：**已在 BASELINE-CORE 实现轮定（见 §7.1）**；G4 破坏性测试子项清单：仍待实现期定（模板只放教训注记，未硬编码子项）。

## 7. 实现落点注记（2026-07-11 BASELINE-CORE 实现轮）

> BASELINE-CORE 六步（S1–S6，commit `d3db6fe`..`e3a76a9`，VERSION 0.10.3→0.11.5）已落地，本机三包 `verify:all` 全绿（contracts 197 / server 232 / console 96）+ e2e-pillars 3 绿 + Playwright 首屏走查达成。本节把实现期偏离设计稿字面处 + §3/§4/§6 留的「实现期定」具体取值如实回写；设计红线（§5）全部满足。

### 7.1 「实现期定」项的实际取值

- **验证门证据视频后缀白名单**（§3/§6）：`ARTIFACT_ALLOWED_EXT`（`hub-server/src/server.ts`）新增 `.mp4`→`video/mp4`、`.mov`→`video/quicktime`、`.webm`→`video/webm`；体积上限沿用 D-078 既有 multipart 50MB 上限不改。
- **drift 常量 N/阈值**（§4）：`BASELINE_DRIFT_LOOKAHEAD_WEEKS=2`（黄档前瞻窗口）、`BASELINE_DRIFT_ATTACHED_DONE_THRESHOLD=0.5`（黄档挂接任务完成度阈值）、`INVESTMENT_STALL_WEEKS=2`（投资示警零进展周数），均为 `hub-contracts/src/baseline.ts` 顶部导出常量，无加权算法。补充口径：黄档要求「挂接任务数 > 0」——`attachedTotal===0`（里程碑无挂接任务）判绿不判黄（数据不足不示警，避免对空里程碑发假警报），设计稿 §4 未明说。
- **投资示警「零进展」参照口径**（§4）：优先用 `Task.lastProgressAt`（commit/check-in 派生的最近推进信号），为 `null`（从未有推进信号）时退化用 `Task.createdAt`；`status==='done'` 排除（已完成非被砍），`status==='shelved'` 刻意**不**排除（已搁置正是「正在砍未来」的实锤，理应出现）。
- **版次裁剪留痕字段形态**（§3/§5）：落 `BaselineMilestone.mergedFromVersion?`，三值枚举同 `robotVersion`（V1/V2/V3），语义 = 裁剪前的原始版次。裁剪 = 显式把 `robotVersion` 改挂目标版（如 V3→V2）+ 填 `mergedFromVersion:'V3'`，门本身不删、验证要求不降低。
- **模板 v1 布局口径**（§2）：混合——第一学期从秋季开学日**正向**展开 + 竞赛尾段 G3/G4/M2 从赛日**倒推**（非纯正向也非纯倒推）；隐含「两锚点需相隔约 34 周」才不使里程碑穿插，间隔过短属需队长手写覆盖的边界情形。模板 v1 只建模**一个**（第一学期）真空段——第二学期期末真空（§2 条件项『若赛程在期末后』）因只有两锚点、无春季期末锚点可定位而未建模（Robocon 赛期通常在春季期末前）。以上均在 `baseline.ts:generateRoboconBaselineTemplate` 代码注释同步标注。

### 7.2 结构 / 接线偏离

- **Season 接线（S1）**：`GovernanceSnapshot` 新增 `seasons: Season[]`（`z.array(SeasonSchema).default([])` 兜底旧文件），**非替换**既有裸 `seasonId`——二者共存：`seasonId` 仍是 8 处消费点的当前项目锚点，`seasons` 是新接入的完整实体真相层，未做替换式迁移（风险最小化）。GET /api/seasons 照 GET /api/groups 先例直读快照、无新 GovStore 写方法。§9-① 的 Season 死脚手架审计账目留待后续收口轮统一勾销。
- **baselineStore 物理位置（S3）**：接口落独立新文件 `hub-server/src/store/baseline-store.ts`（非共居 `gov-store.ts`）——避免往 product-redefine §4.4/§9-③ 已列为债的 GovStore god-interface（21 方法 / 6 域）再加一域；方法面风格仍照 kbStore/invStore。独立落盘 `baseline.json`（数组格式，`TEAMHUB_BASELINE_DATA_FILE`，`start-teamhub.sh` 已接 env），fail-closed 用 `SeasonBaselineSchema` 校验。
- **baseline 路由归属 + 风格（S4）**：三条路由（`GET`/`PATCH` `/api/baseline?seasonId=`、`POST /api/baseline/milestones/:milestoneId/pass?seasonId=`）挂在 `registerPmCoreRoutes`（与 GET /api/seasons 同域；`ModuleId` 枚举无 'baseline' 项，pm-core 是与 Season 最贴合的既有挂点，不新建模块）；`seasonId` 走 querystring（与 GET /api/schedule?windowLabel= 同族），未用 path 形式。PATCH 走 v1 整段覆盖 anchors/segments/phases/milestones（非逐字段 diff）。
- **I0 passedBy 剥离（S4，红线 2 兑现）**：新增 `SeasonBaselinePublicSchema`/`BaselineMilestonePublicSchema`（`.omit({passedBy:true})`），GET/PATCH/POST-pass 三条响应契约改用 Public 变体——照 `pm-requests.ts` 的 `DependencySchema.omit({confirmedBy:true})` 先例实现「passedBy 读视图沿 confirmedBy 的 I0 先例」。
- **过门请求 status 字段（S2/S4）**：`PassMilestoneRequestSchema` 保留必填 `status:'passed'|'missed'`（支持验收未通过=missed 的真实场景），非仅 passedBy/evidenceRefs/note；`pending` 为初始态、不经此写口回退。

### 7.3 派生输出形状（S5，设计稿未定处）

- `deriveGroupsBehind`（「哪个组慢了」）输出 `{ groupId, level:'red'|'yellow'（同组多里程碑取最严重档）, attachedTaskCount }`——独立导出函数、无 memberId 字段（红线 2）。另附 `deriveTimeAccumulationFlags`（`TIME_ACCUMULATION_LABEL='早开始摊、突击无效'`）。
- Task 反向不 import baseline：`baseline.ts` 用 `import type { Task }`（type-only，`verbatimModuleSyntax` 编译期擦除）规避与 `pm-core.ts` 的真循环；`Task.investment` 的 `TaskInvestmentSchema` 定义在 baseline.ts、由 pm-core.ts 单向 import。

### 7.4 console 落点与 demo 说明（S6）

- 总览页 `OverviewPage` 顶部挂 `BaselineOverview.tsx`（自带 season/baseline/tasks 查询 → 调 §4 的 `derive*` → 空态给「填两锚点生成模板」入口）；时间轴纯位置计算在 `overview-timeline.ts`。投资录入三维 optional 只落在创建表单 `PmCreatePanel`；**编辑既有任务的 investment 未接线**（console 无独立任务编辑表单，状态流转走看板）。
- demo baseline 用真实 `new Date()` 算 drift（诚实活时间），静态锚点（2025-09-08→2026-08-16）只在 2026-07 前后呈现红黄绿混合；赛后回填真日期即恒对齐（同 fixtures `SCENARIO_WINDOW_*` 既定「换天演示需 bump 锚点」caveat）。demo 投资标签有轻微语义自由度（`t-r1-vision-stream` 打 future×high 点亮示警条、`t-r1-system-tune` 打 timeAccumulation:high），已在 fixtures 注释标注、不影响功能。
- 时间轴容器 `min-width:560px`，窄列内横向滚动（`overflow-x:auto`）；「三秒知道快慢」由下方里程碑红黄绿清单承载、不依赖滚动。
