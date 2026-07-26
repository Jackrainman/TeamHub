<div align="center">

# ⚡ TeamHub

### 机器人战队的协作中枢 · 知识库 + 项目计划表 + 库存台账

**给学长减负、给学弟指引，进度和卡点全员同步——不盯个人。**

![Tag](https://img.shields.io/github/v/tag/Jackrainman/TeamHub?label=version&color=blue)
![Status](https://img.shields.io/badge/status-public%20beta-brightgreen)
![Node](https://img.shields.io/badge/node-%E2%89%A524-informational)
![Data](https://img.shields.io/badge/data-JSON%20%E8%90%BD%E7%9B%98%C2%B7%E9%9B%B6%E5%A4%96%E9%83%A8%E6%95%B0%E6%8D%AE%E5%BA%93-success)

</div>

给 5–15 人的机器人战队（Robocon / RoboMaster 这类）用的内部协作工具。三根支柱都已落地：

- **知识库**——调试踩过的坑结案归档，下次同类症状能把旧解法翻出来；图纸按机构、按版本存档。
- **项目计划表**——任务连成依赖图，谁被谁卡住一眼可见；没人认领的活挂在挂单池里等人领；倒排基准线告诉你离比赛还有几周、进度是快是慢。
- **库存 / BOM**——零件还剩多少、缺什么；装车拆车报损随手记一笔，全队都知道家底。

两条底线：**不排名、不盯人**——系统只显示"任务被什么卡住"，从不显示"谁慢了"；**AI 只当仓管和转译**——整理、检索、起草可以，替人判断谁该干什么不行。

---

## 五分钟跑起来

需要 Node.js ≥ 24 和 git，不需要数据库、不需要公网。

```bash
git clone https://github.com/Jackrainman/TeamHub.git
cd TeamHub
npm --prefix apps/hub-contracts install
npm --prefix apps/hub-server install
npm --prefix apps/hub-console install
./start-teamhub.sh
```

浏览器打开 <http://127.0.0.1:4177>。第一次打开会有个**向导**问你「先试试（演示数据）还是直接安装（正式使用）」——选「先试试」就进演示态：自带一套示例任务、车辆和排班，随便点不心疼。

## 给战队正式部署

正式部署不用配任何模式环境变量：第一次打开的向导里，选「**直接安装**」（真实空板），顺手选登录方式——**登录制**（推荐，谁都能看、登录才能写，操作自动留名，队长设 PIN 成为管理员）或**匿名共用**（全队共用一个写口令，写操作不留名）。选完自动配置，几秒后就绪。

已经在演示态摸熟、想转正式？打开 **设置 → 部署配置**，点「结束试驾，转正式」——演示数据会归档到数据目录下的 `demo-archive` 文件夹（挪走不删、可手工找回），服务以真实空板重启。登录方式也在同一处随时切换，改完自动重启生效。

第一次启动怎么导入队员名册（设置页下载 CSV 模板 → Excel 填好 → 上传）、怎么初始化管理员、什么时候才暴露到内网，都在部署指南里：

- 📦 **[部署指南](docs/deploy/DEPLOY.md)** —— 从零到全队可用，含环境变量速查表和 Docker 路径。
- 🤖 **[给 AI 助手的部署提示词](docs/deploy/ai-agent-deploy-prompt.md)** —— 服务器上有 Hermes / Claude 这类能执行命令的助手？把提示词粘给它，让它替你部署。
- 🔧 **[运维 Runbook](docs/deploy/RUNBOOK.md)** —— 备份、回滚、升级纪律。

## 队员第一次用

把 **[队员上手指南](docs/guide/getting-started.md)** 发给队友：怎么登录、每天看哪一页、领活 / 报卡点 / 结案三个动作，5 分钟看完。

## 页面一览

| 页面 | 干什么 |
|---|---|
| 总览 | 离比赛还有几周、进度比计划快还是慢、哪些门检查没过 |
| 我的视图 | 只看自己的任务：哪些能动手、哪些被卡（需身份模式） |
| 项目 | 看板 + 依赖图 + 挂单池：建任务、领活、标完成、验收 |
| 知识库 | 按症状搜历史坑，问题解决后结案归档 |
| 图纸档案 | 各机构图纸按版本存档，上传下载 |
| 库存 / BOM | 零件台账，装拆 / 入库 / 报损记账，缺料提醒 |
| 机器人队 | 整机登记、状态维护、每日在场接力排班 |
| 学习方向 | 按工种看队内技能缺口，给学弟一张学习地图 |
| 设置 | 登录、语言 / 主题、赛季管理、名册导入、部署信息自查 |

## 技术形态

三个包：`hub-contracts`（Zod 契约，前后端共享）、`hub-server`（Fastify，**单端口 4177** 同时托管 API 和前端静态站）、`hub-console`（React + Vite，中英双语）。数据全部落 `~/teamhub-data/` 下的 JSON 文件（治理域可选 SQLite），重启不丢、备份就是拷文件。不抢 80/443，不依赖外部数据库。

## 更多文档

- 设计文档：[`docs/design/`](docs/design/) · 设计约束：[`.harness/decisions.md`](.harness/decisions.md)
- 项目缘起、痛点叙事、设计底线全文与 v0.3 历史：**[原版 README 归档](docs/archive/readme-pre-beta-2026-07.md)**
- 内部操作手册以 [`AGENTS.md`](AGENTS.md) 为准，待办见 [`.harness/todo.json`](.harness/todo.json)

---

<div align="center">

**TeamHub** · 让每次救火都攒下能复用的经验，让进度和家底不靠口口相传

</div>
