# Hermes 鉴权方案调研（2026-07-26）

> 状态：调研完成，待用户拍板最终方案。

## 结论先行

**飞书自建应用（企业内部应用）没有"点链接就授权"的机制。** 初始设置是一次性 ~10 分钟手动操作（开发者后台建 app → 配权限 → 发布 → 管理员审批）。之后 bot 用 App ID + App Secret 自动获取 `tenant_access_token`（2h 过期，SDK 自动刷新），无需用户再介入。

## 三种 Token 对比

| Token | 身份 | 获取方式 | 适用场景 | 过期 |
|-------|------|----------|----------|------|
| `tenant_access_token` | App 代表企业 | App ID + App Secret 直接换 | **Bot 收发消息（我们用这个）** | 2h，SDK 自动刷 |
| `user_access_token` | 个人用户 | OAuth2 授权码流（用户点链接） | 以用户身份操作（日历/文档） | 2h，可 refresh |
| `app_access_token` | App 自身 | App ID + App Secret | ISV 商店应用中间态 | 2h |

**TeamHub 的 Hermes bot 只需要 `tenant_access_token`**，不需要 OAuth 用户授权流。

## Bot 所需权限（最小集）

| Scope | 用途 |
|-------|------|
| `im:message` | 消息基础权限 |
| `im:message.group_at_msg:readonly` | 读群里 @bot 的消息 |
| `im:message:send_as_bot` | 以 bot 身份发消息 |

事件订阅：`im.message.receive_v1`（接收消息 v2.0）。
连接方式：**长连接（WebSocket）**，无需公网 IP / webhook URL。

## 初始设置流程（一次性，不可自动化）

1. 飞书开发者后台 → 创建企业自建应用 → 拿到 App ID + App Secret
2. 添加"机器人"能力
3. 权限管理 → 开通上表三个 scope
4. 事件与回调 → 订阅 `im.message.receive_v1`，选长连接模式
5. 版本管理 → 创建版本 → 可用范围"全员" → 申请发布
6. 管理员审批（可能同一人）
7. 把 App ID + App Secret 配到 Hermes 运行环境

## 2025-2026 新选项：MCP SDK 一键建应用

飞书新出了 MCP Open Tools SDK，可以：
- 自动创建应用 + 预设权限 + 预设事件订阅
- 用户只需扫二维码确认
- 返回 App ID / App Secret

**但仍需人扫码确认**，不是完全零交互。如果 Hermes 侧集成了这个 SDK，可以把步骤 1-4 自动化，用户只做"扫码 + 审批"两步。

## 对 TeamHub 的建议

| 方案 | 体验 | 复杂度 | 推荐 |
|------|------|--------|------|
| A. 维持 WRITE_TOKEN | Hermes 带 Bearer 调 TeamHub，零新机制 | 最低 | 当前已实现，先跑通 |
| B. 飞书 app 凭证存 TeamHub | TeamHub 设置页存 App ID/Secret，主动推消息给飞书 | 中 | 后续做（出站推送） |
| C. MCP SDK 一键建应用 | 用户扫码即完成 Hermes 飞书侧配置 | 高（Hermes 侧集成） | 看 Hermes 侧是否支持 |

**我的建议**：
- 入站（Hermes → TeamHub）：维持 WRITE_TOKEN，已跑通，够用
- 出站（TeamHub → 飞书推通知）：后续做，需要 App ID/Secret 存 TeamHub 侧
- 初始设置：写一份 10 步图文指南，用户照着做一次即可
- .env 管理：向导/设置页生成 WRITE_TOKEN（不手写），见 backlog ENV-TOKEN-DESIGN

## 参考

- 飞书自建应用开发流程：https://open.feishu.cn/document/develop-process/self-built-application-development-process
- 获取 tenant_access_token：https://open.feishu.cn/document/server-docs/api-call-guide/calling-process/get-access-token
- MCP 一键建应用：https://open.feishu.cn/document/mcp_open_tools/integrating-agents-with-feishu/overview
- 三分钟 Echo Bot：https://open.feishu.cn/document/uAjLw4CM/uMzNwEjLzcDMx4yM3ATM/develop-an-echo-bot/introduction
