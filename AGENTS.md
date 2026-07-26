# AGENTS — TeamHub 操作手册

## 1. 产品

TeamHub = 机器人战队的协作中枢（CASE 工具 + 交流中心 + 战队数据库），给没有 PM 的小团队一个代打 PM 的工具。三支柱：① 战队知识库 ② 项管看板 ③ 库存-BOM。第一垂直包 = Robocon 战队包。设计文档在 `docs/design/`，设计约束在 `.harness/decisions.md`。

**产品不变式**（约束一切代码生成）：
- **I0**：分析对准事不对准人；不做产能排行榜；人键只回本人、第三方只见结构键（task/group/resource）。名字只出现在事实卡片（认领/验收/拍板），永不进首页/聚合/统计。
- **C1-C5**：填写成本由当下回报抵消 / 摩擦可见·产能不可比 / 小作坊轻量 / AI 是转译者不替人拍板 / 只为有自然上游的场景构建。
- **反监视**：暴露缺口不暴露"人慢了"；提醒只私下回本人、不上报管理者；无硬截止只轻推；Task 永不加个人 dueDate（快慢从里程碑派生）。
- **AI 边界**：AI 只当仓管/转译（整理/检索/算量/起草），不参与治理判断，不替人拍板，不替代实物验证。

## 2. 工作流

```
开局：读本文件 + .harness/todo.json + git status --short
做事：从 todo 取一条
收尾：verify（§4）→ bump（§6，如改 hub-*/src）→ commit+push → 删 todo 条目 → append .harness/ai-log.md 一行
参考：设计约束 .harness/decisions.md（争议时 grep）；产品设计 docs/design/
```

- commit+push 默认（trunk-based），不每次问；push 前 `git fetch` 查分叉、有则 rebase。
- 原子单元：最小粒度 = 可独立验证 + 单独 commit。DoD 必含工程谓词（命令 exit 0 / grep 命中 / schema safeParse）。
- 真实性：不伪造完成、exit code 必查、失败不静默吞。验证失败 → 回退或建 repair task，连续两次失败升级人工。

## 3. 命令

```bash
# 三包验证（typecheck + test + build）
npm --prefix apps/hub-contracts run verify:all
npm --prefix apps/hub-server   run verify:all
npm --prefix apps/hub-console  run verify:all
# 起服务（单端口 4177）
./start-teamhub.sh
# 数据备份（重启/重建前先跑）
./scripts/backup-teamhub-data.sh
# 端到端实测
npm --prefix apps/hub-server run test:local -- e2e-pillars
# compose 冒烟（仅 *smoke* 项目）/ 提交门
scripts/verify-hub-compose.sh
bash scripts/pre-commit.sh
# 活体校验
curl -s http://127.0.0.1:4177/health | grep buildId
```

## 4. 验证门

| 任务类型 | 必跑 |
|---|---|
| docs / skills-only | `git diff --check`；grep 旧路径无残留 |
| hub 后端 / 契约 / 控制台 | 对应包 `npm run verify:all`（exit 0）；`git diff --check` |
| 部署相关行为 | e2e-pillars 绿；`curl /health` buildId 非空 |
| compose / 部署冒烟 | `scripts/verify-hub-compose.sh`（需 Docker） |

exit code ≠ 0 一律失败。架构类任务必须有代码级+契约级验证；只有分析结论 = 未完成。

## 5. 安全边界（无审批不做）

- 禁止：SSH 写服务器、sudo、systemd、写 /opt、80/443、真实部署、tag 删除、destructive migration、删用户数据、大规模 UI 重构、引大型框架、需用户拍板的产品方向。
- 密钥不进仓：不读/打印/搜索/提交 `.env*`（除 .env.example）/ `*key*` / `*secret*`。
- 写门信任边界：非 loopback 暴露写端点必须配 `TEAMHUB_WRITE_TOKEN`；反代后面开 `TEAMHUB_TRUST_PROXY=true`。
- 数据安全：重启/重建前先 `scripts/backup-teamhub-data.sh`（kb.json/gov.json 不可再生）。
- 停止条件：verify 失败且不可修；命中 SSH/sudo/部署/密钥；连续两次修复仍失败。

## 6. 版本

- 产品单一版本 = 根 `VERSION`（SemVer）。只用 `scripts/bump-version.sh` 改版本，别手改 package.json。
- 改 `apps/hub-*/src` 行为的 commit 必须 bump（fix=PATCH，feature=MINOR）。docs/planning 不 bump。
- pre-commit hook 已自动检查（`scripts/install-hooks.sh` clone 后跑一次）。
