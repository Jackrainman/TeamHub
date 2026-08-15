---
kind: research
status: active
domain: integrations
truth_for: lark-platform-capability-evidence
checked_at: 2026-07-26
review_after: 2026-10-26
---

# 飞书集成研究摘要

## 1. 当前结论

- TeamHub 的机器人收发消息使用企业自建应用，核心凭证是 App ID/App Secret 换取的 `tenant_access_token`；不需要个人 OAuth。
- 群内入站可订阅 `im.message.receive_v1`；长连接适合没有公网 webhook 的单实例战队服务器。
- 最小消息权限包括接收群 @机器人消息和以机器人身份发送消息，实际 scope 名以飞书后台当前页面为准。
- 首次创建应用、开能力、申请权限、发布和管理员审批仍需人完成；token 自动刷新不等于应用接入可以无人值守。
- TeamHub CURRENT 已能保存配置、列群/建群和发送测试消息；旧独立三包不在当前运行链。

## 2. 技术选型

- 官方 Node SDK 是长连接与消息 API 的首选基础；不采用已废弃旧 SDK。
- lark-cli/MCP 工具适合人工开发和低频管理动作，不应成为 3 秒消息 ack 主链的硬依赖。
- 若未来保留独立长连接进程，应合成一个受根 workspace 管理的 integration 包；业务规则仍留在 TeamHub application services。
- Hermes → TeamHub 使用受保护 HTTP use case；TeamHub → 飞书使用租户 token 出站，两个方向不要共享业务 repository。

## 3. 安全与运行约束

- App Secret、WRITE_TOKEN 和 access token 不写入 Git、普通日志、报错详情或用户可复制页面。
- 长连接多实例通常不应假定事件广播；当前产品按单实例设计。
- 事件处理必须带幂等依据；耗时 AI/文件处理应在 ack 后异步完成。
- 出站通知失败不阻断已提交业务；重试必须有次数上限和幂等键。
- 飞书是触点而不是第二本账，多维表格双向同步不在当前范围。

## 4. 用户一次性动作

1. 创建企业自建应用并启用机器人。
2. 申请最小消息权限和 `im.message.receive_v1` 事件。
3. 选择长连接或经审批的 webhook 形态。
4. 发布应用并完成管理员审批。
5. 将凭证填入 TeamHub 设置页，选择/创建目标群并发送测试消息。

这些动作不得由 Agent 猜测完成，也不得要求用户把 Secret 粘进对话。

## 5. 待复查事项

- 飞书开放平台 scope 名称、配额、长连接限制和 MCP Open Tools 接入方式可能变化，超过 `review_after` 后使用前必须重查官方文档。
- 当前不采用旧 CLI/三包路径；未来若出现独立长连接需求，必须重新核实目标 Linux 上 SDK、bin 和 method 支持。
- 旧三包在 `ARCH-UNIFY` 中默认删除；只有真实长连接需求重新出现时才按单包目标重建。

## 6. 官方来源

- 企业自建应用流程：<https://open.feishu.cn/document/develop-process/self-built-application-development-process>
- access token：<https://open.feishu.cn/document/server-docs/api-call-guide/calling-process/get-access-token>
- MCP Open Tools：<https://open.feishu.cn/document/mcp_open_tools/integrating-agents-with-feishu/overview>
- Echo Bot/长连接入门：<https://open.feishu.cn/document/uAjLw4CM/uMzNwEjLzcDMx4yM3ATM/develop-an-echo-bot/introduction>
