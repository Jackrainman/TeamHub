---
kind: archive-deferred
status: canonical
truth_for: explicitly-deferred-designs
last_reviewed: 2026-08-15
---

# 明确挂起的设计

只有“仍可能复活且有明确触发条件”的方案进入本文件。触发条件未满足时，不得据此实现。

<a id="arc-def-001"></a>
## ARC-DEF-001 治理派生簇 D-032 至 D-035

- 挂起内容：GovernanceCue、成员状态派生、受众路由、静默信号、按组数据河、give-floor 与治理提示层。
- 为什么暂缓：D-039 明确让 AI 退出治理判断；该簇容易把数据缺失误判为个人问题，并产生监视、能力比较和向下问责。
- 当前替代：AI 只做整理、检索、算量和起草；系统暴露任务/组/资源缺口，不产出人员治理结论。
- 复活触发：用户重新明确拍板“允许 AI 参与治理判断”，并逐项重审 I0、C2、反监视、k-anonymity、受众路由和测量误差。
- 禁止照搬：不得恢复按人 idle/silence 排名、第三方人员明细、无自然上游的状态推断，或把旧 thresholds 当现行配置。
- original_path: `docs/archive/governance-suspended-decisions.md`, `docs/archive/suspended-specs/**`
- source_sha: e0761d1c25c2f13306ef55e8afdaea9c4d12ec43

<a id="arc-def-002"></a>
## ARC-DEF-002 飞书深度集成与 Hermes 渠道

- 挂起内容：群消息事件、长连接 gateway、卡片交互、私聊推送、CLI 和飞书数据源。
- 为什么暂缓：真实企业权限、消息历史范围、管理员审批和渠道稳定性未成为当前三支柱的自然上游；旧三包也未接入主运行链。
- 当前替代：TeamHub Web/HTTP 是产品真相；集成只保留契约边界，不把飞书当数据库或治理拍板者。
- 复活触发：明确一个必须依赖飞书的用户闭环，取得相应租户权限，并确认主程序中的单一 integration 入口与维护责任。
- 禁止照搬：旧调研中的价格、额度和平台能力可能过期，复活时必须重新查官方资料；不得直接恢复三个独立包。
- original_path: `docs/archive/lark-research/**`, `docs/archive/pre-pivot-plans/2026-05-16-lark-gateway.md`, `docs/archive/pre-pivot-plans/2026-05-21-lark-cli-integration.md`
- source_sha: e0761d1c25c2f13306ef55e8afdaea9c4d12ec43

<a id="arc-def-003"></a>
## ARC-DEF-003 广义“谁去学”与人员匹配

- 挂起内容：AI 根据能力、兴趣或任务缺口给管理者排序、推荐具体成员，或统计个人学习/出勤表现。
- 为什么暂缓：它把结构缺口转换成人员比较，直接触发 I0、C2 和反监视边界，也属于 AI 替管理者拍板。
- 当前替代：知识点与任务/缺口建立结构关联；本人可以私下看到与自己兴趣相关的内容，人员分配由人决定。
- 复活触发：用户明确重开 D-039，并先设计不可重建个人产能、只回本人及人工确认的安全模型。
- 禁止照搬：不得向队长提供候选人排名、匹配分数、个人出勤次数或跨时间画像。
- original_path: `docs/archive/decisions-full-2026-07-26.md` D-069
- source_sha: e0761d1c25c2f13306ef55e8afdaea9c4d12ec43

<a id="arc-def-004"></a>
## ARC-DEF-004 动态插件运行时

- 挂起内容：仓外插件发现、插件 manifest、运行时启停和任意第三方模块装载。
- 为什么暂缓：TeamHub 仍处于统一内部模块边界阶段，动态扩展会提前引入兼容、权限、迁移和版本治理负担。
- 当前替代：共享 `ModuleId` 的静态 registry；Robocon 作为受控 vertical 配置，不作为任意代码插件。
- 复活触发：出现至少一个由独立维护者交付、不能随主仓编译发布的真实模块，并能定义稳定权限和兼容契约。
- 禁止照搬：不能把目录拆分或 feature flag 称为插件系统，也不能把旧 CASE base 提案直接当现行模块设计。
- original_path: `docs/archive/core-plugin-architecture.md`, `docs/archive/team-hub-stack-decision.md`
- source_sha: e0761d1c25c2f13306ef55e8afdaea9c4d12ec43

<a id="arc-def-004"></a>
## ARC-DEF-004 TOTP 二因子认证（2FA）

- 挂起内容：登录第二因子 = 手机认证器 TOTP 动态码（每成员一份 base32 密钥落库，node:crypto 手搓 HMAC-SHA1 不引依赖；绑定时展示 otpauth:// 密钥文本；可选绑定或全员强制两档；丢手机由 superAdmin 重置）。
- 为什么暂缓：现有防线（≥8 位密码 + scrypt 散列 + 登录连错 5 次锁 5 分钟 + 统一 401 防枚举 + 读闸）已使在线暴破在事实上不可行；TOTP 的边际收益只在「密码已泄露/跨站复用」场景，而 C3 小作坊轻量约束下多一步登录摩擦与恢复流程成本不低。2026-09-05 用户拍板 defer。
- 当前替代：D-092（读闸 + 首登强制设密码 + 登录锁定）+ D-093（旧短 PIN 强制升级 ≥8 位）。
- 复活触发：① 发生或疑似发生密码泄露/冒用事件；② 部署暴露面扩大（更多队员/更宽网络入口）；③ 队员规模或敏感数据量显著增长，用户重新拍板。实现时优先「可选绑定」档，评估成熟后再议强制。
- 禁止照搬：不得引入重型认证框架（D-092 已拍板维持自建）；不得用短信/邮箱验证码替代 TOTP（无邮箱注册、短信成本高且更弱）。
  - source_sha: d73628d4d402365e8631a60992d117f2c7d29610（拍板对话落 D-093 前的 HEAD；本无独立原稿，决策上下文在 .harness/decisions.md D-093）
