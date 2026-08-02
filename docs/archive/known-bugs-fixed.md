# Known Bugs 归档 / 已修复

> 从 `docs/known-bugs.md` 移入的已修复条目。修复标注 `✅ 已修复 YYYY-MM-DD`。

## 2026-08-03 — 用户反馈三条（CSV 卡顿 / 日期选择器 / 初始化动线） ✅ 已修复 2026-08-03（v0.46.1）

### 1. 导入名册页 CSV 上传严重性能问题（卡死浏览器） ✅

- **根因**：卡顿不在上传/解析（皆 server 侧、线性），而在 preview 响应到达后 `RosterPreviewTable` 全量 DOM 一次 commit（几千行 × select+7 option+input+button）+ 每次键程 `rows.map` 全量克隆整表重渲染；另 InMemory/File store `importRoster` 每行 `findIndex` 查重 O(rows×members) 二次。
- **修复**：预览表渲染窗口分批（50 行 +「显示更多」）+ 行组件 memo + 函数式 setState（handler 引用稳定）；`importRoster` 组名/成员名 Map 索引线性化（保留 findIndex 首次出现语义）。
- **验证**：`roster-preview.test.ts` 键齐全锚点更新；hub-console/hub-server `verify:all` 绿。

### 2. 日期选择器深色主题下不可见 ✅

- **根因**：全站缺 `color-scheme` 声明——dark/tech 主题 input 背景走深色 token，但浏览器仍按 light scheme 渲染原生日期控件（深色图标打深底不可见）。
- **修复**：`styles/01-tokens.css` `:root { color-scheme: light }` + `:root[data-theme='dark'|'tech'] { color-scheme: dark }`，原生 date picker/滚动条/select 弹层随主题反转。
- **验证**：hub-console `verify:all` 绿（构建含 CSS 产物）。

### 3. 初始化动线缺失（教学动线·简版） ✅

- **根因**：初始化向导八步含「录入车队」，进 app 后机器人页空态无引导，用户不知从哪开始。
- **修复**（用户拍板的简版）：车队步移出初始化向导（8→7 步，FleetStep/FleetPreviewTable/fleet helper/i18n 键/客户端 previewFleet 全删，server 批量端点保留）；初始化一台车改在左侧「机器人队」页——空态加 Bot 图标 + 引导文案指向页面上方新建表单。
- **验证**：`bootstrap-gate/season-step/kb-step/inv-preview` 测试步序与圈号锚点更新；hub-console `verify:all` 绿。深度教学动线另行讨论。

---

## 2026-07-28 — 初始化向导（Setup Wizard）三处缺陷 ✅ 已修复 2026-07-28（v0.45.5）

### 1. 引导缺少「返回上一步」按钮 ✅

- **根因**：向导各步条件渲染（`step === X ? … : null`），无回退导航，回退即卸载丢表单态。
- **修复**：`BootstrapGate.tsx` 新增 `WIZARD_STEP_ORDER` 步序数组 + `goBack`；除首步外各步底部统一「上一步」按钮（`gate.back`）。已访问步保持挂载（`hidden` 隐藏而非卸载），回退时已填表单态不丢；已提交数据由步内查询重取回显（赛季步「已有当前赛季」、车队步「已有 N 台车」先例）。
- **验证**：`test/bootstrap-gate.test.ts` 步序/序号锚点 + `gate.back` 双语键；hub-console `verify:all` 绿。

### 2. 引导页2导入成员后，页3不显示已录入数据 ✅

- **根因**：`RosterStep.confirm` 导入成功后未失效 react-query 的 `['members']`/`['groups']` 缓存——门级 `membersQuery`/`groupsQuery` 在「你是谁」步就取过数，leads 步拿到的是导入前的旧空名册。
- **修复**：`RosterStep.confirm` 成功后 `invalidateQueries(['members'])` + `invalidateQueries(['groups'])`（照 FleetStep/InventoryStep 既有先例）。
- **验证**：hub-console `verify:all` 绿。

### 3. 建赛季（create season）功能缺陷 ✅

- **根因**（向导侧实测确认）：赛季名下拉 `value={form.name}`（"2027赛季"）与 option 的 `value={年份数}`（2027）不匹配——受控 `<select>` 匹配不到任何 option，恒显示空白，用户无法确认/切换赛季年份。
- **修复**：新增导出纯函数 `seasonNameYear(name)`（"2027赛季" → 2027），下拉 `value={seasonNameYear(form.name)}`。服务端 `POST /api/seasons` 与设置页建赛季链路核查无缺陷。
- **验证**：`test/season-step.test.ts` 新增 `seasonNameYear` 单测 + 「预填赛季名派生年份必落在下拉选项内」锚点；hub-console `verify:all` 绿。
