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
- goods 条目通过窄 stock-in context 选择库存候选；服务端在同一 SQLite UnitOfWork 内写结构化 `reimburseItemIndex`，前端不读完整库存或解析 note。
- PDF/XML 会保留购买方名称、税号和识别来源；部署级 profile 默认校验哈尔滨工业大学抬头，双空值可跳过。
- 卡片显式区分“需换抬头”和“需核对”，给出归档命名建议；批次按 gross/eligible/blocked/review 展示，blocked 条目阻止提交。
- CURRENT 仍只接受 PDF/XML，尚无 ZIP/OFD、OCR 或真正的文件筛选下载导出。

## 3. 目标结构（TARGET）

- 已冻结首个三包同构模板；后续只在域内扩展 parser、export adapter 和窄跨域 port。
- ZIP/OFD 复用统一归档安全门；OCR 只有真实样本验证达标后才允许进入本地 import pipeline。
- 财务导出补筛选/选择和实际下载，不把发票文件上传服务器。

## 4. 领域不变式

- 发票、付款截图、查验单文件本体永不上传；OCR/解包/解析均在浏览器本地运行。
- 金额以分为整数；不能精确表达时显式标记需核对，不制造小数精度。
- 条目人键只回本人和项目管理员；批次聚合无按报销人明细或统计。
- 抬头不匹配、信息缺失和人工/OCR 补录必须给结构化核对原因。
- AI/OCR 结果是草稿，用户确认后才进入正式条目。

## 5. 跨域接口

- inventory 只暴露零件匹配和 stock-in port；报账不读取库存完整 snapshot。
- system 通过 `AppSettings.projectId` 提供项目上下文；报账 profile 由本域 singleton repository 持有。
- 本地 import pipeline 复用统一归档安全门；导出使用共享 export/filename 基础设施。
- PM 可查看有权限的报账事实和导出，但名字不得进入治理聚合。

## 6. 已知陷阱

- profile 变更会重新派生历史条目的质量状态；这是部署标准变化的显式结果，不能静默固化旧判断。
- `recognitionSource=manual/ocr` 即使字段齐全仍会进入“需核对”，避免把草稿识别当成已验证事实。
- 纯扫描 PDF 文字层为空时只能手填；OCR 技术可行性尚未用真实样本验证。

## 7. 未落地差异与 TODO

- `ARCH-UNIFY`：本域模板已完成并由架构门冻结；下一域按 checklist → baseline 顺序迁移。
- `REIMBURSE-OFD-PARSE`：用单一归档底座导入 ZIP/PDF/XML/OFD，并加文件数、总解压量和递归容器安全门。
- `REIMBURSE-PM-EXPORT`：命名建议与四口径已完成；仍需筛选/选择和实际导出适配器。
- `REIMBURSE-OCR-PROBE`：先用真实样本验证 tesseract.js 体积、耗时、内存和识别率，达标后再进入主流程。
