---
kind: canonical-domain
status: active
domain: integrations
truth_for: lark-hermes-git-and-external-touchpoints
last_reviewed: 2026-08-15
---

# Integrations 领域

## 1. 职责与边界

Integrations 管飞书、Hermes、Git 等外部触点的配置、鉴权、事件转换和出站通知。它不拥有 PM、KB、库存或报账规则，只把外部输入转成明确 use case，并把结构结果投影回触点。

## 2. 当前行为（CURRENT）

- hub-server 已有飞书配置读取/保存/重置、群列表、建群、保存时测试消息和手动推送 API。
- `POST /api/hermes/inbound` 使用 Bearer 写门接收 Hermes 动作；loopback credential 端点可供本机 Hermes 获取 token。
- 设置页支持 App ID、App Secret、chat_id 选择/手填，并回显连接状态。
- 出站失败记录错误但不阻断主业务；通知不 @个人。
- 仓库仍有旧 `lark-gateway`、`lark-toolkit`、`pf-skills` 三包，但未被 TeamHub 主运行链、根 workspace 或部署脚本引用。

## 3. 目标结构（TARGET）

- 飞书配置和 token 进入统一 SQLite 的平台配置/秘密边界；日志与 API 不回显 secret。
- integrations module 通过窄 application ports 调 PM/KB/inventory，不直接导入各域 repository。
- 若无需独立长连接进程，删除旧三包；若确认需要，则合成一个由根 workspace 管理的 `integrations/lark` 包。
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

## 6. 已知陷阱

- 旧三包是 ProbeFlash 时期设计，三份 lock/版本/验证链与当前仓库拓扑冲突。
- 长连接、TeamHub 内置飞书 API 和 Hermes 三条路径职责仍有重叠，必须先裁决再迁移。
- `tenant_access_token` 可自动刷新不等于应用创建、权限审批可以自动化；首次接入仍需人操作。
- 当前出站事件种类有限，不应在没有真实需求时预建通用事件总线。

## 7. 未落地差异与 TODO

- `ARCH-UNIFY`：裁决旧三包删除或合并；默认建议删除，未来按真实长连接需求重建单包。
- `HERMES-LARK-SKILL`：Hermes 侧 skill 由用户维护，TeamHub 只稳定公开 use case。
- `LARK-BIN-PROBE`：若仍选择 CLI 路径，需用户在目标 Linux/WSL 实测可执行文件和 method 名。
- `REIMBURSE-LARK-BITABLE` 已明确挂起；不得破坏报账“不存文件”和 I0 边界。
