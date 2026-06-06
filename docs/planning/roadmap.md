# Teamhub 路线图（Team Hub）

> 长期愿景骨架；任务态字段在 `now.md` / `backlog.md`；长期决策在 `decisions.md`。pre-pivot 历史快照 → `docs/archive/v0.3-pivot/`，默认不读。

## 0. 当前定位（Team Hub，2026-06-06 更新）

### 当前判定
Teamhub 升级为 **战队中枢 / Team Hub**：飞书、Hermes、小龙虾、Claude Code、CLI 等是入口；Teamhub Hub 大后端负责事件路由、adapter registry、Bridge 状态、Git/artifact 索引、audit/config/health；前端是可视化后端控制台。详见 `docs/design/team-hub-concept.md` 与 D-024。

Skill / Bridge / Trail 仍保留为能力 facet，但它们现在挂在 Team Hub 架构下：

| facet | Hub 下定位 | 当前策略 |
|---|---|---|
| Skill | adapter 调用的一类能力，处理“当下问题” | 不锁死在 Teamhub 自有 SKILL.md；Hermes / 小龙虾 / Claude Code / pf-skills 都可接入 |
| Bridge | Hub 的当前协作状态模型 | 通过控制台与飞书展示“谁卡住、需要什么帮助”；禁止产能排名 |
| Trail | Hub 事件、archive、artifact、日报的长期沉淀 | 等原料足够再做 viewer / 年鉴，不在壳子阶段抢跑 |

当前主线：

1. 先冻结 Team Hub 概念设计与边界。
2. 拍板技术栈：Node/TypeScript 统一栈 vs FastAPI + React。
3. 搭 Hub 后端壳子和控制台壳子。
4. 以 mock-first 方式接入飞书三包、Hermes / 小龙虾 / Claude Code adapter。
5. 设计战队服务器 Git forge / artifact 索引，不自研 GitHub。

### D-018/D-019 仍然生效的宪法
旧 markdown-only 边界已被 D-024 覆盖，但以下产品宪法继续生效：

- 填写成本必须由当下回报抵消。
- 让协作摩擦可见，让产能不可比。
- 小作坊优先。
- AI 是隐式经验的翻译，不是硬件验证的替代。
- 只为上游数据流自然存在的场景构建。

## 0a. 历史定位（pivot 后，2026-05-15，已被 D-024 覆盖）

### 历史回顾
ProbeFlash v0.3.0（2026-04 ~ 2026-05 初）已发布并冻结：本地 HTTP+SQLite + workspace + issue/record/closeout/archive/error-entry + 用户目录部署 + systemd 自启 + 全部技术债地基整波收完。作为完整作品 / 比赛交付物保留。

### 形态判定
v0.3 形态本质上是"跨组需求单"——为大组织异步协作 + 责任划分 + audit 设计的 issue tracker。但目标用户（机器人战队）是"小作坊"：5-15 人面对面工作，群里吼一声 / 私聊就能解决调试事件。**v0.3 没人主动用不是工程缺陷，是形态与场景的结构性错配。**

### Pivot 方向（第一阶段：纯本地 Skill）
不再做单体 issue tracker。把"调试 + 协作 + 成长"按时间维度拆成三个独立 facet：

| 时间 | facet | 形态 | 数据 |
|---|---|---|---|
| **当下**（"我有问题，给我个检查单"） | **Skill** `debug-checklist` | Claude Code skill | 写入 `.debug-archive/*.md` |
| **现在 / 即将**（"我们在做什么、等什么"） | **Bridge**（联调板） | 极简静态网页 / 打印 | `ROSTER.md` 或 `.bridge/*.md` |
| **过去**（"前人怎么走过来的"） | **Trail**（足迹档案） | 静态 viewer（年鉴 / 翻阅）| 读 `.debug-archive/`（自动织）|

**历史边界**：全部 markdown + git native，无 SQLite，无新 server。此边界已被 D-024 覆盖；现在允许 Team Hub 大后端和控制台。

### 架构升级（第二阶段：飞书集成，2026-05-15）

验证 Skill 可行后，引入飞书作为数据层：

- **输入**：飞书群聊（@、调试描述）→ Skill；飞书多维表格（人员状态）→ Bridge。
- **处理**：ProbeFlash 中央枢纽运行 Skill / Bridge / Trail 三 facet。
- **输出**：检查单 / 配对建议 → 回写飞书；年鉴 / 知识检索 → Trail 静态视图。
- **接入方式**：飞书开放平台（企业内部应用 / webhook / API）。

**核心判断**：微信数据难接入，飞书是更现实的起点。ProbeFlash 不做"另一个协作工具"，而是做"协作数据的处理器"。

### 设计宪法（北极星）
1. **填写的成本必须由当下回报抵消。** ProbeFlash v0.3 让人填"过去发生了什么"——填者当下不受益，所以没人填。新形态只允许"当下填、当下受益"的输入设计。
2. **让协作摩擦可见，让产能不可比。** 显示"导航任务卡了 3 天，需要 RTOS 知识" ✓；显示"张三这周完成 5 个任务，李四完成 2 个" ✗。核心边界：信息能直接导向"谁需要帮" ✓，导向"谁干得少" ✗。GitHub PR review queue 是好的反例，contribution graph 是坏的反例。
3. **小作坊优先**。不抢占大组织 ticketing 形态；不引入责任划分 / audit / 多租户 / 权限。
4. **AI 是转译器**——把老学长的隐式经验转成新人能照着走的清单；不替代真实硬件验证。
5. **不重复造轮子**——飞书有的（消息、通知、表格）直接用；飞书没有的（调试专用结构、症状关联、赛季年鉴）ProbeFlash 补。

## 1. Skill 层 — 当下

### 1.1 `debug-checklist`（已落地 v0.0.1）
**目标**：一句话症状 → 5-8 条带依据和验证动作的检查清单；可选写入 `.debug-archive/`。

- 当前：v0.0.1 已落地于 `.agents/skills/debug-checklist/SKILL.md`，自用为主。
- 后续：基于备赛期 dogfood 反馈调 prompt；archive 攒到 ≥20 条后引入"历史相似症状关联"。
- 不做：依赖 ProbeFlash server / SQLite / IssueCard 任何前置条件。

### 1.2 `personal-daily-summary`（已落地 v0.0.1）
**目标**：个人日报/周报生成，回答"这周干了啥"。

- 当前：v0.0.1 已落地
- 输入：git log + 用户口述 + debug-archive 命中
- 用途：备赛期记录技术学习轨迹（ROS/MPC/RL），防止"被老师 gank"
- 未来：与飞书 agent 结合，提取飞书@记录作为额外输入

### 1.3 `pre-match-checklist`（已落地 v0.0.1）
**目标**：赛前生成完整出征检查单。

- 当前：v0.0.1 已落地于 `.agents/skills/pre-match-checklist/SKILL.md`
- 覆盖：装备清单、工具清单、备件清单、上电仪式流程、人员分工
- 输出：可打印 markdown，赛前逐项勾选

## 2. Bridge 层 — 现在/即将（飞书集成版）

**目标**：把"我做什么 / 我被什么卡住 / 谁需要帮"做成可见的极简看板，让飞书群聊的碎片信息自动结构化。

### 2.1 数据流

飞书群聊消息 → 飞书 Agent 解析（事件类型：调试症状 / 任务变更 / 阻塞声明 / 求助；提取@发送者 + 关键词）→ ProbeFlash Bridge 处理器（更新人员当前任务、阻塞关系图、技能匹配）→ 回写飞书（@相关人 "你可能能帮上忙"；群消息 "当前阻塞汇总"）。

### 2.2 关键字段（与飞书多维表格同步）

- **member**：`id`（飞书 user_id）、`name`、`skills[]`、`current_task`、`status`（空闲/进行中/阻塞）、`blocked_on`、`last_update`。
- **task**：`id`、`name`、`owner`、`status`、`blockers[]`、`required_skills[]`、`matched_helpers[]`（Bridge 算法产出）。

详细 schema 在 LARK-02 调研后由 BRIDGE-01 落地。

### 2.3 启动条件

- **LARK-02 完成**：确认飞书 API 能力足够
- **Schema 确定**：与飞书多维表格字段对齐
- **最小验证**：1-2 人的小群跑通"消息 → 解析 → 回复"闭环

### 2.4 不做
- 人与人比产能的排名、绩效统计
- 实时消息全量存储（只提取结构化事件）
- 替代飞书原生功能（日历、文档协作）

## 3. Trail 层 — 过去（archive 数据足够后启动）

**目标**：让 `.debug-archive/` + 个人日报沉淀的 markdown 自动织成"我们这一年的样子"。

- 当前：等 archive 数据先长出来再做（archive 没原料，Trail 没意义）。
- 形态：静态 viewer，读 git 仓库，三种视图：
  - **个人足迹**：某队员一段时间的调试轨迹 + 每周干了啥
  - **模块史**：某模块（视觉 / 电控 / 运动）历年踩坑与突破
  - **赛季年鉴**：自动生成的"这个赛季的故事"
- **主动产出**：支持自动生成"这周干了啥"的个人摘要——直接回答老师/学长问话
- 未来增强：结合飞书文档协作记录，生成"谁贡献了什么知识"的图谱（非排名，是追溯）

## 4. 飞书集成专项（LARK 系列）

### LARK-01: Connector 架构设计
- 产出：飞书 agent 与 ProbeFlash 的接口设计
- 关键决策：推模式(webhook) vs 拉模式(轮询)；消息解析策略

### LARK-02: API 能力调研
- 产出：飞书开放平台能力评估报告
- 关键确认：
  - 群聊消息读取权限（企业内部应用审批流程）
  - 多维表格 API 限制（读写频率、字段类型）
  - 机器人@能力和消息格式
  - 与现有飞书文档的集成方式

### LARK-03: 最小可行集成
- 目标：跑通"飞书消息 → ProbeFlash 处理 → 飞书回复"的最小闭环
- 场景：@机器人 "调试底盘电机不转" → 返回检查单
- 部署：轻量 server 或 serverless 函数

### LARK-04: Bridge 飞书版
- 目标：群聊中声明状态和阻塞，自动同步到多维表格
- 形态：可能是飞书捷径/自动化流程 + ProbeFlash 后端

> 出站扩展实现通道（D-022 拍板）：3 秒 ack 同步路径 → SDK；卡片 / 多维表 / 建群 / OAuth / 拉成员等非同步路径 → lark-cli（经 apps/lark-toolkit/cli-bridge.ts）。详见 `docs/design/lark-connector.md` §9 与 `docs/superpowers/specs/2026-05-21-lark-cli-integration-design.md`。

## 5. ProbeFlash v0.3 — 已冻结

- **状态**：v0.3.0 作为完整作品 / 比赛交付物保留。
- **不做**：不再加功能、不修非阻塞 bug、不重构、不 polish、不写新 verify。
- **可做**：发现致命安全 / 数据破坏问题时打补丁。
- **未来一种可能**：网页代码退役为 Trail 的 markdown viewer——但要等 Trail 真有原料再决定。

## 时间线展望

| 时间 | 重点 | 里程碑 |
|------|------|--------|
| 2026 春-夏（备赛期） | Skill 自用喂养 | debug-archive 达到 20 条；飞书 API 调研完成 |
| 2026 夏（赛后） | LARK 系列启动 | 跑通飞书最小集成；Bridge schema 确定 |
| 2026 秋 | Bridge 飞书版验证 | 小范围试用；调优匹配算法 |
| 2026 冬-2027 春 | 新赛季实战 | 完整使用 Skill + Bridge + Trail；积累 Season 2 数据 |
| 2027 夏 | 知识传承 | Trail 年鉴生成；下届队员可独立使用 |

## 当前不做（硬约束）

- 不再加 issue tracker / closeout / workflow 类功能（v0.3 之外）。
- 不做权限系统、多租户、人与人比产能的排名、绩效统计。
- 不做 RAG / embedding / 向量库（纯文本检索够用）。
- 不做 Electron / fs / IPC。
- 不抢占服务器 80 端口；不依赖系统全局 Node。
- 不读 / 搜索 / 提交真实 API key（飞书 token 用环境变量）。
- 不依赖学校战队配合作为产品验证（备赛期不能要求别人投入）。

## 成功标准（一年后验收）

- [ ] debug-archive 有 30+ 条结构化记录
- [ ] 飞书集成跑通，群聊中可触发检查单生成
- [ ] Bridge 能显示"谁在等什么、谁能帮上忙"
- [ ] 新队员能通过 Trail 看到去年的典型问题
- [ ] 你个人能通过 daily-summary 追溯自己的学习轨迹
