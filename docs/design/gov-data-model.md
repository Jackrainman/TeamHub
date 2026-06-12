---
status: stable
date: 2026-06-11
owner: Teamhub
scope: governance-data-model
decision: D-028 / D-037 (图纸档案库 archive-first) / D-038 (图纸按组分治)
implements: D-026 第①数据真相层 + 阻塞归因（第②规则层 MVP 切片）+ D-036/D-037 战队数据库
---

# 治理数据真相层 — 数据模型 + 阻塞归因（MVP 切片）

> 落地于 `apps/hub-contracts/src/{common,governance,growth,attribution}.ts`（D-028 治理为主轴）。
> 本文是设计记录；字段级契约以代码 Zod schema 为准。

## 0. 痛点与最小切片

真痛点 = **依赖链上的结构性空闲 + 负载错配 + 错误归因**：被卡的空闲与摸鱼的空闲外观相同 → 伤团队团结。
系统最值钱的单一动作 = 让"某人空闲 ∵ 被某个上游任务卡住"**可见为正当（任务键，不是人键）**。

**薄切片优先**：只闭合归因因果链所需的最小实体集，不铺全量、不做精确 CPM（守 C3）。

```
Member(idle) ──currentTaskId──▶ Task(简单/无问题)
                                  │ Dependency(active, 有向边)
                                  ▼
                                Task(上游, 未完成) ──owner──▶ 另一组 Member
                                  │ Need(unmet) ← 解释"上游为何也动不了"
```

## 1. 实体（`governance.ts`）

| 实体 | MVP | 要点 |
|---|---|---|
| `Season` / `Project` | 必需 | 按赛季分项目；`robotTargets[R1/R2/shared]` 标签，不为每台车割裂 Project（保留跨车散件依赖） |
| `Group` | 必需 | 自引用树 `parentGroupId`；机械/电路顶层，电控/视觉可并入程序，不写死（C3） |
| `Member` | 必需 | `role` + `grade`(资历，仅 G5 兜底) + `groupId`；`currentTaskId` FK；**故意不放 `blockedOn`**——被谁卡是结构事实，不是人的属性 |
| `Task` | 必需 | 五态(待启动/进行中/卡住/已完成/已搁置，继承 bridge-roster)；`statusSource` 派生优先(C5)；`rawSummary/polishedSummary` 双存(C4)；`intrinsicComplexity` 让"本来简单却被卡"可见 |
| `Dependency` | 必需 | **有向边** `fromTaskId→toTaskId`（v0.3 无向 relatedIds 的升级）；`source`+`confirmedBy`：aiSuggested 未确认不参与归因(C4) |
| `Need` | 必需 | 一等公民 `{描述,providerGroupId(缺口归组,A1),状态}`；`escalated` 作为"事"升级、不挂人名(A4) |
| `TaskProgressSignal` | 薄 | `gitCommit/larkCheckIn/artifactUpload`(派生 C5) + `manualNote`(兜底 C1)；`artifactUpload`=图纸上传副产品(D-036/D-037)；六态全量后置 |

成长轴（`growth.ts`，D-027 并列）：`KnowledgeNode`(parentNodeId 默认 null、不预设本体) + `MemberKnowledge`(visibility 默认 private、无 score/完成率) + `TaskKnowledgeTag`(AI 建议+人审核)。

### 1.1 战队数据库 / 图纸·代码档案（archive-first，D-036/D-037；**按组分治 D-038**）

D-037 把"图纸上服务器"的语义重心从"喂 silence 信号"移到**战队数据库**第一价值——
"**以后不用到处找人要图纸，直接去服务器拿、随时找到任何版本**"。**D-038 按各组原生工具分治**（每组一条数据河，D-034）：

- **机械组（SolidWorks）= 本地服务器存储真相**：无云端、现仅本地/微信传 → 战队服务器是唯一备份/版本库（兑现 D-034 用户原话"机械图纸从微信迁服务器按天/版本分类"）。`ArtifactRef` 加 `kind:'cad'` + 字节进 volume/MinIO（D-025）+ 版本链 + 命名规范 + 任意版本检索。立 `HUB-ARTIFACT-STORE-MECH`（第 4 样自建）。
- **电路组（EDA）= 云端引用**：已在云端 PDM 做版本管理 → TeamHub **不存二进制**，只 `kind:'eda'` + `externalUrl` + 版本指针。
- **程序/固件 = git**：**当前 GitHub**，薄封装一键"保存版本"=commit+push，git 唯一真相（G2）；**迁本地 Forgejo = 考虑中**（`GITHUB-TO-LOCAL`）。
- **统一信号**：每组工作产物在其原生工具 version-control，TeamHub 收"发布新版本"事件 → 派生 `artifactUpload`（机械/电路）/ `gitCommit`（程序）进度信号喂对应河（D-034），**信号是副产品、非监视谁传没传**。先做手动 check-in 钩子；云工具有 API 再自动化。**定期 pull 云端代码/EDA 到本地备份 = 考虑中**（`PULL-CLOUD-CODE`）。
- **archive-first / 事件驱动 / 命名规范**：首要价值 = 版本档案库（命名 + 检索任意版本）；**完成一版即上传**、非日报打卡（C1/C5）。机械组命名待规定（用户 2026 计划）。
- 版本语义（谁 bump / 当前权威版指针 / 撞坏回退 / 按车分支）= open `ARTIFACT-VERSION-SEMANTICS`，**别做完整 PLM**（C3）。立 `HUB-ARTIFACT-VERSION-DESIGN`（D-036）。

## 2. 阻塞归因（`attribution.ts`，纯函数）

`deriveBlockAttributions(snapshot, now): BlockAttribution[]`

1. 候选 = `status∈{pending,inProgress}` 且 owner `status='idle'` 的任务。
2. 沿 incoming `active+confirmed` 边找未完成上游；**无此边 → 不产生归因（沉默，A4）**。
3. 递归找根因瓶颈，优先停在挂着未满足 Need 的上游 → `reason='unmetNeed'`。
4. 输出 `BlockAttribution`：`{idleTaskId, rootBlockerTaskId, blockingDependencyIds, unmetNeedIds, reason, factStatement, detectedBy:'derived'}`。

`toDepGraphView(snapshot, now): DepGraph` 把真相投影成前端视图，给每节点打 `working/blockedIdle/freeIdle/done/gap`。

### 反排名结构保证（C2/A1，落在 schema 形状）

`BlockAttribution` / `OverloadSignal` / `DepGraph` 视图的主键**全是 task/group/dependency/need**，无 `memberId` 维度、无对人计数/时长聚合 → 结构上无法 `groupBy(memberId).count()` 出"谁慢了"。`factStatement` 模板只填任务/组/Need 名，永不含人名。负载 `OverloadSignal` 是组键"联调链负载偏高"，不是"AB 慢"（A2）。

单测（`test/governance.test.ts`，11 项）锚定：视觉C 任务 → `blockedIdle`、根因底盘 + `need-rtos`、`factStatement` 不含任何人名；机械D 自由空闲 → **零归因**；归因/节点对象键 grep 无 member/count/rank/percent。

## 3. 红线自检

C1/C5 派生优先（`statusSource`/`updatedBy`） · C2/A1 无 memberId 维度 · A2 缺口归组 · A4 无边则沉默 / aiSuggested 须确认 · G2 不双写（`BridgeMemberState` 降为投影） · C3 薄切片不做精确 CPM/课程平台 · C4 双存 + 人 confirmedBy · D-027 护栏（private/无完成率/不预设本体）。

## 4. 不在本切片

完整阈值/沉默检测（`GOV-RULES-LAYER-DESIGN`）· 精确 CPM 工期 · server 路由/Postgres（归因先纯函数）· progress_log 六态全量 · 知识树本体可视化（`AXIS-TREE-VIZ`）。
