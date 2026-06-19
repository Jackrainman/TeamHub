---
last-synced: 2026-05-17
synced-from:
  - docs/planning/now.md
  - docs/planning/roadmap.md
update-policy: 仅在用户明确要求"更新可视化文档"时修改
---

# Planning 可视化参考

> ⚠️ **【已归档·v0.3 pivot 前】**：本文件画的是 D-024 之前的 ProbeFlash「Skill / Bridge / Trail 中央枢纽」+ 飞书多维表格（D-038 已禁双写）+ LARK-01/02「待启动」（早已 done）——对当前 Team Hub 四层架构**已全部过时**。仅历史追溯，现行图示待 `GOV-VIZ` 系列另起。
>
> 不在默认读取链。需要看图 / 看状态表时再打开。
> 文字事实源在 `now.md` / `roadmap.md` / `decisions.md` / `backlog.md`；本文件只承载**图、流、表**。

## 1. 中央枢纽架构（pivot 后第二阶段）

```
┌─────────────────────────────────────────────────────────────┐
│                    ProbeFlash 中央枢纽                       │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │    Skill    │  │   Bridge    │  │        Trail        │  │
│  │  症状→检查单 │  │ 阻塞匹配    │  │    年鉴/知识检索     │  │
│  │             │  │ 人员配对    │  │                     │  │
│  └──────┬──────┘  └──────┬──────┘  └─────────────────────┘  │
│         ↑                ↑                                  │
│    飞书群聊消息      飞书多维表格                            │
│    （@、调试描述）   （人员状态）                            │
│         │                │                                  │
│    └────┴────────────────┘                                  │
│              ↑                                              │
│         飞书开放平台                                        │
│    （企业内部应用 / webhook / API）                         │
└─────────────────────────────────────────────────────────────┘
```

来源：roadmap.md §0 "架构升级（第二阶段：飞书集成，2026-05-15）"。

## 2. 飞书生态数据流

```
飞书生态                    ProbeFlash                    输出
─────────────────────────────────────────────────────────────────
群聊消息 (@、调试描述)  →   Skill: debug-checklist   →   检查单（回飞书）
                           ↓
                    .debug-archive/*.md
                           ↓
多维表格（人员状态）    →   Bridge: 阻塞匹配算法      →   配对建议（回飞书）
                           ↓
                    docs/trail/年鉴视图
```

来源：now.md "架构定位（2026-05-15）"。

## 3. Bridge 消息处理管道

```
飞书群聊消息
    ↓
飞书 Agent（消息解析）
    ↓
提取结构化事件：
  - 类型：调试症状 / 任务变更 / 阻塞声明 / 求助
  - 人物：@发送者
  - 内容：关键词提取
    ↓
ProbeFlash Bridge 处理器
    ↓
更新状态：
  - 人员当前任务
  - 阻塞关系图
  - 技能匹配建议
    ↓
回写飞书：
  - @相关人："你可能能帮上忙"
  - 群消息："当前阻塞汇总"
```

来源：roadmap.md §2.1。

## 4. Bridge 关键字段（与飞书多维表格同步）

```yaml
member:
  id: 飞书 user_id
  name: 显示名
  skills: [机械设计, STM32, ROS2, ...]      # 自填 + 从消息提取
  current_task: 当前公开声明的任务
  status: 空闲 / 进行中 / 阻塞
  blocked_on: 等什么人/事
  last_update: 时间戳（来自飞书消息）

task:
  id: 任务标识
  name: 任务描述
  owner: 负责人
  status: 进行中 / 已完成 / 阻塞
  blockers: [阻塞原因列表]
  required_skills: [需要的技能]
  matched_helpers: [可能匹配的帮助者]       # Bridge 算法产出
```

来源：roadmap.md §2.2；详细 schema 在 LARK-02 调研后由 BRIDGE-01 落地。

## 5. 能力速览（pivot 后）

| 能力 | 状态 |
|---|---|
| ProbeFlash v0.3 完整产品（含部署 / systemd / verify 全套） | ✅ 冻结 |
| Skill: `debug-checklist` v0.0.1 | 🟢 已落地，自用喂养中 |
| Skill: `personal-daily-summary` v0.0.1 | 🟢 已落地，备赛期可用 |
| Skill: `pre-match-checklist` v0.0.1 | 🟢 已落地，赛前可用 |
| Flybook Agent 架构设计 | ⏳ LARK-01 待启动 |
| Flybook API 能力调研 | ⏳ LARK-02 待启动 |
| Bridge / 联调板（飞书集成版） | ⏸️ 等 LARK-02 完成 |
| Trail / 足迹档案 | ⏸️ 等 archive 数据积累 |

来源：now.md "能力速览（pivot 后）"。
