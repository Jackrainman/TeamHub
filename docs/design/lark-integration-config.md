# 飞书集成配置（2026-07-26）

> 状态：已拍板。合并原 HERMES-AUTH-SCHEME + ENV-TOKEN-DESIGN + INTEG-CONFIG 三项。

## 一句话

设置页一个表单接飞书，WRITE_TOKEN 自动生成不暴露给用户，入站出站都通。

## 架构

```
┌─────────────┐  tenant_access_token   ┌──────────┐
│  飞书开放平台 │◄──────────────────────►│ TeamHub  │  出站：推消息到群
└─────────────┘                        │  :4177   │
       ▲                               └──────────┘
       │ WebSocket 长连接                    ▲
┌─────────────┐  Bearer WRITE_TOKEN         │
│  Hermes Bot │─────────────────────────────┘  入站：/api/hermes/inbound
└─────────────┘
```

## 设置页表单（设置 → 集成 → 飞书）

| 字段 | 类型 | 说明 |
|------|------|------|
| App ID | text | 飞书开发者后台获取 |
| App Secret | password | 同上 |
| 目标群 chat_id | text | 出站推送目标 |

- 保存时调飞书 `auth/v3/tenant_access_token/internal` 验证凭据，失败则不保存、红字提示
- 保存成功后显示绿勾 + "连接正常"
- 未填写时集成保持 mock 模式，不影响其他功能

## WRITE_TOKEN 处理

### 原则

用户永远不需要知道、看到、手动管理 WRITE_TOKEN。

### 生命周期

| 事件 | 行为 |
|------|------|
| 首次启动（无任何 token） | `start-teamhub.sh` 自动生成 `crypto.randomBytes(32).hex`，写入 SQLite `system_config` 表 |
| Hermes 取 token | `GET /api/hermes/credential`，**仅 127.0.0.1/::1 可访问**，返回 `{ token }` |
| 用户重置集成 | 设置页"重置连接"→ 重新生成 token + 清飞书凭据，Hermes 下次调用 401 后重新取 |
| 数据库丢失/重建 | token 不存在 → 启动时重新生成；Hermes 401 → 重取 |

### 边界情况

| 场景 | 处理 |
|------|------|
| Hermes 持旧 token 调 API → 401 | Hermes 侧逻辑：401 → 调 `/api/hermes/credential` 取新 token → 重试一次 |
| 非 loopback 请求 `/api/hermes/credential` | 直接 403，不泄露 token 存在性 |
| 用户手动 curl 写 API（调试） | 从服务器本机 `curl localhost:4177/api/hermes/credential` 取 token；不写入任何 UI |
| 多进程/重启竞态 | token 存 SQLite 单行，读写原子；启动时 upsert |
| .env 里仍有旧 TEAMHUB_WRITE_TOKEN | 优先读 SQLite；.env 值仅作 fallback（兼容老部署），日志 warn 一次 |

### 排障指引（供后续产品排障手册引用）

- 症状：Hermes 消息到了但 TeamHub 没反应 → 检查 Hermes 日志是否 401 → 确认 loopback credential 端点可达
- 症状：设置页测试连接失败 → App ID/Secret 错误或应用未发布/未审批
- 症状：出站消息发不出 → 确认 chat_id 正确 + bot 在群内 + `im:message:send_as_bot` 权限已开

## 出站推送（第一版）

仅两种事件：

| 触发 | 消息模板 | 目标 |
|------|----------|------|
| 任务被认领 | `📋 {taskTitle} 已被认领` | 配置的目标群 |
| 里程碑剩余 N 天（默认 3） | `⏰ 里程碑 {name} 还剩 {n} 天` | 配置的目标群 |

- 推送失败静默记日志，不阻断主流程
- 不做 @个人（反监视原则 A2）

## 入站（已实现）

`POST /api/hermes/inbound` + Bearer WRITE_TOKEN，v0.43.4 已落地。Hermes 侧 skill 编写仍为用户侧任务。

## 向导集成

首启动向导加可选步"连接飞书"：
- 填 App ID / Secret / chat_id → 测试 → 跳过或保存
- 跳过 = mock 模式，后续设置页随时配

## 飞书应用初始设置（用户一次性操作）

1. 飞书开发者后台 → 创建企业自建应用
2. 添加"机器人"能力
3. 权限：`im:message` + `im:message.group_at_msg:readonly` + `im:message:send_as_bot`
4. 事件订阅：`im.message.receive_v1`，长连接模式
5. 发布 → 管理员审批
6. 把 App ID / Secret 填入 TeamHub 设置页

后续可出图文指南，不阻塞开发。

## 不做

- 多飞书应用 / 多群路由（C3 小作坊）
- OAuth 用户授权流（不需要）
- MCP SDK 一键建应用（看 Hermes 侧，不强依赖）
- token 过期轮换 / 多 token / RBAC scope
- 用户可见的 WRITE_TOKEN UI
