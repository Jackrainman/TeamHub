# 设计约束（Active Decisions）

> 仍约束当前代码/产品方向的决策。争议时 grep 本文件；历史决策全文见 `docs/archive/decisions-archive.md` + git log。

## D-025 — 技术栈

- Node/TypeScript 统一栈；React+Vite 控制台；Docker Compose 部署硬要求。
- 生产默认 SQLite（D-083 后统一）；artifact 字节进 volume/MinIO，不入 git/DB。
- Git 中枢推荐 Forgejo；TeamHub 只索引联动，不自研 forge。
- adapter 一律 mock-first，真实凭证后置审批。

## D-037 — 核心不变式（I0）

- **人键输出只回本人、当作帮助；第三方只见结构键（task/group/resource），永不见人。**
- 产品定位：CASE 工具 + 团队交流中心 + 战队数据库（给学长减负/给学弟指引/项目同步）。
- silence 只回本人+AI 指引；砍一切管理者面/问责上移。
- AI 指引不计算"被提醒几次"、不沉淀按人历史。

## D-039 — AI 退出治理 + 三支柱

- AI 只留仓管/转译安全车道（整理/检索/拉资料/读图/算量/起草），**不参与治理判断**。
- 治理判断主体 = 人（大三/学长）；系统只如实显示状态。
- 产品 = 三支柱：① 战队知识库 ② 项管看板 ③ 库存-BOM。
- 治理派生整簇（D-032~D-035）挂起；复活触发 = 用户另立拍板"要 AI 参与治理判断"。
- 设计北极星：比死表省事 / 用着就更新（派生优先）/ AI 只当仓管 / 人在环 / 小作坊轻量。

## D-041 — 任务为核心

- 中心实体 = Task，系统围任务转不围人转。
- 项目计划表全员可见（任务+依赖+状态+缺口+分工），不含按人天数/快慢。
- 甘特暂缓（无工期数据、违 G4）；代以依赖图+"搁很久的任务"清单。
- 卡住必带原因；禁止"光秃秃天数+人名"。
- "和人关系"三堆：① 和人无关（安全）② 找谁对接（安全）③ 人治（封存）。

## D-064 — commit+push 默认

- 做完可验证改动即默认 commit+push（trunk-based），不每次问。
- push 前 git fetch 查分叉、有则 rebase。
- 安全边界（SSH/部署/密钥）不在授权内。

## D-072 — 组织结构

- 分配任务只四个组：电控/视觉/机械/电路（设置页可增减）。
- 「程序组」不领任务（= 电控+视觉，仅汇报/过载合并视角）。
- 总联调 = 所有组各到至少一人（不挂单一组，convergenceScope='allLeafGroups'）。
- 车 = 带编号独立对象（单层），displayCode 派生 = 赛季+位置(+版本)。

## D-074 — 版本号纪律

- 产品单一版本 = 根 `VERSION`（SemVer）；`scripts/bump-version.sh` 是唯一改版入口。
- 改 `apps/hub-*/src` 行为的 commit 必须 bump；docs/planning 不 bump。
- 手改 package.json 禁止（防漂移）；pre-commit hook 自动检查。

## D-083 — 产品重定义（防爆肝双主轴）

- 给没有 PM 的小团队一个代打 PM 的工具——把赛前爆肝摊平到整个赛季。
- 双主轴：防爆肝（倒排基准线+验证门+投资任务防砍）+ 防"大号 AI MCP"（学习方向+AI 边界）。
- 第一垂直包 = Robocon 战队包。
- 宪法修正：G4 里程碑有日期（Task 永不加个人 dueDate）；I0 分析对准事不对准人、不做排行榜；AI 排人三红线（事实拼盘不排序/拍板留名归人/只在决策现场）。
- 名字三层（D-085）：事实层带名（认领/验收/拍板）/ 聚合层永不做 / 结构层对事。UI = 名字只在事实卡片、永不进首页/聚合/统计。

## 已归档决策索引

- D-005~D-022（v0.3/飞书选型）→ `docs/archive/decisions-archive.md`
- D-026~D-036（治理立魂/数据河/图纸轨）→ 同上（骨架仍生效：四层架构+路线A+宪法三层）
- D-032~D-035（治理派生整簇）→ `docs/archive/governance-suspended-decisions.md`
- D-043/D-053（双轨/自迭代）→ 同上（被 D-066 取代）
- D-044~D-082（实现账单）→ `docs/archive/decisions-archive.md`
