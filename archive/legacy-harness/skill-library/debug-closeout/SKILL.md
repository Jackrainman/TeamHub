---
name: debug-closeout
description: 当用户结案时，经当前 HTTP + SQLite repository/server 主链路生成 ErrorEntry 与 ArchiveDocument，并完成 schema 与读回验证。
---

## when to use
- 用户点击“结案”。
- IssueCard 状态为 `resolved` 且未归档。
- 当前运行主链路是 `apps/desktop` HTTP adapter -> `apps/server` -> SQLite；文件写盘 / `.debug_workspace` 只保留为历史或兼容语境，不是当前结案运行路径。

## inputs
```json
{
  "issueCard": "IssueCard",
  "investigationRecords": ["InvestigationRecord"],
  "closeoutInput": "rootCause / resolution / prevention 等用户确认内容",
  "repositoryPath": "HTTP + SQLite repository/server path",
  "storageFeedback": "当前 storage / connection state"
}
```

## steps
1. 生成唯一 `errorCode`（`DBG-YYYYMMDD-NNN`）。
2. 生成归档文件名 `YYYY-MM-DD_<slug>.md`，作为 ArchiveDocument 元数据 / 展示字段，而不是直接写本地文件系统的授权。
3. 基于 IssueCard + InvestigationRecord 生成 `ErrorEntry` 与 `ArchiveDocument`。
4. 先做 schema 校验，失败则仅重生无效字段。
5. 通过当前 repository/server closeout path 写入 SQLite 主链路；不得绕过 HTTP adapter 直接写 `archiveDir`、`errorTableDir` 或 `.debug_workspace`。
6. 执行读回验证：issue archived 状态、ArchiveDocument、ErrorEntry、必填字段与 sourceIssueId / projectId 关联均可从 repository/server path 读回。
7. 任一验证失败时创建 repair task，不标记 archived；不得把文件写盘成功等同于当前主链路归档成功。

## output
```json
{
  "errorEntry": {
    "id": "string",
    "projectId": "string",
    "sourceIssueId": "string",
    "errorCode": "DBG-YYYYMMDD-NNN",
    "title": "string",
    "category": "string",
    "symptom": "string",
    "rootCause": "string",
    "resolution": "string",
    "prevention": "string",
    "relatedFiles": ["string"],
    "relatedCommits": ["string"],
    "archiveFilePath": "string",
    "createdAt": "ISO8601",
    "updatedAt": "ISO8601"
  },
  "archiveDocument": {
    "issueId": "string",
    "projectId": "string",
    "fileName": "YYYY-MM-DD_<slug>.md",
    "filePath": "string",
    "markdownContent": "string",
    "generatedBy": "ai|manual|hybrid",
    "generatedAt": "ISO8601"
  }
}
```

## rules
- 输出必须通过 `ErrorEntry` / `ArchiveDocument` schema 校验。
- 工具调用必须检查 exit code、HTTP/repository 返回状态和 SQLite 读回结果。
- 读回验证失败必须返回 repair task，不得伪造归档成功。
- 当前主链路必须以 HTTP + SQLite / repository-server path 为准；文件写盘只可作为历史归档、手工导出或未来明确接入后的附加路径。
- 不得让 AI 按旧 `archiveDir` / `errorTableDir` 目录直接写 archive/error table 并声称 closeout 已完成。
- 不自动推送远端，不自动提交归档文件，不删除原始输入。
