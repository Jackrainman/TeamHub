---
kind: canonical-domain
status: active
domain: baseline
truth_for: season-baseline-milestones-gates-and-drift
last_reviewed: 2026-09-06
---

# Baseline 领域

## 1. 职责与边界

Baseline 管赛季级倒排基准线、阶段、里程碑、验证门、漂移和投资任务提示。它回答“项目相对赛季节奏在哪里”，不为个人任务建立截止日。

## 2. 当前行为（CURRENT）

- 每赛季一条 `SeasonBaseline`，包含 anchors、segments、phases 和 milestones。
- Robocon 模板用秋季开学日和比赛日展开三版车节奏，允许人工修改和 V3 合并进 V2。
- `Task.milestoneId` 将多个任务挂到同一里程碑；漂移按周计算红/黄/绿。
- 门可记录 evidence artifact 引用和验收事实；公开响应剥离 `passedBy`。
- 投资任务用 horizon/value/timeAccumulation 表达“未来高价值”和“需要提前积累”，不改任务 dueDate。
- 总览显示倒计时、时间轴、当前阶段、里程碑漂移和投资提示。
- 时间线编辑器（`timeline` 页，TIMELINE-EDITOR）：里程碑点击选偏移档位（±天/周、今天完成），悬停实时预览新日期与 pace 反馈（越过赛日标红）；segment 边界低频调整收进折叠卡，开始必须早于结束（前后端共用 validateBaselineSegments 拦截）；刻意不引拖拽库。pace 规则本体是 contracts 的 deriveBaselinePace。

## 3. 目标结构（TARGET）

- baseline contracts 拆为 model/policies/template；模板和 drift 纯函数保持唯一实现。
- server module 通过 repository 读写 baseline，通过 checklist port 判定能否过门。
- 过门、证据引用和检查项验证在 application service 中完成，不由 route 直调两个 Store。
- 生产数据进入统一 SQLite；删除独立 File/InMemory 正式路径。

## 4. 领域不变式

- 基准线是战队/赛季级，不按成员建立时间线。
- Task 永不加个人 dueDate；快慢只从里程碑、模块和组级结构派生。
- 证据字节进入 artifact 文件服务，数据库只存引用和校验事实。
- 版次裁剪由人显式执行并留痕；验证门不得因裁版消失。
- 数据不足时不制造黄色/红色结论。

## 5. 跨域接口

- PM 提供挂接任务和状态投影，baseline 返回 milestone drift 与 group-behind 结构结果。
- checklist 提供门下 pending 项和自选日期欠条 drift。
- artifacts 保存图片/视频证据，baseline 只持 artifactId。
- system 提供 season 和 actor；验收人资格来自身份授权。

## 6. 已知陷阱

- CURRENT baseline 文件仍描述独立 Store 和环境变量，与 D-090 目标冲突。
- 模板只有两个锚点，无法精确定位所有学期真空段；短赛季需人工覆盖。
- 2026 真实赛季时间线尚未赛后回填，模板仍是相对周 v1。
- 时间线编辑器是离散档位调整（点击选偏移/日期输入），非拖拽；相邻段联动（改一段边界是否顺延邻段）尚未做，需人工逐段对齐。

## 7. 未落地差异与 TODO

- `ARCH-UNIFY`：迁入标准 module 和统一 SQLite，通过 checklist port 完成过门事务。
- 赛后补充真实规则发布、方案冻结、备馆、赛日和实际达成时间，生成模板 v2。
- G4 破坏性/极限工况子项应来自复盘模板，不在 baseline 模型硬编码。
