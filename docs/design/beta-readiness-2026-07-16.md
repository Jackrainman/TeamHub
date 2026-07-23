# 公测准备落点注记（BETA-READINESS，2026-07-16）

> 一轮四刀（K1 权限地基 `975ea45` / K2 身份体验 `ba48956` / K3 部署信息 `3e055f5` / K4 配置面还债
> `638c46a`，VERSION 0.23.3→0.24.2）+ 二轮两刀（K6 时钟与空板 `e698ffe` v0.24.3 / K8 名册导入
> `94cdfdf` v0.25.0），基线 `0c46d05`。均无独立设计稿在先——K1 真相 = `docs/planning/decisions.md`
> D-089；其余刀真相散在各自 commit message + 当轮 StructuredOutput。本文档补齐"架构裁决"这一层，按
> `baseline-design.md` §7 / `gate-checklist-iou.md` §7 / `task-post-claim.md` §9 同款回写格式先例。
> 一轮裁决见 §2，二轮裁决见 §5，两轮复审记录见 §4/§6。

## 1. 一句话定位

`MemberRole` 三档（superAdmin/groupAdmin/member）久已存在，但全库无路由能改它——挂单指派
`isGroupLeadOf` 恒 403、敏感设置零门槛。四刀 = 补上"能开公测但危险动作有锁、部署面貌能自证"这一层，
非新功能：K1 补写口+收口，K2 补前端可见性（不让人"点了才 403"），K3 补运维自省（这台到底怎么跑的），
K4 清配置文件的历史死账（幻影变量 + 漏挂卷）。

## 2. 四条架构裁决

### 2.1 匿名 = 演示态零门槛（双模式非对称）

K1 起新增的所有权限门（改角色 / 验收人名单维护 / 建赛季）**只在身份模式（`TEAMHUB_IDENTITY_MODE=identity`）
生效**；匿名模式维持"写门即可"的现状——不因为新增了 superAdmin 概念就把匿名模式也一并收紧。依据：
匿名模式的定位本就是"家庭影院级"演示态（与 `PUT gate-reviewer` v1 先例、`SetGateReviewer` 注释里
"写门即可"取舍同源），不是安全边界；真正需要拦截的场景（多人共享同一实例、需要问责）默认就该开身份模式。
两模式各自的鉴权语义因此不对称——**这是刻意裁决，非实现疏漏**。

### 2.2 敏感门只在身份模式生效（三条收口 + 降级保护）

身份模式下 `gate-reviewer` / `role` / `seasons` 三条写路由收口为须 `isSuperAdmin`（403）。三条门共用同一
鉴权基元 `authz.ts isSuperAdmin`（照 `isGateReviewer` 形状），服务端**读实时名册鉴权、不吃
`SessionIdentity` 快照**（快照只喂前端渲染角色态；改角色/名单后前端须重登才刷新——快照与鉴权源分离，
防"改了权限但当前会话还认为自己有权限"这类陈旧凭据问题）。降级保护统一挂在 `PUT /role`：目标是最后一个
`superAdmin` 且新角色非 `superAdmin` → 409，防止把全队锁死在无人能改角色的死局。

### 2.3 superAdmin 诞生 = setup 路由 + PIN 同笔

`POST /api/setup/super-admin`——身份模式 only（匿名 404），前置=名册尚无任何 `superAdmin`（否则 409）、
须已登录。效果=把登录本人升 `superAdmin` **且同笔设 `pinHash`**（先设 PIN 再升 role，非先升 role 再设
PIN）。裁决依据：反过来做会留一个时间窗口——若"升 role"先成功而"设 PIN"随后失败，名册上出现一个
"已是 superAdmin 但无 PIN"的账号，身份模式下无密码即可被冒名登录使用管理员权限；两步顺序对调后，"设 PIN
失败"直接短路、不会把裸管理员身份留在名册里。这就是用户"重要设置必须有密码"诉求的具体落点。

### 2.4 About 运行模式行退役 + deployment 回显字段口径

`GET /api/system/status` 原 `mode` 字段（`mock-first`/`real`/`hybrid`）恒为 `'mock-first'`——没有任何调用
方注入过其它值，About 页展示这行等于向用户宣称一个从未被验证过的"服务器模式"事实。K3 裁决：**About 页删除
该行**（schema `mode` 字段保留原样，向后兼容，只是不再是 console 展示的东西），改新增「部署信息」分区
展示**真实**能观测到的部署事实——`deployment`（optional 增量字段，旧客户端零影响）：
`identityMode` / `storage`（五域各自 `{domain, backend: file|sqlite|memory, path?}`）/ `enabledModules` /
`artifactUploadEnabled` / `buildId`。口径红线：**`deployment` 只回显"已经启动时就决定好、且本就不是密钥"
的配置事实**（走哪种 store、落哪个路径、开了哪些模块）——`TEAMHUB_WRITE_TOKEN` 等密钥类 env **绝不**
进这个字段，路径是"运维定位用的元信息"而非"能拼出攻击面"的秘密。内存态（无落盘 env）用琥珀警示
+「重启即丢」文案标出，不假装是安全的默认值。

## 3. 实现期偏离（自报，四刀合记）

- **K4 未触发版本号 bump**：K4 只改 `compose.yaml` / `deploy/teamhub.env.example` / `start-teamhub.sh` /
  `scripts/verify-hub-compose.sh`，均不在 `apps/hub-*/src` 下，`check-version-bump.sh` 的自动 bump
  反射不触发——VERSION 停在 K3 的 `0.24.2` 未变，符合 AGENTS §7"只有改 `apps/hub-*/src` 行为的 commit 才
  必须 bump"的字面规则，非漏 bump。
- **K2/K3/K4 无独立 ADR**：三刀均以 commit message + 交付时的 StructuredOutput 为真相，未像 K1 一样在
  `decisions.md` 开一条 D-09x。本文档不追加补 ADR（三刀是 K1 的直接延伸、非独立产品裁决），仅在此把
  裁决面集中回写一处，避免真相散在 commit message 里查无实据。
- **`GateReviewersSection` 更名 `MembersPermissionsSection` 未拆分文件**：K1 把"验收人名单"分区原地扩为
  "成员与权限"（角色下拉 + 验收人复选框 + 初始化管理员卡三块拼一个 section），未按职责拆成独立组件——
  与既有 `SettingsPage.tsx` 里其它多职责 section（如 `SeasonsSection`）同款密度，非本刀新增的坏模式。

## 4. 一轮复审留档（✅ 已由 K8 顺手收口）

> **收口注记（2026-07-16 二轮）**：下述 nit 已在 K8（`94cdfdf`）内顺手修掉——`SettingsPage.tsx` 引入
> `sectionPermission` 前置判，「成员与权限」/「赛季」分区在身份模式已登录但非 superAdmin 时写控件
> 禁用+提示，二轮复审逐文件核实确认已闭合。原文照录留档：

一轮 docs 收口者对四刀 diff 做了逐文件核实，发现一处真实但影响良性的"点了才 403"缺口，当轮记录在案
未修（docs 收口者角色不做代码改动）：

- **`SettingsPage.tsx` 的「成员与权限」区（角色下拉 + 验收人复选框）与「赛季」新建表单，前端未做
  `isSuperAdmin` 前置资格判**：K1 把这三处写路由在身份模式下收口为须 `isSuperAdmin`（见 §2.2），K2 随后
  专门给挂单池"指派"选人器、`TaskDetailDrawer` 的"跨组确认"/"验收"三处操作面补了前置资格判（本人无资格
  时按钮禁用 + title 说明，不隐藏、保可发现性），唯独没有把同一范式套到 K1 自己新增的这两处控件上——
  `MembersPermissionsSection`/`SeasonsSection` 的 `writeLocked` 只判断"是否已登录"（`!identity.canWrite`），
  未判断"是否为 `superAdmin`"。结果：身份模式下已登录但非管理员的成员打开设置页，角色下拉、验收人复选框、
  建赛季表单在界面上仍是可点状态，提交后才会撞服务端 403——这正是 K2 在别处刻意消灭的"点了才 403"模式，
  唯独漏了它本该最先覆盖的地方。**影响面**：良性，服务端鉴权本身正确（fail-closed），只是前端可发现性
  没达到 K2 同轮定的标准，不构成越权或数据风险。**建议后续刀**：给这两处补 `identity.session?.role ===
  'superAdmin'` 前置判（禁用 + title），复用 K2 已建立的 `pool.gate.*` / 前置判范式与既有
  `settings.members.role.error` / `settings.reviewers.error` 报错兜底，无需新增契约或路由改动。

## 5. 二轮两刀架构裁决（K6 时钟与空板 / K8 名册导入）

### 5.1 K6：`TEAMHUB_DEMO_SEED` 单开关派生"演示态/真实态"（`e698ffe`，v0.24.3）

空板走查（二轮前置）坐实两个真 bug：①服务端时钟全局冻结——`RealClock` 写了但全仓零调用，`main.ts`
建 store 与 `buildHubServer` 均不传 clock，恒回退 `FixedClock('2026-06-11T02:00:00.000Z')`，真实部署下
新建任务 `createdAt` 恒为 6/11，挂单池滞留判定（浏览器真时钟 − 服务端假时钟）第一秒就全标红；②
`TEAMHUB_DEMO_SEED=false` 关不干净——resources/resourceSessions/relayHandoffs 恒从
`scheduleScenarioFixture` seed，空板仍见两台虚构车+演示排班。

**裁决：演示态 = 冻结时钟 + 演示锚点，真实态 = 真实时钟 + 真空板，两者由 `TEAMHUB_DEMO_SEED` 一个
开关派生，不新增 env。** 依据：冻结时钟的存在理由就是让演示场景（固定锚点日）与截图/测试稳定复现，
它与演示种子是同一个"演示态"概念的两面，分成两个开关只会制造"真数据+假时钟"这类无意义组合。
`demoSeed=false` 时 `main.ts` 注入 `RealClock` 到全部 store 工厂与 server options，schedule 三块种子
清空；默认（演示态）行为零变化，既有测试与 health-check 不受影响。

### 5.2 K8：名册导入（`94cdfdf`，v0.25.0 minor）

用户拍板口径全落地：CSV 模板下载（`GET /api/roster/template`，UTF-8 带 BOM，五列=姓名/年级/组/组长/
验收人）→ 本地 Excel 编辑 → 设置页上传（`POST /api/roster/import`，multipart 1MB）→ 六段导入报告。
关键裁决：

- **编码探测**：UTF-8 BOM→UTF-8；无 BOM 先按 UTF-8 解、出现 U+FFFD 再按 gbk 重解（Windows Excel 存
  CSV 默认 GBK 的坑兜住）；都失败 400 提示"另存为 CSV UTF-8"。解析器手写零依赖，落 hub-contracts
  `roster-import.ts`（纯函数可单测）。
- **幂等键 = displayName**：重导=更新（grade/groupId/role/gateReviewer），"每年重导一次新表"即换届
  动作。**保护例外**：目标现为 superAdmin 时 role 不动、pinHash 永不动（防导入把管理员降级/清密码）。
  表外人员只进 missingFromSheet 报告绝不删（名下可能挂历史任务）。同名两人会合并为一条（见 §6 nit②，
  已知限制）。
- **规则默认**：验收人列留空 → 大三及以上（junior/senior/graduate）自动 true；组长列真值 → groupAdmin；
  superAdmin 永不从表来。未知组名自动建组（grp-new-N）并进报告——错字导致的多余组在报告里一眼可见。
- **引导豁免（bootstrap）解空板死锁**：身份模式下名册完全为空时，导入路由豁免登录要求（Bearer token
  与限流仍在）；一旦有人即恢复须 superAdmin。由此首启动顺序成立：起服→下载模板→导名册（免登录）→
  登录本人（首次免 PIN）→初始化管理员设 PIN。豁免窗口的暴露面取舍见 §6 nit①。

## 6. 二轮复审留档（K1..K8 全 diff，0 blocker / 4 nit）

二轮复审对 `0c46d05..94cdfdf` 六刀全 diff 逐文件核实 + 三包 verify:all 复跑全绿（contracts 284 /
server 379 / console 163）。红线全数坐实：匿名模式敏感门全部 identity 前置、pinHash 无泄漏
（MemberPublicSchema omit）、deployment 排除 writeToken、导入报告无按人聚合。**流程事故如实留档**：
一轮复审 agent 交付占位垃圾输出（`summary:"test"`）被作废；二轮复审 agent 内容完备但 StructuredOutput
反复格式失败超重试上限，结论从其 transcript 人工提取核对后采信——两次都说明"复审产出必须逐字检查"
这条教训。四条 nit（均为已文档化取舍或低概率边界，留档不阻塞公测）：

1. **引导豁免窗口的暴露组合**（`server.ts` roster import bootstrap）：身份模式 + 非 loopback + 未配
   `TEAMHUB_WRITE_TOKEN`（identity 模式豁免了启动强制）+ 名册为空时，任意可达者可无鉴权导名册→免 PIN
   登录→抢先 setup 当管理员。属可信 LAN 引导取舍，非代码缺陷；缓解=暴露到非 loopback 前先完成名册导入
   +初始化管理员（RUNBOOK §1.6 已写入），或引导期保持 loopback/配 token。
2. **同名合并**（幂等键=displayName）：两个真人同名时第二行覆写第一行、库里只存一条，且同时进
   created 与 updated 报告，操作者可能误以为两人都导入成功。已知限制；若成真痛点，后续加可选学号列
   作幂等键。
3. **末位 superAdmin 降级保护 TOCTOU**（`PUT /role`）：先读快照判"至多 1 个管理员"再写，两个并发降级
   请求可各自看到 2 个管理员、双双放行、终态归 0 全队锁死。小团队并发概率极低但代价是永久锁死；后续
   刀可把判定收进 store 同一临界区（setMemberRole 带 guard）。
4. **deployment.storage.path 回显宿主绝对路径**：`GET /api/system/status` 读端点可读，任意可达者可知
   目录布局。§2.4 已裁"路径=运维元信息可接受"，与该裁决一致、知情记录；要收紧可只回 basename 或仅
   superAdmin 会话返回全路径。

> **收口注记（2026-07-23，公测余项轮）**：
> - **nit③ 已修**（v0.27.0）：降级保护判定收进 `setMemberRole` 同一临界区（`guardLastSuperAdmin`，
>   mock/file/sqlite 三实现同语义，sqlite 走事务），路由层不再先读后写，并发双降级无法放行。
> - **余项⑦ 已落地**（v0.27.0）：`DELETE /api/members/:id/pin`（身份 only + 须 superAdmin）+
>   设置页「成员与权限」重置入口；只清 pinHash 不经手新明文，成员回免 PIN 态经 firstSetup 自设。
>   DEPLOY §7.1 已改产品通道优先、手工步骤降为兜底。
> - nit① 维持原裁（可信 LAN 引导取舍，RUNBOOK §1.6 缓解已足）；nit② 维持"若成真痛点再加学号列"
>   （公测未发生同名冲突前不动幂等键）；nit④ 维持 §2.4 知情裁决（路径=运维元信息可接受）。
