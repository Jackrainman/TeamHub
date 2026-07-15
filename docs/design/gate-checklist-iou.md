# 门检查单与欠条（GATE-CHECKLIST-IOU）

> **status: DESIGN-LOCKED v1**（2026-07-15 用户拍板全部待定细节；功能已拍"要加"，**实现待排期**——建议先行于 Hermes 接入，纯本地零外部依赖）。**已实现（2026-07-15 实现轮，commit `f2ceffb`..`86bcc3d`，VERSION 0.22.0→0.22.3）**：四刀 C1 契约 / C2 存储 / C3 路由 / C4 界面全部落地，偏离回写见 §7。
> 上游 = `baseline-design.md`（门=BaselineMilestone kind='gate'，本文把门从原子点变成容器）+ D-085 名字三层（豁免/清偿留名=事实层带名）+ D-083（Task 永不加个人 dueDate 红线不碰——欠条不是 Task）。

## 1. 一句话定位

**凑合不禁止，但凑合必须贴条；条子有到期点；到期要么还、要么签字认账。** 门从"证据+验收"的原子点升级为**检查项的容器**；欠条=一种动态追加的检查项——一个机制吃下"检查单"和"技术欠条"两件事，不新建域。

## 2. 数据模型方向（实现轮落 zod，独立于 Task）

```
GateChecklistItem {
  id, seasonBaselineId,
  anchor: { milestoneId } | { dueAt },   // 挂接二选一（用户拍板）：已有门 或 自选到期日
  title,                                  // "24V→5V 模块无溯源，先用着"
  origin: 'template' | 'iou',            // 模板实例化 / 现场追加的欠条
  status: 'pending' | 'passed' | 'waived',
  clearedBy?: ActorRef,                   // 清偿留名（事实层，D-085）
  waivedBy?: ActorRef,                    // 豁免留名（大三）
  waiveReason?: string,                   // 豁免强制非空（用户拍板："书面豁免"的书面在此）
  note?, createdAt
}
ChecklistTemplate { id, title, gateHint?, source }  // 跨赛季资产；source 如 "复盘2026"
```

- **门判定只有一条规则**：挂在该门的检查项全部非 `pending`，门才可过（gate pass 路由校验拦截）。
- **自选日期欠条**进同一套周粒度红黄绿：到期未清=红（deriveBaselineDrift 扩展一条分支）。
- **版次裁剪**：门合并时检查项随门迁移（沿 `mergedFromVersion` 先例），门不消失=欠条不消失。

## 3. 权限（用户 2026-07-15 拍板）

| 动作 | 谁 | 约束 |
|---|---|---|
| 记欠条 | 任何人 | 30 秒内完成：一句话 + 挑门或挑日期（默认值=下一道整车级门） |
| 标清偿（passed） | 任何人 | 留名（事实卡）；门验收时验收人整单过目兜底 |
| 豁免（waived） | **大三（不只是组长）** | **强制写理由** + 留名；落地=「验收人名单」设置页维护，每年换届更新（换届交接门的一项） |

豁免留名+理由的定位：将来暴雷了翻出来，是**判断失误的记录**，不是甩锅的把柄——判断失误可以原谅，无记录的漂移不行。

## 4. 三层网（设计哲学——为什么欠条抓不住的雷也有去处）

1. **欠条**抓**自知的凑合**：自己知道在将就，当场贴条。
2. **检查单模板**抓**不自知的凑合**（本届 24V 转压模块教训：临时起意+刚好可以，当事人当下不觉得在凑合）：把教训写成**触发器**而非禁令——如"**无溯源电源件上车=自动欠条**"：不禁止用（实验车随手用完全合法），但门前统一问一遍、必须补验证记录或豁免，**不依赖当事人自觉**。触发器 v1=门前人工问句清单；自动检测后置。
3. **复盘**抓漏网的：没被任何网接住的雷，炸完进复盘，变成明年模板新条目（2026 一轮游检查单初稿为第一批，复盘重启后导入）。

目标不是零暴雷，是**同一个雷不炸第二次**。"整车设计冻结"不采纳——欠条恰是"允许迭代凑合"的配套。

## 5. 红线合规

- 欠条**不是 Task**：Task 永不加个人 dueDate（D-083 G4）不受影响；欠条的 dueAt 是"债的到期点"，属里程碑家族（里程碑有日期合法）。
- 留名全部落在事实卡（D-085 事实层）；无任何按人聚合（"谁欠条最多"排行永不做）。
- 独立轻量域，不塞 GovernanceSnapshot（照 baseline 先例，独立 store/落盘可与 baseline.json 同文件族——实现期定）。

## 6. 实现期账单（待排期）

schema（GateChecklistItem + ChecklistTemplate）→ gate pass 校验拦截 → deriveBaselineDrift 扩展（欠条到期红）→ console：门详情检查单卡 + 全局"快记欠条"入口（30 秒动线）+ 总览告警区欠条未清提示 → 模板 seed 留空（等复盘导入）。

## 7. 实现落点注记（2026-07-15 实现轮）

> GATE-CHECKLIST-IOU 四刀（C1 契约 / C2 存储 / C3 路由 / C4 界面，commit `f2ceffb`..`86bcc3d`，VERSION 0.22.0→0.22.3）已落地，三包 `verify:all` 全绿（contracts 235 / server 313 / console 148）+ health-check 9 页 0 错 0 白屏。本节把实现期偏离设计稿字面处 + §5 红线的兑现情况如实回写，按 schema / store / 路由 / console 分组（照 `baseline-design.md` §7 回写格式先例）。

### 7.1 schema 层偏离（C1，`hub-contracts/src/checklist.ts`）

- **anchor 挂接展平**：设计稿 §2 写嵌套 `anchor: { milestoneId } | { dueAt }`；实现按架构裁定展平成两个 optional 字段 `anchorMilestoneId` / `anchorDueAt` + `superRefine` 互斥校验（JSON/表单/落盘更顺，照 `pm-requests.ts` 先例）——`GateChecklistItemSchema` 与 `CreateChecklistItemRequestSchema` 各带一份互斥 `superRefine`；C2/C3 承接同一展平形状，未再变化。
- **drift 派生并列新增而非扩展**：设计稿 §2 字面写"`deriveBaselineDrift` 扩展一条分支"；实现按架构裁定并列新增独立纯函数 `deriveChecklistDrift`（`MilestoneDrift` 主键是 `milestoneId`，欠条的 `dueAt` 欠条塞不进），`deriveBaselineDrift` 本体未改。黄档判定纯按时间窗（`≤BASELINE_DRIFT_LOOKAHEAD_WEEKS` 周，含恰好 N 周记黄，已加边界测试锚定），无 `deriveBaselineDrift` 那条"挂接任务完成度阈值"分支——欠条无挂接任务，语义使然。
- **验收人名单落点** = `Member.gateReviewer?: boolean` 布尔位（D-087 拍板② + 体检 ②-2 裁定 additive，非新实体/新 `MemberRole` 档），随 `MemberPublicSchema` 一并对外（非机密、鉴权与设置页需读）；旧 `gov.json` 无此字段 optional 兜底。`SetGateReviewerRequestSchema`/`SetGateReviewerResponseSchema` 放 `pm-core.ts`（gateReviewer 字段 + `MemberPublicSchema` 皆在此）——注意所照的 `SetPin` 邻位范式其源文件实际是 `identity.ts`，本刀未动 `identity.ts`。
- **读契约不做剥名 Public 变体**：`ChecklistItemsResponseSchema` 及 clear/waive/create 响应均直接回带完整 `GateChecklistItem`（D-085 第三版口径"事实层永远带名"），刻意区别于 `baseline.ts` `passedBy` 剥离先例——依据已写进 `checklist.ts:22-29` 头部注释。
- **`GovernanceSnapshot` 未触碰**：新域独立、不进快照数组键，`attribution.ts` 未改（体检①已核，红线满足）。

### 7.2 store 层偏离（C2，`hub-server/src/store/*checklist-store.ts`）

- **落盘文件选择**：设计稿 §5 写"独立 store/落盘可与 `baseline.json` 同文件族——实现期定"；本刀裁定独立文件 `checklist.json`（`{items, templates}` 两键），不与 `baseline.json` 合流，照 baseline/inv 各自独立文件先例（属设计已授权"实现期定"，非字面偏离）。
- **`setMemberGateReviewer` 写语义**：mock/file/sqlite 三实现均 bump `updatedAt` + 钉 `updatedBy=console`（新增常量 `MEMBER_GATE_REVIEWER_UPDATED_BY`），逐字照 `setMemberPin` 范式；设计/D-087 未明文规定该写的 `updatedBy`，采体检 D6"照 PIN 先例"口径。
- **clear/waive 状态机返回值**：`clearItem`/`waiveItem` 对"id 不存在"与"当前非 pending（已 passed/waived）"两种情形均返回 `null`（受任务给定 `item | null` 签名所限，store 层无法区分两种失败），须 C3 路由层自行区分 404 vs 409（见 §7.3）。
- **demo seed**（`fixtures.ts`）：欠条②文案为演示新拟"备用电池组没做过流保护测试，先用着"——设计稿 §2 仅给出挂门欠条一条原句"24V→5V 模块无溯源，先用着"，无自选到期日示例原句；"文案用设计文档原句"的任务只对①适用，①已逐字用原句挂 `m-g4`（整车级门 pending），②`anchorDueAt=2026-06-05` 早于 demo 时钟 → `deriveChecklistDrift` 判红。gateReviewer demo 成员标 `m-progA`（senior/大四）+ `m-circuitD`（junior/大三）两名跨组验收人——design §3 豁免门槛写"大三（不只是组长）"，senior 大四同满足该门槛，属 demo 取值选择而非违规。

### 7.3 路由层偏离（C3，`hub-server/src/server.ts` `registerPmCoreRoutes` + `hub-server/src/authz.ts`）

- **过门硬闸仅在 `status==='passed'` 时拦**（`listBlockingChecklistItems` 命中即 400）；`status==='missed'`（记录验收失败）不拦——设计 §2 只写"挂该门检查项全部非 pending 门才可过"未区分 passed/missed，架构裁定 missed 如实记录失败不阻，属预定裁定落地。
- **豁免鉴权两模式统一走 `gateReviewer` 名册校验**：匿名模式校验 `body.waivedBy.id`、身份模式校验会话身份 id，非验收人一律 403（比"匿名放行"诚实）——设计只说"验收人名单鉴权"未明确匿名模式行为；D3 债（验收人名单必须与鉴权同批接线）本刀已兑现（`waive` 路由读 `store.getSnapshot().members` 经新建 `authz.ts` 的 `isGateReviewer` 做 403，非仅 UI 层过滤，测试+活体双证）。
- **`PUT /api/members/:id/gate-reviewer` 权限 v1 = 写门即可**（身份模式须登录、不再细分"须现任验收人/管理员操作"）——`pm-core.ts:158-161` schema 注释提到"须现任验收人/管理员"，实现 v1 未细分，仅靠宿主级写门（家庭影院级先例，同 PIN 首次设置取舍）。
- **clear/waive 命中"非 pending"返回 `409 Conflict`**——409 是全库首次引入（此前只有 400/401/403/404/429），选 409（语义正确的资源状态冲突）而非 400；路由层用 `listItems` 判存在性区分 404（不存在）/409（存在但非 pending），弥补 store 层 `null` 不区分的局限（见 §7.2）。
- **`seasonId` 全程走 querystring**（含 create/clear/waive/GET），照 baseline 三路由先例；clear/waive 额外带 `seasonId` 仅为 404/409 存在性判别所需。checklist 读/写契约经 `hub-server/src/contracts.ts` re-export（照 baseline 先例），`SetGateReviewer*` 直接 `from '@teamhub/hub-contracts'`。
- **体检 D6 债落地**：新建 `hub-server/src/authz.ts` 收 `isGateReviewer(members, memberId)`（豁免鉴权共用），文件注释预留 phase 2 的 `isGroupLeadOf`（TASK-POST-CLAIM 组长确认复用同一鉴权基元）。
- **gate-reviewer 路由动词用 PUT**（`app.put`）——C1 交接文字写的是 PATCH，实现按 PUT 落地，console 客户端按实际 PUT 接线（设计文档未指定 HTTP 动词，非破坏性偏离）。

### 7.4 console 层偏离（C4，`hub-console/src/features/checklist/*`）

- **门检查单卡渲染于每道门**（含 0 项的门也显示 muted『检查单』toggle + 『本门追加检查项』），非仅有检查项的门才显示——使『本门追加』每道门可达；设计 §6 只说『门详情检查单卡』未规定空门行为。
- **快记欠条入口**在无赛季/无基准线时整个组件 `return null`（连按钮不显）——欠条无处可挂（server 404），加一道守卫。
- **告警区『过期时长』用天**（『已过期 N 天』）而非周——避免近期过期欠条显示『0 周』；`deriveChecklistDrift` 派生仍用周粒度定红黄绿档，仅展示层换算成天。
- **告警区仅在有 pending 欠条时整块渲染**（0 未清 = 不占位），照 `investmentWarnings` 先例。
- **豁免匿名模式选人只列 gateReviewer 成员**（服务端也强制 403 兜底），设计未明写此过滤。
- **验收人名单分区**用 adapter-row + pm-check checkbox 开关表（非 SegToggle）；新增 `GRADE_KEY` 5 键作年级辅助 meta；未接 identity 写门提示（照 `SeasonsSection` 先例，设置页各分区均不 gate on identity）。
- **console 创建欠条显式传 `origin:'iou'`**：`CreateChecklistItemRequest` 的 `z.infer` 输出类型把 `origin` 变必填（虽 schema 有 `.default('iou')`），行为等价，仅 TS 类型后果。

### 7.5 版本节奏

- 本刀四个 commit 均 bump **patch**（非 AGENTS §7 新功能默认 MINOR）——GATE-CHECKLIST-IOU 的 minor 已在 C1（0.22.0）消费，C2/C3/C4 走 patch 递增，与 C1/C2 版本节奏一致（遵本刀 spec 钉定）。

### 7.6 复审补记（实现自报清单外，独立复审补记两处）

实现 agent 自报 deviations 覆盖极完整（本节 §7.1–§7.5 已全部纳入），逐条与代码核对属实。复审另补记两处未在实现自报里显式列出的行为：

1. **create 路由 `anchorMilestoneId` 孤儿校验用全体 milestones**（含非 gate 里程碑），即 API 允许把欠条挂到非门里程碑（console UI 只给 pending gate 故不可达）——与设计"里程碑家族"自洽，但 UI/API 口径差此前未点出。
2. **`ChecklistQuickRecord.tsx:98`** 把日期输入拼成 `` `${anchorDueAt}T00:00:00.000Z` ``（UTC 午夜），非 UTC 时区用户可能出现到期日偏一天的时区裸拼——轻 UX 隐患，此前未报。

### 7.7 红线复核结论（§5）

全部守住：`TaskSchema` 零改动（`pm-core.ts` diff 仅 `MemberSchema` 加 `gateReviewer` 布尔位 + `SetGateReviewer` 读写 schema + 两个 type 导出，`Task` 及其字段未触）；`GovernanceSnapshot`/`attribution.ts` 未触碰；全域无任何按人聚合/排行/按人筛选端点或派生（端点仅 GET by-season / templates / create / clear / waive / PUT gate-reviewer）；`waived ⇒ waiveReason` 强制落在 schema 层（`GateChecklistItemSchema` `superRefine` + `WaiveChecklistItemRequestSchema.waiveReason` `z.string().min(1)` 双重）；名字在事实卡可见且 `checklist.ts:22-29` 头部注释明写 D-085 第三版"事实层永远带名"依据、`GateChecklistCard.tsx:199-212` 渲染留名。D3 债（验收人名单必须与鉴权同批接线）已真兑现（§7.3）。
