---
status: skeleton
date: 2026-06-09
owner: Teamhub
scope: concept-design
decision: D-026
supersedes: D-024 的"信息路由器 / 监控 broker"产品定位
---

# Teamhub 概念设计 — 制度化进度治理系统

> 目标：把 Teamhub 从"信息路由器 + 后端运维控制台 + adapter 底座"（D-024）升级为**制度化的项目进度治理系统**（D-026）。
> 本文件为**骨架版**：方向与四层架构已定；两项待拍板（架构走法 A/B、提醒可见范围/送达模型）相关章节标 `> 待定`，待拍板回填。

## 0. 一句话

```text
Teamhub = 机器人战队的轻量进度治理系统：
跨组协调 + 管进度 + 不让某些人干太多；
当进度卡住、当事人羞于开口时，靠制度让系统替他把卡点说出来，
并提前暴露"没人去满足的隐含依赖"，让所有人动起来。
```

## 1. 结论

当前阶段做**制度化进度治理系统**：四层架构（数据真相 → 规则治理 → 展示汇报 → 触点集成），
以"规则/治理层"为产品的魂。已建的 Team Hub 壳子（`hub-server` / `hub-contracts` / `hub-console` / Compose）
**不废弃**，降为四层里的"触点/集成 + 展示底座"复用；治理域是新增核心。

执行顺序沿用原子任务纪律：先写概念与接口契约 → 每次只认领一个原子任务 → 先详细设计再写代码与验证。

## 2. 背景

- D-024/D-025 把 Teamhub 定位为监控 / adapter broker（信息路由 + 运维控制台），并把"大型项目管理系统 / 权限 / 多租户"列为非目标。
- 2026-06-08 讨论澄清了真实需求："飞书里全靠人主动发消息 / 凭感觉，卡点和过载暴露不出来"。需要的是**制度化地暴露卡点与隐含依赖**——这恰恰要求被 D-024 列为非目标的能力（轻量项目管理 + 角色 + 组织树）。
- 因此 reframe（D-026）：监控 broker 定位与该魂结构错配，升级为进度治理系统，但保持"轻量 + 5-15 人小作坊"。

## 3. 目标

- 跨组协调：把任务、人、依赖、前置需求建模成系统真相，不靠飞书凭感觉。
- 暴露而非督促：提前暴露"没人去满足的隐含依赖 / 缺口"，让所有人动起来，避免"我以为"（视觉以为完成→联调炸→没人去要测试板→拖几天）。
- 替你说：进度卡住 / 静默时，系统私下、帮忙口吻地替当事人把卡点说出来（尤其对大一 / 低资历）。
- 低录入：进度尽量从飞书 / Git 既有动作派生，不要求队员日常打卡。
- 给老师的项目级汇报自动生成（队员愿意用的"当下回报"），不含个人比较。

## 4. 非目标（轻量边界）

- 不做完整 RBAC / 多租户 / 大型项目管理系统——治理是轻量：三层角色 + 可配置组织树 + 无硬截止（C3）。
- 不做人与人产能排名 / 绩效统计——任何角色（含组长 / super admin / 老师）都不得见（C2 + 反监视 A1）。
- 不在飞书与系统之间双写（路线 A，G2）。
- 不设硬截止 deadline；只发可一键回的轻提醒（G4）。
- 不炼丹 / 不 fine-tune / 不做 RAG / embedding。
- 不自研 Git forge；不把 `xju-feiyue` 社区业务搬入。

## 5. 四层架构

```text
④ 触点/集成层  飞书(是脸:汇报/通知/check-in) · Hermes/小龙虾/Claude Code · Git forge
        ↑ 只派生事件/动作，不持有真相
③ 展示/汇报层  动态最短任务周期图(关键链/收敛点/阻塞链) · 给老师的项目级自动汇报 · 控制台
        ↑ 读规则层结论与真相层数据
② 规则/治理层（魂）  卡点 / 过载 / 沉默超期 / 升级 判定；进度派生；缺口暴露；"系统替你说"
        ↑ 读真相层
① 数据真相层  项目/赛季 · 成员+角色+资历 · 可配置组织树 · 任务+依赖DAG · 前置需求Need
```

**路线 A**：真相在系统关系库（生产 Postgres，D-025 不变）；飞书只做汇报 / 通知 / 一键 check-in / 自动生成老师汇报；不双写。

## 6. 数据真相层（①）— 实体（需求粒度，schema 待 GOV-DATA-MODEL-DESIGN）

- **Season / Project**：按赛季分项目（RoboCon 每年新车 = 新项目）；人员 / 经验跨赛季沉淀。
- **Group**：可配置组织树（机械 / 电路 / 程序{电控, 视觉}，可能合并），不写死。
- **Member**：id · 显示名 · role（super admin / group admin / member）· 资历（年级）· 所属 group。
- **Task**（一等公民，非 member 上的 free-text）：负责人 / 协作人 / 组 / 状态 / 所属项目。
- **Dependency**：Task→依赖→Task 有向边，构成 DAG。
- **Need / 前置需求**（一等公民）：{描述, 提供方, 状态}，挂在 Task 上，跨组；人工填 / AI 建议 / 本人确认。

> 复用：`apps/hub-contracts`（HubEvent/GitRepoRef/ArtifactRef + Zod 边界）、v0.3 领域模型（状态机 / relatedIds 依赖模式 / 时间线）、`bridge-roster-design.md`（Task + progress_log 模型，**载体反转**为系统库）。

## 7. 规则/治理层（②，魂）— 待细化 GOV-RULES-LAYER-DESIGN

- **卡点检测**：依赖未满足 / Need 未被提供 / 阻塞链。
- **过载检测**：某人承担过多关键链任务 → 提示分流。
- **沉默 / 超期检测**：无 commit / 无 check-in 超过阈值 → 标"疑似卡住"。
- **升级**：卡点持续 → 私下轻提醒本人 →（按提醒模型）升级可见范围。
- **进度派生**：Git 提交 + 轻 check-in + 沉默检测 → 状态；**信号阈值（commit 频率 / 沉默天数 / check-in 形态）待定**。

## 8. 展示/汇报层（③）— 待细化 GOV-VIZ-DAG-DESIGN / GOV-REPORT-DESIGN

- **动态最短任务周期图**：任务依赖 DAG，高亮关键链 / 收敛点（总联调）/ 阻塞链；缺口 = "待点亮的红点"。先做"结构 + 状态"高亮版；CPM 精确工期为远期。
- **给老师的自动汇报**：项目级进度，不含个人比较（C2 / A2）。
- 控制台复用 `hub-console`（React/Vite/TanStack Query）。

## 9. 触点/集成层（④）— 待细化 GOV-LARK-DERIVE-DESIGN

- **飞书是脸（路线 A）**：从"人本来就在飞书做的动作"派生状态（@ / 回卡片 / 一键 check-in）；飞书做汇报出口 + 卡点通知；不双写。复用 Lark 三包（`lark-gateway` / `lark-toolkit` / `pf-skills`，D-020/D-021/D-022 路径 A 不变）。
- **Git**：提交 → 进度派生信号；Forgejo 默认（D-025 不变）。
- Hermes / 小龙虾 / Claude Code：adapter mock-first，真实接入用户线下审批。

## 10. 待拍板（开放项，回填前不动相关深设计）

> **待定 1 — 架构走法**：治理为主轴（`hub-contracts` 设治理为核心域，§6 实体进核心）vs 治理作 Hub 之上平行模块（少动现有契约）。倾向主轴 + 渐进迁移。利弊见 plan `teamhub-parsed-cerf.md` Part I §5 / D-026 开放项。

> **待定 2 — 提醒可见范围 / 送达模型**：混合（缺口任务级对相关方可见 · "该你动了"私聊本人 · 老师看项目级）/ 更私密优先 / 更透明。倾向混合（最贴反监视四原则 A）。用户仍在想。

## 11. 复用资产盘点

| 资产 | 复用 | 注意 |
|---|---|---|
| `apps/hub-contracts` | HubEvent / GitRepoRef / ArtifactRef / Zod 边界 / camelCase | BridgeMemberState 太薄（无 role/资历/group），治理实体需大幅扩展 |
| `apps/hub-server` / `hub-console` / Compose | Fastify+Zod route 契约、mock/real split、控制台分层、Compose 部署 | 作为触点/集成 + 展示底座保留 |
| v0.3 领域模型（`docs/archive/v0.3-pivot/product/`） | 状态机 / relatedIds 依赖 / 时间线 / Workspace-Project | v0.3 否决的"跨组需求单 / PM / 权限"正是新魂复活的 |
| `bridge-roster-design.md` | Task + progress_log + 接手视图 + 卡住检测 | **数据载体被路线 A 反转**（系统库做真相，非飞书多维表格） |

## 12. 工作流

沿用 `AGENTS.md §6` 原子任务纪律：每次一个原子任务，代码任务先有接口契约 / schema，adapter mock-first，真实写入审批。
后续候选见 `backlog.md` P0 治理系统（GOV-CONCEPT-REWRITE → GOV-DATA-MODEL-DESIGN → GOV-RULES-LAYER-DESIGN → GOV-VIZ-DAG-DESIGN → GOV-REPORT-DESIGN → GOV-LARK-DERIVE-DESIGN；ARCH-PATH / REMIND-MODEL 为 decision-needed）。

## 13. 历史

监控 broker 阶段的旧概念设计（Ingress / Event Router / Adapter Registry / Git&Artifact Index / Console + 业务模型 v0 + API 契约草案 + xju-feiyue 复用判断 + 技术选型）见 git 历史本文件旧版与 D-024/D-025；其接口与代码作为触点/集成 + 展示底座继续有效。
