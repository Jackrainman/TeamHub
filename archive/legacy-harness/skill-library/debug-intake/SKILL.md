---
name: debug-intake
description: 接收碎片化调试输入并生成结构化 IssueCard，挂载仓库快照与历史关联线索。
---

## when to use
- 用户从快闪窗口提交碎片描述。
- 用户把草稿问题升级为正式问题卡。

## inputs
```json
{
  "projectId": "string",
  "rawInput": "string",
  "tags": ["string"],
  "repoSnapshot": "RepoSnapshot (来自 repo-onboard 输出)",
  "historicalIssueSummaries": [
    { "issueId": "string", "title": "string", "rootCause": "string" }
  ]
}
```

## steps
1. 保留 `rawInput` 原文，不得覆盖。
2. 基于 `repoSnapshot` 与历史摘要生成标题、问题摘要、怀疑方向与建议动作。
3. 填充关联文件、关联提交、关联历史问题 ID。
4. 输出 `IssueCard` 并执行 schema 校验。
5. 校验失败时仅重生无效字段，最多重试 2 次。

## output
```json
{
  "issueCard": {
    "id": "string",
    "projectId": "string",
    "title": "string",
    "rawInput": "string",
    "normalizedSummary": "string",
    "symptomSummary": "string",
    "suspectedDirections": ["string"],
    "suggestedActions": ["string"],
    "status": "open",
    "severity": "low|medium|high|critical",
    "tags": ["string"],
    "repoSnapshot": "RepoSnapshot",
    "relatedFiles": ["string"],
    "relatedCommits": ["string"],
    "relatedHistoricalIssueIds": ["string"],
    "createdAt": "ISO8601",
    "updatedAt": "ISO8601"
  }
}
```

## rules
- 输出必须符合 `IssueCard` schema。
- `suspectedDirections` 每条都要可追踪依据，禁止空话。
- 连续失败后降级为 `needs_manual_review`，但必须保留用户原始输入。
- 不调用外部知识库，不自动执行排查动作。
