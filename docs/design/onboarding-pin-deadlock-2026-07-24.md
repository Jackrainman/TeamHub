# 初始化 / PIN 死锁分析与修复方案（2026-07-24，待一起修复）

> 状态：**待修复批次**（用户 2026-07-24 实测部署后提出，"先写代办、待会一起修复"）。
> 本文 = 活体复现证据 + 修复刀划分 + 开放问题。代码未动。
> 对照已有文档：now.md K8-ROSTER-IMPORT（空板死锁已解）、beta-readiness-2026-07-16 §6（忘 PIN blocker 留档）、
> DEPLOY §7.1（手工清 pinHash 兜底）、PIN-RESET（v0.27.0）。

## 1. 用户实测现象

初始化（向导选「直接安装 + 登录制」）时未导入名册、未初始化管理员；之后名册被导入、成员被设过 PIN，
重启后无人知道 PIN → 无法登录 → 所有写设置全部 401/403 → **死锁**。

## 2. 活体复现记录（2026-07-24，v0.27.0，隔离实例端口 4187，临时数据目录，已清理）

happy path 验证通过：空名册导入豁免（200）→ 免 PIN 登录（200）→ `POST /api/setup/super-admin`（200）。

**路径 A：唯一 superAdmin 忘 PIN = 完全死锁**（重启清空内存会话后逐通道验证）：

| 尝试 | 结果 |
|---|---|
| 甲（superAdmin）不给 PIN / 错 PIN 登录 | 401 / 401 |
| 乙（无 pinHash 成员）免密登录 | 200（能登录，但救不了） |
| 乙 `DELETE /api/members/甲/pin`（PIN-RESET） | 403 须 superAdmin |
| 乙 `POST /api/setup/super-admin` | 409 已存在管理员 |
| 乙 `PUT /api/members/甲/pin` | 403 非本人且已有 pinHash |
| 乙 / 未登录名册重导（名册非空） | 403 / 401 |

**路径 B：从未设过 superAdmin 也能全员锁死。** `PUT /api/members/:id/pin` 的 firstSetup 分支
（server.ts:746）允许任何登录者给任何无 pinHash 成员设 PIN。给全员设上 PIN 后重启：
两人登录均 401 → 初始化管理员 401、名册导入 401、设 PIN 401——系统里从未有过 superAdmin，照样死锁。

**路径 C（UX 放大器）**：console 唯一产生 pinHash 的 UI 是「初始化管理员」卡；普通成员无设 PIN 入口。
PIN 几乎只在初始化那刻被设一次，之后无界面提醒其存在；会话是内存态，**每次重启都是一次重新过 PIN 门**。

**手工兜底有效性已验证**：停服 → 删 gov.json 所有 `pinHash` → 重启 → 免 PIN 登录恢复，
FileGovStore fail-closed 校验不误杀。但它是唯一逃生门，且只写在部署文档里。

## 3. 修复刀划分（代办，待一起修复）

### 刀① PIN-DEADLOCK-RECOVERY：loopback 操作员可重置 PIN

把 DEPLOY §7.1 的手工编文件降级为一条 curl：`DELETE /api/members/:id/pin` 在请求来自 loopback 时
豁免 superAdmin 判定（宿主操作员本就能直接改 gov.json，不引入新权限面）。

- 判定用裸 socket 地址（`request.socket.remoteAddress`），不吃 `TRUST_PROXY` 转发头（防经反代伪造）；
  trustProxy=true 时退而求其次看 `request.ip` 是否 loopback（SSH 隧道场景仍可用）。
- 测试装置注意：fastify inject 默认 remoteAddress=127.0.0.1，既有 403 用例须显式传非 loopback 地址，
  另补 loopback 放行用例。
- 文档同步：DEPLOY §7.1 改"产品通道 → loopback curl → 手工清文件"三级。

### 刀② SETUP-WIZARD-ROSTER：向导强制名册导入步 + 操作者即管理员

身份模式（正式安装）首重启后，ConsoleApp 进**全屏初始化门**（复用 SetupWizard 形态），完成才进 app：

1. 导入名册 CSV（空名册豁免已存在，直接可用）——**导入完了之后才进入**。
2. 操作者选「我是名册里的谁」+ 设 PIN（≥4 位）——前端静默 `POST /api/session`（免 PIN 登录）
   + `POST /api/setup/super-admin`，**默认进入的就是管理员**，已登录态落 app。
3. 门的出现条件：identity 模式且名册无 superAdmin；匿名 / demo 路径不出现。

### 刀③ ROSTER-CSV-3COL：CSV 5 列 → 3 列 + 导入后确认组长页（2026-07-24 用户已拍板）

**已拍板**：模板 姓名/年级/组/组长/验收人 五列 → **保留前三列（姓名/年级/组）**，去掉组长、验收人两列。

- **导入后确认谁是组长**：导入完成进一个确认页，逐组从该组成员里选组长（role→groupAdmin）；
  **一个组没录入人就暂时空着**（下游兜底已存在：K2 建的选人器空候选引导「先去设置任命」）。
- **组别筛选 = 复用项目已有业务逻辑**，不造新控件：摸底确认项目里已有组选择/过滤形态
  （`PmCreatePanel` 组 Combobox、选人器的组过滤、`verticals/robotics.ts GROUP_NAME_TO_DISCIPLINE` 映射、
  `schedule.ts deriveLeafGroups` 叶子组派生），确认页的组候选直接复用同一套——且候选必须排除
  **非叶子组（程序）与哨兵组（全组联调）**（见刀④，顺带收口「程序」混入选组的通道）。
- 验收人列去掉后**沿用现有默认**（大三及以上 autoReviewer 派生），无需新逻辑。
- 收益注记：去掉组长列后 `importRoster` 完全不写 role——重导幂等天然不洗已任命组长
  （原仅 superAdmin 有 role 保护），测试断言跟着改。

**剩余逻辑问题（2026-07-24 用户追问「还有什么逻辑问题吗」，已答复并记录）**：

1. **顺序即鉴权**：确认组长要写 `role=groupAdmin`，身份模式该写口须 superAdmin。若门内顺序是
   「导入 → 确认组长 → 选我升管理员」，确认组长那步会 403。故门内顺序必须是
   **导 CSV → 选我+PIN 升 superAdmin → 确认组长 → 进 app**（零新豁免面），否则要给
   「名册无 superAdmin」态再加一个 bootstrap 豁免（不推荐，豁免面能不加就不加）。
2. **单值 role 装不下「队长兼组长」**：`MemberRole` 单值，操作者升 superAdmin 后不能同时是某组
   groupAdmin → 挂单指派/跨组确认的候选（本组 groupAdmin）里队长消失。**待拍板**：isGroupLeadOf
   对 superAdmin 放宽（队长天然能指派），还是接受队长不兼组长。
3. **操作者不在名册里**：门要求「我是名册里的谁」，若 CSV 漏了操作者本人则无人可选——
   需要「名册里没有我」（就地补一行自己）或「重新上传」出口，否则只能冒名别人。
4. **组长留空的下游**：指派/跨组确认选人器空候选 + K2 已有「先去设置任命」引导，**不算新问题**。

### 刀④ PROGRAM-GROUP-ABSTRACT（decision-needed，摸底已完成 2026-07-24）

**摸底结论**（explore agent 全仓排查）：fixtures 层已调和干净（grp-program 不领任务、无直属成员），
「程序」用户可见的实质通道只有两类——

- **写入口**：`importRoster` 组名精确匹配现有组（demo 过的实例里 CSV 写「程序」**静默命中 grp-program**；
  真实空板则自动新建一个程序组）+ `createTask` 对 groupId 零校验。
- **读出口**：`GET /api/groups` 全量无过滤 + `PmCreatePanel` 组候选全量并集
  （且显示的是**组 id `grp-program` 而非中文名**，本身就是 UX bug）。

**用户意向**（2026-07-24）：程序 = 抽象类，视觉/电控继承它；少量场景才显示（或 DB 层按它筛选）。
映射到三个收口方案，**待拍板**：

1. **契约加属性**：`Group` 加 `assignable: boolean`（可否领任务/挂成员），grp-program / grp-convergence
   = false，读写两端统一判。最显式，代价 = schema 迁移 + 三 store 实现 + 旧数据缺省值。
2. **结构派生**（贴合「抽象类」比喻）：有子组的组 = 抽象（不可领任务、不可挂人），叶子组 = 具体；
   哨兵组已有标记。零 schema 改动，`deriveLeafGroups` 已有先例——grp-program 有 ec/vision 两子组
   自动不可选；真实小组扁平建组则全部可选，恰好符合直觉。
3. **读出口最小过滤**：`GET /api/groups` 加 `?assignableOnly` / PmCreatePanel 与导入确认页候选
   排除非叶子+哨兵。改动最小，但写入口（importRoster 静默命中）仍在。

**连带缺口**：设置页组管理 UI（D-072「设置页可增减组」）**从未实现**——grp-program 当前没有
删除/改名/标记通道，无论选哪个方案这都是前置；刀④落地时顺带补最小组管理。
陈旧文档：`docs/design/gov-oncall-schedule.md:38`「收敛任务可挂大组」已被 D-072 反转但未标 superseded，
刀④同刀标注。

### 刀⑤ 修完后运维动作

备份（scripts/backup-teamhub-data.sh）→ 重置整个已部署实例（/home/ubuntu/TeamHub，4177）→
用户自行冒烟验证新向导全流程。

## 4. 红线与约束（修复时守）

- I0：名册导入报告只回显给操作者本人，不落按人聚合。
- 密钥纪律：pinHash 不进任何响应/日志/文档；PIN 只收明文一次、scrypt 落库。
- 版本纪律：行为改动按 §7 bump（刀① fix=PATCH 起步；刀②③ 新功能=MINOR，合并批次一次 minor）。
- 数据安全：重置已部署实例前必须先跑备份脚本并读回校验。
