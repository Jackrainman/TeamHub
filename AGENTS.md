# AGENTS — TeamHub 操作手册

## 1. 产品

TeamHub = 机器人战队协作中枢（CASE + 交流 + 数据库）。三支柱：① 知识库 ② 项管看板 ③ 库存-BOM。垂直包 = Robocon。设计 `docs/design/`，约束 `.harness/decisions.md`。

**不变式**（约束一切代码）：
- **I0**：对准事不对准人；人键只回本人，第三方只见结构键（task/group/resource）；名字只在事实卡片，永不进聚合/统计。
- **C1-C5**：填写成本当下回报抵消 / 摩擦可见·产能不可比 / 小作坊轻量 / AI 转译不拍板 / 只为有自然上游的场景构建。
- **反监视**：暴露缺口不暴露"人慢了"；提醒私下回本人；无硬截止；Task 永不加个人 dueDate。
- **AI 边界**：仓管/转译（整理/检索/算量/起草），不参与治理，不替人拍板，不替代实物验证。

## 2. 工作流

```
开局：读本文件 + .harness/todo.json + git status --short
做事：从 todo 取一条
收尾：verify（§4）→ bump（§6）→ commit+push → 删 todo → append .harness/ai-log.md
```

- trunk-based，commit+push 默认不问；push 前 fetch 查分叉。
- 原子单元 = 可独立验证 + 单独 commit。DoD 必含工程谓词。
- 不伪造完成、exit code 必查、失败不静默吞。连续两次失败升级人工。

## 3. 命令

```bash
npm --prefix apps/hub-contracts run verify:all   # 三包各自 typecheck+test+build
npm --prefix apps/hub-server   run verify:all
npm --prefix apps/hub-console  run verify:all
./start-teamhub.sh                                # 单端口 4177
./scripts/backup-teamhub-data.sh                  # 重启/重建前必跑
npm --prefix apps/hub-server run test:local -- e2e-pillars  # 端到端
bash scripts/pre-commit.sh                        # 提交门（密钥扫描+空白）
curl -s http://127.0.0.1:4177/health | grep buildId  # 活体
```

## 4. 验证门

| 任务类型 | 必跑 |
|---|---|
| docs / skills | `git diff --check` |
| hub 代码 | 对应包 `verify:all` exit 0 |
| 部署行为 | e2e-pillars 绿 + /health buildId 非空 |
| compose | `scripts/verify-hub-compose.sh` |

## 5. 安全边界（无审批不做）

- 禁止：SSH/sudo/systemd/写 opt/80·443/真实部署/tag 删/destructive migration/删用户数据/大规模 UI 重构/引大框架/产品方向拍板。
- 密钥不进仓：不读/打印/搜索/提交 `.env*`（除 example）/ `*key*` / `*secret*`。
- 写门：非 loopback 写端点必须 `TEAMHUB_WRITE_TOKEN`；反代开 `TEAMHUB_TRUST_PROXY=true`。
- 数据安全：重建前 `backup-teamhub-data.sh`。
- 停止条件：verify 不可修 / 命中 SSH·sudo·部署·密钥 / 连续两次修复失败。

## 6. 版本

- 根 `VERSION`（SemVer），只用 `scripts/bump-version.sh`。
- 改 `apps/hub-*/src` 行为必须 bump（fix=PATCH，feature=MINOR）。docs 不 bump。

## 7. 代码规范

### 后端（hub-server）

- 路由放 `src/routes/<domain>.ts`，导出 `registerXxxRoutes(app, deps)`，server.ts 只挂载。
- 请求体校验用 `parseBody(Schema, request, reply)`（helpers.ts），不手写 safeParse+400。
- CSV 上传用 `readCsvUpload(request, reply, { maxBytes, decode })`（helpers.ts）。
- 鉴权：身份模式用 `isSuperAdmin(snapshot.members, id)` 内联判定；写门由 server.ts onRequest 钩子统一罩。
- Store 三实现（InMemory/File/Sqlite），共享逻辑抽 `base-<domain>-store.ts`。
- API 响应：200+JSON；错误 `{ detail: string }`；列表直接数组。

### 前端（hub-console）

- Feature 文件夹 `src/features/<domain>/`，>400 行必拆子组件。
- 数据获取封装 `useXxx()` hook，组件不直接写 useQuery/useMutation。
- 跨 feature 复用放 `src/shared/`，不从 Page 导出公共符号。
- API client `src/api/client.ts` 按域分段，新方法加对应段。
- 图标统一 lucide-react，不引其他图标库。

### 契约（hub-contracts）

- 新 schema 加对应域 `.ts`（pm-core / kb-core / inv-core / baseline / schedule）。
- 纯函数（derive/validate）放契约包，前后端共用。
- 导出即公共 API，改动需三包 verify 全绿。

## 8. 架构索引

```
依赖方向：console ──→ contracts ←── server；routes ──→ helpers / store

hub-contracts/src/
  pm-core.ts          Task/Group/Member/Season/Dependency/Need schema + 派生
  schedule-infra.ts   SharedResource/ResourceSession/RelayHandoff
  inventory.ts        PartType/PartAction/InventorySnapshot
  baseline.ts         SeasonBaseline/Milestone + deriveBaselineDrift
  checklist.ts        GateChecklistItem + listBlockingChecklistItems
  identity.ts         Session/PIN/SetPin/SetRole/SetProjectManager
  roster-import.ts    CSV 模板/解析/GATE_REVIEWER_DEFAULT_GRADES
  fleet-import.ts     车队 CSV 模板/解析
  csv-core.ts         decodeCsvBytes 编码探测
  fixtures.ts         demo seed 数据

hub-server/src/
  server.ts           buildHubServer：装配+写门钩子+会话+setup+lark（~340行）
  routes/helpers.ts   parseBody / readCsvUpload / sessionActor / isLoopbackOperator / buildScheduleSnapshot / cookie
  routes/pm.ts        成员/组/赛季/任务/依赖/检查单/认领制
  routes/schedule.ts  在场排班/资源/接力画布/车队导入
  routes/kb.ts        知识库相似检索/结案/批量导入
  routes/ledger.ts    库存台账/记账/批量导入/Hermes
  routes/baseline.ts  倒排基准线读写/过门
  routes/archive.ts   图纸归档物上传下载
  routes/system.ts    health/status/mock 集成
  routes/search.ts    全局搜索
  routes/export.ts    CSV 导出
  store/              InMemory/File/Sqlite 三实现 + base 共享

hub-console/src/
  features/<domain>/  Page + 子组件 + utils（pm/kb/schedule/pool/archive/settings/identity/setup/...）
  shared/             EmptyState / roster（跨 feature 复用）
  api/client.ts       按域分段的 HTTP client
  styles.css          单文件 CSS（四主题 :root 变量）
```

## 9. 反模式（绝不）

| 绝不 | 正确做法 |
|------|----------|
| 新建 firstZodMsg / parseBody / readCsvUpload / sessionActor | `import from routes/helpers.js` |
| 往 server.ts 加路由 | 加到 `routes/<domain>.ts` |
| 手写 safeParse + if + reply.code(400) | `parseBody(Schema, req, reply)` |
| Page 组件导出公共符号 | 放 `src/shared/` |
| 组件直接写 useQuery/useMutation | 封装 `useXxx()` hook |
| 组件超 400 行不拆 | 拆子组件 |
| 引新图标库 / emoji 当图标 | lucide-react |
| 各路由文件复制粘贴 CSV 读取逻辑 | `readCsvUpload` helper |
| 前端重新实现 contracts 里的 derive 函数 | import from `@teamhub/hub-contracts` |
| 新建卡片样式重复 border/radius/bg/shadow | 用 `.card` 基类 |

## 10. 复用索引（写代码前先查）

| 位置 | 提供 |
|------|------|
| `routes/helpers.ts` | `parseBody` / `readCsvUpload` / `sessionActor` / `isLoopbackOperator` / `buildScheduleSnapshot` / `buildSessionCookie` / `readSessionCookie` / `clearSessionCookie` / `firstZodMsg` |
| `shared/EmptyState.tsx` | `<EmptyState icon={LucideIcon} title desc action />` |
| `shared/roster.tsx` | 名册预览表 + 导入流程组件 |
| `api/client.ts` | `createHubApiClient()` 按域分段，新方法加对应 `// ── domain ──` 段 |
| `authz.ts` | `isSuperAdmin` / `isGroupLeadOf` / `isGateReviewer` / `memberHasPmFlag` |
| `styles.css .card` | 卡片基类（border+radius+bg+shadow+transition），`.card--interactive` 带 hover |
| `styles.css .empty-state` | 空态布局（icon 圆环+标题+描述+动作） |
| `styles.css .gate-field` | 表单字段竖排（label+input 统一皮肤） |
| `@teamhub/hub-contracts` | 所有 schema + derive 纯函数 + CSV 解析器 + fixtures |
