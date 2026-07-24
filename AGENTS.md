# AGENTS — TeamHub 操作手册（精简版 · Claude-Code-centric）

> 本手册假设你有 workflow 编排能力（Claude Code）：拆原子单元、用 `Workflow` fan-out / pipeline、
> 每单元各自验证 + 单 commit + push；小改动直接做、不强起 workflow。
> **并发写隔离（worktree）**：默认在主 checkout 干活——只读 / 单包小改 / 文档 / 串行任务**不开 worktree**
> （纯开销，且 trunk-based 还要多一道合回 master）。**仅当同一轮 fan-out 有 ≥2 个 agent 会并发改重叠文件**时，
> 才给这些 agent 传 `isolation: "worktree"`（EXPENSIVE，不冲突的 agent 不传）；各 worktree 改完仍按 §2.3
> 各自验证 + 单 commit，push 前 `git fetch` + 必要 rebase（§2.4）。worktree 本身不费 token，token 成本来自
> 并行 agent 各带上下文，与是否 worktree 无关。
> **无 workflow 编排能力的串行轨工具（Codex / OpenCode）改读 `archive/legacy-harness/AGENTS-serial.md`**
> （自含的 §6.A 串行轨 fallback）。harness 全改背景见 `docs/planning/decisions.md` D-066；旧双轨 + self-iterate
> 全文冻结在 `archive/legacy-harness/`。
>
> **事实源**：当前战况 `docs/planning/now.md`（唯一）；长期决策 `docs/planning/decisions.md`；候选池
> `docs/planning/backlog.md`；产品深设计 `docs/design/team-hub-concept.md`。每轮默认读 `AGENTS.md` +
> `now.md` + `git status --short` + `git log --oneline -5`；选任务读 `backlog.md`，争议读 `decisions.md`。

## 1. 这是什么
- **D-083（2026-07-11 产品重定义，凌驾旧表述）**：给没有项目经理的小团队一个**代打项目经理的工具**——把赛前爆肝摊平到整个赛季。开源自部署、单团队单实例；双主轴 = 防爆肝（倒排基准线+验证门+投资任务防砍）+ 防"大号 AI MCP"（学习方向+AI 边界）。第一垂直包 = **Robocon 战队包**（游戏包后置）。全文见 `docs/design/product-redefine-2026-07.md`。
- TeamHub = 机器人战队的**协作中枢**（CASE 工具 + 团队交流中心 + 战队数据库），**非监视系统**。三角色：给学长减负 / 给学弟指引 / 项目同步进度表。
- 三支柱产品（D-039，全 P0）：① 战队知识库 ② 项管看板 ③ 库存-BOM——D-083 后全部保留、重新挂在双主轴下。**AI 退出治理**（治理只做人读说明视图，大三/学长判断；治理派生整簇 D-032~D-035 挂起、spec 留）；**AI 排人三红线（D-083）**：事实拼盘不排序 / 拍板留名归人 / 拼盘只在决策现场。
- 四层架构：数据真相层 → 规则/协调层 → 展示/汇报层 → 触点/集成层。路线 A：系统是真相，飞书只做通知/check-in、**不双写**。当前模式 `collab_design`。
- **组织结构（任务分配单元，D-072 定稿）**：分配任务**只有四个组**——电控 / 视觉 / 机械 / 电路，**设置页可增减**。**「程序组」不作领任务单元**（删该身份）；「程序 = 电控 + 视觉」仅保留为**汇报 / 过载向上合并视角**，不直接领任务、不在排班里作独立单元。**总联调 = 所有组各到至少一人**（不挂单一组）。fixtures 调和由 `docs/design/presence-reconcile-lock.md` 锁定定稿（路线 C，PRESENCE-RECONCILE 阶段②已实现）：`m-progA→grp-ec`（role 降 member，改持新常规任务 `t-r1-system-tune`）、`m-progB→grp-vision`；两个总联调任务 `groupId→grp-convergence`（新增哨兵组）、`convergenceScope='allLeafGroups'`、`ownerId=null`；`grp-program` 不再领任务（仅汇报视角，parentGroupId 链保留）；`need-rtos.providerGroupId→grp-ec`。demo 拆两场景：今晚=平日差异化（三态）、总联调日=全组各一人。`grp-*` 组树本身已正确（机械/电路顶层·程序顶层挂电控/视觉）。

## 2. 铁律（改动前必看 — 每条钉在宪法或事故上）
1. **I0 核心不变式（D-083 口径修正）**：朴素纪律 = **分析对准事、不对准人；不做产能排行榜**。保留：人键私有信号只回本人；`confirmedBy`(ActorRef) 写侧收集、第三方读视图不外露；公平靠「给被卡的人正名」不靠抓摸鱼。**新增合法例外（D-083）**：登录后**本人视图**（我的任务/私有学习建议）可按 memberId 过滤——本人看本人不属监视。收回"结构上无法统计谁干得多"的绝对主义表述（贡献本来就可见：任务有负责人、commit 有作者，不聚合成排名即可）。详 `product-redefine-2026-07.md` §3.2。**第三版口径（D-085 名字三层，2026-07-15）**：事实层永远带名（认领/验收/拍板/豁免留名，单卡可见）、聚合层永不做（按人统计/排行结构上不建）、结构层对事（落后单位=里程碑/模块/组）；UI 规则=名字只出现在事实卡片上、永不进首页/聚合/统计，不提供按人筛选（唯一例外=本人「我的视图」）。
2. **C 原则（产品根基）**：C1 填写成本由当下回报抵消（状态优先从飞书/Git 动作派生，别让人记过去）；C2 摩擦可见、**产能不可比**（任何角色都不得见人与人完成量排名）；C3 小作坊优先（5–15 人、轻量、不做完整 RBAC/多租户）；C4 AI 是转译者、不替人拍板、不替代实物验证；C5 只为有自然上游的场景构建（无河流不建水厂）。**反监视**：A1 暴露缺口不暴露「人慢了」；A2 给个人的提醒只私下回本人、**不上报管理者**；A4 无硬截止只轻推、人-silence 永不升级给除本人外任何人——**A4 修正（D-083 G4 修正案）：里程碑/基准线有日期**（从比赛日倒推的项目参照线，落后单位=模块/里程碑非人名），**Task 本体永不新增个人 dueDate**，快慢从里程碑派生。
3. **原子单元 + completion gate**：最小粒度 = 可独立验证 + 单独 commit 的改动。落地前自检 (a) 最小验证按 §4 通过 (b) planning sync（覆盖更新 `now.md`，候选变动同步 `backlog.md`，长期决策追 `decisions.md`——决策被 supersede / 过时则**同刀**压 3 行 stub + 全文移 `docs/archive/`，活文件只留仍约束当前代码/产品的项，别在活文件堆叠（D-070/D-073 活账本纪律））(c) 改 `apps/hub-*/src` 行为则按 §7 `scripts/bump-version.sh` 自增版本号（与本次 commit 同刀）(d) 单 commit。**DoD 必含至少 1 条工程谓词**（文件存在 / 命令 exit 0 / grep 命中 / schema safeParse / yaml 可解析）；「积累 N 条 / 了解了 X」等不可机器验证描述不构成 DoD、拒认领。
4. **commit+push 默认（D-064）**：completion gate 过后**直接 commit 并 push 到 `origin/master`**（trunk-based），含交互式会话，不每次问「要不要提交」；push 前 `git fetch` 看分叉、有则先 rebase；仅用户明确叫停才暂缓。授权仅限 git（代码+docs+planning）。
5. **数据安全**：重启 / 重建 / 跑 compose smoke 前先 `scripts/backup-teamhub-data.sh`（kb.json/gov.json 不可再生，备份读回校验不过别继续）。**落盘 env（`TEAMHUB_KB_DATA_FILE` + `TEAMHUB_GOV_DATA_FILE`）必须在真实启动路径接通**——漏接 = 重启清零（dev-debug-archive H5 / A1 教训）。`verify-hub-compose.sh` 的 `--volumes` 只许对 `*smoke*` 项目跑。
6. **密钥不进仓**：不读/打印/搜索/提交任何真实密钥（`.env*` 除 `.env.example` / `*key*` / `*secret*`）；provider key 只走 server 进程 env，不进浏览器/localStorage/planning/日志/commit；commit 前过 `scripts/pre-commit.sh`。
7. **写端点信任边界**：`HUB_HOST` 非 loopback 暴露写端点**必须**配 `TEAMHUB_WRITE_TOKEN`（否则拒启动）；反代/隧道后面开 `TEAMHUB_TRUST_PROXY=true`（否则写限流塌成全队单桶 = DoS）。详见 `docs/deploy/RUNBOOK.md`。

## 3. 常用命令
```bash
# 三包验证（typecheck + test + build）
npm --prefix apps/hub-contracts run verify:all
npm --prefix apps/hub-server   run verify:all
npm --prefix apps/hub-console  run verify:all
# 起服务（单端口 4177，console+API；接好 KB/gov 落盘 + buildId）
./start-teamhub.sh
# 数据备份（重启/重建前先跑）
./scripts/backup-teamhub-data.sh
# 端到端实测（驱动真 server + 真重启）
npm --prefix apps/hub-server run test:local -- e2e-pillars
# compose 冒烟（仅 *smoke* 项目）/ 提交门
scripts/verify-hub-compose.sh
bash scripts/pre-commit.sh
# 活体校验：在服的是哪个构建
curl -s http://127.0.0.1:4177/health | grep buildId
```

## 4. 验证门
| 任务类型 | 必跑 |
|---|---|
| docs / planning / skills-only | `git diff --check`；`now.md` yaml 可解析；grep 旧路径无残留；skills 要用才装——本机需要触发时跑 `bash .agents/skills/install.sh` 软链进 `.claude/skills/`（单一真源 `.agents/skills/`，软链零拷贝；clone 后不强制装） |
| hub 后端 / 契约 / 控制台 | 对应包 `npm run verify:all`（exit 0）；`git diff --check` |
| 部署相关行为 | `apps/hub-server` e2e-pillars 绿；`curl /health` buildId 非空 |
| compose / 部署冒烟 | `scripts/verify-hub-compose.sh`（需 Docker/Compose） |
| 其它包（lark-gateway / lark-toolkit / pf-skills） | 同 `npm run verify:all` 范式 |
- exit code ≠ 0 一律失败；未跑的必跑项必须在 commit message 或 `now.md` 如实标注原因，不得静默跳过。
- 架构类任务（storage / closeout / adapter / backend）必须有代码级 + 契约级验证；只有分析结论一律视为未完成。

## 5. 安全边界（无审批不做）
- 禁止：SSH 写服务器、`sudo`、`systemd`、写 `/opt`、操作 80/443、真实服务器部署、release/tag 删除、destructive migration、删用户数据、真实生产数据修改、大规模 UI 重构、引大型框架、需用户拍板的产品方向。这些需用户白天审批（`REMOTE-ACCESS-DEPLOY` 等开放决策见 `now.md`）。
- 密钥/凭证（§2.6）+ lark-cli 写入类 `lark api`（`*.create/update/delete/patch`）需用户一次一批审批；只读诊断（`lark schema/doctor/*.list/get/search`）可代跑。
- 停止条件：git 不干净且无法归类；verify 失败且当前边界内不可修；命中 SSH/sudo/部署/密钥/数据迁移；planning 与代码冲突且不知谁 stale；连续两次修复仍失败。

## 6. 踩坑 → 铁律（dogfood）+ 真实性
- TeamHub 自身工程 bug 修完 → 复盘直接记 design/planning 文档即可（现行主流做法，如 PIN 死锁=onboarding-pin-deadlock-2026-07-24.md）；**值得跨赛季沉淀的重大反复事故**才在 `docs/dev-debug-archive/` 加卡（`parse-debug-archive` 格式）→ `kb:import` 进语料，由它而生的铁律引该卡症状/errorCode（已落 H1–H5；该通道 2026-06 后使用频率≈0，如实降级为可选）。
- **真实性**：禁止把「规划中」写成「已完成」、把占位壳说成真实功能、把 `localStorage`/内存 fallback 当「服务器化成功」；验证失败不得伪造完成，创建 repair task 或回退，连续两次失败升级人工。工具调用必查 exit code、失败不静默吞。

## 7. 版本号纪律（D-074）
- **产品单一版本** = 根 `VERSION`（SemVer `MAJOR.MINOR.PATCH`）。三支柱同端口 4177 同发布 = 一个产品一个版本号；`scripts/bump-version.sh` 把它同步进 hub-* 三包 `package.json`，`/api/system/status`·`/health` 即刻报告（`status.ts` 读包根 version）。**只用 `bump-version.sh` 改版本，别手改 package.json**——手改让 VERSION 与三包漂移，正是历史 bug 根因。
- **每次改 `apps/hub-*/src` 行为的 commit 必须 bump**（= feiyue「改脚本必自增 `@version`」的服务端版）：fix/perf=PATCH，向下兼容新功能=MINOR，破坏 schema/对外接口=MAJOR（1.0 前破坏性也走 MINOR，MAJOR 留给首个生产门）。docs / planning / skills-only commit 不 bump。commit message 体现版本（如 `feat(schedule): 接力画布 v0.5.0`）。
- **自动 bump 反射**：`scripts/check-version-bump.sh`（挂在 `pre-commit.sh`，经 `scripts/install-hooks.sh` 装成 git pre-commit 钩子；**clone 后必跑一次**）—— 暂存了 hub-* 源码却没动 VERSION 时，**自动 `bump-version.sh patch` 并把 VERSION+三包 package.json/lock 并入本次提交**（= feiyue「改脚本必自增 `@version`」的服务端反射，替代服务端缺失的「不自增就不更新」下游压力）。默认 patch；feature 走 `VERSION_BUMP_LEVEL=minor`、破坏接口 `=major`；`SKIP_VERSION_BUMP=1` 单次豁免；`VERSION_BUMP_STRICT=1` 仅在自动 bump 失败时硬阻断（默认失败只 warn，不卡 D-064 无人值守环）。
- **版本 ≠ 构建戳**：`buildId`（运行进程 git SHA，`start-teamhub.sh` 注入）= **构建身份**，与 SemVer **版本** 正交——版本说「第几代能力」，buildId 说「在跑哪个提交」。
