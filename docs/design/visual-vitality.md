# VISUAL-VITALITY：战情屏门面 + 全站视觉生命力（执行真相文档）

> 2026-07-13 立档（执行协议沿用 design-language.md 先例：单一真相文档 + 每批原子 commit +
> verify:all + health-check + 截图对比基线）。背景：DESIGN-LANG B0–B5 收敛了「乱」（按钮 12→4、
> 徽章 8→1），但用户评审结论 = 界面仍**平庸**。病灶盘点（2026-07-13，四主题基线截图评审）：
> ①满屏同权重面板汤、无视觉主角 ②叫「遥测台」却零仪表（指标全静态文字）③字号层级压扁
> （最大 28px，页题与卡题差距小）④零动效、静态截图感 ⑤空态=文字横幅浮在虚空
> ⑥「距赛日 N 周」这个全产品最重要的数字只是面板角落一行小字 ⑦大片未经营空间。
>
> 用户拍板（2026-07-13）：目标=**两者兼顾**（总览做「战情屏」当门面 + 其余页层级细节收口）；
> 动效=**克制的生命感**（每屏 2–3 处，全部过 prefers-reduced-motion）；签名品牌元素=后置不做；
> 推进方式=**方案 A 三层（V0 地基 → V1 战情屏 → V2 收口）**，单开分支 `feat/visual-vitality`。

## §0 总原则

- **一屏一主角**：每页有且只有一个元素在尺寸/颜色/形态上明显压过其余（总览=倒计时+时间轴
  合体 hero；其余页=页题层级 + hero 面板一档）。主角以外一律保持安静。
- **仪表用真数据，不造假**：微图表只画后端真实返回的数据（计数、比值、drift 档位、时间戳），
  没有历史序列就不画趋势线——空 sparkline 比假 sparkline 诚实。
- **动效三件套封顶**：数字滚动进场 / 状态灯呼吸 / 图形生长，每屏合计 ≤3 处；一律走
  `--motion-*` token + 全局 `prefers-reduced-motion` 兜底（media query 统一置 none，不逐处写）。
- **四主题自动适配**：微图表只消费语义 var（--green/--amber/--red/--blue/-soft/--text/--muted），
  禁新 hex；辉光类效果仅 `[data-theme='tech']` 越界层（design-language §0 既有规则）。
- **反监视红线 I0 恒在**：任何仪表不得引入成员维度（环/条/灯只画系统与组级数据）。
- **DESIGN-LANG 全部规则继续生效**：按钮/徽章/卡片/空态类不新造；本轨只加「viz 原语 + 动效
  token + 层级」三类新东西。

## §1 批次表

| 批 | 内容 | bump |
|---|---|---|
| V0 | 视觉地基：display 字号档 + 动效 token/keyframes + viz 原语（Ring/StatusDot/Sparkline/CountUp） | minor |
| V1 | 战情屏总览：倒计时 hero + 时间轴增高增活 + 指标瓦片仪表化 + 事件流时间线化 | minor |
| V2 | 全站收口：页题层级 + 面板主次三档 + 空态几何示意 + 依赖图节点提亮/被卡脉动 | patch |

每批 DoD：console verify:all exit 0 + health-check 8 页 0 错 + 4 主题截图入
`docs/screenshots/visual-vitality/` + 本文档回写偏离注记。

## §2 V0 视觉地基

2.1 **字号档扩两级**（styles.css :root，主题无关刻度）：
    `--text-3xl: 34px`、`--text-display: 44px`。用途边界：display 只许指标数字/倒计时
    （每屏 ≤2 处），3xl 给页题（V2 接管）。

2.2 **动效 token**：`--motion-breathe: 3.2s ease-in-out infinite`、
    `--motion-grow: 480ms cubic-bezier(0.22, 1, 0.36, 1)`（出场生长）、数字滚动时长 720ms
    （JS 侧常量）。keyframes：`vv-breathe`（opacity/阴影脉动）、`vv-grow-x`（scaleX 0→1）、
    `vv-draw`（stroke-dashoffset 走线）、`vv-pulse-alert`（被卡红脉动，V2 用）。
    全局兜底：`@media (prefers-reduced-motion: reduce)` 内统一 `animation: none`。

2.3 **viz 原语**（`src/components/viz/`，均为无状态展示件 + 纯函数分离可单测）：
    - `ProgressRing`：SVG 环，props = value/max/tone/size/label 槽；弧长计算抽
      `viz-math.ts#ringArc` 单测。
    - `StatusDot`：语义色呼吸灯，props = tone/live（live=false 不呼吸）；tech 下带辉光
      （越界层规则内，全站辉光预算：状态灯 + 主按钮 hover + 现在指针，共 3 类）。
    - `Sparkline`：SVG 折线 + 入场走线，props = points（真实数值序列）/tone；点位计算抽
      `viz-math.ts#sparklinePath` 单测；**无数据不渲染**（调用方负责判空）。
    - `useCountUp(target)`：数字滚动 hook（requestAnimationFrame，ease-out），
      reduced-motion / 非有限值时直接返回目标值；插值函数抽 `viz-math.ts#countUpValue` 单测。

## §3 V1 战情屏总览

3.1 **倒计时 hero（signature，全站唯一记忆点）**：baseline hero 面板头部改为左右双栏——
    左=「T-N 周」超大 mono 倒计时（--text-display，tech 下 cyan + 微辉光；无 competitionDate
    时该块整体不渲染，不摆 0），右=赛季名 + 当前阶段 + 赛日日期（mono）。数字滚动进场（动效①）。
3.2 **时间轴增高增活**：轨道 44px→64px，段标签留呼吸空间；「现在」指针头改呼吸圆点（动效②，
    与 StatusDot 同 keyframe）；里程碑点尺寸 +2px、hover 放大 1.25 倍带 title 不变。
33. **指标瓦片仪表化**（真数据映射）：系统=StatusDot 绿呼吸+「正常」；Agent 后端=ProgressRing
    enabled/total；协作桥=被卡>0 时红 StatusDot（不呼吸，静态警示）+数字，否则绿灯；
    仓库/图纸=大 mono 数字 useCountUp 进场（动效③）。瓦片顶部按 tone 加 2px accent 条，
    打破五瓦片完全同质。
3.4 **事件流时间线化**：data-row 左侧加语义色时间线圆点 + 竖连线（纯 CSS ::before），事件
    时间戳（HubEvent 若含）mono 靠右；不含时间戳则只加圆点。
3.5 **里程碑列表收紧**：下一个未过里程碑/门 = `is-next` 高亮（左 accent 竖条 + surface-raised），
    其余行距收紧一档；计划日期改 mono。

## §4 V2 全站收口

4.1 **页题层级**：toolbar 页题 --text-xl→--text-3xl，eyebrow 字距展开；面板内 h2 不动
    ——页题与卡题拉开两档。
4.2 **面板主次三档**：`.panel--hero`（更强边框对比 + tech 下顶部 1px cyan hairline）/
    `.panel`（现状）/ 行内区（无边框 surface-muted）。只把总览 baseline hero、项目页画布、
    知识库检索区标 hero，每页 ≤1。
4.3 **空态几何示意**：`.list-empty` / `FormEmptyState` 加 40px 语义 icon（lucide 现有图标，
    muted 色 + 虚线圆环包裹），文字与 CTA 不变——空态从「一句话浮虚空」变「有构图的引导」。
    我的视图匿名横幅同改。
4.4 **依赖图节点**：tech 下节点底色提亮一档（surface→surface-raised）、状态左条 3px→4px；
    被卡节点 `vv-pulse-alert` 红脉动（动效预算内，替换该页原静态样式）。

## §5 验证与协议

- 每批：`npm run verify:all`（hub-console；V0 若触 contracts 则三包）→ `npm run health-check`
  → Playwright 截图 4 主题 × 总览（V2 加项目/知识库/我的视图）→ 与
  `docs/screenshots/design-lang-baseline/` 对比确认无回归。
- 分支纪律：`feat/visual-vitality`，每批一 commit + bump（§1 表），push 分支到 origin；
  **不直推 master**（用户 2026-07-13 指定，覆盖 D-064 默认，合并时机用户拍板）。
- 偏离回写：实现与本文档不符处，在对应小节尾部加「偏离注记」。

## §6 偏离注记（2026-07-13 三批落地回写）

- **§2.3 CountUpNumber**：V0 未列、V1 补（hook 规则不许条件调用 useCountUp，需组件包装塞
  ReactNode 槽）。**Sparkline 已建成但 V1 零消费**——fixture/真实后端都没有历史数值序列可画
  （§0「不造假」），原语留着等未来事件量/提交量按周聚合后接入；勿当死代码清理。
- **§3.2 时间轴 min-width**：560→480。__body 补 18px 内边距后，560 在总览左栏（~524 可用宽）
  必横滚、右缘看似裁断；480 桌面完整呈现、窄屏仍可滚。
- **§3.4 事件竖连线**：砍。stack-list 用 1px 缝隙分行，跨行连线视觉断裂；只留 tone 圆点 + mono
  时间戳。
- **§4.2 hero 面板**：项目页画布不套——`.dep-graph-canvas` 不是 `.panel` 且尺寸上天然主角，
  加框=纯装饰。最终 hero 两处：总览基准线 + 知识库检索表单，「每页 ≤1」保持。
- **§4.3 空态**：收敛为 `.state-band--page` 页级修饰符（我的视图匿名/未登录两处），纯 CSS 几何
  记号（虚线圆环+圆点）零图片。散装列表空态（detail-empty/pm-column__empty/…）与 FormEmptyState
  **均未动**——属 DESIGN-LANG B4 硬边界（用户拍板节奏），待 B4 收编成 `.list-empty` 后再统一补
  图形，避免两套图形语言并存。
- **§5 验证**：三批各自 verify:all（V1 起 143 测）+ health-check 9 页 0 错 + 四主题总览截图
  （`docs/screenshots/visual-vitality/`）+ tech 项目/知识库页。执行为交互式会话（用户在场），
  非无人值守。
