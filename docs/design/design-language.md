# TeamHub Console 设计语言（DESIGN-LANG-UNIFY 执行真相文档）

> 2026-07-12 立档（执行协议沿用 form-unification.md 先例：单一真相文档 + 每批原子 commit +
> verify:all + health-check + 截图对比基线）。背景：设计语言盘点（同日）量化出按钮 12 套自造类、
> 徽章 8 家族、卡片 4 家族、空态 3 层并存、创建类动词五词混用——本文档钉死"唯一写法"，
> 批次 B0–B5 分批收敛存量，之后所有增量必须遵守本文。
>
> 改前基线截图：`docs/screenshots/design-lang-baseline/`（9 页 × 4 主题，v0.19.0 摄）。

## §0 总原则

- **一次性替换、不留 alias**：触点可枚举（按钮 ~30 / 徽章 ~25 / 空态 ~10），单人 trunk-based
  无 alias 受益者；每批 DoD 含 grep "旧类零残留" 谓词。
- **像素等值优先**：基类声明从现值"搬运"而非重设计；允许的最大漂移 = 归档产生的 1–2px
  padding/字号差，每处在批内截图确认。
- **tech 主题的越界规则不碰**（--blue remap / 圆角收紧 / mono 字体）：有意旗舰设计，非债。
- 反监视红线 I0 恒在：任何原语不得引入成员维度（徽章/卡片不长出"谁完成多少"的槽位）。

## §1 Token 总表与用法

1.1 **颜色**：4 语义轴 `--green/--amber/--red/--blue`（各配 `-soft` 对）+ 中性梯
    `--text/--muted/--faint` + 面 `--surface/-muted/-raised` + 边 `--border/-strong`。
    **规则**：徽章/状态色只许用语义轴，禁新 hex（星图等"性质恒定深色"的图形组件除外，须注释声明）。
1.2 **字号** 8 档（--text-2xs…--text-2xl）/ **字重** 4 档 / **圆角** 4 档（徽章一律 pill）/
    **阴影** xs·sm·md / **过渡** --transition。
1.3 **间距 `--space-*` / `--control-*`**：已定刻度、存量零消费（styles.css:52 TODO），**维持 defer**
    ——732 处 px、52 种离散值多不贴刻度，归档=真实布局位移，无像素 diff 工具链兜不住。
    **铁律：新代码必须用刻度，存量不回改**。复活条件 = 引入 pixelmatch 级截图 diff 后单独开轨。

## §2 按钮唯一写法（B3 落地）

`.btn` 体系 = 4 变体 × 2 尺寸，声明从现值搬运：

| 类 | 语义 | 来源现值 |
|---|---|---|
| `.btn--primary` | 每屏至多一个的主行动 | kb-submit（蓝实底白字，9px 16px/text-base/bold） |
| `.btn--secondary` | 常规操作 | settings-btn / detail-action-btn（描边 surface） |
| `.btn--ghost` | 低强调/行内 | detail-action-btn--ghost |
| `.btn--danger` | 破坏性操作 | detail-action-btn--danger（红轴） |
| `.btn--sm` 修饰 | 紧凑尺寸 | detail-action-btn（7px 12px/text-sm/medium） |
| `.btn--dashed` 修饰 | 上传/占位语义 | archive-upload-btn 虚线 |

- `SubmitButton` 组件保 API（type=submit + pending 语义，FORM-UNIFY 遗产），内部改吐
  `btn btn--primary`。
- **不并入**：`seg__btn`（SegToggle 分段控件内部件）、`icon-button`/`link-button`（已是全站原语）、
  `resources-action`/`relay-add`（布局容器，盘点归类修正）。
- 何时用 primary：表单提交、页面主 CTA；一屏出现第二个 primary 即违规。

## §3 徽章唯一写法（B2 落地）

`.badge` + tone 5 档（`--green/--amber/--red/--blue/--neutral`，另 `--neutral-faint` 承载
retired 灰）+ 尺寸 2 档（默认 3px 8px；`--dense` 1px 8px）+ `--wide`（min-width 92px，
承接 status-pill）。**纯 CSS 类归并、不建组件**——徽章 JSX 是单行 span 无行为。
领域语义→tone 的映射写在 feature 内 5 行 `toneFor()` 函数，不进 CSS：
- inv-kind：damage→red，mount/dismount→green，reserve/release→amber，stocktake/restock→blue，其余→neutral。
- resources-status：available/inUse→green，repair/upgrading→amber，down→red，retired/disassembling→neutral-faint。

## §4 卡片（B4 落地）

`.card` 基类（surface/border/radius-md/shadow-sm/hover 提亮）叠加使用：
`className="card pm-card"`——feature 类只承载布局差异（列宽/画布定位），与基类重复的声明删除。
**存量卡头 4 种命名不改**（churn>收益）；**增量必须 `.card__head`**。

## §5 空态 / 加载 / 错误三层模型（B4 落地）

| 层 | 唯一类 | 用途边界 |
|---|---|---|
| 页/区级 loading·error | `.state-band`（+`-error`） | 整页或整区数据未就绪/失败（role=status/alert） |
| 列表内空态 | `.list-empty`（+`__action` 承载 CTA） | 数据就绪但该列表为零条 |
| 表单前置条件不足 | `FormEmptyState` → `.form-hint` | 缺依赖数据无法填表 |

收编对象：`.detail-empty/.pm-column__empty/.inv-history-empty/.resources-empty/.kb-noresults`。

## §6 图标（B5 落地）

3 尺寸档常量（`src/constants.ts`）：`ICON_SM=12 / ICON_MD=14 / ICON_LG=16`。
现存 9 种散落尺寸按就近归档（13→14、15→16、11/10→12）；17/18 两处单独核实后归 LG 或登记例外。
strokeWidth 走默认，显式设置须注释理由。

## §7 文案规范（B1 落地；动词口径 2026-07-12 用户拍板）

7.1 **动词两词制**：
- **新建** = 系统实体从无到有（任务/机器人/赛季/零件类型）。
- **登记** = 把现实已存在的事物录进系统（图纸/用机时间/一笔领用）。
- **淘汰**：新增 / 添加 / 录入（存量 ~12 个 key 一次性替换；test/e2e 无字符串断言，零风险）。

7.2 **空态两模板**：
- A 冷启动可行动：`还没有{X}，{一句 CTA}。`（如"还没有机器人。下面建一台试试。"）
- B 过滤/区段空：`暂无{X}。`

7.3 **称谓**：界面 chrome 统一「机器人」；「车」等战队黑话走 vocabulary-overrides 租户层（机制已在）。

## §8 styles.css 纪律

- 分节符统一 `/* ===== 节名 ===== */`（淘汰 `─────` 长横线）。
- 文件头维护 TOC 注释（含"哪段实际长在尾部"的指针）。
- **新规则进所属分节、禁尾部 append**；日期戳保留、格式统一 `（YYYY-MM-DD …）`。
- **不拆文件**：@import 层叠顺序脆弱（主题覆盖/tech 段依赖源顺序）+ blame/grep 面损失 > 收益。

## §9 批次表与执行协议

| 批 | 内容 | 量 | 风险 | 状态 |
|---|---|---|---|---|
| B0 | UX 扫描 + 本规范 + 截图基线入库（docs-only） | S | 零 | 本 commit |
| B1 | 文案统一（§7，只动 translations.ts） | S | 零 | 待做 |
| B2 | 徽章归并（§3） | M- | 低 | 待做 |
| B3 | 按钮体系（§2）——**全方案最大回归面，完成后停一拍出图给用户** | M | 中 | 待做 |
| B4 | 卡片基类 + 空态收口（§4/§5） | M | 中 | 待用户看 B3 图后放行 |
| B5 | 图标档 + kb- 前缀卫生（Field 吐 `.field` 族）+ CSS 治理（§6/§8） | S-M | 低 | 同上 |

每批 = 一个原子 commit（`refactor(hub-console): DESIGN-LANG B<n> …`）+ bump patch +
verify:all + health-check + 与基线截图目视 diff；verify 红或非预期漂移修不动 → 整批 revert。
UX 扫描发现分流：视觉/结构类 → 对应批次"顺带修复"（**每批 ≤3 处**，超出另开 commit）；
交互/流程类 → docs/planning/backlog.md。

## §10 UX 扫描发现（B0，9 页 × 4 主题，sonnet 逐页评审，2026-07-12）

跨页去重后按分流规则归位。**共性结论**：四主题色板本身稳、组件语言不统一是根子——
与盘点结论互证（按钮/徽章/空态无规范）。

### 分流 → 对应批次顺带修复（视觉/结构类）

| # | 发现（页 · 主题） | 归批 |
|---|---|---|
| U1 | **[P1] classic/warm/dark 侧栏无当前页高亮**（tech 独有青轨；总览、库存两评审独立报出"不知道自己在哪页"） | 独立修复 commit（三主题补通用选中态：左轨 + 底色，紧随 B0） |
| U2 | [P1] 主按钮无强调色、主次倒挂（机器人队"新建机器人"灰扁平；库存"新增零件"弱于次级"记一笔"，warm 下近不可读） | **B3 核心证据**：.btn--primary 实心蓝统一解决 |
| U3 | [P2] 徽章语义色错配（机器人"在用/空着"同绿；设置"已归档"暗红低对比） | B2 顺带（toneFor 映射：空着→blue、已归档→neutral） |
| U4 | [P1] dark 主题依赖图画布裸原生滚动条（压住缩放钮，像渲染故障） | B5 顺带（xyflow pane scrollbar 样式） |
| U5 | [P1] 设置页集成区 QQ 卡旁"空白幽灵格"（grid 奇数项空 slot 带了底色） | B4 顺带（卡片批） |
| U6 | [P2] warm 主题卡片与页面底色几乎同色（我的视图/知识库边界看不清） | B4 顺带（--surface 与 --page-bg 明度差微调，限 warm token） |
| U7 | [P1] 机器人队说明文案枚举与实际状态对不上（说"在修/退役/拆了"，列表显示"在用/空着"） | B1（文案批） |
| U8 | [P1] 库存"单位"占位符只剩一个"↑"符号；图纸档案 标题/导航/按钮 三种叫法（图纸提交日志 vs 图纸档案 vs 查看档案） | B1（文案批） |

### 分流 → backlog（交互/信息架构类，不进本轮）

- 我的视图空态：副标题承诺任务列表但正文说功能不可用（自相矛盾）+ 黑话（"身份模式/部署方"）+ 无 CTA。
- 知识库首屏空壳：无条目预览/总数/最近记录，tab 无数量角标，"跨赛季召回"黑话。
- 总览：空态大卡与满屏实据同框（层级矛盾）；统计卡异常态强调规则不一（0/3 灰 vs 被卡红）；"协作桥/Agent 后端"黑话无解释。
- 依赖图：状态色/图标双重编码无图例；右侧空态详情面板占 1/3 屏空白；统计卡术语晦涩。
- 学习方向：电控卡信息过载破网格（缺口三处重复表达）；"大号 MCP"黑话；"学得最多"类主观徽标仅两卡有。
- 图纸档案：`artifact://` 裸协议链接；分组标题层级倒挂；版本号与 R1/通用 标签同款胶囊难区分。
- 日期输入原生 mm/dd/yyyy 占位符与全中文界面不符（浏览器 locale，需 lang 属性或自定义控件）。
- 库存"追踪方式"选择器散装（胶囊+裸文本+超宽空容器）。
- warm 主题整体与 classic 区分度弱（RMSE ~3.9%）。
- 面包屑恒显"TEAM HUB"与侧栏品牌名重复。

## 明确不做

间距 token 存量替换（§1.3）· styles.css 拆文件（§8）· 存量卡头改名（§4）·
relay-canvas/dag/starmap 等专用画布类（feature 命名空间是正确作用域）· seg__btn 并入 .btn ·
tech 主题越界规则 · 强行让 direction/fleet/myview 用表单原语（它们没有表单场景）。
