# Known Bugs 归档 / 已修复

> 从 `docs/known-bugs.md` 移入的已修复条目。修复标注 `✅ 已修复 YYYY-MM-DD`。

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
