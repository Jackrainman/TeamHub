---
kind: canonical-domain
status: active
domain: system
truth_for: setup-identity-members-groups-settings
last_reviewed: 2026-08-15
---

# System 领域

## 1. 职责与边界

System 管首启动、部署模式、会话、成员、组织树、项目管理权限、名册导入和设置页。它提供平台身份与产品配置，不拥有 PM、库存或知识库业务规则。

## 2. 当前行为（CURRENT）

- SQLite `app_settings` 单例保存数据模式、身份模式、垂直包、启用模块和初始化时间；无设置时只启动 setup 路由和静态页。
- 首启动可选择演示/真实与匿名/身份，写入配置后以 exit code 42 请求包装脚本重启。
- 身份模式有 session、成员 PIN、项目管理旗标和组长角色；匿名模式使用共享写门。
- 登录 = 自输用户名（名册 displayName，全名册唯一）+ 密码；下拉选人与「未登录读名册」已退役（D-093），BootstrapGate 判定走 /api/setup/state 的 hasPmMember。旧 <8 位 PIN 登录后强制重设。
- 初始化门依次完成操作者、名册、组长、赛季、库存和知识库等步骤；部分步骤允许跳过。
- 名册支持模板、预览、编辑后导入；叶子组是任务和成员归属候选。
- 设置页可查看部署信息、切换身份模式、结束试驾、管理成员/组和飞书配置。

## 3. 目标结构（TARGET）

- `app_settings` repository/service 已接管产品配置；后续随 system 模块迁移调整物理目录，不再增加配置来源。
- 环境变量仅保留 host、port、数据库路径、反代和秘密等启动属性。
- system 模块提供窄的 `ActorContext`、`SettingsPort`、`MembershipPort`，其他领域不读取完整治理 Store。
- setup、identity、membership、settings 可以在 system 内分 application service，但对外仍是一个领域模块。

## 4. 领域不变式

- 项目管理权限只控制敏感写操作，不授予个人产能视图。
- PIN 明文只接收一次，散列不进入响应、日志和文档。
- 初始化和 PIN 恢复必须先守 loopback/写门边界，再开放到非 loopback。
- 有子组的组是汇报节点，不是成员/任务分配候选；叶子组是可分配单元。
- 匿名和身份模式切换不得删除业务数据。

## 5. 跨域接口

- 向所有领域提供当前 actor、是否项目管理员、是否组长、是否验收人等授权判定。
- 向 PM、resources、baseline 提供 season/project/group/member 的只读引用。
- setup 可调用各领域的初始化 use case，但不能直接编排各自 repository。
- deployment status 对 operations 提供 buildId、版本、配置和存储状态等非秘密事实。

## 6. 已知陷阱

- `app_settings` 坏行、旧 schema 或有业务数据但无设置时会 fail-closed；不得用默认值绕过 unclaimed 状态。
- demo→real 在同一 SQLite 事务清空业务事实；artifact 物理文件不在事务内，操作前必须另行备份。
- system 仍通过 god `GovStore` 感知多域结构，需在模块迁移中收窄为 port。
- loopback 初始化/恢复是宿主操作员能力，不得相信可伪造的转发头。

## 7. 未落地差异与 TODO

- `ARCH-UNIFY`：继续建立 Actor/Clock/事务 port，并把 system 从 god Store 拆成 application services。
- 身份模式是否长期保留双模式不在 D-090 中重新拍板；迁移先保持当前产品行为。
