# AGENTS — TeamHub 操作手册（精简版 · Claude-Code-centric）

> 本手册假设你有 workflow 编排能力（Claude Code）：拆原子单元、用 `Workflow` fan-out / pipeline、
> 每单元各自验证 + 单 commit + push；小改动直接做、不强起 workflow。
> **无 workflow 编排能力的串行轨工具（Codex / OpenCode）改读 `archive/legacy-harness/AGENTS-serial.md`**
> （自含的 §6.A 串行轨 fallback）。harness 全改背景见 `docs/planning/decisions.md` D-066；旧双轨 + self-iterate
> 全文冻结在 `archive/legacy-harness/`。
>
> **事实源**：当前战况 `docs/planning/now.md`（唯一）；长期决策 `docs/planning/decisions.md`；候选池
> `docs/planning/backlog.md`；产品深设计 `docs/design/team-hub-concept.md`。每轮默认读 `AGENTS.md` +
> `now.md` + `git status --short` + `git log --oneline -5`；选任务读 `backlog.md`，争议读 `decisions.md`。

## 1. 这是什么
- TeamHub = 机器人战队的**协作中枢**（CASE 工具 + 团队交流中心 + 战队数据库），**非监视系统**。三角色：给学长减负 / 给学弟指引 / 项目同步进度表。
- 三支柱产品（D-039，全 P0）：① 战队知识库 ② 项管看板 ③ 库存-BOM。**AI 退出治理**（治理只做人读说明视图，大三/学长判断；治理派生整簇 D-032~D-035 挂起、spec 留）。
- 四层架构：数据真相层 → 规则/协调层 → 展示/汇报层 → 触点/集成层。路线 A：系统是真相，飞书只做通知/check-in、**不双写**。当前模式 `collab_design`。

## 2. 铁律（改动前必看 — 每条钉在宪法或事故上）
1. **I0 核心不变式（凌驾全部）**：人键的输出只回本人当帮助；对第三方**只暴露结构键**（task/group/resource），**永不暴露人**。`confirmedBy`(ActorRef) 写侧收集、**任何读视图永不外露**（响应 omit）。公平靠「给被卡的人正名」（依赖图结构自动显示被上游卡），**不靠抓摸鱼**（盯个人 = 监视）。
2. **C 原则（产品根基）**：C1 填写成本由当下回报抵消（状态优先从飞书/Git 动作派生，别让人记过去）；C2 摩擦可见、**产能不可比**（任何角色都不得见人与人完成量排名）；C3 小作坊优先（5–15 人、轻量、不做完整 RBAC/多租户）；C4 AI 是转译者、不替人拍板、不替代实物验证；C5 只为有自然上游的场景构建（无河流不建水厂）。**反监视**：A1 暴露缺口不暴露「人慢了」；A2 给个人的提醒只私下回本人、**不上报管理者**；A4 无硬截止只轻推、人-silence 永不升级给除本人外任何人。
3. **原子单元 + completion gate**：最小粒度 = 可独立验证 + 单独 commit 的改动。落地前自检 (a) 最小验证按 §4 通过 (b) planning sync（覆盖更新 `now.md`，候选变动同步 `backlog.md`，长期决策追 `decisions.md`）(c) 单 commit。**DoD 必含至少 1 条工程谓词**（文件存在 / 命令 exit 0 / grep 命中 / schema safeParse / yaml 可解析）；「积累 N 条 / 了解了 X」等不可机器验证描述不构成 DoD、拒认领。
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
| docs / planning / skills-only | `git diff --check`；`now.md` yaml 可解析；grep 旧路径无残留；`bash .agents/scripts/verify-skills-sync.sh`（改 skill 时） |
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
- TeamHub 自身工程 bug 修完 → 在 `docs/dev-debug-archive/` 加一张卡（`parse-debug-archive` 格式）→ `kb:import` 进语料 → 由它而生的铁律引该卡症状/errorCode（bug→铁律可追溯，feiyue TROUBLESHOOTING 模型；已落 H1–H5）。
- **真实性**：禁止把「规划中」写成「已完成」、把占位壳说成真实功能、把 `localStorage`/内存 fallback 当「服务器化成功」；验证失败不得伪造完成，创建 repair task 或回退，连续两次失败升级人工。`.debug-archive/*.md` 归档后读回验证；工具调用必查 exit code、失败不静默吞。
