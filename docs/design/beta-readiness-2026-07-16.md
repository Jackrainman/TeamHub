# 公测准备四刀落点注记（BETA-READINESS，2026-07-16）

> 四刀（K1 权限地基 `975ea45` / K2 身份体验 `ba48956` / K3 部署信息 `3e055f5` / K4 配置面还债 `638c46a`，
> VERSION 0.23.3→0.24.2）已落地并 push（基线 `0c46d05`）。四刀均无独立设计稿在先——K1 真相 =
> `docs/planning/decisions.md` D-089；K2/K3/K4 真相散在各自 commit message + 当轮 StructuredOutput。
> 本文档补齐"架构裁决"这一层，按 `baseline-design.md` §7 / `gate-checklist-iou.md` §7 /
> `task-post-claim.md` §9 同款回写格式先例，把四刀已经做出但未落文档的裁决与偏离收拢一处。

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

## 4. 复审留档（本刀未修的 nit）

复审对四刀 diff 做了逐文件核实，发现一处真实但影响良性的"点了才 403"缺口，记录在案、本轮不修（docs
收口者角色不做代码改动）：

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
