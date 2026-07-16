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

不带任何环境变量启动就是**演示态**：时钟冻结在一个演示锚点日，自带示例任务 / 车辆 / 排班 / 知识库语料。
先在这里把九个页面点一遍（页面清单见 [README](../../README.md#页面一览)），摸熟了再切真实态——
演示数据随便造随便删，不心疼。

## 3. 真实部署要做的三个决定

### ① 演示还是真实：`TEAMHUB_DEMO_SEED=false`

真实态 = 真实时钟 + 空板（只有赛季 / 项目 / 阶段元信息，没有虚构车和演示排班）。
**忘设的症状**：新建任务时间戳恒为演示锚点日、挂单池全员标红滞留。
该开关只影响**新建**的数据文件；已有数据文件按原样加载。

### ② 匿名还是登录制：`TEAMHUB_IDENTITY_MODE`

| | `anonymous`（默认） | `identity`（推荐真实团队用） |
|---|---|---|
| 读 | 谁都能看 | 谁都能看 |
| 写 | 共用一个写口令（`TEAMHUB_WRITE_TOKEN`） | 登录本人才能写，操作自动留名 |
| 管理员 | 无此概念 | 队长设 PIN 成为 superAdmin，角色 / 赛季 / 验收人等敏感设置须此身份 |
| 我的视图 | 不可用（没有"登录=某人"概念） | 可用 |
| 会话 | — | 存内存，**服务重启全员重登**；首次登录免 PIN，登录后自设 |

### ③ 怎么暴露给队友

- **第一步永远先绑 loopback**（默认 `127.0.0.1`），完成 §4 的初始化后再暴露。
- 直连内网：`HUB_HOST=0.0.0.0`。匿名模式此时**必须**配 `TEAMHUB_WRITE_TOKEN`（强随机：`openssl rand -hex 32`），否则 server 拒启动；身份模式写由会话把关，token 可不配。
- 挂在 nginx 反代 / SSH 隧道后面：再加 `TEAMHUB_TRUST_PROXY=true`（否则写限流全队共用一个桶）；**直连时保持 false**。

三个决定拼起来，真实部署的典型启动命令：

```bash
TEAMHUB_DEMO_SEED=false TEAMHUB_IDENTITY_MODE=identity \
  nohup ./start-teamhub.sh >teamhub.log 2>&1 &
```

数据落在 `~/teamhub-data/`（kb / gov / inventory / baseline / checklist 五个 JSON + artifacts 目录），
`start-teamhub.sh` 已默认接好全部落盘变量；要换路径见 §5 速查表。

## 4. 身份模式首次启动（顺序别乱）

空板 + 登录制有个先有鸡还是先有蛋的问题：名册里没人，谁也登录不了。名册导入自带**引导豁免**
（名册为空时上传免登录）来破局，但这也意味着**谁先上传谁说了算**——所以顺序必须是：

1. 起服，**保持 loopback**（先别绑 0.0.0.0）。
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
| `TEAMHUB_DEMO_SEED` | 未设=演示态 | `false` = 真实时钟 + 空板（§3①） |
| `TEAMHUB_IDENTITY_MODE` | `anonymous` | `identity` = 登录制（§3②） |
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

## 6. Docker Compose 路径

```bash
vi deploy/teamhub.env.example   # compose 读的就是这份；至少把 TEAMHUB_WRITE_TOKEN 换成强随机串
docker compose up -d --build hub
```

容器绑 `0.0.0.0:4177`（宿主端口用 `TEAMHUB_HOST_PORT` 覆盖），六个命名卷
（`hub_kb` / `hub_gov` / `hub_inv` / `hub_baseline` / `hub_checklist` / `hub_artifacts`）承载全部数据，
自带 `/health` 健康检查。演示 / 真实、匿名 / 登录同样在 env 文件里切。

## 7. 验证部署成功

```bash
curl -s http://127.0.0.1:4177/health                 # {"status":"ok",...,"buildId":"<git短SHA>"}
curl -s http://127.0.0.1:4177/api/system/status      # version 应与 VERSION 文件一致
```

再做一次**落盘活体校验**：建一条任务 → 重启服务 → 任务还在。最后打开设置页「部署信息」分区，
每个数据域"落盘 / 内存"如实标出，有"内存"字样就是漏了对应变量。

### 7.1 常见维护动作：队员忘了 PIN

产品里**没有**任何人能重置他人 PIN 的通道（superAdmin 也不行，名册重导也刻意不碰 PIN），
部署方只能手工清：

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
