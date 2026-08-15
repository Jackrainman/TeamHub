---
kind: operations
status: active
domain: deployment
truth_for: supported-local-and-team-deployment-paths
last_reviewed: 2026-08-15
---

# TeamHub 部署指南

## 1. 支持范围

TeamHub 当前支持 Node.js ≥24 的 Linux/macOS/WSL 主机和 Docker Compose，两者均由 hub-server 在单端口 4177 托管 console 与 API。默认先绑定 `127.0.0.1`，完成初始化后再决定是否暴露内网。

本指南只描述仓库当前可用路径。D-090 的统一 SQLite 是目标架构；迁移完成前，脚本仍兼容旧分域文件路径。

## 2. 主机部署（CURRENT）

```bash
git clone https://github.com/Jackrainman/TeamHub.git
cd TeamHub
npm install
./start-teamhub.sh
```

浏览器打开 `http://127.0.0.1:4177`。首次启动进入向导，选择演示/真实和匿名/身份；配置写入数据目录后服务自动重启。

`start-teamhub.sh` 会构建 console/server，并默认把现有各数据域落到 `~/teamhub-data/`。只重启已构建产物可设 `TEAMHUB_SKIP_BUILD=1`。

## 3. 初始化与开放顺序

1. 以 loopback 启动并完成首启动向导。
2. 身份模式按全屏初始化门完成操作者、名册、组长及所需业务初始化。
3. 确认项目管理账户可以登录，并记录 PIN 恢复方式。
4. 运行一次数据备份。
5. 最后才以 `HUB_HOST=0.0.0.0` 重启并把地址交给队友。

非 loopback 写端点必须满足身份会话或 `TEAMHUB_WRITE_TOKEN` 写门。反代后设置 `TEAMHUB_TRUST_PROXY=true`；直接暴露时保持 false。

## 4. 存储配置

- TARGET：`TEAMHUB_BACKEND=sqlite` + `TEAMHUB_DB_FILE=~/teamhub-data/teamhub.sqlite` 是唯一生产数据库；artifact 文件单独存目录。
- CURRENT：统一 SQLite 已存在，但启动脚本仍兼容分域 JSON、gov-only SQLite 和 InMemory fallback。
- 部署新实例应优先选择统一 SQLite；不要为新环境新增分域路径依赖。
- `TEAMHUB_ARTIFACT_FILES_DIR` 保存图纸/证据字节；它必须与数据库一起备份。
- 产品模式和启用模块最终进入 `app_settings`；迁移完成前首启动向导仍读取现有配置层。

## 5. Docker Compose（CURRENT）

```bash
docker compose up -d --build hub
```

现有 compose 仍声明多个旧命名卷，属于迁移中结构。D-090 完成后应只保留数据库卷、artifact 卷和必要配置/备份落点；在此之前不要手工删除旧卷。

## 6. 无头初始化

没有浏览器时，可在 loopback setup 模式调用：

```bash
curl -X POST http://127.0.0.1:4177/api/setup/init \
  -H 'content-type: application/json' \
  -d '{"dataMode":"real","identityMode":"identity"}'
```

调用后服务按约定重启。禁止在未建立访问边界时把 setup 端点暴露到不受信任网络。

## 7. 部署后检查

```bash
curl -s http://127.0.0.1:4177/health
curl -s http://127.0.0.1:4177/api/system/status
```

确认 `/health` 含非空 `buildId`、版本与根 `VERSION` 一致，并完成一次“写入结构事实 → 重启 → 仍可读”的持久化检查。具体备份、升级、恢复和事故处理见 `runbook.md`。

## 8. 安全边界

- 部署前不读取或打印 `.env`、App Secret、WRITE_TOKEN 或 provider key。
- SSH、sudo、systemd、80/443、反代修改和真实数据迁移必须取得明确审批。
- 重建、升级、切换数据库或改卷前必须先备份。
- TeamHub 是单团队单实例产品，不按 SaaS 多租户方式暴露公网。
