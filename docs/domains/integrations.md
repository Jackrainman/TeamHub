---
kind: canonical-domain
status: active
domain: integrations
truth_for: lark-hermes-git-and-external-touchpoints
last_reviewed: 2026-08-30
---

# Integrations 领域

## 1. 职责与边界

Integrations 管飞书、Hermes、Git 等外部触点的配置、鉴权、事件转换和出站通知。它不拥有 PM、KB、库存或报账规则，只把外部输入转成明确 use case，并把结构结果投影回触点。

## 2. 当前行为（CURRENT）

- hub-server 已有飞书配置读取/保存/重置、群列表、建群、保存时测试消息和手动推送 API。
- `POST /api/hermes/inbound` 使用 Bearer 写门接收 Hermes 动作；loopback credential 端点可供本机 Hermes 获取 token。
- **群聊一句话记账（库存域）已落地**：contracts `hermes.ts` 定义命令枚举（inv-query / inv-record）+
  规则解析器 `parseHermesText`（入库/损耗/调拨/按机器人·类别·名称查询，正则首中即返，匹配不上返回 null
  由消费侧升级给 AI）；服务端路由含调拨补偿回滚，所有 Hermes 动作记 `source: 'hermes'`。
  现有语料示例：「3508还有几个」「新到了5个电容」「3508烧了一个」「把电容从R1拆到R2」。
- 设置页支持 App ID、App Secret、chat_id 选择/手填，并回显连接状态。
- 出站失败记录错误但不阻断主业务；通知不 @个人。
- ProbeFlash 时期的 `lark-gateway`、`lark-toolkit`、`pf-skills` 三包已按 D-090 删除；它们从未进入 TeamHub 主运行链。

## 3. 目标结构（TARGET）

- 飞书配置和 token 进入统一 SQLite 的平台配置/秘密边界；日志与 API 不回显 secret。
- integrations module 通过窄 application ports 调 PM/KB/inventory，不直接导入各域 repository。
- 若以后确认需要独立长连接进程，从当前 contracts/application port 新建一个由根 workspace 管理的 `integrations/lark` 包，不恢复旧三包。
- 入站事件带幂等键、来源和确认状态；耗时操作异步处理，避免消息重复。

## 4. 领域不变式

- TeamHub 是业务真相，飞书只做入口和通知，不双写成第二本账。
- App Secret、WRITE_TOKEN 和 provider key 不进入响应、日志、提交或普通 UI。
- AI 只把自然语言转成草稿；写业务事实前必须通过领域 schema、鉴权和必要的人确认。
- 出站通知以事/组/里程碑为主，不发送个人绩效或催促。
- 网络失败不得回滚已提交的主业务；需要重试时必须幂等。

## 5. 跨域接口

- PM：认领、任务草稿、里程碑结构通知。
- Knowledge：症状检索、调试记录和结案草稿。
- Inventory：动作草稿和缺料/装箱结构通知。
- system：凭证、loopback/operator 判定和集成设置。
- Git：repo/commit 作为进度或 artifact 引用，不由 TeamHub 接管仓库事实。

## 6. 群聊记账 MVP 设计（HERMES-CHAT-MVP，2026-08-30 与 Hermes 侧对答案后落稿）

### 6.1 部署形态拍板：检测/外挂式，不附带部署

TeamHub **不捆绑部署 Hermes**。Hermes 是独立演进系统，附带部署会造成版本与运维纠缠。
现有架构天然支持外挂：Hermes 与 TeamHub 同机时走 `GET /api/hermes/credential`（loopback 限定）
零配置拿写 token；跨机则人工配 `TEAMHUB_WRITE_TOKEN`。TeamHub 侧永远被动接收，不反向依赖 Hermes 在线。
多队伍 = Hermes 侧每队一个 profile（独立飞书应用/技能/memory），TeamHub 实例各自独立，无需多租户改造。

### 6.2 身份映射（GAP，待做）

现状缺口：Hermes 动作只记 `source: 'hermes'`，**没有「谁」**。设计：

- TeamHub 名册扩展映射表 `feishu_link(member_id, union_id, open_id)`——映射是名册业务事实，存 TeamHub 侧；
  Hermes 网关只做粗粒度 allowlist，不该知道「谁是仓管」这种业务语义。
- 主键用 `union_id`（`on_`，开发者级稳定，换飞书应用不丢），`open_id`（`ou_`，应用级）兜底。
- 新增只读端点 `GET /api/links/me?union_id=xxx` → memberId；skill 拿到映射后在写请求里显式带
  memberId/confirmedBy——写库人键必须是真实 memberId，不是飞书 ID。

### 6.3 指令扩展（GAP，待做）

库存两命令已有，补齐另外两个高频场景即覆盖 MVP：

| 指令 | 命令（拟） | 落点端点 | 说明 |
|---|---|---|---|
| 记在场 | `presence-checkin` | `POST /api/resource-sessions`（+batch） | 「下午2-5点我在实验室」→ 时间窗+成员推导 |
| 任务推进 | `task-advance` | `POST /api/tasks/:id/claim` 等 | 「XX任务做完了」→ 任务名模糊匹配+状态流转 |
| 记库存/查库存 | inv-query / inv-record | 已有 | 无需改动 |

解析层沿用 `parseHermesText` 规则匹配先例：新命令加正则分支，匹配不上返回 null 升级给 Hermes AI 转译
（AI 只产草稿，写库前过 schema+鉴权，见 §4 不变式）。

### 6.4 指令级鉴权（GAP，待做）

网关三层鉴权里 TeamHub 能白拿两层半（飞书 allowlist / @机器人触发 / 每用户独立会话），
最后一层「谁能记库存」必须落 TeamHub：skill 传 union_id → TeamHub 按名册角色判定 → 不过就拒绝。
权限规则与名册/角色绑定，改角色不动 Hermes 侧。

### 6.5 回执与复核

群聊 @机器人 = 记账入口（即时文本回执，复用现有 `HermesInboundResponse.text` 通道）；
私聊 DM = 复核/对账入口（出站复用已有飞书推送通道）。出站不 @个人、不发绩效（§4 不变式不变）。

### 6.6 分工边界

TeamHub 侧（本仓）：feishu_link 表 + links/me 端点 + 两个新命令与解析分支 + 角色鉴权 + 测试。
Hermes 侧（用户维护，`HERMES-LARK-SKILL`）：skill 话术/触发词路由/调 API/回执渲染。
预估 TeamHub 侧约 1 天；skill 侧约 1 天（话术是主要工作量）。

## 7. 已知陷阱

- 旧三包的实现只存在于 Git 历史；不得因未来接入需求直接恢复其三套 lock/版本/生命周期。
- 长连接、TeamHub 内置飞书 API 和 Hermes 三条路径职责仍可能重叠，新增入口前必须先裁决边界。
- `tenant_access_token` 可自动刷新不等于应用创建、权限审批可以自动化；首次接入仍需人操作。
- 当前出站事件种类有限，不应在没有真实需求时预建通用事件总线。

## 8. 未落地差异与 TODO

- `HERMES-CHAT-MVP`：TeamHub 侧缺口见 §6.2–6.4（feishu_link 映射表 + links/me 端点 + presence-checkin /
  task-advance 两命令与解析分支 + 名册角色鉴权）；Hermes 侧 skill 由用户维护（`HERMES-LARK-SKILL`）。
- `ARCH-UNIFY` A0：旧三包已经删除；后续只收敛 TeamHub 主程序内现有 integration route/config。
- `HERMES-LARK-SKILL`：Hermes 侧 skill 由用户维护，TeamHub 只稳定公开 use case。
- CLI/独立长连接不在当前实现范围；未来有真实运行需求时重新立项并做目标环境 probe。
- `REIMBURSE-LARK-BITABLE` 已明确挂起；不得破坏报账“不存文件”和 I0 边界。
