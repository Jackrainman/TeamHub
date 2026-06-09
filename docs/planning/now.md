# Now

> 唯一当前战况源。Team Hub 方向已由 D-024 覆盖旧 markdown-only pivot。pre-pivot 历史快照 → `docs/archive/v0.3-pivot/`。

```yaml
mode: governance_design
stage: D-026 把 Teamhub reframe 为制度化进度治理系统；设计宪法重构为 C/G/A 三层；AGENTS §1/§4/§5 + README + roadmap + decisions(D-026) 文档体系大改进行中
stage_goal: 以 D-026 + 重写中的 docs/design/team-hub-concept.md + AGENTS.md §1/§4/§5 为事实源，按四层架构推进数据真相层（项目/赛季·成员角色资历·组织树·任务依赖·Need）→ 规则治理层 → 展示汇报层 → 触点集成层；已建 Hub 壳子降为触点/集成+展示底座复用；两项待拍板（架构走法 A/B、提醒可见范围/送达模型）深设计先搭骨架留待定，不阻塞宪法/定位/planning；AI 每轮默认读 AGENTS.md + now.md + agent-state.json + git 状态，backlog/decisions/roadmap/设计文档按条件读取
current_task: null  # 文档体系治理 reframe 大改进行中；收尾后重走 atomic-task，从 frontier 选治理数据模型 epic
frontier:
  - GOV-DATA-MODEL-DESIGN
blocked: []
open_for_decision:
  - ARCH-PATH                           # 治理为主轴 vs Hub 之上平行模块（decisions.md D-026 开放项）
  - REMIND-MODEL                        # 提醒可见范围/送达：混合 / 更私密优先 / 更透明（倾向混合）
post_pivot_registry:
  - SKILL-PROTOCOL-V1                    # 已落地草稿；作为治理触点层 skill 契约底座保留
  - BRIDGE-01-ROSTER-SCHEMA              # 模型并入治理 Task/progress；数据载体被 D-026 路线 A 反转（系统库做真相）
  - TRAIL-01-VIEWER-DESIGN               # 等治理 event/archive/artifact 原料足够后再设计
frozen:
  - ProbeFlash-v0.3.0                    # 代码已删(git 历史保留)；致命补丁走 git revert
```

## 当前任务

_无。HUB-COMPOSE-SMOKE 已闭环：Docker CLI/Compose 可用后，修复 Hub 镜像 runtime 依赖打包问题并跑通 `scripts/verify-hub-compose.sh`，已完成 Hub + Postgres build/up、health/API/static console smoke 与自动清理。下一步需重新走 atomic-task，从 frontier 选择唯一候选。_

## 架构定位（2026-06-09，D-026）

四层架构 + 路线 A 详见 `AGENTS.md §1` 与 D-026（不在此重复）。治理域是新增核心；已建 Hub 壳子（hub-server/contracts/console/Compose）作为触点/集成 + 展示底座保留。深设计见重写中的 `docs/design/team-hub-concept.md`。

## 阻塞 / 待拍板

- **架构走法（D-026 开放项）**：治理为主轴（hub-contracts 设治理为核心域）vs 治理作 Hub 之上平行模块——待拍板；倾向主轴 + 渐进迁移。
- **提醒可见范围/送达模型**：混合 / 更私密优先 / 更透明——用户仍在想，倾向混合。
- **真实外部 adapter**：Hermes / 小龙虾 / Claude Code 真实接入需要用户提供运行方式与权限；AI 当前只能做 mock-first 适配设计。
- **真实服务器写入**：Forgejo/Gitea/bare git 部署、SSH、systemd、80/443、真实数据迁移均需用户白天审批后再做。

## 已冻结

- ProbeFlash v0.3 代码（原 apps/desktop、apps/server、dev-start.sh、release 流程）：已于 2026-06-09 删除；完整代码留 git 历史，精华见 `docs/archive/v0.3-closeout/PROBEFLASH-V03-ESSENCE.md`；致命补丁走 `git revert`。
- pre-pivot backlog 全部任务（TECH-* / AIREADY-* / REALAI-* / CODECTX-* / DEP-* / DATA-* / UI-* / CORE-* / SEARCH-*）：不再认领；详细见 `docs/archive/v0.3-pivot/backlog.md`。
- **原 BRIDGE / TRAIL markdown-only 候选**：已被 D-024 Team Hub 架构覆盖，后续只作为 Hub BridgeState / Trail 能力重评，不按旧任务直接认领。

## 安全边界（pivot 后仍生效）

- 不动 v0.3 server / SQLite / API（致命补丁除外）。
- AI / Skill / Hub adapter 不读 / 打印密钥（`.env` / `*key*` / `*secret*`）。
- 真实 Hermes / 小龙虾 / Claude Code / 飞书 / Git forge smoke 由用户线下配置；AI 只做 mock-first 与只读诊断。
- 不在未审批情况下写真实服务器、SSH、systemd、80/443 或迁移真实数据。

## 最近完成（详见 `git log`）

- 2026-06-09 GOV-REFRAME-DOCS — D-026 治理 reframe + 设计宪法 C/G/A 三层重构（AGENTS §1/§4/§5 + README + roadmap + decisions D-026 + concept 骨架）。
- 2026-06-09 PF-V03-CLEANUP — 删除 ProbeFlash v0.3 代码（apps/server/desktop/dev-start.sh），精华入 `docs/archive/v0.3-closeout/`，飞书大文档归档，agent-state.json + AGENTS/now 瘦身。
- 2026-06-07 HUB-CONSOLE-PREVIEW-SCRIPT — 新增 `scripts/preview-hub-console.sh` 与 hub-console `preview:local`（mock / TEAMHUB_API_BASE 切 real）。
- 2026-06-07 HUB-COMPOSE-SMOKE — Docker 验证闭环：修 Dockerfile runtime 依赖打包，`scripts/verify-hub-compose.sh` 通过 Hub+Postgres build/up/health/API/static smoke。
- 2026-06-07 HUB-ADAPTERS-MOCK / HUB-LARK-WIRE — hub-contracts adapter schema + mock endpoint；Lark 三包接入 Hub contract（ingress/tool adapter descriptor + HubEvent 归一化）。
