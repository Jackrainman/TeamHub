# 飞书集成配置体验 TODO

> 2026-07-30 提出；2026-08-03 四条全部落地（v0.46.0）。

- [x] 引导文案 `settings.integrations.lark.hint` 补充步骤：启用机器人能力 → 加权限 → 发布 → 把机器人拉入群 → 从群 URL 取 chat_id（zh/en 双语，locales/settings.ts）
- [x] 新增 `GET /api/integrations/lark/chats` 列可用群，前端加下拉选择器（替代手动填 chat_id；保留"手动输入"逃生口）
- [x] 新增 `POST /api/integrations/lark/chats` 创建群（im/v1/chats 创建者即机器人，自动入群，无需另拉）
- [x] 保存配置时发测试消息验证 chat_id 有效（PUT 内 token 通过后真发一条测试消息，失败落 status=error 并回显原因）