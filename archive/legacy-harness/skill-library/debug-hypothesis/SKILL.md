---
name: debug-hypothesis
description: 基于当前 IssueCard + 最近 commits + 关联文件摘要，给出"可能方向 + 依据 + 下一步验证动作"的怀疑列表。
trigger: 问题卡创建后、或用户追加重要线索后、或用户主动请求"再猜一次"。
---

## 目的

不是替用户拍板，而是给出一份**有依据的**怀疑方向列表，让硬件调试不再停留在"瞎猜"。

## 输入

```json
{
  "issueCard": "IssueCard",
  "recentRecords": ["InvestigationRecord"],
  "repoSnapshot": "RepoSnapshot",
  "linkedFileSummaries": [{ "path": "string", "summary": "string" }]
}
```

## 输出（必须符合 schema）

```json
{
  "hypotheses": [
    {
      "direction": "string",
      "rationale": "string",
      "evidence": ["string"],
      "suggestedVerification": "string",
      "priority": "high|medium|low"
    }
  ],
  "filesToInspect": ["string"],
  "commitsToReview": ["string"]
}
```

## Prompt 模板要点

- 每条 hypothesis 必须带 rationale + evidence，禁止空话。
- evidence 要能追溯到 recordId / commit hash / 文件路径。
- 如果没有足够信息，直接说"信息不足，建议补充 X"。

## 工具调用

无外部 MCP 依赖，输入由上游 skills 已经采集完成。

## 反馈闭环

- schema 校验失败 → 只重生 hypotheses 数组。
- 若 hypotheses 为空或全部缺 rationale → 视为失败，要求重生一次。
- 重试 ≤2 次，失败则返回"需要更多信息"提示，不自动注水。

## 不做的事

- 不写入 IssueCard；只返回建议。
- 不调用外部搜索。
- 不给出代码 patch。
