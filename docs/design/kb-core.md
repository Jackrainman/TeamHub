---
status: implemented
date: 2026-06-14
owner: Teamhub
scope: 战队知识库·核心（KB-CORE）设计 + 落地说明
decision: D-044（KB-CORE 落地：移植 Probe_Flash 调试闭环 + 相似检索 + 结案派生知识节点）
frontier: '#1 KB-CORE（base 收口刀后第一支柱第一刀）'
source: §6.B continuous-build 连续构建（U1~U6 各自 verify+单独 commit）+ 4-opus 对抗核实
---

# 战队知识库·核心（KB-CORE）设计

> 本文是 D-039 三支柱之①「战队知识库」核心层的设计 + 落地说明，**非默认读取链**（KB 相关任务时读）。
> 权威决策见 `decisions.md` D-044 / D-042（拆 CORE/LARK）；任务行见 `backlog.md` KB-CORE-DESIGN。
> 飞书层（拉 wiki/drive 资料）= `KB-LARK-DESIGN`，hardblock `LARK-BIN-PROBE`，本文不含。

## 0. 一句话

调试时本就会记「现象 / 试了什么 / 根因」，KB-CORE 让这串副产品**结案时自动归档 + 派生成可复用知识点**，
并在新 bug 出现时**召回跨赛季同类历史**——「用着就沉淀，不做事后填总结」。零飞书、零 AI 读图，四根里最快交付。

## 1. 北极星 + 痛点

- **痛点（D-039 二次确认的用户原声）**：同一 CAN / MicroROS / 电机 bug 跨赛季重踩，单次 1–4h；老人走了经验断层。
- **北极星**：用着就沉淀（派生优先 C1）/ AI 只当仓管（转译不下判断 C4/A4）/ 人在环 / 小作坊轻量（C3）。
- **不做**：完整工单系统、AI 自动判定根因、按人统计「谁调 bug 多」（C2 反排名）。

## 2. 领域模型（移植自 Probe_Flash 同源，落 `apps/hub-contracts/src/kb.ts`）

调试闭环 Zod 链：`IssueCard → InvestigationRecord → ErrorEntry → ArchiveDocument`。

| 实体 | 角色 | 关键字段 |
|---|---|---|
| `IssueCard` | 一次调试问题卡 | normalizedSummary / symptomSummary / tags / relatedFiles / relatedCommits / status |
| `InvestigationRecord` | 调查时间线一条 | type(observation/hypothesis/action/result/…) / polishedText（AI 转译人读版）|
| `ErrorEntry` | 结案沉淀的错误表条目（跨赛季可检索）| errorCode(DBG-YYYYMMDD-NNN) / rootCause / resolution / prevention |
| `ArchiveDocument` | 结案归档 markdown | generatedBy(ai/manual/hybrid，**非人名**) |

**移植差异（诚实标注，§10）**：
- **去掉 `repoSnapshot`**：Probe_Flash IssueCard 内嵌整份 git RepoSnapshot（desktop 单机抓取产物）。TeamHub
  git 关联走治理侧 gitCommit 信号 + 本卡 `relatedCommits/relatedFiles`，不内嵌（C3 轻量 + 不与治理 git 路径双写 G2）。
- **保留 `normalizedSummary/relatedFiles/relatedCommits`**：`buildCloseoutFromIssue` 读它们，删则 TS2339。
- **时间字段统一 `isoDateTimeSchema`**；import 头按 verbatimModuleSyntax（`.js`/单引号/`import type`）。
- **结案派生 `KnowledgeNode`**：新增 `deriveKnowledgeNodeFromIssue`，复用 `growth.ts KnowledgeNode`（树从标注长出、不预设本体 C3）。

## 3. 触发表（用户动作 → 派生路径 → 写目标）

> C1 验证核心：每个写目标都挂在「人本来就会做的动作」上，**没有一格要求凭空填表**。

| 用户动作（本就会做） | 派生路径 | 写目标 | 路由 |
|---|---|---|---|
| 调试时记一句现象/假设/结果 | 转成 `InvestigationRecord`（AI polish 人读版） | 时间线（挂当前 IssueCard） | （录入入口随 Hermes 统一触点接，§5 后置）|
| 结案时填根因 + 处理（手填，仅此一处必填）| `buildCloseoutFromIssue` 派生归档+错误表+派生知识节点 | `ArchiveDocument`+`ErrorEntry`+`KnowledgeNode`（持久到治理快照）| `POST /api/kb/closeout` |
| 遇新 bug 描述症状 | `rankSimilarIssues` 在历史语料上打分召回 | **只读**（不写）→ 候选检查单 | `GET /api/kb/similar` |
| （未来）人选用某历史卡 | 回挂 `relatedHistoricalIssueIds` | IssueCard 的人选关联（非 AI 断言） | 后置 |

**唯一必填 = 结案根因/处理**（`rootCause/resolution`，可行性 §2 已认；缺则 422，不伪造完成 §10）。其余全派生。

## 4. 死表基线（KB-CORE 凭什么不退化成又一张没人填的表）

| 维度 | 死表（要避免的）| KB-CORE |
|---|---|---|
| 录入触发 | 事后专门「填总结/填错误库」| 挂在调试动作 + 结案动作上，副产品自动沉淀（C1）|
| 写入口 | 主录入口，不填就空 | 兜底录入（C1）；`createTask/Dependency/Need` 仍 throw 后置，**不**让 KB 写路径过早成主录入死表 |
| 召回 | 人工翻历史 markdown | 症状→top-N 自动召回（findability §5）|
| 排名诱惑 | 谁建的卡多/谁调得快 | **无人维度**（C2）：主键是 issue/errorCode/知识点 |
| 跨赛季 | 每季重建 | `KnowledgeNode` 不挂 seasonId、`ErrorEntry` 跨季可检索 |

**老实定位**：本轮真实派生上游（调试动作→时间线录入）尚未接通（等 §5 Hermes 统一触点），故**不宣称已解 C1**——
当前落地的是「读召回 + 结案派生 + 写出入口」，录入交互随统一触点层补（与可行性 §3 跨根风险 3 一致）。

## 5. Findability 可测搜索路径

**可测路径**：`GET /api/kb/similar?symptom=<症状>&tags=<逗号分隔>` → 返回 top-N 相似历史卡（按 reasons 词重合排序）。

实证（已落单测，`apps/hub-server/test/kb-similar-route.test.ts` + `hub-contracts/test/kb-similar.test.ts`）：
- 「3508 电机又过热了」+ tags=电机,3508,散热 → top1 = `iss-motor-3508-2025`（跨赛季召回）。
- 「底盘 CAN 又丢报文」+ tags=CAN,通信,底盘 → top1 = `iss-can-2025`，matchedTags 含 CAN。
- 「报名表打不开」+ tags=行政 → items 空（低于 minScore，**不凑结论** A4）。

打分（移植自 Probe_Flash，逐字等价）：`标签×4 + 关键词×2 + 根因术语×3 + 处理术语×2 + 有错误表/归档各 +1`；
默认 `limit=4 / minScore=4`，querystring 可覆盖（limit/minScore coerce 成数）。

## 6. A4 / C4 安全车道护栏（措辞已焊进 API）

- 相似检索**只列候选、给「疑似同类」检查单条目，不断言「同因」、由人选用**。
- `GET /api/kb/similar` 响应固定带 `note`（常量 `KB_SIMILAR_NOTE`）：
  > 「以下为候选相似记录（按 reasons 词重合排序）；系统只列候选、不断言『同因』，请按 reasons 自行判断后选用。」
- `reasons` 是**客观词重合依据**（「标签重合：CAN、电机」），不是结论。
- 人选用历史卡才回挂 `relatedHistoricalIssueIds`（人的判断，非 AI 写入）。

## 7. I0 / C2 守恒（无人维度、无结案人历史）

- 召回项主键 = issue / errorCode / 知识点；语料 `kbScenarioFixture` 与返回项**无 memberId/ownerId**（grep 实证 + 单测断言）。
- 结案归档 `generatedBy` = ai/manual/hybrid（**非人名**）；`closeoutKbNode` 写入的 `KnowledgeNode` 无人维度，
  来源凭证是**结构**（resourceLinks 指向归档/文件/提交），**不存裸 memberId、不可事后 groupBy「谁结案最多」**（I0）。

## 8. 落地清单（§6.B 连续构建，U1~U6 各自 verify+单独 commit+push）

| 单元 | 产出 | commit |
|---|---|---|
| U1 | `kb.ts` schema 链 + `kbScenarioFixture`（跨赛季 CAN/3508/MicroROS）+ index 导出 | 45bbeaf |
| U2 | `kb-similar.ts` `rankSimilarIssues` 纯函数（findSimilarIssuesForIssue IO 不移植）| 73106c7 |
| U3 | `kb-closeout.ts` `buildCloseoutFromIssue` + `deriveKnowledgeNodeFromIssue` 纯函数 | 70c081b |
| U4 | `KbStore` 收窄（兑现 base 收口刀对抗核实）+ `InMemoryKbStore` | fe1123c |
| U5 | `GET /api/kb/similar`（症状→top-N + A4 note）| a7c2337 |
| U6 | `POST /api/kb/closeout` + `InMemoryGovStore.closeoutKbNode` 实现（I0 安全）| 3901b91 |
| U6b | 对抗核实顺手收口（删未用 import + 标注枚举改名）| 226e838 |

验证：`hub-contracts verify:all` 41 测 / `hub-server verify:all` 28 测 / `git diff --check` / `skills-sync` 全过。

**对抗核实**：`wf_fc3f1282-bbf`（3 opus lens[移植保真+TS / 宪法 §5 / 路由·Store 集成] → 1 opus 综合，231K token）逐条 grep+typecheck+test 实证后裁 **ship、mustFix=0**——3 条 nit（IssueStatus camelCase 改名 / derivePrevention 中文+errorEntryId 确定性[均 §10 标注] / 测试未用 import）均诚实标注或已收口（U6b），无真违宪/真 bug/真 TS 错。

## 9. 后续承接（不在本刀，已记 backlog/frontier）

- **KB-LARK**（飞书拉资料 / 规范入口 findability）：hardblock `LARK-BIN-PROBE`（WSL2 实测 bin + wiki method 名）。
- **录入交互**：调试时间线录入 UI / 统一触点（Hermes「记一笔」）随 §5 触点层一次接、多根受益（feasibility §5）。
- **IssueCard↔Task 关联 + `TaskKnowledgeTag` 派生**：等 PM 支柱（issue 挂任务后，结案可同时挂任务知识标注，
  `confirmedBy` 记 ActorRef provenance 非裸 memberId，守 I0）。
- **持久层**：`SqliteGovStore`/KbStore 真实持久化待部署服务器审批（§8）；当前 InMemory 重启丢失为预期。
- **console KB 页**：复用 DAG 页（@xyflow）模式做知识树浏览 + 相似提示卡（读侧资产齐）。
