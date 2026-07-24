# @probeflash/lark-toolkit

ProbeFlash 出站统一门面（outbound toolkit facade）。按 `boundary.route(method)` 在内部分流：

- `sdk` 通道 → 进程内调用 `@larksuiteoapi/node-sdk`（毫秒级，无 shell-out 成本）
- `cli` 通道 → `execa` shell out 到全局安装的 `@larksuite/cli`（`lark api <method> --data <json>`）

当前 sdk 通道白名单仅含 `im.v1.message.create`（gateway 3 秒 ack 路径），其余 method 默认走 cli。卡片 / 多维表 / 建群等后续能力沿 cli 通道追加，不动 sdk 白名单。

## 安装与外部依赖

`@probeflash/lark-toolkit` 子包依赖：
- `@larksuiteoapi/node-sdk`（npm 子包内安装，进程内 SDK 调用）
- `execa`（npm 子包内安装，shell-out wrapper）

**外部用户侧需全局装 lark-cli**（cli 通道运行前置）：

```bash
npm install -g @larksuite/cli
lark --version    # 期望 >= 1.0.0
lark login        # 一次性 OAuth 登录；token 存 ~/.lark-cli/
```

最低版本：`@larksuite/cli >= 1.0.0`。本子包首次调用 cli 通道时会懒检查 `lark --version`，若不存在或 major < 1 抛 `CliBridgeError`（典型 message: "lark-cli not found on PATH. Install: npm install -g @larksuite/cli"）。

## 用法

```typescript
import { createToolkit } from '@probeflash/lark-toolkit';

const toolkit = createToolkit({
  larkAppId: process.env.LARK_APP_ID!,
  larkAppSecret: process.env.LARK_APP_SECRET!,
  larkDomain: 'feishu',
});

// 回复消息（走 sdk 通道，3 秒 ack 路径）
await toolkit.reply({
  chatId: 'oc_xxxxxx',
  replyToMessageId: 'om_xxxxxx',
  text: '收到，正在处理',
});
```

## 文件结构

```
src/
  types.ts        # 公共类型 + CliBridgeError
  boundary.ts     # route(method) → 'sdk' | 'cli' 白名单
  sdk-client.ts   # createSdkClient + sdkReply（进程内 SDK 调用）
  cli-bridge.ts   # ensureLarkCli + cliApi（execa shell-out + 懒版本检查）
  index.ts        # createToolkit(cfg) 工厂；门面公开 API
test/
  *.test.ts       # vitest 单测；不打飞书网络，不打真 lark-cli
```

## 边界

- 本子包不读 `.env`、不打印密钥；调用方负责凭证装配（cfg.larkAppId / cfg.larkAppSecret）
- 测试 mock execa，不需要真实 `lark` 命令在 PATH
- 错误透传：sdk 通道直接 propagate；cli 通道包成 `CliBridgeError`（带 exitCode + stderr）

## 验证

```bash
cd apps/lark-toolkit
npm install
npm run verify:all   # typecheck + test + build
```

## 依据

- `docs/archive/pre-pivot-plans/2026-05-21-lark-cli-integration-design.md` §3（boundary）+ §4.1 M1（lark-toolkit 立包）
- D-022 拍板：lark-gateway 拆 3 包架构（apps/lark-gateway + apps/lark-toolkit + apps/pf-skills）
