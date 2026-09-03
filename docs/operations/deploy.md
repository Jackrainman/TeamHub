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

本指南只描述仓库当前可用路径。生产组合根已按 D-090 收成统一 SQLite，不再支持分域 JSON、gov-only SQLite 或生产内存回退。

## 2. 主机部署（CURRENT）

```bash
git clone https://github.com/Jackrainman/TeamHub.git
cd TeamHub
npm ci
./start-teamhub.sh
```

浏览器打开 `http://127.0.0.1:4177`。首次启动进入向导，选择演示/真实和匿名/身份；配置写入数据目录后服务自动重启。

`start-teamhub.sh` 会从根 workspace 构建 console/server，并默认使用 `~/teamhub-data/teamhub.sqlite`。只重启已构建产物可设 `TEAMHUB_SKIP_BUILD=1`。

## 3. 初始化与开放顺序

1. 以 loopback 启动并完成首启动向导。
2. 身份模式按全屏初始化门完成操作者、名册、组长及所需业务初始化。
3. 确认项目管理账户可以登录，并记录 PIN 恢复方式。
4. 运行一次数据备份。
5. 最后才以 `HUB_HOST=0.0.0.0` 重启并把地址交给队友。

非 loopback 写端点必须满足身份会话或 `TEAMHUB_WRITE_TOKEN` 写门。反代后设置 `TEAMHUB_TRUST_PROXY=true`；直接暴露时保持 false。

升级到 v0.73（AUTH-LOGIN-USERNAME）后：登录从下拉选人改为自输姓名（名册 displayName），会话是内存表，重启即全员重登——通知队友「输自己的名字 + 密码」即可；仍用旧 4 位 PIN 的账户登录后会被强制重设 ≥8 位密码。

## 4. 存储配置

- `TEAMHUB_DB_FILE=~/teamhub-data/teamhub.sqlite` 是六个结构化数据域的唯一生产数据库；缺失时正常模式拒绝启动。
- `TEAMHUB_ARTIFACT_FILES_DIR` 保存图纸/证据字节；它必须与数据库一起备份。
- `app_settings` 与六域业务事实同在 `TEAMHUB_DB_FILE`，不再有独立 config 文件或配置卷。
- 已删除的 `TEAMHUB_BACKEND`、`TEAMHUB_GOV_*` 和各域 `*_DATA_FILE` 不再产生任何运行行为。

## 5. Docker Compose

```bash
docker compose up -d --build hub
```

Compose 只声明 `hub_data` 与 `hub_artifacts` 两个卷。禁止对真实项目执行 `docker compose down --volumes`；仓库 smoke 脚本只允许名称含 `smoke` 的隔离项目，并会验证 buildId、六域同库及写入后重启读回。

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

## 9. HTTPS 反代（公网收口，2026-09-03 实测落地）

公网链路固定为：`浏览器 ──https──▶ Caddy(8445) ──http──▶ TeamHub(127.0.0.1:4177)`，不允许 4177 直接暴露公网。配套 Caddyfile 在仓库根（工作副本，实际生效于 `/etc/caddy/Caddyfile`）。

三个反代必需开关（缺一个就出生产事故）：

- `HUB_HOST=127.0.0.1`：服务只听回环，公网明文入口由 Caddy 独占。
- `TEAMHUB_TRUST_PROXY=true`：不设则 `isLoopbackOperator` 把公网访客当本机，本机专用端点（如 `/api/hermes/credential`）被误放行、写限流塌成全队单桶。
- `TEAMHUB_COOKIE_SECURE=true`：HTTPS 反代下会话 cookie 必须带 Secure。
- `TEAMHUB_WRITE_TOKEN` 必须固定写入 systemd 配置：`start-teamhub.sh` 默认每次重启随机生成，前端设置页无法跟随。存根放数据目录侧文件（0600），不进仓、不进日志。

Caddy 侧踩过的坑（复排时先看这里）：

- 云主机公网 IP 在网关 NAT 上，本机网卡没有这个地址，`bind` 公网 IP 会报 `cannot assign requested address`；只能 bind 内网 IP 或回环，公网入口由安全组 DNAT。
- 站点必须同时列出全部 Host（内网 IP + 公网 IP）。DNAT 进来的请求 Host 头是公网 IP，不匹配站点会返回空 200 → 浏览器白屏。排查时对比 `content-length` 而非只看状态码，并用公网实际 Host 测。
- 显式列 host + `auto_https disable_redirects` 比通配 `:port` 稳定（通配 + 自签在部分配置下握手失败）。
- 防火墙默认 deny 时记得放行反代端口，并删除已收口的直连端口残留规则。

验证清单：公网 HTTPS 200 且 content-length 与直连一致、`/health` buildId 非空、公网直连 4177 被拒、teamhub 与 caddy 均 active。备案+域名后：换真证书、切回标准 443。
