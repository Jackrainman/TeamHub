# 初始化向导 v3（公测打磨轮 + 全初始化扩展）设计真相

> 2026-07-25 立项。承接 `onboarding-pin-deadlock-2026-07-24.md`（死锁修复刀①~④）之后的**打磨轮**：
> 用户按 v0.33.0 冒烟反馈一批半成品 UX/逻辑问题 + 「很多东西应该在初始化的时候就问完」（车队/库存/知识库）。
> 决策均经两轮结构化提问拍板（本文 §2/§3 标注）。实现序列与逐刀 DoD = 计划文件（session plans），
> 本文 = 长期设计真相；完成后条目压 stub 进 `docs/archive/completed-log.md`。

## 1. 问题清单（用户冒烟原话 → 归并）

| # | 原话 | 归并后的刀 |
|---|------|-----------|
| 1 | 组里没有默认的电控/电路/机械/视觉四个；新建组名逻辑保留 | 刀⑤ 空板默认组树 |
| 2 | 验收人不用打勾；csv 模板大三自动有验收权限 | 刀⑧① 验收人纯年级派生只读 |
| 3 | csv 没办法选择年级和组，手打易错 | 刀⑦ 导入预览表可编辑 |
| 4 | 不写「重置PIN」写「显示PIN」，点一下显示、像遮罩 | 刀⑧② PIN 明文副本 + 显示端点 |
| 5 | 成员页宽度显示不了名字，一行一个人名 | 刀⑧③ 单行布局 |
| 6 | 创建第一个人应问大一-大四/研一-研三 | 刀⑥ 年级七档 + bootstrap 年级下拉 |
| 7 | 2026 赛季=2026 比赛=2025.9–2026.7，7 月后滚 2027 | 刀⑨ suggestSeason + 刀⑬ 向导赛季步 |
| 8 | 初始化问车：几台/几台能用/几台在修 | 刀⑩ 车队批量表格步 |
| 9 | 库存做成一张表初始化+导入 | 刀⑪ 库存批量导入 + 向导步 |
| 10 | 知识库初始化导入一堆文件（AI 分析=猜想） | 刀⑫ 批量 md 导入；AI 记 backlog |

「还有什么地方初始化没说到」的摸底回答：基准线两锚点（并入刀⑬ 赛季步）；检查单模板**无导入通道**（记 backlog CHECKLIST-TPL-IMPORT）；git 仓库/飞书/bot-channels 全是 mock 只读端点、**无配置入口**（记 backlog INTEG-CONFIG，无可初始化内容）；部署形态（identityMode/dataMode）已有 SetupWizard 首步；验收人年级自动派生无需问。

## 2. 拍板决策

1. **PIN 可恢复存储（用户原话：「就是点一下，显示PIN，就像一个遮罩一样」）**：要显示就必须可恢复——Member 增 `pinPlaintext` 明文副本，与 pinHash 双写双清（认证仍走 scrypt hash，不降级）。读视图（MemberPublicSchema）剥双字段；唯一透出口 = `GET /api/members/:id/pin`（身份模式 only，本人或持旗管理员，否则 403；匿名 404 照 PIN 簇先例）。管理员忘自己 PIN → loopback `DELETE /api/members/:id/pin`（刀①已有）。**这是对 §2.6 密钥纪律的显式例外**：团队级低 stakes PIN、用户拍板；provider key 纪律不受影响（AGENTS §2.6 补一行）。
2. **CSV 防错 = 预览表可编辑**：CSV 纯文本做不了下拉。上传 → server 只解析不落库（preview 端点，复用 decodeRosterBytes GBK 探测 + parseRosterCsv 行号）→ 前端表格行内年级下拉 7 档 / 组 datalist 预填叶子组 → 确认后 JSON 提交导入。名册（刀⑦）与库存（刀⑪）同构。
3. **验收人纯年级派生**：大三及以上（含研）自动获得，成员页只读徽标「验收人·大三以上自动」，去手勾；`PUT gate-reviewer` 端点保留（契约不动、UI 不消费）。
4. **赛季日期派生**：`suggestSeason(now)`——8–12 月 → `{year+1}赛季`（当年 9.1–次年 7.31）；1–7 月 → `{year}赛季`（去年 9.1–当年 7.31）。读路径不落库：app 内空态一键创建（刀⑨）+ 向导赛季步顺手问两锚点自动生成基准线模板（刀⑬）。
5. **年级七档**：MemberGrade 扩 `grad1|grad2|grad3`（保留 `graduate` 作 legacy 兼容旧数据）；验收派生含全部 ≥大三档。
6. **车队/库存/知识库初始化全部进向导、每步可跳过**（用户：库存「可以跳过」；roster/leads 已有跳过先例）。

## 3. 向导 v3 步骤序列（BootstrapGate 扩 Step 联合，无框架、照现状条件渲染）

`who → roster → leads → season → fleet → inventory → kb → done`

- 出现条件不变：identity 模式且名册无持「项目管理」旗标成员。
- 每步可跳过（按钮双态：已做=「下一步」/未做=「跳过」）；done 页汇总未配置项提示（如「未建赛季→总览可一键创建」）。
- 操作者鉴权：who 步完成即持旗+登录态，后续各步写口鉴权自然通过（v2 结构消除顺序即鉴权，沿用）。

## 4. 各刀契约形状（要点）

- **刀⑤ 默认组树**：正常模式装配时 groups 为空 → 预建 fixtures 同构树（grp-program 母→grp-ec/grp-vision；顶层 grp-mech/grp-circuit），id 稳定一致；store `ensureDefaultGroups()` 临界区判空幂等；设置页可删改（刀④组管理）。
- **刀⑦ 名册 preview**：`POST /api/roster/preview`（multipart，与 import 同鉴权同空板豁免）→ {rows,failed}；`POST /api/roster/import` 扩 JSON `{rows}`（multipart 不变）。
- **刀⑩ 车队批量**：`POST /api/resources/batch` `{resources:[{name,kind?,robotTarget,season?,version?,status?}]}`——zod 全量先验任一坏整批 400 不落；逐台 createResource（displayCode 服务端派生不变）+ status 补迁移（在修/退役）；鉴权照 resources 写口现状。
- **刀⑪ 库存导入**：contracts `inventory-import.ts` 仿 roster-import（模板列=件号/名称/类别/单位/总数/低储阈值；复用编码探测；坏行带物理行号）；`GET /api/inventory/template` + `POST /api/inventory/preview` + `POST /api/inventory/import`（双收）；store `importPartTypes`（partNumber 幂等 upsert、失败行不落、绝不删）；鉴权=身份须持旗/匿名写门。
- **刀⑫ KB 批量 md**：`POST /api/kb/import-docs`（multipart 多文件，.md only，单文件 1MB/总 10MB；身份须持旗）→ 每文件一条 ArchiveDocument{title=文件名去后缀, markdownContent, generatedBy:'manual'}；kb store `addArchiveDocuments`；响应 {imported,skipped,failed}。
- **刀⑬ 赛季步**：赛季名预填 suggestSeason 可改 + 学期开始（预填推导 startsAt）+ 比赛日（选填）→ createSeason；两锚点齐 → contracts `generateRoboconBaselineTemplate` + PATCH /api/baseline 落模板。

## 5. 反监视与边界复核

- 本批全部写口无人键聚合；预览表/批量导入的回显 = 名单/物料事实回给操作者本人（I0 无统计）。
- PIN 显示端点 = 本人/持旗管理员单条读取，无列表批量出口（防一屏全队 PIN）。
- 批量端点全部复用既有写门（Bearer 或会话）+ 每 IP 限流；wizard 各步发生在持旗会话后，无新豁免面（刀⑦ preview 沿用 roster 既有豁免）。

## 6. 明确不做（本批）

- KB 的 AI 分析/结构化猜想 → backlog `KB-AI-STRUCT` 研究项。
- 检查单模板导入通道 → backlog `CHECKLIST-TPL-IMPORT`。
- git/飞书/bot-channels 配置入口 → backlog `INTEG-CONFIG`（现状 mock 只读）。
- docs/screenshots 14M 瘦身 → 用户明示单独决策项。
