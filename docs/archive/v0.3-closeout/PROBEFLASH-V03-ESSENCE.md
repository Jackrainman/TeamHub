# ProbeFlash v0.3 精华提炼（删码前固化）

> **状态**：归档。`apps/server`（@probeflash/server v0.3.0）+ `apps/desktop`（@probeflash/desktop v0.3.0）已于 2026-06-09 D-026 治理 reframe 后**从工作区删除**。
> 完整代码保留在 **git 历史**中（删码前最后一个含 v0.3 的提交），致命补丁走 `git revert` / `git checkout <sha> -- apps/server apps/desktop` 找回。
> 本文是**自包含**精华：所有要点不依赖已删代码即可读懂，关键 schema/模式内联。来源路径仅作 git 历史定位用。
>
> **运行中部署提醒**：v0.3 曾部署在战队服务器 `192.168.2.2`（用户 `hurricane`，根目录 `/home/hurricane/probeflash/`，端口 4100，独立 Node runtime + SQLite）。删仓库源码不影响该运行实例；如需重建/补丁，从 git 历史取回。

---

## 1. 领域模型（Zod 单一 schema 源）

v0.3 用 Zod schema 作为领域实体的唯一事实源，desktop 前端与 server 后端共享同一组定义。五个核心实体：

### IssueCard（调试工单）
`apps/desktop/src/domain/schemas/issue-card.ts`
- 关键字段：`id, projectId, title, rawInput, normalizedSummary, symptomSummary, suspectedDirections[], suggestedActions[], status, severity, tags[], repoSnapshot, relatedFiles[], relatedCommits[], relatedHistoricalIssueIds[], createdAt, updatedAt`
- `status`: `open | investigating | resolved | archived | needs_manual_review`
- `severity`: `low | medium | high | critical`
- 时间戳统一 `z.string().datetime({ offset: true })`（带时区 ISO8601）

### InvestigationRecord（追查记录，挂在 issue 下的时间线）
`apps/desktop/src/domain/schemas/investigation-record.ts`
- `id, issueId, type, rawText, polishedText, aiExtractedSignals[], linkedFiles[], linkedCommits[], createdAt`
- `type`: `observation | hypothesis | action | result | conclusion | note`
- **rawText vs polishedText 双存**：保留人原话 + AI 润色后版本（AI 是转译者，不覆盖原始输入——呼应宪法 C4）

### ErrorEntry（可复用错误知识，从 issue 收口后沉淀）
`apps/desktop/src/domain/schemas/error-entry.ts`
- `id, projectId, sourceIssueId, errorCode, title, category, symptom, rootCause, resolution, prevention, tags?, relatedFiles[], relatedCommits[], archiveFilePath, createdAt, updatedAt`
- `errorCode` 正则 `^DBG-\d{8}-\d{3}$`（如 `DBG-20260609-001`）
- `prevention` 强制 `.trim().min(1)`：**收口必须填"如何预防",不许空**——把"修完就忘"变成结构化沉淀

### ArchiveDocument（归档 markdown 元数据）
`apps/desktop/src/domain/schemas/archive-document.ts`
- `issueId, projectId, fileName, filePath, markdownContent, generatedBy, generatedAt`
- `fileName` 正则 `^\d{4}-\d{2}-\d{2}_[a-z0-9-]+\.md$`（如 `2026-06-09_serial-garbled.md`）
- `generatedBy`: `ai | manual | hybrid`（标注内容来源，不混淆 AI 产出与人工）

### RepoSnapshot（建 issue 时的仓库状态快照，嵌在 IssueCard 内）
`apps/desktop/src/domain/schemas/repo-snapshot.ts`
- `branch, headCommitHash, headCommitMessage, hasUncommittedChanges, changedFiles[], recentCommits[], capturedAt`
- `changedFiles[]`: `{ path, status: added|modified|deleted|renamed|untracked }`
- `recentCommits[]`: `{ hash, author, message, timestamp }`
- **设计点**：调试症状与"当时代码长什么样"绑定，事后复盘有上下文——治理系统的"Git 提交→进度派生"可借此思路。

**带进 hub-\* 的教训**：Zod 作为唯一领域 schema 源，前后端共享、边界 `safeParse` 校验，已被 `apps/hub-contracts` 沿用（`HubEvent` / `AdapterDescriptor` 等）。

---

## 2. 混合存储模式：relational 索引 + JSON payload

`apps/server/src/db/schema.mjs`（SQLite，`node:sqlite` 的 `DatabaseSync`）。核心模式：**可查询字段拍平成列 + 建索引，整个领域实体塞 `payload_json` TEXT 列**。

表：`workspaces / issues / records / archives / error_entries / form_drafts`（+ `schema_meta`）。示例 `issues`：
```sql
CREATE TABLE issues (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  title TEXT NOT NULL,
  severity TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  payload_json TEXT NOT NULL,        -- 整个 IssueCard 实体
  closeout_state TEXT,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE RESTRICT
);
CREATE INDEX idx_issues_workspace_status_created ON issues (workspace_id, status, created_at DESC);
```
模式要点：
- **查询/排序靠列 + 复合索引**（workspace+status+created、issue+created、workspace+closeout_state 部分索引）；**领域演进靠 JSON**——加字段不用 migration。
- **幂等增量 migration**：`PRAGMA table_info` 探测列是否存在再 `ALTER TABLE`（`closeout_state` 就是后加的）；`user_version` **最后**才 bump，确保任一步失败下次 boot 会重试。
- `PRAGMA foreign_keys=ON` + `journal_mode=WAL`；单默认 workspace 用部分唯一索引 `WHERE is_default=1` 保证全局唯一。
- `form_drafts` 主键 `(workspace_id, form_kind, item_id)`：服务端也存草稿，支撑跨设备恢复。

**带进 hub-\* 的教训**：relational+payload_json 混合已沿用到 hub Postgres 设计——可查询 + 模型可演进两全。SQLite/`node:sqlite` 当生产默认是 v0.3 的单机约束，hub 改 Postgres（多 adapter 并发写）。

---

## 3. 离线存储纪律（desktop SPA）

v0.3 desktop 是纯前端 SPA，localStorage 为主存（`probeflash:*` key 前缀），积累的纪律：

### 结构化存储结果类型 `storage-result.ts`
不用裸 throw，用判别联合表达每种失败：
- 读：`read_failed | server_unreachable | timeout | not_found`
- 写：`validation_failed(含 ZodIssue[]) | serialize_failed | unexpected_write_error | server_unreachable | timeout | conflict | not_found`
- 每个错误带 `entity / target / message / connection{state,reason,checkedAt}`
- **价值**：调用方能区分"校验失败"vs"服务器够不着"vs"冲突"，做差异化降级——而非吞掉异常。

### 表单草稿恢复 `form-draft-store.ts`
- 读结果区分四态：`unavailable | empty | invalid | restored`（不是简单的有/无）
- `server | local | none` 三级来源 + `remoteError` 透传：远端拿不到时回落本地，但保留远端错误信息不静默
- **价值**：长流程（收口表单）中断后能续；invalid 与 empty 分开，坏数据不当"没数据"。

### 归档内存索引 `archive-index.ts`
- reload 后存活的归档计数/最近摘要索引，避免每次重算全表。

**带进 hub-\* 的教训**：草稿恢复、结构化存储错误、invalid-bucket 隔离都该进治理系统的存储抽象层（长治理工作流同样需要中断续作）。**丢弃**：localStorage 当主库——hub 有真后端，浏览器存储只留草稿用。

---

## 4. verify 脚本纪律（自动验证文化）

v0.3 用大量 `verify:*` 脚本把测试纪律固化进 `verify:all`（server `apps/server/scripts/verify-*.mjs`、desktop `apps/desktop/scripts/verify-*.mts`），关键模式：
- **fixture round-trip**：create → serialize → 存 → 读回 → parse → deserialize 全链断言（schema 契约）
- **closeout 原子性 / 恢复**：收口事务安全、部分收口可恢复
- **backup/restore 幂等**：`backup-export.mjs` 导出 + `restore-dry-run.mjs` dry-run 验证不破坏
- **workspace 隔离**：跨 workspace 不串数据
- **invalid-bucket 隔离**：畸形数据进独立桶，不污染正常列表
- **Node 内黑盒测 store**：用 Map polyfill 顶替 localStorage，直接调真实 store 方法，不需浏览器
- **诊断 bundle 脱敏**：`diagnostics-bundle.mjs` 只读允许的 log 根目录，写出前对 Authorization/API key/token/secret/password 脱敏，绝不上传

**带进 hub-\* 的教训**：fixture+契约级验证、原子性/幂等/隔离的测试重点、脱敏诊断，都是 hub contract tests 的模板。

---

## 5. 部署经验（来源 `apps/server/deploy/`，模板已归档至本目录）

v0.3 server 的部署路线（**release tarball first**，no-sudo 优先），可复用结论：
- **release tarball 优先于服务器 `git pull`**：从固定 Release 资产取版本，校验 `SHA256SUMS.txt` 再解压到 `releases/vX.Y.Z`，`current` symlink 切版本；服务器不当 dev checkout。
- **用户目录布局**（不碰 `/opt`、不要 sudo 起步）：
  ```
  /home/hurricane/probeflash/
    current -> releases/vX.Y.Z/      # 不可变 release 载荷
    shared/{data,logs,env}/          # SQLite/WAL、日志、env —— 跨 release 存活
    runtime/node/                    # 独立 Node runtime，不动系统 node
  ```
- **独立 Node runtime**：不改 `/usr/bin/node`、不 `apt upgrade`；代码用 `node:sqlite` 的 `DatabaseSync`，需 Node ≥ v22.13.0（或 24 LTS）——pin 版本，视为 S3 风险。
- **单进程 web+API**（推荐路线 B）：`apps/server` 同端口 4100 服务 `/api` 与 `dist`（`PROBEFLASH_STATIC_DIR` 指向 dist 时启用）；`/api` 先于静态文件，SPA 路由回落 `index.html`，缺失 asset 返 404 不回落。
- **端口边界**：80 被 filebrowser 占用，绝不动；默认 4100。
- **数据/env/log/runtime 永不放进 release 目录**——放 `shared/`、`runtime/` 才能在换版时存活。
- systemd（`probeflash.service.template`，已归档本目录）是后续授权步骤，no-sudo 验证通过 + 用户授权后才做。

---

## 6. 承前启后清单

**带进治理系统（hub-\*）**：
- Zod 单一领域 schema 源（前后端共享、边界 safeParse）→ 已在 `apps/hub-contracts`
- relational 索引 + `payload_json` 混合存储 → 已入 hub Postgres 设计
- 幂等增量 migration（探测后 ALTER、user_version 最后 bump）
- 表单草稿恢复 + 结构化存储错误类型 + invalid-bucket 隔离
- verify 脚本纪律：fixture round-trip / 原子性 / 幂等 / 隔离 / 脱敏诊断
- rawText/polishedText 双存（AI 转译不覆盖原话，宪法 C4）
- release-tarball + 用户目录 + 独立 runtime 的 no-sudo 部署路线

**丢弃（v0.3 的单机/SPA 约束，不带进 hub）**：
- SQLite 当生产默认 → hub 用 Postgres（多 adapter 并发）
- localStorage 当主库 → hub 有真后端，浏览器只留草稿
- 单体 issue tracker 数据模型 → hub reframe 为 event 流（HubEvent）+ 无状态 adapter + 治理 任务/依赖 DAG
- 人工撰写 ArchiveDocument → 治理系统倾向 AI 摘要 / event 轨迹
