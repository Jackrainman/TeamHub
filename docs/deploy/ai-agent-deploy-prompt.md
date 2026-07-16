# 给 AI 助手的部署提示词

> 服务器上跑着能执行 shell 命令的 AI 助手（Hermes、Claude Code、Codex 等）？把下面的提示词
> 整段复制发给它，它就会照 [部署指南](DEPLOY.md) 的纪律替你部署 TeamHub。
>
> 发送前只需要做一件事：看一眼提示词开头的**两个选择**，不合适就改掉那两行。
>
> 设计原则：**助手只做到"本机验证通过"就停**——暴露内网、导名册、初始化管理员这些一锤定音的
> 动作留给人（原因见文末）。等你完成初始化，再发第二段提示词让它暴露。

---

## 第一段：部署到本机验证通过

````text
请在这台服务器上部署 TeamHub（机器人战队协作中枢，开源仓库
https://github.com/Jackrainman/TeamHub）。按以下步骤严格顺序执行，
每步验证通过再做下一步；全部完成后把每一步的关键输出汇总报给我。

我的选择（已按默认填好，发送前可改）：
- 部署目录：~/TeamHub
- 模式：正式使用（真实空板 + 登录制）。若想先要演示体验（自带示例数据），
  把第 4 步的两个 TEAMHUB_ 环境变量前缀去掉即可。

步骤：

1. 环境检查：
   - node --version 必须 ≥ v24；git 可用。
   - 端口 4177 未被占用（ss -ltn 2>/dev/null | grep 4177 应无输出）。
   任一不满足就停下来告诉我缺什么，不要自行安装系统级软件或改系统配置。

2. 获取代码（公测就绪版）：
   git clone https://github.com/Jackrainman/TeamHub.git ~/TeamHub
   cd ~/TeamHub && git checkout v0.25.0

3. 安装依赖（三个包各自独立，必须按此顺序）：
   npm --prefix apps/hub-contracts install
   npm --prefix apps/hub-server install
   npm --prefix apps/hub-console install

4. 启动（只绑本机回环，先不暴露）：
   cd ~/TeamHub
   TEAMHUB_DEMO_SEED=false TEAMHUB_IDENTITY_MODE=identity \
     nohup ./start-teamhub.sh > ~/teamhub.log 2>&1 &
   首次会构建前端和后端，可能要几分钟；构建与启动日志都在 ~/teamhub.log。
   记下进程 PID。数据会落在 ~/teamhub-data/ 下，重启不丢。

5. 验证（等构建完成、服务起来后再跑；可轮询直到 /health 有响应，最多等 10 分钟）：
   curl -s http://127.0.0.1:4177/health
   curl -s http://127.0.0.1:4177/api/system/status
   把两个响应原样发给我：前者应含 "status":"ok" 和 buildId，
   后者的 version 应为 0.25.0。

6. 到此为止，停下。不要绑 0.0.0.0、不要改防火墙、不要配反向代理、
   不要创建任何数据。后面的名册导入和管理员初始化由我本人通过 SSH 隧道完成，
   之后我会再给你暴露内网的指令。

全程约束：
- 不需要 sudo；如果某步看起来需要，停下来问我。
- 不要读取、打印或修改这台服务器上的任何凭证 / 密钥文件。
- 任何一步失败，把完整报错原样发给我；同一步骤自行重试不要超过一次。
````

## 你来做的中间步（5 分钟，不给助手）

在**你自己的电脑**上开一条 SSH 隧道，把服务器的 4177 引到本机：

```bash
ssh -L 4177:127.0.0.1:4177 <用户名>@<服务器IP>
```

保持这个窗口开着，浏览器打开 <http://127.0.0.1:4177>，照
[DEPLOY.md §4](DEPLOY.md) / [RUNBOOK §1.6](RUNBOOK.md) 的顺序走：
下载名册 CSV 模板 → Excel 填好上传 → 登录本人（首次免 PIN）→ 「初始化管理员」设 PIN。
完成后再发第二段。

## 第二段：暴露到内网（初始化完成后再发）

````text
TeamHub 的名册导入和管理员初始化我已完成，现在把它暴露到内网：

1. 停掉现有 TeamHub 进程（之前记录的 PID，或
   pkill -f 'hub-server/dist/main.js'），确认 4177 已释放。
2. 重新启动，这次绑 0.0.0.0、跳过重复构建：
   cd ~/TeamHub
   HUB_HOST=0.0.0.0 TEAMHUB_DEMO_SEED=false TEAMHUB_IDENTITY_MODE=identity \
     TEAMHUB_SKIP_BUILD=1 nohup ./start-teamhub.sh > ~/teamhub.log 2>&1 &
3. 验证 curl -s http://127.0.0.1:4177/health 仍为 ok，
   然后把这台服务器的内网 IP（hostname -I 或 ip addr）发给我，
   我把 http://<内网IP>:4177 发给队友。
4. 顺手跑一次数据备份并告诉我备份落点（该脚本备份五个数据域的 JSON 并做读回校验；
   图纸文件目录 ~/teamhub-data/artifacts 不含在内，现在还是空的、不用管）：
   cd ~/TeamHub && ./scripts/backup-teamhub-data.sh

仍然不要改防火墙 / 不要配反代 / 不需要 sudo；有问题原样报错给我。
````

---

## 为什么第一段要在暴露前停下

身份模式空板有个**引导豁免**：名册为空时，任何人都能免登录上传名册——这是为了解决
"名册没人导入、但导入又要登录"的死锁。代价是：如果先绑了 `0.0.0.0` 再导名册，
这个窗口期内内网里**任何可达的人**都能抢先导入名册、把自己设成管理员。
所以顺序必须是"loopback 起服 → 隧道里导名册 + 初始化管理员 → 最后才暴露"，
而助手拿不到你的名册和 PIN，这两步天然只能你来。

其余部署细节（环境变量速查、Docker 路径、升级回滚）见 [DEPLOY.md](DEPLOY.md)。
