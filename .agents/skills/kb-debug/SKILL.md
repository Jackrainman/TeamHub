---
name: kb-debug
description: 排机器人/嵌入式 bug 时，连 TeamHub 战队知识库做闭环——开局查跨赛季相似历史 bug 当线索，解完把这次排障总结推回**团队服务器**沉淀，KB 越用越厚。单一真相在服务器，**不写本地 .debug-archive**。需 hub-server 可达（KB_BASE_URL）。
trigger: 用户开始排一个具体的机器人/嵌入式 bug（一句症状），或刚解决完一个 bug 想沉淀。
---

## 目的

把"老学长的隐式经验"和"前人踩过的同类 bug"接到每个队员本地的 Claude Code 上：

- **开局（recall）**：症状 → 查团队知识库相似历史 bug，把"根因/处理/重合依据"当线索，少走弯路；没有就从头排。
- **收尾（archive）**：bug 解决后，把这次的现象/试了什么/根因/怎么修，**推回 TeamHub 服务器**，下一个人查得到。

这是 `debug-checklist` 的**服务器版进化**：`debug-checklist` 写本地 `.debug-archive/` markdown；本 skill **不写任何本地文件**，
所有信息**全留服务器**（单一真相），由 `GET /api/kb/similar` + `POST /api/kb/closeout` 两个接口承载。

不替代用户判断、不替代真实硬件验证。**只列候选、不断言"就是同一个 bug"**（A4 护栏）。

## 前置 / 配置

- hub-server 可达。瘦客户端 `~/.claude/skills/kb-debug/kb-client.sh` 读环境变量：
  - `KB_BASE_URL`：hub-server 地址（默认 Tailscale `http://100.78.202.84:4177`；实验室 LAN 部署好后改成 `http://teamhub.local:4177`）。
  - `KB_PROJECT_ID`：团队统一 projectId（默认 `prj-robots`）。**closeout 的 projectId 必须用团队统一值**，否则相似检索按 projectId 过滤会漏召回。
- 先 `bash ~/.claude/skills/kb-debug/kb-client.sh ping` 验连通，连不上就提示用户检查网络/Tailscale，**不要硬编结果**。

## 动作 1：recall（排障开局）

1. 从用户症状里抽 1 句症状 + 2~4 个标签（如 `CAN,电机,底盘`）。
2. 跑：`bash ~/.claude/skills/kb-debug/kb-client.sh similar "<症状>" "<标签,逗号>"`
3. 解析返回 JSON 的 `items[]`，给用户摆**候选线索**（每条）：
   - `title` + `score`（匹配度）+ `status`
   - `reasons`（**客观重合依据**：哪些标签/词/根因术语重合）
   - `rootCauseSummary` / `resolutionSummary`（历史根因 / 处理）+ `errorCode` / `archiveFileName`（如有）
4. **A4 护栏**：明示"以下是**候选**，按重合依据自己判断是否相关；系统不替你断'同因'"。候选不对就丢、从头排（可以新开会话）。
5. `items` 为空 → 坦诚"知识库里没有同类历史，按常规从头排"，不硬凑。

## 动作 2：archive（排障收尾，bug 解决后）

bug 确认解决后，把这次排障**推回服务器**沉淀：

1. 从本次会话上下文，组装一个 `closeout` payload（JSON），写到临时文件（如 `/tmp/kb-closeout.json`）。
2. 跑：`bash ~/.claude/skills/kb-debug/kb-client.sh closeout /tmp/kb-closeout.json`
3. 成功（200）回显服务器返回的 `errorEntry.errorCode`（如 `DBG-20260614-007`）告诉用户"已沉淀，错误码 X，下次同类可召回"。
4. 失败：422 = 缺 `rootCause`/`resolution`（**必填，不许编**，缺就问用户或据排障过程补真）或卡已归档；400 = body 不合法（对照下方模板修字段）。

### closeout payload 模板

时间戳/ id 现场用 Bash 生成：`id="iss-$(date +%s)"`、`now="$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"`。

```json
{
  "issue": {
    "id": "iss-<unix秒>",
    "projectId": "prj-robots",
    "title": "<一句话问题名>",
    "rawInput": "<用户原话症状>",
    "normalizedSummary": "<规范化一句话>",
    "symptomSummary": "<症状摘要>",
    "suspectedDirections": ["<排查时怀疑过的方向>"],
    "suggestedActions": ["<当时建议的动作>"],
    "status": "resolved",
    "severity": "low|medium|high|critical",
    "tags": ["<跨赛季可检索的关键词，如 CAN 电机 串口>"],
    "relatedFiles": ["<本次改动文件相对路径>"],
    "relatedCommits": ["<相关 commit 短 sha，如有>"],
    "relatedHistoricalIssueIds": [],
    "createdAt": "<now ISO>",
    "updatedAt": "<now ISO>"
  },
  "records": [
    { "id": "rec-1", "issueId": "iss-<unix秒>", "type": "observation",
      "rawText": "<现象原话>", "polishedText": "<转译>",
      "aiExtractedSignals": [], "linkedFiles": [], "linkedCommits": [],
      "createdAt": "<now ISO>" }
  ],
  "category": "<分类，如 通信/电机/视觉>",
  "rootCause": "<根因——必填，据真实排障结论写，禁止编>",
  "resolution": "<怎么修好的——必填>",
  "prevention": "<以后怎么避免，可空>",
  "generatedBy": "ai"
}
```

- `records` 可省（默认 `[]`）；`type` ∈ observation/hypothesis/action/result/conclusion/note。
- `generatedBy=ai`：**不记结案人**（I0：来源是 ai/manual/hybrid，不存人名）。
- `tags` 要放**跨赛季可检索的术语**（CAN/3508/串口…），这是相似检索召回的主要依据。

## 工具调用

- `Bash`：跑 `kb-client.sh`（ping/similar/closeout）；`git log/status/diff --stat` 取 relatedCommits/relatedFiles（**禁止** push/commit/reset 用户代码）；`date`/写临时 payload 到 `/tmp`。
- `Read`/`Grep`/`Glob`：定位本次改动的文件填 `relatedFiles`。

## 不做的事

- **不写本地归档文件**（无 `.debug-archive/`）；所有信息推服务器（单一真相）。
- **不替用户 commit / push 代码**，不改用户仓库。
- **不读** `.env` / `*.key` / `*secret*` / `*api-key*`；命中即跳过并明示。payload 里不放任何密钥/凭据。
- **不编** `rootCause`/`resolution`——必填字段缺就问用户或据真实排障补，宁可不沉淀也不伪造。
- **不断言"同因"**——recall 候选只是线索，相关与否由人判断（A4）。
- **不记人名**——`generatedBy=ai`，不存"谁排的/谁结的案"（I0/C2）。

## 安装到本地 Claude Code（每个队员一次）

```sh
cp -r .claude/skills/kb-debug ~/.claude/skills/        # 或从 TeamHub 仓拷
export KB_BASE_URL=http://100.78.202.84:4177           # LAN 部署好后改 teamhub.local
bash ~/.claude/skills/kb-debug/kb-client.sh ping       # 验连通
```

## DoD（本 skill 自身的完成定义）

- `.agents/skills/kb-debug/{SKILL.md,kb-client.sh}` 为源，`cp -rp .agents/skills/. .claude/skills/` 镜像。
- `bash .agents/skills/install.sh` 重链通过；`git diff --check` 干净。
- 对一台跑着 hub-server（带 `TEAMHUB_KB_DATA_FILE`）的实例，`ping`/`similar`/`closeout` 三命令均通，且 closeout 后 similar 能召回新条目（闭环实证）。
