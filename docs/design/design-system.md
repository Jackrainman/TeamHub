---
kind: canonical-design
status: active
domain: design-system
truth_for: console-visual-and-interaction-language
last_reviewed: 2026-08-15
---

# TeamHub 控制台设计系统

## 1. 设计目标

控制台应像机器人战队的工程工作台：信息密度高但层级清楚，有克制的生命感，不像行政后台，也不靠装饰制造“科技感”。一屏只有一个视觉主角，其余信息安静服务于任务。

所有视觉表达继续服从产品不变式：仪表只展示系统、项目、组、资源和任务数据，不增加成员比较维度。

## 2. Token 与主题

- CURRENT：四主题通过 `[data-theme]` 和 `:root` 语义变量实现，token 位于 `src/styles/01-tokens.css`。
- 颜色、圆角、阴影、间距、字号和动效必须消费 token；业务样式不得新增硬编码色值或重复 border/radius/shadow 组合。
- `classic`、`warm`、`dark` 使用克制表面；仅 `tech` 可在明确的越界层使用少量辉光。
- 所有动效必须响应 `prefers-reduced-motion`；每屏最多 2–3 个持续或入场动效。
- 没有真实历史序列时不画趋势线；没有值时宁可空态，也不画假仪表。

## 3. 页面层级与布局

- 页面题使用最高一级页面字号；面板标题低两档。
- 每页至多一个 `.panel--hero` 或等价主角区域。
- 卡片使用 `.card`，可点击卡片附加 `.card--interactive`；禁止业务 CSS 重造卡片外观。
- 页级空态、列表空态和表单前置不足是不同层级，不能用同一条错误横幅代替。
- 窄屏允许关键画布横向滚动；不得通过压缩文字和控件破坏可读性。

## 4. 控件选择

| 数据形态 | 控件 |
|---|---|
| 固定枚举 | `Select` |
| 可选候选且允许手填 | `Combobox` |
| 自由文本、数字、备注 | 原生 input/textarea，包在 `Field` |
| 二选一或少量互斥选项 | `SegToggle` |
| 赛季选择 | `SeasonSelect` |

placeholder 只放示例，不承担说明。格式、风险和约束写进 `Field.hint`；字段错误写进 `Field.error`。即时生效的主题、语言、日期等控件不强套提交表单。

## 5. 表单与反馈

- `Field` 是字段外壳唯一入口；`FormGrid` 负责两列/三列和全宽布局。
- 真表单使用 `<form onSubmit>`；提交区统一 `FormActions`、`SubmitButton` 和 `FormBanner`。
- 提交按钮 disabled 与 submit 内 guard 双保险。
- Mutation 普通错误由全局 toast 兜底；需要就地解释的领域错误使用 `FormBanner`；查询失败用 `QueryGate` 或页/区级错误态。
- 冷启动候选为空用 `FormEmptyState` 或 `EmptyState`，必须给出下一步动作。
- 条件字段就地显隐，不能导致表格字段跨行漂移。

## 6. 状态、图标与可视化

- 图标统一使用 `lucide-react`；用户可见文案必须走 `t()`。
- 徽标只表达离散状态，不用颜色表示个人好坏。
- 可视化原语 CURRENT 已有 `ProgressRing`、`StatusDot`、`Sparkline`、`CountUpNumber`；计算逻辑保持纯函数可测。
- 绿/黄/红必须有文字或图形冗余，不能只靠颜色传义。
- “需核对”“被阻塞”“缺料”等警示必须给出结构化原因和可执行入口。

## 7. CSS 与组件边界

- CURRENT：样式按 feature 放在 `src/styles/NN-*.css`，由 `main.tsx` 按顺序导入以保持级联。
- 跨 feature 原语放 `src/components` 或 `src/shared`；领域组件留在本域 `components/`。
- TARGET：feature 内使用 `components/`，存量 `sub/` 随 D-090 迁移删除。
- 单组件超过 400 行必须拆分，但拆文件不能替代领域边界治理。
- 新样式优先复用 `.card`、`.empty-state`、`.gate-field` 等基类和现有 token。

## 8. 文案与反监视

- 使用“被什么卡住、缺什么、谁可对接”，不使用“谁拖慢、谁没来、谁产出低”。
- 排班表达“轮到、待命、可下班”，不表达考勤。
- AI 输出使用“候选、建议、依据”，不使用“已判定、必须、负责人表现”。
- 成员选择只用于事实卡片或授权，不得被通用表单原语演化为考勤/排名入口。

## 9. 迁移状态

- CURRENT：设计语言、表单原语、四主题、可视化原语、CSS 分文件和 i18n 分域已经落地。
- TARGET：页面、hook、API segment 和领域组件随 D-090 收入各自 feature；设计原语保持共享。
- PLANNED：逐域迁移时清理裸 query key、跨 feature import、一次性 CSS 壳和仍在 `sub/` 的组件；不另建功能级视觉设计稿。
