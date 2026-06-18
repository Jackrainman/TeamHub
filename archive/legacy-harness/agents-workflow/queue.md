---
version: "1.0"
updated: "2026-05-16T14:35:00+08:00"
project: lark-gateway
status: forward-looking
written_at: 2026-05-16
activated_by: docs/planning/workflow-evolution.md §9 4 条 checklist 全部完成
note: 本文件未构成当前工作流约束；激活前 AI 不应据此立任务、不应据此修改 backlog/now.md/decisions.md
---

# 任务队列

> 按 **"持续推进"** 认领下一个 ready 任务

## Active

### T-001 [ready]
**scope**: lark-gateway architecture
**size**: large
**claimedBy**: 
**blockedBy**: []
**brief**: 设计飞书网关整体架构，产出架构设计文档、模块划分、接口定义、数据流图
**acceptance**:
  - docs/agents/workflow/arch/ 目录存在
  - 架构设计文档被用户确认
  - 模块接口定义清晰
  - npm install 预装确认完成

### T-002 [ready]
**scope**: types module
**size**: small
**claimedBy**: 
**blockedBy**: [T-001]  # 需确认架构后实施
**brief**: 实现 TypeScript 类型定义 (types.ts)
**acceptance**:
  - FeishuMessageEvent, ParsedMessage, SkillContext 等类型定义
  - 类型测试通过

### T-003 [ready]
**scope**: config module
**size**: small
**claimedBy**: 
**blockedBy**: [T-001]
**brief**: 配置模块 (config.ts)，环境变量 + zod 验证
**acceptance**:
  - zod schema 验证
  - loadConfig() 函数
  - 测试覆盖

### T-004 [ready]
**scope**: logger module
**size**: small
**claimedBy**: 
**blockedBy**: [T-001]
**brief**: 简单控制台日志 (logger.ts)
**acceptance**:
  - debug/info/warn/error 方法
  - 开发环境 debug 输出

### T-005 [ready]
**scope**: message parser
**size**: medium
**claimedBy**: 
**blockedBy**: [T-002]
**brief**: 飞书消息解析 (services/message-parser.ts)
**acceptance**:
  - parseMessage 函数
  - shouldProcessMessage 函数
  - 单元测试

### T-006 [ready]
**scope**: debug-checklist skill
**size**: medium
**claimedBy**: 
**blockedBy**: [T-001]
**brief**: Claude API 集成生成检查单 (skills/debug-checklist.ts)
**acceptance**:
  - generateDebugChecklist 函数
  - SYSTEM_PROMPT 硬编码
  - JSON 解析容错

### T-007 [ready]
**scope**: sse manager
**size**: medium
**claimedBy**: 
**blockedBy**: [T-001]
**brief**: SSE 卡片流管理 (services/sse-manager.ts)
**acceptance**:
  - createSseStream
  - formatCardMarkdown
  - streamChecklistToCard

### T-008 [ready]
**scope**: feishu client
**size**: medium
**claimedBy**: 
**blockedBy**: [T-003]
**brief**: 飞书 API 调用 (services/feishu-client.ts)
**acceptance**:
  - getTenantAccessToken (带缓存)
  - sendTextMessage
  - sendInteractiveCard
  - updateCard

### T-009 [ready]
**scope**: webhook handler
**size**: medium
**claimedBy**: 
**blockedBy**: [T-005, T-008]
**brief**: Webhook 路由 (routes/webhook.ts)
**acceptance**:
  - verifyWebhookSignature
  - POST /feishu 处理
  - 完整消息处理流程

### T-010 [ready]
**scope**: server setup
**size**: small
**claimedBy**: 
**blockedBy**: [T-003, T-004]
**brief**: Express 服务器 (server.ts, main.ts)
**acceptance**:
  - createServer()
  - 中间件配置
  - 健康检查端点

### T-011 [ready]
**scope**: integration test
**size**: small
**claimedBy**: 
**blockedBy**: [T-009, T-010]
**brief**: 集成测试
**acceptance**:
  - webhook.integration.test.ts
  - 可运行

### T-012 [ready]
**scope**: documentation
**size**: small
**claimedBy**: 
**blockedBy**: [T-011]
**brief**: README 文档
**acceptance**:
  - 架构说明
  - 开发/部署指南

## Archive

(none yet)
