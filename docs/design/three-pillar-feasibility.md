---
status: analysis
date: 2026-06-13
owner: Teamhub
scope: requirement-feasibility-analysis
decision: D-042（需求分析闸门通过 + 可行性裁定 + 构建定基调）
source: 20-agent gated workflow（5 分析器需求闸门[宪法=opus] → opus 裁定 → 5 haiku 实证盘点 → 4 sonnet 逐根评估 → 4 opus 对抗核实 → 1 opus 综合）
---

# 三支柱 + 共享底座 需求可行性分析（D-042 定基调路径）

> 本文是 D-039 三支柱的**需求分析（闸门）+ 需求可行性分析**记录，**非默认读取链**（选 frontier / 定基调 / 构建前读）。权威决策见 `decisions.md` D-042；任务行见 `backlog.md`。
> 两段式：先查需求本身是否合理（闸门：矛盾/违宪/无痛点/含糊到不可评估 → 返回），通过才评"建得成吗/有没有人用/要先满足什么"。对抗核实层用 grep 实证抓出初稿幻觉，下文结论已据此收敛。

## 0. 闸门结论：需求分析通过（proceed，0 阻断）

5 个分析器（一致性·宪法=opus / 完整性 / 痛点映射 / 歧义 / 范围）共出 43 条，opus 裁定去重为 **14 条，全部 major/minor，无 blocker**。判定标准（严格）：blocker 仅限"需求自相矛盾 / 撞宪法红线 / 无真实痛点支撑 / 含糊到无法评估，不先解决就不该进入可行性"。逐条 grep+读文件核实后无一达线，故 proceed。

- **没有伪需求**：KB/PM 有 D-039 痛点二次确认的用户原声支撑；INV 真实需求但时机敏感（见 §4）。
- **宪法干净**：AI 安全车道（KB 相似提示 / INV 读图）核宪在 A4/C4 内，不违宪；C2 反排名 / G2 不双写 / G4 无硬截止 / I0 均无现存违犯（`toDepGraphView` 节点只带 `ownerLabel` 无效率值、全仓无治理写路由、`TaskSchema` 无 deadline，grep 坐实）。
- **唯一真矛盾**：D-040 vs D-041 对"PM 是否触碰个人状态"给相反指令 → 裁定取最新版（§1）。
- **其余 13 条**：要么是"还没到设计那步"（完整性，正常），要么是文档卫生，均为构建前收口项、非需求错。

## 1. 唯一真矛盾的裁定：冲突取最新版（D-041 优先）

- **早先（D-040）**：PM 本轮"读手填的 `Member.status` → UI 降级标注「状态待确认」、不修底层"（reqdesign.md:59/69）。
- **最近（D-041 决策2/7③）**：项目计划表"不含任何按人算的天数/快慢/在不在干活"，空闲检测整堆封存。
- **矛盾**："降级标注"本质仍把个人状态摆上全员看板，与 D-041"不含" + C2"产能不可比"冲突。
- **裁定（甲方 2026-06-13）**：**直接取最新版 D-041**（更晚、且是 PM 设计定调权威）。落地 = **PM 需求层彻底删去 `Member.status`/freeIdle 任何展示通道，而非"读了再降级"**。注意 `DepGraphPage` 当前展示 `freeIdleCount`，PM 页复用须显式处理掉。

## 2. 可行性裁决总表（核实修正后）

| 单元 | 裁决 | killerRisk |
|---|---|---|
| **base** 共享底座 | 🟡 conditional | `GovStore` 仅 `getSnapshot()`（gov-store.ts:9），无 kb/inv 扩展 DI + 写方法白名单 → 不收口触"四次重建底座"违 C3 |
| **kb** 知识库 | 🟡 conditional | KB-CORE（归档闭环+相似检索）资产真实、可立即开工；KB-LARK 飞书通道零实现（boundary 白名单仅 `im.v1.message.create`）→ 不拆两阶段会被拖累 |
| **pm** 项目计划表 | 🟡 conditional | 读视图侧资产齐（`toDepGraphView`/DAG 页）；写入侧从零，console 零 mutation 基础设施 + 冷启动空板风险 |
| **inv** 库存/BOM | 🟢 留着·排最后（**甲方决策改写**，原始裁决 not-yet，见 §4） | 静默拿走 → 账漂（认了，定位"大概账"）；自保鲜靠 Hermes 接通 |

**维度矩阵（绿/黄/红）**

| 单元 | 技术 | 采纳 | 资源可维护 | 前提依赖 |
|---|---|---|---|---|
| base | 🟢 | 🟢 | 🟢 | 🟡（扩展策略待收口） |
| kb | 🟡（核心可移植、飞书层零实现） | 🟡（结案仍需手填 rootCause） | 🟡（similar-issues 含 storage-IO 非全纯） | 🟡（CORE 全满足 / LARK 待 probe） |
| pm | 🟡（读侧绿、写侧从零，工时近 14–20h） | 🟡 | 🟡 | 🟢（读路径零外部依赖） |
| inv | 🟡（greenfield 可建） | 🟡（对话记账可破死表，详 §4） | 🟡（重心在上游） | 🟡（等 Hermes 接通 + 一次盘点） |

## 3. 跨根 blocker + 构建顺序

**破冰序 `base→kb→pm→inv` 不变，但 base 补一刀、kb 拆两段。**

| Blocker | 影响根 | 处置 |
|---|---|---|
| **GovStore 扩展策略未收口**（gov-store.ts:9 仅 `getSnapshot()`） | 全部 | **必须先解**：base 下一刀 = `GovStore` 加写方法白名单签名 + `BuildHubServerOptions` 加 `kbStore?/invStore?` 扩展点（接口先行≈30 行，1 atomic-task）。补强：`GovernanceSnapshot` 已含 `knowledgeNodes/taskKnowledgeTags`，KB 大体复用同快照、**不必扩 interface**，真正要扩的只有 INV 的 `PartStock` |
| **lark bin 双语义债（LARK-BIN-PROBE）** | kb-LARK / inv | **可降级并行**：纯本地 KB-CORE/PM 不依赖；只 hardblock KB-LARK 与 INV。须用户 WSL2 实测 |
| **飞书 method 名未验证** | kb-LARK / inv | 与 LARK-BIN-PROBE 绑定，实测过后才进白名单 |
| **持久层切换契约空白**（InMemoryGovStore 重启丢失） | base | 可降级并行；base DoD 增 SqliteGovStore stub 证同接口可落地 |

**每根最小可行第一刀**：base = 接口收口刀；kb = KB-CORE（`kb.ts` 迁移 schema **保留 normalizedSummary/relatedFiles/relatedCommits**否则 `buildCloseoutFromIssue` 报 TS2339 + 移植 `rankSimilarIssues`~95 行 + `GET /api/kb/similar` + 结案派生 KnowledgeNode）；pm = 只读视图 + 单条任务写入（**TaskSchema 必填 projectId/rawSummary/robotTarget/intrinsicComplexity/statusSource，"title+groupId" 过不了 Zod**；"卡住原因"走人建 Dependency 边由 `toDepGraphView` 派生 `blockedByLabel`，**不在 Task 上另存 blockedBy**否则触 G2 双写）；inv = 见 §4。

## 4. 库存（INV）专项：不冻结、排最后、对话记账防死（甲方 2026-06-13 决策改写）

原始可行性裁决 = not-yet（双上游悬空 → 只剩纯手录 = 复刻死表）。**甲方决策推翻"冻结"，改为"留着·排最后·对话记账防死"**，理由是找到了比"看图+飞书"更轻的低门槛入口：

- **库存留着、不夭折、重要；论先后排最后。**
- **防死机制（多路）**：
  1. **对话记账（主力）**：对 Hermes/openclaw 说一句"坏了一个 3508、烧了"，助手帮记一笔、同步更新表 —— "说句话"是人本来就会做的动作，不是填表负担（C1 派生优先）。
  2. **一次性盘点建底（起步）**：老师也会要求盘点，盘一次建底账，系统至少存着；一次性、非天天填，可接受。
  3. **看图算量（增强，后续）**：AI 读车图自动数"每辆车几个电机/缺没缺"；真不行上本地大内存机器慢跑敏感数据（慢但能跑）。
- **新增功能**：**缺口主动向用户汇报**。
- **老实定位**：**"大概有什么/还有没有"，非精确实时账**——静默拿走（有人顺手拿不吭声）的漏堵不死，认了；"起码知道本来该有"本身就值。
- **锁松一档**（替代原"硬冻"）：不禁止做，但**做的时候必须带"对话记账"低门槛入口一起上，不许做成纯手敲死表**；且 INV 真正"用着就更新"依赖 §5 的 Hermes 能力，故落在最后。

## 5. Hermes/openclaw：统一触点能力、最后做、先搭壳子（甲方 2026-06-13）

- **能力是真的（纠正可行性初稿的"空架子"判断）**：Hermes 已接通、能调飞书 CLI（用户 WSL2 lark-cli 已配）。
- **缺口在项目侧**：TeamHub 自身"去调用 Hermes/openclaw"的对接代码还没建 → **新需求 = 项目需具备"调用 hermes/openclaw"的能力**。
- **排序 = 最后做，先搭壳子**：先把底座/知识库/进度表/(库存表结构)的壳子立起来（自己就能立、不依赖助手），最后统一接 Hermes/openclaw（四层架构最上层"触点/集成层"本就最后接）。
- **一次接、多根受益**：接上后库存对话记账 / 知识库随手沉淀 / 进度表随口更新都走同一条"喊一句、助手记一笔"的路，故作为**统一能力**最后做一次，不每根各接各的。
- **接时核细节**：真接时在用户机器上确认具体 bin/命令 + 能调哪些飞书接口（即 `LARK-BIN-PROBE`），通了钉死写进项目。

## 6. 构建闸门（开始构建前须用户线下/实测）

| 闸门 | 阻塞谁 | 状态 |
|---|---|---|
| `LARK-BIN-PROBE` WSL2 实测（bin 名 + wiki/bitable method 名，结论落 `docs/design/lark-cli-probe-result.md`，统一修 `cli-bridge.ts:17/47`） | KB-LARK / INV / Hermes 接入 | pending（纯本地 KB-CORE/PM/base 不依赖，可先行） |
| `HUB-ARTIFACT-STORE-MECH`（图纸存储）+ AI 读图能力 | INV 看图算量（增强） | pending，零代码 |
| 固定 IP / 部署服务器（InMemoryGovStore 重启丢失） | base 持久层 / 真实数据 | 待用户确认 |
| GovStore 扩展策略拍板（不扩 interface、仅 INV PartStock 需扩） | base/kb/pm/inv | base 收口刀首条 DoD 收 |

**可立即开工不受闸门阻塞**：base 收口刀、KB-CORE、PM 读+单写一刀 —— 三者零飞书/零 AI 读图依赖，`GET /api/dep-graph` 首刀已落地（verify 全过）。

## 7. 需求分析 14 条遗留（构建前收口清单，均非阻断）

**major（构建前应处理）**：① D-040↔D-041 PM 个人状态矛盾 → 取最新版（§1）② PM"卡住=在等谁"收敛为结构键 ③ GovStore 写入链+kb/inv 扩展契约（base 收口刀）④ kb.ts/inv.ts/TaskSchema 字段是各 DESIGN 产出物，DoD 第一条锚"先落 schema 草图" ⑤ 北极星缺度量 → 每根 DESIGN 产"触发表+死表基线+就绪门槛" ⑥ INV 缺硬门控 → §4 锁松一档+低门槛入口规矩 ⑦ LARK-BIN-PROBE 结论未回填 → KB-LARK/INV hardblock ⑧ 持久层切换契约 → base DoD ⑨ AI 确认流（入口/粒度/不回写 Bitable G2；confirmedBy=timestamp 非 memberId 守 I0）。

**minor（随设计带过）**：⑩ PM `dueDate` 本轮不引入（违 G4，甘特已暂缓）；priority 改 `criticalChain` 派生 ⑪ `GOV-SCHED-VIZ-DESIGN` 标挂起（D-041 7③ 排班=人治封存）⑫ 游离的 GOV-*/AXIS 系列逐行标后置/挂起防误认领 ⑬ "P13" 是"幽灵宪法条目"（§5 仅 I0/C1-C5/G1-G5/A1-A4）→ 降表述为"C1 死表实证（非独立编号）" ⑭ KB 相似提示补 A4 护栏措辞"只列候选不断言同因、由人选用"。

## 8. 诚实标注（对抗核实抓出的初稿幻觉）

- 初稿底座铺 8 条 GET 一把梭 → 实证前端只缺 `GET /api/dep-graph`（D-040 已收敛）。
- 初稿 INV minimalCut 引用的"DoD：至少 1 条 PartStock 由 Bitable 拉取"与"caveat ⑧"在 repo 中**不存在**，是把"应该这样设计"包装成"已登记事实" → 只作未来 DESIGN 的设计建议，不当既定门控。
- 初稿 PM 的 `targetWindowLabel/criticalChain` 改名方案非 D-041 已裁定，仅为建议；本轮按 D-041"甘特暂缓"根本不引入 `dueDate`。

**相关实证路径**：`apps/hub-server/src/store/gov-store.ts:9`（仅 getSnapshot）/ `server.ts`（GET /api/dep-graph、唯一 POST 是 mock adapter）/ `apps/hub-contracts/src/governance.ts`（TaskSchema、`criticalChainTaskIds`、`blockedByLabel`，无 dueDate）/ `apps/hub-contracts/src/`（无 kb.ts/inv.ts）/ `apps/lark-toolkit/src/boundary.ts`（白名单仅 im.v1.message.create）/ `cli-bridge.ts:17/47 vs :22`。
