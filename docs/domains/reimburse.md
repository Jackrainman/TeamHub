---
kind: canonical-domain
status: active
domain: reimburse
truth_for: reimbursement-season-workflow-evidence-payout-and-delivery
last_reviewed: 2026-11-20
---

# Reimburse 领域

## 1. 职责与边界

Reimburse 是实际垫付支付的主台账，覆盖草稿、提交、财务核对、退回补充、核准、线下打款登记与完成。支出类型固定为采购 / 打车 / 车票 / 其他；一条目就是一笔实际支付，不建设预算、订单、二级审批或真实支付系统。混合导入 v2 的上传、解析与 OCR 均在服务端执行；确认后原件按 D-094 走受控留档通道。

## 2. 当前条目与流程（CURRENT）

- `ReimburseEntry` 含 `seasonId`、可空 `expenseType`、`summary`、整分 `totalAmountFen`、可选商品明细、`workflowStatus`、`revision`、核对版本、核准金额、`payoutId` 与追加式历史。未知金额为 null，不用 0 冒充。
- `purchase→goods`，打车/车票/其他→`expense`，只供既有库存联动；`invoiceType` 仍是票种。只有采购显示商品明细和可选入库，入库不是财务完成前置。
- 状态机为 `draft→submitted→reviewing→pendingPayment→completed`；核对中可退回，草稿/已提交/退回可撤销，待打款可由财务说明理由后撤销核准。完成必须有 payout；旧批次 `reimbursed` 读时按 `submitted` 呈现，不落盘改数据，也不迁移成完成。
- 资料完整度 `draft/partial/complete` 由 `deriveReimburseCompleteness` 派生，与识别确认、原件留档、财务核对和打款分开。缺发票或付款材料仍可保存、提交、核对和内部导出；缺项核准或核准金额调整必须填写处理意见。
- 字段、明细、材料、附件新增/删除/用途变化递增 `revision` 并清除旧核对/识别确认；无变化重试、查看、下载、导出、核对动作和批次归属变化不增加内容版本。写命令携带 `expectedRevision`，冲突返回 409。
- 历史记录动作、操作者、时间、版本、状态变化、原因和变更字段；不保存每次修改的完整附件副本。
- 导入确认只在上传人身份下创建 `draft` 条目；`memberId` 不可代填，默认 `batchId=null`，可显式勾选批次。条目、证据元数据与作业确认状态同事务写入，`clientRequestId` 重放返回同一条目。

## 3. 混合导入与人工确认

- 入口只收 `.pdf/.ofd/.xml/.jpg/.jpeg/.png/.zip`；单文件 20MB、单次 50 文件。ZIP 解包成员逐条落盘，嵌套 ZIP 记不支持；散图、PDF/XML/OFD、ZIP 从同一居中弹窗混合上传。旧 XLSX 与浏览器 OCR 代码暂保留，但当前 UI 不再走旧通道。
- 数据模型为 `reimburse_import_jobs(id,data)` 与 `imports/<jobId>/<fileId>.<ext>` 私有字节。三层状态不合并：file 为上传中 `uploading`→已解析 `parsed`→已挂载 `mounted`，另有无法识别 `unreadable`、重复 `duplicate`、待定 `pending`、已删除 `removed`；pair 为等待证据/待定 `pending`、已配对待确认 `matched`、已建单 `confirmed`、已忽略 `dismissed`；job 仅为解析中 `parsing`→可审阅 `ready`→已关闭 `closed`，整包失败或进程重启中断也进入 `closed` 并记原因。
- POST 保存后立即返回，服务端异步解析；前端每 2 秒轮询，10 分钟后停止。PDF 先抽文字层，无文字再 OCR；图片一律 OCR。tesseract.js 使用仓库内 `@tesseract.js-data` 的 `chi_sim+eng`，禁止联网下载；OCR 并发 1、单文件 60 秒，单文件失败只记 `unreadable/error`。
- 发票金额取 `totalAmountFen`；付款截图优先支付金额/实付（含实付款）/合计/交易金额同行金额，标签允许 OCR 字间空白且金额可省略 ¥，否则取全图最大 ¥ 金额。金额只归一化千分位与小数点两侧空白，不把空白隔开的两段数字粘成一笔。同金额 invoice×paymentShot 唯一时才生成高置信 `matched`；同额多候选全部 `pending/ambiguous-amount`，缺角色为 `no-match`，无金额为 `no-amount`，不支持为 `unsupported`。不跨人/作业，不猜发票号，不自动提交。
- 删除单个文件走 `DELETE /api/reimburse/imports/:id/files/:fileId`；保留 originalName、sha256、removedAt 并追加 `history:file-removed`，立即重算该 job 配对，金额重复删除一张后可自动成为唯一配对。待定区动作只有删除文件、手动建单、忽略；忽略走 `POST .../pairs/:pairId/dismiss`。换文件就是删除后重传，已建单文件须改走条目凭证规则。
- 上传按 sha256 对同一 member 的现存文件去重，`duplicate` 不存盘、不参与匹配。显示名可自动改为发票 `YYYYMMDD-销方-金额.ext`、付款 `YYYYMMDD-金额-付款.ext`；originalName 不变，磁盘仍用 UUID。作业记录长期保留，30 天到期只清导入字节，不删条目证据。
- API 为 `POST/GET /api/reimburse/imports`、`GET/DELETE /api/reimburse/imports/:id`、`POST .../:id/reparse`、`POST .../:id/confirm` 加上述文件删除与忽略端点。本人可让已落盘文件异步重新解析并重算配对，重复请求复用同一配对且不重复建单；财务可按 memberId 只读查看他人作业，不可确认、删除、重新解析或下载导入字节，下载仍走条目凭证通道并留审计。
- UI 常驻「导入任务」，只分待确认/待定/已建单三池；关闭弹窗不丢任务，待定与已关闭作业可点「重新解析」。主操作仅「新建一笔」/「批量导入」，旁边静态说明「一笔 → 新建一笔；一包 → 批量导入」；报销管理收进标题右侧设置图标。快捷预设打车/车票/采购位于「新建一笔」弹窗顶部；「批量导入」弹窗说明一次传多张、自动配对、只确认。筛选有状态/流程/类型可见标签（财务另有批次）。小于 1200px 单列，不做通知提醒或移动端拍照。

## 4. 本人与财务工作台

- 保留表格 + 居中模态表单/导入弹窗，条目详情仍用 `SideDrawer`。本人列表展示摘要、类型、申请金额、资料完整度、工作流、退回提示与核准/打款结果；状态、流程、类型筛选均有可见标签，快捷预设收进「新建一笔」弹窗。
- 详情依次呈现字段、采购明细、票据摘要、原件、退回意见与历史、核准/打款结果和可选入库；只有一个编辑草稿。
- 财务从管理员抽屉升级为工作台，按待接收、核对中、退回、待打款、完成等状态组织，支持赛季、批次、类型和缺项筛选。详情同屏查看字段与受控原件并执行核对、退回、核准。
- 结构汇总由服务端同源返回，只按支出类型等结构维度展示数量、申请/核准/打款金额；未知金额单独计数，撤销条目不进入后续汇总。没有个人小计、排行、次数或速度面板。
- 批次仅是同项目、同赛季的归集与交付容器。缺件不阻塞整批，批次提交不冻结条目；批次进度由未撤销条目派生，空批次没有正式交付包。

## 5. 线下打款事实

- `ReimbursePayout` 记录 `recipientId`、条目 IDs、实付总额、时间、方式、可选流水号/备注、登记人/时间和幂等键。财务可选择同一提交人的多笔待打款条目合并登记，每条保留自己的类型。
- 每条目必须已核准、未被其他 payout 占用，实付总额等于核准金额合计。创建 payout、关联条目、历史与完成状态在同一 SQLite UoW 中成功或回滚；首版不做部分打款、分期、退款或在线支付。
- 打款事实仅本人与财务可见；界面按钮为“登记打款结果”。首版不要求打款截图，也不开放财务代传发票或付款截图。

## 6. 导出与交付包

- 支持当前赛季、类型、勾选条目和批次范围。本人只能导本人，财务可导全队；服务端对请求 ID 与授权范围求交集。导出不要求先核准，每行仍带工作流与缺项。
- `POST /api/reimburse/export` 生成 XLSX 或 ZIP。XLSX 含“报账明细”“类型汇总”两张表；明细一行一条目，包含赛季、批次、类型、提交人、摘要/明细、申请/核准/打款金额、工作流、缺项、发票号码/日期、凭证路径、打款日期/流水号和备注。长号码按字符串，未知金额留空；没有个人汇总表。
- ZIP 结构为 `报账明细.xlsx`、`manifest.json`、`凭证/<entryId>-安全标题/<evidenceId>-原文件名`。manifest 记录 ID、用途、原名、hash、缺项及读取失败；失败不得静默漏件，重名不得覆盖，原件总字节上限 200MB。
- 服务端沿用 fflate 与最小 OOXML 写读器，不引第二套 Excel 框架（D-099）。附件包只走鉴权服务，不生成公开静态 URL；导出和逐件读取留痕。

## 7. 权限、存储与隐私

- 本人编辑草稿/退回条目、上传/删除/改用途和撤销；财务只在核对中修正字段并留痕，执行接收、核对、退回、核准、撤销核准与打款。运营、组长没有额外原件或代改权限。
- 原件清单与字节只对本人和财务（PM/超管旗）开放；普通条目响应始终 `evidence=[]`，清单只走条目专属端点。财务可下载但不能代传、代删或代改用途。
- 新字节先经 tmp→rename 完整落盘，再连同元数据、revision、材料状态和历史写 SQLite；失败清理孤儿字节。重复上传先验证原字节，缺失时可幂等修复且不增加版本。
- 生产仍是统一 SQLite；schema v4 新增 `reimburse_payouts` 表，不重建或修改真实数据。下载留痕表继续存在。部署、备份与真实数据迁移另行执行，不在源码任务内操作。
- 私人查询 key 包含 `identityCacheKey()`、赛季和条目维度；界面隐藏不替代服务端鉴权。真实票据只在隔离测试目录验收，不进 Git、公共测试资产或外部识别服务。
