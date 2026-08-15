---
kind: canonical-domain
status: active
domain: reimburse
truth_for: reimbursement-invoice-import-quality-batches-and-stock-in
last_reviewed: 2026-08-15
---

# Reimburse 领域

## 1. 职责与边界

Reimburse 管采购/费用条目、发票元数据、材料清单、报账批次、付款/查验状态和入库关联。发票、付款截图、查验单文件本体始终留在用户设备；服务器只存结构化元数据。

## 2. 当前行为（CURRENT）

- 支持 goods/expense 条目、材料 checklist、批次状态和基于分单位整数的金额。
- 浏览器用 pdf.js 读取 PDF 文字层，也可解析电子发票 XML；纯扫描件无法识别时回到手填。
- `unitPriceFen=null` 表示单价无法精确到整分，不得硬凑；quantity 可为小数。
- 身份模式下 API 按本人/项目管理员可见性返回条目和批次，发票号查重；匿名模式没有个人边界，会返回全量条目。
- goods 条目可选择明细行入库；服务端写库存动作，已入量从动作日志派生。
- CURRENT 只接受 PDF/XML，尚无购买方字段、ZIP/OFD、OCR 或财务导出质量门。

## 3. 目标结构（TARGET）

- contracts 形成 `model/requests/policies/import/export`；PDF/XML/归档解析和质量派生分离。
- server 形成 routes/service/repository/sqlite-repository；报账入库由 application transaction 编排。
- console 形成 api/hooks/page/components/lib，不接完整 HubApiClient、不读全量库存。
- `projectId` 来自当前产品/项目上下文，删除页面硬编码 `prj-robots`。
- 入库关联改为结构化 stocked lines，删除 note 前缀协议。

## 4. 领域不变式

- 发票、付款截图、查验单文件本体永不上传；OCR/解包/解析均在浏览器本地运行。
- 金额以分为整数；不能精确表达时显式标记需核对，不制造小数精度。
- 条目人键只回本人和项目管理员；批次聚合无按报销人明细或统计。
- 抬头不匹配、信息缺失和人工/OCR 补录必须给结构化核对原因。
- AI/OCR 结果是草稿，用户确认后才进入正式条目。

## 5. 跨域接口

- inventory 只暴露零件匹配和 stock-in port；报账不读取库存完整 snapshot。
- system 提供 actor、项目上下文和部署级报账抬头配置。
- 本地 import pipeline 复用统一归档安全门；导出使用共享 export/filename 基础设施。
- PM 可查看有权限的报账事实和导出，但名字不得进入治理聚合。

## 6. 已知陷阱

- `reimbursement.ts` 当前混合模型、请求、规则、XML/PDF 解析和库存类型，已超过 700 行。
- console 存在 `DEFAULT_PROJECT_ID`、完整 client 传递和全量库存读取。
- 已入库关联通过 `reimb-stock-in:<itemIndex>` note 文本解析，属于脆弱隐藏协议。
- 纯扫描 PDF 文字层为空时只能手填；OCR 技术可行性尚未用真实样本验证。

## 7. 未落地差异与 TODO

- `ARCH-UNIFY`：本域作为首个标准纵切模板，先解决结构耦合再扩功能。
- `REIMBURSE-PURCHASER-CHECK`：增加 purchaserName/purchaserTaxNo/recognitionSource、部署级期望抬头、质量状态和批次门。
- `REIMBURSE-OFD-PARSE`：用单一归档底座导入 ZIP/PDF/XML/OFD，并加文件数、总解压量和递归容器安全门。
- `REIMBURSE-PM-EXPORT`：建议文件名、筛选导出和 gross/eligible/blocked/review 双口径。
- `REIMBURSE-OCR-PROBE`：先用真实样本验证 tesseract.js 体积、耗时、内存和识别率，达标后再进入主流程。
