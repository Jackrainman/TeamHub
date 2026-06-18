---
name: repo-onboard
description: 绑定本地仓库路径并采集首个 RepoSnapshot，建立可用于后续调试闭环的 Project 上下文。
---

## when to use
- 用户首次添加仓库路径。
- 用户切换到未注册仓库。
- 用户要求刷新仓库快照。

## inputs
```json
{
  "repoPath": "string (绝对路径)",
  "suggestedArchiveDir": "string (可选，默认 repo/docs/debug)"
}
```

## steps
1. 校验路径存在且包含 `.git`。
2. 执行 `git rev-parse --abbrev-ref HEAD` 读取分支。
3. 执行 `git rev-parse HEAD` 和 `git log -1 --pretty=%B` 读取 HEAD 信息。
4. 执行 `git status --porcelain` 判断工作区是否有未提交改动。
5. 执行 `git log -n 10 --pretty=format:%H|%an|%s|%cI` 读取最近提交。
6. 组装 `Project` 与 `RepoSnapshot` 结构化结果。

## output
```json
{
  "project": {
    "id": "string",
    "name": "string",
    "repoPath": "string",
    "repoName": "string",
    "defaultArchiveDir": "string",
    "git": {
      "currentBranch": "string",
      "lastCommitHash": "string",
      "hasUncommittedChanges": "boolean",
      "lastScannedAt": "ISO8601"
    },
    "createdAt": "ISO8601",
    "updatedAt": "ISO8601"
  },
  "repoSnapshot": {
    "branch": "string",
    "headCommitHash": "string",
    "headCommitMessage": "string",
    "hasUncommittedChanges": "boolean",
    "changedFiles": [{ "path": "string", "status": "added|modified|deleted|renamed|untracked" }],
    "recentCommits": [{ "hash": "string", "author": "string", "message": "string", "timestamp": "ISO8601" }],
    "capturedAt": "ISO8601"
  }
}
```

## rules
- Git 命令必须检查 exit code，失败立即返回错误。
- 输出必须通过 schema 校验，失败时仅重生无效字段。
- 不是 Git 仓库时返回 `NOT_A_GIT_REPO`，不得静默降级。
- 不做全仓扫描、embedding 索引和深度历史分析。
