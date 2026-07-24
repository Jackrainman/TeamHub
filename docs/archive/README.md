# Archive

> 历史归档目录。**默认不读**——AI / Agent 仅在历史追溯命中时按需读取(AGENTS.md §2)。

## 子目录

- `v0.3-pivot/`:v0.3.0 退役时(D-018)固化的 planning 快照(`now.md` / `backlog.md` / `roadmap.md` / `decisions.md`)与 v0.3 时代产品定义(`product/产品介绍.md` + `product/diagrams/`,含 S3 架构 / SQLite ER / 验收流程等图)。pre-pivot 候选池、阶段判断、长期 ADR 与产品口径的最后一份完整副本。
- `pre-slim/`:planning 文档瘦身(2026-05-17)前的版本(`backlog.md.preslim` / `decisions.md.preslim` / `AGENTS.md.preslim` 等),含瘦身前的状态表与冗余可视化材料。**§9-§18 的 sandbox 设计史只在 `pre-slim/status.md` 里完整保存**。
- `v0.2-closeout/`:v0.2 时代 S3 API 契约、SQLite schema 草稿、server-unreachable 策略等设计文档。被 v0.3 实施替代后归档。
- `v0.3-closeout/`:v0.3.0 代码(`apps/server` / `apps/desktop`)于 2026-06-09 D-026 删除前固化的精华 `PROBEFLASH-V03-ESSENCE.md`(领域模型 / 混合存储 / 离线纪律 / verify 纪律 / 部署经验)与 `probeflash.service.template`(systemd 模板)。完整代码留在 git 历史。
- `lark-research/`:两份飞书开放平台调研大文档(gemini,~69KB),D-020 原始研究输入;继任者是 `docs/research/lark-api-capability.md`(蒸馏版,唯一工程事实源)。详见该目录 README。
- `reviews/`:历史 review 报告(如 `2026-05-17-se-review.md`,飞书 SDK / Hono / Quartz / monorepo 等 10 条建议)。
- `audits/`:已执行完毕的审计 / 体检报告(DOCS-SLIM ④,2026-07-24 归档)——`code-audit-2026-06-14.md`(15-agent 对抗审计,confirmed 42,修复已全清)、`rot-audit-2026-07-12.md`、`arch-checkup-2026-07-15.md`(阶段0体检门)、`oop-quality-roadmap-2026-06-21.md` + `-plain-zh.md`(四批次已落地)。

## 平级散文件(部分)

- `three-pillar-feasibility.md` / `three-pillar-reqdesign.md`:D-040/D-042 三支柱分析记录,构建已完成后归档(2026-07-24)。
- `team-hub-stack-decision.md`(D-025)、`D-023-skill-protocol-v1.md`、`ia-refactor-next-prompts.md`(IA 重构阶段 2-4 spec,已执行)、`aurash-restyle-assessment.md`(D-060,已被 D-084 superseded)、`dogfood-readme.md`(SKILL-02 流程,从未运转):同批归档(2026-07-24)。
- `superpowers-specs-readme.md`:`docs/superpowers/` 退役前的 spec 目录说明(2026-07-24)。

## 读取触发条件

- 命中 v0.2.0 之前的代码 / schema / 部署历史时
- 需要追溯某条 ADR 的废弃原因(active `decisions.md` 仅保留生效项)
- 需要回看瘦身前的完整 planning 表述
- 用户明确要求"看 archive"或"看历史"

## 不应该做的事

- 不要把 archive 当作 active 事实源使用
- 不要在 archive 文件之间互相新建引用(它是单向"被引用"的)
- 不要修改 archive 文件(致命补丁除外);新动作请落到 active 路径
