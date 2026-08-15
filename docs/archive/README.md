---
kind: archive-index
status: canonical
truth_for: historical-recovery
last_reviewed: 2026-08-15
---

# TeamHub 历史档案索引

这里不是旧文档堆放区，而是设计与执行发生异常时使用的诊断索引。当前产品事实只认 `docs/README.md` 登记的活文档；本目录只保留五份 Markdown，禁止新增第六份。

## 快照与恢复

- `legacy_snapshot`: `e0761d1c25c2f13306ef55e8afdaea9c4d12ec43`
- 快照日期：2026-08-15
- 含义：DOC-01/02 清理前，旧 `docs/archive/**` 与当时活文档的完整仓库状态。

恢复指定原稿：

```bash
git show e0761d1c25c2f13306ef55e8afdaea9c4d12ec43:docs/archive/<原路径>
```

查找忘记名称的原稿：

```bash
git ls-tree -r --name-only e0761d1c25c2f13306ef55e8afdaea9c4d12ec43 docs/archive
```

活文档清理前的完整目录也可用同一 SHA 检索。恢复只用于理解历史，不能把旧稿直接复制回活目录；应先确认当前不变式及 D-090，再蒸馏仍成立的结论。

## 定向检索协议

1. 先读当前产品、架构或领域文档，确认当前规则。
2. 按下表的触发关键词找到稳定 ID，只读命中的一个条目。
3. 条目不足以解释问题时，再用 `source_sha` 和 `original_path` 执行 `git show`。
4. 诊断或设计结论注明命中的稳定 ID。
5. 若旧坑已有防线，先解释防线为何失效，再提出修改。

禁止无目的遍历 archive，也禁止把 archive 当当前事实源。

## 检索索引

| 稳定 ID | 主题与触发关键词 | 精简记录 | 原始路径 | 当前替代 |
|---|---|---|---|---|
| ARC-MILE-001 | ProbeFlash、早期产品、本地票据、调试卡 | [里程碑](milestones.md#arc-mile-001) | `v0.2-closeout/**`、`pre-slim/product-roadmap.md` | `docs/design/product.md` |
| ARC-MILE-002 | v0.2、S3、旧 API、旧 SQLite 草案 | [里程碑](milestones.md#arc-mile-002) | `v0.2-closeout/**` | D-090 与当前 contracts |
| ARC-MILE-003 | v0.3、Skill/Bridge/Trail、旧桌面端 | [里程碑](milestones.md#arc-mile-003) | `v0.3-pivot/**`、`v0.3-closeout/**` | TeamHub 三支柱 |
| ARC-MILE-004 | pivot、TeamHub 转向、AI 退出治理 | [里程碑](milestones.md#arc-mile-004) | `team-hub-product-definition-v0.md`、`three-pillar-*.md` | `docs/design/product.md` |
| ARC-MILE-005 | 三支柱、KB、PM、库存 | [里程碑](milestones.md#arc-mile-005) | `three-pillar-feasibility.md`、`three-pillar-reqdesign.md` | 各领域活文档 |
| ARC-MILE-006 | D-030、D-070、D-073、文档膨胀、Harness | [里程碑](milestones.md#arc-mile-006) 与 [事故](incidents.md#arc-inc-007) | `pre-slim/**`、`completed-log.md`、`decisions-full-2026-07-26.md` | 当前文档治理门 |
| ARC-MILE-007 | D-083、防爆肝、开源、产品重定义 | [里程碑](milestones.md#arc-mile-007) | `decisions-full-2026-07-26.md` | `docs/design/product.md` |
| ARC-MILE-008 | D-090、架构统一、单运行栈 | [里程碑](milestones.md#arc-mile-008) | 清理前活文档及 `.harness/decisions.md` | `docs/design/software-architecture.md` |
| ARC-DEC-001 | 飞书三包、gateway、toolkit、pf-skills、CLI | [历史决策](decisions.md#arc-dec-001) | `pre-pivot-plans/2026-05-*-lark-*.md`、`lark-research/**` | 单一 integration 边界；是否保留由 D-090 迁移裁决 |
| ARC-DEC-002 | plugin、插件化、CASE base、垂直包 | [历史决策](decisions.md#arc-dec-002) | `core-plugin-architecture.md`、`team-hub-stack-decision.md` | ModuleId + 同构模块模板 |
| ARC-DEC-003 | 多 Store、JSON、File、InMemory、gov-only SQLite | [历史决策](decisions.md#arc-dec-003) | `v0.3-closeout/PROBEFLASH-V03-ESSENCE.md`、`v0.2-closeout/s3-sqlite-schema-draft.md` | 生产统一 SQLite |
| ARC-DEC-004 | 旧 Harness、自迭代、skills、handoff | [历史决策](decisions.md#arc-dec-004) | `pre-slim/skills/**`、`pre-slim/agent-state/**`、`D-023-skill-protocol-v1.md` | 根 AGENTS + `.harness` 三文件 |
| ARC-DEC-005 | IA、导航、组合页、旧 UI 方案 | [历史决策](decisions.md#arc-dec-005) | `ia-refactor-next-prompts.md`、`aurash-restyle-assessment.md` | 当前模块化 console 目标 |
| ARC-INC-001 | H1、依赖环、死循环、DoS | [事故](incidents.md#arc-inc-001) | `audits/code-audit-2026-06-14.md` | DAG 双层校验 |
| ARC-INC-002 | H2、写链中毒、静默丢数据、File Store | [事故](incidents.md#arc-inc-002) | `audits/code-audit-2026-06-14.md` | 可恢复写链；D-090 淘汰 File Store |
| ARC-INC-003 | H3、未鉴权、0.0.0.0、写端点 | [事故](incidents.md#arc-inc-003) | `audits/code-audit-2026-06-14.md` | 写门、actor/authz helper |
| ARC-INC-004 | H4、字段注入、statusSource、C5 | [事故](incidents.md#arc-inc-004) | `audits/code-audit-2026-06-14.md` | request schema 剥服务端字段 |
| ARC-INC-005 | H5、幻影 Postgres、compose | [事故](incidents.md#arc-inc-005) | `audits/code-audit-2026-06-14.md` | 运行栈只声明真实依赖 |
| ARC-INC-006 | 版本号、lock 漂移、多 package | [事故](incidents.md#arc-inc-006) | `known-bugs-fixed.md`、`audits/rot-audit-2026-07-12.md` | 单 workspace/lock/VERSION 目标 |
| ARC-INC-007 | 文档反弹、archive 堆积、上下文污染 | [事故](incidents.md#arc-inc-007) | `pre-slim/**`、`decisions-full-2026-07-26.md` | 五档案白名单 + 活文档登记门 |
| ARC-DEF-001 | D-032~D-035、GovernanceCue、治理 AI | [挂起方案](deferred.md#arc-def-001) | `governance-suspended-decisions.md`、`suspended-specs/**` | 当前 AI 只转译、不拍板 |
| ARC-DEF-002 | 飞书深度接入、群消息、Hermes | [挂起方案](deferred.md#arc-def-002) | `lark-research/**`、`pre-pivot-plans/*lark*` | `docs/domains/integrations.md` |
| ARC-DEF-003 | 广义“谁去学”、人员匹配、能力排序 | [挂起方案](deferred.md#arc-def-003) | `decisions-full-2026-07-26.md` D-069 | I0 与反监视边界 |
| ARC-DEF-004 | 旧插件运行时、动态插件发现 | [挂起方案](deferred.md#arc-def-004) | `core-plugin-architecture.md` | 静态 ModuleId registry |

## 归档写入规则

只在以下事件发生时更新已有文件：

| 事件 | 落点 |
|---|---|
| 当前 ADR 被推翻或取代 | `decisions.md` |
| 产品或架构阶段正式结束 | `milestones.md` |
| 出现可跨任务复用的严重故障 | `incidents.md` |
| 方案明确暂缓且具备复活条件 | `deferred.md` |
| 删除大型旧文档 | 本索引增加原路径和 SHA |

普通功能完成、常规 bug、临时计划、AI 执行日志、截图和验收结果不归档。相同根因更新原条目，不追加重复条目；归档更新与触发它的决策或代码变更同一原子提交。
