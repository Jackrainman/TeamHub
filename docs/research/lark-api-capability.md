---
title: 飞书开放平台 API 能力镜像
status: stable
date: 2026-05-19
sources:
  - docs/archive/lark-research/飞书开放平台企业内部应用API接入可行性与技术架构深度调研报告.md
  - docs/archive/lark-research/飞书开放平台企业级能力边界、系统限制与深度集成架构调研报告.md
related_decisions:
  - D-020
---

# 飞书开放平台 API 能力镜像

> 把两份 gemini 调研报告中与 ProbeFlash 接入相关的事实摘到工程仓库内。原报告保留在 `docs/`（未删），本文件去掉宣传语气、保留可工程引用的事实点。后续 LARK-OSS-SCAN / PATH-DECISION / CONNECTOR-ARCH 引用本文件而不是 gemini 原文。

## 0. 摘要（备赛期最小集成相关项）

- 备赛期 ProbeFlash 只需走「IM 消息读取 + 机器人回复」一条最小路径；多维表格、文档嵌入、AnyBridge 集成、AI 卡片流式更新均不在 MVP 范围内。
- 必须先解决的工程约束：**IP 白名单**（Serverless 不可行）、**Webhook 速率 100/min**（够用但要算）、**Encrypt Key + AES-256-GCM** 解密、**Challenge-Response 校验**。
- 2026-03 起企业内部应用 API 调用免费配额从 1 万/月升到 **100 万/月**；备赛期成本可视为 0。
- 群聊消息读取需企业管理员审批；测试企业沙箱免审。
- 接入闭环依赖：app_id / app_secret / encrypt_key / verification_token 4 个值，必须由用户本地 .env 注入，AI 不读不写不打印。

## 1. 鉴权与身份模型

### 1.1 凭证三件套
- **App ID**：应用全局唯一标识，可入仓库 / 入 README。
- **App Secret**：应用密钥，**不入仓库 / 不入日志 / 不入 commit message**；由 ProbeFlash server 进程通过环境变量读取。
- **Encrypt Key**：用于解密事件订阅 Payload（AES-256-GCM）；同 App Secret 同等敏感度。
- **Verification Token**：用于 Challenge-Response 校验 Webhook 来源；同上。

### 1.2 双轨 Access Token
| 类型 | 适用场景 | 边界 |
|------|----------|------|
| `tenant_access_token` | 应用级后台任务、群消息发送、定时拉取 | 由应用在后台被授予的权限集合决定 |
| `user_access_token` | 代表用户操作（OAuth 授权码模式变体） | 应用权限 ∩ 用户自身可见数据 |

备赛期最小闭环用 `tenant_access_token` 即可——机器人收 webhook + 回消息不需要代表用户操作。

### 1.3 测试企业沙箱
- 正式租户下应用可生成测试版本，关联独立测试企业租户；权限变更、接口配置、域名添加均即时生效，**绕过企业管理员审批**。
- 备赛期开发应全程在测试企业内跑通，正式发布到学校战队飞书时再走审批。

## 2. 消息与群聊能力（核心）

### 2.1 历史消息拉取
- `im.message` 接口族：支持时间戳范围、消息类型、Page Token 分页。
- 高频轮询会触发限流；推荐事件驱动而非 polling。

### 2.2 事件订阅（Webhook）
- 飞书在群内事件发生时主动 POST 到开发者配置的 Webhook URL。
- 服务端在指定时间窗口内必须返回 HTTP 200；超时触发指数退避重试。
- 安全握手：
  - **Challenge-Response**：飞书首次注册 URL 时发起 challenge，要求服务端原样回包 `challenge` 字段。
  - **AES-256-GCM 解密**：Payload 用 Encrypt Key 加密；服务端解密后才能拿到明文。
  - **签名校验**：用 Verification Token 做请求签名校验。

### 2.3 @机器人精准触发
- 配置后只有消息文本中包含机器人 `<at id="bot_id"></at>` 标签时才触发事件路由，避免群内全量文本被推到服务器。
- ProbeFlash 备赛期最小闭环正是「@机器人 + 调试症状描述 → 回复检查单」，与此机制天然契合。

### 2.4 自定义群机器人 Webhook（出站）
- 用于 ProbeFlash → 飞书群发消息。
- **硬性速率上限：100 次/分钟**（即 ~1.6 次/秒）。
- 超出后请求被网关直接丢弃，不可恢复。
- 备赛期 ProbeFlash 回复频率远低于此限制，但批量推送（如把 5-8 条检查清单逐条发）需要算清。

### 2.5 卡片流式更新（SSE）
- 通过卡片流式更新 OpenAPI 与飞书服务器建立长连接，可在单个卡片容器内增量更新文本。
- 用于"打字机效果"的 AI 流式输出场景。
- 不在 ProbeFlash 备赛期 MVP 范围。

## 3. 多维表格（Bitable，备赛期不用）

记录关键限制以备 BRIDGE 系列任务回看：

| 维度 | 限制 |
|------|------|
| 单表记录上限 | 标准商业 2,000 / 专业 20,000 / 旗舰 50,000 |
| 单次查询返回 | 500 行 |
| 单次批量更新 | 1,000 条 |
| 单次批量新增 | 500 条 |
| 单文本单元格 | 100,000 字符 |
| 关联记录 / 人员 / 附件 | 500 / 100 / 100 |
| 自动化流 Webhook 触发器 | **5 次/秒**（物理硬限） |
| 默认应用 QPS | 极低；正式上线前需向官方工单申请调高 |

常见错误码：`1254291 Write conflict`、`1254290 TooManyRequest`、`1254104 RecordAddOnceExceedLimit`、`1254003 WrongBaseToken`（游标失效）。

## 4. 网络与安全策略

### 4.1 IP 白名单（关键约束）
- 应用向外发起 HTTP 请求 或 外部回调飞书 OpenAPI，**都必须在飞书后台"安全设置"中配置固定 IPv4 地址**。
- 直接后果：**AWS Lambda / Vercel Edge / 阿里函数计算等动态 IP 池架构无法直接使用**。
- ProbeFlash 备赛期方案：本地或自有静态 IP 服务器 + 内网穿透到固定公网 IP；或部署到学校战队的固定 IP 服务器。

### 4.2 域名白名单（Iframe 嵌入用，备赛期不用）
- 飞书文档嵌入外部 Iframe 需双端配合：外部站 `X-Frame-Options` / CSP 允许飞书域；飞书后台白名单加该外部域。

## 5. 自动化流程与商业化配额

### 5.1 原生自动化流（不用）
- 免费版死锁：**200 次/月**；上千行月级团队几小时就会用尽。
- 商业版 50 万/月；ProbeFlash 不采购商业版，**架构上禁止依赖原生自动化流**。
- 替代路径：用 Event 订阅 + ProbeFlash 自有计算 + OpenAPI 写回。

### 5.2 API 调用配额（关键利好）
- 2026-03-05 起企业内部应用 API 调用总量 **100 万次/月**（原 1 万）。
- 每自然月 1 号 0:00 重置。
- 备赛期 ProbeFlash 调用规模远低于此（按"每天 10 次调试 × 10 次接口"计 ≈ 3000 次/月）。

### 5.3 付费版独有（备赛期不影响）
- 总存储 100 GB→15 TB；视频会议 25→500 方；多维表格容量梯度（见 §3）。

## 6. 权限申请与审批

### 6.1 谁能申请，谁能批
- **任意开发者可发起**权限申请（点击"开通权限"按钮）。
- 决定权强制收敛到**企业全局管理员或被授权安全审计员**。
- 审批时长完全由企业 IT 治理决定：分钟级到周级都可能。

### 6.2 高敏感权限
- 通讯录读取：需明确圈定范围（部门/用户），全员范围易被驳回。
- 群聊消息读取：商业秘密 / 数据合规深水区；通常只对官方核心系统或免审白名单内应用开放。
- 多维表格读写：可走用户级 OAuth 授权，但版本 Scope 扩大需用户全部重新授权。

### 6.3 应用免审白名单（可用）
- 企业管理员可为信任范围内应用配置免审白名单。
- 备赛期机器人若仅做"读 @ 内容 + 回复检查单"，不涉及通讯录 / 历史消息读取，**有可能不触发高敏感权限路径**，审批难度低。

## 7. SDK 生态

### 7.1 按语言分

| 语言 | 官方 SDK | 社区主流候选 |
|------|----------|----------------|
| Go | （字节内部用 `go-lark/lark`） | `shupkg/feishu`, `xudai3/feishu` |
| Python | `larksuite/oapi-sdk-python` | `chyroc/pylark`（声称 494 API + 76 事件，含 Mock） |
| Node.js / TS | 报告未点名（待 OSS-SCAN 补） | 待补 |

ProbeFlash 是 Node-TS 栈，Node 侧候选必须在 LARK-OSS-SCAN 任务中独立调研。

### 7.2 SDK 应封装的复杂点
- Token 刷新生命周期管理。
- 事件订阅 Challenge-Response。
- AES-256-GCM 解密 + 签名校验。
- HTTP 重试 / 指数退避。
- 限流（Token Bucket / 漏桶）。

## 8. 对 ProbeFlash 备赛期最小集成的应用范围

### 8.1 用得到的（MVP 范围）
- App ID + App Secret + Encrypt Key + Verification Token 四凭证体系
- 事件订阅 Webhook（接 `message.receive_v1` 或 `im.message.receive_v1` 类事件）
- @机器人精准触发
- Challenge-Response 校验
- AES-256-GCM 解密
- `tenant_access_token` 获取与刷新
- 用 `im.message.create` 发回复消息
- 测试企业沙箱

### 8.2 用不到的（备赛期不做，备赛后随 BRIDGE 系列重评）
- 多维表格（BRIDGE-01-ROSTER-SCHEMA 阶段再看是否落地）
- 飞书文档 Iframe 嵌入
- 卡片流式 SSE 更新
- AnyBridge 集成平台
- 视频会议 API
- 通讯录读取

### 8.3 必须由用户线下完成、AI 不参与的步骤
- 在飞书开发者后台创建企业内部应用
- 申请「接收群聊消息」「发送消息」事件订阅权限
- 把 ProbeFlash 服务器固定公网 IP 加入安全设置白名单
- 把 4 个凭证（app_id / app_secret / encrypt_key / verification_token）写入 ProbeFlash 服务器的 `.env`（路径与字段名见后续 `lark-onboard-guide.md`）
- 配置 Webhook URL 指向 ProbeFlash 服务

## 9. 与本仓库现有计划的耦合

- 本文件不替代 `roadmap.md §0`（架构愿景）和 `decisions.md D-020`（结论）；只作为它们的事实底座。
- 后续 ADR D-021（LARK-PATH-DECISION）的"自写最小 gateway vs 用开源 SDK"权衡，将基于本文件 §7（SDK 生态）+ LARK-OSS-SCAN 产出。
- 后续 `docs/design/lark-connector.md`（LARK-01）将基于本文件 §2（消息）+ §4（网络）+ §6（权限）输出接口设计。

---

来源原文（2026-06-09 归档至 `docs/archive/lark-research/`）：
- [飞书开放平台企业内部应用API接入可行性与技术架构深度调研报告.md](../archive/lark-research/飞书开放平台企业内部应用API接入可行性与技术架构深度调研报告.md)（gemini, 2026-05-16）
- [飞书开放平台企业级能力边界、系统限制与深度集成架构调研报告.md](../archive/lark-research/飞书开放平台企业级能力边界、系统限制与深度集成架构调研报告.md)（gemini, 2026-05-16）
