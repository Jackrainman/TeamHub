# Superpowers Specs

本目录存放 superpowers 工作流相关的设计稿(spec)。Spec 是"做什么 + 为什么 + 边界"的论证文档,**不是**任务清单;任务清单(checkbox plan)在 `../plans/`。

## Status 词汇表

每份 spec **必须**在 YAML frontmatter 顶部声明 `status:`,取值如下:

| status | 含义 | AI 行为 |
|---|---|---|
| `draft` | 写中,未通过用户 review;可能被推翻 / 大改 | 仅可参考语义,**不**据此立任务、**不**据此修改 active 文档 |
| `forward-looking` | 已通过 review,但激活条件未满足(等依赖 / 等阶段 / 等数据) | **不**构成当前工作流约束;读了不影响 active 行为 |
| `active` | 当前在用,影响实际工作流 | 是事实源;但权威性低于 AGENTS.md / now.md / backlog.md / decisions.md |
| `archived` | 描述的改动已实施落地,或已被新 spec 取代 | 仅追溯用;不据此立任务、不据此修改 active 文档 |

`status: forward-looking` 的文档还应包含 `activated_by:`(激活条件)与可选的 `note:`(给 fresh agent 的不要立任务提醒)。

`status: archived` 应包含 `closed_at:`(关闭日期)与可选的 `replaced_by:` / `landed_in:`(指向取代它的文档或落地的 commit)。

## Frontmatter 风格

**标准**:文件首行 `---`,YAML block,再次 `---` 结束。例:

```
---
status: draft
date: 2026-05-17
scope: skill + planning docs only
---

# 标题
```

**legacy 风格**:正文内嵌一个 yaml code block 作为元数据(如 `2026-05-18-bridge-roster-design.md`)。新 spec **不再**使用此风格;legacy spec 重写时统一为标准 frontmatter。

## 当前条目

| 文件 | status | 备注 |
|---|---|---|
| `2026-05-17-ai-scaffolding-design.md` | `archived` | M1/M2/M3 已落地于 `4c09ba1`;C1 已落地于 `12e747e` |
| `2026-05-18-bridge-roster-design.md` | `forward-looking` | 依赖 LARK-02 完成 + LARK-03 最小集成跑通后激活 |
| `2026-05-21-lark-cli-integration-design.md` | `draft` | lark-cli 接入 + lark-gateway 三包拆分；待用户复核后转 writing-plans |
