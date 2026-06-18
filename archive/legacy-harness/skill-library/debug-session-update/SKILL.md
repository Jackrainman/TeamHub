---
name: debug-session-update
description: 把用户追加的一条碎片记录转化为结构化的 InvestigationRecord，并关联相关文件与提交。
trigger: 用户在问题卡详情页追加一条记录时触发。
---

## 目的

让"换了 TTL 线无效"这样的一句话变成带类型、带线索、带关联的 `InvestigationRecord`，让时间线可追溯。

## 输入

```json
{
  "issueId": "string",
  "rawText": "string",
  "hintedType": "observation|hypothesis|action|result|conclusion|note (可选)",
  "repoSnapshot": "RepoSnapshot (可选，若发生在仓库变更后)"
}
```

## 输出（必须符合 schema）

```json
{
  "record": {
    "id": "string",
    "issueId": "string",
    "type": "observation|hypothesis|action|result|conclusion|note",
    "rawText": "string",
    "polishedText": "string",
    "aiExtractedSignals": ["string"],
    "linkedFiles": ["string"],
    "linkedCommits": ["string"],
    "createdAt": "ISO8601"
  }
}
```

## Prompt 模板要点

- 必须保留 `rawText` 原文。
- `polishedText` 只做轻度润色，不得虚构事实。
- `aiExtractedSignals` 提炼关键词，用于后续相似问题检索。
- 若用户提供 `hintedType`，优先采用，除非显然错误。

## 工具调用

MVP 阶段无外部 MCP 依赖，只需要本地存储读写。

## 反馈闭环

- schema 校验失败时仅重生 `polishedText` 与 `aiExtractedSignals`。
- `rawText` 永远保留，即使整条 AI 处理失败也要存库。
- 连续 2 次失败则降级：保留 rawText + type=note，不阻塞用户继续追记。

## 不做的事

- 不修改 IssueCard 本体（由上层根据 record 内容决定是否要调整 status）。
- 不推断新的 hypotheses（那是 debug-hypothesis 的活）。
