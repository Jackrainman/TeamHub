---
name: personal-daily-summary
description: 用户说"今天干了啥"/"出个日报"/"出个周报"时，结合 git 提交历史 + .debug-archive 命中 + 用户口述补充，生成单人视角的日报或周报 markdown，可选归档到 docs/daily/ 或 docs/weekly/。**不读** 他人 commit、**不做** 团队产能比较、**不发** 外部消息。
trigger: 用户希望立刻拿到一份"被老师/学长问'你这周干了啥'时能直接答上来"的个人日报或周报，且只关心自己。
---

## 目的

解决"被老师 / 学长 / 队长问'你这周做了啥'时答不上来"——不是因为没干事，是因为干的事**散落在 git history、debug 笔记、车上调试、口头讨论**里，没人把它织成一段能讲的话。

把这些散落证据 + 一段口述补充，织成**单人视角**的可读 markdown：做了什么、卡在哪、明天/下周打算干啥、学到啥。

不替代用户判断，不发外部消息（钉钉 / 微信 / 邮件），不读别人的提交，不做产能打分。**只是把"你今天/这周干的事"在你面前拼一份一眼能看懂的清单。**

## 触发示例

- "今天干了啥总结一下"
- "出个日报"
- "本周做了啥写个周报"
- "周五要跟老师汇报，先出个周报"
- "把这周的 commit 织一下"

## 输入

- **必填**：用户自然语言陈述（一段话或多段问答；不强制结构）
- **可选**：明确的时间范围（"今天" / "本周" / "5 月 1 号到现在" / "上一次提交以来"）
- **自动汇总**（不需要用户输入，由 skill 取）：
  - `git config user.name` / `user.email` → 仅用本人作者过滤
  - `git log --author="<本人>" --since=<起点>` → 时间窗内**本人**的提交
  - `.debug-archive/` 时间窗内的命中文件
  - `docs/dogfood/` 时间窗内的命中文件
- **不需要**：IssueCard、ProbeFlash workspace、远端 API、他人的提交记录

## 模式

| 模式 | 触发关键词 | 默认时间窗 | 输出路径 |
|------|------------|------------|----------|
| 日报 | "今天" / "日报" | 当天 0:00 至现在 | `docs/daily/<author-slug>/YYYY-MM-DD.md` |
| 周报 | "本周" / "周报" / "这一周" | ISO 周一 0:00 至现在 | `docs/weekly/<author-slug>/YYYY-Www.md` |
| 自定 | 用户给明确日期 | 用户指定 | 询问归档路径 |

`<author-slug>` = `git config user.name` 经 ASCII / 小写 / 连字符化（中文名→拼音或保留中文均可，保持稳定即可）。**单人项目也按此结构**，避免将来加人时的破坏性升级。

## 输出（必须是 markdown，按下面模板）

```markdown
# <日报|周报>：<author> @ YYYY-MM-DD（或 YYYY-Www）

**时间窗**：<起点 → 终点，明示>
**仓库**：<repo 名 / 分支>
**生成时间**：<YYYY-MM-DD HH:MM>

## 做了什么

- **<事项一句话>**
  - 证据：<commit sha7 / 文件路径 / debug-archive 文件名 / 用户口述>
- **<事项二>**
  - 证据：...

(按重要性 or 时间序，3-8 条)

## 卡在哪 / 没做完

- <一句话> — <原因 / 等什么>

(0-N 条；没卡就不写这一节，不强凑)

## 明天 / 下周打算

- <一句话>
- <一句话>

(2-5 条；用户没说就追问一下)

## TIL（学到了什么）

- <一句话>

(0-3 条；可空)
```

## 协议（执行步骤）

1. **判断模式**。从触发语判断日报 / 周报 / 自定，不确定就问一句"日报还是周报，时间窗到哪？"——**不超过 1 个澄清问题**。
2. **自动汇总证据**（≤ 5 步）：
   - `git config user.name` 和 `user.email` 取作者
   - `git log --author="<author>" --since=<start> --until=<end> --pretty=format:"%h %s" --no-merges` 取本人提交
   - `find .debug-archive -newer <start>` 或 `ls -la .debug-archive/ | awk '$6$7$8 >= start'` 取同期归档（命中文件名即可，不全文读）
   - `find docs/dogfood -newer <start>` 同上
   - 必要时读 1-2 个最相关的归档/dogfood 文件头部（≤ 30 行），**不全文阅读**
3. **拼第一版**：用 git 证据 + 归档命中先填"做了什么"，每条带证据。**不编**没有证据的事。
4. **追问用户口述**：把第一版打出来后问："**git 看不到但你今天/这周干了啥？**（线下调试、跟队友讨论、读了什么、等谁回消息……）" — 一次性把缺口讲完。
5. **二版整合**：把口述项加进"做了什么"，证据栏写"用户口述"。
6. **追问明天/下周**："明天 / 下周打算干啥？" — 同样一次性。
7. **生成最终 markdown**，按模板。
8. **询问是否归档**：
   - **若用户答 yes**：写入 `docs/daily/<author-slug>/YYYY-MM-DD.md`（日报）或 `docs/weekly/<author-slug>/YYYY-Www.md`（周报）；目录不存在就创建；写入后回显路径。
   - **同一文件已存在**：默认追加在末尾用 `## 追加 HH:MM` 分节；不覆盖。
   - **若用户答 no 或没回应**：不写盘，结束。

## 存档文件 schema

```markdown
---
date: YYYY-MM-DD
mode: daily|weekly|custom
author: <git config user.name>
window:
  start: YYYY-MM-DD HH:MM
  end: YYYY-MM-DD HH:MM
commits: ["<sha7>", ...]
debugArchives: ["<filename>", ...]
---

<生成的日报/周报正文（# 起以下全部）>

## 追加 HH:MM（同日多次时）

<追加正文>
```

## Prompt 模板要点（用于 AI 实现侧）

生成日报/周报时强制遵守：

- **每条"做了什么"必须带证据**——commit sha7 / 文件路径 / debug-archive 文件名 / 明示"用户口述"。**禁止编无证据的事项**。
- **不写形容词式空话**——"努力推进了 X"、"持续优化 Y" 这种全删，要么写成"改了 X 模块的 Y bug（commit abc1234）"，要么不写。
- **量化要克制**——可以写"修了 3 个 bug"，**不可以**写"完成度 85%" / "效率提升" / "产出 N 行代码"，违反 D-019。
- **单人视角**——只用本人的 commit，**不读** 其他作者的 git history；用户提到队友只在"卡在哪"或"做了什么"里以"等 X 回消息"形式出现，**不评价队友**。
- **追问要打包**——口述补充和明天计划各**只问一次**，不要来回追问把用户问烦。
- **时间窗对齐 ISO**——周报用 ISO week（周一为周首），不用周日为首。
- **未识别项目类型**——按通用代码项目处理，不强行装专业。
- **信息严重不足**——例如时间窗内 0 commit 也无 archive 命中也无口述，就坦诚说"这段时间内没找到任何证据，要么时间窗错了，要么没干 / 都在线下"，**不注水**。

## 工具调用

可用 Claude Code 内置工具：

- `Bash`：`git config` / `git log --author=<self>` / `find` / `ls`（**禁止** push / commit / reset / checkout）
- `Glob` / `Grep`：在 `.debug-archive/` 和 `docs/dogfood/` 内命中
- `Read`：读相关归档/dogfood 文件头部（≤ 2 个文件，每个 ≤ 30 行）
- `Write`：仅在用户同意归档后写入 `docs/daily/...` 或 `docs/weekly/...`

**不调用**：远端 API；任何写入仓库代码 / commit / push；任何外部消息平台（钉钉 / 微信 / 邮件 / Slack）。

## 反馈闭环

- 用户回报"这日报里我没干这件事" → skill 误判证据，下一轮 prompt 应更保守地引用 commit message。
- 用户回报"这日报漏了我做的 X" → 引导用户把 X 写进 dogfood 或下一次口述补充时讲清楚；skill 看不到线下事是设计取舍，不是 bug。
- `docs/daily/` 和 `docs/weekly/` 是 Trail facet（足迹档案）的输入资产，未来 TRAIL-04-WEEKLY-SUMMARY 会聚合这些文件做"某人某段时间在干啥"的视图。

## 不做的事

- **不读** 他人的 git commit；只用 `git log --author="<本人>"`。
- **不发** 任何外部消息（钉钉 / 微信 / 邮件 / Slack / Discord）。
- **不调** 远端 AI provider（除用户主动配置 + 本会话明确允许）。
- **不读** 任何 `.env` / `*.key` / `*secret*` / `*api-key*` 文件；命中即跳过并明示。
- **不打分**、不算"完成率"、不算"效率"、不做产能比较。**违反 D-019**。
- **不评价** 队友、不写"X 没回我消息所以阻塞"这种把锅甩给具体人的话；可以写"等 X 模块的 review"。
- **不写** 用户代码、不发 commit、不 push。
- **不假装** 替用户记忆——线下做的事 skill 看不到，必须靠用户口述。
- **不替代** 真实的口头汇报——日报是给用户自己梳理 + 偶尔贴给老师/学长用，不是绩效报表。
- **不在** 已存档文件上自动覆盖；同日多次走"追加"。

## 与其他 skill / facet 的关系

- 本 skill 是 D-018 pivot 后"个人 Trail"的**主动产出入口**——回答"你这周干了啥"。
- `debug-checklist`（已落地）的 `.debug-archive/*.md` 是本 skill 的**证据来源**之一。
- `docs/dogfood/*.md`（SKILL-02）也是本 skill 的**证据来源**之一。
- 未来 TRAIL-04-WEEKLY-SUMMARY 会**读取** `docs/daily/` 和 `docs/weekly/` 做更长时间窗的聚合（月度 / 赛季 / 年度）。本 skill 是上游写入者。
- 未来 BRIDGE-04-WORKLOAD-VISIBILITY 是**团队视图**（看任务阻塞而非比人），与本 skill（**单人视图**）正交，互不读取。

## DoD（本 skill 自身的完成定义）

- SKILL.md 含：触发示例、输入、模式、输出 markdown 模板、协议、存档 schema、prompt 模板要点、工具调用、反馈闭环、不做的事、与其他 skill 的关系。
- hook 自动同步到 `.claude/skills/personal-daily-summary/SKILL.md`。
- `bash .agents/skills/install.sh` 重链通过。
- `git diff --check` 干净。
- 备赛期跑通**至少一次真实日报**且自己看了觉得"这能贴出去当汇报"，再考虑迭代 prompt。
