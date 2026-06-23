# TeamHub 部署 / 运维 Runbook

> 范围：把上线前后的运维纪律集中成一处可照做的清单（A8）。**真自动部署脚本（deploy + 回滚 +
> systemd）仍被 §8 安全门 + `REMOTE-ACCESS-DEPLOY` 决策锁着——本文只覆盖已存在的启动路径
> （`start-teamhub.sh` 单端口 / `compose.yaml`），不含未审批的远程写。** 决策批了再从 git 历史捞
> v0.3 的 systemd 模板（README 记载其已有「用户目录部署 + systemd 自启」），别现造。

---

## 0. 两种启动形态

| 形态 | 命令 | 数据落点 |
|---|---|---|
| 单端口主机 | `./start-teamhub.sh`（`nohup … &` 常驻） | 主机文件 `~/teamhub-data/{kb,gov}.json` |
| Docker Compose | `docker compose up -d --build hub` | 命名卷 `hub_kb` / `hub_gov` / `hub_artifacts` |

两者都 4177 单端口同时托管 console 静态站 + API。

---

## 1. 上线前必做（按顺序）

1. **先备份**（铁律，AGENTS §2）：
   ```bash
   ./scripts/backup-teamhub-data.sh        # 主机文件路径
   ```
   compose 卷用脚本末尾打印的 `docker run … tar` 等价命令。备份会读回校验，**校验不过别继续**。

2. **写鉴权 token 强随机**（H3，见 [dev-debug-archive H3](../dev-debug-archive/2026-06-14-audit-h3-write-endpoint-auth.md)）：
   ```bash
   openssl rand -hex 32        # 填进 TEAMHUB_WRITE_TOKEN，别留 change-me 占位
   ```
   `HUB_HOST` 非 loopback（compose 用 `0.0.0.0`）时**必须**配，否则 server 拒启动。

3. **反代后开 TRUST_PROXY**：4177 在 nginx 反代 / SSH 隧道后面时设 `TEAMHUB_TRUST_PROXY=true`，
   否则写限流塌成**全队共用一个桶**（任一客户端可 DoS 全队写入）。**直连暴露时保持 false**
   （否则 `X-Forwarded-For` 可伪造）。

4. **落盘 env 都接上**：`TEAMHUB_KB_DATA_FILE` + `TEAMHUB_GOV_DATA_FILE` + `TEAMHUB_INV_DATA_FILE` 都要设——
   **漏哪个，对应支柱数据每次重启清回 fixture**（漏 gov→PM/图纸/结案丢；漏 inv→库存盘点/拆装/快记丢；A1 同源教训，见 [H5](../dev-debug-archive/2026-06-14-audit-h5-compose-phantom-postgres.md)）。
   `start-teamhub.sh` / `compose.yaml` 已默认接好，自定义环境别漏。

5. **空板 vs 演示**：真实团队设 `TEAMHUB_DEMO_SEED=false`（新建落盘文件 seed 空板）；走查留默认（演示场景）。

---

## 2. 上线后活体校验（feiyue `?v=` + cache MISS 的等价）

```bash
# 在服的是哪个构建？（buildId = git short SHA，重启 / 重部署后应变化）
curl -s http://127.0.0.1:4177/health | grep buildId

# 健康 + 落盘真接通：建一条、重启、还在
curl -s http://127.0.0.1:4177/api/tasks   # 重启后真实录入应仍在（漏 gov 落盘则会消失）
```

`start-teamhub.sh` 启动横幅已打印这条 buildId 校验命令。

---

## 3. 数据安全护栏

- **抹卷雷**：`scripts/verify-hub-compose.sh` 会 `down --volumes`，已加护栏只许对 `*smoke*` 项目跑
  （见 [H1 系列同源纪律]）。**切勿**把那条 `--volumes` 复制到操作真项目的脚本里。
- **备份保留**：`backup-teamhub-data.sh` 带时间戳、读回校验；建议挂个 cron / 在每次重部署前手跑。
- **重建前**：跑 compose 重建、`down`、改卷之前，先 `backup-teamhub-data.sh`。

---

## 4. 回滚

- 应用回滚：`git revert` / `git checkout <旧tag>` 后重 build + 重启；用 `/health` 的 buildId 确认换上的是目标构建。
- 数据回滚：从 `~/teamhub-data/backups/<name>.<时间戳>` 拷回，重启前再跑一次 `backup-teamhub-data.sh` 留现场。
- 致命补丁：冻结的 v0.3 代码留在 git 历史，走 `git revert` 捞。

---

## 5. 仍待审批（§8 门 / `REMOTE-ACCESS-DEPLOY`）

下列在用户白天审批 + `REMOTE-ACCESS-DEPLOY` 决策拍定前**不做**：写真实服务器、SSH、systemd、
80/443、真实数据迁移、自动部署脚本。届时：复用 git 历史里的 v0.3 systemd 模板 + 本 runbook 的
TRUST_PROXY / token / 备份 / 活体校验清单，不重新设计。

---

## 6. 排障指针

TeamHub 自身工程 bug 的归档在 [`docs/dev-debug-archive/`](../dev-debug-archive/README.md)（H1–H5
部署前审计）。新工程 bug 修完 → 在那加一张卡 → 规则引其症状/errorCode（bug→铁律可追溯）。
