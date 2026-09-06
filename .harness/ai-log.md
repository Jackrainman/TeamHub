# AI Log

<!-- 只写不读。每完成一个任务在末尾 append 一行。格式：- YYYY-MM-DD 摘要 (SHA) -->

- 2026-07-26 refactor(harness): 精简操作体系——.harness/ 三文件 + AGENTS.md 重写 + 删 legacy-harness (bab7a09)
- 2026-07-26 feat(storage): 统一 SQLite 后端——五域共库 v0.44.0 (1c1f9c3)
- 2026-07-26 docs(design): Hermes 鉴权方案调研——飞书 app 授权流结论 (65d0d4b)
- 2026-07-26 docs(planning): Hermes inbound API 落地状态同步 + 三项新 backlog (30b43d2)
- 2026-07-26 docs(design): 飞书集成配置方案拍板——合并三项 design (6c42277)
- 2026-07-26 feat(integrations): 飞书集成配置落地——设置页表单+credential端点+自动token v0.45.0 (ec9d4e4)
- 2026-07-26 feat(csv): 三域导入模板加 # 提示行 v0.45.1 (36244ef)
- 2026-07-27 feat(relay): 加一棒支持就地新建任务 v0.45.2 (f1a06b6)
- 2026-07-25 feat(hermes): POST /api/hermes/inbound 最小链路 v0.44.0 (b09e3d7)
- 2026-07-25 fix(settings): 撤销项目管理旗标前加确认弹窗 v0.43.3 (f83d55e)
- 2026-07-25 feat(wizard): 赛季步改为年份下拉栏 v0.43.2 (4052dcb)
- 2026-07-25 fix(wizard): 修复向导第①步创建管理员后跳主界面 bug v0.43.1 (378fc11)
- 2026-07-25 feat(wizard): 向导体验四项修复 v0.43.0 (4fa433e)
- 2026-07-25 docs(planning): 进度快照+下阶段计划+Hermes 定位讨论结论 (5340b8a)
- 2026-07-25 feat(wizard): 向导赛季+比赛日步 v0.42.0 (42a0978)
- 2026-07-27 feat(lark): 飞书出站推送——认领即时通知+里程碑提醒端点 v0.45.4 (fa2e13a)
- 2026-07-28 fix(wizard): 向导三修复——上一步回退/roster导入后leads名册刷新/赛季下拉value匹配 v0.45.5
- 2026-07-28 fix(wizard): 赛季步已有赛季时仍可创建新赛季 v0.45.6 (790ce7a)
- 2026-07-28 feat(console): useForm hook 实现+库存快录首迁移 v0.45.7 (bc46f7d)
- 2026-07-28 refactor(console): 全量迁移6表单到useForm v0.45.8 (4c43797)
- 2026-07-29 fix(server): 全局setErrorHandler+Hermes调拨补偿+CSV读取抽helper v0.45.9 (a6bb5e0)
- 2026-07-29 refactor(console): toActor归位+PoolPage错误渲染+GRADE_KEY解耦 v0.45.10-11
- 2026-07-29 chore(server): 删645行死代码(import-debug-archive) v0.45.13 (d8621c2)
- 2026-07-29 refactor(console): queryKeys工厂+PoolPage迁移 v0.45.14 (9d8d0e3)
- 2026-07-29 refactor(server): parseBody批量迁移~28处 v0.45.15 (dbe5f79)
- 2026-07-29 refactor(server): server.ts拆分——baseline/kb/ledger/schedule/archive/system/pm全部迁出routes/ 3672→903行 v0.45.16-32
- 2026-07-29 feat(contracts): Task transitions[]状态流转历史+Drawer时间线UI v0.45.18-19
- 2026-07-29 feat: 全局搜索+动态流+CSV导出+时间线编辑器 v0.45.20-22
- 2026-07-29 refactor(console): DESIGN-LANG B5图标三档归一+B4空态收口EmptyState v0.45.33-35
- 2026-07-31 refactor(server): 架构审计修复——archive/system 去重 firstZodMsg+parseBody v0.45.66 (f1ac91a)
- 2026-07-31 refactor(server): 抽 base-baseline-logic+base-checklist-logic 消三实现逐字重复 v0.45.67 (bb22223)
- 2026-07-31 fix(contracts): kbScenarioFixture 补 archiveDocument 修复 closeout 测试 fixture v0.45.68 (4e62a69)
- 2026-07-31 refactor(console): SPLIT-2 拆 6 个超 400 行组件到 sub/ v0.45.69 (9e9df8f)
- 2026-07-31 refactor(contracts): pm-requests 跨域写契约拆 artifact/schedule/resource 三域文件 v0.45.70 (797fb64)
- 2026-07-31 refactor(console): HOOKS-2 settings 16 处裸 hook 封装 useSettingsQueries/Mutations v0.45.71 (c24dd21)
- 2026-07-31 fix(console): 抽 schedule-invalidation 共享族失效，修复 RelayCanvas 写 session 只失效 relay 单 key 致父级 SchedulePage staleTime 内晾旧 v0.45.72 (57ce8e0)
- 2026-07-31 feat(console): 全局 MutationCache.onError toast 兜底根治 mutation 静默吞 + 16 处内联渲染 mutation 标 meta.silent 去重 v0.45.73 (69b20c1)
- 2026-07-31 refactor(console): queryKeys 工厂补四域 + 修正 artifacts/relay 形状，8 处查询点采用 v0.45.74 (1fe77b5)
- 2026-07-31 refactor(console): IntegrationsSection 复用 App 透传 overview（抽 OverviewView），删 useHubOverview 重复查询消除双缓存键 v0.45.75 (3c244cf)
- 2026-08-03 feat(server): TASK-TIMELINE 补全——updateTaskStatus/claimTask 加 by/claimer 尾参，claim/complete/reject/人工流转四口追加 transitions，路由 sessionActor 注入 + task-timeline.test 8 条 + seed 种 demo 时间线 v0.46.0
- 2026-08-03 feat(lark): 配置体验四件套——hint 引导步骤 zh/en、GET/POST /api/integrations/lark/chats（群下拉+建群自动入群）、PUT 保存真发测试消息验证 chat_id；lark-client 收敛 base URL + lark-outbound.test +5 v0.46.0
- 2026-08-03 perf(console): 名册预览表分批渲染（50 行窗口）+行 memo+函数式更新 + server importRoster Map 线性化，根治 CSV 大表卡死 v0.46.1
- 2026-08-03 fix(console): 01-tokens.css 补 color-scheme light/dark——深色主题原生日期选择器随主题反转 v0.46.1
- 2026-08-03 refactor(console): 教学动线简版——车队步移出初始化向导（8→7 步，FleetStep 族全删），初始化车移去机器人队页空态引导 v0.46.1
- 2026-08-04 feat: REIMBURSE-PROC 报账模块一期——contracts reimbursement 域（条目/批次 schema+状态/批次 derive+发票 XML/PDF 解析纯函数）+PartAction 来源字段；server ReimburseStore 三实现+路由（actor 过滤/发票号查重/stock-in 入库联动）；console 报账页+pdf.js 本地解析导入+入库确认对话框+库存来源展示；红线=发票文件永不上传、人键只回本人+超管；思路参照 tidoc(MIT) 无代码引入 v0.47.0 (f91962a)
- 2026-08-04 fix(server): static-console MIME 表补 .mjs——pdf.worker.min-*.mjs 被伺服为 octet-stream，浏览器 module script MIME 强检拒载、fake worker 兜底走同 URL 同拒，pdf.js getDocument 必 reject → 所有发票 PDF 报「读取或解析失败」；routes.test 补 .mjs content-type 断言；node 复现链路（pdf.js 抽取+parseInvoicePdfText）证明解析纯函数本身无恙 v0.47.1
- 2026-08-04 feat(contracts+console): 发票 PDF 解析重点优化（老师只要 PDF）——①pdf.js getDocument 补 cMapUrl/standardFontDataUrl（vite pdfjs-assets 插件：dev 中间件直发 node_modules、build 拷 dist/pdfjs/，免引 static-copy 依赖），根治 12306 铁路票中文 CID 字体丢字（标签全灭只剩 20 位票号）②parser：同行双名称取销售方（左购右销）/品名列折行续名（客运服+务费）/负金额折行星号行判折扣且互为前缀并入 ③铁路电子客票票种分支（无 *分类* 明细段 → 按票价合成「铁路客运（G1985 常州站-上海虹桥站）」）；真实票夹具测试 +2，全语料实测 9/9 发票（滴滴 5+铁路 4）全字段解析、行程报销单正确落 unrecognized v0.48.0
- 2026-08-15 docs(reimburse): 票据质量门与批量归档设计——购买方抬头校验/核对原因、ZIP+OFD 共用 fflate、财务导出+命名建议、OCR 先 probe；坚持原件不上传、批次不按人聚合，错误抬头用 gross/eligible 双口径且阻止提交 (8f0c923)
- 2026-08-15 docs(architecture): D-090 软件架构统一总纲——暂停功能增长，拍板单根 workspace/lock/version、生产唯一统一 SQLite、SQLite app_settings、四层模块模板、application service 跨域事务、架构自动门；不考虑旧数据兼容，以 reimburse 为首个纵切试点，旧模块化/飞书三包文档降为历史证据 (375639e)
- 2026-08-15 docs(governance): D-091 文档体系收口——21 份活文档按总纲/领域单源，archive 蒸馏为 5 份带稳定 ID+Git SHA 的历史诊断库；删除 23k 行旧稿与 102 张截图，根 AGENTS 增异常回查协议并建立自动增长门 (f9c7616, b9b9e28)
- 2026-08-15 refactor(architecture): ARCH-UNIFY A0——删除无主链引用的 ProbeFlash 飞书三包，统一三个 Hub workspace、单根 lock、0.48.0 单版本及 Docker/启动/版本脚本依赖图；新增精确迁移基线的软件架构门 (27b4bdf, 0f3a873)
- 2026-08-15 refactor(server): ARCH-UNIFY A1 前半——生产 builder 六域 repository 改为必传，测试 fake 统一归入 test/support；正常启动唯一 TEAMHUB_DB_FILE→统一 SQLite，六域状态同源并在 Fastify 关闭时释放数据库；真进程 E2E 改为 SQLite 跨重启读回 v0.49.0
- 2026-08-15 refactor(storage): ARCH-UNIFY A1 收口——删除六套 File Store、PersistedFile、gov-only SQLite 入口与三份旧迁移器；InMemory fake 全移 test/support，统一 SQLite 六域关闭重开契约生效；Compose/启动/备份收成单 DB 卷 + artifact，smoke 验证写入重启读回
- 2026-08-15 refactor(settings): ARCH-UNIFY A2 配置单源——严格 AppSettings 契约与 SQLite 单例取代 config.json/tenant env/代码默认；首启区分 empty/unclaimed，初始化 seed+settings 同事务；demo→real 同库清业务事实并保留平台 meta，console 只信服务端模块配置
- 2026-08-15 refactor(transaction): ARCH-UNIFY A2 收口——新增同步 ApplicationUnitOfWork/Actor/Clock/error 平台端口；报账条目读取与库存多写进入同一 SQLite 事务，第二条写故障时整批 durable rollback，route 退化为单 service 调用（ARC-INC-002）
- 2026-08-15 refactor(reimburse): ARCH-UNIFY A3 首个三包同构模板——contracts 拆 model/requests/policies/import/export，server 拆 routes/service/repository/sqlite-repository，console 收 api/hooks/components；购买方质量门、四金额口径、命名建议、结构化入库行与 profile 持久化闭环
- 2026-08-15 refactor(checklist): ARCH-UNIFY A4 第一域——checklist 三包同构迁移，contracts 与 baseline 解除互 import；baseline 仅依赖 GateChecklistPort，clear/waive 保持写前 season 归属门（ARC-DEC-003）
- 2026-08-31 refactor(contracts): ARCH-UNIFY A4 库存域契约——inventory.ts/inventory-import.ts 收进 domains/inventory 四件套（model/policies/requests/import + 显式 index），根 god 文件删除 v0.59.1
- 2026-08-31 refactor(inventory): A4 库存域三包——server modules/inventory（service 收口 holder 校验 + Hermes inv-query/inv-record 编排，routes/ledger.ts 删）+ console features/inv/api.ts + hooks 收口裸 mutation（白名单 -3），InvStore→InventoryRepository、store/sqlite-inv-store.ts/api/schemas/inv.ts 删，InvStore 接口出 gov-store v0.60.0
- 2026-08-31 refactor(server): P0-4 窄 port 化——checklist GateReviewerPort / reimburse ReimburseAdminPort 取代完整 GovStore.getSnapshot().members 依赖（arch-a4-survey 最高优先项）v0.60.1
- 2026-08-31 refactor(archive): A4 归档物域全摘——contracts domains/artifacts；modules/archive（service 收口上传/下载编排、ArtifactFileStorage port 取代 route 内 fs）；artifacts 移出 GovernanceSnapshot/GovStore，sqlite-gov-repository 失 artifact 段；console features/archive api/hooks（ArchivePage 裸 query 清零）v0.61.0
- 2026-08-31 refactor(knowledge): A4 知识库域——domains/knowledge（model/requests/similar/closeout）+ modules/knowledge（KnowledgeService 收口 similar/closeout/importDocs，KnowledgeNodeCloseoutPort 窄口接 pm closeoutKbNode）+ console features/kb api/hooks；KbStore/routes/kb.ts/src/kb/route-schemas.ts/schemas/kb.ts/segments/domain.ts 全删 v0.62.0
- 2026-08-31 research: 子 agent 双报告落 docs/research——arch-a4-survey.md（A4 现状/白名单/违规清单/迁移顺序）+ reimburse-test-report.md（75 用例全绿+真语料 9/9+红线验证+缺陷清单 7 条）
- 2026-08-31 refactor(contracts): ARCH-UNIFY A4 排班域契约——schedule/schedule-infra/schedule-requests/resource-requests/fleet-import 五根文件收进 domains/schedule 四件套 v0.62.1
- 2026-08-31 refactor(schedule): A4 排班域服务端——modules/schedule 四件（repository/logic/service/routes），ScheduleStore 摘出 GovStore（GovStore 仅剩 pm-core），SqliteScheduleRepository 摘表自 sqlite-gov-repository，export/gov-report/inventory 走 ScheduleReadPort 窄口 v0.63.0
- 2026-08-31 refactor(schedule): A4 排班域 console——features/schedule api/hooks，segments/schedule、hooks/useSchedule、schemas/schedule、schemas/resources 删；SchedulePage/RelayCanvas/useRelayMutations 8 处裸 hook 尽收，架构白名单 20→15 v0.64.0

## 2026-08-31 晚（deep）

### ARCH-UNIFY 收尾：pm/system 迁移 + GovStore 归零（v0.64.1 → v0.67.0）

**用户指令**：「把 A4 和尾巴搞掉，拍板的不做」——继续推进 A4 全域迁移（前一阶段已迁 inventory/archive/knowledge/schedule），本轮完成最后最大的 pm/system。

**完成清单**：

1. **contracts domains/pm 建立（v0.64.1）**
   - pm-core.ts → model.ts（investment.ts 并入）、pm-requests.ts → requests.ts、attribution.ts → policies.ts（GovernanceSnapshot 一并归位）、growth.ts、gov-report.ts → report.ts、roster-import.ts → import.ts
   - 显式 index.ts（无 export *）；baseline model.ts 的 Investment* 类型重复导出修复（barrel 冲突显式化）
   - contracts 438 tests 全绿

2. **contracts domains/system + integrations（v0.64.2）**
   - identity/app-settings/system-status/assembly/schemas(HubEvent) → domains/system 五件
   - hermes/lark-integration → domains/integrations
   - contracts 根目录只剩 shared kernel（common/csv-core/fixtures/verticals + index.ts）

3. **server pm store 层迁移（v0.65.0）**
   - pm-core-store.ts → modules/pm/repository.ts（PmCoreStore → PmRepository）；gov-store-logic.ts → logic.ts；sqlite-gov-repository.ts → sqlite-repository.ts（SqlitePmRepository）
   - **GovStore 接口与 store/gov-store.ts 删除**：60+ 消费点（routes/authz/logic/repositories/tests/scripts）全换 PmRepository
   - store 目录只剩 csv-utf8 + index 转发
   - 测试 fake 类改名 InMemoryPmRepository（文件名保留 inmemory-gov-store*.ts 减 churn）
   - server 414 tests 全绿

4. **server pm 路由层迁移（v0.66.0）**
   - 新建 PmService（PmOutcome 携带 HTTP status/detail 语义）收口组/赛季/任务/认领/指派/搭档/验收编排；routes/pm/tasks/tasks-claim/members/roster 归 modules/pm/；authz（isGroupLeadOf/isGateReviewer/requireSuperAdmin）与飞书通知副作用留 route 层

5. **server system/integrations/reporting（v0.67.0）**
   - session/setup/system → modules/system；lark 族 → modules/integrations（lark-integration-store → lark-store.ts）；search/export/gov-report → modules/reporting
   - routes/helpers.ts → src/http/helpers.ts；**src/routes 目录删除**；各模块补 index.ts（barrel 语义从「路径转发」变「模块出口」）
   - server.ts 组合根改用 modules/*/index.ts 装配
   - **server src/routes 与 store god 全清零**

### ARCH-UNIFY console 收尾：api 拆分 + HOOKS-1-TAIL 白名单清零（v0.68.0 → v0.69.0）

6. **console api 拆分（v0.68.0）**
   - segments/members.ts + system-pm.ts 拆成 features/{pm,identity,system,settings,search}/api.ts 五段（OverviewSnapshot 为 console 专有聚合，本地定义于 features/system/api.ts）
   - 删 schemas/pm.ts + schemas/system.ts + hooks/useTasks.ts + useRoster.ts + settings/sub/useSettings{Queries,Mutations}.ts 转发层
   - **api/segments 与 api/schemas 目录清空**；client.ts 重新组合
   - 白名单 15 → 9

7. **HOOKS-1-TAIL 白名单清零（v0.69.0）**
   - 新建 features/pm/hooks.ts（8 hook + 类型）、identity/hooks.ts（5 hook + MembersClient）、system/hooks.ts、settings/hooks.ts（含 lark 配置读写）、resources/hooks.ts（3 mutation）
   - App/IdentityBar/DepGraph/Direction/MyView/BaselineStates/PmCreatePanel/CreateResourceForm/ResourceRow 共 9 文件 16 处裸 useQuery/useMutation 收口
   - **架构门禁白名单 0 项**（架构检查首次全绿，verify-architecture.mjs 基线空数组）
   - console 260 tests 全绿

### SPLIT-1-TAIL：三个大组件拆小（v0.69.1）

8. **GateChecklistCard(383→273) / TodayPlanTable(388→187) / DirectionStarmap(389→190)**
   - GateChecklistCard：状态徽章/tone 映射抽 checklist-item-meta.ts（单一源），清偿选人/豁免理由两行动面板拆 sub/ChecklistItemPanels.tsx
   - TodayPlanTable：行编辑/预设铺底/继续昨天/确认三步编排全部进 today-plan-controller.ts（纯本地状态控制器）
   - DirectionStarmap：相机/指针会话/对焦缓动/自转全部进 sub/useStarmapCamera.ts

### 验证与决策

- 全程 verify：contracts 438 + server 414 + console 260 测试每步全绿；`npm run verify` 门禁每 commit 通过
- **架构门禁白名单 25 → 0**：所有精确迁移基线条目随清零即删，脚本回到纯规则判定
- 决策：A5 旧骨架收尾（store/segments/schemas 空壳）已随各刀顺带清零，不单独做一轮
- 决策：console pm/settings/search/identity 五域各自 api+hooks 就位后，hooks/useRoster.ts、hooks/useTasks.ts 等转发层全删
- 遗留跟进（todo ARCH-FOLLOWUPS P3）：test/support 文件名 inmemory-gov-store* 未改（类已改名）；OverviewSnapshot 聚合归位待 system 模块端点条件成熟

**红线核查**：无 memberId 引入 schedule 域；无按人聚合/排行/筛选写入；ActorRef 来源链不变；I0/I2/I5 语义不变。

### 状态

- ARCH-UNIFY 五条线（A1-A5）+ HOOKS-1-TAIL + SPLIT-1-TAIL **全部完成**，todo 三项进 done-tonight
- 版本 v0.59.0 → v0.69.1（本会话 12 commits）
- 待用户拍板项仍挂起：REIMBURSE-DEFECTS-20260831 修复取舍、HERMES-CHAT-MVP 三事项、TEACHING-FLOW、HERMES-LARK-SKILL、REIMBURSE-LARK-BITABLE、REIMBURSE-PM-EXPORT 待做

## 2026-08-31 晚（deep 续）：REIMBURSE-DEFECTS-20260831 缺陷修复（v0.69.1 → v0.70.0）

**用户指令**：报账 7 缺陷全修（子 agent 测试报告 docs/research/reimburse-test-report.md §4）。

**修复明细**：
- #1 铁路 PDF 区间丢失：`import.ts` 区间正则允许两站间夹车次段（`[A-Za-z0-9]{1,6}`），真实版式「上海站 G8274 常州站」可抽出 `G8274 上海站-常州站`；新增 contracts 用例复刻真实抽取行
- #2 批次不可变快照：`service.assertBatchMutable`——非 collecting 批次的条目归属/材料/备注一律 409 REIMBURSE_BATCH_LOCKED，装进已锁批次同拒；提交后批次名也锁
- #3 GBK zip 文件名：console `archive-extract.ts` 新增 `decodeZipEntryName`——fflate 对未置 UTF-8 flag 条目按 latin1 解码（charCode=字节可收回），UTF-8(fatal)→GB18030 顺序试解；真实语料 `打车报销.zip` 验证 10 个文件名全部还原；零新依赖（TextDecoder gb18030 浏览器/Node 24 均原生支持）
- #4 批次状态机：`BATCH_TRANSITIONS` collecting→submitted→reimbursed 顺向单向，跳级/回退 409 REIMBURSE_BATCH_TRANSITION
- #5 Create 可空键宽容：`CreateReimburseEntryRequestSchema.partial({invoiceNo/.../note})`，service 层 `createEntry` 规整 undefined→null（repository 层保持严格全键 draft）
- #6 发票号查重索引：SqliteReimburseRepository 进程内 `invoiceIndex`（create/update 维护 + resyncSequences 从行数据回填），不再 listEntries 全表扫描；新增重启语义重建测试
- #7 匿名模式批次/配置 fail-closed：**报告自述为文档行为（I2 设计），不修**，特此记录

**测试**：contracts 442（+4）/ server 418（+4：批次锁×2 + 索引×2）/ console 264（+4：decodeZipEntryName）全绿；npm run verify 门禁通过。

**决策**：#2 锁粒度=整个条目（非仅 batchId）——提交后材料/备注也不许改，审计快照完整；改名仅限 collecting 阶段。
- 2026-09-03 fix(reimburse): 报账页 .panel 补 padding/gap 修记一笔垫付贴边 v0.70.2；todo 台账更新（垫付留档反转/hermes+基准线暂缓/自动填单调研）
- 2026-09-04 feat(console): 领任务更名+解释性文案首批清理+三页内测徽标 v0.71.0；todo 入 7 条 P0（公网暴露登录加固在列）
- 2026-09-04 fix(console): UI 文案清理二批（~30 处中英，审计驱动）v0.71.1；报账端到端测试通过（本地实例+生产库副本）；发现 pinPlaintext 明文存储安全债转 AUTH-LOGIN-GATE
- 2026-09-04 feat(auth): 公网认证加固全套（读闸/首登密码闸/密码min8/撤明文副本/登录锁定/Secure cookie env）v0.72.0；D-092 落 decisions
- 2026-09-04 fix(console): 登录/首登设PIN界面随主题变色（auth-gate 原用未定义 token --panel/--bg/--line fallback 硬编码 #fff，改走 --surface/--border/--surface-raised 等主题 token，四套 [data-theme] 随动）v0.72.1；verify:all+architecture+docs 全绿
- 2026-09-05 feat(auth): 登录自输用户名（displayName 唯一登录键+重名409）+ /api/members 移出预登录白名单（setup/state 加 hasPmMember 承接 BootstrapGate）+ 旧短 PIN 登录强制升级（会话标记+PUT pin 清标记）v0.73.0；D-093 落 decisions、TOTP 暂缓落 deferred ARC-DEF-004；三包 verify:all+architecture+docs 全绿（443/428/262）
- 2026-09-05 fix(auth): 首登死锁修复（BUG-IDX-DEADLOCK）——isPinSetupAllowed 放行 GET /api/setup/state（App 启动闸唯一依赖，拦截即 SetupStateUnavailable 死锁）；auth-gate 回归测试（mustSetPin 会话 setup/state 200+业务仍403）v0.73.1；HTTPS 反代部署要点并入 deploy.md §9、一次性排查稿删除、事故归档 ARC-INC-008；server verify:all（429）+architecture+docs+pre-commit 全绿
- 2026-09-04 NAV-REGROUP③ 落地：报账升 work 层+「公测中」徽标（beta 变体 'beta'|'public-beta'），v0.74.0；顺手删已完成 PRE-COMMIT-FORCE-VERIFY、收窄 VERIFY-SCRIPT-UPGRADE（矩阵死角 BUG 已于 v0.73.1 修复）
- 2026-09-04 VERIFY-SCRIPT-UPGRADE 收口：授权矩阵扫描（printRoutes 枚举 ×100 路由 × 4 身份，未归类新路由自动纳入）+ 首登设密码 e2e（e2e/suite/first-login-pin.cjs 自备 server 生命周期），pre-commit 新增 3.5 串行 e2e 闸；纯测试零 src 变化不 bump
- 2026-09-04 报销页 UX：报账→报销全仓改名、批次+校验标准收 SideDrawer、首访引导（出厂默认抬头时提示管理员），v0.75.0
- 2026-09-04 UI 视觉审计（子 agent 中道夭折）：已修跨主题 token bug（--accent/--card-bg 移 :root，v0.75.1），剩余线索收 UI-VISUAL-AUDIT todo P3
- 2026-09-05 REIMBURSE-EVIDENCE 设计矛盾收口（D-094）：查明「文件本体永不上传」红线把「解析留浏览器」（架构）与「原件不进服务器」（隐私）焊成一句，12 处断言互相打架且 9-03 反转从未登记 decisions.md，是用户「思路混乱」的根源；archive 回查零命中=该红线无历史否决挡路。按读者链（本人→战队财务→学校老师，且腾讯填表旧流程本就上传 PDF+截图）作废隐私侧、保留解析侧，替换为条目级访问不变式；对齐 AGENTS.md/decisions.md/reimburse.md/product.md/software-architecture.md/release.md/todo.json 六源，新增 REIMBURSE-EVIDENCE-STORE 待办。诚实边界：零代码改动（当前仍无上传端点），纯文档不 bump；verify:docs 24 活文档绿 + git diff --check 净

## 2026-09-06（续）：REIMBURSE-PM-EXPORT 收口——项管视角全员发票导出真正下载文件（v0.75.1 → v0.76.0）

**用户指令**：接中断任务——contracts 导出链路接线 + 前端落地 Blob 下载；红线=条目人键只回本人+超管、不碰凭证附件（REIMBURSE-EVIDENCE-STORE）。

**改动**：
- contracts：`csv-core.ts` 新增 `escapeCsvCell`/`buildCsv`（BOM+CRLF+RFC4180 转义，reporting 旧 toCsv 语义一致）；`domains/reimburse/export.ts` 新增 `REIMBURSE_EXPORT_COLUMNS`（16 列）/`ReimburseExportRow`/`deriveReimburseExportRow`（派生与卡片/批次同源）/`buildReimburseCsv`/`ReimburseExportOptions`（resolveMemberName/resolveBatchName，缺省回退 memberId/batchId）；根 `index.ts` 报销段补接线（此前 TS2305 未导出）；`test/reimburse-export.test.ts` 8 测全绿
- console：新增 `reimburse-export.ts` 纯函数层（表头逐列 t()、枚举本地化、日期化文件名建议，可单测不碰 DOM）+ `components/ReimburseExportSection.tsx`（管理抽屉内=超管视角：列表数据 → deriveReimburseExportRow 逐条 → localize → buildReimburseCsv → Blob+createObjectURL 触发下载）；`ReimbursePage.tsx` client 类型扩到 `Pick<HubApiClient,'getMembers'>`（名册名解析）；i18n reimburse.ts 加导出区/表头 16 列/枚举文案（中英）；`test/reimburse-export.test.ts` 5 测全绿
- 鉴权：导出按钮只在报销管理抽屉（`isSuperAdmin`）出现；导出数据=当前全量 entries（server 对超管回全量，普通成员只回本人）——沿用既有口径，未新增任何读取口；不碰凭证附件通道

**验证**：contracts verify:all 451 绿 / console verify:all（typecheck+test+build+e2e first-login-pin）绿 / verify:architecture 绿 / pre-commit 绿 / git diff --check 净。

**版本**：feature → MINOR，0.75.1 → 0.76.0（bump-version.sh）。commit：`feat(reimburse): PM-view all-invoice CSV export downloads a real file v0.76.0`（英文 message 按任务指示）。

## 2026-09-06：NAV-REGROUP 落地——导航按性质分两类 + 徽标配色区分（v0.76.0 → v0.77.0）

**用户指令**：导航不按使用频率分层，改按**性质**分两类；工作台保持单独顶部；徽标内测=灰色、公测=保持橙色。

**改动**（全在 hub-console）：
- `console-pages.tsx`：`ConsoleSection` 改 `'home' | 'board' | 'tool'`；战队看板类=overview/myview/project/schedule/direction/timeline，小工具类=reimburse/knowledge/archive/inv/fleet/settings，workbench 保持 home
- `ConsoleLayout.tsx`：分组标题 i18n key `nav.section.work/manage` → `nav.section.board/tool`；徽标按 beta 类型挂 `beta-badge--public` 修饰类
- `App.tsx`：页头徽标同逻辑挂修饰类
- `i18n/locales/workbench.ts`：zh=「战队看板/小工具」，en=「Team Boards/Tools」
- `styles/02-base.css`：`.beta-badge` 默认灰（--muted/--border-strong），`.beta-badge--public` 橙（--amber）；导航项内灰徽标随 `--sidebar-text-muted` 走（classic/warm 深侧栏可读）；public 规则声明序在 nav 灰规则之后保证导航项公测徽标仍橙

**验证**：console verify:all 绿（31 files / 267 tests + build + e2e first-login-pin）/ verify:architecture 绿 / pre-commit 绿（含 e2e 闸）。

**版本**：feature → MINOR，0.76.0 → 0.77.0。commit：`feat(nav): split navigation into board/tool groups by nature, gray internal-beta badge v0.77.0`。

## 2026-09-06：BUG-REDIRECT-APP 排查——验收驳回后跳 /app 未复现（代码路径正常）

**用户指令**：排班验收驳回后前端跳 /app 疑似带错 payload；用户已忘复现步骤，子 agent 自行读代码路径 + 必要时起实例复现排查。

**排查过程（静态为主）**：
- 全仓 grep：`navigate(` / `useNavigate` / `<Navigate>` / `history` / `location.assign` / `window.open` / `react-router` 在 `apps/hub-console/src` 零命中（仅 `window.location.reload()` 四处：setup/settings 属整页重载非导航）。console 是无路由 SPA——App.tsx 用 `useState<ConsolePage>` 内存页态，唯一切换机制 `onNavigate(page)` 只传页 key，且 `CONSOLE_PAGES` 联合类型无 `'app'` 键，`onNavigate('app')` 在 TS 层即不可编译。
- `features/schedule/`：grep review/approve/reject/验收 零命中。排班在场/今日计划表/接力画布均无验收概念；TodayPlanTable「确认」成功只 `setManualView('lanes')`（本页内视图切换，非跳转）。
- 全 app 唯一验收流 = pm 域任务验收：`features/pm/sub/TaskActionsPanel.tsx`（accept/reject 两钮）→ `useTaskActions.ts` 的 `reviewMutation` → `POST /api/tasks/:id/review`（server `modules/pm/tasks-claim.ts:138`）。`reviewMutation.onSuccess` 只调 `resetState()`（清本地表单态），**无任何跳转、无路由 state/query、不携带 payload**，TaskDetailDrawer 保持打开。server 端为纯 JSON 响应无 redirect。
- git 全史复核：`-S` 搜 `onNavigate('workbench')` / `setPage('workbench')` / `navigate('/app')` / `'app'` 页键 / `react-router` 全零命中——console 自诞生起就是无路由 SPA，验收后跳转代码从未存在过。`~/TeamHub` 生产部署由本仓 rsync，不存在历史遗留旧前端版本差异。

**结论**：代码路径正确，未复现。用户报告的三要素（排班×验收×跳 /app 带 payload）在现有代码中无法同时成立：排班域无验收、验收域无跳转、console 无 /app 路由与 payload 概念。推测为记忆偏差或把别的产品/旧版行为记到 TeamHub 上。按任务指示不硬改，todo 条目 note 记结论、owner 交回 user，待用户再遇到时抓现场（浏览器 URL/Network/控制台）。

**验证**：verify:docs 绿 + git diff --check 净（docs/harness 类改动）。

**版本**：无代码改动，不 bump。
