# REIMBURSE-INVOICE-QUALITY：票据质量门与批量归档

> 2026-08-15 立档。来源：对 HITCRT 票据助手公开产品思路的适配评估。本文只借鉴票据
> 校验、批量导入和财务核对体验；TeamHub 继续坚持持久化批次、库存联动、原件永不上传与
> I0 反监视边界。实现前先做仓库级架构扫描，扫描结果可校正模块落点，但不得放宽红线。

## 1. 结论与顺序

| 优先级 | 工作项 | 结论 |
|---|---|---|
| P0 | 购买方抬头校验 + 核对原因 | 先做，作为批次提交质量门 |
| P1 | ZIP/OFD 批量导入 | 共用 `fflate` 解包底座，不引两套库 |
| P1 | 财务导出 + 文件命名建议 | 导出结构化事实与建议名，不承诺服务器导出原件 |
| P2 | 浏览器本地 OCR | 先做真实扫描票性能/识别率 probe，再决定生产接入 |

## 2. 不变式

- 发票、付款截图、查验单文件本体永不上传；服务端只存结构化字段与材料是否已备。
- 名字只出现在报账事实卡和必要对接处；批次聚合永不按人分组、统计或排行。
- 条目持久化、批次流转、入库联动继续保留，不改成关闭页面即清除的一次性工具。
- AI/OCR 只做本地转译，结果必须由人确认；不替财务拍板，不替代原件核验。
- 校验失败不得通过“从总额中静默扣除”掩盖；列表金额与汇总口径必须可解释。

## 3. P0：购买方抬头校验

### 3.1 数据事实

`ParsedInvoice` 与 `ReimburseEntry` 均增加：

```ts
purchaserName: string | null
purchaserTaxNo: string | null
recognitionSource: 'xml' | 'pdf-text' | 'ofd-xbrl' | 'ocr' | 'manual'
```

购买方字段必须进入持久化条目，不能只留在导入草稿；否则服务端无法在装批、汇总、导出时
复核。旧持久化数据迁移时字段补 `null`，来源补 `manual` 或显式 legacy 值，具体由兼容性扫描决定。

### 3.2 配置

期望抬头属于部署/项目配置，不硬编码进 contracts 或组件：

```ts
reimburseProfile: {
  purchaserName: string
  purchaserTaxNo: string
} | null
```

初始化界面可预填“哈尔滨工业大学 / 12100000400000456B”，但保存前明确提示由财务复核；
留空表示跳过抬头校验。配置权限沿用报账管理权限，不开放成员自行改全局标准。

### 3.3 纯派生与比较规则

contracts 提供唯一纯函数：

```ts
derivePurchaserCheck(entry, expected)
  => 'match' | 'mismatch' | 'missing' | 'skipped'
```

- 税号：去空白、转大写后必须完全一致；禁止模糊猜测。
- 名称：去异常空白、归一常见全半角符号后比较；不得用编辑距离自动放行。
- 配置为空返回 `skipped`；票面购买方缺失返回 `missing`，不得等同于 `mismatch`。
- XML 优先读真实数电票标签 `BuyerName` / `BuyerIdNum`，同时兼容已验证的等价标签；PDF
  解析覆盖购销双栏与铁路客票“购买方名称/统一社会信用代码”。OFD/XBRL 复用同一结果形状。

### 3.4 批次门

- `mismatch` 是红色阻塞：收集中可暂存，但不得把批次提交为 `submitted`。
- `missing` 是黄色需核对：允许管理员依据原件确认后继续，确认行为必须留事实记录；一期若尚无
  确认事实模型，则同样阻止提交，避免用备注冒充确认。
- 不改变原始票面金额。批次汇总扩为：

```ts
grossTotalAmountFen
eligibleTotalAmountFen
blockedCount
reviewCount
```

`gross` 是批内全部票面金额，`eligible` 是当前可提交金额；界面必须同时标明口径。不得让现有
`totalAmountFen` 在不改名的情况下偷偷改变语义。

## 4. 核对原因模型

“需核对”不能只靠一枚状态徽标，也不能用 `unitPriceFen === null` 代替全部异常。增加共享派生：

```ts
type ReimburseReviewReason =
  | 'purchaser-mismatch'
  | 'purchaser-missing'
  | 'ocr-derived'
  | 'manually-reconstructed'
  | 'amount-mismatch'
  | 'item-precision-loss'
```

- 红色不可提交：抬头/税号不匹配、总额与明细无法闭合。
- 黄色需核对：购买方缺失、OCR 来源、未识别后手工重建、单价超分精度。
- `unitPriceFen=null` 当前可能只是合法的超分单价，不得直接判识别失败或从金额中排除。
- 卡片显示具体下一步，如“核对购买方税号”“按原件核对金额”，避免只写抽象“异常”。
- 批次只聚合阻塞数/待核对数；不得按垫付人展开统计。具体事实卡可显示必要对接人。

## 5. P1：ZIP/OFD 批量导入

使用一个轻量 `fflate` 解包底座同时支持 `.zip` 和 `.ofd`：

1. `expandInvoiceFiles(files)` 负责容器展开，输出稳定排序的虚拟文件队列。
2. 现有 `analyzeInvoiceFile()` 继续负责 PDF/XML 单文件识别，不在 ZIP 分支复制解析逻辑。
3. OFD 优先读取内嵌 XBRL/XML；PDF 仍是主通道，OCR 只作最后兜底。
4. 单文件失败不拖垮整包，结束后汇总“成功/需手填/不支持/损坏”。

安全门：限制容器字节、解压后总字节、文件数和单文件大小；拒绝递归 ZIP；只接收
PDF/XML/OFD；路径只取 basename；忽略目录与系统垃圾文件；任一上限命中都显式报错。

## 6. P1：命名建议与财务导出

建议名由 contracts 纯函数派生并单测，示例：

```text
20260713-测试线-20.30-521026.pdf
```

规则：日期 + 实际物资名/项目名 + 金额 + 发票号后六位；清理 Windows 非法字符、限制长度、
空字段稳定降级并处理重名。不得把成员姓名默认放进文件名。

由于服务器不保存原件，只承诺：

- 条目卡复制建议文件名；
- CSV/XLSX 导出 `suggestedFilename`、购买方字段、校验状态和核对原因；
- 导入确认阶段原始 `File` 尚在浏览器内时，可提供按建议名下载本地副本。

不承诺持久化后由服务器重新打包、改名下载原始发票；若未来需要，必须重新拍板文件存储红线。

## 7. P2：OCR probe

不直接把 `tesseract.js` 接入生产。先用真实扫描票验证：首次资源体积、单页耗时、低性能设备
内存、发票号/金额/购买方识别率和错误形态。只有核心字段不足时触发：发票号缺失、总额缺失，
或启用抬头校验但购买方缺失。

生产候选约束：Web Worker、并发 1、优先首页、可取消、有进度、模型缓存失败可恢复；所有 OCR
结果标 `recognitionSource='ocr'` 并逐张人工确认。页面明确“本机识别，原件未上传”。

## 8. 原子实施批次与验证谓词

### Q1 `REIMBURSE-PURCHASER-CHECK`

- contracts：schema、解析器、派生函数和专属单测。
- server：三 store 兼容、配置与批次提交门、route 测试。
- console：设置入口、导入确认、红黄核对提示、i18n 与组件测试。
- DoD：三包 `verify:all` 全绿；旧文件/SQLite 数据可读；错误抬头批次无法提交。

### Q2 `REIMBURSE-ARCHIVE-IMPORT`

- `fflate` 解包底座、ZIP 队列、OFD/XBRL 通道、资源上限与单测。
- DoD：合法混合包稳定导入；zip bomb/递归包/损坏单文件均显式失败且不上传原件。

### Q3 `REIMBURSE-FINANCE-EXPORT`

- 管理视角筛选/选择/导出、命名纯函数、双金额口径与核对计数。
- DoD：导出字段与服务端事实一致；无按人聚合；文件名跨平台合法且稳定去重。

### Q4 `REIMBURSE-OCR-PROBE`

- 只做隔离原型与真实样本报告；未达到门槛不进入主 bundle/主流程。
- DoD：记录资源体积、设备档位耗时、字段准确率与是否进入生产的明确结论。

## 9. 架构扫描待确认项

- 租户配置的单一真相与持久化位置，避免只在 console 写死配置。
- ReimburseStore 三实现对新增可选字段的旧数据兼容方式。
- 批次状态更新是否已有适合承载提交前校验的共享逻辑层。
- CSV/XLSX 现有导出能力与依赖，优先复用而非新增库。
- Vite 动态 chunk、worker 和静态资源部署路径是否足以承载 OCR 模型。
- 文件导入共用抽象能否同时服务 PDF/XML/ZIP/OFD，而不让组件直接处理容器细节。
