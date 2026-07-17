# SETUP-WIZARD：首启动向导 + 配置落盘层 + 设置页部署配置区（设计稿，待批）

> 状态：**设计稿，未拍板开工**（2026-07-16 用户裁决：先出设计稿过目，批了再动代码）。
> 缘起：用户对公测部署故事的三点反馈——①正式部署应该"直接点开就问是要测试还是直接安装"，
> 而不是改 env；②`TEAMHUB_IDENTITY_MODE` 应在初始化时选择；③"两个模式切换起来太麻烦了"。

## 0. 本轮已拍的三个裁决（讨论记录）

| 议题 | 候选 | 裁决 |
|---|---|---|
| 匿名模式命运 | A. 砍掉单轴化（分叉编目：全仓 28 处 mode 分叉、24 处可塌；正式部署中匿名无独特价值，演示零门槛可由自动登录替代）B. 保留双模式 | **B. 保留双模式**——D-083「匿名模式整体保留供选择」维持不变；向导让人选，不替人砍 |
| 向导防抢注 | A. 一次性安装码（Jupyter 式，顺带收豁免窗口 nit）B. 沿用 loopback 纪律 | **B. 沿用 loopback 纪律**——不加码；豁免窗口 nit 继续留档（beta-readiness §6） |
| 节奏 | A. 直接开工 B. 先设计稿 | **B. 先设计稿**（本文档），批了再开刀 |

分叉编目底稿：workflow `anon-mode-blast-radius`（wf_5ff03910）,28 处分叉清单可在需要时回放。

## 1. 目标 / 非目标

**目标**

1. 第一次打开 TeamHub，页面直接问"先试试（演示数据）还是直接安装（正式使用）"，正式路径顺手选登录方式（匿名 / 登录制）——**人类路径零 env**。
2. 模式（演示/正式、匿名/身份）从"部署期 env"降为"产品内配置"：落盘 `config.json`，**设置页可改**，改完自动重启生效。"切换麻烦"的解法 = 把重启自动化，而不是砍模式。
3. env 变量全部保留为**无头通道**（Docker/脚本部署仍然好用），语义变为"config 不存在时的初值"。

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
- **优先级：`config.json` > env > 内置默认**。config 存在时 env 里的 `TEAMHUB_DEMO_SEED` / `TEAMHUB_IDENTITY_MODE` 被忽略（启动 banner 打印一行提示，避免"改了 env 为什么不生效"的困惑）。
- 其余 env（端口、落盘路径、WRITE_TOKEN、TRUST_PROXY 等运维项）**不进 config**——它们是环境属性不是产品选择，向导也不问。

## 3. 未初始化状态机

server 启动时序改为三态：

```
config.json 存在 ──────────────→ 正常启动（按 config 建店、注册全部路由）
config.json 不存在
  ├─ env 显式设置了 DEMO_SEED 或 IDENTITY_MODE（无头部署信号）
  │        → 按 env 取值固化写出 config.json，随后正常启动（Docker/脚本零交互，向导永不挡道）
  └─ env 也没设 → **setup 模式**
```

**setup 模式**下只注册：静态站托管、`GET /health`（带 `setupPending: true`）、
`GET /api/setup/state`、`POST /api/setup/init`。不建任何数据 store、不落任何种子——
"选了才 seed"，这是向导能选"真空板"的前提。

`POST /api/setup/init`：body = `{dataMode, identityMode}`（zod 校验）→ 写 config.json →
回 `{restarting: true}` → 延迟 ~500ms `process.exit(42)`。已初始化后再调恒 409（多标签页幂等）。

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

- README「给战队正式部署」段：删两个 env 前缀的启动命令，改为"启动后浏览器打开，向导里选"；env 表述降级为"Docker/无头部署另见 DEPLOY §5"。
- DEPLOY.md §3 三个决定改为"向导里点选"；§4 顺序简化（向导接管）；§5 速查表两行加"（已由向导/设置页接管，仅无头部署需要）"。
- ai-agent-deploy-prompt.md 第一段第 4 步删两个 env 前缀（助手只负责起服，模式由用户在向导里自己点）——**助手的活变得更少更安全**。
- RUNBOOK §1.6 改引用向导流程。

## 8. 分刀与触及面

| 刀 | 内容 | 量级 |
|---|---|---|
| 刀① 配置层+状态机 | hub-contracts `deploy-config.ts` + main.ts 三态启动 + setup 三端点 + exit 42 + start 脚本循环 + compose restart | 中 |
| 刀② 向导 UI | App.tsx setup 分支 + 全屏向导组件 + 复活轮询 + i18n | 中 |
| 刀③ 设置页部署配置区+文档 | 两写 API + 分区 UI + 演示归档 + §7 文档四处 | 中小 |

现有测试面：main.ts 启动逻辑测试、health-check 需加"setup 模式渲染向导"用例；`POST /api/setup/init` 幂等 409 用例；config 坏文件 fail-closed 用例；演示归档后文件确在归档目录用例。

## 9. 风险与对策

- **config 写坏 → 循环起不来**：fail-closed 拒启动是既有纪律；exit 非 42 循环即停，不会无限重启。修复路径=删/修 config.json（文档写明）。
- **env 与 config 双真相困惑**：唯一优先级规则 + 启动 banner 明示"config.json 生效，env 已忽略"。
- **向导抢注窗口**：沿用 loopback 纪律（已裁决），DEPLOY/RUNBOOK 既有警示继续背书；残余风险与名册豁免窗口同级、同留档。
- **演示归档失败中途**：先归档后写 config，任一步失败即中止且不重启（数据完好，报错给操作者）。
- **无头部署（compose）死等向导**：§3 的"env 显式设置=固化跳过"规则兜底；compose 的 env 文件本来就显式设值。

## 10. 开放问题（批设计稿时顺手拍）

1. 试驾态的"高级：演示+登录制"折叠项要不要（成本≈0，只是选项透传；不要就演示恒匿名）。
2. `POST /api/setup/graduate` 转正式时要不要顺手弹名册导入（引导横幅 vs 直接嵌进弹窗）。
3. 匿名⇄身份切换在匿名侧的鉴权：写门即可（与现状非对称一致）还是这一项特殊收紧（毕竟它改的是鉴权本身）。
