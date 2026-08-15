---
kind: archive-milestones
status: canonical
truth_for: historical-milestones
last_reviewed: 2026-08-15
---

# 产品与架构里程碑

这里只记录阶段变化，不记录逐功能完成流水。详细原稿按 `source_sha` 与 `original_path` 从 Git 恢复。

<a id="arc-mile-001"></a>
## ARC-MILE-001 ProbeFlash 初始阶段

- 时间：2026-04-20 至 2026-04-26。
- 背景：项目从机器人排障课设起步，以 IssueCard、InvestigationRecord 和 closeout 形成个人本地闭环。
- 结果：建立 TypeScript/Zod 数据契约、录入、调查、结案和本地持久化；产品仍是单机排障工具，不是团队中枢。
- 后继：v0.2 引入服务端与共享数据设想，最终由 TeamHub 知识库继承排障闭环。
- original_path: `docs/archive/v0.2-closeout/**`
- source_sha: e0761d1c25c2f13306ef55e8afdaea9c4d12ec43

<a id="arc-mile-002"></a>
## ARC-MILE-002 ProbeFlash v0.2 收口

- 时间：2026-04-26。
- 背景：为 S3 服务端同步准备 API、SQLite schema 与服务不可达策略。
- 结果：形成早期共享服务设计，但其接口、表结构和离线假设均已被后来实现取代。
- 后继：v0.3 转向更完整的桌面端与集成能力；当前数据真相以 D-090 为准。
- original_path: `docs/archive/v0.2-closeout/README.md`
- source_sha: e0761d1c25c2f13306ef55e8afdaea9c4d12ec43

<a id="arc-mile-003"></a>
## ARC-MILE-003 ProbeFlash v0.3 与退役

- 时间：2026-05-01 至 2026-06-09。
- 背景：v0.3 尝试 Skill/Bridge/Trail 三 facet、桌面端、混合存储和飞书接入。
- 结果：v0.3 于 2026-05-01 发布；5 月 pivot 后代码在 2026-06-09 退役，只保留领域模型、离线纪律、验证纪律和部署经验。
- 后继：可复用的排障知识进入 TeamHub KB；旧桌面端和三 facet 不再是现行产品结构。
- original_path: `docs/archive/v0.3-pivot/**`, `docs/archive/v0.3-closeout/**`
- source_sha: e0761d1c25c2f13306ef55e8afdaea9c4d12ec43

<a id="arc-mile-004"></a>
## ARC-MILE-004 TeamHub 方向确立

- 时间：2026-06-09 至 2026-06-13。
- 背景：单一排障工具不足以解决战队知识断层、项目失控和物料不清。
- 结果：产品转为机器人战队协作中枢；AI 从治理判断退出，定位为仓管、检索和转译者。
- 后继：I0、C1–C5、反监视和 AI 边界成为所有功能上位约束。
- original_path: `docs/archive/team-hub-product-definition-v0.md`, `docs/archive/three-pillar-reqdesign.md`
- source_sha: e0761d1c25c2f13306ef55e8afdaea9c4d12ec43

<a id="arc-mile-005"></a>
## ARC-MILE-005 三支柱落地

- 时间：2026-06-13 至 2026-06-19。
- 背景：TeamHub 需要围绕自然上游构建最小可用业务闭环。
- 结果：知识库、项目管理看板、库存-BOM 成为三支柱；排班、资源、档案等能力围绕它们扩展。
- 后继：三支柱仍是产品稳定骨架，具体领域事实已迁入对应 canonical 文档。
- original_path: `docs/archive/three-pillar-feasibility.md`, `docs/archive/three-pillar-reqdesign.md`
- source_sha: e0761d1c25c2f13306ef55e8afdaea9c4d12ec43

<a id="arc-mile-006"></a>
## ARC-MILE-006 Harness 与文档三次减负

- 时间：2026-06-11、2026-06-18、2026-06-19，后续 2026-07-25 再清理。
- 背景：活文档、决策账本、状态日志、skills 和归档不断增长，Agent 每轮被历史上下文淹没。
- 结果：D-030 清计划与双写，D-070 将 Harness 收成轻量单源，D-073 推行活账本；这些措施只搬运历史、未限制新增类型，文档随后再次反弹。
- 后继：DOC-01/02 把 archive 蒸馏为五份，并由结构门限制活文档与档案增长。
- original_path: `docs/archive/pre-slim/**`, `docs/archive/decisions-full-2026-07-26.md`
- source_sha: e0761d1c25c2f13306ef55e8afdaea9c4d12ec43

<a id="arc-mile-007"></a>
## ARC-MILE-007 D-083 产品重定义

- 时间：2026-07-11。
- 背景：真实 Robocon 经验暴露期末真空、依赖链卡死、验证过晚和核心成员燃尽。
- 结果：确立开源与“防爆肝”双主轴，强调提前暴露结构缺口、验证门和小作坊低摩擦。
- 后继：当前产品定位与不变式由 `docs/design/product.md` 承载。
- original_path: `docs/archive/decisions-full-2026-07-26.md` D-083
- source_sha: e0761d1c25c2f13306ef55e8afdaea9c4d12ec43

<a id="arc-mile-008"></a>
## ARC-MILE-008 D-090 软件架构统一

- 时间：2026-08-15。
- 背景：技术栈本身一致，但六包/多 lock、多 Store、多配置源、god contracts 和跨域 route 令修改路径失去唯一性。
- 结果：确定单 workspace、单生产 SQLite、同构领域模块、application service 与显式事务的目标；不保留旧数据兼容层。
- 后继：`docs/design/software-architecture.md` 是唯一当前架构真相，迁移优先于功能增长。
- original_path: `docs/design/software-architecture.md`, `.harness/decisions.md` D-090
- source_sha: e0761d1c25c2f13306ef55e8afdaea9c4d12ec43
