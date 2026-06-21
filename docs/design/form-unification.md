# FORM-UNIFY：控制台表单统一标准 + 三批迁移

> 单一执行真相。一个空上下文可只读本文件就执行全部三批。
> 起点 = 干净的 v0.7.0（HEAD 87b8692）。零后端改、零 i18n key 改/删、零视觉回退、守反监视 I0。

## 0. 背景

`apps/hub-console` 共 23 个表单，模式各写各的：字段外壳 5 种、控件 6 种、提交按钮 4 种、成功反馈 4 种、失败反馈 6 种、hint 8 种、校验 6 种。已埋 bug：新增零件「单件追踪」seg 的 active 三元写反。本文统一之，分三批。

## 1. 统一标准

### 1.1 控件三档铁律
- 固定枚举（status / kind / depType / category / source …）→ **Select**
- 候选可挑又需手填（机器人 / 赛季 / groupId / providerGroup）→ **Combobox**
- 纯自由文本 / 数字 / 备注 → **input**
- 二选一 / 多选的视觉 toggle → **SegToggle**

### 1.2 原语（`apps/hub-console/src/components/`）
| 原语 | 处置 | 职责 |
|---|---|---|
| `Field` | **扩展现有**（向后兼容） | 字段外壳唯一入口。+`hint?`(→`kb-field__hint`，吸收内联 hint，去 title 重复)、+`error?`(→`form-hint--warn` 字段级)、+`as?='label'\|'div'\|'fieldset'`(复合控件/checkbox 行用 div、真分组 fieldset+legend)。`kb-field` 基类与 className 合并逻辑不变。 |
| `FormGrid` | **新增** | 薄封装 `pm-form__grid`。`cols={2\|3}`；子项可标 `span-all` 全宽。取代手写 `div.pm-form__grid` 与一次性横排壳(`archive-top-row`/`resources-version-row`/`archive-mechanism-row`)。**禁止条件渲染让字段跨行漂移**（就地显隐）。默认两列。 |
| `FormActions` | **新增**（由 `PmCreatePanel` 的 `FormFooter` 原地提升） | 统一 footer：内含 `SubmitButton` + `FormBanner`。props `submitLabel/submitting/disabled/error/success`。 |
| `SubmitButton` | **新增**（可内联于 FormActions） | `kb-submit` + `type=submit` + pending 文案切换 + 可选 icon。消除 `type=button onClick` 提交歧异。 |
| `FormBanner` | **新增**（抽既有 `form-banner` 样式） | 成功/失败/警告条。`kind='ok'\|'err'`（err → `role=alert` + `errorDetail()`）。吸收 `form-banner--ok/--err`、`resources-row-error`、`archive-upload-err`、KbSearch 无 errorDetail 文案。Schedule 父层 banner 也复用。 |
| `Select` | **新增**（极薄封装原生 select） | 固定枚举唯一控件。统一 options 渲染 + i18n + 冷启动占位 option。收编 `TaskSelect`/`SourceSelect`（`richLabel` 作 renderOption 选项）。 |
| `SegToggle` | **新增** | 二选一/多选枚举的分段 toggle 统一原语，内部管 active className（**修 Inv 追踪三元写反 bug**）。取代 Archive 组别/电路子类型、Inv 追踪各处手拼。 |
| `FormEmptyState` | **新增**（小段落） | 前置条件不足（任务<2、冷启动无候选）统一早退提示，取代各处散写的 form-hint 早退段。 |
| `Combobox` / `SeasonSelect` / `MetaRow` | **复用不动** | 可选可填 / 赛季 / 只读元数据展示。 |

### 1.3 约定
1. **控件**：见三档铁律；PM 的手写 `input+datalist`(groupId/providerGroup) 全部并入 Combobox；各处手拼 active 的 seg 全部并入 SegToggle。
2. **hint 两档**：字段级走 `Field` 的 `hint` prop(→`kb-field__hint`)；整组/警告级走 `form-hint`(保 `--warn`)。placeholder 只放示例值、不承载语义说明；同一字段禁 `title`+`hint` 双写；逗号多值等格式约定必须有 hint（修 NeedForm `neededSkills`）。
3. **校验**：disabled 提交按钮 + submit 内二次 guard 双保险；字段级错误用 `Field` 的 `error` prop（`form-hint--warn` 内联，沿用 PM 自环模式）；前置条件不足统一 `FormEmptyState` 早退。
4. **成功/失败**：统一一个 `FormBanner`（由 `FormActions` 渲染）；区级/页级加载失败仍用 `state-band-error`，与提交错误**分层**；401 等特例作 FormBanner 的 message 派生、不另起类。
5. **冷启动**：候选为空用 `FormEmptyState` 或 Select 占位 option；沿用 PM 的「useEffect 仅在字段为空时回填 default」模式，不覆盖用户已输入。
6. **密度**：`FormGrid` 默认两列、必要时 `cols={3}`（仅 Resources season/target/version 这类三连），全宽字段标 `span-all` 固定位置；禁字段跨行漂移。
7. **即时控件**：纯即时生效控件（settings 语言/主题、日期栏、handoff picker）明确归「即时控件」类，**不套表单标准、不设提交按钮**。
8. **反监视 I0（红线）**：任何表单/原语**不得新增成员维度字段**（owner/confirmer 是录入者凭证、非考勤）；`Field`/`Select` 不提供「选成员打卡」语义；每个新原语注释里写死「不收成员维度」防回潮。

## 2. 三批

### 批 1 · 地基（最低风险，纯搬运 + 向后兼容）
- **新增**：`FormActions`、`SubmitButton`、`FormBanner`；**扩展** `Field`(+`hint`/`error`/`as`)。
- **迁移**：所有真表单的 footer/成功/失败 → `FormActions`+`FormBanner`；散落的字段内联 hint → `Field.hint`；PM `FormFooter` 原地提升为共享 `FormActions`（事实标准，零行为变更）。
- **顺带补齐**：Resources 改状态 / KbSearch 缺失的成功-错误反馈不对称。
- 触及：`components/Field.tsx`(+3 新组件)、PmCreatePanel、ResourcesPage、Inv(两表单)、KbCloseoutForm、KbSearchPage、ArchivePage、RelayCanvas(AddLegForm 父层 banner)。
- 验收：`verify:all` 全绿；界面无视觉回退。

### 批 2 · 控件（中风险）
- **新增**：`FormGrid`、`Select`、`SegToggle`、`FormEmptyState`。
- **三档收编**：PM `input+datalist` → `Combobox`；各 `select` → `Select`（含 TaskSelect/SourceSelect 收编、richLabel 保留）；各手拼 seg → `SegToggle`（**修 Inv 新增零件追踪 active 三元写反 bug**）。
- **密度统一**：手写 `pm-form__grid` / 一次性横排壳 → `FormGrid`；条件字段就地显隐、不跨行漂移（Inv 备注定位）；前置不足早退 → `FormEmptyState`。
- 触及：`components/`(新增)、ResourcesPage、Inv(两表单)、PmCreatePanel、ArchivePage、KbCloseoutForm、RelayCanvas(AddLegForm)。
- 验收：`verify:all` 全绿；追踪 toggle 选中态正确（回归点）。

### 批 3 · 收尾（较高风险，放最后）
- **行内表单 form 化 / 即时控件切分**：Resources 改状态 → 真 `<form onSubmit>`(apply 改 type=submit)、Field inline 变体、补 FormBanner；EtaInput / handoff picker → 明确归「即时控件」类（不强套表单、至少补 aria-label 关联可见 label，错误走父层 FormBanner）。
- **Archive 复合字段**：组别/电路子类型 → `SegToggle`；机构裸 div+checkbox 行 → `Field as="div"`；来源 fieldset/legend → `Field as="fieldset"`；行内上传 ArtifactLogRow 补真 form 或归即时控件、`archive-upload-err`/401 → FormBanner。
- **Settings**：语言/主题 seg、日期栏明确归即时控件；连接配置(apiBase/writeToken)按真表单语义评估、apply 按钮归一。
- 触及：ResourcesPage(ResourceRow)、RelayCanvas(EtaInput/handoff)、ArchivePage、SettingsPage。
- 验收：`verify:all` 全绿；行内编辑与即时控件行为不变。

## 3. 执行协议（给执行上下文）

- 每批跑**一个 Workflow**：实现(opus) + 对抗审查(opus)；实现 agent 在 `apps/hub-console` 自查 `npm run typecheck`。
- 每批落地后主控跑 `npm --prefix apps/hub-console run verify:all`，**必须全绿**（typecheck + 44 测试 + vite build）。审查 must-fix 先修再 commit。
- 每批 = **一个原子 commit**：`bash scripts/bump-version.sh patch` → `git add`(本批文件 + 7 个版本文件) → commit message 前缀 `refactor(forms): FORM-UNIFY B<n> …` → `git push origin/master`（push 前 `git fetch`）。注意 git add 文件列表**显式逐个列**（shell 可能是 zsh，`$VAR` 不分词）。
- 顺序 **B1 → B2 → B3 串行**；下一批前确认上一批已 commit + verify 绿。
- 红线：**零后端改**（不碰 hub-contracts/hub-server）、**零 i18n key 增删改**（能不动 translations.ts 就不动；确需新文案极少量只增不删，zh/en 同步）、**零视觉回退**（中文界面）、**守反监视 I0**、**守 token 纪律**（schema 最小 / pipeline 优先 / agent 数克制 / 模型分档）。
- 三批全完 → **STOP**，给用户审核总结：每批改了啥 + 版本号（v0.7.1/0.7.2/0.7.3）+ 回滚命令。
- **回滚**：每批是原子 commit。回退某批 = `git revert <该批 commit>`；或整体回到批前 = `git reset --hard 87b8692`（v0.7.0）。
- 任何 verify 红且修不掉 / 审查判 must-fix 修不动 → **STOP 报告**，不硬推。

## 4. 完整迁移映射（逐表单参考）

- **CreateResourceForm**(ResourcesPage)：手写 grid→FormGrid(B2)；robotTarget 的 title+hint 双写→Field.hint(B1)；resources-version-row 横排壳→Field 内联预览槽(B2)；footer→FormActions(B1)。
- **ResourceRow 改状态**(ResourcesPage)：div.resources-action→真 form(B3)；apply type=button→submit(B3)；select/input 包 Field inline(B3)；补 FormBanner ok(B1)、resources-row-error→FormBanner err(B1)。
- **InvQuickRecordForm**：grid→FormGrid(B2)；备注就地显隐不跨行(B2)；footer→FormActions(B1)；holder select 评估 Combobox(B2)。
- **CreatePartTypeForm**(InvPage)：追踪 seg→SegToggle 修 bug(B2)；grid+独占行→FormGrid+span-all(B2)；footer→FormActions(B1)；数字/seg 缺 hint 评估补(B1)。
- **KbCloseoutForm**：projectId span→Field.hint(B1)；混用 grid→FormGrid+span-all(B2)；错误→FormBanner(B1)；成功富结果块保留但复用 FormBanner 头+MetaRow(B1)。
- **KbSearchPanel**：裸 label.kb-field→Field(B1)；补 Field.hint(B1)；error→带 errorDetail 的 FormBanner 或明确归区级 state-band(B1)；零结果导航按钮内联 style→类名(B1)。
- **TaskForm/DependencyForm/NeedForm**(PmCreatePanel)：FormFooter→共享 FormActions 并本文件复用(B1)；groupId/providerGroup datalist→Combobox(B2)；TaskSelect/SourceSelect→Select(B2)；neededSkills 补 hint(B1)；grid→FormGrid(B2)；早退段→FormEmptyState(B2)。
- **图纸登记 + 行内上传 ArtifactLogRow**(ArchivePage)：组别/子类型 seg→SegToggle(B2/B3)；机构 div+checkbox→Field as=div(B3)；来源 fieldset→Field as=fieldset(B3)；archive-top-row→FormGrid(B2)；archive-file-hint→Field.hint(B1)；error401→FormBanner message(B1)；行内上传补 form 或归即时控件、archive-upload-err→FormBanner(B3)。
- **AddLegForm**(RelayCanvas)：noOptions 双提示→FormEmptyState(B2)；cancel 用统一 actions 类(B3)；父层 banner→FormBanner(B1)。
- **EtaInput / handoff picker**(RelayCanvas)：归「即时控件」非表单(B3)；补 aria-label 关联可见 label(B3)；错误走父层 FormBanner(B1/B3)。
- **SettingsPage 连接/语言/主题**：语言/主题 seg、日期栏归即时控件(B3)；连接配置 apply 按钮归一、按真表单语义评估(B3)。
