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
npx vitest run <file>                            # 单测（在各包目录下）
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

- D-090 目标路由放 `src/modules/<domain>/routes.ts`，同域配 `service/repository/sqlite-repository`；server.ts 只遍历模块注册。
- 请求体校验用 `parseBody(Schema, request, reply)`；查询参数用 `parseQuery`；鉴权用 `requireSuperAdmin`/`requireActor`（均在 helpers.ts）。
- CSV 上传用 `readCsvUpload(request, reply, { maxBytes, decode })`。
- D-090 目标：生产只保留统一 SQLite repository；InMemory 仅作 `test/support` fake，File Store 与生产内存 fallback 待迁移删除。新增域禁止再建三实现。
- API 响应：200+JSON；目标错误 envelope `{ code: string, detail: string, fields?: object }`；列表直接数组。
- 复用：`routes/helpers.ts` 提供 parseBody / parseQuery / readCsvUpload / sessionActor / requireSuperAdmin / requireActor / isLoopbackOperator / buildScheduleSnapshot / cookie 族。`authz.ts` 提供 isSuperAdmin / isGroupLeadOf / isGateReviewer / memberHasPmFlag。
- 报账域是 D-090 首个模块模板试点，目标见 `docs/design/reimburse-invoice-quality.md`。红线：发票/付款截图/查验单**文件本体永不上传**；条目人键只回本人+超管，批次聚合无按人明细；跨域入库改由 application service + 事务编排，route 不直调两个 repository。

### 前端（hub-console）

- Feature 文件夹 `src/features/<domain>/`，>400 行必拆子组件到 `components/` 子目录；存量 `sub/` 在 ARCH-UNIFY 迁移时收口。
- 数据获取封装到本域 `features/<domain>/hooks.ts` 的 `useXxx()`，组件不直接写 useQuery/useMutation。query key 必须用 `api/queryKeys.ts` 工厂。
- Mutation 错误由全局 MutationCache.onError toast 兜底；静默场景标 `meta: { silent: true }`。
- 跨 feature 复用放 `src/shared/`（含 `shared/lib/` 纯函数），不从 Page 导出公共符号。
- API client 一域一个 segment；`src/api/client.ts` 只组合，禁 `domain.ts/system-pm.ts` 式多域段。
- 图标统一 lucide-react。用户可见文案走 `i18n/translations.ts` 的 `t()`。
- 路径约定：无 `@/` alias，feature 内相对路径，跨域走 `../shared/`。
- 复用：`shared/EmptyState.tsx`（空态）/ `shared/roster.tsx`（名册）/ `shared/QueryGate.tsx`（query 守卫）/ `shared/lib/`（identity-utils / pool-utils / date-utils / resource-tasks / project-nav）。CSS 基类：`.card`（卡片）/ `.card--interactive`（hover）/ `.empty-state` / `.gate-field`（表单字段）。

### 契约（hub-contracts）

- 新 schema 进入 `src/domains/<domain>/model.ts`；写侧请求体走同域 `requests.ts`，纯规则走 `policies.ts`。
- 纯函数（derive/validate）放契约包，前后端共用，前端不得重新实现。
- 导出即公共 API（index.ts 显式清单），改动需三包 verify 全绿。

### 测试

- 框架 Vitest，测试放各包 `test/` 目录，命名 `<domain>.test.ts`。
- 契约包：每个 derive/validate 纯函数应有专属测试。
- Server：路由测试用 `app.inject`；e2e-pillars 跑真进程+统一 SQLite+重启存活。
- Console：组件/工具测试 + Playwright e2e（`e2e/suite/` 场景脚本）。
- 新功能 DoD 必含至少一条测试谓词。

### CSS

- 样式按 feature 分文件 `src/styles/NN-*.css`（`main.tsx` 按序 import 保级联），四主题通过 `[data-theme]` + `:root` 变量切换。
- 新样式用 `:root` token（`--radius-*` / `--shadow-*` / `--space-*`），不硬编码。
- 卡片/空态/表单字段等已有基类（见前端复用索引），不重复写 border/radius/bg/shadow。

## 8. 架构（D-090 目标；迁移优先于功能增长）

```
依赖方向：console ──→ contracts ←── server

每域四层：presentation → application → domain；infrastructure 实现 application ports
hub-contracts   domains/<domain>：model/requests/policies/import/export
hub-server      modules/<domain>：routes/service/repository/sqlite-repository；生产仅统一 SQLite
hub-console     features/<domain>：api/hooks/page/components/lib；一域一个 API segment
```

软件架构唯一真相：`docs/design/software-architecture.md`。不考虑旧数据兼容；迁移完成时旧 Store、配置、alias、fallback 与被取代文档同批删除。

## 9. 反模式（绝不）

| 绝不 | 原因 |
|------|------|
| 新建 parseBody/readCsvUpload/sessionActor 等已有 helper | 单源，helpers.ts 是唯一入口 |
| 前端重新实现 contracts 里的 derive/validate | 共享真相，改一处三包生效 |
| 组件直接写 useQuery/useMutation | 必须走 useXxx hook + queryKeys 工厂 |
| 手写 CSS border/radius/shadow 组合 | 用 .card 基类或 :root token |
| 新增 File Store / 生产 InMemory fallback | D-090 生产只有统一 SQLite repository |
| route 直接编排多个 Store/repository | 跨域写必须进入 application service + 显式事务 |
