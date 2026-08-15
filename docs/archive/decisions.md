---
kind: archive-decisions
status: canonical
truth_for: superseded-decisions
last_reviewed: 2026-08-15
---

# 被取代的关键决策

只收录可能再次被提出、且需要理解“为什么不能直接恢复”的决策。仍生效的决策只在 `.harness/decisions.md`。

<a id="arc-dec-001"></a>
## ARC-DEC-001 飞书拆为 gateway、toolkit、pf-skills 三包

- 当时选择：把长连接网关、通用 CLI 工具和技能层分别做成独立小包，便于 ProbeFlash 阶段并行试验。
- 被取代原因：三包长期未被 TeamHub 主程序引用，根 workspace、版本和 lock 也未覆盖它们，形成漂移的第二套仓库拓扑。
- 保留教训：集成边界可以独立，但必须有真实运行入口、统一契约和仓库生命周期；不能以“以后可能用”维持三个源码岛。
- 当前替代：D-090 下若确认需要飞书，只建一个 `integrations/lark` 边界；否则删除旧包，完整实现从 Git 恢复。
- original_path: `docs/archive/pre-pivot-plans/2026-05-16-lark-gateway.md`, `docs/archive/pre-pivot-plans/2026-05-21-lark-cli-integration-design.md`
- source_sha: e0761d1c25c2f13306ef55e8afdaea9c4d12ec43

<a id="arc-dec-002"></a>
## ARC-DEC-002 动态插件化与 CASE base

- 当时选择：把底座、功能模块与 Robocon 垂直包做成插件体系，尝试动态装配不同产品形态。
- 被取代原因：当前规模下动态发现、插件生命周期和跨插件契约增加的复杂度高于收益；实施只完成部分静态拆分，继续宣称“插件化”会掩盖耦合。
- 保留教训：模块化解决依赖方向与职责边界，插件化解决第三方运行时扩展，两者不能混称。
- 当前替代：固定 `ModuleId` registry、三包同构目录和静态组合根；只有出现仓外第三方模块加载需求时才重审插件运行时。
- original_path: `docs/archive/core-plugin-architecture.md`, `docs/archive/team-hub-stack-decision.md`
- source_sha: e0761d1c25c2f13306ef55e8afdaea9c4d12ec43

<a id="arc-dec-003"></a>
## ARC-DEC-003 InMemory、File、分域 SQLite 并存

- 当时选择：InMemory 作为逻辑主体，File decorator 快速持久化，SQLite 独立实现；不同领域可按部署条件选后端。
- 被取代原因：每个行为需在多实现同步，生产可走不同语义路径；跨域写缺乏共同事务，环境变量和配置文件共同决定运行事实。
- 保留教训：测试 fake 与生产 repository 必须物理隔离；共用一个数据库文件不自动产生 application transaction。
- 当前替代：生产只保留统一 SQLite repository，fake 进入 `test/support`，跨域写由 application service 和显式事务编排。
- original_path: `docs/archive/v0.3-closeout/PROBEFLASH-V03-ESSENCE.md`, `docs/archive/v0.2-closeout/s3-sqlite-schema-draft.md`
- source_sha: e0761d1c25c2f13306ef55e8afdaea9c4d12ec43

<a id="arc-dec-004"></a>
## ARC-DEC-004 重型 Harness 与多份 skill 真相

- 当时选择：用 planning、handoff、agent-state、自迭代外环和多份 skill 镜像驱动无人值守执行。
- 被取代原因：状态与规则多处同步，hook 未真正接入，镜像 skill 漂移；维护 Harness 的成本超过业务开发。
- 保留教训：自动化必须有可执行的唯一入口，状态不能用多份 Markdown/JSON 互相复述。
- 当前替代：根 `AGENTS.md` + `.harness/todo.json`、`.harness/decisions.md`、`.harness/ai-log.md`；普通实施过程交给 commit。
- original_path: `docs/archive/pre-slim/skills/**`, `docs/archive/pre-slim/agent-state/handoff.json`, `docs/archive/D-023-skill-protocol-v1.md`
- source_sha: e0761d1c25c2f13306ef55e8afdaea9c4d12ec43

<a id="arc-dec-005"></a>
## ARC-DEC-005 IA 组合页与视觉重构路线

- 当时选择：通过 Fleet 等组合页复用旧 Page，再按阶段搬导航和页面；同时尝试 Aurash 风格和多轮视觉升级。
- 被取代原因：组合页面缓解导航数量，却没有形成 feature API、hooks 和领域边界；跨 feature 直接导入 Page 被固化为新耦合。
- 保留教训：视觉合并、文件拆分和领域模块化是三件事，不能用“页面看起来合并了”宣告架构完成。
- 当前替代：console 一域一个 feature/API segment，本域 hooks，跨域只走 shared 或窄接口；视觉规范归 `design-system.md`。
- original_path: `docs/archive/ia-refactor-next-prompts.md`, `docs/archive/aurash-restyle-assessment.md`
- source_sha: e0761d1c25c2f13306ef55e8afdaea9c4d12ec43
