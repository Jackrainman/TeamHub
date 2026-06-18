# Skill Library(冷藏架)

> v0.3 时代落地、当前 pivot 后不在 active 触发面但保留追溯价值的 skill。**不被** `.agents/hooks/sync-skills.sh` 同步进 `.claude/skills/`,**不进** Claude Code / Codex / OpenCode 的默认触发判断。

## 与 `.agents/skills/` 的边界

| 维度 | `.agents/skills/` | `.agents/skill-library/`(本目录) |
|---|---|---|
| 角色 | 权威源 + active 触发面 | 冷藏保留 |
| 同步到 `.claude/skills/` | ✓(PostToolUse hook 自动) | ✗ |
| `verify:skills-sync` 检查 | ✓ | ✗ |
| Claude Code 触发判断 | ✓ | ✗ |
| 修改原则 | 当前 pivot 后路线允许的迭代 | 仅当确实要复活时 |

## 当前条目

5 个 v0.3 (HTTP+SQLite+IssueCard) 时代的 debug 工作流 skill,在 D-018 宣告"不再做 issue tracker"后退役:

- **debug-intake**:接收碎片化调试输入,生成结构化 IssueCard
- **debug-hypothesis**:基于 IssueCard + commit + 文件摘要给怀疑列表
- **debug-session-update**:把追加记录转化为 InvestigationRecord
- **debug-closeout**:经 HTTP + SQLite 主链路生成 ErrorEntry / ArchiveDocument 并读回验证
- **repo-onboard**:绑定本地仓库路径,采集首个 RepoSnapshot

这些 skill 依赖 v0.3 server / SQLite / IssueCard schema,与 pivot 后"纯本地 markdown + git native"路线不兼容。保留是因为:它们记录了一整套调试工作流的拆解思路,未来 Trail 或新一代 skill 设计时可作参考。

## 操作约定

- 从 `skills/` 退役 → `skill-library/`:用 `git mv` 保留历史;同步手动 `rm -rf .claude/skills/<name>`(`.claude/skills/` 在 sandbox deny 列表,清理时需 bypass)。
- 从 `skill-library/` 复活 → `skills/`:用 `git mv` 搬回 + 触发 hook 同步(随便 Edit 一下该目录下任意文件即可触发)。
- 修改 library 内 skill **不** 触发 hook 同步,也不会出现在 Claude 触发面;只是文档级保留。

## 不在 library 的退役方式

- 完全删除:用 `git rm -r`。
- 折叠成笔记:把 SKILL.md 内容并入 `docs/archive/` 下某个 review / 设计文档,然后删 skill 目录。
