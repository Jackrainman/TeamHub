# 设计文档：排班日期选择器 + 接力增删 + 车→机器人 + IA 重构说明

> 日期 2026-06-20 ｜ 状态：**待用户批准后执行**（本轮只出设计，不动代码）
> 来源：用户 06-20 验收意见 + 两个只读 workflow 扫描（`car-to-robot-scan` / 早前 IA 审查）
> 适用：`apps/hub-console`（前端）、`apps/hub-contracts`（契约）、`apps/hub-server`（服务）

本轮做 **A1/A2/A3 三件事**（独立可交付、互不阻塞）；**B（IA 重构）只讲清是什么、怎么分阶段做，本轮不执行**（用户已选「这次先不做 IA 重构」）。每件事都按既有纪律推进：4 层 workflow（contracts→server→前端→对抗审查）+ 我独立复验 + **SSH 到 WSL 真机 Playwright 截图**（R1 首屏空白 bug 的教训：单测全绿 ≠ 真机能看，前端改动必须真机验）。反监视红线全程守：只「机器人/组/任务」维度，无 memberId/出勤。

---

## A1 · 在场排班日期选择器（真实日期，今天/明天/后天 + 查找特定日期）

### 现状
`SchedulePage.tsx:64-88` 是一个自由文本输入框（`windowLabel` 默认 `'今晚'`）+ `→` 按钮 + 当前值 span。用户要全改成按**真实日期**切换。

### 用户拍板的设计
- **数据模型**：`windowLabel` = 真实日期、**一天一计划**。只要「今天/明天/后天」三段（**砍掉昨天/前天**，排班向前看）。
- **左侧**：三个圆角矩形分段按钮「今天 / 明天 / 后天」，框在一个圆角矩形容器里（segmented control）。每段显示相对名 + 日期（如「今天 6·20」）。默认选「今天」。
- **最右侧**：一个下拉/日期选择器，**改名「查找特定日期计划」**，可选任意日期。
- **高亮规则**：当前 `windowLabel` 命中三天之一 → 该段高亮；**若选的日期不在这三天 → 三段全部不高亮**（只下拉显示当前日期）。

### 技术方案
- `windowLabel` 取 **`YYYY-MM-DD`**（如 `2026-06-20`）作为后端存储/匹配值；UI 上显示「今天 6·20」。
- 前端用 `new Date()` 算今天/明天/后天三个日期（浏览器侧，App 代码可用 `Date`，不受 workflow 脚本那条限制约束）。
- **后端零改动**：`ResourceSession.windowLabel` 已是 `z.string().min(1)` 自由文本，日期串天然适配；`derivePresenceSchedule`/`deriveRelayBoard` 仍按字符串精确匹配。
- **种子/测试**：fixtures 与 contracts 测试继续用 `'今晚'`（仍是合法 windowLabel，测试不破）；真实使用走日期串。**演示数据需对「今天」这个动态日期 POST 一条占用**（见 A2，二者天然配套：选某天 → +加一棒 → 该天 windowLabel）。
- **文案**：`schedule.intro`/`empty.body`/`relay.*` 里写死的「今晚」改成中性（如「这天哪个组要到/不加班」「今天还没排机器人」），与 A3 一起改。
- 新增/调整 i18n：`schedule.date.today/tomorrow/dayAfter`、`schedule.date.findSpecific`（「查找特定日期计划」）；废弃旧的 `schedule.windowLabel/windowPlaceholder`（文本框移除）。

### 影响面 / 工作量
前端为主（SchedulePage 选择器重写 + 一个日期工具 + i18n + 样式 segmented control），后端 0，契约 0。**小**（约半天）。

### workflow（A1）
单 phase 前端：`agent(前端: 日期分段选择器 + 下拉 + windowLabel=日期 + i18n + 样式, opus)` → `agent(verify: console typecheck+build+test, opus)` → 真机截图确认三段切换 + 不匹配不高亮。

---

## A2 · 接力画布「加/删一棒」（拖拽已修复）

### 现状
`RelayCanvas.tsx` 已支持：拖拽排先后（本会话修了首屏 `visibility:hidden` bug，现可用）、ETA 内联编辑、拉接力交接线、删交接线。**缺口**：没有「新增一棒」和「删除一棒」的 UI——之前演示靠 curl POST。IA 审查也点名：`POST /api/resource-sessions` 有后端、无前端入口。

### 设计
- **加一棒**：画布顶部「**+ 加一棒**」按钮 → 浮层表单：选**机器人**（`getResources` 里 boardable 的）+ 选**任务**（`getTasks`，任务自带 groupId/组名）→ 提交。`holderGroupId` 由任务派生、`orderInWindow` = 该机器人当前最大棒次 +1、`windowLabel` = 当前选中日期（A1）、`confirmedBy` = console。
- **删一棒**：每张接力卡上「删除」按钮 → `DELETE /api/resource-sessions/:id` → refetch。删一棒时**级联删除引用它的接力交接线**（避免悬空边）。

### 影响面 / 工作量
- **契约**：复用既有 `CreateResourceSessionRequestSchema`；新增 `DeleteResourceSessionResponse`（或复用通用 deleted 响应）。
- **服务**：`POST /api/resource-sessions` **已存在**；**新增** `DELETE /api/resource-sessions/:id`（store.deleteResourceSession + 级联删 relayHandoffs；镜像 deleteRelayHandoff 的不落盘内存语义）。
- **前端**：`client.createResourceSession` + `client.deleteResourceSession` + `client.getTasks`（若未有）；RelayCanvas 加「+加一棒」浮层 + 每卡删除按钮。
- 反监视：表单不收 `invitedMemberIds`（或留空），返回体已剥 confirmedBy。
- **中**（约 1 天）。

### workflow（A2）
contracts（删响应 schema + 级联约定）→ server（DELETE 路由 + store + 级联 + 测试）→ 前端（加一棒浮层 + 删按钮 + client）→ verify+对抗审查（级联是否干净、反监视、空态）→ 真机截图（加一棒出现新卡、删一棒消失、箭头不悬空）。

---

## A3 · 车 → 机器人 全站术语 sweep

RoboMaster 语境「车」=「机器人」（R1/R2 即机器人）。**用户可见文案共约 10 处主战场 + 一批注释/测试**，扫描清单见附录。

### 替换口径（词典）
车→机器人 ｜ 车队→机器人队 ｜ 车号→机器人编号 ｜ 车号位→编号位 ｜ 车管理→机器人管理 ｜ 建车→新建（机器人）｜ 整车→整机 ｜ 装车→装机 ｜ 车列→机器人列 ｜ 用车安排→用机器人安排 ｜ 排车→排机器人 ｜ 适配车→适配机器人 ｜ 实车→机器人

### 必改（用户可见）
1. `translations.ts` zh：`nav.resources`「车管理」→「机器人管理」、`toolbar.title.resources`、`resources.*` 全套（车总数/建车/车号/车号位/车队/整车…）、`inv.ledger.title`「零件 × 车」、`inv.record.field.holder`「车/货架」、`inv.kind.mount`「装车」→「装机」、`schedule.intro`/`empty.body`/`relay.empty`/`relay.boardingClosed` 各一处「车」、`archive.form.robot`「适配车」。（**英文侧已是 Robot/Fleet，无需改**。）
2. `schedule.ts` `renderFact`：兜底字符串 `'实车'`（两处）→「机器人」——会随 `factStatement` 回显给用户。
3. `inventory.ts` 校验错误信息「车 X 的占用不能为负」「各车占用合计超过总数」「必须指定一台车」→「机器人」——这些经 400 回显用户。
4. 图标：`ConsoleLayout` 侧栏「机器人管理」从 lucide `Car` 换 `Bot`。

### 保留（不改）
- `displayCode` 代码与值（`26R1`/`26R2`）；内部类型 `SharedResource`/`ResourceStatus`/`ResourceSession`/`robotTarget`（API 契约 + DB key，改动需迁移）；函数名 `canBoardResource`/`deriveDisplayCode`（已是英文 resource 语义）。

### 顺带（low，可一并做）
- 源码注释里的「车/可上车/整车」对齐「机器人」（不影响用户，提可读性）。
- 测试 describe/test 字符串里的「车管理/建车/整车」同步（不影响运行）。
- 种子 `name`「R1 比赛车」→「R1 比赛机器人」（用户数据字段，可选）。

### 附带发现的「相关问题」（扫描白送，建议顺手清）
- **死键** `nav.inv.soon`「库存/BOM 开发中」：已无 navItem 指向，删。
- **死链** `DepGraphPage` 「查看我的知识地图」`href='#'`+preventDefault：点了无反应 → 改 disabled+「即将上线」或隐藏。
- **WIP 文案泄漏** `settings.integrations.desc`「真实接入仍在搭，目前多为占位」→ 去开发语境词。

### workflow（A3）
两段式：① `agent(haiku/sonnet)` 按附录清单**机械替换** translations.ts zh + 各 JSX + renderFact + inventory.ts + 图标 + 清死键/死链 ；② `agent(opus)` verify（三包 typecheck+test，注意 renderFact 改后 schedule.test 的 `撞坏维修中`/无人名断言仍过）+ 对抗审查（有无漏网「车」、有无误改 displayCode/类型名）→ 真机截图机器人管理页/库存页/排班页文案。**中**（约半天）。

---

## B · IA 重构是什么 + 整体怎么做 workflow（本轮不执行，仅讲清）

### 什么是 IA 重构
IA = Information Architecture（信息架构）= 功能与数据**怎么组织成页面/导航**。现在 TeamHub 侧栏是 **10 个平铺页**（总览/依赖图/缺人方向/在场排班/知识库/项目看板/图纸档案/库存/机器人管理/设置），**无分组**，且按「功能/视图」切页。「IA 重构」= 改成**按数据域组织**：相关页合并、同一份数据只有一个编辑入口、有清晰主动线。

### 为什么要（早前审查结论）
你说的「UI 太多反而乱、一个数据被很多地方改、没动线」，根因正是按视图切页：
- **任务域**摊在 4 页：同一个 `PmCreatePanel` 在「看板」「依赖图」双挂、依赖有 3 个建边入口、改状态只在依赖图能做。
- **机器人域**摊在 3 页：机器人只在「机器人管理」能改，库存/排班只是借它当列。
- 两块 `@xyflow` 画布（依赖图 vs 接力）长得一样、箭头语义相反，易混。
- 知识库/图纸档案同属「翻历史」却两个顶级项；总览与档案重复展示 artifacts。

### 整体怎么做（分阶段 workflow，每阶段独立可交付、不破坏现有）
- **阶段 1 「机器人队」页** = 机器人管理 + 在场排班合一（机器人域）。上半区机器人清单（建/改状态/退役）、下半区接力画布；改机器人状态画布即时反映。← A1/A2/A3 正是这页的零件，做完它顺势成形。
- **阶段 2 「项目」页** = 看板 + 依赖图视图切换（任务域）。单一录入入口（一个 PmCreatePanel）、单一改状态入口（两视图都能改）；「缺人方向」降为该页的洞察 Tab。
- **阶段 3 「知识」页** = 知识库检索 + 图纸档案（+结案归档）多 Tab；KB 结果里的 `archiveFileName` 做成可点链跳档案。
- **阶段 4 导航分组 + 落地页**：侧栏从 10 平铺改「主操作区（项目/知识/库存/机器人队）+ 洞察区（总览/缺人，可折叠）+ 设置」；默认落地从「总览（运维指标）」改「工作台（可操作 + 置顶被卡项 CTA）」。
- 每阶段一个 4 层 workflow（多为前端合并 + 少量 server，contracts 基本不动）+ 真机验。**渐进式**：一次一个域，随时可停。

> 评估：阶段 1 收益最高（直接呼应你已认可的机器人域整合），建议未来从它起步。本轮先把 A1/A2/A3 做扎实，它们是阶段 1 的地基。

---

## 执行编排（批准后）

顺序 **A3 → A1 → A2**（A3 先扫平文案/术语，避免 A1/A2 新增文案又踩「车」；A1 给日期上下文，A2 往日期里加棒，二者配套）。每项独立 commit+push、各自真机截图验收。

| 项 | 后端 | 前端 | 工作量 | 真机验收点 |
|---|---|---|---|---|
| A3 车→机器人 | renderFact/inventory 错误文案 | translations+JSX+图标+死键死链 | 半天 | 机器人管理/库存/排班 文案无「车」 |
| A1 日期选择器 | 0 | 分段+下拉+日期模型+i18n | 半天 | 今天/明天/后天切换、不匹配不高亮 |
| A2 加/删一棒 | DELETE session+级联 | 加一棒浮层+删按钮+client | 1 天 | 加一棒出新卡、删一棒消失、箭头不悬空 |

---

## 附录：车→机器人 扫描清单（节选，完整 69 条见 workflow 输出）
- `translations.ts` zh：30 处（resources 全套 + inv 3 + schedule 4 + archive 1）
- `RelayCanvas.tsx` 12（多为注释 + 文案）、`ResourcesPage.tsx` 7、`ArchivePage.tsx` 4、`InvPage.tsx` 3、`InvLedgerTable/InvQuickRecordForm` 各 2、`App.tsx`/`ConsoleLayout.tsx`/`client.ts`/`resources.ts` 各 2、`DepGraphPage.tsx` 1
- 契约/服务可见文案：`schedule.ts` renderFact「实车」×2、`inventory.ts` 错误信息 ×3
- 保留：`SharedResource*`/`ResourceStatus`/`robotTarget`/`deriveDisplayCode`/`displayCode` 值
