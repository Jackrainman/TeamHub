---
name: debug-checklist
description: 给一句调试症状描述（"自动跑点又歪了""串口又乱码"），结合当前仓库上下文（recent commits / 项目类型 / 相关文件），生成 5-8 条带依据和验证动作的检查清单；可选写入 .debug-archive/。**不依赖** ProbeFlash server / SQLite / IssueCard 任何前置条件。
trigger: 用户描述一个具体的调试症状或现场异常，并希望立刻拿到一份"老学长在场会怎么排查"的可执行检查清单。
---

## 目的

把"老学长在场会怎么排查"的隐式经验，用 AI + 当前代码上下文显式化为一份**5-8 条、带依据、带验证动作**的检查清单。让小作坊（机器人战队、嵌入式个人开发者）在没有老学长当面带的情况下，也能拿到第一份高密度的排查方向，而不是从"完全不知道从哪查"开始。

不替代用户判断，不调用真实硬件，不写代码 patch。**只是把"该检查什么"列清楚，让用户在车上 / 板子前也能照着走一遍。**

## 触发示例

- "自动跑点又歪了"
- "CAN 总线偶发丢帧"
- "串口刚才还正常，现在又乱码"
- "电机一通电就抖一下"
- "视觉识别又飘了"
- "这版固件烧上去后，板子直接重启循环"

## 输入

- **必填**：一句到一段的症状描述（自然语言、口语化都行；不强制结构化）
- **可选**：用户指明的关键模块名（如"导航融合""底盘控制""视觉前端"）
- **不需要**：IssueCard、InvestigationRecord、ProbeFlash workspace、任何 ProbeFlash 数据

## 输出（必须是 markdown，按下面模板）

```markdown
# 检查清单：<症状一句话>

**症状**：<原始描述，必要时整理但不延伸>
**仓库上下文**：<项目类型 / 最近 N 次相关 commit / 命中的文件，一行内>
**生成时间**：<YYYY-MM-DD HH:MM>

## 检查项

1. **<检查项标题>** [优先级：高 / 中 / 低]
   - **依据**：<为什么怀疑这里。可引用 commit hash / 文件路径 / 已知失败模式>
   - **验证动作**：<具体怎么查：一条命令、一个观察点、或一段代码位置>

2. **<...>** [优先级：...]
   - **依据**：...
   - **验证动作**：...

(共 5-8 条，按优先级降序)

## 看完仍未定位时

- 建议补充的现象 / 日志 / 数据：<≤ 3 项>
- 建议查看的相关文件：<≤ 3 项>
- 如果想升级为更深入的排查：考虑 escalate 给老学长或开 hypothesis 流程
```

## 协议（执行步骤）

1. **理解症状**。如果信息严重不足（例如只有"它坏了"没有任何具体现象），先反问 1-2 个最关键的事实问题（**不超过 2 个**），再生成 checklist；不要直接编。
2. **调研当前仓库**（≤ 6 步，按需停）：
   - `git log --oneline -20` 看最近改动方向
   - `git status --short` 看当前未提交改动
   - 识别项目类型（ROS `package.xml` / `CMakeLists.txt` / Cargo.toml / `platformio.ini` / `package.json` / Arduino `.ino` 等）
   - 用 Glob/Grep 命中症状关键词关联的文件（如 "odom"、"serial"、"motor"、"can"、"imu"）
   - 必要时读 1-2 个最相关的文件头部，**但不全文阅读**
3. **综合输出 5-8 条检查项**，按优先级降序。
4. **每条检查项必须带依据 + 验证动作**，不允许空话；依据要能追溯到具体 commit / 文件路径 / 已知失败模式名。
5. **询问是否存档**：输出 checklist 后，主动问用户："要把这次记到 `.debug-archive/` 吗？"
   - **若用户答 yes**：写入 `.debug-archive/YYYY-MM-DD-HHMM-<slug>.md`（slug 从症状关键词派生，max 40 字符，全小写连字符）；目录不存在就创建；写入后回显路径。
   - **若用户答 no 或没回应**：不写盘，结束。

## 存档文件 schema

```markdown
---
date: YYYY-MM-DD HH:MM
symptom: <一句话症状原文>
project: <识别到的项目类型，未识别填 "unknown">
relatedCommits: ["<sha7>", ...]
relatedFiles: ["<path>", ...]
status: open
---

<生成的检查清单原样保存（# 检查清单 起以下全部）>

## 实际查到的（用户事后追加，可选）

- <user fills>
```

后续 status 字段可由用户手动改为 `resolved` / `abandoned`；本 skill 不主动修改已存档文件。

## Prompt 模板要点（用于 AI 实现侧）

生成 checklist 时强制遵守：

- **每条 hypothesis 必须带依据 + 验证动作**——禁止空话（"检查一下硬件连接"这种不算）。
- **依据可追溯**——commit hash 给短 sha7、文件路径用相对路径、已知模式给名字（"波特率不匹配""DMA 半传输中断丢失""tf 时间戳不对齐"等）。
- **验证动作可执行**——一条 shell 命令、一个观察点（"在示波器看 CH1 上升沿"）、或一段代码位置（"`src/can/driver.c:42` 附近的初始化顺序"）。
- **优先级真实**——高 = "我赌它就是这个"；中 = "值得查"；低 = "排除一下不亏"。不允许全标高。
- **5-8 条上限**——超出说明做得太散，要求重生一次更聚焦的版本。
- **互斥假设可分组**——单一症状描述对应多个互斥方向时（"硬件 vs 软件"），允许产出 ≤ 2 个并列方向，每方向各 3-4 条；不强行合一份。
- **未识别项目类型**——明示"未识别项目类型，按通用嵌入式调试给建议"，不强行装专业。
- **信息不足时**——直接说"信息不足，建议补充 X"，不注水编 checklist。

## 工具调用

可用 Claude Code 内置工具：

- `Bash`：`git log` / `git status` / `git diff --stat`（**禁止** push / commit / reset）
- `Glob` / `Grep`：命中关键词文件
- `Read`：读相关文件头部（≤ 2 个文件，每个 ≤ 100 行）
- `Write`：仅在用户同意存档后写入 `.debug-archive/<file>.md`

**不调用**：远端 API（除非用户已配置 ProbeFlash AI provider 且本会话明确允许）；任何写入仓库代码 / commit / push。

## 反馈闭环

- 输出 < 5 条 → 信息可能不足，应建议用户补充现象，不强凑。
- 用户回报"全试了都不是" → 从 `.debug-archive/` 找历史同症状记录，用作下一轮 hypothesis 的输入；找不到就坦诚说"建议 escalate 给老学长或重新描述现象"。
- 存档文件后续可被人工或下游 skill（Trail / Bridge）读取，是 `.debug-archive/` 数据资产的源头。

## 不做的事

- **不依赖** ProbeFlash server / SQLite / IssueCard / InvestigationRecord 任何前置条件。
- **不写** server 端代码、不调远端 API（除用户主动配置 + 本会话明确允许的 AI provider）。
- **不读** 任何 `.env` / `*.key` / `*secret*` / `*api-key*` 文件；命中即跳过并明示。
- **不替代** 真实硬件验证 / 真实示波器观察 / 真实多板复现；**不替代** 老学长的真实经验。
- **不写** 用户代码、不发 commit、不 push。
- **不假装** 确定根因——优先级高也只是"建议优先看"，不是"就是这个"。
- **不在** 已存档文件上自动改 status；status 由用户手动维护。
- **不 escalate** 到 ProbeFlash v0.3 网页 / IssueCard 流程——v0.3 已冻结，本 skill 是 pivot 后的独立入口。

## 与 pre-pivot skill 的关系

- 本 skill 是 D-018 pivot 后新形态的"当下"facet 入口，**取代** `debug-intake` + `debug-hypothesis` 在 ProbeFlash 流程里需要先建 IssueCard 才能猜的链条。
- `debug-intake` / `debug-hypothesis` / `debug-session-update` / `debug-closeout` 等 pre-pivot skills 仍保留为 v0.3 历史功能；新调试场景**默认走 `debug-checklist`**，不再走 IssueCard 流程。
- `.debug-archive/*.md` 是本 skill 的输出资产，未来 Trail facet（足迹档案）会读取这些文件做"年鉴"视图。

## DoD（本 skill 自身的完成定义）

- SKILL.md 含：触发示例、输入、输出 markdown 模板、协议、存档 schema、prompt 模板要点、工具调用、反馈闭环、不做的事、与 pre-pivot 关系。
- hook 自动同步到 `.claude/skills/debug-checklist/SKILL.md`。
- `bash .agents/skills/install.sh` 重链通过。
- `git diff --check` 干净。
