# 治理派生·挂起决策归档（governance-suspended）

> D-039「AI 退出治理」后整簇挂起（spec 留待复活；复活触发=未来要 AI 参与治理判断）。
> 从 `decisions.md` 移出全文，原位留指针 stub。见 [[teamhub-direction]] / D-039。
> 相关 spec 全文已随治理簇归档 → `docs/archive/suspended-specs/gov-cue-layer.md`(D-032) + `gov-role-visibility.md`(D-033)（原在 `docs/design/`，2026-06-19 归位）。

## D-032 — 治理提示层 GovernanceCue 统一 + Member.status 全派生 + 静默信号

- 状态：**DECIDED**（spec 落 `docs/design/gov-cue-layer.md`；实现属 frontier `GOV-MEMBER-STATUS-DERIVE` + `GOV-RULES-LAYER`）
- 日期：2026-06-11
- 上下文：D-031 暴露的"freeIdle 会把'队长还没录入下一个任务'的人误判成摸鱼"——系统自造测量错误。讨论中用户把 idle 检测从"贴人标签"reframe 为"建设性提示触发器"（对本人"去看别的知识?"、对队长"xx 做完了去聊聊"、颜色中性变化），并选定对"有就绪任务却 N 天零进展"这一种（真·摸鱼候选）用**私下静默信号**（事级、对事不对人、看得见但不排名）。进一步发现：idle 三态 + 静默 + Need 升级（A.3 死代码）+ OverloadSignal（#4 空壳）是**同一个形状**，应收成一层。
- 决策：
  1. **`Member.status` 完全派生**：Task 是真相、人是投影，禁手写——杀掉与 `Task.status` 的双写（守 G2）。`updatedBy:'derived'` 不再是谎。
  2. **三个非推进态 + 静默**（`deriveMemberStatus`）：`uncovered` 待安排（无 active 任务→队长去派活，= 录入入口）/ `blocked` 被卡（复用 BlockAttribution）/ `capacityFreed` 腾出手（做完→本人去学 + 队长去聊·匀给过载组）；外加 `silence` 静默（有就绪任务却 N 天零进展→私下问本人 + 给队长事级提示）。`silence` 与 `capacityFreed` 之别 = 手里有没有就绪任务；两者都不贴"摸鱼"。真摸鱼靠队长"去聊"的对话发现，不进看板计数。
  3. **统一 `GovernanceCue` 层**（多态）：所有派生的"事/缺口/机会"= 一个 schema `{kind, subjectRef(task/group/need/resource), audience, tone(give/ask/surface), factStatement, suggestedAction, relatedKnowledge}`。**反排名红线只守在这一个 schema**（无 memberId 聚合维度、无 count/score/rank）。`GOV-RULES-LAYER` 由此重定义 = "Cue 生产者们（deriveBlockAttributions 已有 + deriveMemberStatus + deriveNeedEscalations + deriveOverloadSignals）+ `RulesConfig` 阈值"。
  4. **受众到人不落人名**：`audience='taskOwnerPrivate'` 不存 memberId，送达层即时解析 owner→larkOpenId 私发，不沉淀可聚合人维度 → 反排名保住。
  5. **阈值进 `RulesConfig`**（per-project，全默认值：silenceDays=3 / needEscalationDays=2 / overloadCriticalLimit=3），不强制录入（C1/C3）。
  6. **idle↔overload 闭环**：`capacityFreed` 与 `overload` 同层，队长一眼配对"谁空了 ↔ 哪组压了 N 项"。
- OPEN（留字段、本轮不定）：**`CUE-AUDIENCE-ROUTING`——队长 vs 组长身份难界定**：role enum 仅 `superAdmin/groupAdmin/member` + 组织树 `parentGroupId`，"队长(全队)"与"组长(子组)"如何落、一个 Cue 上给队长还是停在组长，决定 `audience` 枚举最终形态。单立 open_for_decision，配独立讨论提示词，归 ROLE-VISIBILITY。其余 OPEN：静默是否被读成变相监视（措辞+频率冷却）、阈值是否需 per-赛季 profile。
- 影响：新增 `docs/design/gov-cue-layer.md`（spec）；`GOV-MEMBER-STATUS-DERIVE`（frontier#2）从此有落地图纸；`GOV-RULES-LAYER` 范围明确为 Cue 生产者层；`now.md`/`agent-state.json` 加 `CUE-AUDIENCE-ROUTING` 入 open_for_decision。本 ADR 不改代码。
- 事实源：`docs/design/gov-cue-layer.md`；本 ADR；`docs/design/team-hub-concept.md`（canonical）。

## D-033 — ROLE-VISIBILITY / CUE-AUDIENCE-ROUTING：角色模型 + 受众路由 + 问责上移

- 状态：**DECIDED**（spec 落 `docs/design/gov-role-visibility.md`；实现属 frontier `GOV-MEMBER-STATUS-DERIVE` / `GOV-RULES-LAYER` / `HUB-SERVER-GOV-SCAFFOLD`）
- 日期：2026-06-12
- 上下文：关闭 D-032 §3 OPEN（`CUE-AUDIENCE-ROUTING`）。`GovernanceCue.audience` 只有 `taskOwnerPrivate/captain/groupAdmin` 三占位、无路由表——因为"队长(全队)"与"组长(子组)"在 role enum `{superAdmin,groupAdmin,member}` + `Group.parentGroupId` 多层自引用树上界定不清（程序大组下电控/视觉子组，电路/机械顶层；汇报按 `reportingGroupId`，D-029）。经两轮对抗式审计核实（8-agent 宪法审计 + 3-agent 产品目标核实），原"schema 反排名足够保证多帽安全"被纠为**对 A1 的范畴错误**——schema 守 C2 聚合排名，但不防 A1 单条点名与 C2 广度×时间重建，必须靠去名 + k-anon + dedupe 在投影/送达层补。
- 决策（用户 2026-06-12 拍板）：
  1. **role enum 不动** `{superAdmin, groupAdmin, member}`，零迁移。`superAdmin` 收窄为系统维护者/配置，**非 Cue 受众**；`groupAdmin` = 可 pull 本组事/缺口的可见性能力，子组/大组组长都是 groupAdmin、由 groupId 区分。
  2. **三处指派拆开 D-026 dec4 的"superAdmin = 维护者 + 队长"合并**（搭建权 ≠ 全队治理权 ≠ 只读观察）：新增 `Group.leadMemberId`（组长权威源，消"一组两 groupAdmin 谁带组"歧义）· `Project.captainMemberId`（队长 → `teamCoordinator`）· `Project.observerMemberIds[]`（老师 → 仅项目级 rollup）。队长/老师不进 enum 因其赛季级 + 与组长正交 + observer 多对多（1:1 enum 装不下、塞进去要 junction = 违 C3）。
  3. **audience 最终三值（改名取消歧义）**：`taskOwnerPrivate`（本人私发，不存 memberId）/ `subjectGroupLead`（按 subject 取 groupId：task→groupId·group→id·need→providerGroupId·resource→直升队长，经 `leadMemberId` 解析、有界上溯 子组→大组→队长兜底）/ `teamCoordinator`（队长）。配一张「Cue kind × 受众 × 升级链」路由表（见 spec §4）。
  4. **silence 受众 = 纯 pull（用户选 A）+ 问责上移**：silence 只私发本人「还在做 X 吗?」、**不 push 任何第三方**；停滞以事键快照「任务X·就绪·无进展」在本组 console pull 显示（快照非按人历史、本组组长可见 owner、更宽视图去名）。「如果还没看到就是组长的问题」——问责朝上（管理者注意力可问责）不朝下（监视队员），摸鱼从"抓坏队员"重述为"管理有没有在看"，并分散资历弱者压力（G5）。
  5. **可见性双轴（广度 × 深度）**：member/组长/队长/老师/superAdmin 分层；**任何层级（含队长、老师）都不见人均完成量排名（C2）**，越高 = 事/缺口广度越宽、绝非人粒度越细，老师深度最浅（仅大组 rollup）。push 升级门控；pull 每个 groupAdmin 只看直属组、大组只见去名 rollup（防大组 lead 旁观子组 silence 绕过门控）。
  6. **审计必修硬化（红线落投影/送达/测试）**：去名宽视图（ownerLabel 仅私链）· factStatement 文本红线测试（扫 `/静默\d|\d+天/` + 非私发 Cue 无 displayName）· 老师 `toObserverRollup` k-anonymity（子树成员 <k 合并/抑制，挡单人组点名，如 grp-circuit 单人且是 Need.providerGroup）· noticer 良基化（老师终极兜底「顶层未路由」）· owner==lead 上抬不留盲区（修 G5 反转）· owner==lead/captain dedupe 抑制协调面 · null captain → pull-only + superAdmin 配置提示不静默丢。
- 替代项（增长 role enum 加 captain/observer）未采纳：steelman 结论 keep-enum-unchanged——observer 多对多是致命点，进不了 1:1 enum；项目级字段是赛季级正交指派的正确关系表达；零迁移、天然支持一人多帽（并集可见性，安全靠去名/k-anon/dedupe 而非 enum 互斥）。
- 影响：新增 `docs/design/gov-role-visibility.md`（spec）；`gov-cue-layer.md` §2 audience 改名、§3 关 OPEN、§4 silence 行改纯 pull、§8 OPEN#1 移除；`now.md`/`agent-state.json` 移除 `CUE-AUDIENCE-ROUTING` 出 open_for_decision；supersede D-026 dec4 的 superAdmin 合并。为 frontier 列出 schema/纯函数/测试落地清单（spec §9）。本 ADR 不改代码。
- 事实源：`docs/design/gov-role-visibility.md`；本 ADR；`docs/design/gov-cue-layer.md`；`docs/design/gov-oncall-schedule.md`（reportingGroupId，D-029）；`AGENTS.md §5`。

## D-034 — 数据生命线分组化：silence 信号按组分河（C5）+ 保守过渡铁律

- 状态：**DECIDED**（spec 落 `docs/design/gov-cue-layer.md` §6；实现属 frontier `GOV-MEMBER-STATUS-DERIVE` / `GOV-RULES-LAYER`）
- 日期：2026-06-12
- 上下文：对抗式产品核实（3-agent，REJECT「摸鱼可见」）抓到 silence 触发的**信号源偏差是 schema 级宪法破口、非可调阈值**：「零进展」只从 `{gitCommit, larkCheckIn, manualNote}` 判定、**无任何 GroupKind 维度**（governance.ts:50-55 有 enum 但零逻辑 key off）。后果按工作物理性质不对称——程序连续 commit、硬件做物理活（锉件/焊板/台架）几乎零 commit，同样努力对程序"干净"、对机械/电路"静默"。这是 **C2（产能不可比，gitCommit 密度=因角色而异的产能代理）+ A1（"机械组老静默"成可读模式）+ G5（冤枉恰是 fixtures 里 freshman 机械新生 m-mechC/m-mechD）by proxy**。用户校正：硬件/机械"没那么容易卡"，重灾区在程序。reframe：信号偏差不是调阈值，而是**每组一条数据河（C5：治理状态必须有自然上游）**。
- 决策（用户 2026-06-12：图纸喂信号 + 程序薄封装 git）：
  1. **silence 按 GroupKind 分河**：机械/电路河 = **图纸版本上传**（新 `ProgressSignalKind='artifactUpload'`，喂硬件进度信号——这才是 §信号偏差的真正修法，对齐用户"机械图纸从微信迁上服务器按天/版本分类"的诉求）；程序河 = **git**（经薄封装 adapter 降门槛，HUB-GIT-ADAPTER-DESIGN，D-036）；通用兜底 = **larkCheckIn**，但须是回 Cue/digest 的**自然副产品**，**不得变日报打卡**（守 C5 禁凭空打卡）。
  2. **保守过渡铁律**：在各组的"河"真实接入前，**非 program 组的"git 缺失"一律不触发 silence**——宁可漏报不冤枉（硬件本就难卡）。这是过渡期护栏，避免 GOV-MEMBER-STATUS-DERIVE 一上线就用 commit-absence 冤枉硬件组。
  3. **presence 佐证**：owner 当窗在某 `ResourceSession` present/onCall（物理在场干活的证据）→ 抑制 silence；复用已落地 `derivePresenceSchedule`（schedule.ts），零新录入。
  4. **`RulesConfig` 阈值改 group-kind-keyed**：`silenceDays` 按 GroupKind 配（硬件更长 + 更强触发）；新增 `silenceCueCooldownDays`（同任务每窗至多一条协调 Cue，杀"反复 silence 累积成对人信号"，A4）。
  5. **parity 单测要求**：仅差 `group.kind`、相同 larkCheckIn/manualNote 历史的两任务 → 必须出相同 silence 判定（gitCommit 计数对非软件组 silence **可证明不承重**），落进 `governance.test.ts` 反排名 guard 同款体例。
- 替代项（继续单 project 标量 `silenceDays` + 三信号源不分组）未采纳：审计证其为 C2/A1/G5 三破口、且系统性偏向资历弱的硬件新生，不可调走。
- 影响：`gov-cue-layer.md` §4（silence 触发条件细化为分河 + 保守铁律）/ §5（deriveMemberStatus 须读 group.kind）/ §6（RulesConfig kind-keyed + cooldown + 分河 + presence 佐证 + parity 测试）同步。新 `ProgressSignalKind='artifactUpload'` 与 kind-keyed RulesConfig schema 由 GOV-MEMBER-STATUS-DERIVE 落代码（本 ADR 不改代码）。图纸上传端点/存储 = 审批门后 server 任务（D-036 登记）。
- 事实源：本 ADR；`docs/design/gov-cue-layer.md` §6；`docs/design/gov-data-model.md`（TaskProgressSignal/GroupKind）；`AGENTS.md §5`（C2/A1/G5/C5）。

## D-035 — 化解层 give-floor + 修正测量第 4 段意图（A3 暴露必带给予）

- 状态：**DECIDED**（spec 落 `docs/design/gov-cue-layer.md` §4/§5/§7；实现属 frontier `GOV-MEMBER-STATUS-DERIVE` / `GOV-RULES-LAYER`）
- 日期：2026-06-12
- 上下文：3-agent 产品核实对"把'让没事的人自己去找事做'后置给知识树（D-027）"判 holds=false——代码证明（attribution.ts:242-267 `relatedKnowledgeFor` 从 `[task.id, rootBlockerTaskId]` 取知识，`capacityFreed` 的人 `currentTaskId→null` 故**无任务键可取**，唯二 relatedKnowledge 生产者都 gated on 被卡）。后果：`capacityFreed` 的 3a（匀过载组）在无过载组时为空，3b（去学）后置给未建知识树 → `deriveMemberStatus` 一上线就把人**暴露成 idle 却零给予** = 破 **A3（系统给得比拿得多 = 观察资格来源，D-031 确立）**，freeIdle 污名换标签复活。另：原 `暴露→问责→化解` 三段漏了 D-031 的核心前提——多数 idle/silence 是**测量错误**（未录入/信号没接）。
- 决策（用户 2026-06-12："先不去干预[自我成长]"对一半——树后置对，给予地板不可后置）：
  1. **四段意图**：`修正测量(兜底) → 暴露 → 问责 → 化解`。化解叉 **3a 人力调度**（治理，匀过载组，captain，idle↔overload 闭环）/ **3b 自我成长**（知识树 D-027，**整棵后置**）。
  2. **第 4 段「修正测量」前置于化解**：`uncovered` 先走"去派活 = 录入入口"、`silence` 先查信号源新鲜度（D-034 分河），别在"未录入/信号没接"的假象上开火。
  3. **give-floor（不可后置的那块 3b）**：`capacityFreed` 的 3a 为空时，`relatedKnowledge` 从**本人私有** `MemberKnowledge`(relation∈{interested,learning} 的 `KnowledgeNode.resourceLinks`，growth.ts，fixtures.ts:292-295 已 seed) 平铺取，**仅 `taskOwnerPrivate`**（绝不给队长）——即"让他自己挑自己存的兴趣"，agency 留本人（A3），零树结构、不等 D-027 整棵树。`capacityFreed` 队长面 gate on (有过载组 OR cooldown)。
  4. **暴露必带给予不变式（可测）**：任何发第三方的 `capacityFreed`/`silence`(surface) **必须**配一条同主体 `taskOwnerPrivate`(give, `relatedKnowledge.length>0`)，像反排名一样守在单测里，结构上禁止"暴露 idle 却零给予"。
- 替代项（3b 整体后置给知识树）未采纳：审计证其在"做完又无过载组可去"分支破 A3、复活 freeIdle 污名；give-floor 是 tree-free、复用已 seed 的私有兴趣链，无须等 D-027。
- 影响：`gov-cue-layer.md` §4（capacityFreed give-floor + 空-3a 行为 + 修正测量段）/ §5（四段意图）/ §7（暴露必带给予不变式）同步。代码留 GOV-MEMBER-STATUS-DERIVE / GOV-RULES-LAYER 落（本 ADR 不改代码）。
- 事实源：本 ADR；`docs/design/gov-cue-layer.md` §4/§5/§7；`apps/hub-contracts/src/growth.ts`（MemberKnowledge）；`D-027`（成长轴/知识树后置）；`D-031`（A3 = 观察资格来源 + 测量错误命门）；`AGENTS.md §5`（A3/A4）。

