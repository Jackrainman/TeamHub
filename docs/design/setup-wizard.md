# SETUP-WIZARD：首启动向导 + 配置落盘层 + 设置页部署配置区（v2，已批准开工）

> 状态：**已批准开工**（2026-07-16 用户批稿"没有问题，开始编程"；§10 三个开放问题未另行指定，
> 按推荐默认执行并已回填拍板记录。v2 修订：用户追问"env 还有必要保留吗"→ 模式类 env 退役，
> config.json 成唯一真相，见 §0 末行）。
> 缘起：用户对公测部署故事的三点反馈——①正式部署应该"直接点开就问是要测试还是直接安装"，
> 而不是改 env；②`TEAMHUB_IDENTITY_MODE` 应在初始化时选择；③"两个模式切换起来太麻烦了"。

## 0. 本轮已拍的三个裁决（讨论记录）

| 议题 | 候选 | 裁决 |
|---|---|---|
| 匿名模式命运 | A. 砍掉单轴化（分叉编目：全仓 28 处 mode 分叉、24 处可塌；正式部署中匿名无独特价值，演示零门槛可由自动登录替代）B. 保留双模式 | **B. 保留双模式**——D-083「匿名模式整体保留供选择」维持不变；向导让人选，不替人砍 |
| 向导防抢注 | A. 一次性安装码（Jupyter 式，顺带收豁免窗口 nit）B. 沿用 loopback 纪律 | **B. 沿用 loopback 纪律**——不加码；豁免窗口 nit 继续留档（beta-readiness §6） |
| 节奏 | A. 直接开工 B. 先设计稿 | **B. 先设计稿**（本文档），批了再开刀 |
| 模式类 env 去留（v2 追问） | A. 保留为无头通道（config>env 优先级）B. 退役，config.json 唯一真相 | **B. 退役**（用户追问"env 还有必要保留吗"后 v2 修订）：`TEAMHUB_DEMO_SEED`/`TEAMHUB_IDENTITY_MODE` 两个 env 删除；无头/自动化场景改走"预置 config.json 或 curl init"。运维类 env（端口/路径/密钥/反代/存储后端）保留——它们是环境属性且含密钥，config.json 的位置本身就由它们决定 |

分叉编目底稿：workflow `anon-mode-blast-radius`（wf_5ff03910）,28 处分叉清单可在需要时回放。

## 1. 目标 / 非目标

**目标**

1. 第一次打开 TeamHub，页面直接问"先试试（演示数据）还是直接安装（正式使用）"，正式路径顺手选登录方式（匿名 / 登录制）——**人类路径零 env**。
2. 模式（演示/正式、匿名/身份）从"部署期 env"降为"产品内配置"：落盘 `config.json`，**设置页可改**，改完自动重启生效。"切换麻烦"的解法 = 把重启自动化，而不是砍模式。
3. **模式类 env 退役**（v2）：`TEAMHUB_DEMO_SEED` / `TEAMHUB_IDENTITY_MODE` 删除，config.json 是唯一真相；
   运维类 env（端口/监听/落盘路径/WRITE_TOKEN/TRUST_PROXY/GOV_BACKEND）保留不动。

**非目标**

- 不砍匿名模式（已裁决保留）。
- 不做安装码 / 不改抢注模型（沿用"先 loopback 初始化再暴露"纪律）。
- 不做免重启热切换（store 引用在路由注册时已被闭包捕获，热切换需要可变引用层，风险大收益小；重启只需几秒且自动）。
- 不做"正式 → 演示"反向门（防误触清库；要演示另起实例或另起数据目录）。

## 2. 配置落盘层：`config.json`

新增部署配置文件，默认 `~/teamhub-data/config.json`（路径可由 `TEAMHUB_CONFIG_FILE` 覆盖）：

```jsonc
{
  "schemaVersion": 1,
  "dataMode": "demo" | "real",        // 对应今天的 TEAMHUB_DEMO_SEED（true/缺省=demo，false=real）
  "identityMode": "anonymous" | "identity",
  "initializedAt": "<ISO 时间戳>"      // 由向导或首次固化写入
}
```

- zod schema 放 hub-contracts（`deploy-config.ts`），server 启动严格解析，坏文件 fail-closed 拒启动（同 gov.json 纪律）。
- **config.json 是模式的唯一真相**（v2）：`TEAMHUB_DEMO_SEED` / `TEAMHUB_IDENTITY_MODE` 两个 env 同刀删除
  （main.ts 不再读取；start-teamhub.sh / compose / env.example 同步清理），不存在"优先级"问题。
- 运维类 env（端口、落盘路径、WRITE_TOKEN、TRUST_PROXY、GOV_BACKEND 等）**不进 config、保留为 env**——
  它们是环境属性不是产品选择（config.json 自己的位置就由它们决定），其中密钥不能进数据目录明文配置，向导也不问。

## 3. 未初始化状态机

server 启动时序改为两态（v2 简化，原"env 显式设值固化跳过"分支随模式 env 一起删除）：

```
config.json 存在 ──→ 正常启动（按 config 建店、注册全部路由）
config.json 不存在 ─→ **setup 模式**
```

**setup 模式**下只注册：静态站托管、`GET /health`（带 `setupPending: true`）、
`GET /api/setup/state`、`POST /api/setup/init`。不建任何数据 store、不落任何种子——
"选了才 seed"，这是向导能选"真空板"的前提。

`POST /api/setup/init`：body = `{dataMode, identityMode}`（zod 校验）→ 写 config.json →
回 `{restarting: true}` → 延迟 ~500ms `process.exit(42)`。已初始化后再调恒 409（多标签页幂等）。

**无头 / 自动化路径**（CI 冒烟、脚本化部署、纯 API 演示）二选一，无需任何模式 env：

1. 起服前把一份合法 `config.json` 预置进数据目录 / compose 卷；
2. 起服后 `curl -X POST /api/setup/init -d '{"dataMode":"demo","identityMode":"anonymous"}'`，等自动重启完成。

**升级迁移**：既有 v0.25.x 部署（有数据文件、无 config.json）升级后**会见一次向导**。向导检测到数据目录
非空时显示"检测到已有数据——本次只写配置，不动任何数据"提示；dataMode 语义本就只影响**新建**落盘文件
（K6 裁决），既有数据按原样加载，选什么都不会被清。选完固化，之后不再出现。RUNBOOK 加升级注记。

## 4. 自动重启机制

约定 **exit code 42 = 请求重启**：

- `start-teamhub.sh` 末尾的 `exec node dist/main.js` 改为循环：
  ```bash
  while :; do
    node "${SERVER_DIR}/dist/main.js"; code=$?
    [[ $code -eq 42 ]] && { echo "配置已更新，自动重启…"; continue; }
    exit $code
  done
  ```
  正常崩溃（非 42）不重启、原样退出——不引入"崩了就无限拉起"的新行为。
- `compose.yaml` 加 `restart: on-failure`（exit 42 非零即触发；顺带补上容器崩溃自愈，此前无 restart 策略）。
- 前端提交向导后轮询 `/health`，`buildId` 复活即整页刷新。

## 5. 向导 UI 流（console）

`App.tsx` 启动时若 `GET /api/setup/state` 返回未初始化 → 整个 app shell 换成全屏向导（现有页面一个都不渲染，store 未建、渲染了也全是错）：

- **第 1 步（唯一必答）**：两张大卡二选一——
  - 「**先试试**」：带一套演示任务/车辆/排班，随便点不心疼 →（可选折叠"高级"：演示态也开登录制，默认匿名）→ 提交。
  - 「**直接安装**」：真实空板 → 追问一格"写操作要登录吗"：**登录制（推荐：认领/验收留名，不设 PIN 就是点名字即登录）** / 匿名共用（最省事，写操作不留名，暴露内网需共享口令）→ 提交。
  - 两张卡下方各一行小字：「**之后随时可在 设置 → 部署配置 更改**」。
- 提交 → "正在应用配置，服务将自动重启（约 10 秒）" → 轮询复活 → 刷新。
- 重启后落点：试驾 → 总览页；正式+身份 → 设置页并高亮引导横幅"三步走：导入名册 → 登录本人 → 初始化管理员"（**复用现有名册导入/初始化管理员流程，向导不重复实现**）；正式+匿名 → 总览空态。

## 6. 设置页「部署配置」写区（新分区）

把 K3 的只读「部署信息」升级出一个可写邻区，三个动作全走"确认弹窗 → 调 API 写 config → exit 42 自动重启 → 前端轮询刷新"：

1. **登录方式切换**（匿名 ⇄ 身份）：身份模式下须 superAdmin；匿名模式下走写门（与现有敏感门非对称裁决一致）。身份→匿名弹窗警示"认领/验收将不再留名，会话全部失效"；匿名→身份弹窗提示"重启后需名册与管理员初始化（若尚未做过）"。
2. **结束试驾，转正式**（单向门）：把演示数据文件**归档**到 `~/teamhub-data/demo-archive-<时间戳>/`（挪走不删除，可手工找回）→ `dataMode=real` → 重启进真空板。按钮只在 `dataMode=demo` 时出现。
3. 新 API：`PUT /api/setup/config`（改 identityMode）、`POST /api/setup/graduate`（转正式）。鉴权同上；两者都不允许在 setup 模式调用。

分区底部常驻一行："更改部署配置会自动重启服务（约 10 秒），全员需要刷新页面、登录制下需要重新登录。"

## 7. 文档同步（批后与刀③一起做）

- README「给战队正式部署」段：删两个 env 前缀的启动命令，改为"启动后浏览器打开，向导里选"。
- DEPLOY.md §3 三个决定改为"向导里点选"；§4 顺序简化（向导接管）；§5 速查表**删除** `TEAMHUB_DEMO_SEED` / `TEAMHUB_IDENTITY_MODE` 两行，换成一行 `TEAMHUB_CONFIG_FILE`（config.json 路径，默认 `~/teamhub-data/config.json`）+ 无头路径说明（预置 config 或 curl init）。
- start-teamhub.sh 头部注释、deploy/teamhub.env.example、compose.yaml：同步删除两个模式变量的全部残留（全仓 grep 复核零命中，照 K4 清死变量先例）。
- ai-agent-deploy-prompt.md 第一段第 4 步删两个 env 前缀（助手只负责起服，模式由用户在向导里自己点）——**助手的活变得更少更安全**。
- RUNBOOK §1.6 改引用向导流程。

## 8. 分刀与触及面

| 刀 | 内容 | 量级 |
|---|---|---|
| 刀① 配置层+状态机 | hub-contracts `deploy-config.ts` + main.ts 三态启动 + setup 三端点 + exit 42 + start 脚本循环 + compose restart | 中 |
| 刀② 向导 UI | App.tsx setup 分支 + 全屏向导组件 + 复活轮询 + i18n | 中 |
| 刀③ 设置页部署配置区+文档 | 两写 API + 分区 UI + 演示归档 + §7 文档四处 | 中小 |

现有测试面：main.ts 启动逻辑测试、health-check 需加"setup 模式渲染向导"用例；`POST /api/setup/init` 幂等 409 用例；config 坏文件 fail-closed 用例；演示归档后文件确在归档目录用例。**装置改造**（v2，模式 env 退役的连带）：e2e/health-check 与 verify-hub-compose.sh 冒烟在起服前预置 config.json（或起服后先 curl init 再跑既有断言）；hub-server 单测不受影响（直接 buildHubServer(options) 构造，不经 env）。

## 9. 风险与对策

- **config 写坏 → 循环起不来**：fail-closed 拒启动是既有纪律；exit 非 42 循环即停，不会无限重启。修复路径=删/修 config.json（文档写明）。
- **向导抢注窗口**：沿用 loopback 纪律（已裁决），DEPLOY/RUNBOOK 既有警示继续背书；残余风险与名册豁免窗口同级、同留档。
- **演示归档失败中途**：先归档后写 config，任一步失败即中止且不重启（数据完好，报错给操作者）。
- **无头/自动化部署死等向导**（v2 改口径）：不再有 env 兜底——预置 config.json 或 curl init 二选一，写进 DEPLOY 无头小节；compose 冒烟脚本自带 init 步。
- **升级用户突见向导**（v2 新增）：既有 v0.25.x 部署升级后见一次向导属预期行为；向导内"检测到已有数据、不动数据"提示 + RUNBOOK 升级注记双保险，且 dataMode 只影响新建文件（K6），误选也不清库。

## 10. 开放问题（2026-07-16 批稿拍板：用户批"没有问题"未另行指定，按推荐默认执行）

1. 试驾态的"高级：演示+登录制"折叠项 → **做**（成本≈0，默认收起、默认匿名）。
2. `POST /api/setup/graduate` 转正式后的名册导入 → **引导横幅跳设置页**（复用现有流程，不嵌弹窗不重复实现）。
3. 匿名⇄身份切换在匿名侧的鉴权 → **走写门**（与现状双模式非对称裁决一致，不特殊收紧）。

## 11. 实现期偏离（刀① 落地记录，2026-07-18）

刀①（配置层+状态机+重启循环，对应 §2/§3/§4）落地时与设计稿的偏离 / 落点选择，如下留档（未静默）：

1. **start-teamhub.sh 重启循环写法**：§4 示例是 `node …; code=$?`，但脚本头有 `set -euo pipefail`——裸 `node`
   非零退出会先触发 `set -e` 中止、拿不到 `$?` 就无法判 42。改为 `if node …; then code=0; else code=$?; fi`
   承接退出码，**语义与 §4 逐字一致**（42→continue，其余→`exit $code`），仅为兼容 `set -e`。
2. **setup 三端点契约落点**：`SetupInitRequestSchema` / `SetupInitResponseSchema` / `SetupStateResponseSchema`
   与 `DeployConfigSchema` 一并放 `hub-contracts/deploy-config.ts`（单一源、前后端复用），而非 server 内联声明。
   §3 只定义了形状、未指定落点，此为实现选择。
3. **compose.yaml 除 `restart: on-failure` 外**另加 `TEAMHUB_CONFIG_FILE` env + `hub_config` 卷——config.json
   须跨 exit-42 重启持久，否则容器重建即丢、每次回到向导。呼应 §3「预置 config.json / compose 卷」，是让两态
   模型在容器里真正成立的必要接线（§8 只点名"加 restart"）。
4. **全仓 grep 尚未字面归零**：两处模式类 env 名残留在本刀范围外——(a)
   `apps/hub-console/src/features/settings/SettingsPage.tsx`（设置页「部署信息」区，§6 归刀③重写）、
   (b) `docs/*.md`（§7 归刀③）。本刀自有文件（hub-contracts / hub-server / start-teamhub.sh / compose.yaml /
   deploy/teamhub.env.example）已零命中。
5. **setup 模式 server 不施加 H3「非 loopback 无 writeToken 拒启」闸**：按 §0/§9 loopback 纪律裁决（不加安装码），
   首启动 `HUB_HOST=0.0.0.0` 会暴露 `POST /api/setup/init`，属 §9 已留档的残余风险（与名册豁免窗口同级）。非偏离，口径备注。
6. **e2e/health 装置改造范围**：本刀已改 `apps/hub-server/test/e2e-pillars.test.ts`（起服前预置 config.json 代替
   旧 `TEAMHUB_DEMO_SEED=false`）。`apps/hub-console/e2e/health-check.cjs` 与 `scripts/verify-hub-compose.sh`
   的同类改造归刀②/文档轮（本刀不跑它们、其起服路径由刀②适配）。

### 刀③ 落地记录（2026-07-18，设置页部署配置区 + 转正式 + 文档同步，对应 §6/§7）

1. **两写端点的运行时依赖经 `BuildHubServerOptions.setupControl` 透传**：§6.3 只列了端点契约，未指定
   `PUT /api/setup/config` / `POST /api/setup/graduate` 如何拿到 configFile / 当前 config / 五域落盘文件 /
   归档物目录。实现新增 `SetupControl` 结构（server.ts），main.ts 正常模式装配时填实参；**给了才注册这两端点**，
   缺省不注册 → 404。这同时满足「**setup 模式不注册/404**」：setup 模式那条链是 build-setup-server.ts、根本不进
   buildHubServer，故两端点在 setup 模式天然 404（无需额外分支）。
2. **console 判「转正式」按钮显隐需知 dataMode → `DeploymentInfoSchema` 增 `dataMode` 字段（required）**：§6.2 定
   「按钮只在 dataMode=demo 时出现」，但设置页原先只从 `/api/system/status` 的 deployment 拿到 identityMode、拿不到
   dataMode。实现给 DeploymentInfo 补 `dataMode`（main.ts 从 config.dataMode 透传），并更新唯一一处既有 deployment
   测试装置。字段是运维定位事实、非密钥，符合 K3 分区纪律。
3. **设置页重启复活信号 = 宽限 + 轮询 `getSetupState` 可达性**（而非刀② 向导的 `initialized` 翻转）：正常模式两态皆
   `initialized:true`（无电平翻转可用），故改用「先等 ~1.5s 宽限（服务端延迟 ~500ms 退出，避免探到正要死的旧进程）
   → 轮询 getSetupState 首次成功即复活 → 整页刷新」。语义与刀② 的「重启轮询→刷新」等价（§6 末段要求）。
4. **两写端点响应 / 请求契约落 `hub-contracts/deploy-config.ts`**：新增 `SetupConfigRequestSchema` /
   `SetupConfigResponseSchema` / `SetupGraduateResponseSchema`（单一源、前后端复用），未复用 `SetupInitResponseSchema`
   ——§6.3 分别命名两端点，独立类型便于将来分化。均为 `{restarting: true}` 形状。
5. **转正式归档 = 只挪不删（`rename`）**：`demo-archive.ts` 把五域 JSON + 归档物目录内容 `rename` 进
   `<数据目录>/demo-archive-<ISO时间戳，冒号/点规范为->/`（数据目录 = `dirname(configFile)`，呼应 §6.2 的
   `~/teamhub-data/demo-archive-<ts>/`）。**全程只移动、绝不删除**，任一步失败即抛 → graduate 中止（不写 config、
   不重启、500 报错），数据完好（已挪的在归档、未挪的在原位，均可找回，§9）。归档目录与数据目录同盘，`rename`
   原子；跨设备（EXDEV，非标准布局）会让 graduate 报 500 中止、数据仍完好——属 §9「归档失败中途」已覆盖口径。
6. **§7 文档残留清零范围 = 面向部署者的四篇 + 活代码；历史决策/设计日志按「历史文档」豁免**：已清 README /
   DEPLOY / RUNBOOK / ai-agent-deploy-prompt 四篇部署者读的文档 + 设置页身份分区的 `TEAMHUB_IDENTITY_MODE=identity`
   活代码残留。`docs/design/{release-pipeline,modularization-feasibility,beta-readiness-2026-07-16,product-redefine-2026-07}.md`
   与 `docs/planning/{now,decisions}.md` 里的模式类 env 名**有意保留**——它们是带日期 / commit 的历史决策与设计
   落点记录（env 名在其成文时点历史准确），改写会污染审计轨迹；与 §7 括注「docs/archive/ 历史文档除外」同一原则
   （这些即 archive 性质的历史日志，只是物理不在 docs/archive/ 下）。四篇部署文档 + 全部 `apps/**/src` + start 脚本 /
   compose / deploy 已 grep 零命中。
7. **版本引用未动（`git checkout v0.25.0` / version 0.25.0）**：DEPLOY §1 与 ai-agent-deploy-prompt 里的公测 tag 引用
   保持 v0.25.0（当前公开 tag，向导属其后的 v0.26.x 尚未 tag）。本刀不预判未来 tag——待发布轮切新 tag 时由发布流程
   统一 bump（历来如此），非本刀范围。
