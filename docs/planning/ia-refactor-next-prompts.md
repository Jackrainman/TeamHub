# IA 重构后续 + 表单一致性 —— 下次自动跑的 prompt（本轮只写，不跑）

> 2026-06-20 用户拍板：阶段 1（机器人队页，D-075）已落地，但「左侧还是一大堆」——视觉 declutter 在 Phase 2-4。
> 本文是**待跑 prompt 仓库**：下次（自动/手动）直接取下面整段喂给 workflow 作者，按 `~/.claude/CLAUDE.md` 的 workflow 纪律落地。
> 全程铁律：**组合不重写**（仿 D-075 FleetPage：渲染既有页、零改大文件 / 不碰 RelayCanvas node.measured 修复）；**I0 反监视**（永不渲染 memberId/invitedMemberIds/出勤）；**单开 branch**、本机三包 verify:all 全绿 + **WSL2 真机 Playwright 视觉验**（单测全绿 ≠ 真机能看，截图入 docs/screenshots/）；**契约/端点尽量零改**。

---

## PROMPT 1 — IA 重构 Phase 2+3+4 收尾（把左侧真正变干净）

> 推荐一轮做完三阶段（都是前端、叠加成完整视觉效果），分 3 个独立 commit、各自真机验，随时可停。终态侧栏 = 主操作区(项目/知识/库存/机器人队) + 洞察区(总览/缺人方向，可折叠) + 设置 + 工作台落地页。上游设计见 `docs/design/sched-date-relay-robot-redesign.md` §B、`docs/planning/decisions.md` D-075。

**任务**：完成 TeamHub console 信息架构重构的 Phase 2/3/4，把当前 9 个平铺侧栏页按数据域收成分组导航。沿用 D-075 的「组合不重写」模式（新建容器页渲染既有 feature 页，零改既有大组件）。

- **Phase 2 「项目」页**（`features/project/ProjectPage.tsx` 新建，组合）：合并 `项目看板(pm)` + `依赖图(dep-graph)`，顶部视图切换（看板 ⇄ 依赖图）；`缺人方向(gaps)` 降为该页一个「洞察」Tab。单一录入入口（复用同一个 `PmCreatePanel`，去掉依赖图页的重复建边/建任务入口）、单一改状态入口（两视图都能改）。`App.tsx` 现有的 `focusTaskId`（看板→依赖图跳转选中）改为页内 Tab 切换 + 选中，去掉跨页 plumbing。导航 9→7（删 pm/dep-graph/gaps 三项 → 加 project 一项）。
- **Phase 3 「知识」页**（`features/knowledge/KnowledgePage.tsx` 新建，组合）：合并 `知识库检索(kb)` + `图纸档案(archive)` 多 Tab。KB 检索结果里的 `archiveFileName`/归档指针做成可点链 → 跳「图纸档案」Tab 并定位。导航 7→6（删 kb/archive → 加 knowledge）。**与 PROMPT 2 配套**：archive 表单这轮会被搬动，顺手把它的「赛季/适配机器人」控件与机器人队 create 表单对齐（先按 PROMPT 2 定的语义）。
- **Phase 4 导航分组 + 工作台落地页**：`ConsoleLayout` 侧栏从平铺改**分组**（`navGroups`：主操作区=项目/知识/库存/机器人队 ｜ 洞察区=总览/缺人方向，可折叠 ｜ 设置）。默认落地页从「总览(运维指标)」改「**工作台**」=可操作概览 + 置顶「被卡项 CTA」（读现有 dep-graph 阻塞归因派生，点 CTA 跳项目页对应任务）。`ConsolePage` 联合 + `App.tsx` 三元 + `TITLE_KEY` 同步收口；i18n nav.* 重整 + 删孤儿键（双侧成对）。

**约束 / 验收**：
- 组合不重写：`PmBoardPage`/`DepGraphPage`/`GapsPage`/`KbSearchPage`/`ArchivePage` 尽量原样复用；只在外层加 Tab/视图切换容器 + 必要的 query-key 协调（跨区即时刷新仿 D-075 prefix 失效）。
- @xyflow 两块画布（依赖图 vs 接力）注意容器定高（仿 D-075 `clamp` 修，防嵌入后 visibility:hidden/塌高）。
- I0：项目页/缺人 Tab 仍只到组、不下钻到人。
- 本机三包 `verify:all` 全绿（typecheck 兜 union 收口 + i18n 双侧 key 平衡）；WSL2 4177 真机 Playwright：侧栏分组渲染、各合并页 Tab 切换、依赖图/接力画布首屏无空白、工作台 CTA 可跳转、`grep memberId` 净。截图入 `docs/screenshots/wsl-ia-phase2-4-*`。
- 单开 branch（如 `ia-phase2-4`）、3 独立 commit、push、decisions.md 开新 D-0xx、now.md frontier 更新。

**workflow 纪律**（CLAUDE.md）：探查/抽取用 haiku/sonnet finder（≤6），合并页架构设计 + 对抗式风险审查用 opus；`pipeline()` 优先；schema 字段最小；真机验前先本机 verify。

---

## PROMPT 2 — 表单一致性：赛季 / 机器人维度统一（先定语义再统控件）

> 用户 2026-06-20 发现：图纸提交(ArchivePage) 与 机器人队(ResourcesPage CreateResourceForm) 对「赛季」「机器人」建模/呈现不一致。**先想清语义，再统一**——不能无脑 merge。

**现状（已核实）**：
| 维度 | ArchivePage（图纸提交） | CreateResourceForm（机器人队） |
|---|---|---|
| 赛季 | `<select>` 下拉，`seasonOptions(now)` ±2 年自动猜 | `<input>` 自由文本，默认 "26" |
| 机器人 | 「适配机器人」`seg`：`R1 / R2 / universal(通用)`（`robotCode`） | 「编号位」`<select>`：`R1 / R2 / shared(共享)`（`robotTarget`） |

**语义差异（关键，别直接 merge）**：
- `archive.robotCode` = 「**这张图纸/驱动适配哪台车**」，`universal/通用` = 三台都适用。
- `fleet.robotTarget` = 「**这台实体机器人占哪个编号位**」，`shared/共享` = 不固定 R1/R2 的共享资源。
- 二者第三项语义不同，**不能合成同一枚举**。

**任务（先决策后实现）**：
1. **决策**：①「赛季」统一成哪种控件？建议都用**下拉**（`seasonOptions(now)` ±2 年自动猜，与 archive 对齐；机器人队 create 现是自由文本，易打错）——但需确认机器人队是否需要录入更早赛季的历史车（若需要，下拉范围要够或留「其它」手填）。② 机器人维度：保留两套**语义**（robotCode vs robotTarget 各自存在），但**统一控件风格 + 标签措辞规范**（如都用 seg 或都用 select、第三项中文统一为「通用」/「共享」各自语义清晰）。③ 是否抽一个共享的 `<SeasonSelect>` / `<RobotSlotSelect>` 组件复用两处。
2. **实现**：按决策对齐两表单的控件与文案；若抽共享组件则两处替换。i18n 文案规范化（赛季/适配机器人/编号位/通用/共享 各处用词统一且语义不混）。
3. **配套**：与 PROMPT 1 Phase 3 配套做最省（archive 表单那时正好被搬进知识页），但也可独立小 PR。

**约束 / 验收**：契约/枚举值（`robotCode`=R1/R2/universal、`robotTarget`=R1/R2/shared）**不动**（仅 UI 控件/文案层对齐，避免数据迁移）；本机 console verify:all 全绿；WSL 真机截图两表单对齐后形态。I0 不涉。单独 commit 或并入 Phase 3。

**workflow 纪律**：决策①②③ 用 opus（语义判断）；机械替换/文案规范用 sonnet；finder 不需要（范围就两文件 + i18n）。
