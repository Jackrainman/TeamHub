---
kind: research
status: active
domain: reimburse
truth_for: reimburse-test-survey
checked_at: 2026-08-31
review_after: 2026-11-30
---

# Reimburse 报账模块测试与缺陷调查报告

> 测试范围：`apps/hub-contracts/src/domains/reimburse/`、`apps/hub-server/src/modules/reimburse/`、`apps/hub-console/src/features/reimburse/`
> 领域文档：`docs/domains/reimburse.md`（ARCH-UNIFY A3 首个三包纵切模板，v0.47.0–0.59.0）
> 测试日期：2026-08-31
> 约束：未修改任何源代码、未做任何 git 写操作；唯一写出的文件是本报告。

## 0. 基线信息

- **git HEAD**：测试初为 `e9a2e94`（REIMBURSE-OFD-PARSE v0.59.0）；**会话结束 HEAD = `2e26f14`**（refactor(contracts): ARCH-UNIFY A4 库存域 v0.59.1）——并行 agent 的 A4 提交在会话中段落地并已 commit。
- **并行改动影响评估（重要）**：A4 提交把 `inventory.ts`/`inventory-import.ts` 收进 `domains/inventory/` 四件套，联动改 import：`reimburse/requests.ts` 仅 `../../inventory.js` → `../inventory/index.js`（**import 路径、行为等价**），另改 `gov-report.ts`/`scenario-seeds.ts`/`index.ts`/版本号，并把我本次允许写的报告一并 commit 进 `2e26f14`。**对 reimburse 语义零影响**。为排除污染，在 `2e26f14` 上复跑：contracts 438/438、server 414/414（先 `npm run build` 重建 dist）、console 260/260，reimburse 专项 30/13/32 亦全绿（专项最后又复验 30/8/18）。**本报告结论基于最终工作树状态 `2e26f14` 有效**。
- **运行环境**：node v22.23.1；pdfjs-dist 4.10.38、fflate 0.8.3（根 node_modules 提升）。生产库 `~/teamhub-data` 与 `~/TeamHub` 均未触碰。本报告是会话中唯一写出的仓库文件；`npm run build` 重新生成了 hub-contracts `dist/`（gitignored，未污染提交）。

---

## 1. 单元 / 集成测试（vitest）

### 1.1 全量结果

| 包 | 命令 | 结果 |
|---|---|---|
| hub-contracts | `npx vitest run` | **34 文件 / 438 用例全部通过** |
| hub-server | `npx vitest run` | **52 文件 / 414 用例全部通过** |
| hub-console | `npx vitest run` | **30 文件 / 260 用例全部通过** |

### 1.2 reimburse 相关测试明细（全部通过）

| 文件 | 覆盖点 | 用例数 |
|---|---|---|
| `hub-contracts/test/reimbursement.test.ts` | `parseInvoiceXmlText`/`parseInvoicePdfText`/`cleanInvoiceItemName`、`deriveReimburseStatus`、`deriveBatchSummary`、`derivePurchaserCheckStatus`、`deriveReimburseReviewReasons`、`deriveReimburseFinancialSummary`、`suggestReimburseFilename`、`derivePartAcquisition`、PartAction 向后兼容 | 23 |
| `hub-contracts/test/reimburse-archive.test.ts` | `parseInvoiceXbrlText`（OFD 内嵌 XBRL）、`classifyInvoiceEntryKind`、`planInvoiceArchive` 安全门（quotaEntries/quotaBytes/nested/tooLarge/type） | 7 |
| `hub-server/test/reimburse-routes.test.ts` | 路由端到端：人键过滤/查重 409/越权 403/批次超管门/状态流转/聚合 summaries/stock-in 联动/防重复入库/profile 权限/匿名模式 | 8 |
| `hub-server/test/reimburse-store.test.ts` | InMemory fake 与统一 SQLite 同契约一致性 + 重开库 id 序列存活 | 2 |
| `hub-server/test/reimburse-stock-in-service.test.ts` | Service + SQLite UoW：成功一次提交、第二条写故障全回滚、拒绝 async callback | 3 |
| `hub-console/test/reimburse.test.ts` | `formatAmountFen`/`yuanTextToFen`/`buildCreateEntryRequest` 草稿装配校验 | 11 |
| `hub-console/test/reimburse-import.test.ts` | 单文件导入编排（xml/pdf/分类/失败结局） | 14 |
| `hub-console/test/reimburse-archive-import.test.ts` | fflate 真解包 ZIP/OFD、发票号去重留权威源、条目数门、损坏 zip | 7 |

**reimburse 子集合计：8 个测试文件 / 75 用例全部通过。** 全量套件无失败，与并行重构无冲突。

---

## 2. 解析器实测（真实发票语料）

**语料来源**：`/home/ubuntu/发票测试/`（ai-log 提到的「滴滴 5+铁路 4」真实票据就在这里）：
- 打车报销/：4 张滴滴电子发票 PDF + 1 张普通数电票 PDF（07-16 蓝领公寓-常州站）+ 5 张行程报销单 PDF + 4 张微信支付截图 JPG
- 车票/：4 张铁路电子客票，各含 `.pdf` + `.ofd`，其中 3 张还有 `.zip` 归档

**方法**：用 pdf.js 4.10.38（Node 直连，带 `cMapUrl`/`standardFontDataUrl` 指向仓库 cmaps/standard_fonts）抽文本行 → `buildTextLines` 视觉重排（与 console 实现同构）→ `parseInvoicePdfText`；OFD 用 fflate 解包取内嵌 XBRL → `parseInvoiceXbrlText`。全程在 `/tmp` 只读运行。

### 2.1 结果汇总（9/9 全字段解析，与 ai-log「全语料实测 9/9」一致）

**滴滴 5 张全部 ✓**
| 文件 | 发票号 | 销售方 | 购方/税号 | 价税合计 | 明细 |
|---|---|---|---|---|---|
| 7-1 常州站-蓝领公寓/滴滴电子发票.pdf | 26127000000363050731 | 滴滴出行科技有限公司 | 新疆大学/12650000457601471G | 6880分 | 客运服务费 1 行 |
| 6-29 新疆大学-乌鲁木齐站/滴滴电子发票.pdf | 26127000000363050646 | 滴滴出行科技有限公司 | 新疆大学/12650000457601471G | 6870分 | 客运服务费 1 行 |
| 7-10 蓝领公寓-南理工/滴滴电子发票.pdf | 26127000000363050812 | 滴滴出行科技有限公司 | 新疆大学/12650000457601471G | 890分 | 客运服务费 1 行 |
| 7-10 南理工-蓝领公寓/滴滴电子发票.pdf | 26127000000363051151 | 滴滴出行科技有限公司 | 新疆大学/12650000457601471G | 840分 | 客运服务费 1 行 |
| 07-16 蓝领公寓-常州站/电子发票 07-16….pdf | 26127000000363030686 | 滴滴出行科技有限公司 | 新疆大学/12650000457601471G | 6280分 | 客运服务费 1 行 |

> 5 张全部识别出：发票号、日期、销售方（同行双名称取第二个=滴滴）、购方名称/税号、价税合计、单条「客运服务费」（折扣行 83.50+2.50−16.70−0.50 并入正确）。其中 4 张是滴滴「电子发票（普通发票）」版式，1 张是普通数电票版式，均正确。

**铁路 4 张 PDF + 4 张 OFD/XBRL 全部 ✓（且 PDF 与 OFD 发票号一致）**
| 票 | PDF 明细 | OFD/XBRL 明细 |
|---|---|---|
| 上海-常州 26319130671006495711 | 铁路客运（G8274）· ¥91.00 | 电子发票（铁路电子客票） 上海→常州 G8274 · ¥91.00 |
| 乌鲁木齐-常州 26659142801001190762 | 铁路客运（Z306 乌鲁木齐站-常州站）· ¥615.00 | … 乌鲁木齐→常州 Z306 · ¥615.00 |
| 常州-上海 26659199037000045809 | 铁路客运（Z303 常州站-上海站）· ¥24.50 | … 常州→上海 Z303 · ¥24.50 |
| 常州-上海回家 26329130452000986260 | 铁路客运（G1985 常州站-上海虹桥站）· ¥77.00 | … 常州→上海虹桥 G1985 · ¥77.00 |

> 铁路 PDF 中文 CID 字体（12306）在带 cMap 时完整抽取；OFD 内嵌 XBRL 4/4 命中（Attachs/*.xml 回退扫描均找到 `<xbrl` 根）。PDF 与 OFD 发票号逐字一致。**唯一缺口**：上海-常州 PDF 区间丢失（见缺陷 #1）。

**行程报销单 5/5 正确 unrecognized（返回 null）**——行程单不会被误识别成发票，符合红线「不臆造」。

**ZIP 归档导入（fflate 路径）**：4 个铁路 zip 全部过安全门（`planInvoiceArchive`），OFD 条目解析 OK、PDF 条目扩展名分类正确；`打车报销.zip` 安全门计数正确（10 可解析 + 11 跳过 type=截图/目录），但见缺陷 #3（GBK 文件名乱码）。

### 2.2 边界样本实测（自造）

| 样本 | 结果 | 判定 |
|---|---|---|
| XML 缺销售方块 | `seller=null`，其余字段/明细完整 | ✓ 优雅 |
| XML 无明细块 | `items=[]`，`totalAmountFen` 仍取到 | ✓ |
| XML 负数金额行（Amount=-10, ComTaxAm=-1.3） | 明细 `amountFen=-1130`（允许），`totalAmountFen` 独立 | ✓ |
| PDF 折扣行 `*衡器*电子秤 13% -0.88 -0.12` | 并入上一条 → `amountFen=1542` 与价税合计闭合 | ✓ |
| PDF 只号码+价税合计、缺日期/明细/销售方 | 部分解析：号✓、日期/明细/seller=null | ✓（转手填） |
| PDF 完全无特征 | `null`（转手填） | ✓ |
| XBRL 无发票号 / 非 XBRL 根 | `null` | ✓ |
| XBRL 缺票价/区间/车次 | `totalAmountFen=null`、`items=[]`，号/购方仍取到 | ✓ |
| `planInvoiceArchive` 边界：单条目=50MB 恰好解析、+1 字节 skip/tooLarge、嵌套 zip skip/nestedContainer、大写扩展名 PDF/OFD 正确分类 | 全部符合 | ✓ |
| 铁路 PDF 版式：车次夹在站名之间 | **区间丢失（缺陷 #1）** | ✗ |

### 2.3 金额口径实测

- `deriveReimburseFinancialSummary`：gross=eligible+blocked 恒成立（实测 6000=4000+2000）；review 独立口径且可与 blocked 重叠（review 含 blocked 票据，实测 count=2/amount=5000）。与单元测试断言一致。
- `suggestReimburseFilename`：跨平台非法字符 `<>:"/\|?*` 全部替换为 `-`；缺日期/销方给 `unknown-date`/`unknown-seller` 稳定占位；金额两位小数。
- 模型约束：`totalAmountFen` 由 `ReimburseItemSchema` 允许负值（折扣并入后单行可为负），`ReimburseEntrySchema.totalAmountFen` 恒 `nonnegative`——四桶求和永不出现负数，红线「金额以分为整数」成立。

---

## 3. 服务级 API 实测（临时实例 + /tmp 临时库）

**方法**：`openUnifiedDb('/tmp/reimburse-live/teamhub.sqlite').initialize({dataMode:'demo', identityMode:'identity'})` 初始化临时库（demo seed 含超管 `m-progA`、普通成员 `m-visionA`/`m-ecB` 及库存），`TEAMHUB_DB_FILE` 指向该临时库起真实 `hub-server`（HUB_PORT=4199），全程 curl 走 HTTP。**未触碰 `~/teamhub-data`/`~/TeamHub`**。跑完已杀进程、清空 /tmp。

| # | 步骤 | 结果 |
|---|---|---|
| 1 | POST /api/session（免 PIN 登录普通成员 / 超管） | 200，身份 cookie 签发 ✓ |
| 2 | GET /api/reimburse/profile（匿名可读） | 200，默认抬头「哈尔滨工业大学」✓ |
| 3 | POST /api/reimburse/entries（客户端塞 `memberId:m-progA`） | 201，落库 `memberId=m-visionA`（服务端钉 actor）✓ |
| 4 | 同发票号再录 | 409 `REIMBURSE_INVOICE_DUPLICATE`（全库唯一，跨人也撞）✓ |
| 5 | 空发票号草稿 ×2 | 201/201（跳过查重）✓ |
| 6 | 人键过滤 | m-visionA 只见自己 4 条、m-ecB 只见自己 1 条、m-progA 见全员 5 条 ✓ |
| 7 | 未登录 GET entries | 401 ✓ |
| 8 | 批次：普通成员建批 / 超管建批 | 403 / 201（status clamp=collecting）✓ |
| 9 | 装批（本人 PATCH batchId） | 200 ✓ |
| 10 | 提交批次（材料未勾） | 409 `REIMBURSE_BATCH_BLOCKED`，blocked.count=1 ✓ |
| 11 | 补 materials → 再提交 | 200，batch.status=submitted ✓ |
| 12 | GET batches 聚合（超管） | summary 四桶正确；`JSON.stringify` 无 `memberId` 字面（红线：不按人聚合）✓ |
| 13 | POST stock-in（既有件入 10） | 201，action `restock` + `acquisition=selfPurchase` + `reimburseEntryId` + `reimburseItemIndex`，件总量 200→210 ✓ |
| 14 | 防重复入库（申请 11 > 剩余 10） | 400 `REIMBURSE_STOCK_QUANTITY_EXCEEDED` ✓ |
| 15 | 超管代入库（非本人条目） | 201（超管可入）✓ |
| 16 | GET stock-in-context（普通成员） | 只含自己条目；`partTypes` 仅 [id,partNumber,name,category,unit] 窄投影（无 totalQuantity）✓ |
| 17 | profile：普通成员 PUT / 超管 PUT | 403 / 200 ✓ |
| 18 | **红线**：POST 携带 `pdfBase64`（假 PDF 字节） | 字段被 Zod 剥离，落库条目无该键、响应无任何原始内容 ✓ |

**红线验证汇总**：
- **发票原件永不上传**：reimburse 路由清单仅 10 个 JSON 端点（无 multipart/文件上传）；`CreateReimburseEntryRequestSchema` 由 `ReimburseEntrySchema.omit(...)` 派生（非 strict，未知键被**剥离**而非落库），实测塞 `pdfBase64` 不落库；文件解析只在浏览器本地（`analyzeInvoiceFileDeep`/`pdf.js`）。两层都成立。
- **人键只回本人+超管**：普通成员 GET 只见自己、超管见全员、未登录 401；匿名模式回全量（文档声明行为，实测 GET 200/全量、POST 400 须登录、批次 403）。
- **批次不按人聚合**：`summaries` 只有 count/totalAmountFen/incompleteCount/四桶，无 memberId/明细（实测 `JSON.stringify` 校验通过）。

---

## 4. 缺陷清单（按严重度排序）

### #1 [中] 铁路电子客票 PDF：车次夹在站名之间时区间丢失
- **现象**：真实样本「上海-常州 26319130671006495711」PDF 解析出 `铁路客运（G8274）`，缺 `上海站-常州站`；OFD/XBRL 路径则完整（`上海→常州 G8274`）。
- **复现**：`parseInvoicePdfText(["…","上海站 G8274 常州站","Shanghai Changzhou","…","票价:￥91.00","…"])`（车次在站名之间、同在一行）。
- **根因**：`apps/hub-contracts/src/domains/reimburse/import.ts` 区间正则 `/([一-鿿]{2,8}站)\s+([一-鿿]{2,8}站)/` 不跨车次——站名之间夹 `G8274` 时第二站匹配失败。测试样本版式恰好是「G1985」独占一行、「常州站 上海虹桥站」另一行，故单测未暴露。
- **影响**：仅**命名质量**（金额/发票号/购方全对）；同票 OFD 在场时数据不丢。建议正则为两站之间允许 `(?:[A-Za-z0-9]{1,6}\s*)?` 的车次段，或先剥车次再取两站。
- **证据**：`/home/ubuntu/发票测试/报销/车票/上海-常州/26319130671006495711.pdf`；实测抽取行 `7 "上海站 G8274 常州站"`。

### #2 [中] 已提交（submitted）批次无不可变快照，可被静默改写
- **现象**：批次提交后，成员仍可 PATCH 条目 `batchId`（装批/移出）或改 materials/note；超管仍可改批次名/状态（含从 submitted 改回 collecting）。聚合 summaries 每次实时重算，提交后批次数字会悄悄变化且**无再审批**。
- **复现**：`PATCH /api/reimburse/batches/:id {status:'submitted'}` 成功后再 `PATCH /api/reimburse/entries/:id {batchId:null}` 或 `{status:'collecting'}`——均 200。
- **根因**：`apps/hub-server/src/modules/reimburse/service.ts` `updateEntry` 只校验 `patch.batchId` 是否存在，不查批次状态；`updateBatch` 只在**进入** submitted 时跑质量门，之后无状态机约束（`collecting/submitted/reimbursed` 任意互转）。路由测试未覆盖提交后变更路径。
- **影响**：报账审计完整性——提交后的财务快照可被改写而无留痕/重审。建议：submitted 后锁定条目归属（batchId 只允许超管在 collecting 阶段改），或记录提交快照。

### #3 [中低] 非 UTF-8（GBK/Windows）zip 文件名乱码
- **现象**：`打车报销.zip`（Windows 压缩，中文目录/文件名，GBK 编码）经 console 真实解包路径 `extractZipEntries`（fflate Unzip）解出 `´ò³µ±¨Ïú/07-16 À¶Áì…µç×Ó·¢Æ±….pdf` 乱码。
- **复现**：`node` 对 `/home/ubuntu/发票测试/报销/打车报销.zip` 调 `extractZipEntries`；10 个 PDF 名全部无合法 CJK。
- **根因**：`apps/hub-console/src/features/reimburse/lib/archive-extract.ts` 依赖 fflate 默认 UTF-8 解码，无 GBK/CP437 回退；zip 未置 UTF-8 flag 时条目名被错解。
- **影响**：扩展名分类仍有效（`.pdf/.xml` 尾巴 ASCII 未坏，解析与安全门不受影响），但导入确认队列/失败提示的文件名对用户不可辨认。真实 12306 铁路 zip 条目名是 ASCII，无此问题。建议：条目名按 flag 位区分编码，或用 iconv-lite 兜底解码。

### #4 [低] 批次状态允许跳级/回退
- **现象**：`PATCH /api/reimburse/batches/:id {status:'reimbursed'}` 可从 collecting 直接到 reimbursed（绕过 submitted）；也能从 reimbursed 改回。
- **根因**：`service.updateBatch` 无状态转移表，只有 `submitted` 一个门。`apps/hub-server/src/modules/reimburse/service.ts`。
- **建议**：限定合法转移 `collecting→submitted→reimbursed`（顺向单向），非法转移 400/409。

### #5 [低/信息] CreateReimburseEntryRequest 要求所有 nullable 键显式存在
- **现象**：POST entries 若省略 `purchaserName`/`seller`/`note`/`actualItemName` 等键（哪怕想表达 null）→ 400；必须显式 `null`。
- **根因**：`apps/hub-contracts/src/domains/reimburse/requests.ts` 由 `ReimburseEntrySchema.omit(...)` 派生，键必填。
- **影响**：与 console `buildCreateEntryRequest` 全键发送一致，非 bug；但裸 API 客户端不友好。可考虑 `.partial()` 宽容空键。

### #6 [信息/优化] 发票号查重为 O(n) 全表扫描
- **现象**：`createEntry` 每次走 `findEntryByInvoiceNo` → `listEntries().find()`（`sqlite-repository.ts`）。小规模无碍，随条目数增长变慢。
- **建议**：SQLite 上建 `reimburse_entries.invoiceNo` 唯一索引/查询，而非全表扫描。

### #7 [信息/观察] 匿名模式禁用全部批次/配置操作
- **现象**：匿名模式 GET entries 回全量（文档声明），但批次三端点/profile PUT 恒 403、POST entries 400（须登录）。
- **说明**：`service.requireAdmin` 对 `identity=null` fail-closed，属文档行为而非 bug；但若想用匿名模式演示批次流程不可行，特此记录。

---

## 5. 红线验证结论

| 红线 | 结论 | 证据 |
|---|---|---|
| 发票原件永不上传 | ✅ | 无 multipart 路由；`pdfBase64` 实测被剥离；解析全在浏览器本地 |
| 人键只回本人+超管 | ✅ | 服务端过滤（listEntries identity 分支）+ 实测三账号隔离 + 401 |
| 批次不按人聚合 | ✅ | summaries 无 memberId（实测字符串校验）+ 领域不变式落实 |
| 金额以分为整数 | ✅ | `totalAmountFen` nonnegative、item 负行仅限折扣并入、四桶一致 |
| 抬头质量门/核对原因 | ✅ | match/mismatch/missing/skipped 四态 + 结构化原因全量验证 |
| 归档安全门 | ✅ | 50MB/200 条/200MB/嵌套不展开 逐项过界测试通过 |

---

## 6. REIMBURSE-PM-EXPORT 落地建议

**现状盘点**（对照 todo + 领域文档）：
- 已完成：`suggestReimburseFilename` 命名（contracts `export.ts`）、四金额口径 `deriveReimburseFinancialSummary`/`deriveBatchSummary`（含单测）、console `ReimburseEntryCard` 已展示归档命名建议文本、批次响应已带 summaries+profile。
- 已有共享底座：服务端 `apps/hub-server/src/routes/export.ts` 提供 `toCsv`（UTF-8 BOM + `content-disposition`）供 roster/tasks/inventory 复用；console `ReimburseSegment` 目前**无任何 export 方法**。
- 待补齐：**项管视角的全员发票筛选/选择 + 实际下载导出**。

**建议做法**：
1. **服务端导出端点**（新增 `GET /api/export/reimburse?batchId=…&status=…`，挂在现有 `registerExportRoutes` 或 reimburse routes）：
   - 超管门（复用 `requireAdmin`）；匿名/普通成员 403。
   - 输出批量级 CSV：`批次号/批次名/状态/条目数/总金额/gross/eligible/blocked/review/购买方状态汇总`。**列粒度到批次、不进条目明细、绝不出现 memberId/成员名**——守住「名字永不进治理聚合」与「批次不按人聚合」两条红线。
   - 复用 `toCsv` + `deriveBatchSummary`（服务端已有 batches 聚合，导出只是把同一 `listBatches` 结果落 CSV，工作量小）。
2. **console 端选择/筛选**：`ReimburseBatchSection` 加「导出」按钮 + 勾选批次/状态过滤（数据已从 `useReimburseBatches` 拿到，纯前端筛选），`ReimburseSegment` 加 `exportReimburse` 方法，浏览器 fetch blob → `URL.createObjectURL` + `<a download>` 触发下载（与现有导出端点同款 content-disposition）。
3. **文件名联动**：导出条目级列可含 `suggestReimburseFilename(entry)`（仅**建议名**，指向用户本地文件，不携带文件本体）——既满足「筛选/选择和实际下载」，又满足「原件不上传」。
4. **红线护栏**：导出端点响应**只含元数据**，不读/不引用任何发票文件；建议命名列在导出里仅作为用户归档时对照的字符串。
5. **建议验收**：超管导出 409/全空批次 → 空 CSV 带表头；含 blocked 批次 → 列内 blocked 计数正确；匿名/普通成员 → 403；导出 JSON 不含 `memberId` 字面（沿用本报告第 3 节的断言方法）。

---

## 7. 测试产物与复现脚本

- 解析器实测脚本：`/tmp/reimburse-parser-probe.mjs`（真实语料 9/9 + 行程单 5/5）、`/tmp/probe-boundary.mjs`（边界样本）、`/tmp/probe-gbk.mts`（GBK zip）、`/tmp/probe2.mjs`（缺陷 #1 复现行）。均只读、未落仓库。
- 服务级实测：临时库 `/tmp/reimburse-live/teamhub.sqlite` + HUB_PORT=4199 实例，流程 1–18 全部记录，实例已关闭、临时目录已清理。
- 复现命令示例（缺陷 #1）：
  ```bash
  node -e "const {parseInvoicePdfText}=require('.../hub-contracts/dist/index.js'); \
    console.log(parseInvoicePdfText(['上海站 G8274 常州站','票价:￥91.00']).items)"
  ```
