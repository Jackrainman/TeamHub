> 生成：2026-07-12 防石山审计 workflow（26 agent：6 维度扫描 + 对抗核实 + opus 综合）。

以下为交付文档（markdown 纯文本）。

---

# TeamHub 正式发布（v1.0）全链路设计

> 读者 = Robocon 战队队长（你自己）；目标 = 明年当学长时，下一届拿到一个文件、在可能断网的实验室里、十几分钟内把 TeamHub 装起来能用，且不丢老数据。
> 本文只做设计不动代码。所有"要动服务器/SSH/systemd"的步骤都停在 AGENTS §5 审批门前，等你白天拍板。
>
> 关键工程事实（决定了后面所有取舍）：
> - 三个包不是 npm workspaces，各自带 node_modules；运行时只有 `hub-server` 需要跑，`hub-console` 只出一坨静态 `dist/`（884K），由 server 单端口 4177 一起托管（`TEAMHUB_CONSOLE_DIST_DIR`）。
> - 运行时真正依赖：`fastify` + `@fastify/multipart` + `zod` + `hub-contracts/dist`——**全是纯 JS，无原生插件**；SQLite 用 node24 内置 `node:sqlite`，也无原生编译。→ 打好的 node_modules 可以跨机器直接拷，唯一硬约束是**目标机 node ≥ 24**。
> - 数据在 `~/teamhub-data/{kb,gov,inventory,baseline}.json` + `artifacts/` 目录，与代码目录分离；SQLite 是 opt-in。
> - 当前 VERSION=0.17.0，**仓库零 git tag**（从没发过版）。
> - dist 很小（console 884K + server 904K），dev 态 node_modules 很大（console 156M，多是 vite/playwright，运行时用不到）。

---

## 1. 发布时机判据（v1.0 gate checklist）

先厘清一个容易混的点：**"切一个 1.0 发布物"（打 tag + 产出 tarball）** 和 **"把它部署到战队服务器"** 是两件事。前者不碰服务器、不需要 §5 审批，随时能做；后者卡在 `REMOTE-ACCESS-DEPLOY` 审批门。本节判据只针对前者——**"这份东西配不配叫 1.0"**。

### 必须做完才配叫 1.0（阻塞项）

| 项 | 状态 | 为什么它挡 1.0 |
|---|---|---|
| 三支柱 + 路线 v4 四刀功能闭环 | ✅ 已完成（now.md：基准线/轻身份/我的视图/store 拆分/学习方向/审计债全落地，三包 verify:all 全绿 214/278/125，e2e-pillars 3 绿） | 这就是产品本体，已经齐了 |
| **离线安装物存在且经过验证**（tarball + INSTALL.md，在一台干净机器上从零装通） | ❌ 未做 | "1.0 = 下一届能无痛装起来"，装不起来就名不副实。**这是唯一真正的 1.0 阻塞，不是功能，是打包** |
| **一次冷启动走查**：空板模式（`TEAMHUB_DEMO_SEED=false`）起服、9 页 health-check 0 错、建一条任务→重启→还在（落盘真接通） | ⚠️ 需专门跑一遍 | 发给别人的东西必须验证过"新环境从零能用"，不能只验过你自己的开发机 |
| **UI 两处待定项拍板**：tech 主题设默认（`54055df`）、学习方向 3D 星图（`ad12c1b`）——now.md 明写"②③是否保留待用户看图定夺" | ⏳ 待你看图定夺 | 各自独立 commit 可单独 revert；1.0 门面不能带着"还没定要不要留"的东西发。**留=什么都不做，撤=各 `git revert` 一刀**。**待用户拍板** |
| README 徽章去掉 `status-building`、`v0.3-frozen` 这类"还在建"信号，改成 1.0 口径 | ❌ 未做（小工作量） | 对外门面自称 building 却打 1.0 tag，自相矛盾 |

### 明确不挡发布（附理由）

| 项 | 为什么不挡 |
|---|---|
| **真机部署到战队服务器** | 卡 §5 审批，且它是"发布之后的动作"。1.0 是"可安装物就绪"，不是"已上线"。上线走第 4 节链路、审批后再做 |
| kb/inv/baseline 仍是 JSON、没迁 SQLite | now.md §4.4 白纸黑字标为"有意的增量边界"，非遗漏。JSON 落盘工作良好，SQLite 是 opt-in 加分项，缺它不影响任何功能 |
| Hermes / 飞书 / 小龙虾 真实接入（INV-Hermes、KB-LARK） | 全卡外部基建（HUB-HERMES-ADAPTER / schema 定稿），产品定义里本就是"最后做、先搭壳"。mock-first 已足够 1.0 |
| 游戏工作室包 / MODULARIZATION-PHASE2 | D-083 明确"后置，先把 Robocon 写明白"。第一垂直包完整即可发 |
| 治理 AI 派生整簇（GOV-*、D-032~035）、DEPGRAPH-AI-AUTODRAW | D-039/D-083 主动"AI 退出治理"，这些是挂起/跳过状态，不是欠债 |
| 对外文档 / 英文 / 演示站、兴趣声明 | §7 明确后置/推迟。1.0 首要服务对象是"明年的你"，不是外部用户 |
| ARTIFACT-VERSION-SEMANTICS 进阶版本语义（钉旧版/按车分支） | open_for_decision，进阶 PLM 能力，最小版已落地。不做完整 PLM 是刻意的 |

### "最早可发布"估计（以剩余工作量计，不猜日期）

功能层面**零欠债**，剩下全是发布工程活：

- 拍板 UI 两处（看图，几分钟）——**S**
- 写 `scripts/release.sh` 产出离线 tarball + `INSTALL.md` + `CHANGELOG.md`——**M**
- 干净机器冷启动走查一遍——**S**
- README 转 1.0 口径 + `bump-version.sh major` 打 v1.0.0 tag + GitHub Release——**S**

**结论：距 1.0 只差一个"打包 + 一次干净装验证"的小冲刺（总量 S+M+S+S ≈ 一到两个工作单元），不需要任何功能开发。** 真机上线另算，卡审批。

---

## 2. 发布在哪

### 版本号策略：0.17.0 → 1.0.0

- AGENTS §7 原话："1.0 前破坏性也走 MINOR，**MAJOR 留给首个生产门**"——1.0.0 就是这个首个生产门，名正言顺。
- 操作：`VERSION_BUMP_LEVEL=major ./scripts/bump-version.sh`（或 `bump-version.sh major`），它会把根 `VERSION` + 三包 package.json/lock 一起推到 `1.0.0`，`/api/system/status.version` 与 `/health` 立即同源报告。**别手改 package.json**（§7 铁律，历史 bug 根因）。
- 打**仓库第一个 git tag**：`v1.0.0`（现在零 tag）。⚠️ AGENTS §5 把 "release/tag 删除" 列为审批项——**创建 tag 不在禁列**，但既然是首个正式 tag，建议连同"是否现在打 tag"一起跟你确认一次。**待用户拍板：现在打 v1.0.0，还是先把 tarball 验证过再打。**

### git tag + GitHub Release 产物清单

Release 页挂三样：

1. **`teamhub-1.0.0.tar.gz`**——离线预构建 tarball（第 3 节方案 B，主发布物）。
2. **`teamhub-1.0.0.tar.gz.sha256`**——校验和，队友核对下载没损坏。
3. **源码 zip/tarball**——GitHub 自动附带，够想自己 build 的人用。

Release notes 正文 = `CHANGELOG.md` 里 1.0.0 段落。

### 要不要 npm 发包 / docker 镜像

- **npm 发包：不做。** 三个包全是 `"private": true` 的内部包，产品是"整套自部署单实例"，不是给人 `npm install @teamhub/...` 的库。发到 npm 反而多一条要维护、离线还拉不到的链路。**结论：不值。**
- **docker 镜像（推 registry）：不做为主发布物。** 离线实验室里 `docker pull` 和 `npm install` 一样会撞 github:443/registry 不通的墙；要离线就得 `docker save` 出 tar 再 `docker load`，那还不如直接给 node tarball 轻。**仓库里的 Dockerfile/compose 保留**——它是"有网、想要卷隔离"的可选路径，也是第 3 节 tarball 内容清单的现成蓝图（它的 runtime stage 已经算好了最小运行时集合）。**结论：docker 留作可选，不作 1.0 主发布物。**

---

## 3. 打包方案对比

| 维度 | A：源码 + 目标机现场 build | B：预构建 tarball（推荐） | C：docker |
|---|---|---|---|
| 离线可装性 | ❌ 差。`npm install` 要拉网，实验室断网直接卡死；即便 git bundle 传了源码，装依赖仍需 registry | ✅ 最好。node_modules + dist 都打进去，落地即跑，全程不碰网 | ⚠️ 中。镜像得 `docker save`/`load` 离线搬运；还要目标机装了 docker |
| 体积 | 最小（只有源码，几 MB）——但代价是到场再拉几百 MB 依赖 | 中（server 生产 node_modules + 三份 dist，**几十 MB 级**，纯 JS 无原生库） | 大（含完整 node base 镜像，数百 MB） |
| node 版本耦合 | 目标机需 node≥24 + 能联网装依赖 | 目标机需 node≥24。**因纯 JS 无原生插件，node_modules 可跨机直接用**，不需重编译；可选连 node 二进制一起打进去彻底解耦 | 镜像自带 node，最解耦——但换来 docker 依赖 |
| 升级简便性 | 差（每次现场重装依赖，断网就跪） | ✅ 好（换一坨新 tarball、解压覆盖代码目录，数据目录不动） | 好（换镜像 tag 重起）——但离线搬镜像麻烦 |

**推荐 B（预构建 tarball）。** 理由：实验室断网是不可协商约束，A 直接出局；C 的解耦优点被"离线搬镜像 + 要装 docker"两条抵消；B 恰好命中——依赖全是纯 JS，打好的包拷到任何 node≥24 的机器落地即跑，升级就是换包解压。而且仓库现成的 `Dockerfile` runtime stage 已经把"最小运行时集合"算出来了（`npm ci --omit=dev` 装 contracts+server 生产依赖 → 拷三份 dist），`release.sh` 照抄这套逻辑到本地目录即可，不用重新设计。

### tarball 内容清单

```
teamhub-1.0.0/
├── VERSION                          # 1.0.0，运行时 banner/health 读它
├── INSTALL.md                       # 傻瓜安装说明（第 4 节）
├── start-teamhub.sh                 # 复用现成启动脚本，但发布版走 SKIP_BUILD（dist 已在包里）
├── install.sh                       # 新增：解压后一键落地（第 4 节详述）
├── apps/
│   ├── hub-contracts/
│   │   ├── dist/                     # 契约编译产物
│   │   ├── package.json
│   │   └── node_modules/            # 仅生产依赖（zod）
│   ├── hub-server/
│   │   ├── dist/                     # server 编译产物（含入口 dist/main.js）
│   │   ├── package.json
│   │   └── node_modules/            # 仅生产依赖（fastify + multipart + zod + 指向 ../hub-contracts）
│   └── hub-console/
│       └── dist/                     # 前端静态站（884K），server 单端口托管，**不含 node_modules**
├── scripts/
│   ├── backup-teamhub-data.sh       # 升级/回滚要用（第 5 节）
│   ├── migrate-gov-to-sqlite.mjs    # opt-in SQLite 迁移
│   └── migrate-robottarget.mjs      # 旧 gov.json 兼容迁移（D-080）
├── deploy/teamhub.env.example       # env 模板
└── CHANGELOG.md
```

**关键点：**
- **不打 `hub-console/node_modules`**（156M 的 vite/playwright 运行时一点用没有），只打它的 `dist/`。这一条就把体积从几百 MB 砍到几十 MB。
- server 的 node_modules 里那条 `@teamhub/hub-contracts` 是 `file:../hub-contracts` 链接——打包时确认它指向包内相对路径能解析（Dockerfile 已验证这套布局可行）。
- **待用户拍板：要不要把 node 二进制也打进 tarball？** 打进去=彻底不依赖目标机装 node（实验室机器可能连 node 都没有），代价是 tarball 大几十 MB 且分 OS/arch。战队服务器架构固定（一台），建议**打一份对应架构的 node**进去最省心；若目标机确定有 node≥24 则省掉。

---

## 4. 安装链路（从"拿到一个文件"到"浏览器能打开"）

### 队友视角的每一步

1. **拿到文件**：`teamhub-1.0.0.tar.gz`（U 盘/内网/git bundle 走 SSH 传，随便哪种离线方式）。
2. **核对没坏**：`sha256sum -c teamhub-1.0.0.tar.gz.sha256`。
3. **解压**：`tar xzf teamhub-1.0.0.tar.gz`。
4. **一键装**：`cd teamhub-1.0.0 && ./install.sh`。
5. **浏览器打开** banner 打印的地址（默认 `http://<内网IP>:4177`）。完。

### install.sh 该做什么

一个"落地脚本"，做且只做这些（不碰服务器全局、不 sudo，保持在 §5 边界内）：

1. **前置检查**：`node --version` ≥ 24，否则明确报错退出（"本机 node 版本不够，需 ≥24"）。若 tarball 内打了 node 二进制，则改用内置那份、跳过检查。
2. **初始化数据目录**：`mkdir -p ~/teamhub-data`（kb/gov/inventory/baseline/artifacts 的父目录），**若已存在则原样保留、绝不覆盖**（升级复用同一目录的关键）。
3. **写 env**：若 `~/teamhub-data/teamhub.env` 不存在，从 `deploy/teamhub.env.example` 拷一份，并**交互式问三件事**：
   - 只本机自己用，还是内网给全队？→ 决定 `HUB_HOST`（`127.0.0.1` vs `0.0.0.0`）。
   - 若选内网：`openssl rand -hex 32` 自动生成 `TEAMHUB_WRITE_TOKEN` 写进去（AGENTS 铁律 §2.7：非 loopback 暴露写端点必须配 token，否则拒启动）。
   - 匿名模式还是登录模式？→ `TEAMHUB_IDENTITY_MODE`（默认 anonymous=零门槛）。
   - 空板还是演示数据？→ `TEAMHUB_DEMO_SEED`（真实用设 false，想先玩玩留默认）。
4. **不做 build**（dist 已在包里），起进程时走 `TEAMHUB_SKIP_BUILD=1`。
5. **起进程**：按下面守护选型起服，打印访问地址 + buildId 校验命令。

### 进程守护选型（战队闲置服务器场景）

| 方案 | 适配度 | 说明 |
|---|---|---|
| nohup / tmux | ⚠️ 兜底 | 零依赖、现成（`nohup ./start-teamhub.sh &`）。**坑**：WSL 在 ssh 断开后会 reap 所有进程（memory 里的实测教训），常驻不可靠。战队真服务器（非 WSL）好一些，但开机不自启、崩了不拉起 |
| **systemd --user**（推荐目标形态） | ✅ 最佳 | 开机自启 + 崩溃自动拉起 + `journalctl` 收日志，且 `--user` 模式**不需要 sudo/root**（配合 `loginctl enable-linger` 让用户服务在未登录时也常驻）。**但**：写 unit 文件、enable-linger 属"部署动作"，卡 §5 审批。RUNBOOK §5 已说"审批批了就从 git 历史捞 v0.3 的 systemd 模板，别现造" |
| pm2 | ❌ 不推荐 | 又引一个 node 全局依赖，离线还要单独装，收益不抵成本 |

**推荐路线：install.sh 先用 nohup/tmux 让人当场能跑通（不越审批门）；正式常驻改 systemd --user，作为 `REMOTE-ACCESS-DEPLOY` 审批后的第一件事，模板从 git 历史 v0.3 捞（README 记载 v0.3 曾有"用户目录部署 + systemd 自启"）。** 这条明确**待用户审批**。

### 端口与局域网访问

- 单端口 **4177**，console + API 同端口（`start-teamhub.sh` 既有）。
- 本机自用：`HUB_HOST=127.0.0.1`。全队内网：`HUB_HOST=0.0.0.0` + 写 token。队友访问 `http://<服务器内网IP>:4177`。
- 若走 nginx 反代 / SSH 隧道：必须 `TEAMHUB_TRUST_PROXY=true`，否则写限流塌成"全队共用一个桶"可被 DoS（RUNBOOK §1.3 铁律）。直连暴露则保持 false。

### 首次启动种子数据策略

- **默认发布口径 = 空板**（`TEAMHUB_DEMO_SEED=false`）：真实团队要的是空白开工，不是 8 条假任务。install.sh 交互里默认引导到空板。
- **演示/走查 = 保留 demo seed**：想先看看长啥样的人选它，落一套演示场景。
- 两者只影响**新建**落盘文件，已有数据不受影响。这是现成能力（main.ts:68），无需新代码。

---

## 5. 升级与回滚

核心原则一句话：**代码目录可整个换，数据目录永不动。** 这靠"安装目录 ↔ `~/teamhub-data` 分离"天然成立。

### 升级流程（新 tarball 覆盖）

1. **先备份**（铁律 AGENTS §2.5）：`./scripts/backup-teamhub-data.sh`。它带时间戳快照 + **读回校验**（用启动加载器当 oracle，"备份能读回" ⟺ "启动能加载"），**校验不过就停手别升级**。→ 现有脚本**可直接复用**，无需改。
2. 解压新 `teamhub-1.1.0.tar.gz` 到**新目录**（不覆盖旧代码目录，留着回滚）。
3. 新目录里 `TEAMHUB_*_DATA_FILE` 仍指向同一个 `~/teamhub-data/*`——数据自动被新版本读到。
4. 停旧进程、起新进程（systemd 就 `systemctl --user restart`）。
5. **活体校验**：`curl -s http://127.0.0.1:4177/health | grep buildId` 确认换上的是新构建；再 `curl /api/tasks` 确认老数据还在。

**升级前自动备份**：把第 1 步塞进 install.sh 的"升级分支"（检测到 `~/teamhub-data` 已存在 = 升级场景 → 自动先跑 `backup-teamhub-data.sh`，校验不过就中止）。这样"升级必先备份"不靠人记性。

### 需要留意的迁移边界（数据不动原则的例外）

- **D-080 旧 gov.json**：含已砍的 `type:'requires'` 依赖的旧 gov.json，新版 FileGovStore fail-closed 会拒启动。升级前若数据是 6 月前的老库，先跑 `scripts/migrate-robottarget.mjs`。install.sh 升级分支可探测并提示。
- **opt-in SQLite**：只有你主动设了 `TEAMHUB_GOV_BACKEND=sqlite` 才涉及 `migrate-gov-to-sqlite.mjs`；默认 JSON 路径零迁移。
- 除这两个显式点外，JSON 落盘天然向后兼容（schema 只加 optional 字段），升级无迁移。

### 坏了怎么一步回滚

- **应用回滚**：旧代码目录还在（升级时没覆盖）→ 停新进程、起旧目录进程即可。或 `git checkout v1.0.0` 重 build。`/health` buildId 确认回到目标构建。
- **数据回滚**：从 `~/teamhub-data/backups/<name>.<时间戳>` 拷回对应文件，拷回前再跑一次备份留现场。
- **致命补丁**：冻结的 v0.3 代码在 git 历史，走 `git revert`。
- 这些 RUNBOOK §4 已成文，1.0 只需把"升级前自动备份 + 双目录并存回滚"补进 INSTALL.md 让新人照做。

---

## 6. 最小首发路径（接下来实际要做的事）

按依赖顺序，每项标工作量。这是把 1–5 收敛成的可执行清单。

| # | 事项 | 量 | 产出/落点 |
|---|---|---|---|
| 1 | **拍板 UI 两处**：tech 默认主题 + 学习方向 3D 星图 保留还是 revert | S | 决定即可；撤则各 `git revert 54055df`/`ad12c1b` |
| 2 | 新增 **`scripts/release.sh`**：干净 build 三包 → 按 Dockerfile runtime 逻辑收拢最小运行时集合（`npm ci --omit=dev` 装 contracts+server 生产依赖）→ 拼出第 3 节 tarball 目录 → `tar czf` + 生成 `.sha256` | **M** | `scripts/release.sh`（新增） |
| 3 | 新增 **`install.sh`**（打进 tarball）：node 版本检查 / 初始化并保留数据目录 / 交互写 env（host+token+identity+seed）/ 升级分支先自动备份 / SKIP_BUILD 起服 | **M** | `install.sh`（新增，随 release.sh 一起打包） |
| 4 | 新增 **`INSTALL.md`**：队友视角 5 步装 + 升级 + 回滚照抄清单（把 RUNBOOK 里散的收成傻瓜版） | S | `INSTALL.md`（新增，仓库根 + 打进 tarball） |
| 5 | 新增 **`CHANGELOG.md`**：Keep-a-Changelog 格式，1.0.0 段落汇总三支柱 + 路线 v4 | S | `CHANGELOG.md`（新增） |
| 6 | **干净机器冷启动走查**：解压 tarball → install.sh → 空板起服 → `npm run health-check` 9 页 0 错 → 建任务→重启→还在 | S | 一次验证，记录结果进 now.md |
| 7 | README 转 1.0 口径（去 building/v0.3 徽章、加安装入口指向 INSTALL.md） | S | `README.md` 编辑 |
| 8 | `bump-version.sh major` → 1.0.0，commit，**打 v1.0.0 tag** | S | VERSION+三包=1.0.0 |
| 9 | GitHub Release：挂 tarball + sha256 + CHANGELOG 正文 | S | `gh release create v1.0.0 ...` |
| 10 | （审批后，独立轨）**真机部署**：systemd --user 模板从 git v0.3 捞 + enable-linger + 反代/token/TRUST_PROXY 按 RUNBOOK | **L** | 卡 `REMOTE-ACCESS-DEPLOY` 审批，**待用户拍板** |

**新增文件汇总**：`scripts/release.sh`、`install.sh`、`INSTALL.md`、`CHANGELOG.md`（4 个）。**复用现成**：`start-teamhub.sh`（发布走 SKIP_BUILD）、`backup-teamhub-data.sh`（升级前备份）、`bump-version.sh`（版本切换）、`migrate-*.mjs`（边界迁移）、Dockerfile runtime stage（release.sh 的运行时集合蓝图）。

**关键判断复述**：v1.0 功能层零欠债，1–9 项全是发布工程活（总量约 2×M + 若干 S = 一到两个工作单元），做完就能切出经过验证的 1.0 离线安装物；第 10 项真机上线是审批后的独立轨，不阻塞"发布物就绪"。**两处待你拍板**：UI 两项去留（#1）、是否现在打 tag + 是否把 node 二进制打进 tarball（#8/#3）、以及真机部署审批（#10）。
