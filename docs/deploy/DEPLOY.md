# TeamHub 部署指南（从零到全队可用）

> 面向：想把 TeamHub 部署给自己战队用的人——本校队友或其他学校都适用，不要求懂这套代码。
> 本文只管"从零跑起来"；备份 / 回滚 / 抹卷雷等运维纪律见 [RUNBOOK.md](RUNBOOK.md)。
> 服务器上有能执行命令的 AI 助手（Hermes / Claude 等）？直接用
> [给 AI 助手的部署提示词](ai-agent-deploy-prompt.md)，让它照本文替你干。

---

## 0. 你需要什么

- 一台 Linux / macOS / WSL 机器。**内网可达就够**（队友连的是内网 IP），不需要公网、不需要域名。
- **Node.js ≥ 24**（三个包的 `engines` 都要求；治理域可选 SQLite 用的 `node:sqlite` 也在 24 内置）+ git。
- 不需要任何数据库或其他服务。可选：Docker（见 §6）。

## 1. 装与构建

```bash
git clone https://github.com/Jackrainman/TeamHub.git
cd TeamHub
git checkout v0.25.0        # 公测就绪版；想跟最新开发进度就跳过这行

# 三个包各自独立（非 npm workspaces），先装被依赖的 contracts
npm --prefix apps/hub-contracts install
npm --prefix apps/hub-server install
npm --prefix apps/hub-console install

./start-teamhub.sh          # 自动构建 console + server，然后前台启动
```

看到启动横幅、浏览器打开 <http://127.0.0.1:4177> 有页面，就算装成了。
后台常驻用 `nohup ./start-teamhub.sh >teamhub.log 2>&1 &`；只重启不重建加 `TEAMHUB_SKIP_BUILD=1`。

## 2. 先在演示态摸一遍

第一次启动后浏览器打开，会有个**首启动向导**问你「先试试（演示数据）还是直接安装（正式使用）」。
选「**先试试**」就进**演示态**：时钟冻结在一个演示锚点日，自带示例任务 / 车辆 / 排班 / 知识库语料。
先在这里把九个页面点一遍（页面清单见 [README](../../README.md#页面一览)），摸熟了再转真实态（§3）——
演示数据随便造随便删，不心疼。

## 3. 真实部署的两个选择：向导里点选，不改 env

以前"演示 / 真实"和"匿名 / 登录"是两个模式类环境变量，现在**降为产品内配置**，落盘 `config.json`
（默认 `~/teamhub-data/config.json`），由**首启动向导**点选、**设置页可改**、改完自动重启生效——
人类路径全程零 env。

### ① 演示还是真实、匿名还是登录：首启动向导

第一次打开的向导，第 1 步两张大卡二选一：

- 「**先试试**」= 演示态（冻结时钟 + 示例数据），随便点不心疼。
- 「**直接安装**」= 真实态（真实时钟 + 空板，只有赛季 / 项目 / 阶段元信息），追问一格「写操作要登录吗」：

  | | 匿名共用 | 登录制（推荐真实团队用） |
  |---|---|---|
  | 读 | 谁都能看 | 谁都能看 |
  | 写 | 共用一个写口令（`TEAMHUB_WRITE_TOKEN`） | 登录本人才能写，操作自动留名 |
  | 管理员 | 无此概念 | 队长设 PIN 成为 superAdmin，角色 / 赛季 / 验收人等敏感设置须此身份 |
  | 我的视图 | 不可用（没有"登录=某人"概念） | 可用 |
  | 会话 | — | 存内存，**服务重启全员重登**；首次登录免 PIN，登录后自设 |

选完自动写 `config.json` 并重启，几秒后就绪。**之后随时能在 设置 → 部署配置 改**：切换登录方式、
或从演示态点「结束试驾，转正式」（演示数据归档到 `~/teamhub-data/demo-archive-<时间戳>/`，挪走不删可找回）。
数据落在 `~/teamhub-data/`（kb / gov / inventory / baseline / checklist 五个 JSON + artifacts 目录），
`start-teamhub.sh` 已默认接好全部落盘变量；要换路径见 §5 速查表。

### ② 怎么暴露给队友

- **第一步永远先绑 loopback**（默认 `127.0.0.1`），走完向导 + §4 的初始化后再暴露。
- 直连内网：`HUB_HOST=0.0.0.0`。匿名模式此时**必须**配 `TEAMHUB_WRITE_TOKEN`（强随机：`openssl rand -hex 32`），否则 server 拒启动；身份模式写由会话把关，token 可不配。
- 挂在 nginx 反代 / SSH 隧道后面：再加 `TEAMHUB_TRUST_PROXY=true`（否则写限流全队共用一个桶）；**直连时保持 false**。

典型启动命令（模式由向导点选，命令里不带任何模式 env）：

```bash
nohup ./start-teamhub.sh >teamhub.log 2>&1 &
```

## 4. 身份模式首次启动（顺序别乱）

在向导里选了「直接安装 + 登录制」后，空板 + 登录制有个先有鸡还是先有蛋的问题：名册里没人，谁也登录不了。
名册导入自带**引导豁免**（名册为空时上传免登录）来破局，但这也意味着**谁先上传谁说了算**——所以顺序必须是：

1. 起服，**保持 loopback**（先别绑 0.0.0.0），跟随向导选「直接安装 + 登录制」。
   （重启后落到设置页，有「三步走：导入名册 → 登录本人 → 初始化管理员」引导横幅。）
2. 打开设置页「成员与权限」→ 下载名册 CSV 模板 → 本地 Excel 填好（姓名 / 年级 / 组 / 组长 / 验收人，
   另存 CSV 即可，GBK / UTF-8 都认）→ 上传，核对导入报告。
3. 右上角登录本人（首次免 PIN）。
4. 设置页「初始化管理员」设 PIN——同一笔成为 superAdmin。
5. **最后**才停服、加 `HUB_HOST=0.0.0.0` 重启、把地址发给队友。

远程服务器上做第 2–4 步，用 SSH 隧道最省事：本机跑
`ssh -L 4177:127.0.0.1:4177 <用户>@<服务器>`，然后浏览器开 <http://127.0.0.1:4177>。
更多细节（含豁免窗口的安全警示）见 [RUNBOOK §1.6](RUNBOOK.md)。

## 5. 环境变量速查表

`start-teamhub.sh` 已把落盘类全部接好默认值；下表供自定义环境（systemd / 手写脚本）核对。

| 变量 | 默认 | 作用 / 漏设症状 |
|---|---|---|
| `HUB_HOST` | `127.0.0.1` | 监听地址；`0.0.0.0` = 暴露内网 |
| `HUB_PORT` | `4177` | 单端口同时托管前端和 API |
| `TEAMHUB_CONFIG_FILE` | `~/teamhub-data/config.json` | 部署配置（演示/真实、匿名/登录）落盘路径；模式由**向导**点选写入这里，非 env（见 §3 与下方无头路径） |
| `TEAMHUB_WRITE_TOKEN` | 无 | 匿名模式绑非 loopback 时**必填**，否则拒启动 |
| `TEAMHUB_TRUST_PROXY` | `false` | 反代 / 隧道后**必须** `true`；直连保持 `false` |
| `TEAMHUB_KB_DATA_FILE` | `~/teamhub-data/kb.json` | 知识库落盘；漏设=内存态，重启清零 |
| `TEAMHUB_GOV_DATA_FILE` | `~/teamhub-data/gov.json` | 任务 / 依赖 / 结案落盘；漏设=重启清零 |
| `TEAMHUB_INV_DATA_FILE` | `~/teamhub-data/inventory.json` | 库存落盘；漏设=重启清零 |
| `TEAMHUB_BASELINE_DATA_FILE` | `~/teamhub-data/baseline.json` | 基准线落盘；漏设=重启清零 |
| `TEAMHUB_CHECKLIST_DATA_FILE` | `~/teamhub-data/checklist.json` | 检查单 / 欠条落盘；漏设=重启清零 |
| `TEAMHUB_ARTIFACT_FILES_DIR` | `~/teamhub-data/artifacts` | 图纸文件目录；漏设=上传报 400、下载报 404 |
| `TEAMHUB_GOV_BACKEND` | 空=JSON | 设 `sqlite` 切 SQLite（须配 `TEAMHUB_GOV_SQLITE_FILE`） |
| `TEAMHUB_GOV_SQLITE_FILE` | `~/teamhub-data/gov.sqlite` | 仅 SQLite 后端时生效 |
| `TEAMHUB_TENANT_MODULES` | 空=全启 | 逗号分隔启用模块子集；含未知 id 拒启动 |
| `TEAMHUB_CONSOLE_DIST_DIR` | 脚本自动设 | console 静态站目录；自定义启动别漏 |
| `TEAMHUB_SKIP_BUILD` | `0` | `1` = 跳过构建只重启 |

### 5.1 无头 / 自动化路径（CI、脚本化部署，跳过浏览器向导）

没有浏览器点向导的场景，二选一让 server 跳过向导直接进正常模式（都不需要任何模式类 env）：

1. **预置 `config.json`**：起服前把一份合法配置写进 `TEAMHUB_CONFIG_FILE` 指向的路径（或 compose 卷）：
   ```bash
   mkdir -p ~/teamhub-data && cat > ~/teamhub-data/config.json <<'JSON'
   { "schemaVersion": 1, "dataMode": "real", "identityMode": "identity", "initializedAt": "2026-01-01T00:00:00.000Z" }
   JSON
   ```
   `dataMode` = `demo`/`real`，`identityMode` = `anonymous`/`identity`。坏文件会 fail-closed 拒启动。
2. **起服后 curl init**：先起服（无 config → setup 模式），再一条命令初始化并等自动重启完成：
   ```bash
   curl -X POST http://127.0.0.1:4177/api/setup/init \
     -H 'content-type: application/json' \
     -d '{"dataMode":"real","identityMode":"identity"}'
   ```

## 6. Docker Compose 路径

```bash
vi deploy/teamhub.env.example   # compose 读的就是这份；至少把 TEAMHUB_WRITE_TOKEN 换成强随机串
docker compose up -d --build hub
```

容器绑 `0.0.0.0:4177`（宿主端口用 `TEAMHUB_HOST_PORT` 覆盖），六个命名卷
（`hub_kb` / `hub_gov` / `hub_inv` / `hub_baseline` / `hub_checklist` / `hub_artifacts`）承载全部数据，
自带 `/health` 健康检查（`config.json` 落在 `hub_config` 卷、跨重启持久）。演示 / 真实、匿名 / 登录
由首启动向导点选（首次浏览器打开 `http://<宿主>:4177` 即向导）；无头场景按 §5.1 预置 config 或 curl init。

## 7. 验证部署成功

```bash
curl -s http://127.0.0.1:4177/health                 # {"status":"ok",...,"buildId":"<git短SHA>"}
curl -s http://127.0.0.1:4177/api/system/status      # version 应与 VERSION 文件一致
```

再做一次**落盘活体校验**：建一条任务 → 重启服务 → 任务还在。最后打开设置页「部署信息」分区，
每个数据域"落盘 / 内存"如实标出，有"内存"字样就是漏了对应变量。

### 7.1 常见维护动作：队员忘了 PIN

**第一级 · 产品通道（v0.27.0 起，推荐）**：superAdmin 登录 → 设置页「成员与权限」→ 该成员行点「重置 PIN」。
效果是清除该成员的 PIN 散列——TA 下次登录回到"首次免 PIN"状态，登录后自行重设。
重置口不经手新 PIN 明文（管理员看不到也设不了他人口令）。

**第二级 · 宿主 loopback curl（v0.28.0 起；唯一 superAdmin 自己忘 PIN、无人能登录时）**：
在宿主本机（或 SSH 隧道到宿主的会话）对 loopback 发一条 DELETE 即可重置——
来自 loopback 的请求豁免 superAdmin 判定（宿主操作员本就能直接编辑 gov.json，不引入新权限面；
非 loopback 来源行为不变）：

```bash
# 先查成员 id（读端点无需登录）
curl -s http://127.0.0.1:4177/api/members
# 重置该成员 PIN（<memberId> 换成上一步的 id）
curl -X DELETE http://127.0.0.1:4177/api/members/<memberId>/pin
```

效果与产品通道相同：该成员回到"首次免 PIN"状态，登录后自行重设。
若部署配了 `TEAMHUB_WRITE_TOKEN`（非 loopback 暴露的实例必须配），curl 须加
`-H "Authorization: Bearer <token>"`（写门 Bearer 检查不受 loopback 豁免影响）。
部署在反代后且开了 `TEAMHUB_TRUST_PROXY=true` 时，须真正从宿主本机 / SSH 隧道发起
（转发头须解析为 loopback）；经远端客户端访问无效（按设计）。

**第三级 · 手工兜底（服务起不来时）**：

1. 停服，跑一次 `./scripts/backup-teamhub-data.sh`。
2. 编辑治理数据文件（默认 `~/teamhub-data/gov.json`）：找到该成员条目，删掉 `pinHash` 字段。
   SQLite 后端则用 sqlite 工具改 `gov.sqlite` 里对应成员记录。
3. 重启。该队员下次登录回到"首次免 PIN"状态，登录后重新自设。

## 8. 升级与回滚

```bash
./scripts/backup-teamhub-data.sh    # 铁律：动之前先备份——五个数据域 JSON 全备并读回校验
                                    # （图纸文件目录不含在内，需要时自行 tar ~/teamhub-data/artifacts）
git fetch --tags && git checkout <新tag>
npm --prefix apps/hub-contracts install && npm --prefix apps/hub-server install && npm --prefix apps/hub-console install
./start-teamhub.sh                  # 重建 + 重启，/health 的 buildId 应变化
```

回滚 = `git checkout <旧tag>` 走同样流程；数据回滚从备份拷回。详见 [RUNBOOK §4](RUNBOOK.md)。
