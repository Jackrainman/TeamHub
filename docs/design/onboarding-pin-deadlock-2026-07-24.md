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

### 刀③ ROSTER-CSV-3COL：CSV 5 列 → 3 列 + 组别可选择/可筛选

模板现为 姓名/年级/组/组长/验收人 五列。减为三列并把组别做成可选（可筛选）控件。
**开放问题（修复前需用户拍板）**：

1. 保留哪三列？（候选：姓名/年级/组，去掉组长+验收人，任命回到设置页）
2. 「可选择组别（做为可筛选）」形态：导入预览里组别列改为可筛选下拉（现有组 + 自动建组兜底），
   还是导入时统一选一个组？
3. 去掉组长列后，superAdmin 之外的首批 groupAdmin 任命动线（设置页逐个点？）。

### 刀④ PROGRAM-GROUP-ABSTRACT（decision-needed，讨论项）

「程序组」残留摸底（探索 agent 报告附 backlog 行）：用户在导入选组时看到「程序」。
D-072 口径 = 程序组不是领任务单元、仅汇报视角保留；用户意向 = 程序可作抽象类（视觉/电控继承），
少量场景才显示（或 DB 层按它筛选）。待摸底报告出来后定收口方案。

### 刀⑤ 修完后运维动作

备份（scripts/backup-teamhub-data.sh）→ 重置整个已部署实例（/home/ubuntu/TeamHub，4177）→
用户自行冒烟验证新向导全流程。

## 4. 红线与约束（修复时守）

- I0：名册导入报告只回显给操作者本人，不落按人聚合。
- 密钥纪律：pinHash 不进任何响应/日志/文档；PIN 只收明文一次、scrypt 落库。
- 版本纪律：行为改动按 §7 bump（刀① fix=PATCH 起步；刀②③ 新功能=MINOR，合并批次一次 minor）。
- 数据安全：重置已部署实例前必须先跑备份脚本并读回校验。
