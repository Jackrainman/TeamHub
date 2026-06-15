# TeamHub 自身工程 bug 归档（dogfood）

> 吃自己的狗粮（A7，模型 = feiyue `docs/TROUBLESHOOTING.md` + bug→铁律可追溯）。
>
> TeamHub 的产品第一支柱是「战队知识库」，期望队员把机器人 bug 沉进 KB。那 TeamHub **自己的**
> 工程 bug 也该进同一套闭环——否则就是只让别人吃狗粮、自己不吃。本目录把 TeamHub 开发中查实的
> bug（如部署前审计 H1–H5）按 `.debug-archive` 同格式写成卡，`kb:import` 进 KB 语料供 `/api/kb/similar` 召回。

## 与 `.debug-archive/` 的区别

- `.debug-archive/`：`debug-checklist` skill 的**机器人** bug 运行时 scratch，gitignored、一次性导服务器。
- 本目录：TeamHub **自身**工程 bug，**tracked**（跟代码走、可追溯到 AGENTS 铁律），curated 参考语料。

## 导入

```bash
npm --prefix apps/hub-server run build
# 进一个 dev 语料文件（别污染生产 kb.json）
npm --prefix apps/hub-server run kb:import -- docs/dev-debug-archive /tmp/teamhub-kb-dev.json
# 起 server 指向该文件即可 /api/kb/similar 召回
TEAMHUB_KB_DATA_FILE=/tmp/teamhub-kb-dev.json ./start-teamhub.sh
```

`README.md` 被 importer 自动跳过；每张卡一个文件。

## bug→铁律可追溯（AGENTS §6）

每张卡对应一条 AGENTS 铁律或部署 runbook 条目。新发现的工程 bug 修完 → 在此加一张卡 → 由它而生的
规则引该卡的症状/errorCode。规则不再是凭空的「设计决策」，而是钉在具体事故上（feiyue 杀手锏）。
