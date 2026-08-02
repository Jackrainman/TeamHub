# 设计现状与下一步（2026-07-28 修订）

> 基于代码实查修订。原文档 P0 判定有误（基准线/身份/MyView 均已完整落地），此版本反映真实缺口。

---

## 已完成（不需要再做）

| 条目 | 落地版本 | 说明 |
|------|----------|------|
| 倒排基准线 BASELINE-CORE | v0.11.5 | contracts+3 store+3 API+617 行面板+4 derive 函数+单测 |
| 轻身份登录 IDENTITY-LITE | v0.44.x | BootstrapGate 8 步向导+IdentityBar+PIN |
| 我的视图 MY-VIEW | v0.44.x | MyViewPage 可动手/被卡住分区 |
| 飞书出站推送 | v0.45.4 | 认领通知+里程碑提醒端点 |
| 飞书集成配置 | v0.45.0 | appId/appSecret/chatId 可编辑 |
| 远程部署 | 已部署 | redeploy 脚本已有 |
| 任务状态流转历史 TASK-TIMELINE | v0.46.0 | transitions 沿用 {from,to,at,by} 形状；by 注入（session/body）+ claim/complete/reject 追加 + 前端 TaskTimeline 渲染 + 测试 |
| 飞书配置体验四件套 | v0.46.0 | hint 步骤/群下拉/建群/保存时测试消息验证 chat_id（docs/lark-integration-ux-issues.md） |

---

## 真实缺口（按优先级）

### 1. 代码结构治理（当前重点）

server.ts 3672 行 92 路由、CSV 读取三复制、admin 鉴权两复制、safeParse+400 样板 40+ 处、前端无 domain hooks、SettingsPage 当公共库。

策略：不专门停下来重构，新功能新文件，逐步迁出。

### 2. 任务状态流转历史（TASK-TIMELINE）— ✅ 已落地 v0.46.0

Task 只有终态字段（claimedAt/completedBy），中间过程丢失。→ 已按既有 `transitions: {from,to,at,by}[]` 形状补齐 by 注入与 claim/complete/reject 追加，见上方已完成表。

### 3. 全局搜索（GLOBAL-SEARCH）

只有 KB 相似搜索和 Pool 页内 filter，无跨模块搜索。
方案：`/api/search?q=` 跨 PM/KB/INV 模糊匹配，顶栏搜索框。
工作量：~1.5 天

### 4. 时间线编辑器（TIMELINE-EDITOR）

基准线面板是只读展示，缺交互式编排。
方案：
- 全页路由 `/baseline/edit`
- 初始化态：向导式填 segment + 里程碑
- 日常态：里程碑节点点击 → 气泡选偏移（+n天/今天完成/-n天）→ 实时 pace 反馈
- segment 边界低频调整（"调整段"按钮，藏深一层）
- 里程碑说明字段：自由文本，手填
- 不引拖拽库，点击交互，移动端友好
工作量：~2.5 天

### 5. 任务级动态流（ACTIVITY-FEED）

Overview 只有系统事件（git/bot/bridge），无"谁认领了什么、谁完成了什么"。
依赖 TASK-TIMELINE 的 transitions 数据。
工作量：~1 天（timeline 落地后）

### 6. 数据导出（DATA-EXPORT）

只有导入模板，无"导出名册/库存/任务为 CSV"。
方案：3 个 GET 端点 + 前端导出按钮。
工作量：~0.5 天
优先级最低（截屏也能凑合）。

---

## 冰柜（不是当前问题）

- Git 中枢（无紧迫信号）
- 知识库飞书摄入（卡 lark 二进制探测）
- 老师汇报自动化（数据已有，学期末前做）
- Hermes 鉴权升级（WRITE_TOKEN 当前够用）
- Token 管理 UI（过度工程，不做）
- 移动端专门适配（有基础断点，暂不投入）
- 学习方向重设计（锦上添花）
