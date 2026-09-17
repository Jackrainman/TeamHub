<div align="center">

# ⚡ TeamHub

### 机器人战队的协作中枢 · 知识库 + 项目计划表 + 库存台账

**给学长减负、给学弟指引，进度和卡点全员同步——不盯个人。**

![Tag](https://img.shields.io/github/v/tag/Jackrainman/TeamHub?label=version&color=blue)
![Status](https://img.shields.io/badge/status-public%20beta-brightgreen)
![Node](https://img.shields.io/badge/node-%E2%89%A524-informational)
![Data](https://img.shields.io/badge/data-SQLite-success)

</div>

给 5–15 人的机器人战队（Robocon / RoboMaster 这类）用的内部协作工具。三根支柱都已落地：

- **知识库**——调试踩过的坑结案归档，下次同类症状能把旧解法翻出来；图纸按机构、按版本存档。
- **项目计划表**——任务连成依赖图，谁被谁卡住一眼可见；没人认领的活挂在挂单池里等人领；倒排基准线告诉你离比赛还有几周、进度是快是慢。
- **库存 / BOM**——零件还剩多少、缺什么；装车拆车报损随手记一笔，全队都知道家底。

两条底线：**不排名、不盯人**——系统只显示"任务被什么卡住"，从不显示"谁慢了"；**AI 只当仓管和转译**——整理、检索、起草可以，替人判断谁该干什么不行。

---

## 五分钟跑起来

Windows PowerShell / Ubuntu 均使用 Node.js 24.x 和 Git。SQLite 内置于 Node，无需单独安装数据库或 WSL；首次安装依赖和测试浏览器需要联网。

```bash
git clone https://github.com/Jackrainman/TeamHub.git
cd TeamHub
npm ci
npm run dev
```

浏览器打开 <http://127.0.0.1:4177>。第一次打开会有个**向导**问你「先试试（演示数据）还是直接安装（正式使用）」——选「先试试」就进演示态：自带一套示例任务、车辆和排班，随便点不心疼。

开发数据默认放在被忽略的 `tmp/dev-data/`，与服务器数据隔离。该命令先构建再启动；修改代码后重新运行，初始化请求的重启自动处理。需要前端热更新时另开终端执行 `npm run dev -w apps/hub-console`。

首次测试先运行 `npm run browser:install`，然后 `npm run verify`（三包类型检查、单测、构建及浏览器 E2E）。`npm run verify:local` 不含浏览器 E2E。两平台必须各自 `npm ci`，不要复制 `node_modules`；Git Bash 仅用于现有提交钩子和版本脚本。

浏览器下载受限且已安装 Edge 时，PowerShell 可先设 `$env:E2E_BROWSER_CHANNEL='msedge'` 再运行验证；CI 使用 Playwright 配套 Chromium。

## 给战队正式部署

Ubuntu 24 Server 使用 `./start-teamhub.sh`，按部署指南指定实例目录和访问边界。首次向导选择演示/真实与身份模式；身份模式要求登录后访问业务数据。

更改模式、升级或重建前，先按运维指南备份并验证恢复。测试实例与正式实例使用不同端口、数据库、图纸及凭证目录；不要把服务器正式实例当作日常测试环境。

第一次启动怎么导入队员名册（设置页下载 CSV 模板 → Excel 填好 → 上传）、怎么初始化管理员、什么时候才暴露到内网，都在部署指南里：

- 📦 **[部署指南](docs/operations/deploy.md)** —— 从零到全队可用，含环境变量速查表和 Docker 路径。
- 🤖 **[给 AI 助手的部署提示词](docs/operations/agent-deploy.md)** —— 服务器上有 Hermes / Claude 这类能执行命令的助手？把提示词粘给它，让它替你部署。
- 🔧 **[运维 Runbook](docs/operations/runbook.md)** —— 备份、回滚、升级纪律。

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

三个包：`hub-contracts`（Zod 契约，前后端共享）、`hub-server`（Fastify，**单端口 4177** 同时托管 API 和前端静态站）、`hub-console`（React + Vite，中英双语）。结构化数据统一使用 SQLite；图纸与报销凭证存独立目录。完整备份包含数据库和两类附件，不能直接复制正在写入的 SQLite。不抢 80/443，不依赖外部数据库。

## 更多文档

- 文档唯一入口：[`docs/README.md`](docs/README.md) · 设计约束：[`.harness/decisions.md`](.harness/decisions.md)
- 历史诊断库：[`docs/archive/README.md`](docs/archive/README.md)（仅按 `AGENTS.md` 的触发条件定向回查）
- 内部操作手册以 [`AGENTS.md`](AGENTS.md) 为准，待办见 [`.harness/todo.json`](.harness/todo.json)

---

<div align="center">

**TeamHub** · 让每次救火都攒下能复用的经验，让进度和家底不靠口口相传

</div>
